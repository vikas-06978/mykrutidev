/**
 * The site under its real security headers (dist/_headers, which
 * e2e/serve.mjs sends the way Cloudflare Pages does):
 *
 * - every built page loads with no Content-Security-Policy violation;
 * - the features that load or run something (typing and copying in a
 *   converter, a Word file, Hinglish typing, the feedback form with
 *   Turnstile, themes, the typing tutor) work without one either;
 * - another site cannot show the pages inside its own (frame-ancestors).
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the policy is the same on every device');
});

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
/** Every page the build wrote, as the URL it is served at. */
const PAGES = walk(DIST)
  .filter((p) => p.endsWith(`${sep}index.html`))
  .map((p) => `/${relative(DIST, p).split(sep).slice(0, -1).join('/')}${p === join(DIST, 'index.html') ? '' : '/'}`);

/** Record every CSP violation the page reports, from before its first script. */
async function watch(page) {
  const found = [];
  await page.exposeFunction('__cspViolation', (v) => found.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__cspViolation(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile}:${e.lineNumber})`),
    );
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) found.push(m.text());
  });
  return found;
}

test.describe('the Content-Security-Policy', () => {
  test.describe.configure({ timeout: 180_000 });

  test('pages are served with the security headers', async ({ page }) => {
    const res = await page.goto('/');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['strict-transport-security']).toContain('max-age=31536000');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test(`all ${PAGES.length} built pages load without a violation`, async ({ page }) => {
    // Every language adds its pages to this one test, so its time allowance
    // grows with them: 1 s a page, and never less than the 180 s above.
    test.setTimeout(Math.max(180_000, PAGES.length * 1_000));
    expect(PAGES.length).toBeGreaterThan(50);
    const found = await watch(page);
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: 'load' });
      expect(found, path).toEqual([]);
    }
  });

  test('converting, a Word file, Hinglish, feedback, themes and the tutor raise none', async ({ page }) => {
    const found = await watch(page);
    // Outside services, answered here: the policy is checked before a request
    // leaves the page, so a refused one never gets this far.
    await page.route('https://inputtools.google.com/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(['SUCCESS', [['namaste', ['नमस्ते']]]]) }),
    );
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile={render(){return "t"},reset(){},remove(){}};' }),
    );
    await page.route('**/api/feedback', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, turnstileSiteKey: '1x00000000000000000000AA' }) }),
    );

    // A converter: type, copy.
    await page.goto('/');
    await page.locator('[data-converter] [data-role="input"]').fill('fgUnh');
    await expect(page.locator('[data-converter] [data-role="output"]')).not.toBeEmpty();

    // A Word file through the Upload tab.
    await page.goto('/?mode=file');
    await page
      .locator('[data-doc-converter] input[type="file"]')
      .setInputFiles(fileURLToPath(new URL('../src/lib/__fixtures__/kruti-test.docx', import.meta.url)));
    await expect(page.locator('[data-doc-converter] [data-role="download"]')).toBeVisible({ timeout: 15_000 });

    // Hinglish typing asks Google's input service.
    await page.goto('/english-to-hindi-typing/');
    const box = page.locator('textarea').first();
    await box.click();
    await box.pressSequentially('namaste ', { delay: 30 });
    await page.waitForTimeout(800);

    // The feedback form loads Turnstile from Cloudflare.
    await page.goto('/kruti-dev-to-mangal/');
    await page.locator('.fb-btn').click();
    await expect(page.locator('.fb-panel')).toBeVisible();
    await page.locator('.fb-face').first().click();
    await page.waitForTimeout(500);

    // Theme switching (inline head script, view transition).
    await page.goto('/hindi-keyboard/');
    await page.locator('[data-theme-trigger]').click();
    await page.locator('[data-theme-panel] [data-picker-group="theme"] [role="radio"][data-value="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // The typing tutor.
    await page.goto('/hindi-typing-test/');
    await page.keyboard.type('fdf');
    await page.waitForTimeout(300);

    expect(found).toEqual([]);
  });

  test('another site cannot show the pages inside its own', async ({ page, baseURL }) => {
    const blocked = [];
    page.on('console', (m) => /frame-ancestors|Refused to (display|frame)/i.test(m.text()) && blocked.push(m.text()));
    await page.goto('about:blank');
    await page.setContent(`<iframe src="${baseURL}/" style="width:800px;height:600px"></iframe>`);
    await page.waitForTimeout(1500);
    const frame = page.frames().find((f) => f !== page.mainFrame());
    const h1 = await frame?.locator('h1').count().catch(() => 0);
    expect(h1 ?? 0).toBe(0);
  });
});

test.describe('Google Analytics under the policy', () => {
  const GA = /^https:\/\/[^/]+\.(google-analytics\.com|analytics\.google\.com|googletagmanager\.com)\//;

  test('off everywhere but the live site: nothing is sent from here', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => GA.test(r.url()) && sent.push(r.url()));
    await page.goto('/');
    await page.goto('/hi/kruti-dev-to-unicode/');
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
  });

  test('on the live site, the tag loads and reports without a violation', async ({ page, baseURL }) => {
    const found = await watch(page);
    // The built site, with its real headers, answering for the live address,
    // so the tag sees the live hostname.
    await page.route(/^https:\/\/mykrutidev\.com\//, async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href }) });
    });
    // Google, stood in for: gtag.js is replaced by a script that sends the
    // kinds of request the real one does (fetch, beacon, pixel, to each
    // address Google uses), and each request is answered here.
    const hits = [];
    await page.route(GA, (route) => {
      const url = route.request().url();
      hits.push(new URL(url).host);
      if (!url.includes('/gtag/js')) return route.fulfill({ status: 204 });
      return route.fulfill({
        contentType: 'text/javascript',
        body: `
          fetch('https://region1.google-analytics.com/g/collect?v=2', { method: 'POST', keepalive: true });
          fetch('https://region1.analytics.google.com/g/collect?v=2', { method: 'POST' });
          navigator.sendBeacon('https://www.google-analytics.com/g/collect?v=2');
          new Image().src = 'https://www.googletagmanager.com/td?id=stub';
        `,
      });
    });

    await page.goto('https://mykrutidev.com/');
    await expect
      .poll(() => [...new Set(hits)].sort())
      .toEqual(['region1.analytics.google.com', 'region1.google-analytics.com', 'www.google-analytics.com', 'www.googletagmanager.com']);
    expect(await page.evaluate(() => window.dataLayer.map((args) => args[0]))).toEqual(['js', 'config']);
    expect(found).toEqual([]);
  });
});

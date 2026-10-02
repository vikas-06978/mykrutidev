/**
 * The feedback widget, in a real browser on the built site.
 *
 * - It never opens by itself; it opens on a click; Esc and ✕ close it.
 * - The whole flow works with the keyboard alone, in English and in Hindi.
 * - It sends the picks and the non-personal context - never the tool's text.
 * - With no API (this static server, or `astro dev`), it logs and still thanks.
 * - It never sits on the Copy / Download buttons or the keys, at 390x844 and
 *   1366x768, and it steps aside while someone types on the keyboard.
 * - It shifts nothing (CLS 0) and its script waits for idle.
 *
 * The API itself (validation, honeypot, rate limit, D1) is tested in
 * server/feedback.test.js and, through `wrangler pages dev`, in
 * tests/feedback-pages.test.js.
 */
import { test, expect } from '@playwright/test';

// Run once (in the desktop project); viewports are set per test.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewports are set per test');
});

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1366, height: 768 };

const button = (page) => page.locator('[data-feedback-open]');
const panel = (page) => page.locator('#fb-panel');

/** Answer POST /api/feedback like the real API, and keep what was sent. */
async function fakeApi(page, reply = { status: 201, body: { ok: true, id: 1 } }) {
  const sent = [];
  await page.route('**/api/feedback', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') sent.push(JSON.parse(req.postData()));
    await route.fulfill({
      status: req.method() === 'POST' ? reply.status : 200,
      contentType: 'application/json',
      body: JSON.stringify(req.method() === 'POST' ? reply.body : { ok: true, turnstileSiteKey: null }),
    });
  });
  return sent;
}

test.describe('opening and closing', () => {
  test('never opens by itself; the script and the API wait until wanted', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push({ url: r.url(), at: Date.now() }));
    let loaded = 0;
    page.on('load', () => (loaded = Date.now()));
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expect(button(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(4000);
    await expect(panel(page)).toHaveCount(0);
    // The panel's script came after the load event (on idle), and nothing
    // talked to the API or to Turnstile.
    const chunk = requests.filter((r) => /\/_astro\/feedback\.[\w-]+\.js$/.test(r.url));
    expect(chunk.length).toBe(1);
    expect(chunk[0].at).toBeGreaterThanOrEqual(loaded);
    expect(requests.filter((r) => /api\/feedback|challenges\.cloudflare\.com/.test(r.url))).toEqual([]);
  });

  test('a click opens it; ✕ closes it; Esc closes it; focus goes back to the button', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await button(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(panel(page).locator('[data-rating="1"]')).toBeFocused();

    await panel(page).locator('.fb-x').click();
    await expect(panel(page)).toBeHidden();
    await expect(button(page)).toBeFocused();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');

    await button(page).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(button(page)).toBeFocused();
  });

  test('opening it shifts nothing on the page (CLS 0)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => {
        // As CLS counts: a shift right after a tap or key press is the
        // visitor's own doing (the panel growing from one step to the next).
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    // (On a phone the Hindi Keyboard's keys fill its corner, so it is hidden
    // there - tested below. The converter page shows it once scrolled a
    // little: at the very top, Try example sits in its corner.)
    for (const [viewport, path] of [
      [PHONE, '/'],
      [DESKTOP, '/hindi-keyboard'],
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      if (viewport === PHONE) await page.evaluate(() => window.scrollTo(0, 120));
      await page.waitForTimeout(1500);
      await button(page).click();
      await expect(panel(page)).toBeVisible();
      await panel(page).locator('[data-rating="4"]').click();
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => window.__cls)).toBe(0);
    }
  });
});

test.describe('the flow', () => {
  test('keyboard alone, start to thank-you; sends picks and context, never the tool text', async ({ page }) => {
    const sent = await fakeApi(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    // Something private in the tool, which must never be sent.
    await page.locator('#tool textarea[data-role="input"]').fill('SECRET-TOOL-TEXT fgUnh');

    await button(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('.fb-count')).toHaveText('Step 1 of 4');

    // Step 1: Tab to 🙂 and press it - that moves on by itself.
    await expect(panel(page).locator('[data-rating="1"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(panel(page).locator('[data-rating="3"]')).toBeFocused();
    await page.keyboard.press('Enter');

    // Step 2: this page's tool is pre-ticked; Space ticks another.
    await expect(panel(page).locator('.fb-count')).toHaveText('Step 2 of 4');
    const kruti = panel(page).locator('input[name="used"][value="kruti-dev"]');
    await expect(kruti).toBeChecked();
    await expect(kruti).toBeFocused();
    await page.keyboard.press('Tab'); // Unicode to Kruti
    await page.keyboard.press('Space');
    await expect(panel(page).locator('input[name="used"][value="unicode-to-kruti"]')).toBeChecked();
    for (let i = 0; i < 9; i++) await page.keyboard.press('Tab'); // 7 more chips, Back, Next
    await expect(panel(page).locator('.fb-step[data-step="2"] [data-fb-next]')).toBeFocused();
    await page.keyboard.press('Enter');

    // Step 3: "Something is wrong" opens the extra box.
    await expect(panel(page).locator('.fb-count')).toHaveText('Step 3 of 4');
    await expect(panel(page).locator('#fb-bug')).toBeHidden();
    for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
    await expect(panel(page).locator('input[name="wants"][value="bug"]')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(panel(page).locator('#fb-bug')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(panel(page).locator('#fb-bug')).toBeFocused();
    await page.keyboard.type('Copy button did nothing');
    await page.keyboard.press('Tab'); // Back
    await page.keyboard.press('Tab'); // Next
    await page.keyboard.press('Enter');

    // Step 4: message + email, then Send.
    await expect(panel(page).locator('.fb-count')).toHaveText('Step 4 of 4');
    await expect(panel(page).locator('#fb-msg')).toBeFocused();
    await page.keyboard.type('Please add Chanakya');
    await expect(panel(page).locator('[data-fb-left]')).toHaveText('481 characters left');
    await page.keyboard.press('Tab');
    await expect(panel(page).locator('#fb-email')).toBeFocused();
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter'); // submits the form

    await expect(panel(page).locator('[data-fb-thanks]')).toBeVisible();
    await expect(panel(page).locator('[data-fb-thanks]')).toContainText('Thank you! 🙏 Your feedback helps us improve.');
    await expect(panel(page).locator('[data-fb-thanks]')).toBeFocused();

    expect(sent).toHaveLength(1);
    const [body] = sent;
    expect(body).toEqual({
      rating: 3,
      used: ['kruti-dev', 'unicode-to-kruti'],
      wants: ['bug'],
      bugText: 'Copy button did nothing',
      message: 'Please add Chanakya',
      email: 'reader@example.com',
      page: '/',
      lang: 'en',
      theme: expect.stringMatching(/^(light|dark)$/),
      device: 'desktop',
      width: 1366,
      browser: 'Chrome',
      website: '',
    });
    expect(JSON.stringify(body)).not.toContain('SECRET');

    // Remembered for 30 days; the button stays.
    expect(await page.evaluate(() => Number(localStorage.getItem('mkd-feedback-sent')))).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(button(page)).toBeVisible();
    await page.reload();
    await button(page).click();
    await expect(panel(page).locator('[data-fb-sent-before]')).toBeVisible();
    await expect(panel(page).locator('.fb-count')).toHaveText('Step 1 of 4');
  });

  test('in Hindi, on a Hindi page', async ({ page }) => {
    const sent = await fakeApi(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/hi/hindi-keyboard');
    await expect(button(page)).toHaveText('सुझाव');
    await button(page).click();
    await expect(panel(page).locator('#fb-title')).toHaveText('हमें बेहतर बनाने में मदद करें');
    await expect(panel(page).locator('.fb-step[data-step="1"] legend')).toHaveText('आपका अनुभव कैसा रहा?');
    await expect(panel(page)).toContainText('कोई निजी जानकारी नहीं चाहिए। ईमेल देना ज़रूरी नहीं है।');
    await expect(panel(page).locator('.fb-privacy a')).toHaveAttribute('href', /^\/hi\/privacy-policy\/?$/);
    await panel(page).locator('[data-rating="4"]').click();
    await expect(panel(page).locator('.fb-step[data-step="2"] legend')).toHaveText('आज आपने क्या इस्तेमाल किया?');
    await expect(panel(page).locator('input[value="hindi-keyboard"]')).toBeChecked();
    await panel(page).locator('.fb-step[data-step="2"] [data-fb-next]').click();
    await expect(panel(page).locator('.fb-step[data-step="3"] legend')).toHaveText('आगे हम क्या जोड़ें या बेहतर करें?');
    await panel(page).locator('.fb-step[data-step="3"] [data-fb-next]').click();
    await panel(page).locator('[data-fb-send]').click();
    await expect(panel(page).locator('[data-fb-thanks]')).toContainText('धन्यवाद! 🙏');
    expect(sent[0]).toMatchObject({ rating: 4, used: ['hindi-keyboard'], wants: [], page: '/hi/hindi-keyboard', lang: 'hi' });
  });

  test('with no API (local dev), it logs to the console and still says thank you', async ({ page }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(DESKTOP);
    await page.goto('/unicode-to-kruti-dev');
    await button(page).click();
    await panel(page).locator('[data-rating="2"]').click();
    await panel(page).locator('.fb-step[data-step="2"] [data-fb-next]').click();
    await panel(page).locator('.fb-step[data-step="3"] [data-fb-next]').click();
    await panel(page).locator('[data-fb-send]').click();
    await expect(panel(page).locator('[data-fb-thanks]')).toBeVisible();
    expect(logs.some((l) => l.includes('[feedback] No feedback API here'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a rate-limited send says so and keeps what was written', async ({ page }) => {
    await fakeApi(page, { status: 429, body: { ok: false, error: 'rate-limited' } });
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await button(page).click();
    await panel(page).locator('[data-rating="4"]').click();
    await panel(page).locator('.fb-step[data-step="2"] [data-fb-next]').click();
    await panel(page).locator('.fb-step[data-step="3"] [data-fb-next]').click();
    await panel(page).locator('#fb-msg').fill('kept');
    await panel(page).locator('[data-fb-send]').click();
    await expect(panel(page).locator('[data-fb-error]')).toContainText('try again in an hour');
    await expect(panel(page).locator('#fb-msg')).toHaveValue('kept');
    await expect(panel(page).locator('[data-fb-thanks]')).toBeHidden();
  });

  test('a mistyped email is caught before sending', async ({ page }) => {
    const sent = await fakeApi(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await button(page).click();
    await panel(page).locator('[data-rating="4"]').click();
    await panel(page).locator('.fb-step[data-step="2"] [data-fb-next]').click();
    await panel(page).locator('.fb-step[data-step="3"] [data-fb-next]').click();
    await panel(page).locator('#fb-email').fill('not an email');
    await panel(page).locator('[data-fb-send]').click();
    await expect(panel(page).locator('[data-fb-error]')).toBeVisible();
    await expect(panel(page).locator('#fb-email')).toBeFocused();
    expect(sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Never in the way
// ---------------------------------------------------------------------------

/** The controls it must never cover. */
const TOOL_BUTTONS =
  '[data-role^="copy"], [data-role="docx"], [data-role="docx-unicode"], [data-role^="download"], [data-role="whatsapp"], [data-pdf-link], [data-print], [data-keyboard] .hk-key, [data-keyboard] .hk-pad';

async function overlaps(page) {
  return page.evaluate((sel) => {
    const btn = document.querySelector('[data-feedback-open]');
    const s = getComputedStyle(btn);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) return [];
    const b = btn.getBoundingClientRect();
    return [...document.querySelectorAll(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
        return r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
      })
      .map((el) => `${el.tagName}[data-role=${el.dataset.role ?? ''}] ${el.className}`);
  }, TOOL_BUTTONS);
}

const PAGES_WITH_BUTTONS = ['/', '/unicode-to-kruti-dev', '/english-to-hindi-typing', '/hindi-keyboard', '/kruti-dev-keyboard', '/hi'];

test.describe('never covers Copy, Download or the keys', () => {
  for (const [name, viewport] of Object.entries({ '390x844': PHONE, '1366x768': DESKTOP })) {
    for (const path of PAGES_WITH_BUTTONS) {
      test(`${name} ${path}, scrolled top to bottom`, async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem(`mkd-tour:${location.pathname}`, '1'));
        await page.setViewportSize(viewport);
        await page.goto(path);
        // Fill the tool so its output buttons are live.
        const input = page.locator('#tool textarea[data-role="input"]');
        if (await input.count()) await input.fill('fgUnh');
        await page.waitForTimeout(300);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        let shown = 0;
        for (let y = 0; y <= height; y += Math.round(viewport.height / 3)) {
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
          await page.waitForTimeout(250);
          expect(await overlaps(page), `at scrollY=${y}`).toEqual([]);
          if ((await button(page).getAttribute('data-hidden')) !== 'true') shown++;
        }
        // And it is not simply always hidden.
        expect(shown).toBeGreaterThan(0);
      });
    }
  }

  test('steps aside while typing on the Hindi Keyboard, back after a pause or a scroll up', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-keyboard', '1'));
    await page.setViewportSize(DESKTOP);
    await page.goto('/hindi-keyboard');
    await expect(button(page)).toHaveAttribute('data-hidden', 'false');
    await page.locator('[data-keyboard] [data-layer-panel="base"] button[data-ins="क"]').first().click();
    await expect(button(page)).toHaveAttribute('data-hidden', 'true');
    await page.locator('#tool textarea[data-role="text"]').press('a');
    await expect(button(page)).toHaveAttribute('data-hidden', 'true');
    await expect(button(page)).toHaveAttribute('data-hidden', 'false', { timeout: 4000 });

    // Scroll up brings it back at once.
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
    await page.locator('#tool textarea[data-role="text"]').press('b');
    await expect(button(page)).toHaveAttribute('data-hidden', 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(button(page)).toHaveAttribute('data-hidden', 'false', { timeout: 1000 });
  });

  test('on a phone the docked Hindi keyboard keeps it hidden', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-keyboard', '1'));
    await page.setViewportSize(PHONE);
    await page.goto('/hindi-keyboard');
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(80);
    }
    await expect(page.locator('[data-keyboard]')).toHaveAttribute('data-docked', 'true');
    await expect(button(page)).toHaveAttribute('data-hidden', 'true');
  });

  test('steps aside while the Typing Tutor is in use', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
    await page.setViewportSize(DESKTOP);
    await page.goto('/hindi-typing-test');
    await page.waitForTimeout(500);
    await page.locator('.tt-stage').click();
    await page.keyboard.type('f');
    await expect(button(page)).toHaveAttribute('data-hidden', 'true');
    await expect(button(page)).toHaveAttribute('data-hidden', 'false', { timeout: 4000 });
  });

  test('on a phone it is a 44px icon', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    // At the very top Try example is in its corner, so it waits for a scroll.
    await page.evaluate(() => window.scrollTo(0, 120));
    await expect(button(page)).toHaveAttribute('data-hidden', 'false');
    const box = await button(page).boundingBox();
    expect(Math.round(box.width)).toBe(44);
    expect(Math.round(box.height)).toBe(44);
    await expect(button(page)).toHaveAccessibleName('Send feedback');
  });
});

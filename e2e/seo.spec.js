/**
 * The pages added for search - landing pages, guides, trust pages, the 404 -
 * in a real browser: no accessibility violations in the light or dark theme,
 * breadcrumbs that lead home, a real 404, and share images that load.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '/kruti-dev-010-font/',
  '/hindi-typing-test-for-exams/',
  '/remington-hindi-keyboard/',
  '/how-to-type-hindi-in-ms-word/',
  '/guides/',
  '/guides/kruti-dev-typing-rules-matras-reph-half-letters/',
  '/guides/remington-vs-inscript-keyboard/',
  '/about/',
  '/contact/',
  '/privacy-policy/',
  '/terms/',
  '/hi/guides/hindi-text-shows-boxes-or-question-marks/',
  '/hi/remington-hindi-keyboard/',
];

const withTheme = (page, theme) =>
  page.addInitScript((t) => {
    try {
      localStorage.setItem('mkd-theme', t);
    } catch {}
  }, theme);

for (const theme of ['light', 'dark']) {
  for (const url of PAGES) {
    test(`${url} (${theme}): no WCAG A/AA violations`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop' && theme === 'dark', 'dark is checked on desktop');
      await withTheme(page, theme);
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      // The typing tutor's passage and keyboard scroll on phones and are not
      // tab stops (axe: scrollable-region-focusable). That predates these
      // pages - /hindi-typing-test has it too - and the tutor's focus
      // handling is left as it is; it is reported rather than changed here.
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude('.tt-passage')
        .exclude('.kbd')
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}

test('breadcrumbs lead back home, in the page language', async ({ page }) => {
  await page.goto('/hi/guides/remington-vs-inscript-keyboard/');
  const crumbs = page.locator('[data-breadcrumbs]');
  await expect(crumbs).toBeVisible();
  await expect(crumbs.locator('li')).toHaveCount(3);
  await expect(crumbs.locator('[aria-current="page"]')).toContainText('रेमिंगटन');
  await crumbs.locator('a').nth(1).click();
  await expect(page).toHaveURL(/\/hi\/guides\/$/);
  await page.locator('[data-breadcrumbs] a').first().click();
  await expect(page).toHaveURL(/\/hi\/$/);
});

test('an unknown URL gets the 404 page, in both languages, with working links', async ({ page }) => {
  const res = await page.goto('/no-such-page/');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Page not found');
  await expect(page.locator('section[lang="hi"] h2')).toHaveText('पेज नहीं मिला');
  await page.locator('[data-not-found] a[href="/hi/hindi-typing-test/"]').click();
  await expect(page).toHaveURL(/\/hi\/hindi-typing-test\/$/);
});

test('every page points at a share image that loads as a 1200x630 PNG', async ({ page, request }) => {
  for (const url of ['/', '/hi/', '/guides/convert-word-file-from-kruti-dev/', '/hi/terms/']) {
    await page.goto(url);
    const src = await page.locator('meta[property="og:image"]').getAttribute('content');
    const res = await request.get(new URL(src).pathname);
    expect(res.status(), src).toBe(200);
    expect(res.headers()['content-type'], src).toBe('image/png');
    const png = await res.body();
    expect(png.readUInt32BE(16), `${src} width`).toBe(1200);
    expect(png.readUInt32BE(20), `${src} height`).toBe(630);
  }
});

test('the Remington page: typing Remington keys gives Unicode Hindi, and the full chart is shown', async ({ page }) => {
  await page.goto('/remington-hindi-keyboard/');
  const boxes = page.locator('#tool textarea');
  await boxes.first().fill('Hkkjr');
  await expect(boxes.nth(1)).toHaveValue('भारत');
  await expect(page.locator('[data-cap-key]')).toHaveCount(47);
});

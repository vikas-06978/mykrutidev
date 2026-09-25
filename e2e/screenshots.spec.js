/**
 * Screenshots for a human to look at - not part of the normal run
 * (playwright.config.js ignores this file). `npm run screenshots` writes them
 * to screenshots/ (gitignored):
 *   - Kruti Dev to Unicode and the Typing Tutor in all six themes, desktop and
 *     phone, full page;
 *   - desktop only: the picker open, once per accent colour.
 */
import { test } from '@playwright/test';

const PAGES = {
  'kruti-to-unicode': '/',
  'typing-tutor': '/hindi-typing-test',
};
const THEMES = ['light', 'white', 'dark', 'black', 'reading', 'contrast'];
const ACCENTS = ['terracotta', 'blue', 'green', 'purple', 'teal'];

const store = (page, theme, accent = 'terracotta') =>
  page.addInitScript(
    ([t, a]) => {
      localStorage.setItem('mkd-theme', t);
      localStorage.setItem('mkd-accent', a);
    },
    [theme, accent],
  );

async function busy(page, name) {
  if (name === 'kruti-to-unicode') {
    await page.locator('[data-converter] [data-role="sample"]').first().click();
  }
  if (name === 'typing-tutor') {
    await page.locator('#tt-capture').focus();
    const next = await page.locator('.kbd-cap[data-next="true"]').first().getAttribute('data-cap');
    if (next) await page.keyboard.type(next);
    await page.keyboard.type(next === 'z' ? 'x' : 'z');
  }
}

for (const theme of THEMES) {
  for (const [name, path] of Object.entries(PAGES)) {
    test(`${theme} ${name}`, async ({ page }, testInfo) => {
      await store(page, theme);
      await page.route('https://inputtools.google.com/**', (r) => r.abort());
      await page.goto(path);
      await busy(page, name);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/${testInfo.project.name}-${theme}-${name}.png`, fullPage: true });
    });
  }
}

for (const accent of ACCENTS) {
  test(`picker open, ${accent}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the panel is a desktop control');
    await store(page, 'light', accent);
    await page.route('https://inputtools.google.com/**', (r) => r.abort());
    await page.goto('/');
    await busy(page, 'kruti-to-unicode');
    await page.locator('[data-theme-trigger]').click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `screenshots/desktop-accent-${accent}.png`,
      clip: { x: 0, y: 0, width: 1280, height: 720 },
    });
  });
}

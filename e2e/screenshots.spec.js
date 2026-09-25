/**
 * Screenshots of the four busiest pages in every theme, desktop and phone.
 * Not part of the normal run (playwright.config.js ignores this file) - it only
 * captures pictures for a human to look at. `npm run screenshots` writes them
 * to screenshots/ (gitignored).
 */
import { test } from '@playwright/test';

const PAGES = {
  home: '/',
  'unicode-to-kruti-dev': '/unicode-to-kruti-dev',
  'hindi-keyboard': '/hindi-keyboard',
  'typing-tutor': '/hindi-typing-test',
};

for (const theme of ['light', 'dark', 'reading']) {
  for (const [name, path] of Object.entries(PAGES)) {
    test(`${theme} ${name}`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => localStorage.setItem('mkd-theme', t), theme);
      await page.route('https://inputtools.google.com/**', (r) => r.abort());
      await page.goto(path);
      if (name === 'unicode-to-kruti-dev') {
        await page.locator('[data-converter] [data-role="sample"]').first().click();
      }
      if (name === 'typing-tutor') {
        await page.locator('#tt-capture').focus();
        const next = await page.locator('.kbd-cap[data-next="true"]').first().getAttribute('data-cap');
        if (next) await page.keyboard.type(next);
        await page.keyboard.type(next === 'z' ? 'x' : 'z');
      }
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `screenshots/${testInfo.project.name}-${theme}-${name}.png`,
        fullPage: true,
      });
    });
  }
}

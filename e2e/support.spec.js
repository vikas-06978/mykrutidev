/**
 * The support page with UPI configured (PUBLIC_UPI_QR or PUBLIC_UPI_ID at build
 * time; CI builds with test values). Without one, tests/dist.test.js checks that no
 * payment appears anywhere, and these are skipped.
 *
 * - the footer link opens the page, in both languages;
 * - the QR code and the UPI ID are on screen, and Copy copies the ID;
 * - the "Pay with a UPI app" button carries the exact link, and shows only
 *   on a phone, where a UPI app can open;
 * - no accessibility violations.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { readSupport } from '../src/lib/support.build.js';

const pay = readSupport(process.env);
const upiId = pay?.upiId;
test.skip(!upiId, 'no UPI setting: the support option is off in this build');

test('the footer link opens the support page, in English and Hindi', async ({ page }) => {
  for (const [home, path, h1] of [
    ['/', '/support/', 'Support MyKrutiDev'],
    ['/hi/', '/hi/support/', 'MyKrutiDev की मदद करें'],
  ]) {
    await page.goto(home);
    await page.locator('footer [data-support-link]').click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('h1')).toHaveText(h1);
  }
});

test('QR, UPI ID and Copy', async ({ page, context, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'clipboard checked once');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/support/');
  const box = page.locator('[data-support-upi]');
  await expect(box.getByRole('img', { name: 'UPI QR code to pay MyKrutiDev' })).toBeVisible();
  await expect(box.locator('[data-upi-id]')).toHaveText(upiId);
  await box.getByRole('button', { name: 'Copy' }).click();
  await expect(box.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(upiId);
  expect(browserName).toBe('chromium');
});

test('the UPI app button carries the exact link, and shows only on a phone', async ({ page }, testInfo) => {
  await page.goto('/support/');
  const pay = page.locator('[data-upi-pay]');
  await expect(pay).toHaveAttribute('href', pay.link);
  if (testInfo.project.name === 'mobile') await expect(pay).toBeVisible();
  else await expect(pay).toBeHidden();
});

test('no accessibility violations, in both languages', async ({ page }) => {
  for (const path of ['/support/', '/hi/support/']) {
    await page.goto(path);
    // The same standard as the site-wide check in seo.spec.js: WCAG 2 A and AA.
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`), path).toEqual([]);
  }
});

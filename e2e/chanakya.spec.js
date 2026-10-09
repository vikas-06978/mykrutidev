/**
 * Chanakya (the newspaper font) and Patrika: both directions convert in the
 * page, the output preview uses the font the map was read from, and Kruti Dev
 * text pasted on the Chanakya page gets the wrong-page hint.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every device');
  await page.addInitScript(() => {
    for (const p of ['/chanakya-to-unicode/', '/unicode-to-chanakya/', '/patrika-to-unicode/', '/unicode-to-patrika/']) {
      localStorage.setItem(`mkd-tour:${p}`, '1');
    }
  });
});

const input = (page) => page.locator('[data-converter] [data-role="input"]');
const output = (page) => page.locator('[data-converter] [data-role="output"]');

test('Chanakya to Unicode', async ({ page }) => {
  await page.goto('/chanakya-to-unicode/');
  await input(page).fill('çã¢Îè ×ð¢ ·¤æØæîÜØ ·¤è ¹ÕÚ');
  await expect(output(page)).toHaveValue('हिंदी में कार्यालय की खबर');
  await expect(page.locator('[data-role="hint"]')).toBeHidden();
});

test('Kruti Dev text on the Chanakya page gets the wrong-page hint', async ({ page }) => {
  await page.goto('/chanakya-to-unicode/');
  await input(page).fill('fgUnh esa dk;kZy; dh [kcj');
  await expect(page.locator('[data-role="hint"]')).toBeVisible();
});

test('Unicode to Chanakya, previewed in the Chanakya font', async ({ page }) => {
  await page.goto('/unicode-to-chanakya/');
  await input(page).fill('प्रधानमंत्री कार्यालय');
  await expect(output(page)).toHaveValue('ÂAÏæÙ×¢˜è ·¤æØæîÜØ');
  const family = await output(page).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain('MKD Chanakya');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "MKD Chanakya"')))
    .toBe(true);
});

test('Patrika both ways: its digit keys are digits', async ({ page }) => {
  await page.goto('/patrika-to-unicode/');
  await input(page).fill('ÚæÁSÍæÙ ÂçÌý·¤æ vwx{');
  await expect(output(page)).toHaveValue('राजस्थान पत्रिका 1236');
  await page.goto('/unicode-to-patrika/');
  await input(page).fill('क्या');
  await expect(output(page)).toHaveValue('·¤Kæ');
});

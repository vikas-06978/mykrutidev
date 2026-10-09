/**
 * Kruti Dev to Unicode: the Kruti Dev 055 tick for pasted text.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every device');
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/', '1'));
});

test('ticking Kruti Dev 055 reads its digits and Alt codes', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('[data-converter] [data-role="input"]');
  const output = page.locator('[data-converter] [data-role="output"]');
  await input.fill('lu~ 2024 ƒj');
  await expect(output).toHaveValue('सन् 2024 १र');
  await page.locator('[data-role="cut-055"]').check();
  await expect(output).toHaveValue('सन् २०२४ घर');
  await page.locator('[data-role="cut-055"]').uncheck();
  await expect(output).toHaveValue('सन् 2024 १र');
});

test('the tick is only on pages that read Kruti Dev', async ({ page }) => {
  await page.goto('/unicode-to-kruti-dev');
  await expect(page.locator('[data-role="cut-055"]')).toHaveCount(0);
  await page.goto('/kruti-dev-to-mangal');
  await expect(page.locator('[data-role="cut-055"]')).toHaveCount(1);
});

/**
 * Kruti Dev to Unicode: the word-by-word English choice under the converter.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every device');
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/', '1'));
});

const input = (page) => page.locator('[data-converter] [data-role="input"]');
const output = (page) => page.locator('[data-converter] [data-role="output"]');
const chip = (page, word) => page.locator('.cv-chip', { hasText: new RegExp(`^${word}`) });

test('kept and maybe-English words can be ticked and unticked, and the output follows', async ({ page }) => {
  await page.goto('/');
  await input(page).fill('jke us Office esa Delhi');
  await expect(output(page)).toHaveValue('राम ने Office में क्मसीप');

  const panel = page.locator('[data-role="english-words"]');
  await expect(panel).toBeVisible();
  await expect(chip(page, 'Office').locator('input')).toBeChecked();
  await expect(chip(page, 'us').locator('input')).not.toBeChecked();
  // The suggestion list loads on first use.
  await expect(chip(page, 'Delhi').locator('input')).not.toBeChecked();

  await chip(page, 'Delhi').locator('input').check();
  await expect(output(page)).toHaveValue('राम ने Office में Delhi');
  await chip(page, 'Office').locator('input').uncheck();
  await expect(output(page)).toHaveValue('राम ने व्िपिबम में Delhi');

  // Unticking the main box converts everything, and the panel goes away.
  await page.locator('[data-role="keep-english"]').uncheck();
  await expect(panel).toBeHidden();
});

test('plain Hindi shows no panel', async ({ page }) => {
  await page.goto('/');
  await input(page).fill('Hkkjr esjk ns\'k gS');
  await expect(output(page)).toHaveValue('भारत मेरा देश है');
  await expect(page.locator('[data-role="english-words"]')).toBeHidden();
});

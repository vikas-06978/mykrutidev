import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
});

test('mistakes produce whole-character drills without unlocking lessons or setting speed records', async ({ page }) => {
  await page.goto('/hindi-typing-test/');
  const capture = page.locator('[data-role="capture"]');
  await capture.fill('x');
  await page.locator('[data-role="submit"]').click();
  await expect(page.locator('[data-role="coach-explanations"] li')).toHaveCount(1);
  await expect(page.locator('[data-role="coach-drill"]')).toBeVisible();
  await page.locator('[data-role="coach-drill"]').click();
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-mode','targeted');
  await expect(page.locator('[data-role="passage-title"]')).toHaveText('Practise my mistakes');
  await capture.fill('d d d d');
  await expect(page.locator('[data-role="result"]')).toBeVisible();
  const record = await page.evaluate(() => ({
    progress: JSON.parse(localStorage.getItem('mykrutidev:tutor') || '{}'),
    best: localStorage.getItem('mykrutidev:best-wpm'),
  }));
  expect(record.progress.done || []).toEqual([]);
  expect(record.best).toBeNull();
  await expect(page.locator('[data-role="share"]')).toBeHidden();
  await page.locator('[data-role="coach-next"]').click();
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-mode','lesson');
  await expect(page.locator('[data-level="top"]')).toBeDisabled();
});

test('focus view preserves input and restores outside access with Escape', async ({ page }) => {
  await page.goto('/hindi-typing-test/');
  const button=page.locator('[data-role="focus-toggle"]');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed','true');
  expect(await page.locator('body > header').evaluate(el=>el.inert)).toBe(true);
  await page.locator('[data-role="capture"]').fill('d');
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('[data-role="capture"]')).toHaveValue('d');
  expect(await page.locator('body > header').evaluate(el=>el.inert)).toBe(false);
});

test('independent exam presets apply and custom rule edits are reflected', async ({ page }) => {
  await page.goto('/hindi-typing-test/');
  await page.locator('[data-mode="exam"]').click();
  await page.locator('[data-role="exam-preset"]').selectOption('strict');
  await expect(page.locator('[data-role="backspace"]')).not.toBeChecked();
  await expect(page.locator('[data-role="highlight"]')).not.toBeChecked();
  await expect(page.locator('[data-role="exam-preset"]')).toHaveValue('strict');
  await page.locator('[data-role="backspace"]').check();
  await expect(page.locator('[data-role="exam-preset"]')).toHaveValue('custom');
  await page.locator('[data-role="exam-preset"]').selectOption('guided');
  await expect(page.locator('[data-role="backspace"]')).toBeChecked();
  await expect(page.locator('[data-role="highlight"]')).toBeChecked();
});

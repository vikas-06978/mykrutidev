import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
});

test('exam cards stay within exam practice and keep the selected format', async ({ page }) => {
  await page.goto('/hindi-typing-test/');
  for (const mode of ['lesson', 'practice', 'passages', 'daily']) {
    await page.locator(`button[data-mode="${mode}"]`).click();
    await expect(page.locator('[data-role="exam-profiles"]')).toBeHidden();
    await expect(page.locator('[data-role="coach-unicode"]')).toBeHidden();
  }
  await page.locator('button[data-mode="exam"]').click();
  await expect(page.locator('[data-role="exam-remington"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-role="coach-unicode"]').click();
  await expect(page.locator('button[data-mode="exam"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-role="coach-unicode"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-role="capture"]')).not.toBeFocused();
  await expect(page.locator('[data-role="rule-controls"]')).toBeHidden();
  await page.locator('[data-role="capture"]').fill('भारत');
  await page.locator('button[data-mode="exam"]').click();
  await expect(page.locator('[data-role="capture"]')).toHaveValue('भारत');
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('button[data-mode="exam"]').click();
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-mode', 'unicode');
  await expect(page.locator('[data-role="native-profile"]')).toBeVisible();
});

test('direct exam links open the requested format without starting or focusing input', async ({ page }) => {
  for (const [entry, mode] of [['ssc-chsl-2026-hindi', 'unicode'], ['remington', 'exam']]) {
    await page.goto(`/hindi-typing-test/?exam=${entry}`);
    await expect(page.locator('[data-tutor]')).toHaveAttribute('data-mode', mode);
    await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('[data-role="time"]')).toHaveText('10:00');
    await expect(page.locator('[data-role="capture"]')).not.toBeFocused();
    await expect(page.locator('button[data-mode="exam"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://mykrutidev.com/hindi-typing-test/');
  }
  await page.goto('/hindi-typing-test/?exam=unknown');
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-mode', 'lesson');
  await expect(page).not.toHaveURL(/exam=/);
});

test('compact focus view preserves native text and keeps paragraph input and exit available', async ({ page }) => {
  await page.goto('/hindi-typing-test/?exam=ssc-chsl-2026-hindi');
  await page.locator('[data-role="capture"]').fill('भारत');
  await page.locator('[data-role="focus-toggle"]').click();
  await expect(page.locator('[data-role="mode"]')).toBeHidden();
  await expect(page.locator('[data-role="focus-toggle"]')).toBeVisible();
  await page.locator('[data-role="native-tab"]').click();
  await expect(page.locator('[data-role="capture"]')).toHaveValue('भारत\t');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-role="mode"]')).toBeVisible();
  await expect(page.locator('[data-role="capture"]')).toHaveValue('भारत\t');
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state', 'running');
  expect(await page.locator('body > header').evaluate(el => el.inert)).toBe(false);
});

test('instructions expand on demand while SSC independence remains visible', async ({ page }) => {
  await page.goto('/hindi-typing-test/?exam=remington');
  const help = page.locator('[data-role="mode-help"]');
  await expect(help).not.toHaveAttribute('open');
  await expect(page.locator('[data-role="mode-note"]')).toBeHidden();
  await help.locator('summary').click();
  await expect(page.locator('[data-role="mode-note"]')).toBeVisible();
  await expect(page.locator('[data-role="mode-note"]')).toContainText('÷ 5');
  await page.locator('[data-role="coach-unicode"]').click();
  await expect(help).not.toHaveAttribute('open');
  await expect(page.locator('[data-role="native-profile"]')).toContainText('Independent practice');
  await help.locator('summary').click();
  await expect(page.locator('[data-role="native-source"] a').first()).toBeVisible();
  await expect(page.locator('[data-role="native-source"]')).toContainText('not the official test software');
});

test('reference text is keyboard-scrollable and presets do not open the typing field', async ({ page }) => {
  await page.goto('/hindi-typing-test/?exam=remington');
  await page.locator('[data-role="exam-preset"]').selectOption('strict');
  await expect(page.locator('[data-role="capture"]')).not.toBeFocused();
  await expect(page.locator('[data-role="backspace"]')).not.toBeChecked();
  const passage = page.locator('[data-role="passage"]');
  await passage.focus();
  await expect(passage).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect.poll(() => passage.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('[data-role="time"]')).toHaveText('10:00');
});

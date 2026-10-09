/**
 * The typing tutor's exam rules: Backspace and Highlighting. Both are ON for a
 * new visitor; turning one off is remembered, and does what an exam does.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'a physical keyboard is assumed');
  // The first-visit tour would sit over the controls.
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
});

const tutor = (page) => page.locator('[data-tutor]');
const capture = (page) => page.locator('[data-role="capture"]');

test('both rules are on by default: hints, colours and Backspace all work', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await expect(page.locator('[data-role="backspace"]')).toBeChecked();
  await expect(page.locator('[data-role="highlight"]')).toBeChecked();
  await expect(tutor(page)).toHaveAttribute('data-highlight', 'on');
  await expect(page.locator('[data-role="typed-wrap"]')).toBeHidden();
  await expect(page.locator('[data-role="rules-note"]')).toBeHidden();
  await expect(page.locator('[data-next="true"]')).toHaveCount(1);

  await capture(page).focus();
  await page.keyboard.type('xy');
  await page.keyboard.press('Backspace');
  await expect(capture(page)).toHaveValue('x');
});

test('Backspace off: nothing typed can be removed, and it is remembered', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await page.locator('[data-role="backspace"]').uncheck();
  await expect(page.locator('[data-role="rules-note"]')).toBeVisible();

  await capture(page).focus();
  await page.keyboard.type('xy');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Control+z');
  await page.keyboard.type('z');
  await expect(capture(page)).toHaveValue('xyz');

  await page.reload();
  await expect(page.locator('[data-role="backspace"]')).not.toBeChecked();
});

test('Highlighting off: plain passage, no key hints, typing shown in its own box', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await page.locator('[data-role="highlight"]').uncheck();
  await expect(tutor(page)).toHaveAttribute('data-highlight', 'off');
  await expect(page.locator('[data-next]')).toHaveCount(0);
  await expect(page.locator('[data-active]')).toHaveCount(0);

  await capture(page).focus();
  await page.keyboard.type('xq');
  await expect(page.locator('[data-role="typed"]')).toHaveText('xq');
  await expect(page.locator('[data-role="typed-wrap"]')).toBeVisible();
  await expect(page.locator('[data-next]')).toHaveCount(0);
  // Live accuracy and mistakes wait for the result.
  await expect(page.locator('[data-role="accuracy"]')).toHaveText('–');
  await expect(page.locator('[data-role="errors"]')).toHaveText('–');
  await expect(page.locator('.tt-c[data-s="current"]')).toHaveCSS('box-shadow', 'none');
  // A wrong character is not coloured.
  const wrong = page.locator('.tt-c[data-s="wrong"]').first();
  await expect(wrong).toHaveCSS('text-decoration-line', 'none');

  await page.reload();
  await expect(page.locator('[data-role="highlight"]')).not.toBeChecked();
  await page.locator('[data-role="highlight"]').check();
  await expect(tutor(page)).toHaveAttribute('data-highlight', 'on');
  await expect(page.locator('[data-next="true"]')).toHaveCount(1);
});

/**
 * The Remington keyboard on a phone: the whole board in view, two labels a
 * key, the Shift letters a button away, and the next key always showing the
 * letter it will type.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout');
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
});

test('the keyboard fits the screen, and Shift letters come up on demand', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await page.locator('button[data-mode="practice"]').click();
  const board = page.locator('[data-keyboard]');
  await board.scrollIntoViewIfNeeded();

  // No sideways scroll: every cap is inside the board.
  const fit = await board.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const caps = [...el.querySelectorAll('.kbd-cap')].filter((c) => c.offsetParent);
    return {
      scrolls: el.scrollWidth > el.clientWidth,
      outside: caps.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.left < box.left || r.right > box.right;
      }).length,
    };
  });
  expect(fit).toEqual({ scrolls: false, outside: 0 });
  await expect(board.locator('.kbd-extra').first()).toBeHidden();
  await expect(page.locator('.tt-phone-note')).toBeVisible();

  // q: फ is the Shift letter; ु is the plain one.
  const q = board.locator('.kbd-cap[data-cap="q"]');
  await expect(q.locator('.kbd-shift')).toBeHidden();
  await expect(q.locator('.kbd-base')).toBeVisible();
  const toggle = page.locator('[data-role="shift-view"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(q.locator('.kbd-shift')).toBeVisible();
  await expect(q.locator('.kbd-base')).toBeHidden();
  await toggle.click();
  await expect(q.locator('.kbd-base')).toBeVisible();
});

test('a key that needs Shift shows its Shift letter even with the board unshifted', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('[data-role="capture"]').focus();
  for (let i = 0; i < 400; i++) {
    if (await page.locator('.kbd-cap[data-show="shift"]').count()) break;
    const cap = await page.locator('.kbd-cap[data-next="true"]').getAttribute('data-cap');
    await page.keyboard.type(cap);
  }
  const lit = page.locator('.kbd-cap[data-show="shift"]');
  await expect(lit).toHaveCount(1);
  await expect(lit.locator('.kbd-shift')).toBeVisible();
  await expect(lit.locator('.kbd-base')).toBeHidden();
  await expect(page.locator('[data-role="prompt-keys"]')).toContainText('Shift');
});

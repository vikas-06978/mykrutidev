/**
 * Today's practice: today's passage, and the last 7 days with how far each got.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every device');
  await page.addInitScript(() => {
    localStorage.setItem('mkd-tour:/hindi-typing-test', '1');
    const d = (n) => {
      const x = new Date();
      x.setDate(x.getDate() - n);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    localStorage.setItem(
      'mkd-habit',
      JSON.stringify({ v: 1, sessions: [], daily: { [d(1)]: { pct: 100, wpm: 31, acc: 97 }, [d(3)]: { pct: 45, wpm: 24, acc: 92 } } }),
    );
  });
});

test('the last 7 days: collapsed, counted, and each opens its own passage', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await page.locator('button[data-mode="daily"]').click();
  const days = page.locator('[data-role="days"]');
  await expect(days).toBeVisible();
  await expect(days.locator('[data-role="days-count"]')).toHaveText('· 1 of 7 done');
  // Collapsed: the passage stays near the top.
  await expect(page.locator('.tt-day').first()).toBeHidden();

  await days.locator('summary').click();
  await expect(page.locator('.tt-day')).toHaveCount(7);
  await expect(page.locator('.tt-day').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tt-day').nth(1).locator('.tt-day-status')).toHaveText('Done ✓ · 31 WPM, 97%');
  await expect(page.locator('.tt-day').nth(3).locator('.tt-day-status')).toHaveText('45% typed · 24 WPM, 92%');
  await expect(page.locator('.tt-day').nth(2).locator('.tt-day-status')).toHaveText('Not practised');

  const todayTitle = await page.locator('[data-role="passage-title"]').textContent();
  expect(todayTitle).toMatch(/^Today's practice · /);
  await page.locator('.tt-day').nth(3).click();
  await expect(page.locator('[data-role="passage-title"]')).toHaveText(/^Practice for .+ · /);
  await expect(page.locator('.tt-day').nth(3)).toHaveAttribute('aria-pressed', 'true');

  // Leaving and coming back opens today's passage again.
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('button[data-mode="daily"]').click();
  await expect(page.locator('[data-role="passage-title"]')).toHaveText(todayTitle);
});

test('other modes do not show the list', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  for (const m of ['lesson', 'practice', 'exam']) {
    await page.locator(`button[data-mode="${m}"]`).click();
    await expect(page.locator('[data-role="days"]')).toBeHidden();
  }
});

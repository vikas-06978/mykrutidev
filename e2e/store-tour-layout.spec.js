import { test, expect } from '@playwright/test';

test('single-product store uses a full cover and a compact product card', async ({ page }) => {
  await page.goto('/store/');
  const list = page.locator('[data-store-list]');
  await expect(list).toHaveAttribute('data-count', '1');
  await expect(list.locator('li')).toHaveCount(1);
  const cover = list.locator('img');
  await expect(cover).toBeVisible();
  const card = await list.locator('li').boundingBox();
  expect(card.width).toBeLessThanOrEqual(1000);
  await expect(list.getByRole('link', { name: /view details/i })).toBeVisible();
});

test('replayed tutor guide points to visible exam controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
  await page.goto('/hindi-typing-test/');
  await page.locator('button[data-mode="exam"]').click();
  await page.locator('[data-tour-replay]').click();
  const tour = page.locator('.tour');
  await expect(tour).toBeVisible();
  await expect(tour.locator('.tour-count')).toHaveText('1 of 2');
  const target = page.locator('.tour-target');
  await expect(target).toHaveCount(1);
  await expect(target).toBeInViewport();
  const [bubble, control] = await Promise.all([tour.boundingBox(), target.boundingBox()]);
  expect(bubble.x < control.x + control.width && control.x < bubble.x + bubble.width &&
    bubble.y < control.y + control.height && control.y < bubble.y + bubble.height).toBe(false);
  await tour.locator('.tour-next').click();
  await expect(page.locator('.tour-target')).toBeInViewport();
});

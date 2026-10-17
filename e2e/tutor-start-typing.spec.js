import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-typing-test', '1'));
});

for (const url of ['/hindi-typing-test/', '/hindi-typing-test-for-exams/']) {
  test(`Start typing brings the practice area into view without starting the clock: ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.locator('button[data-mode="practice"]').click();
    await page.locator('[data-role="start-typing"]').click();
    const passage = page.locator('[data-role="passage"]');
    const input = page.locator('[data-role="capture"]');
    await expect(input).toBeFocused();
    await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state', 'idle');
    await expect.poll(async () => {
      const box = await passage.boundingBox();
      return box.y;
    }).toBeLessThan(page.viewportSize().height / 2);
    await expect(passage).toBeInViewport();
    await page.keyboard.type('d');
    await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state', 'running');
    await expect(input).toHaveValue('d');
  });
}

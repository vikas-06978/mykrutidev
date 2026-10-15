/**
 * The free practice page (/hindi-typing-practice-passages): thirty passages in
 * three levels, each opening to its text and tricky words with their keys, and
 * the free PDF. Accessible, and no sideways scroll on a phone.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('thirty passages, each opens to its text and the keys of its tricky words', async ({ page }) => {
  await page.goto('/hindi-typing-practice-passages/');
  await expect(page.locator('main details')).toHaveCount(30);
  const first = page.locator('main details').first();
  await first.locator('summary').click();
  await expect(first.locator('p[lang=hi]').first()).toContainText('सुबह की सैर शरीर');
  await expect(first.locator('li code')).toHaveCount(8);
  const pdf = page.locator('main a[download]').first();
  await expect(pdf).toHaveAttribute('href', '/downloads/mykrutidev-kruti-dev-typing-30-passages.pdf');
  const res = await page.request.get('/downloads/mykrutidev-kruti-dev-typing-30-passages.pdf');
  expect(res.ok()).toBe(true);
  expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
});

test('no accessibility violations and no sideways scroll on a phone, in Hindi too', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/hindi-typing-practice-passages/', '/hi/hindi-typing-practice-passages/']) {
    await page.goto(path);
    await page.locator('main details').nth(20).locator('summary').click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id), path).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});

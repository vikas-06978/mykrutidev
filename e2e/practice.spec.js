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

test('a passage opens itself in the typing test, is ticked when finished, and stays open', async ({ page }) => {
  await page.goto('/hindi-typing-practice-passages/');
  const link = page.locator('main a[href*="passage=7#"]');
  await page.locator('main details', { has: page.locator('a[href*="passage=7#"]') }).locator('summary').click();
  await link.click();
  const tutor = page.locator('[data-tutor]');
  await expect(tutor).toHaveAttribute('data-mode', 'passages');
  await expect(page.locator('[data-role="capture"]')).toBeEnabled();
  await expect(page.locator('[data-role="passage-title"]')).toContainText('7');
  await expect(page.locator('[data-pp="7"]')).toHaveAttribute('data-state', 'current');

  // Type it all: the keystrokes the tutor itself expects.
  const keys = await page.evaluate(async () => {
    const { url } = JSON.parse(document.querySelector('[data-tutor-pp]').textContent);
    return (await (await fetch(url)).json())[6].units.map((u) => u.keys).join('');
  });
  await page.locator('[data-role="capture"]').evaluate((c, k) => {
    c.value = k;
    c.dispatchEvent(new Event('input', { bubbles: true }));
  }, keys);
  await expect(page.locator('[data-role="result"]')).toBeVisible();
  await expect(page.locator('[data-pp="7"] [data-role="pp-meta"]')).toContainText('✓');

  // On to the next one; the address follows, and a reload keeps it.
  await page.locator('[data-role="next-level"]').click();
  await expect(page).toHaveURL(/\?passage=8#tool$/);
  await page.reload();
  await expect(page.locator('[data-role="passage-title"]')).toContainText('8');
  await expect(page.locator('[data-pp="7"]')).toHaveAttribute('data-state', 'done');

  // A finished passage can be typed again.
  await page.locator('[data-pp="7"]').click();
  await expect(page.locator('[data-role="passage-title"]')).toContainText('7');
  await expect(page.locator('[data-role="capture"]')).toBeEnabled();

  // Another tab clears the address; an unknown number opens the usual tutor.
  await page.locator('button[data-mode="lesson"]').click();
  await expect(page).not.toHaveURL(/passage=/);
  await page.goto('/hindi-typing-test/?passage=99#tool');
  await expect(tutor).toHaveAttribute('data-mode', 'lesson');
});

/**
 * Analytics events: which tool was used, never what was typed or which file.
 *
 * window.gtag only exists on the live site (src/lib/analytics.js), so here it
 * is stood in for and every call recorded.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every device');
  await page.addInitScript(() => {
    localStorage.setItem('mkd-tour:/hindi-typing-test', '1');
    window.__events = [];
    window.gtag = (kind, name, params) => kind === 'event' && window.__events.push({ name, params });
  });
});

const events = (page, name) => page.evaluate((n) => window.__events.filter((e) => e.name === n), name);

test('typing_test_start: once per run, with the mode and length only', async ({ page }) => {
  await page.goto('/hindi-typing-test');
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('[data-role="capture"]').focus();
  const cap = await page.locator('.kbd-cap[data-next="true"]').getAttribute('data-cap');
  await page.keyboard.type(cap);
  await expect.poll(() => events(page, 'typing_test_start')).toHaveLength(1);
  const [e] = await events(page, 'typing_test_start');
  expect(Object.keys(e.params).sort()).toEqual(['minutes', 'mode']);
  expect(e.params.mode).toBe('practice');

  // Typing on is the same run.
  await page.keyboard.type('abc');
  expect(await events(page, 'typing_test_start')).toHaveLength(1);
});

test('upload_file: the file type and a size bucket, never its name', async ({ page }) => {
  await page.goto('/?mode=file');
  await page
    .locator('[data-doc-converter] input[type="file"]')
    .setInputFiles(fileURLToPath(new URL('../src/lib/__fixtures__/kruti-test.docx', import.meta.url)));
  await expect.poll(() => events(page, 'upload_file')).toHaveLength(1);
  const [e] = await events(page, 'upload_file');
  expect(e.params).toEqual({ file: 'docx', size: 'under-100kb' });
  // Nothing in any event names the file.
  expect(JSON.stringify(await page.evaluate(() => window.__events))).not.toContain('kruti-test');
});

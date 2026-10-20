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

test('a practice passage: the start names which of the 30, nothing else', async ({ page }) => {
  await page.goto('/hindi-typing-test/?passage=12#tool');
  await expect(page.locator('[data-role="capture"]')).toBeEnabled();
  await page.locator('[data-role="capture"]').focus();
  const cap = await page.locator('.kbd-cap[data-next="true"]').getAttribute('data-cap');
  await page.keyboard.type(cap);
  await expect.poll(() => events(page, 'typing_test_start')).toHaveLength(1);
  const [e] = await events(page, 'typing_test_start');
  expect(e.params).toEqual({ mode: 'passages', minutes: 0, passage: 12 });
});

test('shop: product view and the Starter card, with product and price only', async ({ page }) => {
  await page.goto('/store/kruti-dev-7-day-starter/');
  await expect.poll(() => events(page, 'view_item')).toHaveLength(1);
  const [v] = await events(page, 'view_item');
  expect(v.params).toEqual({ currency: 'INR', value: 39, items: [{ item_id: 'kruti-dev-7-day-starter', price: 39 }] });

  await page.goto('/hindi-typing-practice-passages/');
  await page.locator('[data-track-promo]').evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.locator('[data-track-promo]').click();
  const [p] = await events(page, 'select_promotion');
  expect(p.params).toEqual({ promotion_id: 'practice-passages', items: [{ item_id: 'kruti-dev-7-day-starter' }] });
});

test('store listing tracks its product and a card selection without visitor data', async ({ page }) => {
  await page.goto('/store/');
  await expect.poll(() => events(page, 'view_item_list')).toHaveLength(1);
  expect((await events(page, 'view_item_list'))[0].params).toEqual({
    item_list_id: 'store',
    items: [{ item_id: 'kruti-dev-7-day-starter', price: 39 }],
  });
  await page.locator('[data-store-list] .store-product-copy a').first().evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault());
  });
  await page.locator('[data-store-list] .store-product-copy a').first().click();
  expect((await events(page, 'select_item'))[0].params).toEqual({
    item_list_id: 'store',
    items: [{ item_id: 'kruti-dev-7-day-starter', price: 39 }],
  });
});

test('a purchase kept in this browser: the product page offers the download again, and puts the price aside', async ({ page }) => {
  const o = 'o' + 'a'.repeat(24);
  const t = 'tok_' + 'x'.repeat(30);
  let state = { ok: true, state: 'paid', remaining: 4, expires: Math.floor(Date.now() / 1000) + 86400 * 25 };
  await page.route('**/api/store/order', (r) => r.fulfill({ json: state }));
  await page.goto('/store/kruti-dev-7-day-starter/');
  await expect(page.locator('[data-sb-owned]')).toBeHidden();
  await expect(page.locator('[data-sb-buyarea]')).toBeVisible();
  await page.evaluate(([o, t]) => localStorage.setItem('mkd-bought', JSON.stringify({ 'kruti-dev-7-day-starter': { o, t, exp: Math.floor(Date.now() / 1000) + 86400 * 25 } })), [o, t]);
  await page.reload();
  await expect(page.locator('[data-sb-owned]')).toBeVisible();
  await expect(page.locator('[data-sb-owned-link]')).toHaveAttribute('href', `/store/thanks/#o=${o}&t=${t}`);
  await expect(page.locator('[data-sb-owned-left]')).toContainText('4 downloads left');
  // The price and the form step aside, one click away.
  await expect(page.locator('[data-sb-buyarea]')).toBeHidden();
  await expect(page.locator('[data-sb-bought]')).toBeHidden();
  await page.locator('[data-sb-again]').click();
  await expect(page.locator('[data-sb-buyarea]')).toBeVisible();
  // Refunded: it says so (the receipt is one click away), and the form is there as for anyone.
  state = { ok: true, state: 'refunded', remaining: 4, expires: null, receipt: { order: o, amount: 3900 } };
  await page.reload();
  await expect(page.locator('[data-sb-owned-closed]')).toHaveText('This order was refunded, so the download is closed.');
  await expect(page.locator('[data-sb-buyarea]')).toBeVisible();
  // "Forget this purchase on this device" removes it.
  await page.locator('[data-sb-forget]').click();
  await expect(page.locator('[data-sb-owned]')).toContainText('Removed from this device');
  expect(await page.evaluate(() => localStorage.getItem('mkd-bought'))).toBe('{}');
});

test('app install funnel distinguishes button choice from confirmed installation', async ({ page }) => {
  await page.goto('/');
  for (const outcome of ['dismissed', 'accepted']) {
    await page.evaluate((outcome) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome }) });
      window.dispatchEvent(event);
    }, outcome);
    await page.locator('.mkd-install-bar [data-install-go]').click();
    await expect.poll(() => events(page, 'pwa_install_choice')).toHaveLength(outcome === 'dismissed' ? 1 : 2);
  }
  expect(await events(page, 'pwa_install_click')).toHaveLength(2);
  expect(await events(page, 'pwa_install')).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  expect(await events(page, 'pwa_install')).toEqual([{ name: 'pwa_install', params: {} }]);
});

test('installed app page views cover standalone and iOS launches', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/');
  await expect.poll(() => events(page, 'pwa_page_view')).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(await events(page, 'pwa_page_view')).toHaveLength(2);
});

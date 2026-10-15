/**
 * The buyer's side of reaching their download: the thanks page shows where
 * the link was emailed and lets them correct a wrong address once, and the
 * "lost your link?" form. The store API is stood in for (page.route), since
 * the static server runs no Functions; server/store.test.js covers the API.
 */
import { test, expect } from '@playwright/test';

const O = 'o' + 'a'.repeat(24);
const T = 'tok_' + 'x'.repeat(30);
const paid = (extra = {}) => ({ ok: true, state: 'paid', productId: 'kruti-dev-7-day-starter', emailed: true, token: T, remaining: 5, expires: Math.floor(Date.now() / 1000) + 86400 * 30, ...extra });

test.beforeEach(async ({ page }) => {
  // No Turnstile site key: the forms send without a token.
  await page.route('**/api/feedback', (r) => r.fulfill({ json: { ok: true, turnstileSiteKey: null } }));
});

test('the thanks page names the address and lets the buyer correct it once', async ({ page }) => {
  await page.route('**/api/store/order?*', (r) => r.fulfill({ json: paid({ email: 'buyer@gmial.com', canChangeEmail: true, mailStatus: '' }) }));
  let sent = null;
  await page.route('**/api/store/email', async (r) => {
    sent = JSON.parse(r.request().postData());
    await r.fulfill({ json: { ok: true, email: 'buyer@gmail.com', sent: true } });
  });
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-sent]')).toHaveText('We emailed the link to buyer@gmial.com.');
  await expect(page.locator('[data-st-bounced]')).toBeHidden();
  await page.locator('[data-st-change-summary]').click();
  await page.locator('#st-email').fill('Buyer@gmail.com');
  await page.locator('[data-st-change-send]').click();
  await expect(page.locator('[data-st-sent]')).toHaveText('Done. We sent the link to buyer@gmail.com.');
  await expect(page.locator('[data-st-change]')).toBeHidden();
  expect(sent).toEqual({ o: O, t: T, email: 'Buyer@gmail.com' });
});

test('a bounce is said plainly and the correction is open; a refusal is explained', async ({ page }) => {
  await page.route('**/api/store/order?*', (r) => r.fulfill({ json: paid({ email: 'buyer@gmial.com', canChangeEmail: true, mailStatus: 'bounced' }) }));
  await page.route('**/api/store/email', (r) => r.fulfill({ status: 409, json: { ok: false, error: 'not-allowed' } }));
  await page.goto(`/hi/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-bounced]')).toContainText('buyer@gmial.com पर हमारा ईमेल नहीं पहुँच सका');
  await expect(page.locator('#st-email')).toBeVisible();
  await page.locator('#st-email').fill('right@gmail.com');
  await page.locator('[data-st-change-send]').click();
  await expect(page.locator('[data-st-change-status]')).toContainText('दोबारा नहीं बदल सकता');
});

test('no correction offered once it is used or the time is up; no email: "want it by email too?"', async ({ page }) => {
  await page.route('**/api/store/order?*', (r) => r.fulfill({ json: paid({ email: 'buyer@gmail.com', canChangeEmail: false }) }));
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-sent]')).toBeVisible();
  await expect(page.locator('[data-st-change]')).toBeHidden();
  await page.unroute('**/api/store/order?*');
  await page.route('**/api/store/order?*', (r) => r.fulfill({ json: paid({ emailed: false, email: '', canChangeEmail: true }) }));
  await page.reload();
  await expect(page.locator('[data-st-sent]')).toBeHidden();
  await expect(page.locator('[data-st-change-summary]')).toHaveText('Want the link by email too?');
});

test('"Lost your download link?": sent to that email, with the same answer either way; limits are explained', async ({ page }) => {
  let body = null;
  let status = 200;
  await page.route('**/api/store/find', async (r) => {
    body = JSON.parse(r.request().postData());
    await r.fulfill({ status, json: status === 200 ? { ok: true } : { ok: false } });
  });
  await page.goto('/store/kruti-dev-7-day-starter/');
  await page.locator('[data-store-find] summary').click();
  await page.locator('#sf-email').fill('nope');
  await page.locator('[data-sf-send]').click();
  await expect(page.locator('[data-sf-status]')).toBeVisible();
  expect(body).toBeNull();
  await page.locator('#sf-email').fill('buyer@gmail.com');
  await page.locator('[data-sf-send]').click();
  await expect(page.locator('[data-sf-status]')).toContainText('If this email has a purchase');
  expect(body.email).toBe('buyer@gmail.com');
  expect(body.lang).toBe('en');
  status = 429;
  await page.locator('[data-sf-send]').click();
  await expect(page.locator('[data-sf-status]')).not.toContainText('If this email has a purchase');
});

test('the form is also on the thanks page, and the pages stay accessible-width on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route('**/api/store/order?*', (r) => r.fulfill({ json: paid({ email: 'buyer@gmail.com', canChangeEmail: true }) }));
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-store-find]')).toBeVisible();
  await page.locator('[data-st-change-summary]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

/**
 * The buyer's side of reaching their download: the thanks page shows where
 * the link was emailed and lets them correct a wrong address once, and the
 * "lost your link?" form. The store API is stood in for (page.route), since
 * the static server runs no Functions; server/store.test.js covers the API.
 */
import { test, expect } from '@playwright/test';

const O = 'o' + 'a'.repeat(24);
const T = 'tok_' + 'x'.repeat(30);
const M = 'f0'.repeat(32);
const T2 = 'e1'.repeat(32);
const paid = (extra = {}) => ({ ok: true, state: 'paid', productId: 'kruti-dev-7-day-starter', emailed: true, token: T, remaining: 5, expires: Math.floor(Date.now() / 1000) + 86400 * 30, ...extra });

test.beforeEach(async ({ page }) => {
  // No Turnstile site key: the forms send without a token.
  await page.route('**/api/feedback', (r) => r.fulfill({ json: { ok: true, turnstileSiteKey: null } }));
});

test('the thanks page names the address and lets the buyer correct it once', async ({ page }) => {
  let asked = null;
  await page.route('**/api/store/order', async (r) => {
    asked = JSON.parse(r.request().postData());
    await r.fulfill({ json: paid({ email: 'buyer@gmial.com', canChangeEmail: true, mailStatus: 'sent', manage: M }) });
  });
  let sent = null;
  await page.route('**/api/store/email', async (r) => {
    sent = JSON.parse(r.request().postData());
    await r.fulfill({ json: { ok: true, email: 'buyer@gmail.com', sent: true, token: T2 } });
  });
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-sent]')).toHaveText('We emailed the link to buyer@gmial.com.');
  await expect(page.locator('[data-st-bounced]')).toBeHidden();
  await page.locator('[data-st-change-summary]').click();
  await page.locator('#st-email').fill('Buyer@gmail.com');
  await page.locator('[data-st-change-send]').click();
  await expect(page.locator('[data-st-sent]')).toHaveText('Done. We sent the link to buyer@gmail.com.');
  await expect(page.locator('[data-st-change]')).toBeHidden();
  // The keys go in the body, never the address. The email is changed with the management key only.
  expect(asked).toEqual({ o: O, t: T, m: '' });
  expect(sent).toEqual({ o: O, m: M, email: 'Buyer@gmail.com' });
  // The link moved on to a new key: the page and this device keep it.
  await expect(page.locator('[data-st-download] input[name="t"]')).toHaveValue(T2);
  expect(page.url()).toContain(`#o=${O}&t=${T2}`);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mkd-bought'))['kruti-dev-7-day-starter']);
  expect(kept).toMatchObject({ o: O, t: T2, m: M });
});

test('an email that could not be sent yet is said honestly, and a spam report is not called a wrong address', async ({ page }) => {
  let mailStatus = 'failed';
  await page.route('**/api/store/order', (r) => r.fulfill({ json: paid({ email: 'buyer@gmail.com', mailStatus }) }));
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-bounced]')).toContainText('has not gone out yet. We will keep trying');
  mailStatus = 'complained';
  await page.reload();
  await expect(page.locator('[data-st-sent]')).toBeVisible();
  await expect(page.locator('[data-st-bounced]')).toBeHidden();
});

test('a bounce is said plainly and the correction is open; a refusal is explained', async ({ page }) => {
  await page.route('**/api/store/order', (r) => r.fulfill({ json: paid({ email: 'buyer@gmial.com', canChangeEmail: true, mailStatus: 'bounced' }) }));
  await page.route('**/api/store/email', (r) => r.fulfill({ status: 409, json: { ok: false, error: 'not-allowed' } }));
  await page.goto(`/hi/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-bounced]')).toContainText('buyer@gmial.com पर हमारा ईमेल नहीं पहुँच सका');
  await expect(page.locator('#st-email')).toBeVisible();
  await page.locator('#st-email').fill('right@gmail.com');
  await page.locator('[data-st-change-send]').click();
  await expect(page.locator('[data-st-change-status]')).toContainText('दोबारा नहीं बदल सकता');
});

test('no correction offered once it is used or the time is up; no email: "want it by email too?"', async ({ page }) => {
  await page.route('**/api/store/order', (r) => r.fulfill({ json: paid({ email: 'buyer@gmail.com', canChangeEmail: false }) }));
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-sent]')).toBeVisible();
  await expect(page.locator('[data-st-change]')).toBeHidden();
  await page.unroute('**/api/store/order');
  await page.route('**/api/store/order', (r) => r.fulfill({ json: paid({ emailed: false, email: '', canChangeEmail: true }) }));
  await page.reload();
  await expect(page.locator('[data-st-sent]')).toBeHidden();
  await expect(page.locator('[data-st-change-summary]')).toHaveText('Want the link by email too?');
});

test('"Lost your download link?" is on the download page only; the product page links to it', async ({ page }) => {
  await page.goto('/store/kruti-dev-7-day-starter/');
  await expect(page.locator('[data-store-find]')).toHaveCount(0);
  await page.locator('[data-sb-bought]').click();
  await expect(page).toHaveURL(/\/store\/thanks\/#find$/);
  // No order link here, so the form is open and ready.
  await expect(page.locator('#sf-email')).toBeVisible();
});

test('the form says plainly what happened: sent, no purchase, closed, too many today', async ({ page }) => {
  let reply = { status: 200, json: { ok: true, found: 'sent' } };
  let body = null;
  await page.route('**/api/store/find', async (r) => {
    body = JSON.parse(r.request().postData());
    await r.fulfill(reply);
  });
  await page.goto('/store/thanks/#find');
  const status = page.locator('[data-sf-status]');
  await page.locator('#sf-email').fill('nope');
  await page.locator('[data-sf-send]').click();
  await expect(status).toBeVisible();
  expect(body).toBeNull();
  await page.locator('#sf-email').fill('Buyer@gmail.com');
  await page.locator('[data-sf-send]').click();
  await expect(status).toHaveText('Done. We sent your download link to buyer@gmail.com. Check your inbox and the spam folder.');
  expect(body.email).toBe('Buyer@gmail.com');
  reply = { status: 200, json: { ok: true, found: 'none' } };
  await page.locator('[data-sf-send]').click();
  await expect(status).toContainText('No paid purchase was found with this email');
  reply = { status: 200, json: { ok: true, found: 'closed' } };
  await page.locator('[data-sf-send]').click();
  await expect(status).toContainText('We found your purchase, but its download link has expired');
  reply = { status: 429, json: { ok: false, error: 'email-limit' } };
  await page.locator('[data-sf-send]').click();
  await expect(status).toContainText('3 times today');
});

test('with an order link the form stays folded; the page fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route('**/api/store/order', (r) => r.fulfill({ json: paid({ email: 'buyer@gmail.com', canChangeEmail: true }) }));
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-store-find]')).toBeVisible();
  await expect(page.locator('#sf-email')).toBeHidden();
  await page.locator('[data-st-change-summary]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

const receipt = { order: O, amount: 3900, currency: 'INR', paidAt: '2026-10-15T10:00:00Z', payment: 'pay_test1', refunded: 0 };
const RZP = `razorpay_payment_id=pay_test1&razorpay_payment_link_id=plink_1&razorpay_payment_link_reference_id=${O}&razorpay_payment_link_status=paid&razorpay_signature=${'ab'.repeat(32)}`;

test('back from Razorpay: the browser sends its checkout secret and Razorpay\'s signed return, and gets a receipt it can save', async ({ page }) => {
  let body = null;
  await page.route('**/api/store/confirm', async (r) => {
    body = JSON.parse(r.request().postData());
    await r.fulfill({ json: paid({ email: '', emailed: false, manage: M, receipt }) });
  });
  await page.goto('/store/');
  await page.evaluate((o) => localStorage.setItem('mkd-pending', JSON.stringify({ 'kruti-dev-7-day-starter': { o, c: 'a1'.repeat(16), at: Date.now() } })), O);
  await page.goto(`/store/thanks/?${RZP}`);
  await expect(page.locator('[data-st-status]')).toHaveText('Payment received. Thank you!');
  expect(body.order).toBe(O);
  expect(body.claim).toBe('a1'.repeat(16));
  expect(body.rzp).toEqual({ paymentId: 'pay_test1', linkId: 'plink_1', referenceId: O, status: 'paid', signature: 'ab'.repeat(32) });
  // The receipt, with the date in India time.
  const r = page.locator('[data-st-receipt]');
  await expect(r).toBeVisible();
  await expect(r).toContainText('₹39');
  await expect(r).toContainText('pay_test1');
  await expect(r).toContainText('15 October 2026');
  // The started payment is settled: no "payment in progress" reminder is left.
  expect(await page.evaluate(() => localStorage.getItem('mkd-pending'))).toBeNull();
  // No email: the recovery card is the buyer's copy of the link.
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('[data-st-card]').click()]);
  expect(file.suggestedFilename()).toBe(`mykrutidev-${O}.txt`);
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain(`/store/thanks/#o=${O}&t=${T}`);
  expect(text).toContain('Order number: ' + O);
  expect(text).not.toContain(M);
});

test('paid, but this browser did not pay: the keys are not handed out', async ({ page }) => {
  await page.route('**/api/store/confirm', (r) => r.fulfill({ json: { ok: true, state: 'paid', locked: true, emailed: true } }));
  await page.goto(`/store/thanks/?razorpay_payment_link_reference_id=${O}`);
  await expect(page.locator('[data-st-status]')).toHaveText('This payment is complete. The download link was emailed to the address given when paying.');
  await expect(page.locator('[data-st-download]')).toBeHidden();
});

test('a refunded order still shows why it closed, with its receipt', async ({ page }) => {
  await page.route('**/api/store/order', (r) => r.fulfill({ json: { ...paid({ state: 'refunded', remaining: 5 }), receipt: { ...receipt, refunded: 3900 } } }));
  await page.goto(`/store/thanks/#o=${O}&t=${T}`);
  await expect(page.locator('[data-st-status]')).toHaveText('This order was refunded, so the download is closed.');
  await expect(page.locator('[data-st-download]')).toBeHidden();
  await expect(page.locator('[data-st-receipt]')).toContainText('Refunded');
});

test('a payment started here and not confirmed: the product page says not to pay again, and Pay reuses the same page', async ({ page }) => {
  await page.route('**/api/store/confirm', (r) => r.fulfill({ json: { ok: true, state: 'pending' } }));
  let checkout = null;
  await page.route('**/api/store/checkout', async (r) => {
    if (r.request().method() !== 'POST') return r.fulfill({ json: { ok: true, open: true } });
    checkout = JSON.parse(r.request().postData());
    await r.fulfill({ status: 503, json: { ok: false, error: 'not-configured' } });
  });
  await page.goto('/store/kruti-dev-7-day-starter/');
  await expect(page.locator('[data-store-buy]')).toContainText('You get 5 downloads within 30 days of paying');
  await page.evaluate((o) => localStorage.setItem('mkd-pending', JSON.stringify({ 'kruti-dev-7-day-starter': { o, c: 'a1'.repeat(16), at: Date.now() - 60e3 } })), O);
  await page.reload();
  const box = page.locator('[data-sb-pending]');
  await expect(box).toBeVisible();
  await expect(box).toContainText('do not pay again');
  await expect(box.locator('a')).toHaveAttribute('href', `/store/thanks/?razorpay_payment_link_reference_id=${O}`);
  await page.locator('[data-sb-accept]').check();
  await page.locator('[data-sb-pay]').click();
  await expect.poll(() => checkout).not.toBeNull();
  expect(checkout.resume).toEqual({ order: O, claim: 'a1'.repeat(16) });
});

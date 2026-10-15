/**
 * The store's API and admin page, against a real local D1 database and R2
 * bucket (wrangler's getPlatformProxy). Razorpay and Resend are stood in for by
 * a fake fetch that records what the server sent and answers as they would.
 * The handlers are called directly with Requests, exactly as the Pages
 * Functions in functions/api/store do.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { PDFDocument } from 'pdf-lib';

import {
  downloadToken,
  manageToken,
  ensureStoreSchema,
  handleChangeEmail,
  handleFind,
  handleMailWebhook,
  handleCheckout,
  handleConfirm,
  handleDownload,
  handleOrderStatus,
  handleStoreConfig,
  handleWebhook,
  settleOrder,
} from './storeApi.js';
import { handleAdminOrders } from './storeAdmin.js';
import { handleReconcile, maybeReconcile, reconcile, RECONCILE_EVERY } from './storeJobs.js';
import { hmacHex, isPaidFor, verifyWebhook } from './razorpay.js';
import { buyerMail, ownerMail, verifyResendWebhook, waText } from './storeMail.js';
import { createHmac } from 'node:crypto';
import { PRODUCTS, STORE, ORDER_ID_RE } from '../src/lib/store.js';
import { prepare } from '../scripts/prepare-store-pdf.mjs';
import { STAMP_LEN, STAMP_SLOT, maskEmail, stampPdf, stampText } from './storeStamp.js';

let proxy;
let DB;
let FILES;
before(async () => {
  proxy = await getPlatformProxy({
    configPath: fileURLToPath(new URL('./wrangler.test.jsonc', import.meta.url)),
    persist: false,
  });
  DB = proxy.env.DB;
  FILES = proxy.env.STORE_FILES;
});
after(() => proxy?.dispose());

const PDF = new TextEncoder().encode('%PDF-1.4\n% a test file\n');
const WEBHOOK_SECRET = 'whsec_test_0123456789';
const ENV = () => ({
  DB,
  STORE_FILES: FILES,
  RAZORPAY_KEY_ID: 'rzp_test_abc123',
  RAZORPAY_KEY_SECRET: 'key-secret-xyz',
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STORE_TOKEN_SECRET: 'a-long-test-token-secret-0123456789',
  STORE_TEST_PRODUCTS: '1',
  ADMIN_KEY: 'a-long-test-admin-key-0123456789',
  RESEND_API_KEY: 're_test',
  NOTIFY_FROM: 'MyKrutiDev <contact@mykrutidev.com>',
  NOTIFY_TO: 'owner@example.com',
});
const PRODUCT = PRODUCTS.find((p) => p.id === 'sample-test');

/**
 * A stand-in for Razorpay and Resend. `razorpay.link` is what Razorpay says the
 * payment link looks like; `calls` and `mails` record what was sent.
 */
function fakeNet() {
  const net = {
    calls: [],
    mails: [],
    createFails: false,
    readFails: false,
    /** The buyer's mobile on Razorpay's payment record; null: the payment cannot be read. */
    contact: '+919876543210',
    /** What Razorpay says was refunded on the payment, in paise. */
    refunded: 0,
    link: { id: 'plink_test1', status: 'created', amount: PRODUCT.pricePaise, amount_paid: 0, currency: 'INR', reference_id: null },
    fetch: async (url, init = {}) => {
      const method = init.method ?? 'GET';
      if (url.startsWith('https://api.resend.com')) {
        net.mails.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: `re_mail_${net.mails.length}` }), { status: 200 });
      }
      net.calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
      if (method === 'POST' && url.endsWith('/v1/payment_links')) {
        if (net.createFails) return new Response(JSON.stringify({ error: { description: 'nope' } }), { status: 400 });
        const body = JSON.parse(init.body);
        net.link = { ...net.link, reference_id: body.reference_id, amount: body.amount, currency: body.currency };
        return new Response(JSON.stringify({ id: 'plink_test1', short_url: 'https://rzp.io/i/abc', ...net.link }), { status: 200 });
      }
      if (method === 'GET' && url.includes('/v1/payments/')) {
        if (net.contact === null) return new Response('{}', { status: 500 });
        return new Response(JSON.stringify({ id: 'pay_test1', contact: net.contact, amount: net.link.amount, amount_refunded: net.refunded }), { status: 200 });
      }
      if (method === 'GET' && url.includes('/v1/payment_links/')) {
        if (net.readFails) return new Response('{}', { status: 500 });
        return new Response(JSON.stringify(net.link), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    },
    pay(extra = {}) {
      net.link = { ...net.link, status: 'paid', amount_paid: net.link.amount, payments: [{ payment_id: 'pay_test1', amount: net.link.amount, status: 'captured' }], ...extra };
    },
  };
  return net;
}

let ipN = 0;
const post = (path, body, { ip = `203.0.113.${++ipN}`, type = 'application/json', raw } = {}) =>
  // A preview deployment: the tests use Razorpay TEST keys, which the live site refuses.
  new Request(`https://test.mykrutidev.pages.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'CF-Connecting-IP': ip },
    body: raw ?? JSON.stringify(body),
  });

const good = { productId: 'sample-test', email: 'Buyer@Example.com', accept: true, lang: 'hi' };
const orders = async () => (await DB.prepare('SELECT * FROM orders ORDER BY created_at, id').all()).results;

beforeEach(async () => {
  await ensureStoreSchema(DB);
  await DB.batch(['orders', 'feedback_rate', 'store_meta', 'store_events', 'store_audit'].map((t) => DB.prepare(`DELETE FROM ${t}`)));
  for (const o of (await FILES.list()).objects) await FILES.delete(o.key);
});

/** The checkout secret each test order's browser was given, by order id. */
const CLAIMS = new Map();
/** An order that went through checkout; returns its id (its secret is in CLAIMS). */
async function startOrder(net, env = ENV(), body = good) {
  const r = await handleCheckout(post('/api/store/checkout', body), env, { fetch: net.fetch });
  assert.equal(r.status, 201);
  const out = await r.json();
  CLAIMS.set(out.order, out.claim);
  return out.order;
}
/** What the buying browser sends to /api/store/confirm. */
const asBuyer = (id) => ({ order: id, claim: CLAIMS.get(id) });

describe('POST /api/store/checkout', () => {
  test('starts an order: Razorpay link made from OUR price and OUR reference, the buyer sent to it', async () => {
    const net = fakeNet();
    const r = await handleCheckout(post('/api/store/checkout', { ...good, price: 1, amount: 1, pricePaise: 1 }), ENV(), { fetch: net.fetch, now: Date.UTC(2026, 9, 14, 10, 0, 0) });
    assert.equal(r.status, 201);
    const out = await r.json();
    assert.equal(out.url, 'https://rzp.io/i/abc');
    assert.match(out.order, ORDER_ID_RE);

    const [row] = await orders();
    assert.deepEqual(
      [row.id, row.status, row.product_id, row.amount, row.currency, row.email, row.lang, row.link_id, row.max_downloads],
      [out.order, 'created', 'sample-test', PRODUCT.pricePaise, 'INR', 'buyer@example.com', 'hi', 'plink_test1', STORE.maxDownloads],
    );

    const [call] = net.calls;
    assert.equal(call.url, 'https://api.razorpay.com/v1/payment_links');
    assert.equal(call.auth, `Basic ${btoa('rzp_test_abc123:key-secret-xyz')}`);
    assert.equal(call.body.amount, PRODUCT.pricePaise, 'the amount is the catalog price, not the one the browser sent');
    assert.equal(call.body.reference_id, out.order);
    assert.equal(call.body.currency, 'INR');
    assert.equal(call.body.accept_partial, false);
    assert.deepEqual(call.body.notify, { sms: false, email: false });
    assert.equal(call.body.reminder_enable, false);
    assert.equal(call.body.customer.email, 'buyer@example.com');
    // Back in the buyer's own language (good.lang is hi).
    assert.equal(call.body.callback_url, 'https://test.mykrutidev.pages.dev/hi/store/thanks');
    assert.equal(call.body.callback_method, 'get');
    assert.equal(call.body.expire_by, Math.floor(Date.UTC(2026, 9, 14, 10, 0, 0) / 1000) + STORE.linkMinutes * 60);
  });

  test('a preview deployment sends the buyer back to itself, an unknown host to the live site', async () => {
    const net = fakeNet();
    const preview = new Request('https://claude-store.mykrutidev.pages.dev/api/store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.1' },
      body: JSON.stringify(good),
    });
    await handleCheckout(preview, ENV(), { fetch: net.fetch });
    assert.equal(net.calls[0].body.callback_url, 'https://claude-store.mykrutidev.pages.dev/hi/store/thanks');

    const other = new Request('https://evil.example/api/store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.2' },
      body: JSON.stringify(good),
    });
    await handleCheckout(other, ENV(), { fetch: net.fetch });
    assert.equal(net.calls[1].body.callback_url, 'https://mykrutidev.com/hi/store/thanks');
  });

  test('the live site refuses Razorpay TEST keys: nobody can "pay" there with a test card', async () => {
    const net = fakeNet();
    const live = (body, ip) =>
      new Request('https://mykrutidev.com/api/store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body),
      });
    const r = await handleCheckout(live(good, '198.51.100.9'), ENV(), { fetch: net.fetch });
    assert.equal(r.status, 503);
    assert.equal(net.calls.length, 0, 'Razorpay is not even asked');
    assert.equal((await orders()).length, 0);
    const www = await handleCheckout(new Request('https://www.mykrutidev.com/api/store/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(good) }), ENV(), { fetch: net.fetch });
    assert.equal(www.status, 503);
    assert.equal((await handleStoreConfig(ENV(), new Request('https://mykrutidev.com/api/store/checkout')).json()).open, false);
    assert.equal((await handleStoreConfig(ENV(), new Request('https://test.mykrutidev.pages.dev/api/store/checkout')).json()).open, true);

    // With live keys the live site sells, but never a test product, whatever STORE_TEST_PRODUCTS says.
    const liveEnv = { ...ENV(), RAZORPAY_KEY_ID: 'rzp_live_abc123', STORE_TEST_PRODUCTS: '1' };
    const t = await handleCheckout(live(good, '198.51.100.10'), liveEnv, { fetch: net.fetch });
    assert.equal(t.status, 404);
    assert.equal(net.calls.length, 0);
  });

  test('says not-configured until the keys, the token secret and the database are there', async () => {
    for (const drop of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'STORE_TOKEN_SECRET', 'DB']) {
      const env = ENV();
      delete env[drop];
      const r = await handleCheckout(post('/api/store/checkout', good), env, { fetch: fakeNet().fetch });
      assert.equal(r.status, 503, drop);
    }
    assert.equal((await handleCheckout(post('/api/store/checkout', good), { ...ENV(), STORE_TOKEN_SECRET: 'short' })).status, 503);
    assert.deepEqual(await handleStoreConfig({}).json(), { ok: true, open: false, turnstileSiteKey: null });
    assert.equal((await handleStoreConfig(ENV()).json()).open, true);
  });

  test('refuses a bad email, no agreement, an unknown or unsold product, a honeypot, a non-JSON body', async () => {
    const net = fakeNet();
    const run = (body, opts, env = ENV()) => handleCheckout(post('/api/store/checkout', body, opts), env, { fetch: net.fetch });
    assert.equal((await run({ ...good, email: 'not-an-email' })).status, 400);
    assert.equal((await run({ ...good, accept: false })).status, 400);
    assert.equal((await run({ ...good, accept: 'yes' })).status, 400);
    assert.equal((await run({ ...good, productId: 'nothing' })).status, 404);
    assert.equal((await run({ ...good, productId: undefined })).status, 400);
    assert.equal((await run(good, {}, { ...ENV(), STORE_TEST_PRODUCTS: '' })).status, 404, 'the test product is not for sale on the live site');
    assert.equal((await run({ ...good, website: 'http://spam' })).status, 400);
    assert.equal((await run(null, { raw: 'not json' })).status, 400);
    assert.equal((await run(null, { type: 'text/plain', raw: 'x' })).status, 415);
    assert.equal((await run(null, { raw: 'x'.repeat(5000) })).status, 413);
    assert.equal(net.calls.length, 0, 'Razorpay was never asked');
    assert.equal((await orders()).length, 0, 'no order row for any of them');
  });

  test('the email is optional: an order without one is made, and Razorpay is not given a customer', async () => {
    const net = fakeNet();
    const r = await handleCheckout(post('/api/store/checkout', { ...good, email: '' }), ENV(), { fetch: net.fetch });
    assert.equal(r.status, 201);
    const [row] = await orders();
    assert.equal(row.email, '');
    assert.equal(net.calls[0].body.customer, undefined);
    // a typed email must still look like one
    assert.equal((await handleCheckout(post('/api/store/checkout', { ...good, email: 'nope' }), ENV(), { fetch: net.fetch })).status, 400);
  });

  test('is rate limited per IP', async () => {
    const net = fakeNet();
    for (let i = 0; i < STORE.checkoutPerHour; i++) {
      assert.equal((await handleCheckout(post('/api/store/checkout', good, { ip: '198.51.100.77' }), ENV(), { fetch: net.fetch })).status, 201);
    }
    const r = await handleCheckout(post('/api/store/checkout', good, { ip: '198.51.100.77' }), ENV(), { fetch: net.fetch });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('Retry-After')) > 0);
    assert.equal((await handleCheckout(post('/api/store/checkout', good, { ip: '198.51.100.78' }), ENV(), { fetch: net.fetch })).status, 201);
  });

  test('asks Turnstile when it is set up', async () => {
    const net = fakeNet();
    const env = { ...ENV(), TURNSTILE_SECRET_KEY: 'ts-secret' };
    const seen = [];
    const verify = async (token, secret) => (seen.push([token, secret]), token === 'good');
    assert.equal((await handleCheckout(post('/api/store/checkout', good), env, { fetch: net.fetch, verify })).status, 403);
    assert.equal((await handleCheckout(post('/api/store/checkout', { ...good, token: 'bad' }), env, { fetch: net.fetch, verify })).status, 403);
    assert.equal((await handleCheckout(post('/api/store/checkout', { ...good, token: 'good' }), env, { fetch: net.fetch, verify })).status, 201);
    assert.deepEqual(seen, [['bad', 'ts-secret'], ['good', 'ts-secret']]);
  });

  test('when Razorpay refuses, the buyer gets an error and the order is marked failed', async () => {
    const net = fakeNet();
    net.createFails = true;
    const r = await handleCheckout(post('/api/store/checkout', good), ENV(), { fetch: net.fetch });
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error, 'payment-provider');
    assert.deepEqual((await orders()).map((o) => o.status), ['failed']);
  });

  test('orders nobody paid are deleted after a week, with their emails; paid ones stay', async () => {
    const net = fakeNet();
    const old = Date.UTC(2026, 9, 1);
    await handleCheckout(post('/api/store/checkout', good), ENV(), { fetch: net.fetch, now: old });
    await DB.prepare("UPDATE orders SET status = 'paid' WHERE 1 = 1").run();
    await handleCheckout(post('/api/store/checkout', { ...good, email: 'unpaid@example.com' }), ENV(), { fetch: net.fetch, now: old + 1000 });
    assert.equal((await orders()).length, 2);
    await handleCheckout(post('/api/store/checkout', { ...good, email: 'new@example.com' }), ENV(), { fetch: net.fetch, now: old + (STORE.unpaidDays + 1) * 864e5 });
    const left = (await orders()).map((o) => o.email).sort();
    assert.deepEqual(left, ['buyer@example.com', 'new@example.com']);
  });
});

describe('settling an order: only Razorpay saying "paid" counts', () => {
  test('pending until the link is paid, then paid once, with the downloads set and both emails sent once', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    const now = Date.UTC(2026, 9, 14, 12, 0, 0);

    let r = await settleOrder(ENV(), id, { fetch: net.fetch, now });
    assert.equal(r.state, 'pending');

    net.pay();
    r = await settleOrder(ENV(), id, { fetch: net.fetch, now });
    assert.equal(r.state, 'paid');
    const [row] = await orders();
    assert.equal(row.status, 'paid');
    assert.equal(row.payment_id, 'pay_test1');
    assert.equal(row.paid_at, '2026-10-14T12:00:00Z');
    assert.equal(row.expires_at, Math.floor(now / 1000) + STORE.downloadDays * 86400);
    assert.equal(row.mail_status, 'sent');
    assert.equal(net.mails.length, 2, 'the buyer and the owner');
    assert.deepEqual(net.mails.map((m) => m.to), [['buyer@example.com'], ['owner@example.com']]);

    // Asked again - by the thanks page, the webhook, a refresh - nothing is sent twice.
    await settleOrder(ENV(), id, { fetch: net.fetch, now });
    await Promise.all([1, 2, 3].map(() => settleOrder(ENV(), id, { fetch: net.fetch, now })));
    assert.equal(net.mails.length, 2);
  });

  test('two calls at the same moment settle it once', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    await Promise.all(Array.from({ length: 6 }, () => settleOrder(ENV(), id, { fetch: net.fetch })));
    assert.equal(net.mails.length, 2);
    assert.equal((await orders())[0].status, 'paid');
  });

  test('a link paid for another amount or another order does not count', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay({ amount_paid: 50 });
    assert.equal((await settleOrder(ENV(), id, { fetch: net.fetch })).state, 'pending');
    net.pay({ reference_id: 'oaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal((await settleOrder(ENV(), id, { fetch: net.fetch })).state, 'pending');
    net.pay({ currency: 'USD' });
    assert.equal((await settleOrder(ENV(), id, { fetch: net.fetch })).state, 'pending');
    assert.equal((await orders())[0].status, 'created');
    assert.equal(net.mails.length, 0);
  });

  test('isPaidFor: a "paid" answer missing its reference, currency or amount paid does not count', () => {
    const order = { id: 'oaaaaaaaaaaaaaaaaaaaaaaaaa', amount: 3900, currency: 'INR' };
    const paid = { status: 'paid', reference_id: order.id, currency: 'INR', amount: 3900, amount_paid: 3900 };
    assert.equal(isPaidFor(paid, order), true);
    for (const drop of ['reference_id', 'currency', 'amount_paid', 'amount']) {
      const link = { ...paid };
      delete link[drop];
      assert.equal(isPaidFor(link, order), false, drop);
    }
    assert.equal(isPaidFor({ ...paid, reference_id: null }, order), false);
    assert.equal(isPaidFor({ ...paid, amount_paid: 100 }, order), false, 'a part payment');
    assert.equal(isPaidFor({ ...paid, status: 'partially_paid' }, order), false);
  });

  test('isPaidFor: only status "paid" for the exact amount, currency and reference', () => {
    const order = { id: 'o1', amount: 19900, currency: 'INR' };
    const paid = { status: 'paid', amount: 19900, amount_paid: 19900, currency: 'INR', reference_id: 'o1' };
    assert.equal(isPaidFor(paid, order), true);
    for (const bad of [{ status: 'created' }, { status: 'partially_paid' }, { status: 'expired' }, { amount_paid: 100 }, { reference_id: 'o2' }, { currency: 'USD' }]) {
      assert.equal(isPaidFor({ ...paid, ...bad }, order), false, JSON.stringify(bad));
    }
    assert.equal(isPaidFor(null, order), false);
  });

  test('if Razorpay cannot be reached the answer is "unverified", never "paid"', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.readFails = true;
    assert.equal((await settleOrder(ENV(), id, { fetch: net.fetch })).state, 'unverified');
    assert.equal((await orders())[0].status, 'created');
  });

  test('without a mail setup the order is still paid, and the mail is marked off', async () => {
    const net = fakeNet();
    const env = { ...ENV(), RESEND_API_KEY: '', NOTIFY_FROM: '' };
    const id = await startOrder(net, env);
    net.pay();
    assert.equal((await settleOrder(env, id, { fetch: net.fetch })).state, 'paid');
    assert.equal((await orders())[0].mail_status, 'off');
    assert.equal(net.mails.length, 0);
  });

  test('the owner is not mailed when NOTIFY_TO is empty, and a refused mail is marked failed', async () => {
    const net = fakeNet();
    const env = { ...ENV(), NOTIFY_TO: '' };
    const id = await startOrder(net, env);
    net.pay();
    await settleOrder(env, id, { fetch: net.fetch });
    assert.equal(net.mails.length, 1);

    const net2 = fakeNet();
    const failing = async (url, init) => (url.startsWith('https://api.resend.com') ? new Response('{}', { status: 422 }) : net2.fetch(url, init));
    const id2 = await startOrder(net2);
    net2.pay();
    await settleOrder(ENV(), id2, { fetch: failing });
    assert.equal((await DB.prepare('SELECT mail_status FROM orders WHERE id = ?').bind(id2).first()).mail_status, 'failed');
  });
});

describe('POST /api/store/confirm', () => {
  test('the buyer is back: pending, then paid with a token and the downloads left', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    const confirm = (body = asBuyer(id)) => handleConfirm(post('/api/store/confirm', body), ENV(), { fetch: net.fetch });

    assert.deepEqual(await (await confirm()).json(), { ok: true, state: 'pending' });
    net.pay();
    const r = await confirm();
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.state, 'paid');
    assert.equal(out.productId, 'sample-test');
    assert.equal(out.remaining, STORE.maxDownloads);
    assert.equal(out.token, await downloadToken(ENV(), id));
    assert.match(out.token, /^[0-9a-f]{64}$/);
    assert.match(out.manage, /^[0-9a-f]{64}$/, 'the buying browser also gets the management key');
    assert.deepEqual(out.receipt, { order: id, amount: PRODUCT.pricePaise, currency: 'INR', paidAt: out.receipt.paidAt, payment: 'pay_test1', refunded: 0 });
    // Again (a refresh): the same keys.
    const again = await (await confirm()).json();
    assert.deepEqual([again.token, again.manage, again.remaining], [out.token, out.manage, out.remaining]);
  });

  test('paid, but the order id alone unlocks nothing: no keys without the checkout secret or Razorpay\'s signed return', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    const run = (body) => handleConfirm(post('/api/store/confirm', body), ENV(), { fetch: net.fetch }).then((r) => r.json());
    assert.deepEqual(await run({ order: id }), { ok: true, state: 'paid', locked: true, emailed: true });
    assert.deepEqual(await run({ order: id, claim: 'f'.repeat(32) }), { ok: true, state: 'paid', locked: true, emailed: true });
    // A forged return signature does not count either.
    const fake = { paymentId: 'pay_test1', linkId: 'plink_test1', referenceId: id, status: 'paid', signature: 'a'.repeat(64) };
    assert.equal((await run({ order: id, rzp: fake })).locked, true);
    // Razorpay's real signature (HMAC of link|reference|status|payment with our API secret) does: another browser after a UPI app switch.
    const signature = await hmacHex(ENV().RAZORPAY_KEY_SECRET, `plink_test1|${id}|paid|pay_test1`);
    const ok = await run({ order: id, rzp: { ...fake, signature } });
    assert.equal(ok.token, await downloadToken(ENV(), id));
    // ...but only for this order and this payment.
    const other = await hmacHex(ENV().RAZORPAY_KEY_SECRET, `plink_test1|${id}|paid|pay_other`);
    assert.equal((await run({ order: id, rzp: { ...fake, paymentId: 'pay_other', signature: other } })).locked, true);
  });

  test('paid without an email: no mail to the buyer, the owner is told, and the page is told to say "save this link"', async () => {
    const net = fakeNet();
    const env = { ...ENV(), RESEND_API_KEY: 're_test', NOTIFY_FROM: 'MyKrutiDev <contact@mykrutidev.com>', NOTIFY_TO: 'owner@example.com' };
    const id = await startOrder(net, env, { ...good, email: '' });
    net.pay();
    const r = await handleConfirm(post('/api/store/confirm', asBuyer(id)), env, { fetch: net.fetch });
    const out = await r.json();
    assert.equal(out.state, 'paid');
    assert.equal(out.emailed, false);
    assert.equal(net.mails.length, 1, 'only the owner is mailed');
    assert.deepEqual(net.mails[0].to, ['owner@example.com']);
    assert.match(net.mails[0].text, /none given/);
    assert.equal(net.mails[0].reply_to, undefined);
    assert.equal((await orders())[0].mail_status, 'none');
  });

  test('paid with an email: the answer says it was emailed', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    const out = await (await handleConfirm(post('/api/store/confirm', asBuyer(id)), ENV(), { fetch: net.fetch })).json();
    assert.equal(out.emailed, true);
  });

  test('an unknown or malformed order id is refused', async () => {
    const net = fakeNet();
    const run = (body) => handleConfirm(post('/api/store/confirm', body), ENV(), { fetch: net.fetch });
    assert.equal((await run({ order: 'oaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 404);
    assert.equal((await run({ order: 'x' })).status, 400);
    assert.equal((await run({})).status, 400);
    assert.equal((await run({ order: ['a'] })).status, 400);
  });

  test('a made-up razorpay_* callback cannot unlock anything: only the real order id is read, and Razorpay is asked', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    const r = await handleConfirm(
      post('/api/store/confirm', { order: id, razorpay_payment_id: 'pay_fake', razorpay_payment_link_status: 'paid', razorpay_signature: 'x' }),
      ENV(),
      { fetch: net.fetch },
    );
    assert.deepEqual(await r.json(), { ok: true, state: 'pending' });
    assert.equal((await orders())[0].status, 'created');
  });
});

describe('POST /api/store/webhook', () => {
  const send = async (event, { secret = WEBHOOK_SECRET, sign = true, net } = {}) => {
    const raw = JSON.stringify(event);
    const headers = { 'Content-Type': 'application/json' };
    if (sign) headers['X-Razorpay-Signature'] = await hmacHex(secret, raw);
    return handleWebhook(new Request('https://mykrutidev.com/api/store/webhook', { method: 'POST', headers, body: raw }), ENV(), { fetch: net?.fetch });
  };
  const paidEvent = (id) => ({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_test1', reference_id: id, status: 'paid' } } } });

  test('a signed payment_link.paid settles the order even if the buyer never came back', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    const r = await send(paidEvent(id), { net });
    assert.equal(r.status, 200);
    assert.equal((await orders())[0].status, 'paid');
    assert.equal(net.mails.length, 2);
  });

  test('refuses a wrong or missing signature, and changes nothing', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    assert.equal((await send(paidEvent(id), { secret: 'other-secret', net })).status, 400);
    assert.equal((await send(paidEvent(id), { sign: false, net })).status, 400);
    assert.equal((await orders())[0].status, 'created');
  });

  test('a signed event is still checked with Razorpay: a "paid" webhook for an unpaid link settles nothing', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    assert.equal((await send(paidEvent(id), { net })).status, 200);
    assert.equal((await orders())[0].status, 'created');
  });

  test('events for unknown orders and other events are acknowledged and ignored', async () => {
    const net = fakeNet();
    assert.equal((await send(paidEvent('oaaaaaaaaaaaaaaaaaaaaaaaa'), { net })).status, 200);
    assert.equal((await send({ event: 'payment.failed', payload: {} }, { net })).status, 200);
    assert.equal((await send({ event: 'payment_link.paid', payload: {} }, { net })).status, 200);
  });

  test('a full refund ends the downloads; a partial one does not', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const refund = (amount) => ({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_test1', amount } } } });
    await send(refund(PRODUCT.pricePaise - 1), { net });
    assert.equal((await orders())[0].status, 'paid');
    await send(refund(PRODUCT.pricePaise), { net });
    assert.equal((await orders())[0].status, 'refunded');
  });

  test('verifyWebhook is the HMAC-SHA256 hex of the raw body', async () => {
    const sig = await hmacHex('s3cret', '{"a":1}');
    assert.match(sig, /^[0-9a-f]{64}$/);
    assert.equal(await verifyWebhook('{"a":1}', sig, 's3cret'), true);
    assert.equal(await verifyWebhook('{"a":1}', sig.toUpperCase(), 's3cret'), true);
    assert.equal(await verifyWebhook('{"a": 1}', sig, 's3cret'), false);
    assert.equal(await verifyWebhook('{"a":1}', sig, 'other'), false);
    assert.equal(await verifyWebhook('{"a":1}', '', 's3cret'), false);
    assert.equal(await verifyWebhook('{"a":1}', sig, ''), false);
  });

  test('says not-configured without the webhook secret', async () => {
    const env = { ...ENV(), RAZORPAY_WEBHOOK_SECRET: '' };
    const r = await handleWebhook(new Request('https://mykrutidev.com/api/store/webhook', { method: 'POST', body: '{}' }), env);
    assert.equal(r.status, 503);
  });
});

describe('download', () => {
  /** A paid order whose file is in the bucket. Returns { id, token }. */
  async function paid(opts = {}) {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch, now: opts.now });
    if (opts.file !== false) await FILES.put(PRODUCT.file, PDF);
    return { id, token: await downloadToken(ENV(), id) };
  }
  const download = (id, token, deps) => {
    const form = new FormData();
    form.set('o', id);
    form.set('t', token);
    return handleDownload(new Request('https://mykrutidev.com/api/store/download', { method: 'POST', headers: { 'CF-Connecting-IP': `192.0.2.${++ipN}` }, body: form }), ENV(), deps);
  };
  const left = async (id) => (await DB.prepare('SELECT downloads FROM orders WHERE id = ?').bind(id).first()).downloads;

  test('hands over the PDF with download headers and counts one', async () => {
    const { id, token } = await paid();
    const r = await download(id, token);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'application/pdf');
    assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="mykrutidev-sample.pdf"');
    assert.match(r.headers.get('Cache-Control'), /no-store/);
    assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF);
    assert.equal(await left(id), 1);
  });

  /** A small real PDF with a stamp slot on every page, as scripts/prepare-store-pdf.mjs makes it. */
  async function preparedPdf(pages = 3) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
    return prepare(await doc.save());
  }
  const text = (bytes) => new TextDecoder('latin1').decode(bytes);

  test('a stamped product: each buyer gets their own copy, with their stamp on every page', async () => {
    const file = await preparedPdf(3);
    assert.equal(text(file).split(STAMP_SLOT).length - 1, 3, 'one slot per page in the prepared file');
    const a = await paid({ file: false });
    await FILES.put(PRODUCT.file, file);
    const copyA = new Uint8Array(await (await download(a.id, a.token)).arrayBuffer());

    // a second buyer, another email
    const net = fakeNet();
    const r0 = await handleCheckout(post('/api/store/checkout', { ...good, email: 'asha.verma@example.org' }), ENV(), { fetch: net.fetch });
    const idB = (await r0.json()).order;
    net.pay();
    await settleOrder(ENV(), idB, { fetch: net.fetch });
    const copyB = new Uint8Array(await (await download(idB, await downloadToken(ENV(), idB))).arrayBuffer());

    for (const [copy, id, who] of [[copyA, a.id, 'bu***@example.com'], [copyB, idB, 'as***@example.org']]) {
      const t = text(copy);
      assert.equal(copy.length, file.length, 'the file is the same size: nothing moved');
      assert.ok(!t.includes(STAMP_SLOT), 'no empty slot is left');
      assert.equal(t.split(`Licensed to ${who} - Order ${id.slice(0, 12)}`).length - 1, 3, 'the stamp is on all 3 pages');
      assert.equal((await PDFDocument.load(copy)).getPageCount(), 3, 'still a valid PDF');
    }
    assert.notDeepEqual(copyA, copyB, 'two buyers do not get the same bytes');
    assert.ok(!text(copyA).includes('asha'), 'one buyer\'s address is never in another\'s copy');
    // the file in the bucket is untouched
    assert.deepEqual(new Uint8Array(await (await FILES.get(PRODUCT.file)).arrayBuffer()), file);
  });

  test('a stamped copy for an order with no email says so, without an address', async () => {
    await FILES.put(PRODUCT.file, await preparedPdf(1));
    const net = fakeNet();
    const r0 = await handleCheckout(post('/api/store/checkout', { ...good, email: '' }), ENV(), { fetch: net.fetch });
    const id = (await r0.json()).order;
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const copy = new Uint8Array(await (await download(id, await downloadToken(ENV(), id))).arrayBuffer());
    assert.ok(text(copy).includes(`Licensed copy - Order ${id.slice(0, 12)}`));
  });

  test('stamp text: masked address, printable ASCII only, always the length of the slot', () => {
    assert.equal(maskEmail('rahul.sharma@gmail.com'), 'ra***@gmail.com');
    assert.equal(maskEmail('a@b.in'), 'a***@b.in');
    assert.equal(maskEmail('nonsense'), '');
    const t = stampText({ id: 'o' + 'x'.repeat(24), email: 'हिंदी(x)\\@example.com' });
    assert.equal(t.length, STAMP_LEN);
    assert.match(t, /^[\x20-\x7e]+$/);
    assert.doesNotMatch(t, /[()\\]/);
    // a file with no slot is reported as such, and is not changed
    const plain = new TextEncoder().encode('%PDF-1.4 no slot here');
    const before = new Uint8Array(plain);
    assert.equal(stampPdf(plain, stampText({ id: 'oabc' })).count, 0);
    assert.deepEqual(plain, before);
  });

  test('stops after the limit: five download SESSIONS, each one at least a session apart', async () => {
    const { id, token } = await paid();
    const t0 = Date.now();
    const gap = (STORE.sessionMinutes + 1) * 60e3;
    for (let i = 0; i < STORE.maxDownloads; i++) assert.equal((await download(id, token, { now: t0 + i * gap })).status, 200);
    const r = await download(id, token, { now: t0 + STORE.maxDownloads * gap });
    assert.equal(r.status, 410);
    assert.match(await r.text(), /no longer available/);
    assert.equal(await left(id), STORE.maxDownloads);
  });

  test('taps, retries and a dropped transfer within one session cost one download', async () => {
    const { id, token } = await paid();
    const t0 = Date.now();
    for (const dt of [0, 1e3, 5e3, 60e3, (STORE.sessionMinutes - 1) * 60e3]) {
      assert.equal((await download(id, token, { now: t0 + dt })).status, 200);
    }
    assert.equal(await left(id), 1);
    // After the session ends, the next tap is a new session.
    await download(id, token, { now: t0 + (STORE.sessionMinutes + 1) * 60e3 });
    assert.equal(await left(id), 2);
  });

  test('the last download, clicked five times at once: one session, all served, the counter never past the limit', async () => {
    const { id, token } = await paid();
    await DB.prepare('UPDATE orders SET downloads = ? WHERE id = ?').bind(STORE.maxDownloads - 1, id).run();
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 5 }, () => download(id, token, { now })));
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200, 200]);
    assert.equal(await left(id), STORE.maxDownloads);
    // Used up: a new session later is refused.
    assert.equal((await download(id, token, { now: now + (STORE.sessionMinutes + 1) * 60e3 })).status, 410);
  });

  test('stops when the link has expired, when the order is refunded, or when it was never paid', async () => {
    const expired = await paid({ now: Date.now() - (STORE.downloadDays + 1) * 864e5 });
    assert.equal((await download(expired.id, expired.token)).status, 410);

    const refunded = await paid();
    await DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").bind(refunded.id).run();
    assert.equal((await download(refunded.id, refunded.token)).status, 410);

    const net = fakeNet();
    const unpaid = await startOrder(net);
    assert.equal((await download(unpaid, await downloadToken(ENV(), unpaid))).status, 410);
  });

  test('refuses a wrong token, another order\'s token, and a malformed request', async () => {
    const a = await paid();
    const b = await paid();
    assert.equal((await download(a.id, 'f'.repeat(64))).status, 404);
    assert.equal((await download(a.id, b.token)).status, 404);
    assert.equal((await download(a.id, '')).status, 404);
    assert.equal((await download('x', a.token)).status, 404);
    const r = await handleDownload(new Request('https://mykrutidev.com/api/store/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), ENV());
    assert.equal(r.status, 400);
    assert.equal(await left(a.id), 0, 'none of that cost a download');
  });

  test('when the PDF is missing from the bucket the buyer is told, and no download is used up', async () => {
    const { id, token } = await paid({ file: false });
    const r = await download(id, token);
    assert.equal(r.status, 503);
    assert.equal(await left(id), 0);
  });

  test('a failure is a short page, not JSON', async () => {
    const { id } = await paid();
    const r = await download(id, 'f'.repeat(64));
    assert.match(r.headers.get('Content-Type'), /text\/html/);
    assert.match(await r.text(), /not valid/);
  });
});

describe('GET /api/store/order', () => {
  const status = (id, token, deps) =>
    handleOrderStatus(new Request(`https://mykrutidev.com/api/store/order?o=${id}&t=${token}`, { headers: { 'CF-Connecting-IP': `192.0.2.${++ipN}` } }), ENV(), deps);

  test('shows a paid order to the link\'s holder, without using a download', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const token = await downloadToken(ENV(), id);
    const r = await status(id, token);
    const out = await r.json();
    assert.equal(out.state, 'paid');
    assert.equal(out.remaining, STORE.maxDownloads);
    assert.equal(out.productId, 'sample-test');
    assert.equal((await DB.prepare('SELECT downloads FROM orders WHERE id = ?').bind(id).first()).downloads, 0);
  });

  test('says expired after the days are up, and refuses a wrong token', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const token = await downloadToken(ENV(), id);
    const later = Date.now() + (STORE.downloadDays + 1) * 864e5;
    assert.equal((await (await status(id, token, { now: later })).json()).state, 'expired');
    assert.equal((await status(id, 'f'.repeat(64))).status, 404);
  });
});

describe('emails', () => {
  test('the buyer\'s email has the link, the limits and the refund promise, in English and Hindi', () => {
    const order = { id: 'oabc', amount: 19900, email: 'b@example.com', max_downloads: 5 };
    const m = buyerMail({ NOTIFY_TO: 'owner@example.com, second@example.com' }, { order, product: PRODUCT, link: 'https://mykrutidev.com/store/thanks#o=oabc&t=tok' });
    assert.equal(m.to, 'b@example.com');
    assert.equal(m.replyTo, 'owner@example.com');
    assert.match(m.subject, /^Your download: /);
    assert.match(m.text, /https:\/\/mykrutidev\.com\/store\/thanks#o=oabc&t=tok/);
    assert.match(m.text, new RegExp(`${STORE.downloadDays} days`));
    assert.match(m.text, new RegExp(`within ${STORE.refundDays} days`));
    assert.match(m.text, /Rs 199/);
    assert.match(m.text, /[ऀ-ॿ]/);
    assert.doesNotMatch(m.text, /undefined|null/);
  });

  test('the owner\'s email names the buyer and the order, and replies go to the buyer', () => {
    const m = ownerMail({ NOTIFY_TO: 'a@example.com,b@example.com' }, { order: { id: 'oabc', amount: 100, email: 'b@example.com', payment_id: 'pay_1' }, product: PRODUCT });
    assert.deepEqual(m.to, ['a@example.com', 'b@example.com']);
    assert.equal(m.replyTo, 'b@example.com');
    assert.match(m.text, /oabc/);
    assert.match(m.text, /pay_1/);
  });
});

describe('/admin/orders', () => {
  const KEY = ENV().ADMIN_KEY;
  const req = (path = '/admin/orders', init = {}, authed = true) =>
    new Request(`https://mykrutidev.com${path}`, { ...init, headers: { ...(authed ? { Authorization: `Bearer ${KEY}` } : {}), ...init.headers } });
  const act = (action, id, headers = {}, extra = { sure: '1' }) => {
    const form = new URLSearchParams({ action, id, ...extra });
    return handleAdminOrders(req('/admin/orders', { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } }), ENV(), { fetch: net.fetch });
  };
  let net;
  beforeEach(() => {
    net = fakeNet();
  });

  test('is closed without the key, and not set up without ADMIN_KEY', async () => {
    const r = await handleAdminOrders(req('/admin/orders', {}, false), ENV());
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('Location'), '/admin/feedback');
    assert.equal((await handleAdminOrders(req(), { ...ENV(), ADMIN_KEY: '' })).status, 503);
    assert.equal((await handleAdminOrders(req(), { ...ENV(), DB: undefined })).status, 503);
  });

  test('a paid order shows its download link, and one without an email has no "Resend email"', async () => {
    const r0 = await handleCheckout(post('/api/store/checkout', { ...good, email: '' }), ENV(), { fetch: net.fetch });
    const id = (await r0.json()).order;
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const html = await (await handleAdminOrders(req(), ENV())).text();
    const token = await downloadToken(ENV(), id);
    assert.ok(html.includes(`/store/thanks#o=${id}&amp;t=${token}`) || html.includes(`/store/thanks#o=${id}&t=${token}`), 'the buyer\'s download page link is on the admin page');
    assert.match(html, /no email/);
    assert.doesNotMatch(html, /Resend email/);
  });

  test('lists orders with their status and totals, and escapes what buyers typed', async () => {
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    await DB.prepare("UPDATE orders SET email = ? WHERE id = ?").bind('<b>x</b>@example.com', id).run();
    const r = await handleAdminOrders(req(), ENV());
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /1<\/span><span class="fa-tile-l">paid orders/);
    assert.match(html, /test mode/);
    assert.match(html, /MyKrutiDev sample file/);
    assert.doesNotMatch(html, /<b>x<\/b>/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(r.headers.get('Content-Security-Policy'), /default-src 'none'/);
    assert.match(r.headers.get('X-Robots-Tag'), /noindex/);
  });

  test('the setup check says what is missing, including a PDF not yet uploaded', async () => {
    let html = await (await handleAdminOrders(req(), ENV())).text();
    assert.match(html, /fa-no">✗<\/span> PDF uploaded: test-sample\.pdf/);
    await FILES.put(PRODUCT.file, PDF);
    html = await (await handleAdminOrders(req(), ENV())).text();
    assert.match(html, /fa-ok">✓<\/span> PDF uploaded: test-sample\.pdf/);
    html = await (await handleAdminOrders(req(), { ...ENV(), RAZORPAY_WEBHOOK_SECRET: '' })).text();
    assert.match(html, /fa-no">✗<\/span> Razorpay webhook secret/);
  });

  test('CSV has every order and the same columns as the table', async () => {
    const id = await startOrder(net);
    const r = await handleAdminOrders(req('/admin/orders?format=csv'), ENV());
    assert.match(r.headers.get('Content-Type'), /text\/csv/);
    assert.match(r.headers.get('Content-Disposition'), /mykrutidev-orders-\d{4}-\d\d-\d\d\.csv/);
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'a BOM, so Excel opens it as UTF-8');
    const csv = new TextDecoder().decode(bytes);
    assert.match(csv, /^id,created_at,paid_at,status,product_id,amount,currency,email/);
    assert.match(csv, new RegExp(id));
  });

  test('check payment settles an order whose buyer never came back', async () => {
    const id = await startOrder(net);
    net.pay();
    const r = await act('check', id);
    assert.equal(r.status, 303);
    assert.equal((await orders())[0].status, 'paid');
  });

  test('resend sends the email again; close access ends the downloads; +30 days and reset are separate', async () => {
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const before = net.mails.length;
    await act('resend', id);
    assert.equal(net.mails.length, before + 1);
    assert.equal(net.mails.at(-1).to[0], 'buyer@example.com');

    await DB.prepare("UPDATE orders SET downloads = 5, expires_at = 1000, session_id = 's', session_at = 1 WHERE id = ?").bind(id).run();
    await act('extend', id);
    let [row] = await orders();
    assert.equal(row.downloads, 5, '+30 days leaves the downloads as they are');
    assert.ok(row.expires_at > Date.now() / 1000 + (STORE.downloadDays - 1) * 86400);
    await act('reset', id);
    [row] = await orders();
    assert.equal(row.downloads, 0);
    assert.equal(row.session_id, null);

    await act('refund', id);
    assert.equal((await orders())[0].status, 'refunded');
    const log = (await DB.prepare('SELECT action FROM store_audit WHERE order_id = ? ORDER BY id').bind(id).all()).results.map((r) => r.action);
    assert.deepEqual(log.filter((a) => a.startsWith('admin-')), ['admin-resend', 'admin-extend', 'admin-reset-downloads', 'admin-close-access']);
  });

  test('a form post from our own page with "Origin: null" (no-referrer) works, from elsewhere it does not', async () => {
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    assert.equal((await act('refund', id, { Origin: 'null' })).status, 403);
    assert.equal((await orders())[0].status, 'paid');
    assert.equal((await act('refund', id, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await act('refund', id, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' })).status, 303);
    assert.equal((await orders())[0].status, 'refunded');
  });

  test('a database error on an action shows its reason instead of a bare 1101', async () => {
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const broken = {
      ...ENV(),
      DB: new Proxy(DB, {
        get: (t, k) => (k === 'prepare' ? (sql) => (/^UPDATE orders SET status/.test(sql) ? { bind: () => ({ run: async () => { throw new Error('D1_ERROR: boom'); }, first: async () => { throw new Error('D1_ERROR: boom'); } }) } : t.prepare(sql)) : k === 'batch' ? t.batch.bind(t) : t[k]),
      }),
    };
    const form = new URLSearchParams({ action: 'refund', id, sure: '1' });
    const r = await handleAdminOrders(req('/admin/orders', { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), broken, { fetch: net.fetch });
    assert.equal(r.status, 500);
    assert.match(await r.text(), /That did not work \(refund\): D1_ERROR: boom/);
    assert.equal((await orders())[0].status, 'paid');
  });

  test('refuses a form from another site, and a made-up order id does nothing', async () => {
    const id = await startOrder(net);
    net.pay();
    const r = await act('check', id, { Origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    assert.equal((await orders())[0].status, 'created');
    assert.equal((await act('refund', "o'; DROP TABLE orders; --")).status, 303);
    assert.equal((await orders()).length, 1);
  });
});

describe('/admin/orders: the organised view', () => {
  const KEY = ENV().ADMIN_KEY;
  const get = (path, env = ENV(), host = 'https://test.mykrutidev.pages.dev', deps = {}) =>
    handleAdminOrders(new Request(`${host}${path}`, { headers: { Authorization: `Bearer ${KEY}` } }), env, deps).then((r) => r.text());
  /** An order row put straight into the database. */
  let n = 0;
  async function row({ status = 'paid', product = 'sample-test', email = 'a@example.com', created = '2026-10-10T10:00:00Z', paid = null, amount = 100, mail = 'sent', payment = null } = {}) {
    const A = 'abcdefghijklmnopqrstuvwxyz234567';
    let k = ++n;
    let id = '';
    for (let i = 0; i < 24; i++, k = Math.floor(k / 32)) id = A[k % 32] + id;
    id = `o${id}`;
    await DB.prepare(
      'INSERT INTO orders (id, created_at, paid_at, status, product_id, amount, currency, email, max_downloads, mail_status, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?, ?)',
    )
      .bind(id, created, paid ?? (status === 'paid' ? created : null), status, product, amount, 'INR', email, mail, payment)
      .run();
    return id;
  }

  test('money in today, 7 days, 30 days and all time, by India time; refunds and unpaid not counted', async () => {
    // 15 Oct 2026, 09:00 India time = 03:30 UTC. "Today" began at 14 Oct 18:30 UTC.
    const now = Date.parse('2026-10-15T03:30:00Z');
    await row({ paid: '2026-10-14T19:00:00Z', amount: 3900 }); // today (00:30 India time)
    await row({ paid: '2026-10-14T18:00:00Z', amount: 3900 }); // yesterday, India time
    await row({ paid: '2026-09-20T10:00:00Z', amount: 3900 }); // within 30 days
    await row({ paid: '2026-01-01T10:00:00Z', amount: 3900 }); // long ago
    await row({ status: 'refunded', paid: '2026-10-14T20:00:00Z', amount: 3900 });
    await row({ status: 'created', amount: 3900 });
    const html = await get('/admin/orders', ENV(), undefined, { now });
    const tiles = [...html.matchAll(/fa-tile-n">₹([\d,.]+) <span class="fa-sub">· (\d+)<\/span><\/span><span class="fa-tile-l">([^<]+)/g)].map((m) => [m[3], m[1], m[2]]);
    assert.deepEqual(tiles, [
      ['Today', '39', '1'],
      ['Last 7 days', '78', '2'],
      ['Last 30 days', '117', '3'],
      ['All time', '156', '4'],
    ]);
  });

  test('filters by status, product and a search for an order id, a payment id or part of an email', async () => {
    const a = await row({ email: 'ram@example.com', payment: 'pay_ABC123' });
    const b = await row({ status: 'created', email: 'shyam@example.com' });
    const c = await row({ status: 'refunded', email: 'sita_100%@example.com', product: 'kruti-dev-7-day-starter' });
    const ids = (html) => [a, b, c].filter((id) => html.includes(`>${id}<`) || html.includes(`>${id}<br>`));
    assert.deepEqual(ids(await get('/admin/orders')), [a, b, c]);
    assert.deepEqual(ids(await get('/admin/orders?status=paid')), [a]);
    assert.deepEqual(ids(await get('/admin/orders?status=created')), [b]);
    assert.deepEqual(ids(await get('/admin/orders?product=kruti-dev-7-day-starter')), [c]);
    assert.deepEqual(ids(await get(`/admin/orders?q=${b}`)), [b]);
    assert.deepEqual(ids(await get('/admin/orders?q=pay_ABC123')), [a]);
    assert.deepEqual(ids(await get('/admin/orders?q=SHYAM')), [b]);
    assert.deepEqual(ids(await get('/admin/orders?q=' + encodeURIComponent('_100%'))), [c], '% and _ are matched as themselves');
    assert.deepEqual(ids(await get('/admin/orders?q=' + encodeURIComponent('%'))), [c]);
    assert.deepEqual(ids(await get('/admin/orders?status=nonsense&product=nope')), [a, b, c], 'unknown filters are ignored');
    const html = await get('/admin/orders?q=pay_ABC123');
    assert.match(html, /href="https:\/\/dashboard\.razorpay\.com\/app\/payments\/pay_ABC123"/);
  });

  test('50 orders a page, newest first, with links to older and newer', async () => {
    for (let i = 0; i < 55; i++) await row({ created: `2026-10-10T10:${String(i).padStart(2, '0')}:00Z` });
    const first = await get('/admin/orders');
    assert.match(first, /1–50 of 55/);
    assert.match(first, /href="\?mode=test&amp;page=2">Older/);
    assert.equal((first.match(/<tr>\n  <td class="fa-nowrap">/g) || []).length, 50);
    const second = await get('/admin/orders?page=2');
    assert.match(second, /51–55 of 55/);
    assert.match(second, /2026-10-10 10:04/);
    assert.doesNotMatch(second, /2026-10-10 10:54/);
  });

  test('a paid order whose email failed is flagged and counted', async () => {
    await row({ mail: 'failed' });
    const html = await get('/admin/orders');
    assert.match(html, /<span class="fa-flag">failed<\/span>/);
    assert.match(html, /1<\/span><span class="fa-tile-l">paid, email not delivered/);
  });

  test('"Mark refunded" needs the box ticked; every action says what it did', async () => {
    const id = await row();
    assert.match(await get('/admin/orders'), /name="sure" value="1" required/);
    const form = (extra) =>
      handleAdminOrders(
        new Request('https://test.mykrutidev.pages.dev/admin/orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ action: 'refund', id, ...extra }),
        }),
        ENV(),
      );
    const no = await form({});
    assert.equal(no.headers.get('Location'), '/admin/orders?done=norefund');
    assert.equal((await orders())[0].status, 'paid');
    assert.match(await get('/admin/orders?done=norefund'), /Not refunded: tick &quot;sure&quot; first\./);
    const yes = await form({ sure: '1' });
    assert.equal(yes.headers.get('Location'), `/admin/orders?done=refund&q=${id}&mode=test`);
    assert.equal((await orders())[0].status, 'refunded');
    assert.match(await get(`/admin/orders?done=refund&q=${id}`), /Access closed: downloads are off/);
  });

  test('ready or not: says plainly whether this deployment can take payments, and why not', async () => {
    // A preview with a product on sale and its PDF missing: not ready, and it names the file.
    let missing = await get('/admin/orders');
    assert.match(missing, /On sale but its PDF is not in the bucket: test-sample\.pdf/);
    // Every PDF in the bucket: ready, in test mode.
    for (const p of PRODUCTS) await FILES.put(p.file, PDF);
    let html = await get('/admin/orders');
    assert.match(html, /fa-ready ok/, html.match(/<section class="fa-ready[\s\S]*?<\/section>/)?.[0]);
    assert.match(html, /Ready on this preview \(Razorpay test mode: no real money\)/);

    // The live site with test keys: not ready, and it says the store refuses sales there.
    html = await get('/admin/orders', ENV(), 'https://mykrutidev.com');
    assert.match(html, /fa-ready no/);
    assert.match(html, /Razorpay TEST keys on the live site/);
    assert.match(html, /STORE_TEST_PRODUCTS is 1 on the live site/);

    // Live keys on the live site, with a live product and its PDF: ready for real money.
    html = await get('/admin/orders', { ...ENV(), RAZORPAY_KEY_ID: 'rzp_live_x', STORE_TEST_PRODUCTS: '' }, 'https://mykrutidev.com');
    assert.match(html, /Ready: the live site takes real payments/);
    // ...and not ready once that product's PDF is gone from the bucket.
    const live = PRODUCTS.find((p) => p.status === 'live');
    await FILES.delete(live.file);
    html = await get('/admin/orders', { ...ENV(), RAZORPAY_KEY_ID: 'rzp_live_x', STORE_TEST_PRODUCTS: '' }, 'https://mykrutidev.com');
    assert.match(html, new RegExp(`On sale but its PDF is not in the bucket: ${live.file.replace(/\./g, '\\.')}`));
    await FILES.put(live.file, PDF);

    // Live keys on a preview: a warning that payments are real.
    html = await get('/admin/orders', { ...ENV(), RAZORPAY_KEY_ID: 'rzp_live_x' });
    assert.match(html, /LIVE Razorpay keys on a preview/);

    // A missing webhook secret stops it; a missing bot check is only a warning.
    html = await get('/admin/orders', { ...ENV(), RAZORPAY_WEBHOOK_SECRET: '' });
    assert.match(html, /fa-ready no/);
    assert.match(html, /<li class="fa-no">Missing: Razorpay webhook secret/);
    html = await get('/admin/orders', { ...ENV(), TURNSTILE_SECRET_KEY: '' });
    assert.match(html, /fa-ready ok/);
  });
});

describe('/admin/orders: live and test orders apart', () => {
  const KEY = ENV().ADMIN_KEY;
  const get = (path, env = ENV(), host = 'https://mykrutidev.com') =>
    handleAdminOrders(new Request(`${host}${path}`, { headers: { Authorization: `Bearer ${KEY}` } }), env).then((r) => r.text());
  const LIVE = () => ({ ...ENV(), RAZORPAY_KEY_ID: 'rzp_live_x', STORE_TEST_PRODUCTS: '' });
  let n = 0;
  async function row(mode, amount) {
    const id = `ozz${String(++n).padStart(22, 'a').replace(/\d/g, (d) => 'abcdefghij'[d])}`;
    await DB.prepare(
      "INSERT INTO orders (id, created_at, paid_at, status, product_id, amount, currency, email, max_downloads, mode) VALUES (?, '2026-10-15T10:00:00Z', '2026-10-15T10:00:00Z', 'paid', 'kruti-dev-7-day-starter', ?, 'INR', '', 5, ?)",
    )
      .bind(id, amount, mode)
      .run();
    return id;
  }
  const money = (html) => [...html.matchAll(/fa-tile-n">₹([\d,.]+) <span class="fa-sub">· (\d+)<\/span><\/span><span class="fa-tile-l">All time/g)].map((m) => [m[1], m[2]])[0];

  test('a checkout records the mode of the keys that made it', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    assert.equal((await orders()).find((o) => o.id === id).mode, 'test');
  });

  test('live totals count only live orders; test and old (NULL) orders are on their own tab', async () => {
    const live = await row('live', 3900);
    const test = await row('test', 3900);
    const old = await row(null, 100);
    // The live site with live keys shows live orders by default.
    let html = await get('/admin/orders', LIVE());
    assert.deepEqual(money(html), ['39', '1']);
    assert.ok(html.includes(live) && !html.includes(test) && !html.includes(old));
    assert.match(html, /Live orders <span class="fa-sub">1<\/span>/);
    assert.match(html, /Test orders <span class="fa-sub">2<\/span>/);
    assert.doesNotMatch(html, /fa-pill fa-test/);
    // The test tab: the other two, marked TEST, with their own totals and a banner.
    html = await get('/admin/orders?mode=test', LIVE());
    assert.deepEqual(money(html), ['40', '2']);
    assert.ok(!html.includes(live) && html.includes(test) && html.includes(old));
    assert.match(html, /<span class="fa-pill fa-test">TEST<\/span>/);
    assert.match(html, /No real money moved/);
    // A preview with test keys opens on the test tab.
    html = await get('/admin/orders', ENV(), 'https://test.mykrutidev.pages.dev');
    assert.match(html, /href="\?mode=test" aria-current="page"/);
    // The CSV keeps every order, with its mode.
    const csv = await (await handleAdminOrders(new Request('https://mykrutidev.com/admin/orders?format=csv', { headers: { Authorization: `Bearer ${KEY}` } }), LIVE())).text();
    assert.match(csv, /,mode,phone,email_prev,email_changed_by,email_changed_at\r?\n/);
    assert.match(csv, new RegExp(`${live}.*,live`));
  });

  test('an orders table made before the mode column gets it on first use, keeping its rows', async () => {
    const { addColumns } = await import('./storeApi.js');
    const { STORE_SCHEMA } = await import('../src/lib/store.js');
    // The table as it was on the live site before the column existed.
    await DB.prepare('DROP TABLE orders').run();
    await DB.prepare(STORE_SCHEMA[0].replace(/,\s*mode TEXT/, '')).run();
    let cols = (await DB.prepare('PRAGMA table_info(orders)').all()).results.map((c) => c.name);
    assert.ok(!cols.includes('mode'));
    await DB.prepare("INSERT INTO orders (id, status, product_id, amount, email, max_downloads) VALUES ('oold', 'paid', 'sample-test', 100, '', 5)").run();
    await addColumns(DB);
    await addColumns(DB); // twice is harmless
    cols = (await DB.prepare('PRAGMA table_info(orders)').all()).results.map((c) => c.name);
    assert.ok(cols.includes('mode'));
    const [kept] = (await DB.prepare("SELECT id, mode FROM orders WHERE id = 'oold'").all()).results;
    assert.deepEqual(kept, { id: 'oold', mode: null }, 'the old row is kept, and counts as test');
  });
});

describe('storage', () => {
  test('db/store.sql holds exactly the STORE_SCHEMA statements', async () => {
    const { readFileSync } = await import('node:fs');
    const { STORE_SCHEMA } = await import('../src/lib/store.js');
    const sql = readFileSync(new URL('../db/store.sql', import.meta.url), 'utf8');
    const statements = sql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    assert.deepEqual(statements, STORE_SCHEMA.map((s) => s.replace(/\s+/g, ' ').trim()));
  });

  test('an order row holds no IP address or user agent', async () => {
    const net = fakeNet();
    await handleCheckout(post('/api/store/checkout', good, { ip: '198.51.100.9' }), ENV(), { fetch: net.fetch });
    const everything = JSON.stringify([await orders(), (await DB.prepare('SELECT * FROM feedback_rate').all()).results]);
    assert.doesNotMatch(everything, /198\.51\.100\.9/);
  });
});

// ---------------------------------------------------------------------------
// Reaching the buyer: phone, delivery reports, a corrected email, "send my link"
// ---------------------------------------------------------------------------

const RESEND_SECRET = `whsec_${Buffer.from('a-resend-webhook-signing-key-0123').toString('base64')}`;
/** A Resend (Svix-signed) webhook request, signed the way Resend signs it. */
function resendHook(event, { secret = RESEND_SECRET, ts = Math.floor(Date.now() / 1000), id = `msg_${Math.random().toString(36).slice(2)}`, sig } = {}) {
  const raw = JSON.stringify(event);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const good = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return new Request('https://mykrutidev.com/api/store/mail-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': sig ?? `v1,${good}` },
    body: raw,
  });
}
const MAIL_ENV = () => ({ ...ENV(), RESEND_WEBHOOK_SECRET: RESEND_SECRET });

/** A paid order through checkout and settle; returns its id and the fake network. */
async function paidOrder({ net = fakeNet(), body = good, now = Date.now() } = {}) {
  const r = await handleCheckout(post('/api/store/checkout', body), MAIL_ENV(), { fetch: net.fetch, now });
  const id = (await r.json()).order;
  net.pay();
  await settleOrder(MAIL_ENV(), id, { fetch: net.fetch, now });
  return { id, net };
}
const one = async (id) => DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();

describe('the buyer\'s phone and the owner\'s WhatsApp buttons', () => {
  test('a paid order keeps the buyer\'s mobile from Razorpay; the sale email has it, with WhatsApp in Hindi and English', async () => {
    const { id, net } = await paidOrder();
    const o = await one(id);
    assert.equal(o.phone, '+919876543210');
    assert.equal(o.mail_id, 're_mail_1', 'Resend\'s id for the buyer\'s email is kept, for its delivery report');
    const owner = net.mails.find((m) => m.to[0] === 'owner@example.com');
    assert.match(owner.text, /Buyer phone: \+919876543210/);
    const token = await downloadToken(ENV(), id);
    const wa = [...owner.html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    assert.equal(wa.length, 2);
    const [hi, en] = wa.map((u) => new URL(u));
    assert.equal(hi.pathname, '/919876543210');
    assert.match(hi.searchParams.get('text'), /नमस्ते! MyKrutiDev से/);
    assert.ok(hi.searchParams.get('text').includes(`/hi/store/thanks#o=${id}&t=${token}`));
    assert.match(en.searchParams.get('text'), /^Hi! Thank you for buying/);
    assert.ok(en.searchParams.get('text').includes(`/store/thanks#o=${id}&t=${token}`));
    assert.match(owner.html, /WhatsApp: हिंदी/);
    assert.match(owner.html, /WhatsApp: English/);
  });

  test('the buyer\'s link opens the page in the language they bought in', async () => {
    const { id, net } = await paidOrder();
    const buyer = net.mails.find((m) => m.to[0] === 'buyer@example.com');
    assert.ok(buyer.text.includes(`/hi/store/thanks#o=${id}&t=`), 'good.lang is hi');
  });

  test('when Razorpay\'s payment cannot be read the order is still paid, just without a phone or buttons', async () => {
    const net = fakeNet();
    net.contact = null;
    const { id } = await paidOrder({ net });
    const o = await one(id);
    assert.equal(o.status, 'paid');
    assert.equal(o.phone, null);
    const owner = net.mails.find((m) => m.to[0] === 'owner@example.com');
    assert.doesNotMatch(owner.html, /wa\.me/);
    assert.match(owner.html, /No phone number from Razorpay/);
  });

  test('the WhatsApp messages: thanks + link, or "your email looks wrong" + link, in both languages', () => {
    const product = PRODUCTS[0];
    const links = { hi: 'https://x/hi', en: 'https://x/en' };
    const sale = waText('sale', { product, links });
    assert.ok(sale.hi.includes('https://x/hi') && sale.en.includes('https://x/en'));
    const wrong = waText('wrong-email', { product, email: 'a@gmial.com', links });
    assert.match(wrong.hi, /a@gmial\.com/);
    assert.match(wrong.hi, /ईमेल पर नहीं पहुँचा/);
    assert.match(wrong.en, /looks wrong/);
  });
});

describe('POST /api/store/mail-webhook: Resend\'s delivery reports', () => {
  test('a genuine signature is accepted; a wrong one, a wrong secret or an old timestamp is not', async () => {
    const ev = { type: 'email.delivered', data: { email_id: 're_x' } };
    assert.equal((await handleMailWebhook(resendHook(ev), MAIL_ENV())).status, 200);
    assert.equal((await handleMailWebhook(resendHook(ev, { sig: 'v1,AAAA' }), MAIL_ENV())).status, 400);
    assert.equal((await handleMailWebhook(resendHook(ev, { secret: `whsec_${Buffer.from('another-key').toString('base64')}` }), MAIL_ENV())).status, 400);
    assert.equal((await handleMailWebhook(resendHook(ev, { ts: Math.floor(Date.now() / 1000) - 3600 }), MAIL_ENV())).status, 400);
    assert.equal((await handleMailWebhook(resendHook(ev), ENV())).status, 503, 'not set up without RESEND_WEBHOOK_SECRET');
  });

  test('verifyResendWebhook accepts any of several v1 signatures, as Svix sends during a key rotation', async () => {
    const r = resendHook({ type: 'x' });
    const sig = r.headers.get('svix-signature');
    const h = new Headers(r.headers);
    h.set('svix-signature', `v1,bm90IGl0 ${sig}`);
    assert.equal(await verifyResendWebhook(await r.clone().text(), h, RESEND_SECRET), true);
  });

  test('delivered is recorded; a bounce flags the order and mails the owner once, with the "wrong email" WhatsApp message', async () => {
    const { id, net } = await paidOrder();
    const mailId = (await one(id)).mail_id;
    const before = net.mails.length;
    await handleMailWebhook(resendHook({ type: 'email.bounced', data: { email_id: mailId } }), MAIL_ENV(), { fetch: net.fetch });
    assert.equal((await one(id)).mail_status, 'bounced');
    const alert = net.mails[before];
    assert.deepEqual(alert.to, ['owner@example.com']);
    assert.match(alert.subject, /bounced: buyer@example\.com/);
    const wa = [...alert.html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')).searchParams.get('text'));
    assert.match(wa[0], /सही नहीं लग रहा/);
    assert.match(wa[1], /looks wrong/);
    // The same report again (Resend retries): no second alert. A late "delivered" does not hide the bounce.
    await handleMailWebhook(resendHook({ type: 'email.bounced', data: { email_id: mailId } }), MAIL_ENV(), { fetch: net.fetch });
    await handleMailWebhook(resendHook({ type: 'email.delivered', data: { email_id: mailId } }), MAIL_ENV(), { fetch: net.fetch });
    assert.equal(net.mails.length, before + 1);
    assert.equal((await one(id)).mail_status, 'bounced');
  });

  test('delivered on its own is kept as a record; a complaint flags the order too', async () => {
    const { id, net } = await paidOrder();
    const mailId = (await one(id)).mail_id;
    await handleMailWebhook(resendHook({ type: 'email.delivered', data: { email_id: mailId } }), MAIL_ENV(), { fetch: net.fetch });
    assert.equal((await one(id)).mail_status, 'delivered');
    await handleMailWebhook(resendHook({ type: 'email.complained', data: { email_id: mailId } }), MAIL_ENV(), { fetch: net.fetch });
    assert.equal((await one(id)).mail_status, 'complained');
    assert.match(net.mails.at(-1).subject, /marked our email as spam/);
  });

  test('reports for other emails (the owner\'s, the feedback) and other events are acknowledged and ignored', async () => {
    const { id, net } = await paidOrder();
    const before = net.mails.length;
    for (const ev of [
      { type: 'email.bounced', data: { email_id: 're_someone_else' } },
      { type: 'email.opened', data: { email_id: (await one(id)).mail_id } },
      { type: 'email.bounced', data: {} },
    ]) {
      assert.equal((await handleMailWebhook(resendHook(ev), MAIL_ENV(), { fetch: net.fetch })).status, 200);
    }
    assert.equal((await one(id)).mail_status, 'sent');
    assert.equal(net.mails.length, before);
  });
});

describe('POST /api/store/email: the buyer corrects their email', () => {
  // The management key: only the buying browser has it (confirm gives it with the checkout secret).
  const change = async (id, email, { net = fakeNet(), now, key } = {}) =>
    handleChangeEmail(post('/api/store/email', { o: id, m: key ?? (await manageToken(ENV(), id)), email }), MAIL_ENV(), { fetch: net.fetch, now });

  test('once, within a day of paying: the link goes to the new address, the owner is told, the downloads stay as they were', async () => {
    const t0 = Date.UTC(2026, 9, 16, 10, 0, 0);
    const { id } = await paidOrder({ now: t0 });
    await DB.prepare('UPDATE orders SET downloads = 2 WHERE id = ?').bind(id).run();
    const net = fakeNet();
    const r = await change(id, '  Right@Example.com ', { net, now: t0 + 3600e3 });
    assert.equal(r.status, 200);
    const out = await r.json();
    const newKey = await downloadToken(ENV(), id, 1);
    assert.deepEqual(out, { ok: true, email: 'right@example.com', sent: true, token: newKey });
    const o = await one(id);
    assert.deepEqual(
      [o.email, o.email_prev, o.email_changed_by, o.buyer_email_changes, o.downloads, o.mail_status, o.token_ver],
      ['right@example.com', 'buyer@example.com', 'buyer', 1, 2, 'sent', 1],
    );
    assert.deepEqual(net.mails.map((m) => m.to[0]), ['right@example.com', 'owner@example.com']);
    assert.ok(net.mails[0].text.includes(`#o=${id}&t=${newKey}`), 'the new address gets the NEW key');
    // The link that went to the old (wrong) address no longer opens the order.
    const oldKey = await downloadToken(ENV(), id, 0);
    const old = await handleOrderStatus(post('/api/store/order', { o: id, t: oldKey }), MAIL_ENV());
    assert.equal(old.status, 404);
    assert.match(net.mails[1].text, /Old email: buyer@example\.com/);
    assert.match(net.mails[1].text, /Downloads so far: 2 \/ 5/);
    // A second change is refused: one correction per order.
    assert.equal((await change(id, 'third@example.com', { now: t0 + 2 * 3600e3 })).status, 409);
    assert.equal((await one(id)).email, 'right@example.com');
  });

  test('after a day it is refused, unless our email bounced', async () => {
    const t0 = Date.UTC(2026, 9, 16, 10, 0, 0);
    const { id } = await paidOrder({ now: t0 });
    const late = t0 + 25 * 3600e3;
    assert.equal((await change(id, 'right@example.com', { now: late })).status, 409);
    await DB.prepare("UPDATE orders SET mail_status = 'bounced' WHERE id = ?").bind(id).run();
    assert.equal((await change(id, 'right@example.com', { now: late })).status, 200);
  });

  test('a download link (from an email, shared or misdelivered) cannot change the email; only the management key can', async () => {
    const { id } = await paidOrder();
    const downloadKey = await downloadToken(ENV(), id);
    assert.equal((await change(id, 'thief@example.com', { key: downloadKey })).status, 404);
    assert.equal((await one(id)).email, 'buyer@example.com');
  });

  test('refuses a wrong key, a bad or unchanged address, a refunded or unpaid order', async () => {
    const { id } = await paidOrder();
    assert.equal((await change(id, 'x@example.com', { key: 'f'.repeat(64) })).status, 404);
    assert.equal((await change(id, 'not an email')).status, 400);
    assert.equal((await change(id, 'buyer@example.com')).status, 400);
    await DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").bind(id).run();
    assert.equal((await change(id, 'x@example.com')).status, 409);
    const unpaid = await startOrder(fakeNet());
    assert.equal((await change(unpaid, 'x@example.com')).status, 409);
  });

  test('two tries at the same moment change it once', async () => {
    const { id } = await paidOrder();
    const rs = await Promise.all(['a1@example.com', 'a2@example.com', 'a3@example.com'].map((e) => change(id, e)));
    assert.equal(rs.filter((r) => r.status === 200).length, 1);
    assert.equal((await one(id)).buyer_email_changes, 1);
  });

  test('the thanks page is told the address, whether it may be changed (management key only), and a bounce', async () => {
    const t0 = Date.now();
    const { id } = await paidOrder({ now: t0 });
    const token = await downloadToken(ENV(), id);
    const m = await manageToken(ENV(), id);
    const view = async (now, withKey = true) =>
      (await handleOrderStatus(post('/api/store/order', { o: id, t: token, ...(withKey ? { m } : {}) }), MAIL_ENV(), { now })).json();
    let v = await view(t0 + 1000);
    assert.deepEqual([v.email, v.canChangeEmail, v.mailStatus, v.manage], ['buyer@example.com', true, 'sent', m]);
    // The same download link without the management key: no change offered, no key handed out.
    v = await view(t0 + 1000, false);
    assert.deepEqual([v.canChangeEmail, v.manage], [false, undefined]);
    v = await view(t0 + 25 * 3600e3);
    assert.equal(v.canChangeEmail, false);
    await DB.prepare("UPDATE orders SET mail_status = 'bounced' WHERE id = ?").bind(id).run();
    v = await view(t0 + 25 * 3600e3);
    assert.deepEqual([v.canChangeEmail, v.mailStatus], [true, 'bounced']);
  });
});

describe('POST /api/store/find: "send me my link again"', () => {
  const find = (body, { net = fakeNet(), env = MAIL_ENV(), ip, now } = {}) =>
    handleFind(post('/api/store/find', body, ip ? { ip } : {}), env, { fetch: net.fetch, now });

  test('emails the links to that address only, and says so; an address with no purchase is told plainly', async () => {
    const { id } = await paidOrder();
    const net = fakeNet();
    const r1 = await find({ email: 'Buyer@Example.com', lang: 'en' }, { net });
    assert.deepEqual([r1.status, await r1.json()], [200, { ok: true, found: 'sent' }]);
    assert.equal(net.mails.length, 1);
    assert.deepEqual(net.mails[0].to, ['buyer@example.com']);
    assert.ok(net.mails[0].text.includes(`/store/thanks#o=${id}&t=${await downloadToken(ENV(), id)}`));
    const r2 = await find({ email: 'nobody@example.com' });
    assert.deepEqual([r2.status, await r2.json()], [200, { ok: true, found: 'none' }]);
  });

  test('the link itself is never in the answer, only in the email', async () => {
    const { id } = await paidOrder();
    const text = await (await find({ email: 'buyer@example.com' })).text();
    assert.ok(!text.includes(id) && !text.includes(await downloadToken(ENV(), id)));
  });

  test('paid but nothing left (refunded, expired, used up) says "closed"; an unpaid order counts as none', async () => {
    const { id } = await paidOrder();
    for (const sql of [
      "UPDATE orders SET status = 'refunded' WHERE id = ?",
      "UPDATE orders SET status = 'paid', expires_at = 1 WHERE id = ?",
      "UPDATE orders SET expires_at = NULL, downloads = max_downloads WHERE id = ?",
    ]) {
      await DB.prepare(sql).bind(id).run();
      const net = fakeNet();
      const r = await find({ email: 'buyer@example.com' }, { net });
      assert.deepEqual(await r.json(), { ok: true, found: 'closed' }, sql);
      assert.equal(net.mails.length, 0);
    }
    await DB.prepare('DELETE FROM orders').run();
    await startOrder(fakeNet());
    // (the next day: three asks today used up this address's limit)
    assert.deepEqual(await (await find({ email: 'buyer@example.com' }, { now: Date.now() + 864e5 })).json(), { ok: true, found: 'none' });
  });

  test('at most 3 emails a day to one address, from any number of IPs; then a clear "try tomorrow"', async () => {
    await paidOrder();
    const net = fakeNet();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await find({ email: 'buyer@example.com' }, { net })).status);
    assert.equal(net.mails.length, STORE.findPerDay);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  });

  test('refuses a bad address and a honeypot, and asks Turnstile when it is set up', async () => {
    assert.equal((await find({ email: 'nope' })).status, 400);
    assert.equal((await find({ email: 'a@example.com', website: 'x' })).status, 400);
    const env = { ...MAIL_ENV(), TURNSTILE_SECRET_KEY: 'ts' };
    const r = await handleFind(post('/api/store/find', { email: 'a@example.com' }), env, { verify: async () => false });
    assert.equal(r.status, 403);
    const ok = await handleFind(post('/api/store/find', { email: 'a@example.com', token: 'tok' }), env, { verify: async () => true });
    assert.equal(ok.status, 200);
  });
});

describe('/admin/orders: phone, WhatsApp, delivery and a changed email', () => {
  const KEY = ENV().ADMIN_KEY;
  const get = () =>
    handleAdminOrders(new Request('https://test.mykrutidev.pages.dev/admin/orders?mode=test', { headers: { Authorization: `Bearer ${KEY}` } }), MAIL_ENV()).then((r) => r.text());

  test('each paid order shows the phone with WhatsApp in Hindi and English; a bounce turns the message to "wrong email"', async () => {
    const { id } = await paidOrder();
    let html = await get();
    assert.ok(html.includes('+919876543210'));
    const texts = () => [...html.matchAll(/class="fa-wa" href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')).searchParams.get('text'));
    assert.match(texts()[0], /खरीदने के लिए धन्यवाद/);
    assert.match(texts()[1], /Thank you for buying/);
    await DB.prepare("UPDATE orders SET mail_status = 'bounced' WHERE id = ?").bind(id).run();
    html = await get();
    assert.match(html, /<span class="fa-flag">bounced<\/span>/);
    assert.match(texts()[0], /सही नहीं लग रहा/);
    assert.match(html, /1<\/span><span class="fa-tile-l">paid, email not delivered/);
    await DB.prepare("UPDATE orders SET mail_status = 'delivered' WHERE id = ?").bind(id).run();
    assert.match(await get(), /<span class="fa-good">delivered<\/span>/);
  });

  test('"Change email & send" puts the right address on, sends the link there, and keeps the old one', async () => {
    const { id } = await paidOrder();
    await FILES.put(PRODUCT.file, PDF);
    const oldKey = await downloadToken(ENV(), id);
    const net = fakeNet();
    const form = new URLSearchParams({ action: 'email', id, email: 'Right@Example.com' });
    const r = await handleAdminOrders(
      new Request('https://test.mykrutidev.pages.dev/admin/orders', {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      MAIL_ENV(),
      { fetch: net.fetch },
    );
    assert.equal(r.status, 303);
    const o = await one(id);
    assert.deepEqual([o.email, o.email_prev, o.email_changed_by, o.buyer_email_changes], ['right@example.com', 'buyer@example.com', 'admin', 0]);
    assert.deepEqual(net.mails.map((m) => m.to[0]), ['right@example.com']);
    // The link sent to the wrong address stops working; the new one works.
    const tryKey = (t) => handleDownload(post('/api/store/download', null, { type: 'application/x-www-form-urlencoded', raw: new URLSearchParams({ o: id, t }).toString() }), MAIL_ENV());
    assert.equal((await tryKey(oldKey)).status, 404);
    assert.equal(o.token_ver, 1);
    assert.equal((await tryKey(await downloadToken(ENV(), id, 1))).status, 200);
    assert.ok(net.mails[0].text.includes(await downloadToken(ENV(), id, 1)));
    const html = await get();
    assert.match(html, /was <!--email_off-->buyer@example\.com<!--\/email_off-->, changed by admin/);
    // A bad address changes nothing.
    const bad = await handleAdminOrders(
      new Request('https://test.mykrutidev.pages.dev/admin/orders', {
        method: 'POST',
        body: new URLSearchParams({ action: 'email', id, email: 'nope' }),
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      MAIL_ENV(),
    );
    assert.match(bad.headers.get('Location'), /done=bademail/);
    assert.equal((await one(id)).email, 'right@example.com');
  });

  test('the setup check names the Resend webhook secret', async () => {
    assert.match(await get(), /Email delivery reports from Resend/);
  });
});

describe('one buyer, start to finish (the whole support path, in order)', () => {
  test('buy with a typo, bounce, owner alerted, buyer corrects it, link on another phone, refund closes it', async () => {
    const net = fakeNet();
    const env = MAIL_ENV();
    const t0 = Date.now();
    await FILES.put(PRODUCT.file, PDF);

    // 1. Checkout with a mistyped address, then Razorpay says paid; the buyer comes back.
    const r0 = await (await handleCheckout(post('/api/store/checkout', { ...good, email: 'vikas926798@gmail.com' }), env, { fetch: net.fetch, now: t0 })).json();
    const id = r0.order;
    net.pay();
    const back = await (await handleConfirm(post('/api/store/confirm', { order: id, claim: r0.claim }), env, { fetch: net.fetch, now: t0 + 20e3 })).json();
    assert.equal(back.state, 'paid');
    assert.deepEqual([back.email, back.canChangeEmail, back.mailStatus], ['vikas926798@gmail.com', true, '']);
    let token = back.token;
    const manage = back.manage;
    // The buyer's mail went to the typo; the owner's sale mail has the phone and both WhatsApp buttons.
    assert.deepEqual(net.mails.map((m) => m.to[0]), ['vikas926798@gmail.com', 'owner@example.com']);
    assert.match(net.mails[1].html, /WhatsApp: हिंदी[\s\S]*WhatsApp: English/);

    // 2. The buyer downloads once from the thanks page.
    const dl = await handleDownload(post('/api/store/download', null, { type: 'application/x-www-form-urlencoded', raw: new URLSearchParams({ o: id, t: token }).toString() }), env, { now: t0 + 30e3 });
    assert.equal(dl.status, 200);

    // 3. Gmail bounces the typo: the order is flagged and the owner alerted, with the "wrong email" message.
    const mailId = (await one(id)).mail_id;
    await handleMailWebhook(resendHook({ type: 'email.bounced', data: { email_id: mailId } }), env, { fetch: net.fetch });
    assert.equal((await one(id)).mail_status, 'bounced');
    assert.match(net.mails.at(-1).subject, /bounced: vikas926798@gmail\.com/);
    assert.match(decodeURIComponent(net.mails.at(-1).html), /सही नहीं लग रहा/);

    // 4. Next day (past 24 h, but it bounced) the buyer opens the link again: told, and corrects it once.
    const later = t0 + 30 * 3600e3;
    const view = await (await handleOrderStatus(post('/api/store/order', { o: id, t: token, m: manage }), env, { now: later })).json();
    assert.deepEqual([view.mailStatus, view.canChangeEmail, view.remaining], ['bounced', true, 4]);
    const fixed = await handleChangeEmail(post('/api/store/email', { o: id, m: manage, email: 'vikas9267981@gmail.com' }), env, { fetch: net.fetch, now: later });
    assert.equal(fixed.status, 200);
    token = (await fixed.json()).token; // the key moved on; the typo's link is dead
    assert.deepEqual(net.mails.slice(-2).map((m) => m.to[0]), ['vikas9267981@gmail.com', 'owner@example.com']);
    let o = await one(id);
    assert.deepEqual([o.email, o.email_prev, o.mail_status, o.downloads], ['vikas9267981@gmail.com', 'vikas926798@gmail.com', 'sent', 1]);
    // ...and only once.
    assert.equal((await handleChangeEmail(post('/api/store/email', { o: id, m: manage, email: 'friend@gmail.com' }), env, { fetch: net.fetch, now: later })).status, 409);

    // 5. The new mail is delivered: recorded, should a buyer ever say it never came.
    await handleMailWebhook(resendHook({ type: 'email.delivered', data: { email_id: (await one(id)).mail_id } }), env, { fetch: net.fetch });
    assert.equal((await one(id)).mail_status, 'delivered');

    // 6. On another phone: "lost link" sends it to the right address; the old typo finds nothing.
    let found = await (await handleFind(post('/api/store/find', { email: 'vikas9267981@gmail.com' }), env, { fetch: net.fetch, now: later })).json();
    assert.equal(found.found, 'sent');
    assert.deepEqual(net.mails.at(-1).to, ['vikas9267981@gmail.com']);
    found = await (await handleFind(post('/api/store/find', { email: 'vikas926798@gmail.com' }), env, { fetch: net.fetch, now: later })).json();
    assert.equal(found.found, 'none');

    // 7. A full refund (Razorpay's webhook) closes the download and the "lost link" says so.
    const raw = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_test1', amount: PRODUCT.pricePaise } } } });
    const sig = await hmacHex(WEBHOOK_SECRET, raw);
    const hook = new Request('https://test.mykrutidev.pages.dev/api/store/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sig }, body: raw });
    assert.equal((await handleWebhook(hook, env, { fetch: net.fetch })).status, 200);
    o = await one(id);
    assert.equal(o.status, 'refunded');
    const after = await handleDownload(post('/api/store/download', null, { type: 'application/x-www-form-urlencoded', raw: new URLSearchParams({ o: id, t: token }).toString() }), env, { now: later });
    assert.equal(after.status, 410);
    found = await (await handleFind(post('/api/store/find', { email: 'vikas9267981@gmail.com' }), env, { fetch: net.fetch, now: later })).json();
    assert.equal(found.found, 'closed');
    // A refunded order cannot have its email changed any more either.
    assert.equal((await handleChangeEmail(post('/api/store/email', { o: id, m: manage, email: 'x@gmail.com' }), env, { fetch: net.fetch, now: later })).status, 409);
  });
});

describe('the background check (reconcile)', () => {
  const later = () => Date.now() + 5 * 60e3;

  test('settles a payment whose buyer closed the tab and whose webhook never came, and mails them', async () => {
    const net = fakeNet();
    const id = await startOrder(net, MAIL_ENV());
    net.pay();
    const out = await reconcile(MAIL_ENV(), { fetch: net.fetch, now: later() });
    assert.equal(out.checked, 1);
    assert.equal(out.settled, 1);
    assert.equal((await one(id)).status, 'paid');
    // The buyer's link, the owner's sale mail, and the "webhook may be off" alert.
    assert.equal(net.mails.length, 3);
    assert.match(net.mails[2].subject, /background check/);
    const log = (await DB.prepare('SELECT action FROM store_audit WHERE order_id = ?').bind(id).all()).results.map((r) => r.action);
    assert.ok(log.includes('paid-by-background-check'));
    // Running again does nothing twice: no second settle, no second alert.
    const again = await reconcile(MAIL_ENV(), { fetch: net.fetch, now: later() + 60e3 });
    assert.equal(again.settled, 0);
    assert.equal(net.mails.length, 3);
  });

  test('an order still unpaid on Razorpay stays unpaid, and an order just started is left alone', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    assert.equal((await reconcile(ENV(), { fetch: net.fetch, now: Date.now() })).checked, 0);
    const out = await reconcile(ENV(), { fetch: net.fetch, now: later() });
    assert.equal(out.checked, 1);
    assert.equal(out.settled, 0);
    assert.equal((await one(id)).status, 'created');
  });

  test('retries a download email that failed, after its wait, and stops after the retry limit', async () => {
    const { id, net } = await paidOrder();
    await DB.prepare("UPDATE orders SET mail_status = 'failed', mail_tries = 1, mail_next = ? WHERE id = ?").bind(Math.floor(Date.now() / 1000) + 300, id).run();
    const before = net.mails.length;
    assert.equal((await reconcile(MAIL_ENV(), { fetch: net.fetch, now: Date.now() })).mailsRetried, 0, 'not before its wait');
    const out = await reconcile(MAIL_ENV(), { fetch: net.fetch, now: Date.now() + 600e3 });
    assert.equal(out.mailsRetried, 1);
    assert.equal(out.mailsSent, 1);
    assert.equal(net.mails.length, before + 1);
    assert.equal((await one(id)).mail_status, 'sent');
    await DB.prepare("UPDATE orders SET mail_status = 'failed', mail_tries = ?, mail_next = NULL WHERE id = ?").bind(STORE.mailRetries, id).run();
    assert.equal((await reconcile(MAIL_ENV(), { fetch: net.fetch, now: Date.now() + 1200e3 })).mailsRetried, 0, 'gives up after the limit');
  });

  test('picks up a full refund made in the Razorpay dashboard, and records a partial one without ending the downloads', async () => {
    const { id, net } = await paidOrder();
    net.refunded = 40;
    let out = await reconcile(MAIL_ENV(), { fetch: net.fetch, now: Date.now() });
    assert.equal(out.refundsChecked, 1);
    assert.equal(out.partial, 1);
    let o = await one(id);
    assert.equal(o.status, 'paid');
    assert.equal(o.refunded_amount, 40);
    // Looked at again only after 6 hours.
    assert.equal((await reconcile(MAIL_ENV(), { fetch: net.fetch, now: Date.now() + 3600e3 })).refundsChecked, 0);
    net.refunded = PRODUCT.pricePaise;
    out = await reconcile(MAIL_ENV(), { fetch: net.fetch, now: Date.now() + 7 * 3600e3 });
    assert.equal(out.refunded, 1);
    o = await one(id);
    assert.equal(o.status, 'refunded');
    assert.equal(o.refunded_amount, PRODUCT.pricePaise);
  });

  test('records when it ran, for the admin page', async () => {
    const net = fakeNet();
    await reconcile(ENV(), { fetch: net.fetch, now: Date.UTC(2026, 0, 2, 3, 4, 5) });
    const at = (await DB.prepare("SELECT value FROM store_meta WHERE key = 'reconcile_at'").first()).value;
    assert.equal(at, '2026-01-02T03:04:05Z');
  });

  test('maybeReconcile runs at most once per slot, even when called at the same moment', async () => {
    const net = fakeNet();
    const now = Date.now();
    const runs = await Promise.all([1, 2, 3, 4].map(() => maybeReconcile(ENV(), { fetch: net.fetch, now })));
    assert.equal(runs.filter(Boolean).length, 1);
    assert.equal(await maybeReconcile(ENV(), { fetch: net.fetch, now: now + 60e3 }), null);
    assert.ok(await maybeReconcile(ENV(), { fetch: net.fetch, now: now + (RECONCILE_EVERY + 1) * 60e3 }));
  });

  test('POST /api/store/reconcile needs the cron secret or the admin key, and answers with counts only', async () => {
    const net = fakeNet();
    const env = { ...ENV(), STORE_CRON_SECRET: 'a-long-cron-secret-0123456789' };
    const call = (auth, method = 'POST') =>
      handleReconcile(new Request('https://mykrutidev.com/api/store/reconcile', { method, headers: auth ? { Authorization: auth } : {} }), env, { fetch: net.fetch });
    assert.equal((await call()).status, 401);
    assert.equal((await call('Bearer wrong-wrong-wrong-wrong')).status, 401);
    assert.equal((await call('Bearer a-long-cron-secret-0123456789', 'GET')).status, 405);
    const r = await call('Bearer a-long-cron-secret-0123456789');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.deepEqual(Object.keys(body).sort(), ['checked', 'mailsRetried', 'mailsSent', 'ok', 'partial', 'refunded', 'refundsChecked', 'settled']);
    assert.equal((await call(`Bearer ${env.ADMIN_KEY}`)).status, 200);
    const unset = await handleReconcile(new Request('https://mykrutidev.com/api/store/reconcile', { method: 'POST' }), { DB }, {});
    assert.equal(unset.status, 503);
  });
});

describe('one Pay, one payment page', () => {
  test('a second Pay from the same browser reuses the open order and its Razorpay page', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    const r = await handleCheckout(post('/api/store/checkout', { ...good, resume: asBuyer(id) }), ENV(), { fetch: net.fetch });
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.order, id);
    assert.equal(out.reused, true);
    assert.equal(out.url, 'https://rzp.io/i/abc');
    assert.equal((await orders()).length, 1);
    assert.equal(net.calls.filter((c) => c.method === 'POST').length, 1, 'no second payment link');
  });

  test('a wrong secret, a paid order or an old link starts a new order instead', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    const wrong = await handleCheckout(post('/api/store/checkout', { ...good, resume: { order: id, claim: 'f'.repeat(32) } }), ENV(), { fetch: net.fetch });
    assert.equal(wrong.status, 201);
    const old = await handleCheckout(post('/api/store/checkout', { ...good, resume: asBuyer(id) }), ENV(), { fetch: net.fetch, now: Date.now() + STORE.linkMinutes * 60e3 });
    assert.equal(old.status, 201);
    net.pay({ reference_id: id });
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const paid = await handleCheckout(post('/api/store/checkout', { ...good, resume: asBuyer(id) }), ENV(), { fetch: net.fetch });
    assert.equal(paid.status, 201);
    assert.equal((await orders()).length, 4);
  });
});

describe('Razorpay webhooks: repeats and refunds', () => {
  const send = async (event, eventId) => {
    const raw = JSON.stringify(event);
    const headers = { 'Content-Type': 'application/json', 'X-Razorpay-Signature': await hmacHex(WEBHOOK_SECRET, raw) };
    if (eventId) headers['X-Razorpay-Event-Id'] = eventId;
    return handleWebhook(new Request('https://mykrutidev.com/api/store/webhook', { method: 'POST', headers, body: raw }), ENV(), {});
  };
  const refund = (amount, total) => ({
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_test1', amount } }, ...(total === undefined ? {} : { payment: { entity: { id: 'pay_test1', amount_refunded: total } } }) },
  });

  test('the same event delivered twice is counted once', async () => {
    const { id } = await paidOrder();
    await send(refund(40), 'evt_1');
    const r = await send(refund(40), 'evt_1');
    assert.equal((await r.json()).repeat, true);
    const o = await one(id);
    assert.equal(o.refunded_amount, 40);
    assert.equal(o.status, 'paid', 'a partial refund leaves the downloads');
  });

  test('partial refunds add up to a full one, which ends the downloads', async () => {
    const { id } = await paidOrder();
    await send(refund(40), 'evt_a');
    await send(refund(PRODUCT.pricePaise - 40), 'evt_b');
    const o = await one(id);
    assert.equal(o.refunded_amount, PRODUCT.pricePaise);
    assert.equal(o.status, 'refunded');
  });

  test('Razorpay\'s running total wins, so a refund the background check already saw is not counted twice', async () => {
    const { id } = await paidOrder();
    await DB.prepare('UPDATE orders SET refunded_amount = 40 WHERE id = ?').bind(id).run();
    await send(refund(40, 40), 'evt_x');
    assert.equal((await one(id)).refunded_amount, 40);
    assert.equal((await one(id)).status, 'paid');
  });

  test('records when the last webhook came', async () => {
    await send({ event: 'payment.captured' }, 'evt_any');
    assert.ok((await DB.prepare("SELECT value FROM store_meta WHERE key = 'razorpay_webhook_at'").first()).value);
  });
});

describe('/admin/orders: needs attention, run checks, audit trail', () => {
  const KEY = ENV().ADMIN_KEY;
  const get = (env = MAIL_ENV(), now) =>
    handleAdminOrders(new Request('https://test.mykrutidev.pages.dev/admin/orders?mode=test', { headers: { Authorization: `Bearer ${KEY}` } }), env, { now }).then((r) => r.text());
  const post = (body, net = fakeNet()) =>
    handleAdminOrders(
      new Request('https://test.mykrutidev.pages.dev/admin/orders', { method: 'POST', body: new URLSearchParams(body), headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }),
      MAIL_ENV(),
      { fetch: net.fetch },
    );

  test('lists a bounced email, a double payment and a partial refund, and says when the check last ran', async () => {
    const a = await paidOrder();
    const b = await paidOrder();
    await DB.prepare("UPDATE orders SET mail_status = 'bounced' WHERE id = ?").bind(a.id).run();
    await DB.prepare('UPDATE orders SET refunded_amount = 40 WHERE id = ?').bind(b.id).run();
    const html = await get();
    assert.match(html, /Needs attention \(\d+\)/);
    assert.match(html, /Download email bounced/);
    assert.match(html, /Paid 2 times for .* by the same email or phone/);
    assert.match(html, /Partly refunded/);
    assert.match(html, /The background check has not run for over an hour \(last: never\)/);
    assert.match(html, /value="reconcile">Run checks now/);
  });

  test('nothing to look at says so', async () => {
    const { id } = await paidOrder();
    await DB.prepare("UPDATE orders SET mail_status = 'delivered' WHERE id = ?").bind(id).run();
    await reconcile(MAIL_ENV(), { fetch: fakeNet().fetch });
    assert.match(await get(), /Nothing needs attention/);
  });

  test('"Run checks now" runs the background check and logs it in the audit trail', async () => {
    const net = fakeNet();
    const id = await startOrder(net, MAIL_ENV());
    net.pay();
    await DB.prepare('UPDATE orders SET created_at = ? WHERE id = ?').bind(new Date(Date.now() - 10 * 60e3).toISOString().replace(/\.\d+Z$/, 'Z'), id).run();
    const r = await post({ action: 'reconcile', id: '-' }, net);
    assert.equal(r.headers.get('Location'), '/admin/orders?done=reconcile');
    assert.equal((await one(id)).status, 'paid');
    const html = await get();
    assert.match(html, /Audit trail/);
    assert.match(html, /admin-run-checks/);
    assert.match(html, /paid-by-background-check/);
  });
});

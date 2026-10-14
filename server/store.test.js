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
  ensureStoreSchema,
  handleCheckout,
  handleConfirm,
  handleDownload,
  handleOrderStatus,
  handleStoreConfig,
  handleWebhook,
  settleOrder,
} from './storeApi.js';
import { handleAdminOrders } from './storeAdmin.js';
import { hmacHex, isPaidFor, verifyWebhook } from './razorpay.js';
import { buyerMail, ownerMail } from './storeMail.js';
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
    link: { id: 'plink_test1', status: 'created', amount: PRODUCT.pricePaise, amount_paid: 0, currency: 'INR', reference_id: null },
    fetch: async (url, init = {}) => {
      const method = init.method ?? 'GET';
      if (url.startsWith('https://api.resend.com')) {
        net.mails.push(JSON.parse(init.body));
        return new Response('{}', { status: 200 });
      }
      net.calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
      if (method === 'POST' && url.endsWith('/v1/payment_links')) {
        if (net.createFails) return new Response(JSON.stringify({ error: { description: 'nope' } }), { status: 400 });
        const body = JSON.parse(init.body);
        net.link = { ...net.link, reference_id: body.reference_id, amount: body.amount, currency: body.currency };
        return new Response(JSON.stringify({ id: 'plink_test1', short_url: 'https://rzp.io/i/abc', ...net.link }), { status: 200 });
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
  new Request(`https://mykrutidev.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'CF-Connecting-IP': ip },
    body: raw ?? JSON.stringify(body),
  });

const good = { productId: 'sample-test', email: 'Buyer@Example.com', accept: true, lang: 'hi' };
const orders = async () => (await DB.prepare('SELECT * FROM orders ORDER BY created_at, id').all()).results;

beforeEach(async () => {
  await ensureStoreSchema(DB);
  await DB.batch(['orders', 'feedback_rate'].map((t) => DB.prepare(`DELETE FROM ${t}`)));
  for (const o of (await FILES.list()).objects) await FILES.delete(o.key);
});

/** An order that went through checkout; returns its id. */
async function startOrder(net, env = ENV()) {
  const r = await handleCheckout(post('/api/store/checkout', good), env, { fetch: net.fetch });
  assert.equal(r.status, 201);
  return (await r.json()).order;
}

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
    assert.equal(call.body.callback_url, 'https://mykrutidev.com/store/thanks');
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
    assert.equal(net.calls[0].body.callback_url, 'https://claude-store.mykrutidev.pages.dev/store/thanks');

    const other = new Request('https://evil.example/api/store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.2' },
      body: JSON.stringify(good),
    });
    await handleCheckout(other, ENV(), { fetch: net.fetch });
    assert.equal(net.calls[1].body.callback_url, 'https://mykrutidev.com/store/thanks');
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
    const confirm = (body = { order: id }) => handleConfirm(post('/api/store/confirm', body), ENV(), { fetch: net.fetch });

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
    // Again (a refresh): the same answer.
    assert.deepEqual(await (await confirm()).json(), out);
  });

  test('paid without an email: no mail to the buyer, the owner is told, and the page is told to say "save this link"', async () => {
    const net = fakeNet();
    const env = { ...ENV(), RESEND_API_KEY: 're_test', NOTIFY_FROM: 'MyKrutiDev <contact@mykrutidev.com>', NOTIFY_TO: 'owner@example.com' };
    const r0 = await handleCheckout(post('/api/store/checkout', { ...good, email: '' }), env, { fetch: net.fetch });
    const id = (await r0.json()).order;
    net.pay();
    const r = await handleConfirm(post('/api/store/confirm', { order: id }), env, { fetch: net.fetch });
    const out = await r.json();
    assert.equal(out.state, 'paid');
    assert.equal(out.emailed, false);
    assert.equal(net.mails.length, 1, 'only the owner is mailed');
    assert.deepEqual(net.mails[0].to, ['owner@example.com']);
    assert.match(net.mails[0].text, /no email given/);
    assert.equal(net.mails[0].reply_to, undefined);
    assert.equal((await orders())[0].mail_status, 'none');
  });

  test('paid with an email: the answer says it was emailed', async () => {
    const net = fakeNet();
    const id = await startOrder(net);
    net.pay();
    const out = await (await handleConfirm(post('/api/store/confirm', { order: id }), ENV(), { fetch: net.fetch })).json();
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

  test('stops after the limit', async () => {
    const { id, token } = await paid();
    for (let i = 0; i < STORE.maxDownloads; i++) assert.equal((await download(id, token)).status, 200);
    const r = await download(id, token);
    assert.equal(r.status, 410);
    assert.match(await r.text(), /no longer available/);
    assert.equal(await left(id), STORE.maxDownloads);
  });

  test('several clicks at once cannot get past the limit', async () => {
    const { id, token } = await paid();
    await DB.prepare('UPDATE orders SET downloads = ? WHERE id = ?').bind(STORE.maxDownloads - 1, id).run();
    const results = await Promise.all(Array.from({ length: 5 }, () => download(id, token)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 410, 410, 410, 410]);
    assert.equal(await left(id), STORE.maxDownloads);
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
  const act = (action, id, headers = {}) => {
    const form = new URLSearchParams({ action, id });
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

  test('resend sends the email again; refund ends the downloads; extend gives a fresh set', async () => {
    const id = await startOrder(net);
    net.pay();
    await settleOrder(ENV(), id, { fetch: net.fetch });
    const before = net.mails.length;
    await act('resend', id);
    assert.equal(net.mails.length, before + 1);
    assert.equal(net.mails.at(-1).to[0], 'buyer@example.com');

    await DB.prepare('UPDATE orders SET downloads = 5, expires_at = 1000 WHERE id = ?').bind(id).run();
    await act('extend', id);
    const [row] = await orders();
    assert.equal(row.downloads, 0);
    assert.ok(row.expires_at > Date.now() / 1000 + (STORE.downloadDays - 1) * 86400);

    await act('refund', id);
    assert.equal((await orders())[0].status, 'refunded');
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

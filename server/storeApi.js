/**
 * The store's server side: starting an order, confirming the payment,
 * Razorpay's webhook, and the download.
 *
 *   POST /api/store/checkout   {productId, email, accept, token?}  -> {url}: Razorpay's payment page
 *   POST /api/store/confirm    {order}                              -> paid? and the download token
 *   POST /api/store/webhook    Razorpay's own call (signed)
 *   GET  /api/store/order      ?o=&t=   what the thanks page shows
 *   POST /api/store/download   o=&t=    the PDF (counts one download)
 *
 * Wired up by functions/api/store/*.js; kept here as plain request ->
 * response functions so the tests can call them with a local D1 and R2.
 *
 * THE RULES
 *  - The PRICE and the FILE come from src/lib/store.js, never from the request.
 *  - Nothing the browser says proves a payment. We ask Razorpay (razorpay.js).
 *  - An order is settled once: the UPDATE ... WHERE status = 'created' that
 *    wins is the only one that sends the emails.
 *  - The download token is an HMAC of the order id (STORE_TOKEN_SECRET), so the
 *    link can be shown again without keeping the token anywhere.
 *  - Downloads are counted in D1, with an expiry, and stop when the order is refunded.
 *
 * Environment (Cloudflare Pages -> Settings; docs/STORE.md has the steps):
 *   DB                          D1 (the same database as the feedback)
 *   STORE_FILES                 R2 bucket holding the PDFs
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 *   STORE_TOKEN_SECRET          16+ random characters, signs the download links
 *   STORE_TEST_PRODUCTS         "1" on a preview deployment, to sell the test product
 *   TURNSTILE_SECRET_KEY, RATE_LIMIT_SALT                     as for the feedback form
 *   RESEND_API_KEY, NOTIFY_FROM, NOTIFY_TO                    the emails (storeMail.js)
 */
import {
  LIMITS,
  ORDER_ID_RE,
  SITE_URL,
  STORE,
  STORE_SCHEMA,
  ORDER_ADDED_COLUMNS,
  TOKEN_RE,
  newOrderId,
  productById,
  sellable,
  validateCheckout,
} from '../src/lib/store.js';
import { clientIp, countHit, ensureSchema, rateSalt, reply, verifyTurnstile } from './feedbackApi.js';
import {
  RazorpayError,
  createPaymentLink,
  fetchPaymentLink,
  hasKeys,
  hmacHex,
  mode,
  isPaidFor,
  paymentIdOf,
  safeEqual,
  verifyWebhook,
} from './razorpay.js';
import { buyerMail, downloadPage, ownerMail, sendMail, canMail } from './storeMail.js';
import { stampPdf, stampText } from './storeStamp.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const ready = new WeakMap();
/** Columns added since the table first went live (ORDER_ADDED_COLUMNS), on a table that lacks them. */
export async function addColumns(db) {
  const { results } = await db.prepare('PRAGMA table_info(orders)').all();
  const have = new Set(results.map((c) => c.name));
  for (const [name, type] of ORDER_ADDED_COLUMNS) {
    if (have.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${type}`).run();
    } catch (e) {
      // Another worker added it at the same moment.
      if (!/duplicate column/i.test(String(e?.message ?? e))) throw e;
    }
  }
}
/** The orders table, once per database per worker (and the feedback tables the rate limit uses). */
export function ensureStoreSchema(db) {
  if (!ready.has(db)) {
    const p = ensureSchema(db)
      .then(() => db.batch(STORE_SCHEMA.map((s) => db.prepare(s))))
      .then(() => addColumns(db));
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return ready.get(db);
}

const tokenSecretOk = (env) => typeof env.STORE_TOKEN_SECRET === 'string' && env.STORE_TOKEN_SECRET.length >= 16;
/** Ready to take orders. */
export const canSell = (env) => !!env.DB && hasKeys(env) && tokenSecretOk(env);

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*mykrutidev\.(com|pages\.dev)$/;
/** Where Razorpay sends the buyer back: this deployment if it is ours, else the live site. */
export function siteOrigin(request) {
  const origin = new URL(request.url).origin;
  return ALLOWED_ORIGIN.test(origin) ? origin : SITE_URL;
}

/** The live site's own address (not a preview). */
export const isLiveHost = (request) => /^(www\.)?mykrutidev\.com$/.test(new URL(request.url).hostname);

/**
 * What would make a sale on this deployment unsafe, or null. On the live site,
 * Razorpay TEST keys would let anyone "pay" with Razorpay's published test
 * cards and get the real file, and STORE_TEST_PRODUCTS would put the test
 * products on sale: both are refused there, whatever the settings say.
 */
export function unsafeToSell(request, env) {
  if (!isLiveHost(request)) return null;
  if (mode(env) === 'test') return 'test-keys-on-live-site';
  return null;
}

/** The download token for an order: the HMAC of its id. */
export const downloadToken = (env, orderId) => hmacHex(env.STORE_TOKEN_SECRET, `dl1|${orderId}`);

async function tokenMatches(env, orderId, token) {
  if (!tokenSecretOk(env) || !ORDER_ID_RE.test(orderId ?? '') || !TOKEN_RE.test(token ?? '')) return false;
  return safeEqual(await downloadToken(env, orderId), token);
}

const isoNow = (now) => new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');

/** Rate-limit one kind of call from one IP. Returns a refusal Response or null. */
async function limited(request, env, scope, max, now) {
  const { hits, retryAfter } = await countHit(env.DB, clientIp(request), rateSalt(env), { scope, now });
  return hits > max ? reply(429, { ok: false, error: 'rate-limited' }, { 'Retry-After': String(retryAfter) }) : null;
}

/** Read a small JSON body. Returns {body} or {fail: Response}. */
async function readJson(request, max = LIMITS.body) {
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) {
    return { fail: reply(415, { ok: false, error: 'json-only' }) };
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > max) return { fail: reply(413, { ok: false, error: 'too-large' }) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > max) return { fail: reply(413, { ok: false, error: 'too-large' }) };
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { fail: reply(400, { ok: false, error: 'bad-json' }) };
  }
}

// ---------------------------------------------------------------------------
// POST /api/store/checkout
// ---------------------------------------------------------------------------

/** GET /api/store/checkout: is the store open on this deployment? */
export function handleStoreConfig(env, request) {
  const open = canSell(env) && !(request && unsafeToSell(request, env));
  return reply(200, { ok: true, open, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
}

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number, verify?: typeof verifyTurnstile }} [deps]
 */
export async function handleCheckout(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now();
  if (!canSell(env)) return reply(503, { ok: false, error: 'not-configured' });
  const unsafe = unsafeToSell(request, env);
  if (unsafe) {
    console.error('store refused a sale:', unsafe);
    return reply(503, { ok: false, error: 'not-configured' });
  }

  const got = await readJson(request);
  if (got.fail) return got.fail;
  await ensureStoreSchema(env.DB);
  const busy = await limited(request, env, 'checkout', STORE.checkoutPerHour, now);
  if (busy) return busy;

  const body = got.body;
  // The honeypot: a field no person can see. Anything in it is a bot.
  if (body && typeof body === 'object' && body.website !== undefined && body.website !== '') {
    return reply(400, { ok: false, error: 'rejected' });
  }
  const checked = validateCheckout(body);
  if (!checked.ok) return reply(400, { ok: false, error: 'invalid', details: checked.errors });

  if (env.TURNSTILE_SECRET_KEY) {
    const token = typeof body.token === 'string' ? body.token : '';
    const verify = deps.verify ?? verifyTurnstile;
    if (!token || token.length > 2048 || !(await verify(token, env.TURNSTILE_SECRET_KEY))) {
      return reply(403, { ok: false, error: 'challenge-failed' });
    }
  }

  const product = productById(checked.value.productId);
  // The test products are never sold on the live site, whatever STORE_TEST_PRODUCTS says.
  const sellEnv = isLiveHost(request) ? { ...env, STORE_TEST_PRODUCTS: '' } : env;
  if (!sellable(product, sellEnv)) return reply(404, { ok: false, error: 'unknown-product' });

  const db = env.DB;
  // Orders nobody paid are not kept: their emails are deleted after a week.
  const cutoff = isoNow(now - STORE.unpaidDays * 864e5);
  await db.prepare("DELETE FROM orders WHERE status IN ('created', 'failed') AND created_at < ?").bind(cutoff).run();

  const id = newOrderId();
  await db
    .prepare(
      "INSERT INTO orders (id, created_at, status, product_id, amount, currency, email, lang, max_downloads, mode) VALUES (?, ?, 'created', ?, ?, ?, ?, ?, ?, ?)",
    )
    // mode: which keys made it, so test orders on a shared database never count as money in.
    .bind(id, isoNow(now), product.id, product.pricePaise, STORE.currency, checked.value.email, checked.value.lang, STORE.maxDownloads, mode(env))
    .run();

  try {
    const link = await createPaymentLink(
      env,
      {
        referenceId: id,
        amountPaise: product.pricePaise,
        currency: STORE.currency,
        description: product.title,
        email: checked.value.email,
        callbackUrl: `${siteOrigin(request)}/store/thanks`,
        expireBy: Math.floor(now / 1000) + STORE.linkMinutes * 60,
      },
      fetchImpl,
    );
    await db.prepare('UPDATE orders SET link_id = ? WHERE id = ?').bind(link.id, id).run();
    return reply(201, { ok: true, url: link.url, order: id });
  } catch (e) {
    await db.prepare("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'created'").bind(id).run();
    console.error('payment link failed', e instanceof RazorpayError ? `${e.status} ${e.message}` : 'unknown');
    return reply(502, { ok: false, error: 'payment-provider' });
  }
}

// ---------------------------------------------------------------------------
// Settling an order: the one place that decides "paid"
// ---------------------------------------------------------------------------

async function sendOrderMails(env, order, { fetchImpl, origin }) {
  const product = productById(order.product_id);
  if (!product) return;
  let status = 'off';
  if (canMail(env)) {
    // No email given: nothing to send to the buyer, the download is on the page they land on.
    if (order.email) {
      const link = downloadPage(origin, order.id, await downloadToken(env, order.id));
      const sent = await sendMail(env, buyerMail(env, { order, product, link, origin }), fetchImpl);
      status = sent ? 'sent' : 'failed';
    } else {
      status = 'none';
    }
    if (String(env.NOTIFY_TO ?? '').trim()) await sendMail(env, ownerMail(env, { order, product, origin }), fetchImpl);
  }
  await env.DB.prepare('UPDATE orders SET mail_status = ? WHERE id = ?').bind(status, order.id).run();
}

/**
 * Is this order paid? Asks Razorpay; on "paid" marks the order and (once) sends
 * the emails.
 *
 * @param {Record<string, any>} env
 * @param {string} orderId
 * @param {{ fetch?: typeof fetch, now?: number, waitUntil?: (p: Promise<unknown>) => void, origin?: string, linkIdHint?: string }} [deps]
 * @returns {Promise<{ state: 'unknown' | 'pending' | 'unverified' | 'closed' | 'failed' | 'paid' | 'refunded', order?: any }>}
 */
export async function settleOrder(env, orderId, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now();
  const db = env.DB;
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return { state: 'unknown' };
  if (order.status === 'paid' || order.status === 'refunded' || order.status === 'failed') {
    return { state: order.status, order };
  }
  const linkId = order.link_id || deps.linkIdHint;
  if (!linkId) return { state: 'pending', order };

  let link;
  try {
    link = await fetchPaymentLink(env, linkId, fetchImpl);
  } catch {
    return { state: 'unverified', order };
  }
  if (!isPaidFor(link, order)) {
    return { state: link?.status === 'expired' || link?.status === 'cancelled' ? 'closed' : 'pending', order };
  }

  const paid = await db
    .prepare(
      "UPDATE orders SET status = 'paid', paid_at = ?, payment_id = ?, expires_at = ?, link_id = COALESCE(link_id, ?) WHERE id = ? AND status = 'created' RETURNING *",
    )
    .bind(isoNow(now), paymentIdOf(link), Math.floor(now / 1000) + STORE.downloadDays * 86400, linkId, orderId)
    .first();
  if (!paid) {
    // Another call settled it first, and sends the emails.
    return { state: 'paid', order: await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first() };
  }
  const job = sendOrderMails(env, paid, { fetchImpl, origin: deps.origin ?? SITE_URL });
  if (deps.waitUntil) deps.waitUntil(job);
  else await job;
  return { state: 'paid', order: paid };
}

/** What the thanks page needs to know about a paid order. */
async function paidView(env, order) {
  return {
    state: 'paid',
    productId: order.product_id,
    /** false: no email was given, so the page must tell the buyer to keep its link */
    emailed: !!order.email,
    token: await downloadToken(env, order.id),
    remaining: Math.max(0, order.max_downloads - order.downloads),
    expires: order.expires_at,
  };
}

// ---------------------------------------------------------------------------
// POST /api/store/confirm: the buyer is back from Razorpay
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number, waitUntil?: (p: Promise<unknown>) => void }} [deps]
 */
export async function handleConfirm(request, env, deps = {}) {
  if (!canSell(env)) return reply(503, { ok: false, error: 'not-configured' });
  const got = await readJson(request);
  if (got.fail) return got.fail;
  await ensureStoreSchema(env.DB);
  const busy = await limited(request, env, 'confirm', 90, deps.now);
  if (busy) return busy;

  const id = got.body?.order;
  if (typeof id !== 'string' || !ORDER_ID_RE.test(id)) return reply(400, { ok: false, error: 'invalid' });

  const result = await settleOrder(env, id, { ...deps, origin: siteOrigin(request) });
  if (result.state === 'unknown') return reply(404, { ok: false, error: 'unknown-order' });
  if (result.state === 'paid') return reply(200, { ok: true, ...(await paidView(env, result.order)) });
  return reply(200, { ok: true, state: result.state });
}

// ---------------------------------------------------------------------------
// POST /api/store/webhook: Razorpay tells us, whether or not the buyer came back
// ---------------------------------------------------------------------------

/**
 * Events used: payment_link.paid (settle the order) and refund.processed (a full
 * refund ends the downloads). Anything else is acknowledged and ignored.
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number, waitUntil?: (p: Promise<unknown>) => void }} [deps]
 */
export async function handleWebhook(request, env, deps = {}) {
  if (!env.DB || !env.RAZORPAY_WEBHOOK_SECRET || !tokenSecretOk(env)) return reply(503, { ok: false, error: 'not-configured' });
  const raw = await request.text();
  if (raw.length > 256 * 1024) return reply(413, { ok: false, error: 'too-large' });
  if (!(await verifyWebhook(raw, request.headers.get('X-Razorpay-Signature'), env.RAZORPAY_WEBHOOK_SECRET))) {
    return reply(400, { ok: false, error: 'bad-signature' });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'bad-json' });
  }
  await ensureStoreSchema(env.DB);

  if (event?.event === 'payment_link.paid') {
    const link = event?.payload?.payment_link?.entity;
    const id = link?.reference_id;
    if (typeof id === 'string' && ORDER_ID_RE.test(id)) {
      await settleOrder(env, id, { ...deps, origin: siteOrigin(request), linkIdHint: typeof link?.id === 'string' ? link.id : undefined });
    }
  } else if (event?.event === 'refund.processed') {
    const refund = event?.payload?.refund?.entity;
    const paymentId = refund?.payment_id;
    if (typeof paymentId === 'string' && paymentId) {
      const order = await env.DB.prepare("SELECT id, amount FROM orders WHERE payment_id = ? AND status = 'paid'").bind(paymentId).first();
      // Only a full refund ends the downloads; a partial one leaves the buyer their book.
      if (order && Number(refund?.amount) >= order.amount) {
        await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid'").bind(order.id).run();
      }
    }
  }
  return reply(200, { ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/store/order: what the thanks page shows for a link from the email
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ now?: number }} [deps]
 */
export async function handleOrderStatus(request, env, deps = {}) {
  if (!env.DB || !tokenSecretOk(env)) return reply(503, { ok: false, error: 'not-configured' });
  await ensureStoreSchema(env.DB);
  const busy = await limited(request, env, 'status', 120, deps.now);
  if (busy) return busy;

  const params = new URL(request.url).searchParams;
  const id = params.get('o') ?? '';
  if (!(await tokenMatches(env, id, params.get('t') ?? ''))) return reply(404, { ok: false, error: 'unknown-order' });
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) return reply(404, { ok: false, error: 'unknown-order' });
  if (order.status !== 'paid') return reply(200, { ok: true, state: order.status });
  const now = Math.floor((deps.now ?? Date.now()) / 1000);
  const expired = order.expires_at !== null && order.expires_at <= now;
  return reply(200, { ok: true, ...(await paidView(env, order)), state: expired ? 'expired' : 'paid' });
}

// ---------------------------------------------------------------------------
// POST /api/store/download
// ---------------------------------------------------------------------------

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
};

/** A form post that fails lands here: a short page, not a JSON blob. */
function problem(status, english, hindi) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>MyKrutiDev</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1a2744}a{color:#a8442a}</style></head><body><h1>MyKrutiDev</h1><p>${english}</p><p lang="hi">${hindi}</p><p><a href="/contact">Contact / संपर्क</a> · <a href="/refund-policy">Refund policy</a></p></body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

/**
 * Hand over the PDF and count one download. The count goes up in one UPDATE
 * that also checks the order is paid, not refunded, not expired and under its
 * limit, so two quick clicks can never get past the limit.
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ now?: number }} [deps]
 */
export async function handleDownload(request, env, deps = {}) {
  if (!env.DB || !tokenSecretOk(env)) return problem(503, 'The store is not available right now.', 'स्टोर अभी उपलब्ध नहीं है।');
  await ensureStoreSchema(env.DB);
  const busy = await limited(request, env, 'download', 60, deps.now);
  if (busy) return problem(429, 'Too many tries. Please wait a little and try again.', 'बहुत बार कोशिश हो गई। थोड़ी देर बाद फिर कोशिश करें।');

  let id = '';
  let token = '';
  try {
    const form = await request.formData();
    id = String(form.get('o') ?? '');
    token = String(form.get('t') ?? '');
  } catch {
    return problem(400, 'This download link is not valid.', 'यह डाउनलोड लिंक सही नहीं है।');
  }
  if (!(await tokenMatches(env, id, token))) return problem(404, 'This download link is not valid.', 'यह डाउनलोड लिंक सही नहीं है।');

  const now = Math.floor((deps.now ?? Date.now()) / 1000);
  const db = env.DB;
  const counted = await db
    .prepare(
      "UPDATE orders SET downloads = downloads + 1 WHERE id = ? AND status = 'paid' AND downloads < max_downloads AND (expires_at IS NULL OR expires_at > ?) RETURNING product_id, email",
    )
    .bind(id, now)
    .first();
  if (!counted) {
    return problem(
      410,
      'This download is no longer available: it has expired, reached its limit or been refunded. Write to us and we will help.',
      'यह डाउनलोड अब उपलब्ध नहीं है: समय पूरा हो गया, सीमा पूरी हो गई या पैसे लौटा दिए गए। हमें लिखें, हम मदद करेंगे।',
    );
  }

  const product = productById(counted.product_id);
  const object = product && env.STORE_FILES ? await env.STORE_FILES.get(product.file) : null;
  if (!object) {
    // Nothing was handed over, so it does not count.
    await db.prepare('UPDATE orders SET downloads = downloads - 1 WHERE id = ? AND downloads > 0').bind(id).run();
    console.error('store file missing', product?.file ?? counted.product_id);
    return problem(503, 'The file is not available right now. Please try again later or write to us.', 'फ़ाइल अभी उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें या हमें लिखें।');
  }
  // The buyer's own copy: the file's stamp slots are overwritten with who it was sold to (server/storeStamp.js).
  // A file that was not prepared has no slot and is served as it is.
  let body;
  let size = object.size;
  if (product.stamp) {
    // (read the object as bytes and never touch object.body: a body can be consumed once)
    const bytes = new Uint8Array(await object.arrayBuffer());
    body = bytes;
    size = bytes.length;
    try {
      const done = stampPdf(bytes, stampText({ id, email: counted.email }));
      if (done.count === 0) console.error('store file has no stamp slot, served unstamped:', product.file);
    } catch (e) {
      console.error('stamping failed, served unstamped:', e?.message || e);
    }
  } else {
    body = object.body;
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      ...(size ? { 'Content-Length': String(size) } : {}),
      'Content-Disposition': `attachment; filename="${product.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

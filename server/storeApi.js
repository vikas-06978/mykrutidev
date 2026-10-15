/**
 * The store's server side: starting an order, confirming the payment,
 * Razorpay's webhook, and the download.
 *
 *   POST /api/store/checkout   {productId, email, accept, token?}  -> {url}: Razorpay's payment page
 *   POST /api/store/confirm    {order}                              -> paid? and the download token
 *   POST /api/store/webhook    Razorpay's own call (signed)
 *   GET  /api/store/order      ?o=&t=   what the thanks page shows
 *   POST /api/store/download   o=&t=    the PDF (counts one download)
 *   POST /api/store/email      {o, t, email}                        the buyer corrects their email (once)
 *   POST /api/store/find       {email, token?}                      "send me my link again", to that email only
 *   POST /api/store/mail-webhook  Resend's delivery report (signed): delivered / bounced / complained
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
 *   RESEND_WEBHOOK_SECRET       the whsec_... secret of the Resend webhook (delivery reports)
 */
import {
  LIMITS,
  ORDER_ID_RE,
  SITE_URL,
  STORE,
  STORE_SCHEMA,
  ORDER_ADDED_COLUMNS,
  TOKEN_RE,
  cleanEmail,
  newOrderId,
  productById,
  sellable,
  validateCheckout,
} from '../src/lib/store.js';
import { clientIp, countHit, ensureSchema, rateSalt, reply, verifyTurnstile } from './feedbackApi.js';
import {
  RazorpayError,
  contactOf,
  createPaymentLink,
  fetchPayment,
  fetchPaymentLink,
  hasKeys,
  hmacHex,
  mode,
  isPaidFor,
  paymentIdOf,
  safeEqual,
  verifyReturn,
  verifyWebhook,
} from './razorpay.js';
import {
  alertMail,
  buyerMail,
  canMail,
  changedMail,
  downloadPage,
  findMail,
  owners,
  ownerMail,
  sendMail,
  sendMailId,
  verifyResendWebhook,
} from './storeMail.js';
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

/**
 * The download key for an order: the HMAC of its id and key version. Version 0
 * is the original form, so links sent before versions existed keep working.
 * A changed email moves the version on (token_ver), and the old link stops.
 */
export const downloadToken = (env, orderId, ver = 0) =>
  hmacHex(env.STORE_TOKEN_SECRET, ver ? `dl1|${orderId}|${ver}` : `dl1|${orderId}`);

/** The current download key of an order row. */
export const keyFor = (env, order) => downloadToken(env, order.id, order.token_ver ?? 0);

/**
 * The management key: only the browser that bought gets it (with its checkout
 * secret, or Razorpay's signed return). It may change the order's email; the
 * download key in an emailed or shared link may not.
 */
export const manageToken = (env, orderId) => hmacHex(env.STORE_TOKEN_SECRET, `mg1|${orderId}`);

/** The order a download key belongs to (its current version), or null. */
async function orderByToken(env, orderId, token) {
  if (!tokenSecretOk(env) || !ORDER_ID_RE.test(orderId ?? '') || !TOKEN_RE.test(token ?? '')) return null;
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return null;
  return (await safeEqual(await keyFor(env, order), token)) ? order : null;
}

/** The order a management key belongs to, or null. */
async function orderByManage(env, orderId, key) {
  if (!tokenSecretOk(env) || !ORDER_ID_RE.test(orderId ?? '') || !TOKEN_RE.test(key ?? '')) return null;
  if (!(await safeEqual(await manageToken(env, orderId), key))) return null;
  return env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
}

/** SHA-256 hex. */
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random secret, 128 bits as hex. */
function newSecret() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CLAIM_RE = /^[a-f0-9]{32}$/;

/** Does this checkout secret belong to the order? */
async function claimMatches(order, claim) {
  if (!order?.claim_hash || typeof claim !== 'string' || !CLAIM_RE.test(claim)) return false;
  return safeEqual(order.claim_hash, await sha256(claim));
}

const isoNow = (now) => new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');

/** One line in the audit trail (store_audit). Never a key or a secret. Never throws. */
export async function audit(env, orderId, action, detail = '', now = Date.now()) {
  try {
    await env.DB.prepare('INSERT INTO store_audit (at, order_id, action, detail) VALUES (?, ?, ?, ?)')
      .bind(isoNow(now), orderId ?? null, action, String(detail).slice(0, 300))
      .run();
  } catch (e) {
    console.error('audit failed', action, e?.message || e);
  }
}

/**
 * Record a provider event id; false if it was seen before (a repeat delivery).
 * Ids older than 30 days are forgotten. A missing id is treated as new.
 */
async function firstTime(env, eventId, nowMs = Date.now()) {
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(eventId)) return true;
  const nowS = Math.floor(nowMs / 1000);
  await env.DB.prepare('DELETE FROM store_events WHERE at < ?').bind(nowS - 30 * 86400).run();
  const r = await env.DB.prepare('INSERT INTO store_events (id, at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING RETURNING id').bind(eventId, nowS).first();
  return !!r;
}

/** store_meta: a small note the store keeps (when a webhook last came, when the check last ran). */
export async function setMeta(env, key, value) {
  await env.DB.prepare('INSERT INTO store_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value))
    .run();
}
export async function getMeta(env, key) {
  return (await env.DB.prepare('SELECT value FROM store_meta WHERE key = ?').bind(key).first())?.value ?? null;
}

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

  // A second Pay from the same browser (a refresh, another tab, a lost answer):
  // the unpaid order it started, and its still-open Razorpay page, are reused,
  // so one person does not end up with two payment pages to pay.
  const resume = body.resume;
  if (resume && typeof resume === 'object' && ORDER_ID_RE.test(resume.order ?? '')) {
    const open = await db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'created'").bind(resume.order).first();
    const fresh = open && Date.parse(open.created_at) > now - (STORE.linkMinutes - 10) * 60e3;
    if (fresh && open.product_id === product.id && open.link_url && (await claimMatches(open, resume.claim))) {
      if (checked.value.email && checked.value.email !== open.email) {
        await db.prepare('UPDATE orders SET email = ? WHERE id = ?').bind(checked.value.email, open.id).run();
      }
      return reply(200, { ok: true, url: open.link_url, order: open.id, claim: resume.claim, reused: true });
    }
  }

  const id = newOrderId();
  // The buying browser's own secret: it alone (with Razorpay's signed return)
  // gets this order's download and management keys. Only its hash is stored.
  const claim = newSecret();
  await db
    .prepare(
      "INSERT INTO orders (id, created_at, status, product_id, amount, currency, email, lang, max_downloads, mode, claim_hash) VALUES (?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    // mode: which keys made it, so test orders on a shared database never count as money in.
    .bind(id, isoNow(now), product.id, product.pricePaise, STORE.currency, checked.value.email, checked.value.lang, STORE.maxDownloads, mode(env), await sha256(claim))
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
        // Back to the thanks page in the buyer's own language.
        callbackUrl: `${siteOrigin(request)}${checked.value.lang !== 'en' ? `/${checked.value.lang}` : ''}/store/thanks`,
        expireBy: Math.floor(now / 1000) + STORE.linkMinutes * 60,
      },
      fetchImpl,
    );
    await db.prepare('UPDATE orders SET link_id = ?, link_url = ? WHERE id = ?').bind(link.id, link.url, id).run();
    return reply(201, { ok: true, url: link.url, order: id, claim });
  } catch (e) {
    await db.prepare("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'created'").bind(id).run();
    console.error('payment link failed', e instanceof RazorpayError ? `${e.status} ${e.message}` : 'unknown');
    return reply(502, { ok: false, error: 'payment-provider' });
  }
}

// ---------------------------------------------------------------------------
// Settling an order: the one place that decides "paid"
// ---------------------------------------------------------------------------

/**
 * The buyer's mobile, from Razorpay's record of the payment, kept on the order
 * for the owner (sale email, alerts, orders page). Never throws: without it
 * the owner just has no WhatsApp button for this order.
 */
async function recordPhone(env, order, fetchImpl) {
  if (order.phone || !order.payment_id) return order;
  try {
    const phone = contactOf(await fetchPayment(env, order.payment_id, fetchImpl));
    if (!phone) return order;
    await env.DB.prepare('UPDATE orders SET phone = ? WHERE id = ?').bind(phone, order.id).run();
    return { ...order, phone };
  } catch {
    return order;
  }
}

/**
 * Send the buyer their download email and record it: mail_status 'sent' with
 * Resend's id (so its delivery report finds the order), 'failed', or 'off'
 * (no mail setup). Returns the status. Never throws.
 */
export async function sendBuyerLink(env, order, { fetchImpl = fetch, origin = SITE_URL } = {}) {
  const product = productById(order.product_id);
  if (!product || !order.email) return 'none';
  let status = 'off';
  let mailId = null;
  if (canMail(env)) {
    const link = downloadPage(origin, order.id, await keyFor(env, order), order.lang);
    mailId = await sendMailId(env, buyerMail(env, { order, product, link, origin }), fetchImpl);
    status = mailId === null ? 'failed' : 'sent';
  }
  // A failed send is retried by the background check with a growing wait
  // (5 min, 10, 20, ... up to STORE.mailRetries tries); a sent one resets that.
  const now = Math.floor(Date.now() / 1000);
  const tries = status === 'failed' ? (order.mail_tries ?? 0) + 1 : 0;
  const next = status === 'failed' ? now + 300 * 2 ** Math.min(tries - 1, 6) : null;
  await env.DB.prepare('UPDATE orders SET mail_status = ?, mail_id = ?, mail_tries = ?, mail_next = ? WHERE id = ?')
    .bind(status, mailId || null, tries, next, order.id)
    .run();
  return status;
}

async function sendOrderMails(env, order, { fetchImpl, origin }) {
  const product = productById(order.product_id);
  if (!product) return;
  const withPhone = await recordPhone(env, order, fetchImpl);
  if (withPhone.email) {
    await sendBuyerLink(env, withPhone, { fetchImpl, origin });
  } else {
    // No email given: nothing to send to the buyer, the download is on the page they land on.
    await env.DB.prepare('UPDATE orders SET mail_status = ? WHERE id = ?').bind(canMail(env) ? 'none' : 'off', order.id).run();
  }
  if (canMail(env) && owners(env).length) {
    await sendMail(env, ownerMail(env, { order: withPhone, product, origin, token: await keyFor(env, order) }), fetchImpl);
  }
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
  // An order made with the other keys (a test order seen by the live site, or
  // the reverse) is never settled here: its link belongs to the other account.
  if (order.mode && order.mode !== mode(env)) return { state: 'unverified', order };
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
  return { state: 'paid', order: paid, fresh: true };
}

/**
 * May the buyer change this order's email themselves? Once, within
 * STORE.emailChangeHours of paying, or at any time if our email to them
 * bounced or was marked as spam. Never on a refunded order.
 */
export function canBuyerChangeEmail(order, nowMs = Date.now()) {
  if (order.status !== 'paid' || (order.buyer_email_changes ?? 0) >= 1) return false;
  if (order.mail_status === 'bounced' || order.mail_status === 'complained') return true;
  const paid = Date.parse(order.paid_at ?? '');
  return Number.isFinite(paid) && nowMs - paid <= STORE.emailChangeHours * 3600e3;
}

/**
 * What the thanks page shows a key holder about their order: the download
 * state, the receipt (kept after expiry or a refund too), and where the link
 * was emailed. `manage` adds the management key: only for the browser that
 * bought (its checkout secret or Razorpay's signed return), never for a link
 * from an email or a lost-link request.
 */
async function orderView(env, order, nowMs = Date.now(), { manage = false } = {}) {
  const nowS = Math.floor(nowMs / 1000);
  const used = order.downloads >= order.max_downloads;
  const expired = order.expires_at !== null && order.expires_at !== undefined && order.expires_at <= nowS;
  const state = order.status === 'refunded' ? 'refunded' : order.status !== 'paid' ? order.status : expired ? 'expired' : used ? 'used' : 'paid';
  return {
    state,
    productId: order.product_id,
    /** false: no email was given, so the page must tell the buyer to keep its link */
    emailed: !!order.email,
    /** Shown to the holder of the link (the buyer), so a mistyped address is noticed. */
    email: order.email || '',
    /** What we know of the download email: sent, delivered, failed (will retry), bounced, complained, none, off. */
    mailStatus: order.mail_status || '',
    canChangeEmail: manage && canBuyerChangeEmail(order, nowMs),
    token: await keyFor(env, order),
    ...(manage ? { manage: await manageToken(env, order.id) } : {}),
    remaining: Math.max(0, order.max_downloads - order.downloads),
    expires: order.expires_at,
    // The receipt: what was bought, for how much, when, and the references to quote.
    receipt: {
      order: order.id,
      amount: order.amount,
      currency: order.currency,
      paidAt: order.paid_at,
      payment: order.payment_id,
      refunded: order.refunded_amount || (order.status === 'refunded' ? order.amount : 0),
    },
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
  if (result.state !== 'paid') return reply(200, { ok: true, state: result.state });
  // Paid. Knowing the order id is not enough to get its keys: the browser must
  // hold the checkout secret, or bring Razorpay's signed return for THIS order
  // and payment. Orders from before the secret existed have none to check.
  const order = result.order;
  const r = got.body?.rzp;
  const signed =
    r && typeof r === 'object' && r.linkId === order.link_id && r.referenceId === order.id && r.status === 'paid' &&
    (!order.payment_id || r.paymentId === order.payment_id) &&
    (await verifyReturn(env, r));
  const owner = !order.claim_hash || signed || (await claimMatches(order, got.body?.claim));
  if (!owner) {
    // Paid, and the email (if any) has the link: say so, without the keys.
    return reply(200, { ok: true, state: 'paid', locked: true, emailed: !!order.email });
  }
  return reply(200, { ok: true, ...(await orderView(env, order, deps.now, { manage: true })) });
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
  const nowMs = deps.now ?? Date.now();
  await setMeta(env, 'razorpay_webhook_at', isoNow(nowMs));
  // Razorpay may deliver one event more than once: a repeat does nothing.
  if (!(await firstTime(env, request.headers.get('X-Razorpay-Event-Id'), nowMs))) return reply(200, { ok: true, repeat: true });

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
      const amount = Math.max(0, Math.floor(Number(refund?.amount) || 0));
      // Razorpay sends the payment with the refund: its amount_refunded is the
      // running total, so a repeat or a total the background check already saw
      // is not counted twice. Without it, each refund adds up. Only refunds
      // reaching the full amount end the downloads: a partial (goodwill)
      // refund leaves the buyer their book. A refunded order is never reopened
      // by a late "paid" (settleOrder only moves an order on from 'created').
      const total = Number(event?.payload?.payment?.entity?.amount_refunded);
      const sum = Number.isFinite(total) && total >= 0 ? 'MAX(refunded_amount, ?)' : 'refunded_amount + ?';
      const by = Number.isFinite(total) && total >= 0 ? Math.floor(total) : amount;
      const order = await env.DB.prepare(
        `UPDATE orders SET refunded_amount = MIN(amount, ${sum}), status = CASE WHEN ${sum} >= amount THEN 'refunded' ELSE status END WHERE payment_id = ? AND status IN ('paid', 'refunded') RETURNING id, status, refunded_amount, amount`,
      )
        .bind(by, by, paymentId)
        .first();
      if (order) await audit(env, order.id, order.status === 'refunded' ? 'refund-full' : 'refund-partial', `Razorpay refund ${amount} paise; refunded ${order.refunded_amount} of ${order.amount}`, nowMs);
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

  // POST {o, t, m}: the keys stay out of URLs and server logs. (GET ?o=&t= still
  // answers, without the management key, for a page cached before this change.)
  let keys;
  if (request.method === 'POST') {
    const got = await readJson(request);
    if (got.fail) return got.fail;
    keys = got.body && typeof got.body === 'object' ? got.body : {};
  } else {
    const q = new URL(request.url).searchParams;
    keys = { o: q.get('o'), t: q.get('t') };
  }
  const id = String(keys.o ?? '');
  const order = await orderByToken(env, id, String(keys.t ?? ''));
  if (!order) return reply(404, { ok: false, error: 'unknown-order' });
  // A refunded, expired or used-up order still shows its receipt and why it closed.
  if (order.status !== 'paid' && order.status !== 'refunded') return reply(200, { ok: true, state: order.status });
  // The management key travels with this request only if the page already has it.
  const manage = request.method === 'POST' && !!(await orderByManage(env, id, String(keys.m ?? '')));
  return reply(200, { ok: true, ...(await orderView(env, order, deps.now, { manage })) });
}

// ---------------------------------------------------------------------------
// POST /api/store/email: the buyer corrects their email (once)
// ---------------------------------------------------------------------------

/**
 * The buyer corrects their email. Only with the MANAGEMENT key, which only the
 * browser that bought holds: a download link from an email (or one shared or
 * misdelivered) cannot redirect the order's mail. The download key moves on to
 * a new version, so a link that went to a wrong address stops working; the
 * new address gets the new link, and the buying browser gets the new key back. Once per
 * order, within STORE.emailChangeHours of paying (any time if our email
 * bounced). It is the same link with the same downloads left, so a changed
 * address never means another copy. The owner is told, with both addresses.
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number }} [deps]
 */
export async function handleChangeEmail(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now();
  if (!env.DB || !tokenSecretOk(env)) return reply(503, { ok: false, error: 'not-configured' });
  const got = await readJson(request);
  if (got.fail) return got.fail;
  await ensureStoreSchema(env.DB);
  const busy = await limited(request, env, 'email', 20, now);
  if (busy) return busy;

  const { o, m } = got.body ?? {};
  const order = await orderByManage(env, o, m);
  if (!order) return reply(404, { ok: false, error: 'unknown-order' });
  const email = cleanEmail(got.body?.email);
  if (!email) return reply(400, { ok: false, error: 'invalid' });

  const db = env.DB;
  if (order.email === email) return reply(400, { ok: false, error: 'same' });
  if (!canBuyerChangeEmail(order, now)) return reply(409, { ok: false, error: 'not-allowed' });

  // One UPDATE that checks the rule again, so two quick tries cannot both change it.
  const since = isoNow(now - STORE.emailChangeHours * 3600e3);
  const changed = await db
    .prepare(
      `UPDATE orders SET email_prev = email, email = ?, email_changed_by = 'buyer', email_changed_at = ?,
         buyer_email_changes = buyer_email_changes + 1, token_ver = token_ver + 1
       WHERE id = ? AND status = 'paid' AND buyer_email_changes = 0
         AND (paid_at >= ? OR mail_status IN ('bounced', 'complained'))
       RETURNING *`,
    )
    .bind(email, isoNow(now), o, since)
    .first();
  if (!changed) return reply(409, { ok: false, error: 'not-allowed' });
  await audit(env, changed.id, 'email-changed-by-buyer', `${changed.email_prev || '(none)'} -> ${email}`, now);

  const status = await sendBuyerLink(env, changed, { fetchImpl, origin: siteOrigin(request) });
  const product = productById(changed.product_id);
  if (product && canMail(env) && owners(env).length) {
    await sendMail(env, changedMail(env, { order: changed, product, origin: siteOrigin(request) }), fetchImpl);
  }
  return reply(200, { ok: true, email, sent: status === 'sent', token: await keyFor(env, changed) });
}

// ---------------------------------------------------------------------------
// POST /api/store/find: "send me my download link again"
// ---------------------------------------------------------------------------

/**
 * Someone types an email: if it has paid, unexpired orders here (of this
 * deployment's mode), their links are emailed to THAT address; the links are
 * never shown on the page. The answer says plainly what happened, as the
 * owner asked: `found` 'sent' (emailed), 'none' (no paid purchase with this
 * email) or 'closed' (paid, but every link has expired, run out of downloads
 * or been refunded). Limited per IP and per address (STORE.findPerDay, 429
 * 'email-limit'), with the bot check when it is set up.
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number, verify?: typeof verifyTurnstile }} [deps]
 */
export async function handleFind(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now();
  if (!env.DB || !tokenSecretOk(env)) return reply(503, { ok: false, error: 'not-configured' });
  const got = await readJson(request);
  if (got.fail) return got.fail;
  await ensureStoreSchema(env.DB);
  const busy = await limited(request, env, 'find', 10, now);
  if (busy) return busy;

  const body = got.body ?? {};
  if (body.website !== undefined && body.website !== '') return reply(400, { ok: false, error: 'rejected' });
  const email = cleanEmail(body.email);
  if (!email) return reply(400, { ok: false, error: 'invalid' });
  if (env.TURNSTILE_SECRET_KEY) {
    const token = typeof body.token === 'string' ? body.token : '';
    const verify = deps.verify ?? verifyTurnstile;
    if (!token || token.length > 2048 || !(await verify(token, env.TURNSTILE_SECRET_KEY))) {
      return reply(403, { ok: false, error: 'challenge-failed' });
    }
  }
  // Per address, over a day: hourly buckets would let someone flood one inbox.
  const { hits } = await countHit(env.DB, email, rateSalt(env), { scope: 'find-email', now, windowSeconds: 86400 });
  if (hits > STORE.findPerDay) return reply(429, { ok: false, error: 'email-limit' });

  const nowS = Math.floor(now / 1000);
  const { results } = await env.DB.prepare(
    "SELECT * FROM orders WHERE email = ? AND status = 'paid' AND (expires_at IS NULL OR expires_at > ?) AND downloads < max_downloads AND COALESCE(mode, 'test') = ? ORDER BY paid_at DESC LIMIT 10",
  )
    .bind(email, nowS, mode(env))
    .all();
  if (!results.length) {
    // Paid once, but nothing left to download: say so, rather than "not found".
    const any = await env.DB.prepare(
      "SELECT 1 AS x FROM orders WHERE email = ? AND status IN ('paid', 'refunded') AND COALESCE(mode, 'test') = ? LIMIT 1",
    )
      .bind(email, mode(env))
      .first();
    return reply(200, { ok: true, found: any ? 'closed' : 'none' });
  }
  if (canMail(env)) {
    const origin = siteOrigin(request);
    const lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'en';
    const items = [];
    for (const order of results) {
      const product = productById(order.product_id);
      if (product) items.push({ product, order, link: downloadPage(origin, order.id, await keyFor(env, order), lang) });
    }
    if (items.length && (await sendMail(env, findMail(env, { email, items }), fetchImpl))) {
      return reply(200, { ok: true, found: 'sent' });
    }
  }
  // Found, but the email could not be sent (no mail setup, or Resend refused).
  return reply(502, { ok: false, error: 'mail-failed' });
}

// ---------------------------------------------------------------------------
// POST /api/store/mail-webhook: Resend's delivery reports
// ---------------------------------------------------------------------------

const MAIL_EVENTS = { 'email.delivered': 'delivered', 'email.bounced': 'bounced', 'email.complained': 'complained' };

/**
 * delivered: the order's download email reached the inbox (a record, should a
 * buyer later say it never came). bounced / complained: it did not, or was
 * marked as spam; the order is flagged and the owner gets an alert with
 * WhatsApp buttons carrying the link. Reports for other emails are ignored.
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number }} [deps]
 */
export async function handleMailWebhook(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  if (!env.DB || !env.RESEND_WEBHOOK_SECRET || !tokenSecretOk(env)) return reply(503, { ok: false, error: 'not-configured' });
  const raw = await request.text();
  if (raw.length > 256 * 1024) return reply(413, { ok: false, error: 'too-large' });
  if (!(await verifyResendWebhook(raw, request.headers, env.RESEND_WEBHOOK_SECRET, deps.now))) {
    return reply(400, { ok: false, error: 'bad-signature' });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'bad-json' });
  }
  await ensureStoreSchema(env.DB);
  await setMeta(env, 'resend_webhook_at', isoNow(deps.now ?? Date.now()));
  if (!(await firstTime(env, `resend:${request.headers.get('svix-id') ?? ''}`, deps.now))) return reply(200, { ok: true, repeat: true });
  const status = MAIL_EVENTS[event?.type];
  const mailId = event?.data?.email_id;
  if (!status || typeof mailId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(mailId)) return reply(200, { ok: true });
  const db = env.DB;
  // "delivered" never hides a bounce or a complaint that came first.
  const order =
    status === 'delivered'
      ? await db
          .prepare("UPDATE orders SET mail_status = 'delivered' WHERE mail_id = ? AND (mail_status IS NULL OR mail_status = 'sent') RETURNING *")
          .bind(mailId)
          .first()
      : await db.prepare('UPDATE orders SET mail_status = ? WHERE mail_id = ? AND (mail_status IS NULL OR mail_status != ?) RETURNING *').bind(status, mailId, status).first();
  if (order && status !== 'delivered' && order.status === 'paid') {
    const product = productById(order.product_id);
    if (product && canMail(env) && owners(env).length) {
      const token = await keyFor(env, order);
      await sendMail(env, alertMail(env, { order, product, origin: siteOrigin(request), token, what: status }), fetchImpl);
    }
  }
  return reply(200, { ok: true });
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
 * Hand over the PDF, counting DOWNLOAD SESSIONS, not taps.
 *
 * 1. The key must be this order's current download key; the order must be
 *    paid, not refunded, not expired, and have a session open or one left.
 * 2. The buyer's stamped copy is prepared first. If the file is missing or
 *    cannot be read, nothing is counted.
 * 3. Then one UPDATE grants the session: a new one costs one download; within
 *    STORE.sessionMinutes of the last one, a tap, a retry after a dropped
 *    connection or a second click costs nothing. Two clicks at the same moment
 *    with one download left get one session, never two.
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
  const order = await orderByToken(env, id, token);
  if (!order) return problem(404, 'This download link is not valid.', 'यह डाउनलोड लिंक सही नहीं है।');

  const now = Math.floor((deps.now ?? Date.now()) / 1000);
  const windowStart = now - STORE.sessionMinutes * 60;
  const closed = () =>
    problem(
      410,
      'This download is no longer available: it has expired, reached its limit or been refunded. A copy you saved still works. Write to us and we will help.',
      'यह डाउनलोड अब उपलब्ध नहीं है: समय पूरा हो गया, सीमा पूरी हो गई या पैसे लौटा दिए गए। आपकी सेव की हुई कॉपी चलती रहेगी। हमें लिखें, हम मदद करेंगे।',
    );
  const inSession = order.session_at !== null && order.session_at !== undefined && order.session_at > windowStart;
  const open = order.status === 'paid' && (order.expires_at === null || order.expires_at > now);
  if (!open || (!inSession && order.downloads >= order.max_downloads)) return closed();

  // Prepare the buyer's copy before anything is counted.
  const product = productById(order.product_id);
  const object = product && env.STORE_FILES ? await env.STORE_FILES.get(product.file).catch(() => null) : null;
  let bytes = null;
  try {
    bytes = object ? new Uint8Array(await object.arrayBuffer()) : null;
  } catch {
    bytes = null;
  }
  if (!bytes || bytes.length === 0) {
    console.error('store file missing or empty', product?.file ?? order.product_id);
    await audit(env, id, 'download-file-missing', product?.file ?? order.product_id, deps.now);
    return problem(503, 'The file is not available right now. Nothing was used up. Please try again later or write to us.', 'फ़ाइल अभी उपलब्ध नहीं है। कोई डाउनलोड नहीं कटा। थोड़ी देर बाद कोशिश करें या हमें लिखें।');
  }
  // The buyer's own copy: the file's stamp slots are overwritten with who it was sold to (server/storeStamp.js).
  // A file that was not prepared has no slot and is served as it is.
  if (product.stamp) {
    try {
      const done = stampPdf(bytes, stampText({ id, email: order.email }));
      if (done.count === 0) console.error('store file has no stamp slot, served unstamped:', product.file);
    } catch (e) {
      console.error('stamping failed, served unstamped:', e?.message || e);
    }
  }

  // The file is ready: grant (or reuse) the session, in one statement.
  const newSession = newSecret();
  const granted = await env.DB.prepare(
    `UPDATE orders SET
       downloads = downloads + (CASE WHEN session_at IS NOT NULL AND session_at > ?2 THEN 0 ELSE 1 END),
       session_id = CASE WHEN session_at IS NOT NULL AND session_at > ?2 THEN session_id ELSE ?3 END,
       session_at = CASE WHEN session_at IS NOT NULL AND session_at > ?2 THEN session_at ELSE ?4 END
     WHERE id = ?1 AND status = 'paid' AND (expires_at IS NULL OR expires_at > ?4)
       AND ((session_at IS NOT NULL AND session_at > ?2) OR downloads < max_downloads)
     RETURNING session_id`,
  )
    .bind(id, windowStart, newSession, now)
    .first();
  if (!granted) return closed();

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${product.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'none',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

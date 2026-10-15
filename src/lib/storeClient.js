/**
 * The little the store's pages decide in the browser, kept apart from the DOM
 * so it can be tested: which message an answer from the server maps to, which
 * addresses the buyer may be sent to, and how the thanks page reads its link.
 *
 * Imported by the store components' scripts only - never by a Function.
 */
import { price } from './store.js';

export { price };

/** Where the buyer is sent to pay: Razorpay's own pages, https only. */
export function payUrlOk(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return false;
  }
  return u.protocol === 'https:' && (u.hostname === 'rzp.io' || u.hostname === 'razorpay.com' || u.hostname.endsWith('.razorpay.com'));
}

/**
 * The `store.*` message key for a failed checkout.
 * @param {number} status  HTTP status, 0 when the request itself failed
 * @param {string} [error] the `error` field of the answer
 */
export function checkoutError(status, error = '') {
  if (status === 429) return 'errRate';
  if (status === 403 && error === 'challenge-failed') return 'errChallenge';
  if (status === 400 && error === 'invalid') return 'errEmail';
  if (status === 404 || status === 503) return 'errClosed';
  if (status === 502) return 'errProvider';
  return 'errGeneric';
}

/**
 * What the thanks page says for a state from /api/store/confirm or /api/store/order.
 * 'paid' is handled by the caller (it shows the download); everything else maps to a message key.
 */
export function thanksKey(state) {
  switch (state) {
    case 'expired':
      return 'thanksExpired';
    case 'refunded':
      return 'thanksRefunded';
    case 'failed':
    case 'closed':
      return 'thanksClosed';
    case 'pending':
    case 'created':
      return 'thanksWaiting';
    default:
      return 'thanksUnverified';
  }
}

/**
 * Which order a visit to /store/thanks is about.
 *  - the link from the email:    /store/thanks#o=<order>&t=<token>
 *  - Razorpay sending them back: /store/thanks?razorpay_payment_link_reference_id=<order>&...
 * @param {{ search: string, hash: string }} loc
 * @returns {{ kind: 'link', order: string, token: string } | { kind: 'return', order: string } | null}
 */
export function readOrderFrom(loc) {
  const hash = new URLSearchParams(String(loc.hash ?? '').replace(/^#/, ''));
  const o = hash.get('o') ?? '';
  const t = hash.get('t') ?? '';
  if (/^o[a-z2-7]{24}$/.test(o) && /^[A-Za-z0-9_-]{20,128}$/.test(t)) return { kind: 'link', order: o, token: t };
  const q = new URLSearchParams(String(loc.search ?? ''));
  const ref = q.get('razorpay_payment_link_reference_id') ?? '';
  if (/^o[a-z2-7]{24}$/.test(ref)) return { kind: 'return', order: ref };
  return null;
}

/** Whole days left until `expires` (unix seconds), never below 1 while it is still valid. */
export function daysLeft(expires, nowMs = Date.now()) {
  if (!expires) return 0;
  return Math.max(1, Math.ceil((expires * 1000 - nowMs) / 864e5));
}

/**
 * Purchases remembered in this browser, so the product page can offer the
 * download again: { [productId]: { o, t, m, exp } }. Only what the buyer's own
 * thanks page already holds (order id, download key, the key that lets this
 * browser correct the email, expiry), in local storage on their device. It is
 * sent only to our own server, to ask about the order. The server still
 * decides on every download (paid, not refunded, not expired, downloads left).
 */
export const BOUGHT_KEY = 'mkd-bought';

/** @param {Storage} storage */
function readBought(storage) {
  try {
    const v = JSON.parse(storage.getItem(BOUGHT_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Remember a paid order for its product (the newest one wins).
 * @param {Storage} storage
 * @param {string} productId
 * @param {string} order
 * @param {string} token
 * @param {number | null} expires unix seconds, or null for no end
 */
export function rememberPurchase(storage, productId, order, token, expires, manage) {
  if (!/^[a-z0-9-]{1,64}$/.test(productId) || !readOrderFrom({ hash: `#o=${order}&t=${token}` })) return;
  try {
    const all = readBought(storage);
    // The management key is kept from before when this answer had none (a link from the email).
    const kept = all[productId]?.o === order && KEY_RE.test(all[productId]?.m ?? '') ? all[productId].m : '';
    const m = KEY_RE.test(manage ?? '') ? manage : kept;
    all[productId] = { o: order, t: token, ...(m ? { m } : {}), exp: Number.isFinite(expires) ? expires : null };
    storage.setItem(BOUGHT_KEY, JSON.stringify(all));
  } catch {
    // Private window or blocked storage: the email and the thanks link still work.
  }
}

/**
 * The thanks-page hash (#o=…&t=…) for a product bought in this browser and not
 * yet expired, or null.
 * @param {Storage} storage
 * @param {string} productId
 */
export function boughtHash(storage, productId, nowMs = Date.now()) {
  const p = readBought(storage)[productId];
  if (!p || typeof p !== 'object') return null;
  if (typeof p.exp === 'number' && p.exp * 1000 <= nowMs) return null;
  const hash = `#o=${p.o}&t=${p.t}`;
  return readOrderFrom({ hash }) ? hash : null;
}

/** Drop a remembered purchase (refunded, expired or used up). */
export function forgetPurchase(storage, productId) {
  try {
    const all = readBought(storage);
    if (!(productId in all)) return;
    delete all[productId];
    storage.setItem(BOUGHT_KEY, JSON.stringify(all));
  } catch {
    // blocked storage: nothing to drop
  }
}

const KEY_RE = /^[a-f0-9]{64}$/;
const ORDER_RE = /^o[a-z2-7]{24}$/;

/**
 * The purchase remembered for a product, expired or not (the product page asks
 * the server what it is now), or null.
 * @returns {{ o: string, t: string, m: string, exp: number | null } | null}
 */
export function boughtEntry(storage, productId) {
  const p = readBought(storage)[productId];
  if (!p || typeof p !== 'object' || !readOrderFrom({ hash: `#o=${p.o}&t=${p.t}` })) return null;
  return { o: p.o, t: p.t, m: KEY_RE.test(p.m ?? '') ? p.m : '', exp: typeof p.exp === 'number' ? p.exp : null };
}

/** The management key this browser holds for an order, or ''. */
export function manageFor(storage, order) {
  for (const p of Object.values(readBought(storage))) if (p && p.o === order && KEY_RE.test(p.m ?? '')) return p.m;
  return '';
}

/**
 * Payments started in this browser and not yet seen paid:
 * { [productId]: { o, c, at } } (order id, checkout secret, when, in ms). The
 * secret is what lets this browser, and only it, get the download of a payment
 * that was made but not yet confirmed. A second Pay sends it back, so the open
 * payment page is reused instead of a second one being made.
 */
export const PENDING_KEY = 'mkd-pending';
/** How long a started payment is remembered (the payment page itself closes after 2 hours). */
export const PENDING_DAYS = 3;
const CLAIM_RE = /^[a-f0-9]{32}$/;

function readPending(storage) {
  try {
    const v = JSON.parse(storage.getItem(PENDING_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function writePending(storage, all) {
  try {
    if (Object.keys(all).length) storage.setItem(PENDING_KEY, JSON.stringify(all));
    else storage.removeItem?.(PENDING_KEY);
  } catch {
    // blocked storage: the payment still works, only the reminder is lost
  }
}

/** Remember a payment just started (one per product: the newest wins). */
export function rememberPending(storage, productId, order, claim, nowMs = Date.now()) {
  if (!/^[a-z0-9-]{1,64}$/.test(productId) || !ORDER_RE.test(order ?? '') || !CLAIM_RE.test(claim ?? '')) return;
  const all = readPending(storage);
  all[productId] = { o: order, c: claim, at: nowMs };
  writePending(storage, all);
}

/** The payment started for a product in the last PENDING_DAYS, or null. */
export function pendingFor(storage, productId, nowMs = Date.now()) {
  const p = readPending(storage)[productId];
  if (!p || !ORDER_RE.test(p.o ?? '') || !CLAIM_RE.test(p.c ?? '') || !Number.isFinite(p.at)) return null;
  if (nowMs - p.at > PENDING_DAYS * 864e5 || p.at > nowMs + 60e3) return null;
  return { o: p.o, c: p.c, at: p.at };
}

/** The newest payment started in this browser, for any product, or null. */
export function latestPending(storage, nowMs = Date.now()) {
  let best = null;
  for (const id of Object.keys(readPending(storage))) {
    const p = pendingFor(storage, id, nowMs);
    if (p && (!best || p.at > best.at)) best = p;
  }
  return best;
}

/** The checkout secret this browser holds for an order, or ''. */
export function claimFor(storage, order) {
  for (const p of Object.values(readPending(storage))) if (p && p.o === order && CLAIM_RE.test(p.c ?? '')) return p.c;
  return '';
}

/** The payment is settled (paid, or closed): drop its reminder. */
export function forgetPending(storage, order) {
  const all = readPending(storage);
  let changed = false;
  for (const [id, p] of Object.entries(all)) if (!p || p.o === order) (delete all[id], (changed = true));
  if (changed) writePending(storage, all);
}

/** "Forget this purchase on this device": the remembered purchase and payment for a product. */
export function forgetDevice(storage, productId) {
  forgetPurchase(storage, productId);
  const all = readPending(storage);
  if (productId in all) {
    delete all[productId];
    writePending(storage, all);
  }
}

/**
 * Razorpay's signed return (the query it adds when it sends the buyer back),
 * or null when it is not all there.
 * @param {string} search location.search
 */
export function readReturn(search) {
  const q = new URLSearchParams(String(search ?? ''));
  const r = {
    paymentId: q.get('razorpay_payment_id') ?? '',
    linkId: q.get('razorpay_payment_link_id') ?? '',
    referenceId: q.get('razorpay_payment_link_reference_id') ?? '',
    status: q.get('razorpay_payment_link_status') ?? '',
    signature: q.get('razorpay_signature') ?? '',
  };
  const ok = [r.paymentId, r.linkId, r.referenceId, r.status].every((p) => /^[A-Za-z0-9_]{1,80}$/.test(p)) && /^[a-f0-9]{64}$/i.test(r.signature);
  return ok ? r : null;
}

/** A date in India time, in the page's language (unix seconds or an ISO string). */
export function istDate(when, lang = 'en') {
  const ms = typeof when === 'number' ? when * 1000 : Date.parse(String(when ?? ''));
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat(`${lang}-IN`, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * The receipt and recovery card, as a plain text file the buyer saves: what
 * was bought, the references to quote, and the link to download again. The
 * link is the download key only, never the key that changes the email.
 * @param {Record<string, string>} L the page's strings (receipt*, card*)
 * @param {{ product: string, receipt: any, link: string, until: string, contact: string, lang?: string }} d
 */
export function recoveryText(L, d) {
  const r = d.receipt ?? {};
  const lines = [
    L.cardTitle,
    '',
    `${L.receiptProduct}: ${d.product}`,
    `${L.receiptOrder}: ${r.order ?? ''}`,
    `${L.receiptAmount}: ${price(r.amount)}`,
    `${L.receiptPaid}: ${istDate(r.paidAt, d.lang)}`,
    r.payment ? `${L.receiptPayment}: ${r.payment}` : null,
    r.refunded ? `${L.receiptRefunded}: ${price(r.refunded)}` : null,
    d.until ? `${L.receiptUntil}: ${d.until}` : null,
    '',
    L.cardLink,
    d.link,
    '',
    L.cardHelp.replace('{contact}', d.contact),
  ];
  return lines.filter((l) => l !== null).join('\n') + '\n';
}

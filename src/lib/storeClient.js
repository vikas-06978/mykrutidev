/**
 * The little the store's pages decide in the browser, kept apart from the DOM
 * so it can be tested: which message an answer from the server maps to, which
 * addresses the buyer may be sent to, and how the thanks page reads its link.
 *
 * Imported by the store components' scripts only - never by a Function.
 */

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
 * download again: { [productId]: { o, t, exp } }. Only what the buyer's own
 * thanks link already holds (order id, download token, expiry), in local
 * storage on their device; nothing is sent anywhere. The server still decides
 * on every download (paid, not refunded, not expired, downloads left).
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
export function rememberPurchase(storage, productId, order, token, expires) {
  if (!/^[a-z0-9-]{1,64}$/.test(productId) || !readOrderFrom({ hash: `#o=${order}&t=${token}` })) return;
  try {
    const all = readBought(storage);
    all[productId] = { o: order, t: token, exp: Number.isFinite(expires) ? expires : null };
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

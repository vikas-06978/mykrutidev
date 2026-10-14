/**
 * The little of Razorpay the store uses: make a Payment Link, read it back,
 * and check a webhook's signature.
 *
 * WHY PAYMENT LINKS (and not Razorpay's popup, checkout.js): the buyer pays on
 * Razorpay's own page and comes back. No Razorpay script ever runs on a
 * MyKrutiDev page, so the site's Content-Security-Policy stays as strict as it
 * is, and "nothing you type here is uploaded" stays true for every tool.
 *
 * WHAT WE TRUST: not what the browser says. When a buyer comes back, or a
 * webhook arrives, we ask Razorpay's API (with our secret key) for the link and
 * read its status. Only "paid", for exactly the amount we asked, against our
 * order's reference_id, counts. A made-up callback or webhook can therefore
 * unlock nothing.
 *
 * Plain fetch and Web Crypto only: this runs in Cloudflare's Pages Functions.
 *
 * Environment:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   the API key pair (rzp_test_... or rzp_live_...)
 *   RAZORPAY_WEBHOOK_SECRET                the secret set on the webhook in Razorpay's dashboard
 */

const API = 'https://api.razorpay.com/v1';

export class RazorpayError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const hasKeys = (env) => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

/** 'test' for rzp_test_ keys, 'live' otherwise. Shown in the admin page. */
export const mode = (env) => (String(env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_test_') ? 'test' : 'live');

const auth = (env) => `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`;

async function call(env, method, path, body, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: auth(env), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RazorpayError(0, 'network');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // not JSON
  }
  if (!res.ok) throw new RazorpayError(res.status, String(data?.error?.description ?? 'razorpay-error').slice(0, 200));
  return data;
}

/**
 * Make a payment link for one order.
 * @param {Record<string, any>} env
 * @param {{ referenceId: string, amountPaise: number, currency: string, description: string, email: string, callbackUrl: string, expireBy: number }} p
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function createPaymentLink(env, p, fetchImpl = fetch) {
  const link = await call(
    env,
    'POST',
    '/payment_links',
    {
      amount: p.amountPaise,
      currency: p.currency,
      accept_partial: false,
      reference_id: p.referenceId,
      description: p.description.slice(0, 2048),
      ...(p.email ? { customer: { email: p.email } } : {}),
      // Razorpay does not message the buyer: we send our own email with the download link.
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: p.callbackUrl,
      callback_method: 'get',
      expire_by: p.expireBy,
    },
    fetchImpl,
  );
  if (!link?.id || !link?.short_url) throw new RazorpayError(502, 'no link in the answer');
  return { id: String(link.id), url: String(link.short_url) };
}

/** Read a payment link back from Razorpay. */
export const fetchPaymentLink = (env, linkId, fetchImpl = fetch) =>
  call(env, 'GET', `/payment_links/${encodeURIComponent(linkId)}`, null, fetchImpl);

/**
 * Was this link paid in full, for this order?
 * @param {any} link  Razorpay's payment link
 * @param {{ id: string, amount: number, currency: string }} order
 */
export function isPaidFor(link, order) {
  if (!link || link.status !== 'paid') return false;
  if (link.reference_id !== undefined && link.reference_id !== null && link.reference_id !== order.id) return false;
  if (link.currency !== undefined && link.currency !== order.currency) return false;
  const paid = link.amount_paid ?? link.amount;
  return paid === order.amount;
}

/** The payment id (pay_...) of a paid link, when Razorpay lists it. */
export function paymentIdOf(link) {
  const first = Array.isArray(link?.payments) ? link.payments[0] : null;
  const id = first?.payment_id ?? first?.id;
  return typeof id === 'string' && /^[A-Za-z0-9_]{6,60}$/.test(id) ? id : null;
}

/** Equal, without leaking where two strings first differ. */
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))),
  );
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/**
 * A webhook is genuine when X-Razorpay-Signature is the HMAC-SHA256 (hex) of the
 * RAW body, keyed with the webhook secret.
 */
export async function verifyWebhook(rawBody, signature, secret) {
  if (!secret || !signature || typeof signature !== 'string') return false;
  return safeEqual(await hmacHex(secret, rawBody), signature.trim().toLowerCase());
}

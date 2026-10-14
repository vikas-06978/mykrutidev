/**
 * The store's emails, through Resend (the same account and sender the
 * feedback notifications use; see notify.js).
 *
 *   RESEND_API_KEY, NOTIFY_FROM   to send at all
 *   NOTIFY_TO                     the owner's address(es): copied on every sale
 *                                 and used as the buyer's Reply-To
 *
 * Without them nothing is sent. The buyer still has the download link on the
 * page they come back to, and the order page in /admin/orders can show it.
 * A failure here never changes whether an order is paid.
 */
import { SITE_URL, STORE, rupees } from '../src/lib/store.js';

const RESEND = 'https://api.resend.com/emails';

export const canMail = (env) => !!(env.RESEND_API_KEY && env.NOTIFY_FROM);

/** One line, no control characters: safe in a subject. */
const oneLine = (s, max = 150) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * @param {Record<string, any>} env
 * @param {{ to: string | string[], subject: string, text: string, replyTo?: string }} mail
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>} true when Resend accepted it. Never throws.
 */
export async function sendMail(env, { to, subject, text, replyTo }, fetchImpl = fetch) {
  if (!canMail(env)) return false;
  try {
    const body = { from: env.NOTIFY_FROM, to: Array.isArray(to) ? to : [to], subject: oneLine(subject), text };
    if (replyTo) body.reply_to = replyTo;
    const res = await fetchImpl(RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('store mail refused', res.status);
    return res.ok;
  } catch (e) {
    console.error('store mail failed', e?.message || e);
    return false;
  }
}

const owners = (env) =>
  String(env.NOTIFY_TO ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

/** The link in the buyer's email: the thanks page, which offers the download. */
export const downloadPage = (origin, orderId, token) =>
  `${origin}/store/thanks?o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`;

/** The email to the buyer, English and Hindi. */
export function buyerMail(env, { order, product, link, origin = SITE_URL }) {
  const lines = [
    `Thank you for buying from MyKrutiDev.`,
    ``,
    `${product.title}`,
    `Order ${order.id}, Rs ${rupees(order.amount)}`,
    ``,
    `Download your PDF here:`,
    link,
    ``,
    `The link works for ${STORE.downloadDays} days and allows ${order.max_downloads} downloads. Please keep this email.`,
    `If the file is wrong or will not open, reply to this email within ${STORE.refundDays} days and we will fix it or refund you.`,
    `Refund policy: ${origin}/refund-policy`,
    ``,
    `---`,
    ``,
    `MyKrutiDev से खरीदारी के लिए धन्यवाद।`,
    ``,
    `अपनी PDF डाउनलोड करने के लिए ऊपर का लिंक खोलें। लिंक ${STORE.downloadDays} दिन चलेगा और ${order.max_downloads} बार डाउनलोड हो सकेगी। इस ईमेल को संभालकर रखें।`,
    `फ़ाइल में कोई गड़बड़ी हो या वह खुले नहीं, तो ${STORE.refundDays} दिन के भीतर इसी ईमेल का जवाब दें। हम उसे ठीक करेंगे या पैसे लौटाएँगे।`,
  ];
  return {
    to: order.email,
    subject: `Your download: ${product.title}`,
    text: lines.join('\n'),
    replyTo: owners(env)[0],
  };
}

/** The email to the owner for each sale. */
export function ownerMail(env, { order, product, origin = SITE_URL }) {
  const to = owners(env);
  return {
    to,
    subject: `MyKrutiDev sale: Rs ${rupees(order.amount)} (${product.title})`,
    text: [
      `Product: ${product.title}`,
      `Amount: Rs ${rupees(order.amount)}`,
      `Buyer: ${order.email}`,
      `Order: ${order.id}`,
      `Payment: ${order.payment_id ?? 'see Razorpay'}`,
      ``,
      `All orders: ${origin}/admin/orders`,
    ].join('\n'),
    replyTo: order.email,
  };
}

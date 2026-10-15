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
import { SITE_URL, STORE, rupees, waNumber } from '../src/lib/store.js';

const RESEND = 'https://api.resend.com/emails';

export const canMail = (env) => !!(env.RESEND_API_KEY && env.NOTIFY_FROM);

/** One line, no control characters: safe in a subject. */
const oneLine = (s, max = 150) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * Send one email. Resolves to Resend's id for it when Resend accepted it,
 * null otherwise. Never throws.
 * @param {Record<string, any>} env
 * @param {{ to: string | string[], subject: string, text: string, html?: string, replyTo?: string }} mail
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string | null>}
 */
export async function sendMailId(env, { to, subject, text, html, replyTo }, fetchImpl = fetch) {
  if (!canMail(env)) return null;
  try {
    const body = { from: env.NOTIFY_FROM, to: Array.isArray(to) ? to : [to], subject: oneLine(subject), text };
    if (html) body.html = html;
    if (replyTo) body.reply_to = replyTo;
    const res = await fetchImpl(RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('store mail refused', res.status);
      return null;
    }
    const data = await res.json().catch(() => null);
    // An accepted mail without an id still went: '' marks "sent, no id to match a report".
    return typeof data?.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(data.id) ? data.id : '';
  } catch (e) {
    console.error('store mail failed', e?.message || e);
    return null;
  }
}

/** @returns {Promise<boolean>} true when Resend accepted it. Never throws. */
export async function sendMail(env, mail, fetchImpl = fetch) {
  return (await sendMailId(env, mail, fetchImpl)) !== null;
}

export const owners = (env) =>
  String(env.NOTIFY_TO ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

/**
 * The link in the buyer's email: the thanks page, which offers the download.
 * The order and key are after the # so they never reach a server log, and
 * analytics.js keeps the page's address from Google as well.
 */
export const downloadPage = (origin, orderId, token, lang = 'en') =>
  `${origin}${lang && lang !== 'en' && /^[a-z]{2}$/.test(lang) ? `/${lang}` : ''}/store/thanks#o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`;

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
    `If the download fails or the file will not open, reply to this email within ${STORE.refundDays} days and we will fix it or refund you.`,
    `Refund policy: ${origin}/refund-policy`,
    ``,
    `---`,
    ``,
    `MyKrutiDev से खरीदारी के लिए धन्यवाद।`,
    ``,
    `अपनी PDF डाउनलोड करने के लिए ऊपर का लिंक खोलें। लिंक ${STORE.downloadDays} दिन चलेगा और ${order.max_downloads} बार डाउनलोड हो सकेगी। इस ईमेल को संभालकर रखें।`,
    `अगर डाउनलोड न हो या फ़ाइल खुले नहीं, तो ${STORE.refundDays} दिन के भीतर इसी ईमेल का जवाब दें। हम उसे ठीक करेंगे या पैसे लौटाएँगे।`,
  ];
  return {
    to: order.email,
    subject: `Your download: ${product.title}`,
    text: lines.join('\n'),
    replyTo: owners(env)[0],
  };
}

// ---------------------------------------------------------------------------
// Mails to the owner (English), with WhatsApp buttons in Hindi and English
// ---------------------------------------------------------------------------

const escHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The product's name without the "(PDF, 32 pages)" part. */
const shortTitle = (product) => String(product.title).replace(/\s*\(.*\)\s*$/, '');

/**
 * The WhatsApp messages the owner can send a buyer, ready to go.
 * kind 'sale': thank you + the download link. kind 'wrong-email': our email
 * did not reach them + the download link + "send us your right address".
 * @param {'sale' | 'wrong-email'} kind
 * @param {{ product: any, email?: string, links: { hi: string, en: string } }} p
 */
export function waText(kind, { product, email, links }) {
  const title = shortTitle(product);
  if (kind === 'wrong-email') {
    return {
      hi: [
        `नमस्ते! आपने MyKrutiDev से "${title}" खरीदी है, धन्यवाद 🙏`,
        `आपका ईमेल${email ? ` (${email})` : ''} सही नहीं लग रहा, इसलिए डाउनलोड लिंक ईमेल पर नहीं पहुँचा।`,
        `अपनी PDF यहाँ से डाउनलोड करें:`,
        links.hi,
        `अपना सही ईमेल यहीं भेज दें, हम लिंक वहाँ भी भेज देंगे।`,
      ].join('\n'),
      en: [
        `Hi! Thank you for buying "${title}" from MyKrutiDev 🙏`,
        `Your email${email ? ` (${email})` : ''} looks wrong, so the download link did not reach you.`,
        `Download your PDF here:`,
        links.en,
        `Reply with your correct email and we will send the link there too.`,
      ].join('\n'),
    };
  }
  return {
    hi: [
      `नमस्ते! MyKrutiDev से "${title}" खरीदने के लिए धन्यवाद 🙏`,
      `अपनी PDF यहाँ से डाउनलोड करें:`,
      links.hi,
      `कोई दिक्कत हो तो यहीं लिख दें।`,
    ].join('\n'),
    en: [`Hi! Thank you for buying "${title}" from MyKrutiDev 🙏`, `Download your PDF here:`, links.en, `Any problem? Just reply here.`].join('\n'),
  };
}

/** wa.me links that open WhatsApp with the message typed in. Null without a usable number. */
export function waLinks(phone, texts) {
  const n = waNumber(phone);
  if (!n) return null;
  return {
    hi: `https://wa.me/${n}?text=${encodeURIComponent(texts.hi)}`,
    en: `https://wa.me/${n}?text=${encodeURIComponent(texts.en)}`,
  };
}

const BTN = 'display:inline-block;padding:10px 16px;margin:0 8px 8px 0;border-radius:8px;text-decoration:none;font-weight:600;font-family:system-ui,sans-serif;font-size:15px';

/** A plain mail body as text and as simple HTML with buttons. */
function ownerBody({ heading, rows, wa, adminUrl, note }) {
  const text = [
    heading,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    ...(note ? [note, ''] : []),
    ...(wa ? [`WhatsApp the buyer (Hindi): ${wa.hi}`, '', `WhatsApp the buyer (English): ${wa.en}`, ''] : []),
    `Orders: ${adminUrl}`,
  ].join('\n');
  const html = `<div style="font:15px/1.6 system-ui,sans-serif;color:#1a2744">
<p style="font-size:17px;font-weight:600;margin:0 0 12px">${escHtml(heading)}</p>
<table style="border-collapse:collapse;margin:0 0 16px">${rows
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#5b6478">${escHtml(k)}</td><td style="padding:2px 0">${escHtml(v)}</td></tr>`)
    .join('')}</table>
${note ? `<p style="margin:0 0 16px">${escHtml(note)}</p>` : ''}
${
  wa
    ? `<p style="margin:0 0 8px"><a href="${escHtml(wa.hi)}" style="${BTN};background:#25d366;color:#ffffff">WhatsApp: हिंदी</a><a href="${escHtml(wa.en)}" style="${BTN};background:#25d366;color:#ffffff">WhatsApp: English</a></p>`
    : '<p style="margin:0 0 8px;color:#5b6478">No phone number from Razorpay for this payment.</p>'
}
<p style="margin:8px 0 0"><a href="${escHtml(adminUrl)}" style="${BTN};background:#a8442a;color:#ffffff">Open orders</a></p>
</div>`;
  return { text, html };
}

/** The buyer's download page, in Hindi and in English, for the WhatsApp messages. */
const pageLinks = (origin, order, token) => ({
  hi: downloadPage(origin, order.id, token, 'hi'),
  en: downloadPage(origin, order.id, token, 'en'),
});

const adminUrlFor = (origin, order) => `${origin}/admin/orders?q=${encodeURIComponent(order.id)}`;

/** The email to the owner for each sale. */
export function ownerMail(env, { order, product, origin = SITE_URL, token = '' }) {
  const links = pageLinks(origin, order, token);
  const wa = token ? waLinks(order.phone, waText('sale', { product, links })) : null;
  return {
    to: owners(env),
    subject: `MyKrutiDev sale: Rs ${rupees(order.amount)} (${product.title})`,
    ...ownerBody({
      heading: `New sale: ${shortTitle(product)}, Rs ${rupees(order.amount)}`,
      rows: [
        ['Product', product.title],
        ['Amount', `Rs ${rupees(order.amount)}`],
        ['Buyer email', order.email || '(none given: they download from the page after paying)'],
        ['Buyer phone', order.phone || '(not known)'],
        ['Order', order.id],
        ['Payment', order.payment_id ?? 'see Razorpay'],
      ],
      wa,
      adminUrl: adminUrlFor(origin, order),
    }),
    ...(order.email ? { replyTo: order.email } : {}),
  };
}

/**
 * The owner's alert when a buyer's download email bounced, or was marked as
 * spam: the email did not reach them, so the WhatsApp buttons carry the link.
 * @param {'bounced' | 'complained'} what
 */
export function alertMail(env, { order, product, origin = SITE_URL, token, what }) {
  const links = pageLinks(origin, order, token);
  const wa = waLinks(order.phone, waText('wrong-email', { product, email: order.email, links }));
  const bounced = what === 'bounced';
  return {
    to: owners(env),
    subject: bounced
      ? `Buyer's email bounced: ${order.email} (order ${order.id})`
      : `Buyer marked our email as spam: ${order.email} (order ${order.id})`,
    ...ownerBody({
      heading: bounced ? `The download email did not reach the buyer` : `The buyer marked the download email as spam`,
      rows: [
        ['Email', order.email],
        ['Buyer phone', order.phone || '(not known)'],
        ['Product', product.title],
        ['Amount', `Rs ${rupees(order.amount)}`],
        ['Order', order.id],
        ['Payment', order.payment_id ?? 'see Razorpay'],
      ],
      note: bounced
        ? 'The address is probably mistyped. Send the buyer their link on WhatsApp, or ask for the right address and use "Change email" on the orders page. The buyer can also correct it once on their download page.'
        : 'The buyer may not see our emails. Send them their link on WhatsApp if they need it.',
      wa,
      adminUrl: adminUrlFor(origin, order),
    }),
  };
}

/** The owner's note when a buyer corrected their own email. */
export function changedMail(env, { order, product, origin = SITE_URL }) {
  return {
    to: owners(env),
    subject: `Buyer changed their email: order ${order.id}`,
    ...ownerBody({
      heading: 'A buyer corrected their email on their download page',
      rows: [
        ['Old email', order.email_prev || '(none)'],
        ['New email', order.email],
        ['Product', product.title],
        ['Downloads so far', `${order.downloads} / ${order.max_downloads}`],
        ['Order', order.id],
        ['Payment', order.payment_id ?? 'see Razorpay'],
      ],
      note: 'The download link was sent to the new address. It is the same link, with the same downloads left.',
      wa: null,
      adminUrl: adminUrlFor(origin, order),
    }),
  };
}

/** "Send me my link again": every paid, unexpired order for that address, in one email. */
export function findMail(env, { email, items }) {
  const lines = [
    `You asked MyKrutiDev to send your download link again.`,
    ``,
    ...items.flatMap(({ product, order, link }) => [`${product.title} (order ${order.id}, ${order.downloads} of ${order.max_downloads} downloads used):`, link, ``]),
    `If you did not ask for this, you can ignore this email.`,
    ``,
    `---`,
    ``,
    `आपने MyKrutiDev से अपना डाउनलोड लिंक फिर से माँगा था। ऊपर दिए लिंक से अपनी PDF डाउनलोड करें।`,
    `अगर आपने यह नहीं माँगा था, तो इस ईमेल को अनदेखा कर दें।`,
  ];
  return { to: email, subject: 'Your MyKrutiDev download link', text: lines.join('\n'), replyTo: owners(env)[0] };
}

// ---------------------------------------------------------------------------
// Resend's delivery reports (webhooks, signed the Svix way)
// ---------------------------------------------------------------------------

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/**
 * Is this a genuine Resend webhook? Resend signs with Svix: the
 * `svix-signature` header holds "v1,<base64 HMAC-SHA256>" entries over
 * "<svix-id>.<svix-timestamp>.<raw body>", keyed with the base64 part of the
 * `whsec_…` secret. A timestamp more than 5 minutes off is refused (replays).
 * @param {string} raw  the raw body
 * @param {Headers} headers
 * @param {string} secret  RESEND_WEBHOOK_SECRET
 */
export async function verifyResendWebhook(raw, headers, secret, nowMs = Date.now()) {
  const id = headers.get('svix-id') ?? headers.get('webhook-id') ?? '';
  const ts = headers.get('svix-timestamp') ?? headers.get('webhook-timestamp') ?? '';
  const sigs = headers.get('svix-signature') ?? headers.get('webhook-signature') ?? '';
  if (!secret || !id || !/^\d{1,12}$/.test(ts) || !sigs) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > 300) return false;
  let keyBytes;
  try {
    keyBytes = b64ToBytes(String(secret).replace(/^whsec_/, ''));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  let ok = false;
  for (const part of sigs.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    // Compare every candidate in constant time; any match passes.
    const a = new TextEncoder().encode(sig);
    const b = new TextEncoder().encode(want);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    if (diff === 0) ok = true;
  }
  return ok;
}

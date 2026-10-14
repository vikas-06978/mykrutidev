/**
 * The store: digital products (PDFs and ebooks) sold through Razorpay.
 *
 * Shared by four places, so they can never disagree:
 *   - the site's pages (routes.js, PageView.astro): which products exist, their price;
 *   - the browser script (src/scripts/store.js): the limits and error ids;
 *   - the Cloudflare Pages Functions (server/store*.js): the PRICE and the file
 *     of a product come ONLY from here, never from the request;
 *   - the tests.
 *
 * Nothing here touches conversion. This file is also bundled by Cloudflare's
 * Pages Functions bundler, so it imports nothing and uses no Node built-ins.
 *
 * ADDING A PRODUCT
 *   1. Upload the PDF to the R2 bucket bound as STORE_FILES (see docs/STORE.md).
 *   2. Add an entry to PRODUCTS below with status 'live'.
 *   3. Add its page text under `pages["/store/<id>"]` in every language
 *      (src/i18n/*.json) and a matching entry in routes.js (storeRoutes()).
 *
 * PRIVACY: an order stores the buyer's email (if they gave one), the product, the amount and the
 * Razorpay ids - nothing else. No IP address, no user agent. Unpaid orders are
 * deleted after UNPAID_DAYS.
 */

/** The live address (routes.js has it too, but that file cannot go in a Function). */
export const SITE_URL = 'https://mykrutidev.com';

export const STORE = {
  currency: 'INR',
  /** Days a buyer has to report a problem (failed delivery, double payment, broken file). There is no refund for a delivered, working file. Shown in the policy and the buyer's email. */
  refundDays: 7,
  /** How long a download link works after payment. */
  downloadDays: 30,
  /** How many times the file can be downloaded per order. */
  maxDownloads: 5,
  /** The Razorpay payment link stays open this long. */
  linkMinutes: 120,
  /** An order that was never paid is deleted after this many days. */
  unpaidDays: 7,
  /** Orders one IP address can start per hour. */
  checkoutPerHour: 8,
};

/**
 * @typedef {object} Product
 * @property {string} id         also the page slug: /store/<id>
 * @property {'live' | 'test' | 'draft'} status
 *   live: for sale. test: sold only where STORE_TEST_PRODUCTS=1 (a preview
 *   deployment with Razorpay test keys). draft: not sold.
 * @property {string} title      English; used in emails, the admin page and on Razorpay's page
 * @property {number} pricePaise whole paise: 19900 = Rs 199
 * @property {string} file       the object key in the R2 bucket
 * @property {string} fileName   the name the buyer's browser saves it as
 * @property {number} pages
 * @property {boolean} [stamp] every download carries the buyer's stamp (the file in R2 must be prepared with
 *   scripts/prepare-store-pdf.mjs, see docs/STORE.md); an unprepared file is served as it is
 */

/** @type {Product[]} */
export const PRODUCTS = [
  {
    id: 'sample-test',
    status: 'test',
    title: 'MyKrutiDev sample file (test purchase)',
    pricePaise: 100,
    file: 'test/sample.pdf',
    fileName: 'mykrutidev-sample.pdf',
    pages: 1,
    stamp: true,
  },
  {
    // Rs 39: a starter price, to learn whether people will pay before anything bigger is priced.
    // 'test' = sold only where STORE_TEST_PRODUCTS=1 (a preview with Razorpay test keys). Change to 'live' when
    // the file is in the bucket, the seller details are in src/lib/business.js and the preview test purchase worked.
    id: 'kruti-dev-7-day-starter',
    status: 'test',
    title: 'Kruti Dev 7-Day Starter (PDF, 32 pages)',
    pricePaise: 3900,
    file: 'products/kruti-dev-7-day-starter.pdf',
    fileName: 'kruti-dev-7-day-starter.pdf',
    pages: 32,
    stamp: true,
  },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);

/** Is `product` on sale where `env` is the Functions' environment? */
export function sellable(product, env = {}) {
  if (!product) return false;
  if (product.status === 'live') return true;
  return product.status === 'test' && String(env.STORE_TEST_PRODUCTS ?? '') === '1';
}

/** Products on sale to the public: the store page lists these. */
export const liveProducts = () => PRODUCTS.filter((p) => p.status === 'live');

/** 19900 -> "199", 19950 -> "199.50". The page adds the rupee sign. */
export function rupees(paise) {
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`;
}

/** "₹199". */
export const price = (paise) => `₹${rupees(paise)}`;

// ---------------------------------------------------------------------------
// What may be sent
// ---------------------------------------------------------------------------

export const LIMITS = {
  email: 254,
  productId: 64,
  orderId: 40,
  token: 128,
  /** The checkout request, bytes. A valid one is well under 1 KB. */
  body: 4 * 1024,
};

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/** The order id in links and as Razorpay's reference_id: 25 lowercase letters and digits. */
export const ORDER_ID_RE = /^o[a-z2-7]{24}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** A new order id. Unguessable: 120 random bits. */
export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let s = 'o';
  for (const b of bytes) s += alphabet[b % 32];
  return s;
}

/**
 * Check what the buyer sent to start an order.
 * @param {any} body
 * @returns {{ ok: true, value: { productId: string, email: string, lang: string } } | { ok: false, errors: string[] }}
 */
export function validateCheckout(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body: not an object'] };
  const productId = typeof body.productId === 'string' ? body.productId : '';
  if (!productId || productId.length > LIMITS.productId) errors.push('productId: missing');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Optional: left empty, the buyer gets the download on the page after paying (and keeps that link).
  if (email && (email.length > LIMITS.email || !EMAIL_RE.test(email))) errors.push('email: not an email address');
  if (body.accept !== true) errors.push('accept: the terms were not accepted');
  const lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'en';
  return errors.length ? { ok: false, errors } : { ok: true, value: { productId, email, lang } };
}

// ---------------------------------------------------------------------------
// Database (Cloudflare D1). Same statements as db/store.sql
// (src/lib/store.test.js checks they match).
// ---------------------------------------------------------------------------

export const STORE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  paid_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  product_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  email TEXT NOT NULL,
  lang TEXT,
  link_id TEXT,
  payment_id TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  max_downloads INTEGER NOT NULL,
  expires_at INTEGER,
  mail_status TEXT
)`,
  `CREATE INDEX IF NOT EXISTS orders_created_at ON orders (created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_link_id ON orders (link_id)`,
  `CREATE INDEX IF NOT EXISTS orders_payment_id ON orders (payment_id)`,
];

/** Columns of the orders CSV, in order. */
export const ORDER_COLUMNS = [
  'id',
  'created_at',
  'paid_at',
  'status',
  'product_id',
  'amount',
  'currency',
  'email',
  'lang',
  'link_id',
  'payment_id',
  'downloads',
  'max_downloads',
  'expires_at',
  'mail_status',
];

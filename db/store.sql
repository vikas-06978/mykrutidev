-- The store's orders table, for Cloudflare D1. Run it on the SAME database as
-- db/feedback.sql (the Functions create it themselves on first use as well):
--
--   npx wrangler d1 execute mykrutidev-feedback --remote --file=db/store.sql
--
-- Same statements as STORE_SCHEMA in src/lib/store.js (src/lib/store.test.js
-- checks they match). Safe to run again: everything is IF NOT EXISTS.

-- One row per order. `id` is the public order id: it is also Razorpay's
-- reference_id and part of the buyer's download link, so it is random
-- (120 bits). `amount` is in paise. `status`: created (payment link made, not
-- paid yet), paid, failed (Razorpay refused to make the link), refunded.
-- Stored about the buyer: the email, and the language of the page they used.
-- Never an IP address or a user agent. Unpaid rows are deleted after 7 days.
CREATE TABLE IF NOT EXISTS orders (
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
);

CREATE INDEX IF NOT EXISTS orders_created_at ON orders (created_at);

CREATE INDEX IF NOT EXISTS orders_link_id ON orders (link_id);

CREATE INDEX IF NOT EXISTS orders_payment_id ON orders (payment_id);

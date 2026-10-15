-- The store's orders table, for Cloudflare D1. Run it on the SAME database as
-- db/feedback.sql (the Functions create it themselves on first use as well):
--
--   npx wrangler d1 execute mykrutidev-feedback --remote --file=db/store.sql
--
-- Same statements as STORE_SCHEMA in src/lib/store.js (src/lib/store.test.js
-- checks they match). Safe to run again: everything is IF NOT EXISTS.
-- A table made before `mode` existed gets it from the Functions on first use
-- (ALTER TABLE orders ADD COLUMN mode TEXT); there is nothing to run by hand.

-- One row per order. `id` is the public order id: it is also Razorpay's
-- reference_id and part of the buyer's download link, so it is random
-- (120 bits). `amount` is in paise. `status`: created (payment link made, not
-- paid yet), paid, failed (Razorpay refused to make the link), refunded.
-- `mode`: 'live' or 'test', the Razorpay keys the order was made with (NULL on
-- rows from before the column, which count as test).
-- Stored about the buyer: the email, the language of the page they used, and
-- once paid, the mobile number Razorpay has for the payment (`phone`, for the
-- owner only). `mail_id` is Resend's id for the last download email; the
-- email_* columns record a corrected address (who changed it, when, and the
-- one before). Never an IP address or a user agent. Unpaid rows are deleted
-- after 7 days. Columns added later are added by the Functions on first use.
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
  mail_status TEXT,
  mode TEXT,
  phone TEXT,
  mail_id TEXT,
  email_prev TEXT,
  email_changed_by TEXT,
  email_changed_at TEXT,
  buyer_email_changes INTEGER NOT NULL DEFAULT 0,
  claim_hash TEXT,
  link_url TEXT,
  token_ver INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  session_at INTEGER,
  mail_tries INTEGER NOT NULL DEFAULT 0,
  mail_next INTEGER,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  refund_checked_at INTEGER
);

CREATE INDEX IF NOT EXISTS orders_created_at ON orders (created_at);

CREATE INDEX IF NOT EXISTS orders_link_id ON orders (link_id);

CREATE INDEX IF NOT EXISTS orders_payment_id ON orders (payment_id);

CREATE INDEX IF NOT EXISTS orders_mail_id ON orders (mail_id);

CREATE INDEX IF NOT EXISTS orders_email ON orders (email);

-- Small key/value notes the store keeps for itself: when the background check
-- last ran, when each provider's webhook last arrived, when the owner was last
-- alerted. No personal data.
CREATE TABLE IF NOT EXISTS store_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Provider webhook ids already handled, so a repeated delivery does nothing.
CREATE TABLE IF NOT EXISTS store_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);

-- What the owner did on /admin/orders (and what the background check changed):
-- when, which order, which action, a short note. Never a token or a secret.
CREATE TABLE IF NOT EXISTS store_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  order_id TEXT,
  action TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS store_audit_order ON store_audit (order_id);

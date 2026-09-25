-- The feedback widget's tables, for Cloudflare D1.
--
--   npx wrangler d1 execute mykrutidev-feedback --remote --file=db/feedback.sql
--
-- Same statements as SCHEMA in src/lib/feedback.js (src/lib/feedback.test.js
-- checks they match). Safe to run again: everything is IF NOT EXISTS.

-- One row per submission. `used` and `wants` are JSON arrays of option ids,
-- e.g. ["bug","design"]. No IP address, no user agent, no tool text.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  used TEXT NOT NULL DEFAULT '[]',
  wants TEXT NOT NULL DEFAULT '[]',
  bug_text TEXT,
  message TEXT,
  email TEXT,
  page TEXT,
  lang TEXT,
  theme TEXT,
  device TEXT,
  width INTEGER,
  browser TEXT
);

CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback (created_at);

-- Rate limit: 5 submissions per IP per hour. `bucket` is a one-way hash of
-- (secret salt, IP, hour) - the IP itself is never written - and every row is
-- deleted once its hour is over.
CREATE TABLE IF NOT EXISTS feedback_rate (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

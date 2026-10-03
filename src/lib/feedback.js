/**
 * The feedback widget's data: what can be picked, what may be sent, and how
 * it is stored. Shared by three places, so they can never disagree:
 *
 *   - the widget in the browser (src/scripts/feedback.js) - option ids, limits;
 *   - the Cloudflare Pages Functions (functions/) - validation, schema, CSV;
 *   - the tests (src/lib/feedback.test.js, tests/feedback-api.test.js).
 *
 * The words for every option live in src/i18n/{en,hi}.json under `feedback`,
 * keyed by the ids below. Nothing here touches conversion.
 *
 * PRIVACY RULE: a feedback record holds only what the visitor picked or typed
 * INTO THE FEEDBACK PANEL, plus the non-personal context in CONTEXT_FIELDS.
 * Never the text in a tool, a file, the IP address or the user agent string.
 */

/** 1 = 😞 … 4 = 😍 */
import { LOCALES } from '../i18n/locales.js';

export const RATINGS = [1, 2, 3, 4];
export const RATING_EMOJI = { 1: '😞', 2: '😐', 3: '🙂', 4: '😍' };

/** "What did you use today?" */
export const USED = [
  'kruti-dev',
  'unicode-to-kruti',
  'mangal-devlys',
  'abbasi-chanakya',
  'word-file',
  'english-to-hindi',
  'hindi-keyboard',
  'typing-tutor',
  'keyboard-chart',
];

/** "What should we add or improve next?" `bug` opens the "What went wrong?" box. */
export const WANTS = [
  'more-fonts',
  'pdf-conversion',
  'typing-lessons',
  'exam-mode',
  'mobile-app',
  'design',
  'voice-typing',
  'bug',
];

/**
 * The tool a page is, pre-ticked under "What did you use today?" (the visitor
 * can untick it). Route paths as in routes.js, without the /hi prefix.
 */
export const USED_BY_PAGE = {
  '/': 'kruti-dev',
  '/hindi-font-converter': 'kruti-dev',
  '/kruti-dev-to-mangal': 'kruti-dev',
  '/unicode-to-kruti-dev': 'unicode-to-kruti',
  '/mangal-to-kruti-dev': 'mangal-devlys',
  '/devlys-to-unicode': 'mangal-devlys',
  '/unicode-to-devlys': 'mangal-devlys',
  '/devlys-to-mangal': 'mangal-devlys',
  '/mangal-to-devlys': 'mangal-devlys',
  '/abbasi-chanakya-to-unicode': 'abbasi-chanakya',
  '/unicode-to-abbasi-chanakya': 'abbasi-chanakya',
  '/english-to-hindi-typing': 'english-to-hindi',
  '/hindi-keyboard': 'hindi-keyboard',
  '/hindi-typing-test': 'typing-tutor',
  '/kruti-dev-keyboard': 'keyboard-chart',
};

export const LIMITS = {
  message: 500,
  bugText: 500,
  email: 254,
  page: 200,
  /** Whole request body, bytes. A full, valid submission is ~2 KB. */
  body: 8 * 1024,
};

/** Don't invite again for this long after a send (the button stays). */
export const QUIET_DAYS = 30;
export const SENT_KEY = 'mkd-feedback-sent';

/** Rate limit: this many POSTs per IP per window. The IP itself is never stored. */
export const RATE = { max: 5, windowSeconds: 3600 };

/** Every language the site is published in (src/i18n/locales.js). */
export const LANGS = [...LOCALES];
export const THEMES = ['light', 'white', 'dark', 'reading', 'contrast'];
export const DEVICES = ['mobile', 'desktop'];
export const BROWSERS = ['Chrome', 'Edge', 'Firefox', 'Safari', 'Samsung', 'Opera', 'UC', 'Other'];

/** The non-personal context sent with every record. */
export const CONTEXT_FIELDS = ['page', 'lang', 'theme', 'device', 'width', 'browser'];

/**
 * A browser NAME from a user-agent string, worked out in the visitor's own
 * browser so the string itself is never sent. Order matters: Edge, Opera and
 * Samsung all say "Chrome" too, and Chrome says "Safari".
 */
export function browserName(ua = '') {
  if (/SamsungBrowser\//.test(ua)) return 'Samsung';
  if (/UCBrowser\//.test(ua)) return 'UC';
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/\bOPR\/|\bOpera\b/.test(ua)) return 'Opera';
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'Firefox';
  if (/\bChrome\/|\bCriOS\//.test(ua)) return 'Chrome';
  if (/\bSafari\//.test(ua)) return 'Safari';
  return 'Other';
}

// A deliberately plain email check: something@something.tld, no spaces. The
// address is only ever read by a person who wants to reply.
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
// A route path: lowercase slug segments only - no query string, no hash.
const PAGE_RE = /^\/[a-z0-9\-/]*$/;

/** Control characters other than tab/newline, which a form never produces. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function text(v, max, field, errors) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') {
    errors.push(`${field}: not text`);
    return '';
  }
  const s = v.trim();
  // Counted in characters (code points), the way the textarea's maxlength
  // counts them for Devanagari.
  if ([...s].length > max) errors.push(`${field}: longer than ${max} characters`);
  if (CONTROL_RE.test(s)) errors.push(`${field}: control characters`);
  return s;
}

function pickList(v, allowed, field, errors) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors.push(`${field}: not a list`);
    return [];
  }
  const out = [];
  for (const id of v) {
    if (typeof id !== 'string' || !allowed.includes(id)) {
      errors.push(`${field}: unknown option ${JSON.stringify(id).slice(0, 40)}`);
      return [];
    }
    if (!out.includes(id)) out.push(id);
  }
  // Stored in the canonical order, so the same picks are always the same text.
  return allowed.filter((id) => out.includes(id));
}

function oneOf(v, allowed, field, errors) {
  if (!allowed.includes(v)) {
    errors.push(`${field}: must be one of ${allowed.join(', ')}`);
    return null;
  }
  return v;
}

/**
 * Check a submission. Everything is re-derived from the input; nothing the
 * client sends is trusted or passed through unchecked. Unknown fields are
 * rejected, so a client that starts sending more than it should (tool text,
 * say) fails loudly instead of being quietly accepted.
 *
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validateFeedback(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['body: not an object'] };
  }
  const KNOWN = new Set([
    'rating',
    'used',
    'wants',
    'bugText',
    'message',
    'email',
    ...CONTEXT_FIELDS,
    'website', // the honeypot - checked by the caller, before this
    'token', // Turnstile - checked by the caller
  ]);
  for (const k of Object.keys(input)) if (!KNOWN.has(k)) errors.push(`${k}: unknown field`);

  const rating = Number.isInteger(input.rating) && RATINGS.includes(input.rating) ? input.rating : null;
  if (rating === null) errors.push('rating: must be 1, 2, 3 or 4');

  const used = pickList(input.used, USED, 'used', errors);
  const wants = pickList(input.wants, WANTS, 'wants', errors);
  // "What went wrong?" only exists once "Something is wrong" is picked.
  const bugText = wants.includes('bug') ? text(input.bugText, LIMITS.bugText, 'bugText', errors) : '';
  const message = text(input.message, LIMITS.message, 'message', errors);
  const email = text(input.email, LIMITS.email, 'email', errors).toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.push('email: not an email address');

  const page = typeof input.page === 'string' ? input.page : '';
  if (!PAGE_RE.test(page) || page.length > LIMITS.page) errors.push('page: not a path on this site');
  const lang = oneOf(input.lang, LANGS, 'lang', errors);
  const theme = oneOf(input.theme, THEMES, 'theme', errors);
  const device = oneOf(input.device, DEVICES, 'device', errors);
  const browser = oneOf(input.browser, BROWSERS, 'browser', errors);
  const width = Number.isInteger(input.width) && input.width >= 0 && input.width <= 10000 ? input.width : null;
  if (width === null) errors.push('width: must be a whole number of pixels');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { rating, used, wants, bugText, message, email, page, lang, theme, device, width, browser },
  };
}

// ---------------------------------------------------------------------------
// Tool requests: the "Which tool should we build next?" form on /links
// ---------------------------------------------------------------------------

/** Characters, as the form's maxlength counts them. */
export const REQUEST_LIMITS = { idea: 200, details: 500, email: LIMITS.email, ideaMin: 3 };

/**
 * Check a tool request, the same way as validateFeedback(): every field
 * re-derived, unknown fields refused. Only what was typed into the form, its
 * language and the kind of device. Never the IP address or the user agent.
 *
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validateToolRequest(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['body: not an object'] };
  }
  const KNOWN = new Set(['idea', 'details', 'email', 'lang', 'device', 'website', 'token']);
  for (const k of Object.keys(input)) if (!KNOWN.has(k)) errors.push(`${k}: unknown field`);

  const idea = text(input.idea, REQUEST_LIMITS.idea, 'idea', errors);
  if ([...idea].length < REQUEST_LIMITS.ideaMin) errors.push(`idea: at least ${REQUEST_LIMITS.ideaMin} characters`);
  const details = text(input.details, REQUEST_LIMITS.details, 'details', errors);
  const email = text(input.email, REQUEST_LIMITS.email, 'email', errors).toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.push('email: not an email address');
  const lang = oneOf(input.lang, LANGS, 'lang', errors);
  const device = oneOf(input.device, DEVICES, 'device', errors);

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { idea, details, email, lang, device } };
}

/** A validated tool request as the row it becomes (without id / created_at). */
export const toRequestRow = (v) => ({
  idea: v.idea,
  details: v.details || null,
  email: v.email || null,
  lang: v.lang,
  device: v.device,
});

export const REQUEST_COLUMNS = ['id', 'created_at', 'idea', 'details', 'email', 'lang', 'device'];

// ---------------------------------------------------------------------------
// Storage (Cloudflare D1 = SQLite)
// ---------------------------------------------------------------------------

/**
 * The schema, one statement per entry. db/feedback.sql is the same SQL for
 * `wrangler d1 execute` (feedback.test.js checks they match); the Function
 * also runs it once per worker with IF NOT EXISTS, so a database nobody ran
 * the file on still works.
 *
 * `used` and `wants` are JSON arrays of the ids above, e.g. ["bug","design"].
 * `feedback_rate` holds a one-way hash per IP per hour - never the IP - and
 * each row is deleted once its hour is over. `tool_requests` holds the /links
 * page's "which tool next?" form.
 */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS feedback (
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
)`,
  `CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback (created_at)`,
  `CREATE TABLE IF NOT EXISTS feedback_rate (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS tool_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  idea TEXT NOT NULL,
  details TEXT,
  email TEXT,
  lang TEXT,
  device TEXT
)`,
];

export const COLUMNS = [
  'id',
  'created_at',
  'rating',
  'used',
  'wants',
  'bug_text',
  'message',
  'email',
  'page',
  'lang',
  'theme',
  'device',
  'width',
  'browser',
];

/** A validated submission as the row it becomes (without id / created_at). */
export function toRow(v) {
  return {
    rating: v.rating,
    used: JSON.stringify(v.used),
    wants: JSON.stringify(v.wants),
    bug_text: v.bugText || null,
    message: v.message || null,
    email: v.email || null,
    page: v.page,
    lang: v.lang,
    theme: v.theme,
    device: v.device,
    width: v.width,
    browser: v.browser,
  };
}

// ---------------------------------------------------------------------------
// CSV (the admin page's download)
// ---------------------------------------------------------------------------

/**
 * One CSV cell. Quoted when it has to be; and a cell a spreadsheet would run
 * as a formula (= + - @ at the start) gets a leading apostrophe, because the
 * text in it was typed by a stranger.
 */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns = COLUMNS) {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  // A BOM, so Excel opens the Devanagari as UTF-8 rather than mojibake.
  return `﻿${lines.join('\r\n')}\r\n`;
}

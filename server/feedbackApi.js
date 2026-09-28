/**
 * POST /api/feedback      - store one feedback submission in Cloudflare D1.
 * GET  /api/feedback      - the widget's config (the public Turnstile site key).
 * POST /api/tool-request  - store one "which tool next?" request from /links.
 *
 * Wired up by functions/api/feedback.js and tool-request.js (Cloudflare Pages
 * Functions); kept here, as plain request -> response functions, so the tests
 * can call them with a local D1 database. The rest of the site is static and never calls
 * this: only the feedback panel and the /links request form do, and only
 * when their Send is pressed.
 *
 * Environment (Cloudflare Pages -> Settings):
 *   DB                    D1 binding (required)
 *   TURNSTILE_SITE_KEY    public key, handed to the widget
 *   TURNSTILE_SECRET_KEY  secret; when set, every POST must pass Turnstile
 *   RATE_LIMIT_SALT       optional; salts the rate-limit hash (ADMIN_KEY otherwise)
 *
 * Order of checks: size and type, then the rate limit (so a flood is counted
 * before any work is done for it), then the honeypot, the fields, Turnstile.
 */
import { LIMITS, RATE, SCHEMA, toRequestRow, toRow, validateFeedback, validateToolRequest } from '../src/lib/feedback.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

export const reply = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

// ---------------------------------------------------------------------------
// Schema: created once per database per worker, IF NOT EXISTS.
// ---------------------------------------------------------------------------
const ready = new WeakMap();
export function ensureSchema(db) {
  if (!ready.has(db)) {
    const p = db.batch(SCHEMA.map((s) => db.prepare(s)));
    // A failure is not remembered, so the next request tries again.
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return ready.get(db);
}

// ---------------------------------------------------------------------------
// Rate limit: RATE.max per IP per fixed hour, counted in D1.
// ---------------------------------------------------------------------------
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Count one request from `ip` and return how many it has made this hour.
 *
 * The row key is SHA-256(salt | scope | hour | ip): the IP address is never
 * written anywhere, the hash cannot be matched across hours, and each row is
 * deleted as soon as its hour is over (on the next request from anyone).
 */
export async function countHit(db, ip, salt, { scope = 'feedback', now = Date.now() } = {}) {
  const nowS = Math.floor(now / 1000);
  const hour = Math.floor(nowS / RATE.windowSeconds);
  const expires = (hour + 1) * RATE.windowSeconds;
  const bucket = await sha256Hex(`${salt}|${scope}|${hour}|${ip}`);
  const [, counted] = await db.batch([
    db.prepare('DELETE FROM feedback_rate WHERE expires <= ?').bind(nowS),
    db
      .prepare(
        'INSERT INTO feedback_rate (bucket, hits, expires) VALUES (?, 1, ?) ' +
          'ON CONFLICT (bucket) DO UPDATE SET hits = hits + 1 RETURNING hits',
      )
      .bind(bucket, expires),
  ]);
  return { hits: counted.results[0].hits, retryAfter: expires - nowS };
}

/** The visitor's IP, only ever passed to countHit(). Cloudflare sets this header. */
export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';

export const rateSalt = (env) => env.RATE_LIMIT_SALT || env.ADMIN_KEY || 'mykrutidev-feedback';

// ---------------------------------------------------------------------------
// Turnstile
// ---------------------------------------------------------------------------
/** Ask Cloudflare whether a Turnstile token is genuine. The IP is not sent. */
export async function verifyTurnstile(token, secret, fetchImpl = fetch) {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  try {
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await r.json();
    return data?.success === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function handleConfig(env) {
  return reply(200, { ok: true, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
}

/**
 * The checks every form's POST goes through, in the order the header gives.
 * Returns a refusal Response, or the validated value.
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ scope: string, validate: (body: any) => any, verify?: typeof verifyTurnstile, now?: number }} opts
 */
async function accept(request, env, { scope, validate, verify = verifyTurnstile, now }) {
  const db = env.DB;
  if (!db) return reply(503, { ok: false, error: 'not-configured' });

  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) {
    return reply(415, { ok: false, error: 'json-only' });
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > LIMITS.body) {
    return reply(413, { ok: false, error: 'too-large' });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.body) {
    return reply(413, { ok: false, error: 'too-large' });
  }

  await ensureSchema(db);
  const { hits, retryAfter } = await countHit(db, clientIp(request), rateSalt(env), { scope, now });
  if (hits > RATE.max) {
    return reply(429, { ok: false, error: 'rate-limited' }, { 'Retry-After': String(retryAfter) });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'bad-json' });
  }

  // The honeypot: a field no person can see or reach. Anything in it is a bot.
  if (body && typeof body === 'object' && body.website !== undefined && body.website !== '') {
    return reply(400, { ok: false, error: 'rejected' });
  }

  const checked = validate(body);
  if (!checked.ok) return reply(400, { ok: false, error: 'invalid', details: checked.errors });

  if (env.TURNSTILE_SECRET_KEY) {
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token || token.length > 2048 || !(await verify(token, env.TURNSTILE_SECRET_KEY))) {
      return reply(403, { ok: false, error: 'challenge-failed' });
    }
  }
  return { value: checked.value };
}

/** INSERT one row into `table` and answer 201 with its id. */
async function insert(db, table, row) {
  const cols = Object.keys(row);
  const saved = await db
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`)
    .bind(...cols.map((c) => row[c]))
    .first();
  return reply(201, { ok: true, id: saved.id });
}

/**
 * POST /api/feedback
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ verify?: typeof verifyTurnstile, now?: number }} [deps]  for tests
 */
export async function handleFeedback(request, env, deps = {}) {
  const got = await accept(request, env, { ...deps, scope: 'feedback', validate: validateFeedback });
  return got instanceof Response ? got : insert(env.DB, 'feedback', toRow(got.value));
}

/**
 * POST /api/tool-request - the /links page's "which tool next?" form. Same
 * checks as feedback, with its own rate-limit count.
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ verify?: typeof verifyTurnstile, now?: number }} [deps]  for tests
 */
export async function handleToolRequest(request, env, deps = {}) {
  const got = await accept(request, env, { ...deps, scope: 'tool-request', validate: validateToolRequest });
  return got instanceof Response ? got : insert(env.DB, 'tool_requests', toRequestRow(got.value));
}

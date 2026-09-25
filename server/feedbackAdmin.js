/**
 * /admin/feedback - the private page for reading feedback.
 *
 * Wired up by functions/admin/feedback.js. Not part of the static site: no
 * page file, so it is in no sitemap and no nav, and every response carries
 * noindex. Access needs ADMIN_KEY (a Cloudflare secret): type it into the
 * form once and a session cookie is set for 8 hours, or send it as
 * `Authorization: Bearer <key>` (curl, scripts).
 *
 *   GET  /admin/feedback              totals, top requests, latest 50 messages
 *   GET  /admin/feedback?format=csv   every row, as a spreadsheet
 *   POST /admin/feedback              key=...   (sign in) | logout=1
 *
 * Everything shown was typed by strangers: it is escaped on the way out, and
 * the page runs with a CSP that allows no script at all.
 */
import { COLUMNS, RATING_EMOJI, RATINGS, USED, WANTS, toCsv } from '../src/lib/feedback.js';
import { clientIp, countHit, ensureSchema } from './feedbackApi.js';
import en from '../src/i18n/en.json' with { type: 'json' };

const COOKIE = 'mkd_admin';
const SESSION_SECONDS = 8 * 3600;
/** Wrong keys allowed per IP per hour before the form stops answering. */
const LOGIN_TRIES = 10;

const SECURITY = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/** Equal, without leaking where two strings first differ. */
async function same(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))),
  );
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** The session cookie's value: fixed per key, so changing ADMIN_KEY signs everyone out. */
const sessionValue = (key) => hmac(key, 'mkd-admin-session-v1');

function cookie(request, name) {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function isAuthorized(request, key) {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ') && (await same(auth.slice(7), key))) return true;
  const c = cookie(request, COOKIE);
  return !!c && (await same(c, await sessionValue(key)));
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const label = (group, id) => en.feedback[group]?.[id] ?? id;
const ratingName = (r) => `${RATING_EMOJI[r] ?? ''} ${en.feedback.ratings[r] ?? r}`;

function page(title, body, status = 200, extra = {}) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="fa">
${body}
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY, ...extra },
  });
}

function loginPage(message = '', status = 200) {
  return page(
    'Feedback - sign in',
    `<h1>Feedback</h1>
<form method="post" class="fa-login">
  <label for="key">Admin key</label>
  <input id="key" name="key" type="password" autocomplete="current-password" required autofocus>
  <button type="submit">Sign in</button>
</form>
${message ? `<p class="fa-msg" role="alert">${esc(message)}</p>` : ''}`,
    status,
  );
}

/** A horizontal bar chart in plain HTML: one hue, a value at each tip, no script. */
function bars(rows, group) {
  if (!rows.length) return '<p class="fa-empty">Nothing yet.</p>';
  const max = Math.max(...rows.map((r) => r.n));
  return `<ol class="fa-bars">${rows
    .map(
      (r) => `<li title="${esc(label(group, r.id))}: ${r.n}">
  <span class="fa-bar-label">${esc(label(group, r.id))}</span>
  <span class="fa-bar-track"><span class="fa-bar" style="width:${Math.max(1, Math.round((r.n / max) * 100))}%"></span><span class="fa-bar-n">${r.n}</span></span>
</li>`,
    )
    .join('')}</ol>`;
}

function dashboard({ total, ratings, wants, used, latest }) {
  const byRating = Object.fromEntries(ratings.map((r) => [r.rating, r.n]));
  const avg = total ? ratings.reduce((s, r) => s + r.rating * r.n, 0) / total : 0;
  const tiles = RATINGS.map(
    (r) => `<div class="fa-tile"><span class="fa-tile-n">${byRating[r] ?? 0}</span><span class="fa-tile-l">${esc(ratingName(r))}</span></div>`,
  ).join('');

  const rows = latest
    .map((r) => {
      const wantsList = safeList(r.wants).map((id) => label('wants', id)).join(', ');
      return `<tr>
  <td class="fa-nowrap">${esc(r.created_at?.slice(0, 16).replace('T', ' '))}</td>
  <td class="fa-nowrap">${esc(RATING_EMOJI[r.rating] ?? r.rating)}</td>
  <td>${r.bug_text ? `<p class="fa-bug"><strong>Bug:</strong> ${esc(r.bug_text)}</p>` : ''}${r.message ? `<p>${esc(r.message)}</p>` : ''}${wantsList ? `<p class="fa-sub">Wants: ${esc(wantsList)}</p>` : ''}</td>
  <td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}</td>
  <td class="fa-sub">${esc(r.page)} · ${esc(r.lang)} · ${esc(r.device)} ${esc(r.width)}px · ${esc(r.browser)} · ${esc(r.theme)}</td>
</tr>`;
    })
    .join('');

  return page(
    'Feedback',
    `<header class="fa-top">
  <h1>Feedback</h1>
  <div class="fa-actions">
    <a class="fa-button" href="?format=csv" download>Download CSV</a>
    <form method="post"><button type="submit" name="logout" value="1" class="fa-link">Sign out</button></form>
  </div>
</header>

<section aria-labelledby="h-ratings">
  <h2 id="h-ratings">Ratings <span class="fa-sub">${total} in total${total ? ` · average ${avg.toFixed(2)} of 4` : ''}</span></h2>
  <div class="fa-tiles">${tiles}</div>
</section>

<div class="fa-cols">
  <section aria-labelledby="h-wants">
    <h2 id="h-wants">What people want next</h2>
    ${bars(wants, 'wants')}
  </section>
  <section aria-labelledby="h-used">
    <h2 id="h-used">What they used</h2>
    ${bars(used, 'used')}
  </section>
</div>

<section aria-labelledby="h-latest">
  <h2 id="h-latest">Latest ${latest.length} messages</h2>
  ${
    latest.length
      ? `<div class="fa-scroll"><table>
<thead><tr><th>Date (UTC)</th><th>Rating</th><th>Message</th><th>Email</th><th>Context</th></tr></thead>
<tbody>${rows}</tbody></table></div>`
      : '<p class="fa-empty">No written messages yet.</p>'
  }
</section>`,
  );
}

function safeList(json) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function counts(db, column, allowed) {
  const { results } = await db
    .prepare(
      `SELECT j.value AS id, COUNT(*) AS n FROM feedback, json_each(feedback.${column}) AS j GROUP BY j.value ORDER BY n DESC, j.value`,
    )
    .all();
  return results.filter((r) => allowed.includes(r.id));
}

export async function loadSummary(db) {
  const [ratings, wants, used, latest] = await Promise.all([
    db.prepare('SELECT rating, COUNT(*) AS n FROM feedback GROUP BY rating').all(),
    counts(db, 'wants', WANTS),
    counts(db, 'used', USED),
    db
      .prepare(
        "SELECT * FROM feedback WHERE COALESCE(message, '') <> '' OR COALESCE(bug_text, '') <> '' ORDER BY id DESC LIMIT 50",
      )
      .all(),
  ]);
  const r = ratings.results;
  return { total: r.reduce((s, x) => s + x.n, 0), ratings: r, wants, used, latest: latest.results };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAdmin(request, env, { now } = {}) {
  const key = env.ADMIN_KEY;
  if (!key || key.length < 16) {
    return page('Feedback', '<h1>Feedback</h1><p>Not set up: add an ADMIN_KEY secret (16+ characters) in Cloudflare.</p>', 503);
  }
  const db = env.DB;
  if (!db) return page('Feedback', '<h1>Feedback</h1><p>Not set up: bind the D1 database as DB.</p>', 503);
  await ensureSchema(db);

  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    if (form?.get('logout')) {
      return new Response(null, {
        status: 303,
        headers: { Location: '/admin/feedback', 'Set-Cookie': `${COOKIE}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`, ...SECURITY },
      });
    }
    const given = String(form?.get('key') ?? '');
    const { hits } = await countHit(db, clientIp(request), env.RATE_LIMIT_SALT || key, { scope: 'admin', now });
    if (hits > LOGIN_TRIES) return loginPage('Too many tries. Wait an hour.', 429);
    if (!(await same(given, key))) return loginPage('That key is not right.', 401);
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/admin/feedback',
        'Set-Cookie': `${COOKIE}=${await sessionValue(key)}; Path=/admin; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
        ...SECURITY,
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST', ...SECURITY } });
  }
  if (!(await isAuthorized(request, key))) return loginPage('', 401);

  if (new URL(request.url).searchParams.get('format') === 'csv') {
    const { results } = await db.prepare(`SELECT ${COLUMNS.join(', ')} FROM feedback ORDER BY id`).all();
    const day = new Date(now ?? Date.now()).toISOString().slice(0, 10);
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mykrutidev-feedback-${day}.csv"`,
        ...SECURITY,
      },
    });
  }

  return dashboard(await loadSummary(db));
}

// ---------------------------------------------------------------------------
// Style: the site's paper and ink, light and dark. One hue for the bars.
// ---------------------------------------------------------------------------
const STYLE = `
:root{color-scheme:light;--paper:#faf7f2;--surface:#fcfcfb;--ink:#1a2744;--body:#46536b;--mute:#5f6b7e;--line:#e5ded3;--bar:#2a78d6;--track:#f1ede6;--accent:#a8442a;--on-accent:#fff;--err:#b91c1c}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#151618;--surface:#1a1a19;--ink:#f3f1ec;--body:#c9c6bd;--mute:#a19e95;--line:#34342f;--bar:#3987e5;--track:#262624;--accent:#ee9275;--on-accent:#1a1411;--err:#f59393}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--body);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari","Nirmala UI",sans-serif}
.fa{max-width:72rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1,h2{color:var(--ink);font-weight:600;margin:0}
h1{font-size:1.5rem}
h2{font-size:1.0625rem;margin:2rem 0 .75rem}
a{color:var(--accent)}
.fa-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem}
.fa-actions{display:flex;align-items:center;gap:1rem}
.fa-actions form{margin:0}
.fa-button,.fa-login button{display:inline-flex;align-items:center;min-height:40px;padding:0 1rem;border:0;border-radius:6px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:500;text-decoration:none;cursor:pointer}
.fa-link{border:0;background:none;color:var(--accent);font:inherit;text-decoration:underline;cursor:pointer;padding:0}
.fa-sub{color:var(--mute);font-size:.8125rem;font-weight:400}
.fa-empty{color:var(--mute)}
.fa-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem}
.fa-tile{display:flex;flex-direction:column;gap:.25rem;padding:.875rem 1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.fa-tile-n{color:var(--ink);font-size:1.75rem;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1}
.fa-tile-l{color:var(--body)}
.fa-cols{display:grid;gap:0 2.5rem;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))}
.fa-bars{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.fa-bars li{display:grid;grid-template-columns:minmax(8rem,14rem) 1fr;align-items:center;gap:.75rem;min-height:30px}
.fa-bar-label{color:var(--ink);font-size:.875rem}
.fa-bar-track{display:flex;align-items:center;gap:.5rem;min-width:0}
.fa-bar{display:block;height:18px;background:var(--bar);border-radius:0 4px 4px 0}
.fa-bar-n{color:var(--body);font-size:.8125rem;font-variant-numeric:tabular-nums}
.fa-bars li:hover .fa-bar-label{text-decoration:underline}
.fa-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.875rem}
th,td{text-align:left;vertical-align:top;padding:.625rem .75rem;border-bottom:1px solid var(--line)}
th{color:var(--ink);font-weight:600;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
td p{margin:0 0 .25rem;white-space:pre-wrap;overflow-wrap:anywhere}
.fa-bug{color:var(--ink)}
.fa-nowrap{white-space:nowrap}
.fa-login{display:flex;flex-wrap:wrap;align-items:end;gap:.5rem;margin-top:1rem}
.fa-login label{flex-basis:100%;color:var(--ink);font-weight:500}
.fa-login input{min-height:40px;min-width:16rem;padding:0 .75rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit}
.fa-msg{color:var(--err);font-weight:500}
`;

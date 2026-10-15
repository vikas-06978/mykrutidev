/**
 * /admin/orders - the private page for the store's orders.
 *
 * Wired up by functions/admin/orders.js. Same login as /admin/feedback (the
 * ADMIN_KEY session cookie covers all of /admin), same rules: no page file, in
 * no sitemap, noindex, and a CSP that allows no script.
 *
 *   GET  /admin/orders              "ready to sell?", money in by period and by
 *                                   product, the orders (filter: status, product,
 *                                   q = order id / email / payment id; 50 a page)
 *   GET  /admin/orders?format=csv   every order, as a spreadsheet
 *   POST /admin/orders              action=check|resend|email|refund|extend|reset, id=<order>
 *                                   action=reconcile ("Run checks now", no id)
 *
 * The actions:
 *   check    ask Razorpay again whether an unpaid order was paid (a buyer who
 *            closed the tab, or a webhook that never came)
 *   resend   send the download email again (only for an order that has an email)
 *   email    put the right address on the order (email=...) and send the link
 *            there; the old one is kept as email_prev
 *   (a paid order also shows its download link, to send to a buyer who gave no email)
 *   refund   "Close access": end the downloads of an order refunded in
 *            Razorpay's dashboard. The money itself is refunded there; a full
 *            refund is also picked up by itself (the webhook, or the background
 *            check in server/storeJobs.js)
 *   extend   another 30 days, same downloads left
 *   reset    a fresh set of downloads (the date stays)
 *
 * Every action is written to the audit trail (store_audit), shown at the
 * bottom of the page. "Needs attention" lists what a person should look at:
 * paid orders whose email did not arrive, possible double payments, partial
 * refunds, and a background check or webhook that has gone quiet.
 *
 * Email addresses sit inside <!--email_off--> ... <!--/email_off-->: Cloudflare's
 * Email Address Obfuscation would otherwise show "[email protected]", and these
 * pages run no script to decode it.
 */
import { ORDER_COLUMNS, STORE, PRODUCTS, cleanEmail, price, productById } from '../src/lib/store.js';
import { toCsv } from '../src/lib/feedback.js';
import { SECURITY, bearerGuard, esc, isAuthorized, page } from './feedbackAdmin.js';
import { audit, ensureStoreSchema, getMeta, keyFor, siteOrigin, settleOrder, isLiveHost, sendBuyerLink } from './storeApi.js';
import { reconcile } from './storeJobs.js';
import { hasKeys, mode } from './razorpay.js';
import { canMail, downloadPage, waLinks, waText } from './storeMail.js';

const PER_PAGE = 50;
const MODES = ['live', 'test'];
/** An order's mode; rows from before the column count as test (nothing was sold live then). */
const MODE_EXPR = "COALESCE(mode, 'test')";
const MODE_SQL = `${MODE_EXPR} = ?`;
const STATUSES = ['paid', 'created', 'refunded', 'failed'];
const STATUS_NAME = { paid: 'Paid', created: 'Started, not paid', refunded: 'Refunded', failed: 'Failed' };
const ACTION_DONE = {
  check: 'Asked Razorpay again',
  resend: 'Email sent again',
  email: 'Email changed and a new download link sent to it (the old link no longer works)',
  refund: 'Access closed: downloads are off',
  extend: '30 more days given',
  reset: 'Downloads reset to a fresh set',
  reconcile: 'Checks run',
};
/** The mail column: what Resend last told us about the download email. */
const MAIL_BAD = new Set(['failed', 'bounced', 'complained']);
const OK = '✓';
const NO = '✗';

const when = (iso) => esc(String(iso ?? '').slice(0, 16).replace('T', ' '));
const isoUtc = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : '');

const STYLE = `<style>
.fa-check{list-style:none;margin:0;padding:0;display:grid;gap:.25rem}
.fa-ok{color:#15803d;font-weight:600}.fa-no{color:#b91c1c;font-weight:600}
.fa-mode{display:inline-block;padding:.1rem .5rem;border-radius:999px;background:var(--track);color:var(--ink);font-size:.8125rem}
.fa-banner{padding:.625rem .875rem;border-radius:8px;background:var(--track);color:var(--ink)}
.fa-act{display:inline;margin:0 .25rem 0 0}.fa-act button{border:0;background:none;color:var(--accent);font:inherit;text-decoration:underline;cursor:pointer;padding:0}
.fa-ready{padding:.75rem 1rem;border-radius:8px;border:1px solid var(--line)}
.fa-ready.ok{border-color:#15803d}.fa-ready.no{border-color:var(--err)}
.fa-ready h2{font-size:1.0625rem}.fa-ready ul{margin:.5rem 0 0;padding-left:1.25rem}
.fa-warn{color:var(--ink)}.fa-warn::marker{content:'! '}
.fa-filter{display:flex;flex-wrap:wrap;gap:.5rem;align-items:end}
.fa-filter label{display:grid;gap:.125rem;font-size:.8125rem;color:var(--mute)}
.fa-filter select,.fa-filter input{font:inherit;min-height:36px;padding:0 .5rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink)}
.fa-pill{white-space:nowrap;display:inline-block;padding:.05rem .5rem;border-radius:999px;font-size:.8125rem;background:var(--track);color:var(--ink)}
.fa-pill.paid{background:#dcfce7;color:#14532d}.fa-pill.refunded{background:#fee2e2;color:#7f1d1d}
.fa-flag{color:var(--err);font-weight:600}
.fa-pages{display:flex;gap:1rem;align-items:center}
.fa-sure{font-size:.75rem;color:var(--mute)}
.fa-tiles+.fa-tiles{margin-top:.75rem}
.fa-acts{display:grid;gap:.375rem;min-width:9rem;justify-items:start}.fa-acts .fa-act{margin:0}
.fa-tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--line)}
.fa-tabs a{padding:.5rem .875rem;text-decoration:none;color:var(--body);border-bottom:2px solid transparent}
.fa-tabs a[aria-current]{color:var(--ink);font-weight:600;border-bottom-color:var(--accent)}
.fa-pill.fa-test{background:#fef3c7;color:#78350f}.fa-ids{word-break:break-all;min-width:10rem;max-width:13rem}
.fa-ready h2{margin:0}.fa-filter{margin:.5rem 0}
.fa-good{color:#15803d;font-weight:600}
.fa-wa{display:inline-block;margin:.25rem .25rem 0 0;padding:.15rem .5rem;border-radius:6px;background:#25d366;color:#fff;text-decoration:none;font-size:.8125rem;font-weight:600;white-space:nowrap}
.fa-email-form{display:grid;gap:.25rem}.fa-email-form input{font:inherit;font-size:.8125rem;min-height:30px;padding:0 .375rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);width:12rem}
.fa-email-form button{justify-self:start}
.fa-attn{padding:.75rem 1rem;border-radius:8px;border:1px solid var(--err)}.fa-attn h2{margin:0;font-size:1.0625rem}.fa-attn ul{margin:.5rem 0 0;padding-left:1.25rem}
.fa-attn.ok{border-color:#15803d}
.fa-log td{font-size:.8125rem}
</style>`;

/**
 * The setup check and the verdict above it: can this deployment take real
 * money? `problems` stop a sale; `warnings` are worth fixing.
 */
async function readiness(env, request) {
  const live = isLiveHost(request);
  const keys = hasKeys(env);
  const rows = [
    ['Database (D1) bound as DB', !!env.DB],
    [`Razorpay keys (${keys ? mode(env) : 'not set'} mode)`, keys],
    ['Razorpay webhook secret', !!env.RAZORPAY_WEBHOOK_SECRET],
    ['Download link secret (STORE_TOKEN_SECRET, 16+ characters)', String(env.STORE_TOKEN_SECRET ?? '').length >= 16],
    ['PDF bucket (R2) bound as STORE_FILES', !!env.STORE_FILES],
    ['Emails to buyers (RESEND_API_KEY and NOTIFY_FROM)', canMail(env)],
    ['Copy of each sale to you (NOTIFY_TO)', !!String(env.NOTIFY_TO ?? '').trim()],
    ['Email delivery reports from Resend (RESEND_WEBHOOK_SECRET)', !!env.RESEND_WEBHOOK_SECRET],
    ['Bot check (TURNSTILE_SECRET_KEY)', !!env.TURNSTILE_SECRET_KEY],
    ['Scheduled background check (STORE_CRON_SECRET, see docs/STORE.md)', String(env.STORE_CRON_SECRET ?? '').length >= 16],
  ];
  const problems = [];
  const warnings = [];
  const need = { 'Database (D1) bound as DB': 1, 'Razorpay webhook secret': 1, 'PDF bucket (R2) bound as STORE_FILES': 1 };
  for (const [name, ok] of rows) {
    if (ok) continue;
    if (need[name] || name.startsWith('Razorpay keys') || name.startsWith('Download link secret')) problems.push(`Missing: ${name}`);
    else warnings.push(`Missing: ${name}`);
  }
  if (live && keys && mode(env) === 'test') {
    problems.push('Razorpay TEST keys on the live site: the store refuses every sale here until the live keys (rzp_live_…) are set, so no test card can unlock a file.');
  }
  if (!live && keys && mode(env) === 'live') warnings.push('LIVE Razorpay keys on a preview: payments here are real money.');
  if (live && String(env.STORE_TEST_PRODUCTS ?? '') === '1') {
    warnings.push('STORE_TEST_PRODUCTS is 1 on the live site. It is ignored here (test products are never sold on mykrutidev.com), but remove it from the Production variables.');
  }
  let onSale = 0;
  for (const p of PRODUCTS) {
    let there = false;
    try {
      there = !!(env.STORE_FILES && (await env.STORE_FILES.head(p.file)));
    } catch {
      // not there
    }
    rows.push([`PDF uploaded: ${p.file} (${p.id}, ${p.status})`, there]);
    const selling = p.status === 'live' || (!live && p.status === 'test' && String(env.STORE_TEST_PRODUCTS ?? '') === '1');
    if (selling) {
      onSale += 1;
      if (!there) problems.push(`On sale but its PDF is not in the bucket: ${p.file}`);
    }
  }
  if (!onSale) problems.push(live ? 'No product is on sale on the live site yet (none has status "live" in src/lib/store.js).' : 'No product is on sale on this deployment.');
  const checks = `<ul class="fa-check">${rows
    .map(([name, ok]) => `<li><span class="${ok ? 'fa-ok' : 'fa-no'}">${ok ? OK : NO}</span> ${esc(name)}</li>`)
    .join('')}</ul>`;
  return { checks, problems, warnings, live };
}

function verdict({ problems, warnings, live }, env) {
  const ok = problems.length === 0;
  const where = live ? 'the live site' : 'this preview';
  const title = ok
    ? hasKeys(env) && mode(env) === 'live'
      ? `Ready: ${where} takes real payments`
      : `Ready on ${where} (Razorpay test mode: no real money)`
    : `Not ready: ${where} cannot take payments`;
  const items = [...problems.map((p) => `<li class="fa-no">${esc(p)}</li>`), ...warnings.map((w) => `<li class="fa-warn">${esc(w)}</li>`)];
  return `<section class="fa-ready ${ok ? 'ok' : 'no'}" aria-labelledby="h-ready">
  <h2 id="h-ready"><span class="${ok ? 'fa-ok' : 'fa-no'}">${ok ? OK : NO}</span> ${esc(title)}</h2>
  ${items.length ? `<ul>${items.join('')}</ul>` : ''}
</section>`;
}

const tile = (n, label) => `<div class="fa-tile"><span class="fa-tile-n">${n}</span><span class="fa-tile-l">${esc(label)}</span></div>`;

/** The Razorpay dashboard page of a payment. */
const razorpayLink = (paymentId) => `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(paymentId)}`;

/** What a person should look at, with a link to each order. */
function attention({ items, health }) {
  const list = items.map((i) => `<li>${i.q ? `<a href="?q=${esc(i.q)}&amp;mode=${esc(i.mode)}">${esc(i.text)}</a>` : esc(i.text)}</li>`).join('');
  const ok = items.length === 0;
  return `<section class="fa-attn ${ok ? 'ok' : ''}" aria-labelledby="h-attn">
  <h2 id="h-attn"><span class="${ok ? 'fa-ok' : 'fa-no'}">${ok ? OK : '!'}</span> ${ok ? 'Nothing needs attention' : `Needs attention (${items.length})`}</h2>
  ${list ? `<ul>${list}</ul>` : ''}
  <p class="fa-sub">Background check: ${esc(health.reconcile)} · Razorpay webhook: ${esc(health.razorpay)} · Resend webhook: ${esc(health.resend)}</p>
  <form method="post" class="fa-act"><input type="hidden" name="id" value="-"><button type="submit" name="action" value="reconcile">Run checks now</button></form>
</section>`;
}

function auditLog(rows) {
  if (!rows.length) return '';
  return `<details>
  <summary><h2 id="h-audit" style="display:inline">Audit trail</h2> <span class="fa-sub">last ${rows.length}</span></summary>
  <div class="fa-scroll"><table class="fa-log"><thead><tr><th>When (UTC)</th><th>Order</th><th>What</th><th>Detail</th></tr></thead><tbody>${rows
    .map((r) => `<tr><td class="fa-nowrap">${when(r.at)}</td><td class="fa-sub">${r.order_id ? `<a href="?q=${esc(r.order_id)}">${esc(r.order_id)}</a>` : ''}</td><td>${esc(r.action)}</td><td><!--email_off-->${esc(r.detail)}<!--/email_off--></td></tr>`)
    .join('')}</tbody></table></div>
</details>`;
}

function dashboard(env, { orders, totals, periods, byProduct, ready, links, wa, filter, total, done, modeCounts, attn, log }) {
  const test = filter.mode === 'test';
  const rows = orders
    .map((o) => {
      const product = productById(o.product_id);
      const actions = [];
      const act = (action, text, extra = '') =>
        actions.push(
          `<form method="post" class="fa-act"><input type="hidden" name="id" value="${esc(o.id)}">${extra}<button type="submit" name="action" value="${action}">${text}</button></form>`,
        );
      if (o.status === 'created') act('check', 'Check payment');
      if (o.status === 'paid') {
        // The buyer's own download page: for an order with no email, this is how you can send it to them yourself.
        if (links[o.id]) actions.push(`<a class="fa-act" href="${esc(links[o.id])}">Download link</a>`);
        if (o.email) act('resend', 'Resend email');
        // A buyer's address was wrong: put the right one on and send the link there.
        actions.push(
          `<form method="post" class="fa-act fa-email-form"><input type="hidden" name="id" value="${esc(o.id)}"><input type="email" name="email" required maxlength="254" placeholder="right email" aria-label="New email for ${esc(o.id)}"><button type="submit" name="action" value="email">Change email &amp; send</button></form>`,
        );
        act('extend', '+30 days');
        act('reset', 'Reset downloads');
        // No script on this page, so the browser itself asks: the box must be ticked.
        act('refund', 'Close access (refund done in Razorpay)', '<label class="fa-sure"><input type="checkbox" name="sure" value="1" required> sure</label> ');
      }
      const mailBad = o.status === 'paid' && MAIL_BAD.has(o.mail_status);
      const waBtns = wa[o.id] ? `<br><a class="fa-wa" href="${esc(wa[o.id].hi)}">WhatsApp हिंदी</a><a class="fa-wa" href="${esc(wa[o.id].en)}">WhatsApp English</a>` : '';
      const changed = o.email_prev !== null && o.email_prev !== undefined
        ? `<br><span class="fa-sub">was <!--email_off-->${esc(o.email_prev || '(none)')}<!--/email_off-->, changed by ${esc(o.email_changed_by ?? '?')} ${when(o.email_changed_at)}</span>`
        : '';
      return `<tr>
  <td class="fa-nowrap">${when(o.created_at)}${o.paid_at ? `<br><span class="fa-sub">paid ${when(o.paid_at)}</span>` : ''}</td>
  <td><span class="fa-pill ${esc(o.status)}">${esc(STATUS_NAME[o.status] ?? o.status)}</span>${test ? ' <span class="fa-pill fa-test">TEST</span>' : ''}</td>
  <td>${esc((product?.title ?? o.product_id).replace(/\s*\(.*\)$/, ''))}</td>
  <td class="fa-nowrap">${esc(price(o.amount))}</td>
  <td>${o.email ? `<!--email_off--><a href="mailto:${esc(o.email)}">${esc(o.email)}</a><!--/email_off-->` : '<span class="fa-sub">no email</span>'}${changed}</td>
  <td class="fa-nowrap">${o.phone ? esc(o.phone) : '<span class="fa-sub">–</span>'}${waBtns}</td>
  <td class="fa-nowrap">${o.downloads} / ${o.max_downloads}${o.refunded_amount > 0 && o.status === 'paid' ? `<br><span class="fa-flag">${esc(price(o.refunded_amount))} refunded</span>` : ''}</td>
  <td class="fa-nowrap">${esc(day(o.expires_at))}</td>
  <td>${mailBad ? `<span class="fa-flag">${esc(o.mail_status)}</span>` : o.mail_status === 'delivered' ? '<span class="fa-good">delivered</span>' : esc(o.mail_status ?? '')}</td>
  <td class="fa-sub fa-ids">${esc(o.id)}${o.payment_id ? `<br><a href="${esc(razorpayLink(o.payment_id))}">${esc(o.payment_id)}</a>` : ''}</td>
  <td><div class="fa-acts">${actions.join('')}</div></td>
</tr>`;
    })
    .join('');

  const qs = (over) => {
    const p = new URLSearchParams();
    const f = { ...filter, ...over };
    for (const k of ['mode', 'status', 'product', 'q']) if (f[k]) p.set(k, f[k]);
    if (f.page > 1) p.set('page', String(f.page));
    const str = p.toString();
    return str ? `?${esc(str)}` : '?';
  };
  const from = total ? (filter.page - 1) * PER_PAGE + 1 : 0;
  const to = Math.min(total, filter.page * PER_PAGE);
  const pager = `<div class="fa-pages">
  <span class="fa-sub">${from}–${to} of ${total}</span>
  ${filter.page > 1 ? `<a href="${qs({ page: filter.page - 1 })}">← Newer</a>` : ''}
  ${to < total ? `<a href="${qs({ page: filter.page + 1 })}">Older →</a>` : ''}
</div>`;

  const productRows = byProduct
    .map(
      (p) => `<tr><td>${esc(p.title)}</td><td class="fa-nowrap">${esc(price(p.pricePaise))}</td><td>${esc(p.status)}</td><td class="fa-nowrap">${p.paid}</td><td class="fa-nowrap">${esc(price(p.revenue))}</td><td class="fa-nowrap">${p.refunded}</td></tr>`,
    )
    .join('');

  return page(
    'Orders',
    `${STYLE}<header class="fa-top">
  <h1>Orders ${hasKeys(env) ? `<span class="fa-mode">${esc(mode(env))} mode</span>` : ''}</h1>
  <div class="fa-actions">
    <a class="fa-button" href="?format=csv" download>Download CSV</a>
    <a class="fa-link" href="https://dashboard.razorpay.com/">Razorpay</a>
    <a class="fa-link" href="/admin/feedback">Feedback</a>
    <form method="post" action="/admin/feedback"><button type="submit" name="logout" value="1" class="fa-link">Sign out</button></form>
  </div>
</header>
${done ? `<p class="fa-banner" role="status">${esc(done)}</p>` : ''}
${verdict(ready, env)}
${attention(attn)}

<nav class="fa-tabs" aria-label="Live or test orders">
  ${MODES.map((m) => `<a href="?mode=${m}"${filter.mode === m ? ' aria-current="page"' : ''}>${m === 'live' ? 'Live orders' : 'Test orders'} <span class="fa-sub">${modeCounts[m] ?? 0}</span></a>`).join('')}
</nav>
${test ? '<p class="fa-banner">Test orders: made with Razorpay test keys (on a preview, or before the live keys). No real money moved, and they are never counted in the live totals.</p>' : ''}

<section aria-labelledby="h-totals">
  <h2 id="h-totals">Money in <span class="fa-sub">${test ? 'TEST orders only: no real money' : 'live orders only'}, paid, India time; refunds not counted</span></h2>
  <div class="fa-tiles">
    ${periods.map((p) => tile(`${esc(price(p.revenue))} <span class="fa-sub">· ${p.count}</span>`, p.label)).join('')}
  </div>
  <div class="fa-tiles">
    ${tile(totals.paid, 'paid orders')}
    ${tile(totals.refunded, 'refunded')}
    ${tile(totals.open, 'started, not paid (kept 7 days)')}
    ${tile(totals.mailFailed, 'paid, email not delivered')}
  </div>
</section>

<section aria-labelledby="h-products">
  <h2 id="h-products">By product</h2>
  <div class="fa-scroll"><table>
<thead><tr><th>Product</th><th>Price</th><th>Status</th><th>Paid</th><th>Money in</th><th>Refunded</th></tr></thead>
<tbody>${productRows}</tbody></table></div>
</section>

<section aria-labelledby="h-orders">
  <h2 id="h-orders">Orders</h2>
  <form method="get" class="fa-filter" role="search">
    <input type="hidden" name="mode" value="${esc(filter.mode)}">
    <label>Status <select name="status"><option value="">All</option>${STATUSES.map((st) => `<option value="${st}"${filter.status === st ? ' selected' : ''}>${esc(STATUS_NAME[st])}</option>`).join('')}</select></label>
    <label>Product <select name="product"><option value="">All</option>${PRODUCTS.map((p) => `<option value="${esc(p.id)}"${filter.product === p.id ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>
    <label>Search <input type="search" name="q" value="${esc(filter.q)}" placeholder="order id, email, phone or pay_…" maxlength="120"></label>
    <button type="submit" class="fa-button">Show</button>
    ${filter.status || filter.product || filter.q ? `<a href="?mode=${esc(filter.mode)}">Clear</a>` : ''}
  </form>
  ${pager}
  ${
    orders.length
      ? `<div class="fa-scroll"><table>
<thead><tr><th>Started (UTC)</th><th>Status</th><th>Product</th><th>Amount</th><th>Email</th><th>Phone</th><th>Downloads</th><th>Expires</th><th>Mail</th><th>Ids</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>`
      : '<p class="fa-empty">No orders match.</p>'
  }
</section>

<details>
  <summary><h2 id="h-setup" style="display:inline">Setup check</h2></summary>
  ${ready.checks}
</details>
${auditLog(log)}`,
  );
}

/** Is this form post from our own pages? (An unparsable Origin, such as "null", is not a crash.) */
function sameSite(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return request.headers.get('Sec-Fetch-Site') === 'same-origin';
  }
}

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ now?: number, fetch?: typeof fetch }} [deps]
 */
export async function handleAdminOrders(request, env, deps = {}) {
  const key = env.ADMIN_KEY;
  if (!key || key.length < 16) {
    return page('Orders', '<h1>Orders</h1><p>Not set up: add an ADMIN_KEY secret (16+ characters) in Cloudflare.</p>', 503);
  }
  if (!env.DB) return page('Orders', '<h1>Orders</h1><p>Not set up: bind the D1 database as DB.</p>', 503);
  await ensureStoreSchema(env.DB);

  // Signing in happens on /admin/feedback; the session cookie covers /admin.
  const guarded = await bearerGuard(request, env.DB, key, env.RATE_LIMIT_SALT || key, deps.now);
  if (guarded) return guarded;
  if (!(await isAuthorized(request, key, deps.now))) {
    return new Response(null, { status: 303, headers: { Location: '/admin/feedback', ...SECURITY } });
  }
  const db = env.DB;
  const now = deps.now ?? Date.now();

  if (request.method === 'POST') {
    // Same-site forms only (the session cookie is SameSite=Strict as well). These pages send
    // Referrer-Policy: no-referrer, so a browser posts a form from them with "Origin: null":
    // that is accepted only when the browser says the request is from the same origin.
    if (!sameSite(request)) return new Response('Forbidden', { status: 403, headers: SECURITY });
    const form = await request.formData().catch(() => null);
    const id = String(form?.get('id') ?? '');
    const action = String(form?.get('action') ?? '');
    if (action === 'reconcile') {
      try {
        const r = await reconcile(env, { fetch: deps.fetch, now, origin: siteOrigin(request) });
        await audit(env, null, 'admin-run-checks', `checked ${r.checked}, settled ${r.settled}, mails ${r.mailsSent}/${r.mailsRetried}, refunds seen ${r.refunded} full ${r.partial} partial`, now);
      } catch (err) {
        console.error('admin run checks failed', err);
        return page('Orders', `<h1>Orders</h1><p>The checks did not run: ${esc(String(err?.message ?? err).slice(0, 300))}</p><p><a href="/admin/orders">Back to orders</a></p>`, 500);
      }
      return new Response(null, { status: 303, headers: { Location: '/admin/orders?done=reconcile', ...SECURITY } });
    }
    if (/^o[a-z2-7]{24}$/.test(id)) {
      try {
      if (action === 'check') {
        const r = await settleOrder(env, id, { fetch: deps.fetch, now, origin: siteOrigin(request) });
        await audit(env, id, 'admin-check', `Razorpay says: ${r.state}`, now);
      } else if (action === 'resend') {
        const order = await db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").bind(id).first();
        if (order?.email) {
          const sent = await sendBuyerLink(env, order, { fetchImpl: deps.fetch, origin: siteOrigin(request) });
          await audit(env, id, 'admin-resend', `download email: ${sent}`, now);
        }
      } else if (action === 'email') {
        const email = cleanEmail(form?.get('email'));
        if (!email) return new Response(null, { status: 303, headers: { Location: `/admin/orders?done=bademail&q=${id}`, ...SECURITY } });
        const order = await db
          .prepare(
            // A new download key goes to the new address: a link already sent to
            // the wrong one stops working (token_ver), as when the buyer changes it.
            "UPDATE orders SET email_prev = email, email = ?, email_changed_by = 'admin', email_changed_at = ?, token_ver = token_ver + 1, mail_status = NULL, mail_id = NULL, mail_tries = 0, mail_next = NULL WHERE id = ? AND status = 'paid' RETURNING *",
          )
          .bind(email, isoUtc(now), id)
          .first();
        if (order) {
          await audit(env, id, 'admin-email-change', `${order.email_prev || '(none)'} -> ${email}; old links stop working`, now);
          await sendBuyerLink(env, order, { fetchImpl: deps.fetch, origin: siteOrigin(request) });
        }
      } else if (action === 'refund') {
        if (String(form?.get('sure') ?? '') !== '1') {
          return new Response(null, { status: 303, headers: { Location: '/admin/orders?done=norefund', ...SECURITY } });
        }
        const r = await db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid' RETURNING id").bind(id).first();
        if (r) await audit(env, id, 'admin-close-access', 'Access closed by the owner (refund made in Razorpay)', now);
      } else if (action === 'extend') {
        const r = await db
          .prepare("UPDATE orders SET expires_at = MAX(COALESCE(expires_at, 0), ?) + ? WHERE id = ? AND status = 'paid' RETURNING expires_at")
          .bind(Math.floor(now / 1000), STORE.downloadDays * 86400, id)
          .first();
        if (r) await audit(env, id, 'admin-extend', `open until ${day(r.expires_at)}`, now);
      } else if (action === 'reset') {
        const r = await db
          .prepare("UPDATE orders SET downloads = 0, session_id = NULL, session_at = NULL WHERE id = ? AND status = 'paid' RETURNING max_downloads")
          .bind(id)
          .first();
        if (r) await audit(env, id, 'admin-reset-downloads', `${r.max_downloads} downloads again`, now);
      }
      } catch (err) {
        // Signed in already, so the reason can be shown: a bare 1101 page helps nobody.
        console.error('admin order action failed', action, err);
        return page('Orders', `<h1>Orders</h1><p>That did not work (${esc(action)}): ${esc(String(err?.message ?? err).slice(0, 300))}</p><p><a href="/admin/orders">Back to orders</a></p>`, 500);
      }
      if (ACTION_DONE[action]) {
        const row = await db.prepare(`SELECT ${MODE_EXPR} AS m FROM orders WHERE id = ?`).bind(id).first();
        return new Response(null, { status: 303, headers: { Location: `/admin/orders?done=${action}&q=${id}&mode=${row?.m ?? 'live'}`, ...SECURITY } });
      }
    }
    return new Response(null, { status: 303, headers: { Location: '/admin/orders', ...SECURITY } });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST', ...SECURITY } });
  }

  if (new URL(request.url).searchParams.get('format') === 'csv') {
    const { results } = await db.prepare(`SELECT ${ORDER_COLUMNS.join(', ')} FROM orders ORDER BY created_at`).all();
    return new Response(toCsv(results, ORDER_COLUMNS), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mykrutidev-orders-${new Date(now).toISOString().slice(0, 10)}.csv"`,
        ...SECURITY,
      },
    });
  }

  const params = new URL(request.url).searchParams;
  const filter = {
    status: STATUSES.includes(params.get('status') ?? '') ? params.get('status') : '',
    product: productById(params.get('product') ?? '') ? params.get('product') : '',
    q: String(params.get('q') ?? '').trim().slice(0, 120),
    page: Math.max(1, Math.min(10000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    // Live or test orders: never both at once, so test payments are never counted as money in.
    // The default is the mode of this deployment's keys (live on the live site).
    mode: MODES.includes(params.get('mode') ?? '') ? params.get('mode') : hasKeys(env) ? mode(env) : 'live',
  };
  const where = [MODE_SQL];
  const binds = [filter.mode];
  if (filter.status) (where.push('status = ?'), binds.push(filter.status));
  if (filter.product) (where.push('product_id = ?'), binds.push(filter.product));
  if (filter.q) {
    const q = filter.q.toLowerCase();
    where.push("(id = ? OR payment_id = ? OR link_id = ? OR phone = ? OR email LIKE ? ESCAPE '\\')");
    binds.push(filter.q, filter.q, filter.q, filter.q, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  // "Today" and the other periods start at midnight India time.
  const IST = 5.5 * 3600e3;
  const midnight = Math.floor((now + IST) / 864e5) * 864e5 - IST;
  const since = (ms) => isoUtc(ms);
  const PERIODS = [
    ['Today', since(midnight)],
    ['Last 7 days', since(midnight - 6 * 864e5)],
    ['Last 30 days', since(midnight - 29 * 864e5)],
    ['All time', '0000'],
  ];

  const [orders, count, totals, periodRows, productRows, modeRows] = await Promise.all([
    db
      .prepare(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ${PER_PAGE} OFFSET ${(filter.page - 1) * PER_PAGE}`)
      .bind(...binds)
      .all(),
    db.prepare(`SELECT COUNT(*) AS n FROM orders ${whereSql}`).bind(...binds).first(),
    db
      .prepare(
        `SELECT SUM(status = 'paid') AS paid, SUM(status = 'refunded') AS refunded, SUM(status = 'created') AS open, SUM(status = 'paid' AND mail_status IN ('failed', 'bounced', 'complained')) AS mailFailed FROM orders WHERE ${MODE_SQL}`,
      )
      .bind(filter.mode)
      .first(),
    db
      .prepare(
        `SELECT ${PERIODS.map((_, i) => `COALESCE(SUM(CASE WHEN paid_at >= ?${i + 1} THEN amount END), 0) AS r${i}, SUM(paid_at >= ?${i + 1}) AS c${i}`).join(', ')} FROM orders WHERE status = 'paid' AND ${MODE_SQL.replace('?', `?${PERIODS.length + 1}`)}`,
      )
      .bind(...PERIODS.map(([, t]) => t), filter.mode)
      .first(),
    db
      .prepare(
        `SELECT product_id, SUM(status = 'paid') AS paid, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS revenue, SUM(status = 'refunded') AS refunded FROM orders WHERE ${MODE_SQL} GROUP BY product_id`,
      )
      .bind(filter.mode)
      .all(),
    db.prepare(`SELECT ${MODE_EXPR} AS m, COUNT(*) AS n FROM orders GROUP BY m`).all(),
  ]);
  const modeCounts = Object.fromEntries(modeRows.results.map((r) => [r.m, r.n]));
  const origin = siteOrigin(request);
  const links = {};
  const wa = {};
  for (const o of orders.results) {
    if (o.status !== 'paid') continue;
    const token = await keyFor(env, o);
    links[o.id] = downloadPage(origin, o.id, token);
    const product = productById(o.product_id);
    if (product && o.phone) {
      // Our email did not reach them: the message says so and carries the link.
      const kind = o.mail_status === 'bounced' || o.mail_status === 'complained' ? 'wrong-email' : 'sale';
      wa[o.id] = waLinks(o.phone, waText(kind, { product, email: o.email, links: { hi: downloadPage(origin, o.id, token, 'hi'), en: links[o.id] } }));
    }
  }
  const [attn, log] = await Promise.all([needsAttention(env, filter.mode, now), db.prepare('SELECT * FROM store_audit ORDER BY id DESC LIMIT 50').all()]);
  const sold = Object.fromEntries(productRows.results.map((r) => [r.product_id, r]));
  const byProduct = PRODUCTS.filter((p) => !p.unlisted || sold[p.id]).map((p) => ({
    title: p.title,
    pricePaise: p.pricePaise,
    status: p.status,
    paid: sold[p.id]?.paid ?? 0,
    revenue: sold[p.id]?.revenue ?? 0,
    refunded: sold[p.id]?.refunded ?? 0,
  }));
  const doneKey = params.get('done') ?? '';
  const done =
    doneKey === 'norefund'
      ? 'Not refunded: tick "sure" first.'
      : doneKey === 'bademail'
        ? 'Not changed: that is not an email address.'
        : (ACTION_DONE[doneKey] ?? '');
  return dashboard(env, {
    links,
    wa,
    orders: orders.results,
    total: count?.n ?? 0,
    filter,
    modeCounts,
    done,
    periods: PERIODS.map(([label], i) => ({ label, revenue: periodRows?.[`r${i}`] ?? 0, count: periodRows?.[`c${i}`] ?? 0 })),
    byProduct,
    totals: { paid: totals?.paid ?? 0, refunded: totals?.refunded ?? 0, open: totals?.open ?? 0, mailFailed: totals?.mailFailed ?? 0 },
    ready: await readiness(env, request),
    attn,
    log: log.results,
  });
}

/** How long ago, in words a person reads at a glance. */
function ago(iso, now) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'never';
  const m = Math.max(0, Math.round((now - t) / 60e3));
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

/** The "Needs attention" list for one mode (live or test). */
async function needsAttention(env, m, now) {
  const db = env.DB;
  const items = [];
  const [mail, dupes, partial, meta] = await Promise.all([
    db
      .prepare(`SELECT id, email, mail_status FROM orders WHERE status = 'paid' AND ${MODE_SQL} AND (mail_status IN ('failed', 'bounced', 'complained') OR (email != '' AND mail_status IS NULL AND paid_at < ?)) ORDER BY paid_at DESC LIMIT 20`)
      .bind(m, isoUtc(now - 30 * 60e3))
      .all(),
    // The same person (email or phone) paying twice for one product.
    db
      .prepare(
        `SELECT product_id, who, COUNT(*) AS n FROM (SELECT product_id, email AS who FROM orders WHERE status = 'paid' AND email != '' AND ${MODE_SQL} UNION ALL SELECT product_id, phone AS who FROM orders WHERE status = 'paid' AND phone IS NOT NULL AND phone != '' AND ${MODE_SQL}) GROUP BY product_id, who HAVING COUNT(*) > 1 LIMIT 20`,
      )
      .bind(m, m)
      .all(),
    db.prepare(`SELECT id, amount, refunded_amount FROM orders WHERE status = 'paid' AND refunded_amount > 0 AND ${MODE_SQL} LIMIT 20`).bind(m).all(),
    Promise.all(['reconcile_at', 'razorpay_webhook_at', 'resend_webhook_at'].map((k) => getMeta(env, k))),
  ]);
  for (const o of mail.results) {
    const why = o.mail_status === 'bounced' ? 'bounced (wrong address?)' : o.mail_status === 'complained' ? 'marked as spam by the buyer' : o.mail_status === 'failed' ? 'could not be sent (retrying)' : 'no delivery report yet';
    items.push({ q: o.id, mode: m, text: `Download email ${why}: ${o.id}` });
  }
  for (const d of dupes.results) {
    const product = productById(d.product_id);
    items.push({ q: d.who, mode: m, text: `Paid ${d.n} times for ${product?.title ?? d.product_id} by the same email or phone: a double payment to refund?` });
  }
  for (const o of partial.results) items.push({ q: o.id, mode: m, text: `Partly refunded (${price(o.refunded_amount)} of ${price(o.amount)}), downloads still open: ${o.id}` });
  const [reconcileAt, razorpayAt, resendAt] = meta;
  const stale = !Number.isFinite(Date.parse(reconcileAt ?? '')) || now - Date.parse(reconcileAt) > 60 * 60e3;
  if (stale && hasKeys(env) && mode(env) === m) {
    items.push({ text: `The background check has not run for over an hour (last: ${ago(reconcileAt, now)}). Set up the schedule in docs/STORE.md, or press "Run checks now".` });
  }
  return { items, health: { reconcile: ago(reconcileAt, now), razorpay: ago(razorpayAt, now), resend: ago(resendAt, now) } };
}

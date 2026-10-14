/**
 * /admin/orders - the private page for the store's orders.
 *
 * Wired up by functions/admin/orders.js. Same login as /admin/feedback (the
 * ADMIN_KEY session cookie covers all of /admin), same rules: no page file, in
 * no sitemap, noindex, and a CSP that allows no script.
 *
 *   GET  /admin/orders              setup check, totals, the latest 200 orders
 *   GET  /admin/orders?format=csv   every order, as a spreadsheet
 *   POST /admin/orders              action=check|resend|refund|extend, id=<order>
 *
 * The actions:
 *   check    ask Razorpay again whether an unpaid order was paid (a buyer who
 *            closed the tab, or a webhook that never came)
 *   resend   send the download email again (only for an order that has an email)
 *   (a paid order also shows its download link, to send to a buyer who gave no email)
 *   refund   end the downloads of a refunded order. The money itself is
 *            refunded in Razorpay's dashboard; when the webhook for it is set up
 *            this happens by itself for a full refund
 *   extend   give the buyer a fresh set of downloads and another 30 days
 */
import { ORDER_COLUMNS, STORE, PRODUCTS, price, productById } from '../src/lib/store.js';
import { toCsv } from '../src/lib/feedback.js';
import { SECURITY, esc, isAuthorized, page } from './feedbackAdmin.js';
import { ensureStoreSchema, downloadToken, siteOrigin, settleOrder } from './storeApi.js';
import { hasKeys, mode } from './razorpay.js';
import { buyerMail, canMail, downloadPage, sendMail } from './storeMail.js';

const LATEST = 200;
const OK = '✓';
const NO = '✗';

const when = (iso) => esc(String(iso ?? '').slice(0, 16).replace('T', ' '));
const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : '');

const STYLE = `<style>
.fa-check{list-style:none;margin:0;padding:0;display:grid;gap:.25rem}
.fa-ok{color:#15803d;font-weight:600}.fa-no{color:#b91c1c;font-weight:600}
.fa-mode{display:inline-block;padding:.1rem .5rem;border-radius:999px;background:var(--track);color:var(--ink);font-size:.8125rem}
.fa-banner{padding:.625rem .875rem;border-radius:8px;background:var(--track);color:var(--ink)}
.fa-act{display:inline;margin:0 .25rem 0 0}.fa-act button{border:0;background:none;color:var(--accent);font:inherit;text-decoration:underline;cursor:pointer;padding:0}
</style>`;

/** The setup check: what is connected and what is missing. */
async function setup(env) {
  const rows = [
    ['Database (D1) bound as DB', !!env.DB],
    [`Razorpay keys (${hasKeys(env) ? mode(env) : 'not set'} mode)`, hasKeys(env)],
    ['Razorpay webhook secret', !!env.RAZORPAY_WEBHOOK_SECRET],
    ['Download link secret (STORE_TOKEN_SECRET, 16+ characters)', String(env.STORE_TOKEN_SECRET ?? '').length >= 16],
    ['PDF bucket (R2) bound as STORE_FILES', !!env.STORE_FILES],
    ['Emails to buyers (RESEND_API_KEY and NOTIFY_FROM)', canMail(env)],
    ['Copy of each sale to you (NOTIFY_TO)', !!String(env.NOTIFY_TO ?? '').trim()],
    ['Bot check (TURNSTILE_SECRET_KEY)', !!env.TURNSTILE_SECRET_KEY],
  ];
  for (const p of PRODUCTS) {
    let there = false;
    try {
      there = !!(env.STORE_FILES && (await env.STORE_FILES.head(p.file)));
    } catch {
      // not there
    }
    rows.push([`PDF uploaded: ${p.file} (${p.id}, ${p.status})`, there]);
  }
  return `<ul class="fa-check">${rows
    .map(([name, ok]) => `<li><span class="${ok ? 'fa-ok' : 'fa-no'}">${ok ? OK : NO}</span> ${esc(name)}</li>`)
    .join('')}</ul>`;
}

function dashboard(env, { orders, totals, checks, links }) {
  const test = hasKeys(env) && mode(env) === 'test';
  const rows = orders
    .map((o) => {
      const product = productById(o.product_id);
      const actions = [];
      const act = (action, text) =>
        actions.push(
          `<form method="post" class="fa-act"><input type="hidden" name="id" value="${esc(o.id)}"><button type="submit" name="action" value="${action}">${text}</button></form>`,
        );
      if (o.status === 'created') act('check', 'Check payment');
      if (o.status === 'paid') {
        // The buyer's own download page: for an order with no email, this is how you can send it to them yourself.
        if (links[o.id]) actions.push(`<a class="fa-act" href="${esc(links[o.id])}">Download link</a>`);
        if (o.email) act('resend', 'Resend email');
        act('extend', 'Extend');
        act('refund', 'Mark refunded');
      }
      return `<tr>
  <td class="fa-nowrap">${when(o.created_at)}</td>
  <td>${esc(o.status)}</td>
  <td>${esc(product?.title ?? o.product_id)}</td>
  <td class="fa-nowrap">${esc(price(o.amount))}</td>
  <td>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : '<span class="sub">no email</span>'}</td>
  <td class="fa-nowrap">${o.downloads} / ${o.max_downloads}</td>
  <td class="fa-nowrap">${esc(day(o.expires_at))}</td>
  <td>${esc(o.mail_status ?? '')}</td>
  <td class="fa-sub">${esc(o.id)}${o.payment_id ? `<br>${esc(o.payment_id)}` : ''}</td>
  <td>${actions.join('')}</td>
</tr>`;
    })
    .join('');

  return page(
    'Orders',
    `${STYLE}<header class="fa-top">
  <h1>Orders ${hasKeys(env) ? `<span class="fa-mode">${esc(mode(env))} mode</span>` : ''}</h1>
  <div class="fa-actions">
    <a class="fa-button" href="?format=csv" download>Download CSV</a>
    <a class="fa-link" href="/admin/feedback">Feedback</a>
    <form method="post" action="/admin/feedback"><button type="submit" name="logout" value="1" class="fa-link">Sign out</button></form>
  </div>
</header>
${test ? '<p class="fa-banner">Razorpay is in TEST mode: no real money moves.</p>' : ''}

<section aria-labelledby="h-totals">
  <h2 id="h-totals">Totals</h2>
  <div class="fa-tiles">
    <div class="fa-tile"><span class="fa-tile-n">${totals.paid}</span><span class="fa-tile-l">paid orders</span></div>
    <div class="fa-tile"><span class="fa-tile-n">${esc(price(totals.revenue))}</span><span class="fa-tile-l">paid in total</span></div>
    <div class="fa-tile"><span class="fa-tile-n">${totals.refunded}</span><span class="fa-tile-l">refunded</span></div>
    <div class="fa-tile"><span class="fa-tile-n">${totals.open}</span><span class="fa-tile-l">started, not paid</span></div>
  </div>
</section>

<section aria-labelledby="h-setup">
  <h2 id="h-setup">Setup check</h2>
  ${checks}
</section>

<section aria-labelledby="h-orders">
  <h2 id="h-orders">Latest ${orders.length} orders</h2>
  ${
    orders.length
      ? `<div class="fa-scroll"><table>
<thead><tr><th>Started (UTC)</th><th>Status</th><th>Product</th><th>Amount</th><th>Email</th><th>Downloads</th><th>Expires</th><th>Mail</th><th>Ids</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>`
      : '<p class="fa-empty">No orders yet.</p>'
  }
</section>`,
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
  if (!(await isAuthorized(request, key))) {
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
    if (/^o[a-z2-7]{24}$/.test(id)) {
      try {
      if (action === 'check') {
        await settleOrder(env, id, { fetch: deps.fetch, now, origin: siteOrigin(request) });
      } else if (action === 'resend') {
        const order = await db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").bind(id).first();
        const product = order && productById(order.product_id);
        if (order && product) {
          const origin2 = siteOrigin(request);
          const link = downloadPage(origin2, order.id, await downloadToken(env, order.id));
          const sent = canMail(env) && (await sendMail(env, buyerMail(env, { order, product, link, origin: origin2 }), deps.fetch));
          await db.prepare('UPDATE orders SET mail_status = ? WHERE id = ?').bind(sent ? 'sent' : 'failed', id).run();
        }
      } else if (action === 'refund') {
        await db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid'").bind(id).run();
      } else if (action === 'extend') {
        await db
          .prepare(
            "UPDATE orders SET downloads = 0, expires_at = MAX(COALESCE(expires_at, 0), ?) + ? WHERE id = ? AND status = 'paid'",
          )
          .bind(Math.floor(now / 1000), STORE.downloadDays * 86400, id)
          .run();
      }
      } catch (err) {
        // Signed in already, so the reason can be shown: a bare 1101 page helps nobody.
        console.error('admin order action failed', action, err);
        return page('Orders', `<h1>Orders</h1><p>That did not work (${esc(action)}): ${esc(String(err?.message ?? err).slice(0, 300))}</p><p><a href="/admin/orders">Back to orders</a></p>`, 500);
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

  const [orders, totals] = await Promise.all([
    db.prepare(`SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ${LATEST}`).all(),
    db
      .prepare(
        "SELECT SUM(status = 'paid') AS paid, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS revenue, SUM(status = 'refunded') AS refunded, SUM(status = 'created') AS open FROM orders",
      )
      .first(),
  ]);
  const origin = siteOrigin(request);
  const links = {};
  for (const o of orders.results) {
    if (o.status === 'paid') links[o.id] = downloadPage(origin, o.id, await downloadToken(env, o.id));
  }
  return dashboard(env, {
    links,
    orders: orders.results,
    totals: { paid: totals?.paid ?? 0, revenue: totals?.revenue ?? 0, refunded: totals?.refunded ?? 0, open: totals?.open ?? 0 },
    checks: await setup(env),
  });
}

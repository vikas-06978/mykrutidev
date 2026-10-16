/**
 * The store's background check ("reconciliation"): what makes a captured
 * payment reach a usable file without the buyer keeping a tab open and
 * without the owner stepping in.
 *
 *   1. Unpaid orders whose Razorpay page may have been paid (a closed tab, a
 *      UPI app that never came back, a webhook that never arrived) are asked
 *      about again; a paid one is settled exactly as if the buyer had returned.
 *   2. Download emails that failed to send are retried, with a growing wait.
 *   3. Refunds made in Razorpay's dashboard are picked up from the payment
 *      itself, in case the refund webhook was missed. Only a full refund ends
 *      the downloads; a partial one is recorded.
 *   4. When (1) settles anything, the owner is told once in a while that
 *      Razorpay's webhook may not be reaching the site.
 *
 * It runs (a) on a schedule: POST /api/store/reconcile with
 * `Authorization: Bearer <STORE_CRON_SECRET>` (docs/STORE.md has the setup),
 * (b) from /admin/orders, "Run checks now", and (c) piggy-backed on store
 * traffic, at most once every RECONCILE_EVERY minutes (maybeReconcile), so it
 * still runs if no schedule was set up. Every step is idempotent: running it
 * twice at once settles, mails or refunds nothing twice.
 */
import { STORE, SITE_URL, productById } from '../src/lib/store.js';
import { fetchPayment } from './razorpay.js';
import { audit, ensureStoreSchema, getMeta, sendBuyerLink, setMeta, settleOrder, siteOrigin } from './storeApi.js';
import { canMail, owners, sendMail } from './storeMail.js';
import { clientIp, countHit, reply } from './feedbackApi.js';

/** Minutes between piggy-backed runs. */
export const RECONCILE_EVERY = 10;
/** The owner is alerted about a silent webhook at most this often (hours). */
const ALERT_EVERY_HOURS = 6;

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * One run. Returns what it did.
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch, now?: number, origin?: string, limit?: number }} [deps]
 */
export async function reconcile(env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now();
  const nowS = Math.floor(now / 1000);
  const limit = deps.limit ?? 10;
  const origin = deps.origin ?? SITE_URL;
  const db = env.DB;
  await ensureStoreSchema(db);
  const out = { checked: 0, settled: 0, mailsRetried: 0, mailsSent: 0, refundsChecked: 0, refunded: 0, partial: 0 };

  // 1. Unpaid orders of the last 3 days (older ones are closed links), newest first.
  const { results: open } = await db
    .prepare(
      "SELECT id FROM orders WHERE status = 'created' AND link_id IS NOT NULL AND created_at > ? AND created_at < ? AND COALESCE(mode, 'test') = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(iso(now - 3 * 864e5), iso(now - 2 * 60e3), modeOf(env), limit)
    .all();
  for (const { id } of open) {
    out.checked += 1;
    const r = await settleOrder(env, id, { fetch: fetchImpl, now, origin });
    // settleOrder sends the emails itself the first time it marks an order paid.
    if (r.fresh) {
      out.settled += 1;
      await audit(env, id, 'paid-by-background-check', 'Razorpay said paid; no webhook or return had settled it', now);
    }
  }

  // 2. Download emails that failed to send, when their wait is over.
  if (canMail(env)) {
    const { results: failed } = await db
      .prepare(
        "SELECT * FROM orders WHERE status = 'paid' AND email != '' AND mail_status = 'failed' AND mail_tries < ? AND (mail_next IS NULL OR mail_next <= ?) AND COALESCE(mode, 'test') = ? LIMIT ?",
      )
      .bind(STORE.mailRetries, nowS, modeOf(env), limit)
      .all();
    for (const order of failed) {
      out.mailsRetried += 1;
      if ((await sendBuyerLink(env, order, { fetchImpl, origin })) === 'sent') out.mailsSent += 1;
    }
  }

  // 3. Refunds made in Razorpay's dashboard: each paid order of the last 30
  //    days is looked at about every 6 hours, a few per run.
  const { results: toCheck } = await db
    .prepare(
      "SELECT id, amount, payment_id, refunded_amount FROM orders WHERE status = 'paid' AND payment_id IS NOT NULL AND paid_at > ? AND (refund_checked_at IS NULL OR refund_checked_at < ?) AND COALESCE(mode, 'test') = ? ORDER BY COALESCE(refund_checked_at, 0) LIMIT 5",
    )
    .bind(iso(now - 30 * 864e5), nowS - 6 * 3600, modeOf(env))
    .all();
  for (const o of toCheck) {
    out.refundsChecked += 1;
    let refundedPaise;
    try {
      refundedPaise = Math.max(0, Math.floor(Number((await fetchPayment(env, o.payment_id, fetchImpl))?.amount_refunded) || 0));
    } catch {
      continue; // Razorpay unreachable: try this one again next run
    }
    const full = refundedPaise >= o.amount;
    await db
      .prepare(
        "UPDATE orders SET refund_checked_at = ?, refunded_amount = MAX(refunded_amount, ?), status = CASE WHEN ? THEN 'refunded' ELSE status END WHERE id = ? AND status = 'paid'",
      )
      .bind(nowS, Math.min(refundedPaise, o.amount), full ? 1 : 0, o.id)
      .run();
    if (full) {
      out.refunded += 1;
      await audit(env, o.id, 'refund-full', `Seen by the background check: Razorpay refunded ${refundedPaise} paise`, now);
    } else if (refundedPaise > (o.refunded_amount ?? 0)) {
      out.partial += 1;
      await audit(env, o.id, 'refund-partial', `Seen by the background check: Razorpay refunded ${refundedPaise} of ${o.amount} paise`, now);
    }
  }

  await setMeta(env, 'reconcile_at', iso(now));
  await setMeta(env, 'reconcile_last', JSON.stringify(out));

  // 4. Payments only the background check found: the webhook is probably not arriving.
  if (out.settled > 0 && canMail(env) && owners(env).length) {
    const last = Date.parse((await getMeta(env, 'alert_webhook_at')) ?? '');
    if (!Number.isFinite(last) || now - last > ALERT_EVERY_HOURS * 3600e3) {
      await setMeta(env, 'alert_webhook_at', iso(now));
      await sendMail(
        env,
        {
          to: owners(env),
          subject: `MyKrutiDev: ${out.settled} payment(s) were confirmed only by the background check`,
          text: [
            `The store's background check found ${out.settled} paid order(s) that Razorpay's webhook had not reported.`,
            `The buyers got their downloads anyway. But please check the webhook in Razorpay: Account & Settings > Webhooks,`,
            `URL ${origin}/api/store/webhook, events payment_link.paid and refund.processed, and that it is not disabled.`,
            ``,
            `Orders: ${origin}/admin/orders`,
          ].join('\n'),
        },
        fetchImpl,
      );
    }
  }
  return out;
}

const modeOf = (env) => (String(env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_test_') ? 'test' : 'live');

/**
 * Run the check if the last run is older than RECONCILE_EVERY minutes. Only
 * one caller wins the slot (an atomic compare-and-set on store_meta), so busy
 * traffic starts it once. Never throws: a failed run waits for the next slot.
 */
export async function maybeReconcile(env, deps = {}) {
  try {
    if (!env.DB || !env.RAZORPAY_KEY_ID) return null;
    const now = deps.now ?? Date.now();
    await ensureStoreSchema(env.DB);
    const due = iso(now - RECONCILE_EVERY * 60e3);
    await env.DB.prepare("INSERT INTO store_meta (key, value) VALUES ('reconcile_slot', '1970-01-01T00:00:00Z') ON CONFLICT (key) DO NOTHING").run();
    const won = await env.DB.prepare("UPDATE store_meta SET value = ? WHERE key = 'reconcile_slot' AND value < ? RETURNING value")
      .bind(iso(now), due)
      .first();
    if (!won) return null;
    const origin = deps.origin ?? (deps.request ? siteOrigin(deps.request) : undefined);
    return await reconcile(env, { ...deps, origin });
  } catch (e) {
    console.error('background check failed', e?.message || e);
    return null;
  }
}

/** Is a product on this order known? (for the attention list) */
export const knownProduct = (id) => !!productById(id);

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * POST /api/store/reconcile, for a scheduler (cron-job.org, a Cloudflare
 * Worker cron): `Authorization: Bearer <STORE_CRON_SECRET>` (or the ADMIN_KEY).
 * Answers with the counts only, never order details.
 */
export async function handleReconcile(request, env, deps = {}) {
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
  const keys = [env.STORE_CRON_SECRET, env.ADMIN_KEY].filter((k) => typeof k === 'string' && k.length >= 16);
  if (!env.DB || !keys.length) return reply(503, { ok: false, error: 'not-set-up' });
  await ensureStoreSchema(env.DB);
  const auth = request.headers.get('Authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let ok = false;
  for (const k of keys) if (given && (await sameSecret(given, k))) ok = true;
  if (!ok) {
    // Wrong keys count against the admin login limit.
    const { hits } = await countHit(env.DB, clientIp(request), env.RATE_LIMIT_SALT || keys[0], { scope: 'admin', now: deps.now });
    return reply(hits > 10 ? 429 : 401, { ok: false, error: hits > 10 ? 'rate-limited' : 'unauthorized' });
  }
  if (!env.RAZORPAY_KEY_ID) return reply(503, { ok: false, error: 'not-set-up' });
  const done = await reconcile(env, { ...deps, origin: deps.origin ?? siteOrigin(request) });
  return reply(200, { ok: true, ...done });
}

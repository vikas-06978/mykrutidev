/**
 * An email to the site's owner for each saved feedback or tool request.
 *
 * Optional: nothing is sent until all three are set in Cloudflare Pages
 * (Settings -> Variables and Secrets), and a failure here never reaches the
 * visitor - the submission is already saved when this runs.
 *
 *   RESEND_API_KEY   secret; an API key from resend.com, domain verified
 *   NOTIFY_TO        where it goes (comma separated for more than one)
 *   NOTIFY_FROM      the sender, on the verified domain:
 *                    MyKrutiDev <contact@mykrutidev.com>
 *
 * The mail is plain text, and the visitor's own email (when they gave one) is
 * set as Reply-To, so answering is one click. Only what is already stored in
 * the database is sent: never an IP address or a user-agent string, and no
 * visitor-written text goes in the subject.
 */
import { LABELS } from './adminLabels.js';

const API = 'https://api.resend.com/emails';

/** One line, no control characters, shortened. */
const oneLine = (s, max = 120) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);

const names = (json, table) => {
  let ids;
  try {
    ids = JSON.parse(json || '[]');
  } catch {
    ids = [];
  }
  return Array.isArray(ids) && ids.length ? ids.map((id) => table[id] || oneLine(id, 40)).join(', ') : '-';
};

/** The subject and text of the mail for one saved row. */
export function compose(kind, row, id) {
  if (kind === 'tool_requests') {
    return {
      subject: `MyKrutiDev tool request #${id}`,
      text: [
        `Tool wanted: ${row.idea}`,
        `What it would help with: ${row.details || '-'}`,
        `Email (to reply): ${row.email || 'not given'}`,
        '',
        `Language: ${row.lang}, device: ${row.device}`,
        `Request #${id}. All requests: https://mykrutidev.com/admin/feedback`,
      ].join('\n'),
    };
  }
  const rating = LABELS.ratings[row.rating] || String(row.rating);
  return {
    subject: `MyKrutiDev feedback #${id}: ${rating} (${oneLine(row.page, 60)})`,
    text: [
      `Rating: ${rating} (${row.rating} of 4)`,
      `Used today: ${names(row.used, LABELS.used)}`,
      `Wants next: ${names(row.wants, LABELS.wants)}`,
      row.bug_text ? `What went wrong: ${row.bug_text}` : null,
      `Message: ${row.message || '-'}`,
      `Email (to reply): ${row.email || 'not given'}`,
      '',
      `Page: ${row.page}`,
      `Language: ${row.lang}, theme: ${row.theme}, device: ${row.device}, screen width: ${row.width}px, browser: ${row.browser}`,
      `Feedback #${id}. All feedback: https://mykrutidev.com/admin/feedback`,
    ]
      .filter((l) => l !== null)
      .join('\n'),
  };
}

/**
 * Email the owner about one saved row. Resolves true when Resend accepted it;
 * never throws, so it is safe to hand to waitUntil.
 * @param {Record<string, any>} env
 * @param {'feedback' | 'tool_requests'} kind
 * @param {Record<string, any>} row  as stored
 * @param {number} id
 * @param {typeof fetch} [fetchImpl]  for tests
 */
export async function notifyOwner(env, kind, row, id, fetchImpl = fetch) {
  const { RESEND_API_KEY: key, NOTIFY_TO: to, NOTIFY_FROM: from } = env;
  if (!key || !to || !from) return false;
  try {
    const { subject, text } = compose(kind, row, id);
    const body = {
      from,
      to: to
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      subject,
      text,
    };
    if (row.email) body.reply_to = row.email;
    const res = await fetchImpl(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('owner notification refused', res.status);
    return res.ok;
  } catch (e) {
    console.error('owner notification failed', e?.message || e);
    return false;
  }
}

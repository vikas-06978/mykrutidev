/**
 * The feedback API and admin page, against a real local D1 database (the
 * SQLite engine Cloudflare runs, via wrangler's getPlatformProxy). The
 * handlers are called directly with Requests - exactly what the Pages
 * Functions in functions/ do. tests/feedback-pages.test.js runs the same
 * thing through `wrangler pages dev`, routing and all.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

import { ensureSchema, handleConfig, handleFeedback, handleToolRequest } from './feedbackApi.js';
import { handleAdmin } from './feedbackAdmin.js';
import { LIMITS, RATE } from '../src/lib/feedback.js';

let proxy;
let DB;
before(async () => {
  proxy = await getPlatformProxy({
    configPath: fileURLToPath(new URL('./wrangler.test.jsonc', import.meta.url)),
    persist: false,
  });
  DB = proxy.env.DB;
});
after(() => proxy?.dispose());

const ADMIN_KEY = 'a-long-test-admin-key-0123456789';
const ctx = { page: '/hindi-keyboard', lang: 'hi', theme: 'dark', device: 'mobile', width: 390, browser: 'Chrome' };
const good = { rating: 4, used: ['hindi-keyboard'], wants: ['bug', 'exam-mode'], bugText: 'Matra went wrong', ...ctx };

let ipN = 0;
/** A fresh IP per test unless one is given, so the rate limit only bites where it is meant to. */
const post = (body, { ip = `203.0.113.${++ipN}`, env = {}, raw, type = 'application/json', deps } = {}) =>
  handleFeedback(
    new Request('https://mykrutidev.com/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': type, 'CF-Connecting-IP': ip },
      body: raw ?? JSON.stringify(body),
    }),
    { DB, ...env },
    deps,
  );

const rows = async () => (await DB.prepare('SELECT * FROM feedback ORDER BY id').all()).results;

beforeEach(async () => {
  // Every test starts on empty tables.
  await ensureSchema(DB);
  await DB.batch(['feedback', 'feedback_rate', 'tool_requests'].map((t) => DB.prepare(`DELETE FROM ${t}`)));
});

const request = { idea: 'PDF to Kruti Dev', details: 'सरकारी नोटिस PDF में आते हैं', lang: 'hi', device: 'mobile' };
const postRequest = (body, { ip = `203.0.113.${++ipN}`, env = {}, deps } = {}) =>
  handleToolRequest(
    new Request('https://mykrutidev.com/api/tool-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    { DB, ...env },
    deps,
  );
const requestRows = async () => (await DB.prepare('SELECT * FROM tool_requests ORDER BY id').all()).results;

describe('POST /api/tool-request', () => {
  test('stores a request, with no IP address anywhere', async () => {
    const r = await postRequest({ ...request, email: 'Me@Example.com' }, { ip: '198.51.100.9' });
    assert.equal(r.status, 201);
    const [row] = await requestRows();
    assert.equal(row.id, (await r.json()).id);
    assert.deepEqual(
      [row.idea, row.details, row.email, row.lang, row.device],
      ['PDF to Kruti Dev', 'सरकारी नोटिस PDF में आते हैं', 'me@example.com', 'hi', 'mobile'],
    );
    assert.match(row.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const everything = JSON.stringify([await requestRows(), (await DB.prepare('SELECT * FROM feedback_rate').all()).results]);
    assert.doesNotMatch(everything, /198\.51\.100\.9/);
    assert.equal((await rows()).length, 0, 'nothing in the feedback table');
  });

  test('refuses an empty idea, unknown fields, the honeypot - and stores nothing', async () => {
    for (const bad of [
      { ...request, idea: ' a ' },
      { ...request, idea: undefined },
      { ...request, rating: 4 },
      { ...request, email: 'not-an-email' },
      { ...request, website: 'http://spam' },
    ]) {
      const r = await postRequest(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.equal((await requestRows()).length, 0);
  });

  test(`its own rate limit: ${RATE.max} per IP per hour, apart from feedback`, async () => {
    const ip = '198.51.100.20';
    for (let i = 0; i < RATE.max; i++) assert.equal((await postRequest(request, { ip })).status, 201);
    assert.equal((await postRequest(request, { ip })).status, 429);
    // Feedback from the same IP is counted separately.
    assert.equal((await post(good, { ip })).status, 201);
  });

  test('with a Turnstile secret, a request needs a good token', async () => {
    const env = { TURNSTILE_SECRET_KEY: 'secret' };
    const verify = async (token) => token === 'good';
    assert.equal((await postRequest(request, { env, deps: { verify } })).status, 403);
    assert.equal((await postRequest({ ...request, token: 'bad' }, { env, deps: { verify } })).status, 403);
    assert.equal((await postRequest({ ...request, token: 'good' }, { env, deps: { verify } })).status, 201);
  });
});

describe('POST /api/feedback', () => {
  test('stores valid feedback, with no IP address anywhere', async () => {
    const r = await post({ ...good, email: 'Reader@Example.com', message: 'बहुत अच्छा' }, { ip: '198.51.100.7' });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    const [row] = await rows();
    assert.equal(row.id, body.id);
    assert.match(row.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.equal(row.rating, 4);
    assert.equal(row.used, '["hindi-keyboard"]');
    assert.equal(row.wants, '["exam-mode","bug"]');
    assert.equal(row.bug_text, 'Matra went wrong');
    assert.equal(row.message, 'बहुत अच्छा');
    assert.equal(row.email, 'reader@example.com');
    assert.deepEqual(
      [row.page, row.lang, row.theme, row.device, row.width, row.browser],
      ['/hindi-keyboard', 'hi', 'dark', 'mobile', 390, 'Chrome'],
    );
    // The IP is in neither table, in any form a person could read.
    const everything = JSON.stringify([await rows(), (await DB.prepare('SELECT * FROM feedback_rate').all()).results]);
    assert.doesNotMatch(everything, /198\.51\.100\.7/);
  });

  test('rejects invalid input and stores nothing', async () => {
    for (const bad of [
      { ...good, rating: 7 },
      { ...good, used: ['not-a-tool'] },
      { ...good, message: 'x'.repeat(LIMITS.message + 1) },
      { ...good, email: 'not-an-email' },
      { ...good, page: 'https://elsewhere.example/' },
      { ...good, text: 'converted text from the tool' },
    ]) {
      const r = await post(bad);
      assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 80));
      assert.equal((await r.json()).error, 'invalid');
    }
    assert.deepEqual(await rows(), []);
  });

  test('rejects a body that is not JSON, not labelled JSON, or too large', async () => {
    assert.equal((await post(null, { raw: '{nope' })).status, 400);
    assert.equal((await post(good, { type: 'text/plain' })).status, 415);
    assert.equal((await post(null, { raw: JSON.stringify({ ...good, message: 'x'.repeat(LIMITS.body) }) })).status, 413);
    assert.deepEqual(await rows(), []);
  });

  test('the honeypot rejects a bot, and stores nothing', async () => {
    const r = await post({ ...good, website: 'http://spam.example' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'rejected');
    assert.deepEqual(await rows(), []);
    // An empty honeypot is what every real visitor sends.
    assert.equal((await post({ ...good, website: '' })).status, 201);
  });

  test(`rate limit: ${RATE.max} per IP per hour, then 429 - other IPs and the next hour unaffected`, async () => {
    const now = Date.UTC(2026, 8, 25, 10, 15);
    const at = (ip, t = now) => post(good, { ip, deps: { now: t } });
    for (let i = 0; i < RATE.max; i++) assert.equal((await at('192.0.2.1')).status, 201);
    const blocked = await at('192.0.2.1');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('Retry-After'), String(45 * 60));
    assert.equal((await at('192.0.2.2')).status, 201, 'another IP');
    assert.equal((await at('192.0.2.1', now + 3600e3)).status, 201, 'next hour');
    assert.equal((await rows()).length, RATE.max + 2);
    // Invalid and honeypot requests count too, so a flood cannot probe for free.
    for (let i = 0; i < RATE.max; i++) await post({ rating: 0 }, { ip: '192.0.2.3' });
    assert.equal((await post(good, { ip: '192.0.2.3' })).status, 429);
  });

  test('rate-limit rows hold only a hash, and are deleted once their hour is over', async () => {
    const now = Date.UTC(2026, 8, 25, 10, 15);
    await post(good, { ip: '192.0.2.9', deps: { now } });
    const [row] = (await DB.prepare('SELECT * FROM feedback_rate').all()).results;
    assert.match(row.bucket, /^[0-9a-f]{64}$/);
    await post(good, { ip: '192.0.2.10', deps: { now: now + 3600e3 } });
    const left = (await DB.prepare('SELECT bucket FROM feedback_rate').all()).results.map((r) => r.bucket);
    assert.ok(!left.includes(row.bucket), 'the old hour was cleaned up');
  });

  test('with a Turnstile secret, a missing or failed token is refused and a good one stored', async () => {
    const env = { TURNSTILE_SECRET_KEY: 'secret' };
    const seen = [];
    const verify = async (token, secret) => {
      seen.push([token, secret]);
      return token === 'good-token';
    };
    assert.equal((await post(good, { env, deps: { verify } })).status, 403);
    assert.equal((await post({ ...good, token: 'bad-token' }, { env, deps: { verify } })).status, 403);
    assert.equal((await post({ ...good, token: 'good-token' }, { env, deps: { verify } })).status, 201);
    assert.deepEqual(seen, [
      ['bad-token', 'secret'],
      ['good-token', 'secret'],
    ]);
    assert.equal((await rows()).length, 1);
  });

  test('without a database binding it says so instead of crashing', async () => {
    const r = await handleFeedback(
      new Request('https://x/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      {},
    );
    assert.equal(r.status, 503);
  });
});

describe('the email to the owner', () => {
  const mailEnv = { RESEND_API_KEY: 're_test_key', NOTIFY_TO: 'owner@example.com', NOTIFY_FROM: 'MyKrutiDev <contact@mykrutidev.com>' };
  /** A fetch that records what it was asked to send. */
  const recorder = (status = 200) => {
    const sent = [];
    const fetch = async (url, init) => {
      sent.push({ url, init, body: JSON.parse(init.body) });
      return new Response('{}', { status });
    };
    return { sent, fetch };
  };
  const full = { ...good, message: 'Please add PDF conversion', email: 'reader@example.com' };

  test('is sent once per saved feedback, to the owner, replying to the visitor', async () => {
    const { sent, fetch } = recorder();
    const r = await post(full, { env: mailEnv, deps: { fetch } });
    assert.equal(r.status, 201);
    const { id } = await r.json();
    assert.equal(sent.length, 1);
    const [{ url, init, body }] = sent;
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init.headers.Authorization, 'Bearer re_test_key');
    assert.deepEqual(body.to, ['owner@example.com']);
    assert.equal(body.from, 'MyKrutiDev <contact@mykrutidev.com>');
    assert.equal(body.reply_to, 'reader@example.com');
    assert.match(body.subject, new RegExp(`#${id}: Loved it \\(/hindi-keyboard\\)`));
    assert.match(body.text, /Message: Please add PDF conversion/);
    assert.match(body.text, /What went wrong: Matra went wrong/);
    assert.match(body.text, /Used today: Hindi keyboard/);
    assert.match(body.text, /Wants next: Exam mode \(SSC\/CPCT\/Court\), Something is wrong\/bug/);
    assert.match(body.text, /Email \(to reply\): reader@example.com/);
  });

  test('keeps visitor-written text and the secret out of the subject', async () => {
    const { sent, fetch } = recorder();
    await post({ ...full, message: 'LEAKME-message', bugText: 'LEAKME-bug' }, { env: mailEnv, deps: { fetch } });
    assert.doesNotMatch(sent[0].body.subject, /LEAKME|reader@example\.com|re_test_key/);
    assert.doesNotMatch(sent[0].body.text, /re_test_key/);
    assert.equal(sent[0].body.subject.includes('\n'), false);
  });

  test('without an email from the visitor there is no Reply-To', async () => {
    const { sent, fetch } = recorder();
    await post(good, { env: mailEnv, deps: { fetch } });
    assert.equal('reply_to' in sent[0].body, false);
    assert.match(sent[0].body.text, /Email \(to reply\): not given/);
  });

  test('is not sent until all three settings are there', async () => {
    for (const missing of ['RESEND_API_KEY', 'NOTIFY_TO', 'NOTIFY_FROM']) {
      const { sent, fetch } = recorder();
      const env = { ...mailEnv };
      delete env[missing];
      assert.equal((await post(good, { env, deps: { fetch } })).status, 201, missing);
      assert.equal(sent.length, 0, missing);
    }
  });

  test('is not sent for a refused submission', async () => {
    const { sent, fetch } = recorder();
    assert.equal((await post({ ...good, rating: 9 }, { env: mailEnv, deps: { fetch } })).status, 400);
    assert.equal(sent.length, 0);
  });

  test('a refusal or a crash on the way never fails the submission, which is saved', async () => {
    for (const fetch of [
      async () => new Response('nope', { status: 403 }),
      async () => {
        throw new Error('network down');
      },
    ]) {
      const before = (await rows()).length;
      assert.equal((await post(good, { env: mailEnv, deps: { fetch } })).status, 201);
      assert.equal((await rows()).length, before + 1);
    }
  });

  test('goes through waitUntil when Cloudflare gives one, so the visitor does not wait for it', async () => {
    const { sent, fetch } = recorder();
    const pending = [];
    const r = await post(good, { env: mailEnv, deps: { fetch, waitUntil: (p) => pending.push(p) } });
    assert.equal(r.status, 201);
    assert.equal(pending.length, 1);
    await Promise.all(pending);
    assert.equal(sent.length, 1);
  });

  test('a tool request is mailed too, with the idea and the email to reply to', async () => {
    const { sent, fetch } = recorder();
    const r = await postRequest({ ...request, email: 'asker@example.com' }, { env: mailEnv, deps: { fetch } });
    assert.equal(r.status, 201);
    const { id } = await r.json();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.subject, `MyKrutiDev tool request #${id}`);
    assert.equal(sent[0].body.reply_to, 'asker@example.com');
    assert.match(sent[0].body.text, /Tool wanted: PDF to Kruti Dev/);
  });
});

describe('GET /api/feedback', () => {
  test('hands the widget the public site key, never the secret', async () => {
    const r = handleConfig({ TURNSTILE_SITE_KEY: 'public-key', TURNSTILE_SECRET_KEY: 'secret' });
    const body = await r.json();
    assert.deepEqual(body, { ok: true, turnstileSiteKey: 'public-key' });
    assert.equal((await handleConfig({}).json()).turnstileSiteKey, null);
  });
});

describe('/admin/feedback', () => {
  const env = () => ({ DB, ADMIN_KEY });
  const get = (path = '/admin/feedback', headers = {}) =>
    handleAdmin(new Request(`https://mykrutidev.com${path}`, { headers }), env());
  const bearer = { Authorization: `Bearer ${ADMIN_KEY}` };

  test('without the key: a sign-in form, noindex, and no data', async () => {
    await post({ ...good, message: 'private message' });
    const r = await get();
    assert.equal(r.status, 401);
    assert.match(r.headers.get('X-Robots-Tag'), /noindex/);
    const html = await r.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /type="password"/);
    assert.doesNotMatch(html, /private message/);
    assert.equal((await get('/admin/feedback?format=csv')).status, 401);
    assert.equal((await get('/admin/feedback', { Authorization: 'Bearer wrong' })).status, 401);
  });

  test('refuses to run without a real ADMIN_KEY', async () => {
    const r = await handleAdmin(new Request('https://x/admin/feedback'), { DB, ADMIN_KEY: 'short' });
    assert.equal(r.status, 503);
  });

  test('signing in with the form sets a session cookie that opens the page', async () => {
    const login = (key) =>
      handleAdmin(
        new Request('https://mykrutidev.com/admin/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.50' },
          body: new URLSearchParams({ key }),
        }),
        env(),
      );
    assert.equal((await login('wrong key')).status, 401);
    const ok = await login(ADMIN_KEY);
    assert.equal(ok.status, 303);
    const cookie = ok.headers.get('Set-Cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.doesNotMatch(cookie, new RegExp(ADMIN_KEY), 'the cookie is not the key itself');
    const page = await get('/admin/feedback', { Cookie: cookie.split(';')[0] });
    assert.equal(page.status, 200);
  });

  test('shows totals per rating, the top wants as bars, the latest messages - escaped', async () => {
    await post({ ...good, rating: 4, wants: ['exam-mode'], message: '<script>alert(1)</script>' });
    await post({ ...good, rating: 4, wants: ['exam-mode', 'mobile-app'] });
    await post({ ...good, rating: 1, wants: ['bug'], bugText: 'Copy did nothing', email: 'a@b.co' });
    const r = await get('/admin/feedback', bearer);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('Content-Security-Policy'), /default-src 'none'/);
    const html = await r.text();
    assert.match(html, /3 in total/);
    // Ratings: two 😍, one 😞.
    assert.match(html, /<span class="fa-tile-n">2<\/span><span class="fa-tile-l">😍 Loved it/);
    assert.match(html, /<span class="fa-tile-n">1<\/span><span class="fa-tile-l">😞 Bad/);
    // Bars, biggest first: Exam mode (2) above Mobile app / bug (1).
    const bars = [...html.matchAll(/<li title="([^"]+): (\d+)">/g)].map((m) => [m[1], Number(m[2])]);
    assert.deepEqual(bars.slice(0, 1), [['Exam mode (SSC/CPCT/Court)', 2]]);
    assert.ok(bars.some(([l, n]) => l === 'Something is wrong/bug' && n === 1));
    // Messages, newest first, never as live HTML.
    assert.match(html, /Latest 2 messages/);
    assert.ok(html.indexOf('Copy did nothing') < html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.doesNotMatch(html, /<script>alert/);
  });

  test('Download CSV: every row, as a UTF-8 attachment', async () => {
    await post({ ...good, message: 'पहला, "quoted"' });
    await post({ ...good, rating: 2, message: '=cmd|calc' });
    const r = await get('/admin/feedback?format=csv', bearer);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('Content-Type'), /text\/csv/);
    assert.match(r.headers.get('Content-Disposition'), /attachment; filename="mykrutidev-feedback-\d{4}-\d\d-\d\d\.csv"/);
    const csv = await r.text();
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'id,created_at,rating,used,wants,bug_text,message,email,page,lang,theme,device,width,browser');
    assert.equal(lines.length, 3);
    assert.match(csv, /"पहला, ""quoted"""/);
    assert.match(csv, /,'=cmd\|calc,/);
  });

  test('lists the tool requests, newest first and escaped, with their own CSV', async () => {
    await postRequest({ ...request, idea: 'Typing test for Court exam' });
    await postRequest({ ...request, idea: '<img src=x onerror=alert(1)>', details: '=HYPERLINK("x")', email: 'a@b.co' });
    const html = await (await get('/admin/feedback', bearer)).text();
    assert.match(html, /Tool requests <span class="fa-sub">2 in total/);
    assert.ok(html.indexOf('&lt;img src=x') < html.indexOf('Typing test for Court exam'), 'newest first');
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /href="\?format=csv&amp;table=requests"/);

    const r = await get('/admin/feedback?format=csv&table=requests', bearer);
    assert.match(r.headers.get('Content-Disposition'), /filename="mykrutidev-tool-requests-\d{4}-\d\d-\d\d\.csv"/);
    const lines = (await r.text()).replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'id,created_at,idea,details,email,lang,device');
    assert.equal(lines.length, 3);
    assert.match(lines[2], /,"'=HYPERLINK\(""x""\)",a@b\.co,hi,mobile$/);
  });
});

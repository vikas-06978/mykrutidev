/**
 * The feedback widget on the BUILT site (npm run test:dist, after a build).
 *
 *  - every page carries the button and its inert panel template, and nothing
 *    opens on its own;
 *  - /admin is in no sitemap; the Privacy Policy is, in both languages;
 *  - through `wrangler pages dev` - dist/ plus the Functions in functions/
 *    and a local D1 database, the way Cloudflare Pages serves them - valid
 *    feedback is stored, and invalid input, the honeypot and a 6th request in
 *    the hour are refused.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = 4431;
const BASE = `http://localhost:${PORT}`;
const ADMIN_KEY = 'dist-test-admin-key-0123456789';

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });

describe('in the built pages', () => {
  test('every page has one feedback button, and the panel only as an inert template', () => {
    assert.ok(existsSync(DIST), 'dist/ not found - run `astro build` first');
    for (const file of walk(DIST)) {
      const html = readFileSync(file, 'utf8');
      assert.equal(html.match(/data-feedback-open/g)?.length, 1, file);
      assert.equal(html.match(/<template id="fb-template"/g)?.length, 1, file);
      // The only copy of the panel is inside the template.
      const outside = html.replace(/<template id="fb-template"[\s\S]*?<\/template>/, '');
      assert.doesNotMatch(outside, /id="fb-panel"/, file);
    }
  });

  test('Hindi pages have the Hindi button', () => {
    const hi = readFileSync(join(DIST, 'hi/index.html'), 'utf8');
    assert.match(hi, /<span class="fb-btn-label">सुझाव<\/span>/);
    const en = readFileSync(join(DIST, 'index.html'), 'utf8');
    assert.match(en, /<span class="fb-btn-label">Feedback<\/span>/);
  });

  test('/admin is in no sitemap; the Privacy Policy is, in both languages', () => {
    const xml = readdirSync(DIST)
      .filter((f) => /^sitemap.*\.xml$/.test(f))
      .map((f) => readFileSync(join(DIST, f), 'utf8'))
      .join('\n');
    assert.doesNotMatch(xml, /\/admin/);
    assert.doesNotMatch(xml, /\/api\//);
    assert.match(xml, /<loc>https:\/\/mykrutidev\.com\/privacy-policy\/?<\/loc>/);
    assert.match(xml, /<loc>https:\/\/mykrutidev\.com\/hi\/privacy-policy\/?<\/loc>/);
    assert.ok(!existsSync(join(DIST, 'admin')), 'no static admin page is built');
  });

  test('the footer links the Privacy Policy on every page', () => {
    const page = readFileSync(join(DIST, 'hindi-keyboard/index.html'), 'utf8');
    assert.match(page, /href="\/privacy-policy\/?"/);
    const hi = readFileSync(join(DIST, 'hi/hindi-keyboard/index.html'), 'utf8');
    assert.match(hi, /href="\/hi\/privacy-policy\/?"/);
  });
});

describe('through wrangler pages dev (local D1)', () => {
  let server;
  let state;
  let log = '';

  before(async () => {
    state = mkdtempSync(join(tmpdir(), 'mkd-d1-'));
    server = spawn(
      join(ROOT, 'node_modules/.bin/wrangler'),
      [
        'pages', 'dev', 'dist',
        '--port', String(PORT),
        '--d1', 'DB',
        '--persist-to', state,
        '--binding', `ADMIN_KEY=${ADMIN_KEY}`,
        '--compatibility-date', '2025-09-01',
        '--show-interactive-dev-session=false',
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
    );
    server.stdout.on('data', (d) => (log += d));
    server.stderr.on('data', (d) => (log += d));
    const until = Date.now() + 90_000;
    for (;;) {
      try {
        if ((await fetch(`${BASE}/api/feedback`)).ok) break;
      } catch {
        // not up yet
      }
      if (Date.now() > until) throw new Error(`wrangler pages dev did not start:\n${log}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  after(() => {
    server?.kill();
    if (state) rmSync(state, { recursive: true, force: true });
  });

  const ctx = { page: '/', lang: 'en', theme: 'light', device: 'desktop', width: 1366, browser: 'Chrome' };
  const send = (body, ip) =>
    fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
      body: JSON.stringify(body),
    });
  const csv = async () =>
    (await fetch(`${BASE}/admin/feedback?format=csv`, { headers: { Authorization: `Bearer ${ADMIN_KEY}` } })).text();

  test('the site itself is served, with the widget', async () => {
    const r = await fetch(`${BASE}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /data-feedback-open/);
  });

  test('valid feedback is stored; invalid input and the honeypot are refused; the 6th in an hour is 429', async () => {
    const ok = await send({ rating: 4, used: ['typing-tutor'], wants: ['exam-mode'], message: 'CPCT mode please', ...ctx });
    assert.equal(ok.status, 201, await ok.clone().text());
    assert.match(await csv(), /CPCT mode please/);

    const invalid = await send({ rating: 4, used: ['nope'], ...ctx });
    assert.equal(invalid.status, 400);
    const bot = await send({ rating: 4, website: 'spam', ...ctx });
    assert.equal(bot.status, 400);
    assert.equal((await bot.json()).error, 'rejected');

    // 3 used; 2 more are allowed this hour, then 429.
    assert.equal((await send({ rating: 3, ...ctx })).status, 201);
    assert.equal((await send({ rating: 2, ...ctx })).status, 201);
    const limited = await send({ rating: 1, ...ctx });
    assert.equal(limited.status, 429);

    const lines = (await csv()).trim().split('\r\n');
    assert.equal(lines.length, 1 + 3, 'header + the 3 valid rows');
  });

  test('other methods are refused', async () => {
    assert.equal((await fetch(`${BASE}/api/feedback`, { method: 'DELETE' })).status, 405);
  });

  test('/admin/feedback needs the key, and is noindex either way', async () => {
    const locked = await fetch(`${BASE}/admin/feedback`);
    assert.equal(locked.status, 401);
    assert.match(locked.headers.get('X-Robots-Tag'), /noindex/);
    const open = await fetch(`${BASE}/admin/feedback`, { headers: { Authorization: `Bearer ${ADMIN_KEY}` } });
    assert.equal(open.status, 200);
    assert.match(open.headers.get('X-Robots-Tag'), /noindex/);
    const html = await open.text();
    assert.match(html, /What people want next/);
    assert.match(html, /Download CSV/);
  });
});

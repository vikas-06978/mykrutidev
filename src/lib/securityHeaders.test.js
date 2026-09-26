import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { inlineScriptHashes, contentSecurityPolicy, headersFile, MAX_LINE } from '../security/integration.mjs';
import { parseHeaders, headersFor, parseRedirects } from '../../scripts/serve-dist.mjs';

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('inline script hashes', () => {
  test('hashes exactly the text between the tags, once per distinct script', () => {
    const a = "document.documentElement.dataset.theme='dark'";
    const html = `<script>${a}</script><p></p><script>${a}</script><script type="module">x()</script>`;
    assert.deepEqual(inlineScriptHashes([html, html]), [sha(a), sha('x()')].sort());
  });

  test('skips scripts with a src, and data blocks the browser never runs', () => {
    const html =
      '<script type="module" src="/_astro/a.js"></script>' +
      '<script type="application/ld+json">{"@type":"WebSite"}</script>' +
      "<script type='application/json' data-i18n>{}</script>";
    assert.deepEqual(inlineScriptHashes([html]), []);
  });
});

describe('the policy', () => {
  const csp = contentSecurityPolicy(["'sha256-abc'"]);
  const directive = (name) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

  test('scripts: this site, the listed hashes and Turnstile, never unsafe-inline or eval', () => {
    assert.equal(directive('script-src'), "script-src 'self' 'sha256-abc' https://challenges.cloudflare.com");
    assert.doesNotMatch(directive('script-src'), /unsafe/);
  });

  test('no other site may frame the pages, and no plugins or base-tag tricks', () => {
    assert.equal(directive('frame-ancestors'), "frame-ancestors 'none'");
    assert.equal(directive('object-src'), "object-src 'none'");
    assert.equal(directive('base-uri'), "base-uri 'self'");
  });

  test('the only outside connections are the ones features need', () => {
    assert.equal(directive('connect-src'), "connect-src 'self' https://inputtools.google.com");
    assert.equal(directive('frame-src'), 'frame-src https://challenges.cloudflare.com');
  });
});

describe('the _headers file', () => {
  // The site has 5 inline scripts; about 28 fit on one header line. The
  // build stops with an error before writing a line Cloudflare would reject.
  const file = headersFile(Array.from({ length: 25 }, (_, i) => `'sha256-${String(i).padStart(43, 'x')}='`));
  const rules = parseHeaders(file);

  test('every header line fits Cloudflare\'s limit, even with 25 inline scripts', () => {
    for (const line of file.split('\n')) assert.ok(line.length <= MAX_LINE, `${line.length} characters`);
  });

  test('pages get the security headers and no long cache', () => {
    const h = headersFor(rules, '/kruti-dev-to-mangal/');
    assert.match(h['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(h['x-frame-options'], 'DENY');
    assert.equal(h['x-content-type-options'], 'nosniff');
    assert.match(h['strict-transport-security'], /max-age=31536000/);
    assert.equal(h['cache-control'], undefined);
  });

  test('hashed build files are cached for a year and only this site may load them', () => {
    const h = headersFor(rules, '/_astro/Header.astro_astro_type_script_index_0_lang.jqWOsmTn.js');
    assert.equal(h['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(h['cross-origin-resource-policy'], 'same-origin');
  });

  test('no header is set by two rules for the same path (Cloudflare would join them)', () => {
    for (const path of ['/', '/_astro/a.js', '/fonts/KRDEV010.woff', '/data/english-words.json', '/sw.js', '/og/en/home.png']) {
      const h = headersFor(rules, path);
      for (const [name, value] of Object.entries(h)) {
        if (name === 'content-security-policy' || name === 'permissions-policy' || name === 'strict-transport-security') continue;
        assert.doesNotMatch(value, /, (public|no-cache|same-origin|DENY)/, `${path} ${name}: ${value}`);
      }
    }
  });

  test('the service worker is always revalidated', () => {
    assert.equal(headersFor(rules, '/sw.js')['cache-control'], 'no-cache');
  });
});

describe('the _redirects file (as the test server reads it)', () => {
  test('exact paths, a status per line, comments and blank lines ignored', () => {
    const rules = parseRedirects('# note\n\n/sitemap.xml /sitemap-index.xml 301\n/old /new\n');
    assert.deepEqual([...rules], [
      ['/sitemap.xml', { to: '/sitemap-index.xml', status: 301 }],
      ['/old', { to: '/new', status: 302 }],
    ]);
  });

  test('a pattern it cannot apply fails loudly instead of being skipped', () => {
    assert.throws(() => parseRedirects('/blog/* /guides/:splat 301'), /only exact paths/);
  });
});

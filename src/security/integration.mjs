/**
 * Writes dist/_headers at the end of `astro build`: the HTTP security and
 * caching headers Cloudflare Pages sends with every static file.
 * (https://developers.cloudflare.com/pages/configuration/headers/)
 *
 * The Content-Security-Policy allows scripts only from this site, plus
 * Cloudflare Turnstile on the feedback form. The few inline scripts the
 * pages carry (the theme and tab choices that must run before the first
 * paint) are allowed by the SHA-256 of their exact text, read from what the
 * build actually wrote. So a new or edited inline script is picked up
 * without editing a list, and an injected one is refused.
 * tests/dist.test.js checks every inline script in dist/ is covered.
 *
 * Styles allow 'unsafe-inline': the stylesheet is inlined into each page on
 * purpose (astro.config.mjs) and components set style="" attributes. Styles
 * cannot run code, so this is the usual trade-off.
 *
 * Pages Functions (functions/: /api/feedback, /admin/feedback) set their own
 * headers; _headers applies only to static files.
 *
 * If Cloudflare Web Analytics is ever switched on, its beacon needs
 * https://static.cloudflareinsights.com in script-src and
 * https://cloudflareinsights.com in connect-src - and the privacy policy
 * needs to say so.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cloudflare's limits for _headers: rules per file, characters per header line. */
export const MAX_RULES = 100;
export const MAX_LINE = 2000;

const TURNSTILE = 'https://challenges.cloudflare.com';
/** English to Hindi Typing's Hinglish mode asks Google how to spell each word. */
const INPUT_TOOLS = 'https://inputtools.google.com';

/** Script types a browser does not run, so CSP does not apply to them. */
const DATA_TYPES = /^(application\/(ld\+)?json|importmap|text\/plain)$/i;

/**
 * The 'sha256-...' source for every inline script the browser will run, in
 * a stable order. JSON-LD and other data blocks are not scripts to CSP.
 * @param {string[]} htmls
 * @returns {string[]}
 */
export function inlineScriptHashes(htmls) {
  const hashes = new Set();
  for (const html of htmls) {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1];
      if (/\bsrc\s*=/i.test(attrs)) continue;
      const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1];
      if (type && DATA_TYPES.test(type)) continue;
      hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
    }
  }
  return [...hashes].sort();
}

/** @param {string[]} scriptHashes */
export function contentSecurityPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${[...scriptHashes, TURNSTILE].join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${INPUT_TOOLS}`,
    `frame-src ${TURNSTILE}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // No other site may show these pages inside its own (clickjacking, or
    // passing the tools off as theirs).
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * The whole _headers file. Cloudflare applies every rule whose path matches
 * and joins repeated header names with commas, so each header is set by
 * exactly one rule for any path.
 * @param {string[]} scriptHashes
 */
export function headersFile(scriptHashes) {
  const rules = [
    [
      '/*',
      {
        'Content-Security-Policy': contentSecurityPolicy(scriptHashes),
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        // Features the site never uses. (Only names Chrome knows: an unknown
        // one is logged as an error on every page.)
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    ],
    // Built scripts, styles and fonts: the file name carries a hash of the
    // contents, so they can be cached for a year. Same-origin only: another
    // site cannot load them into its own pages.
    ['/_astro/*', { 'Cache-Control': 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy': 'same-origin' }],
    // Preview fonts and the word list keep their names across deploys: a
    // month, then the browser checks again.
    ['/fonts/*', { 'Cache-Control': 'public, max-age=2592000', 'Cross-Origin-Resource-Policy': 'same-origin' }],
    ['/data/*', { 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'same-origin' }],
    // The service worker must always be checked for a new version.
    ['/sw.js', { 'Cache-Control': 'no-cache' }],
  ];
  const out = [
    '# Written by src/security/integration.mjs at the end of every build. Do not edit.',
    '',
  ];
  for (const [path, headers] of rules) {
    out.push(path);
    for (const [name, value] of Object.entries(headers)) out.push(`  ${name}: ${value}`);
    out.push('');
  }
  return out.join('\n');
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** @returns {import('astro').AstroIntegration} */
export default function securityHeaders() {
  return {
    name: 'mkd-security-headers',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const htmls = walk(root)
          .filter((p) => p.endsWith('.html'))
          .map((p) => readFileSync(p, 'utf8'));
        const hashes = inlineScriptHashes(htmls);
        const file = headersFile(hashes);
        const long = file.split('\n').find((l) => l.length > MAX_LINE);
        if (long) throw new Error(`_headers: a header is ${long.length} characters, Cloudflare allows ${MAX_LINE}`);
        writeFileSync(join(root, '_headers'), file);
        logger.info(`_headers written: ${hashes.length} inline script hashes`);
      },
    },
  };
}

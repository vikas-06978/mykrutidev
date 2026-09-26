// A plain static server for a built site, shared by the PDF build step and
// the Playwright tests. Deliberately not `astro preview`: that manages its own
// background process and exits when one is already running. Behaves like a
// static host - case-sensitive paths, a real 404, gzip for text (as Netlify,
// Cloudflare Pages, Vercel and GitHub Pages all do; without it Lighthouse
// measured 150-175 KB pages instead of ~25 KB) - and applies dist/_headers and
// dist/_redirects the way Cloudflare Pages does, so every test runs under the
// real Content-Security-Policy and redirects.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
};
const COMPRESS = /^(text\/|application\/(json|xml)|image\/svg)/;

/**
 * Parse a Cloudflare Pages _headers file: a path pattern on its own line
 * (`*` matches anything), then indented `Name: value` lines.
 * @param {string} text
 * @returns {{ test: RegExp, headers: [string, string][] }[]}
 */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      rules.push({ test: new RegExp(`^${pattern}$`), headers: [] });
    } else if (rules.length) {
      const i = line.indexOf(':');
      rules.at(-1).headers.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

/**
 * Parse a Cloudflare Pages _redirects file: `from to [status]` per line, `#`
 * comments. Only exact paths, which is all this site uses.
 * @param {string} text
 * @returns {Map<string, { to: string, status: number }>}
 */
export function parseRedirects(text) {
  const rules = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to, status = '302'] = line.split(/\s+/);
    if (from.includes('*') || from.includes(':')) throw new Error(`_redirects: "${from}" - only exact paths are supported here`);
    rules.set(from, { to, status: Number(status) });
  }
  return rules;
}

/** Every matching rule applies; a name set twice is joined with commas, as Cloudflare does. */
export function headersFor(rules, pathname) {
  const out = {};
  for (const r of rules) {
    if (!r.test.test(pathname)) continue;
    for (const [name, value] of r.headers) out[name] = out[name] ? `${out[name]}, ${value}` : value;
  }
  return out;
}

/**
 * @param {string} root absolute path of the built site, ending in a separator
 * @param {number} port
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
export function serveDist(root, port) {
  const gzipped = new Map();
  let rules = [];
  try {
    rules = parseHeaders(readFileSync(join(root, '_headers'), 'utf8'));
  } catch {
    // An older build without _headers: serve without them.
  }
  let redirects = new Map();
  try {
    redirects = parseRedirects(readFileSync(join(root, '_redirects'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  async function resolve(urlPath) {
    const safe = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
    const file = join(root, safe);
    if (!file.startsWith(root)) return null;
    for (const candidate of [file, join(file, 'index.html')]) {
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch {
        // try the next one
      }
    }
    return null;
  }

  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    const extra = headersFor(rules, pathname);
    const redirect = redirects.get(pathname);
    if (redirect) {
      res.writeHead(redirect.status, { ...extra, location: redirect.to }).end();
      return;
    }
    const file = await resolve(pathname);
    if (!file) {
      // As static hosts do: the site's own 404.html, with a 404 status.
      const page = await readFile(join(root, '404.html')).catch(() => null);
      if (page) res.writeHead(404, { ...extra, 'content-type': TYPES['.html'] }).end(page);
      else res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
      return;
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const body = await readFile(file);
    if (COMPRESS.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      if (!gzipped.has(file)) gzipped.set(file, gzipSync(body, { level: 9 }));
      res.writeHead(200, { ...extra, 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' });
      res.end(gzipped.get(file));
      return;
    }
    res.writeHead(200, { ...extra, 'content-type': type });
    res.end(body);
  });

  return new Promise((ok) => {
    server.listen(port, () => ok({ close: () => new Promise((done) => server.close(() => done())) }));
  });
}

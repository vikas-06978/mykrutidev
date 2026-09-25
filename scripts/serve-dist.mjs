// A plain static server for a built site, shared by the PDF build step and
// the Playwright tests. Deliberately not `astro preview`: that manages its own
// background process and exits when one is already running. Behaves like a
// static host - case-sensitive paths, a real 404, gzip for text (as Netlify,
// Cloudflare Pages, Vercel and GitHub Pages all do; without it Lighthouse
// measured 150-175 KB pages instead of ~25 KB).
import { createServer } from 'node:http';
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
 * @param {string} root absolute path of the built site, ending in a separator
 * @param {number} port
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
export function serveDist(root, port) {
  const gzipped = new Map();

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
    const file = await resolve(new URL(req.url, 'http://x').pathname);
    if (!file) {
      // As static hosts do: the site's own 404.html, with a 404 status.
      const page = await readFile(join(root, '404.html')).catch(() => null);
      if (page) res.writeHead(404, { 'content-type': TYPES['.html'] }).end(page);
      else res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
      return;
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const body = await readFile(file);
    if (COMPRESS.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      if (!gzipped.has(file)) gzipped.set(file, gzipSync(body, { level: 9 }));
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' });
      res.end(gzipped.get(file));
      return;
    }
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  });

  return new Promise((ok) => {
    server.listen(port, () => ok({ close: () => new Promise((done) => server.close(() => done())) }));
  });
}

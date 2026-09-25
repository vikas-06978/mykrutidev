// A plain static server for dist/, used by the Playwright tests. Deliberately
// not `astro preview`: that manages its own background process and exits when
// one is already running, which Playwright reads as a crash. This behaves like
// a static host - including case-sensitive paths and a real 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.argv[2] ?? 4401);
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
};

async function resolve(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) return null;
  for (const candidate of [file, join(file, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

// Text is gzipped when the browser accepts it, as every static host does
// (Netlify, Cloudflare Pages, Vercel, GitHub Pages). Without it Lighthouse
// measured 150-175 KB pages instead of ~25 KB and blamed the site for it.
const COMPRESS = /^(text\/|application\/(json|xml)|image\/svg)/;
const gzipped = new Map();

createServer(async (req, res) => {
  const file = await resolve(new URL(req.url, 'http://x').pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
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
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT}`));

/**
 * Writes dist/sw.js at the end of `astro build`: the service worker template
 * (src/pwa/sw.js) with the list of files to download on the first visit and a
 * version hash.
 *
 * The first visit downloads only what the converters need offline: the app
 * shell, every converter page to or from Unicode in both languages, their scripts (followed
 * through every import, so a lazily loaded chunk such as the .docx writer is
 * there too) and the fonts those pages actually use. Everything else - the
 * typing tutor, guides, printables, PDFs, the English word list - is kept by
 * the worker the first time it is visited. On the build the site had when
 * this was written that is ~1 MB compressed instead of ~5 MB; the build log
 * prints the figure and the build fails above PRECACHE_BUDGET.
 *
 * The list is read from what the build actually wrote, so a new converter
 * page, a renamed chunk or a new font is picked up without editing a list.
 * Each entry carries a hash of its bytes; the worker re-uses unchanged files
 * from the previous deploy's cache instead of downloading them again.
 * src/lib/pwa.test.js checks the selection rules.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Compressed bytes the first visit may download in the background. */
export const PRECACHE_BUDGET = 1.5 * 1024 * 1024;

/** Always kept, whatever the pages use: the shell and the offline fallback. */
const SHELL = ['index.html', 'hi/index.html', '404.html', 'manifest.json', 'hi/manifest.json', 'favicon.svg', 'favicon.ico'];

/** "foo/index.html" -> "/foo"; "index.html" -> "/"; anything else -> "/<path>". */
export function urlOf(path) {
  if (path === 'index.html') return '/';
  const m = path.match(/^(.*)\/index\.html$/);
  return `/${m ? m[1] : path}`;
}

/**
 * A page that hosts a converter (font converter or English to Hindi typing),
 * unless it asks to be kept on first visit instead (data-offline="visit": the
 * font-to-font pairings, see Converter.astro).
 */
export const isConverterPage = (html) =>
  /\bdata-(converter|translit)\b/.test(html) && !/\bdata-offline="visit"/.test(html);

const unquote = (s) => s.trim().replace(/^["']|["']$/g, '').replace(/&quot;/g, '');

/** Font families a page names in style attributes, plus the site's Devanagari face. */
function familiesUsed(html) {
  const used = new Set(['Noto Sans Devanagari']);
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const style = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    for (const d of style.matchAll(/(?:font-family|--[\w-]+)\s*:\s*([^;]+)/g)) {
      for (const f of d[1].split(',')) used.add(unquote(f));
    }
  }
  return used;
}

/** The font files for the families a page uses: woff2 where offered, else the first url(). */
function fontFiles(html) {
  const used = familiesUsed(html);
  const files = [];
  for (const m of html.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = m[1].match(/font-family:\s*([^;]+)/)?.[1];
    if (!family || !used.has(unquote(family))) continue;
    const urls = [...m[1].matchAll(/url\(\s*["']?\/([^)"']+)["']?\s*\)/g)].map((u) => u[1]);
    const pick = urls.find((u) => u.endsWith('.woff2')) ?? urls[0];
    if (pick) files.push(pick);
  }
  return files;
}

/** Scripts a page loads, and every chunk those import (static, dynamic or preloaded). */
function scriptClosure(html, read) {
  const seen = new Set();
  const queue = [...html.matchAll(/<script[^>]*\ssrc="\/(_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    const code = read(path);
    if (code === null) continue;
    seen.add(path);
    for (const m of code.matchAll(/["'`](?:\.\/|\/?_astro\/)([\w.\-]+\.js)["'`]/g)) queue.push(`_astro/${m[1]}`);
  }
  return [...seen];
}

/**
 * The files to download on the first visit, as paths from the site root.
 * @param {string[]} paths every file in the build
 * @param {(path: string) => string | null} read a file's text, or null
 */
export function precachePlan(paths, read) {
  const have = new Set(paths);
  const out = new Set(SHELL.filter((p) => have.has(p)));
  for (const p of paths) if (/^icons\/.*\.png$/.test(p)) out.add(p);
  for (const p of paths) {
    if (!p.endsWith('.html')) continue;
    const html = read(p);
    if (html === null) continue;
    const shell = SHELL.includes(p);
    if (!shell && !isConverterPage(html)) continue;
    out.add(p);
    for (const f of [...scriptClosure(html, read), ...fontFiles(html)]) if (have.has(f)) out.add(f);
  }
  return [...out].sort();
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

export default function pwa() {
  return {
    name: 'mkd-pwa',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const paths = walk(root).map((file) => relative(root, file).split(sep).join('/'));
        const read = (p) => {
          try {
            return readFileSync(join(root, p), 'utf8');
          } catch {
            return null;
          }
        };
        let raw = 0;
        let gz = 0;
        const entries = precachePlan(paths, read).map((path) => {
          const bytes = readFileSync(join(root, path));
          raw += bytes.length;
          // Fonts and PNGs are already compressed; text is served gzipped.
          gz += /\.(woff2?|png|ico)$/.test(path) ? bytes.length : gzipSync(bytes, { level: 9 }).length;
          return [urlOf(path), createHash('sha256').update(bytes).digest('hex').slice(0, 12)];
        });
        const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
        if (gz > PRECACHE_BUDGET) {
          throw new Error(`pwa: first-visit download is ${kb(gz)} compressed, over the ${kb(PRECACHE_BUDGET)} budget`);
        }
        const version = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12);
        const template = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
        const sw = template
          .replace('self.__MKD_PRECACHE__', JSON.stringify(entries))
          .replace('self.__MKD_VERSION__', JSON.stringify(version));
        if (sw.includes('__MKD_')) throw new Error('pwa: a placeholder in src/pwa/sw.js was not replaced');
        writeFileSync(join(root, 'sw.js'), sw);
        logger.info(
          `sw.js: ${entries.length} files precached, ${kb(gz)} compressed (${kb(raw)} raw); the rest is cached on first visit (version ${version})`,
        );
      },
    },
  };
}

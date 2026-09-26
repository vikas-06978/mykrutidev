/**
 * Writes dist/sw.js at the end of `astro build`: the service worker template
 * (src/pwa/sw.js) with the list of files to keep offline and a version hash.
 *
 * The list is read from what the build actually wrote, so a new page, a
 * renamed script chunk or a new font is picked up without anyone editing a
 * list. Each entry carries a hash of its bytes; the worker uses it to re-use
 * unchanged files from the previous deploy's cache instead of downloading
 * them again (see "install" in sw.js). src/lib/pwa.test.js checks the
 * selection rules.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which built files are kept offline, by their path from the site root.
 *
 * In: every page (both languages, and the 404 as the offline fallback), the
 * hashed scripts and web fonts, the legacy preview fonts, the English word
 * list the typing tool uses, the manifests and icons.
 * Out: social-card images and PDFs (large, and not needed to use a tool - a
 * PDF is still cached once downloaded), sitemaps, robots.txt, notes, and the
 * .woff copies of fonts every service-worker browser reads as .woff2.
 */
export function precached(path) {
  if (/^(og|downloads)\//.test(path)) return false;
  if (/^_astro\/.*\.woff$/.test(path)) return false;
  if (/^(sitemap.*\.xml|robots\.txt|sw\.js)$/.test(path) || path.endsWith('.md')) return false;
  return /\.(html|js|woff2?|json|png|svg|ico)$/.test(path);
}

/** "foo/index.html" -> "/foo"; "index.html" -> "/"; anything else -> "/<path>". */
export function urlOf(path) {
  if (path === 'index.html') return '/';
  const m = path.match(/^(.*)\/index\.html$/);
  return `/${m ? m[1] : path}`;
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
        const entries = walk(root)
          .map((file) => relative(root, file).split(sep).join('/'))
          .filter(precached)
          .sort()
          .map((path) => {
            const rev = createHash('sha256').update(readFileSync(join(root, path))).digest('hex').slice(0, 12);
            return [urlOf(path), rev];
          });
        const version = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12);
        const template = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
        const sw = template
          .replace('self.__MKD_PRECACHE__', JSON.stringify(entries))
          .replace('self.__MKD_VERSION__', JSON.stringify(version));
        if (sw.includes('__MKD_')) throw new Error('pwa: a placeholder in src/pwa/sw.js was not replaced');
        writeFileSync(join(root, 'sw.js'), sw);
        logger.info(`sw.js: ${entries.length} files kept offline (version ${version})`);
      },
    },
  };
}

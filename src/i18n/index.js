/**
 * Site text in two languages, and the few helpers that turn a key into a
 * string, a path into its other-language twin, or a block of authored HTML
 * into something safe to hand to a browser translator.
 *
 * ---------------------------------------------------------------------------
 * RULES
 *
 * - Every visible word of the website lives in en.json / hi.json. The two must
 *   hold exactly the same keys; i18n.test.js enforces it, and so does t(): a
 *   missing key THROWS, so a gap fails the build instead of quietly showing
 *   English on a Hindi page.
 * - Nothing here touches conversion. Converter input/output, legacy-font code
 *   examples and test data are never translated - they are data, not copy.
 * - English is the default locale and lives at the root. Hindi lives under
 *   /hi, with the same slugs.
 * ---------------------------------------------------------------------------
 */

import en from './en.json' with { type: 'json' };
import hi from './hi.json' with { type: 'json' };
import { fill } from './fill.js';

export const LOCALES = /** @type {const} */ (['en', 'hi']);
export const DEFAULT_LOCALE = 'en';
export const DICTS = { en, hi };

/** What each locale is called in markup, Open Graph and the switcher. */
export const LOCALE_META = {
  en: { htmlLang: 'en', hreflang: 'en', ogLocale: 'en_IN', label: 'English' },
  hi: { htmlLang: 'hi', hreflang: 'hi', ogLocale: 'hi_IN', label: 'हिंदी' },
};

/** Where the visitor's explicit language choice is remembered. */
export const LANG_PREF_KEY = 'mkd-lang';

const isLocale = (x) => LOCALES.includes(x);

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Walk a dotted key. Page keys contain slashes ("pages./unicode-to-kruti-dev.h1")
 * but never dots, so a plain split is enough; numeric segments index arrays.
 */
export function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/** Any value - string, array or object. Throws if the key is missing. */
export function raw(lang, key) {
  const dict = DICTS[lang];
  if (!dict) throw new Error(`i18n: unknown locale "${lang}"`);
  const v = lookup(dict, key);
  if (v === undefined) throw new Error(`i18n: missing key "${key}" in ${lang}.json`);
  return v;
}

/** Like raw(), but `undefined` for a key that is legitimately optional. */
export function maybe(lang, key) {
  return lookup(DICTS[lang], key);
}

export { fill };

/** A string. Throws on a missing key or a non-string value. */
export function t(lang, key, vars) {
  const v = raw(lang, key);
  if (typeof v !== 'string') throw new Error(`i18n: "${key}" in ${lang}.json is not a string`);
  return vars ? fill(v, vars) : v;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Split a URL pathname into its locale and the locale-free route path, in the
 * same no-trailing-slash form routes.js uses: "/hi/hindi-keyboard/" ->
 * { lang: 'hi', path: '/hindi-keyboard' }, "/hi" -> { lang: 'hi', path: '/' }.
 */
export function splitLocale(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const m = clean.match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) {
    return { lang: m[1], path: m[2] || '/' };
  }
  return { lang: DEFAULT_LOCALE, path: clean };
}

/** The locale of an Astro.url. */
export const langOf = (url) => splitLocale(url.pathname).lang;

/**
 * A route path in the given locale, in the one URL form the site publishes:
 * with a trailing slash, as the pages are built ("dist/x/index.html") and as
 * the sitemap lists them. "/x" -> "/x/" or "/hi/x/", "/" -> "/" or "/hi/".
 * Links, canonicals, hreflang and og:url all come from here, so a page is
 * never reached at two addresses.
 */
export function localizePath(path, lang) {
  const base = splitLocale(path).path;
  const slashed = base === '/' ? '/' : `${base}/`;
  if (lang === DEFAULT_LOCALE) return slashed;
  return `/${lang}${slashed}`;
}

/** Paths that are files, not pages - never given a locale prefix or a slash. */
const NOT_A_PAGE = /^\/(?:_astro|data|downloads|fonts|favicon|sitemap|robots\.txt|og\/|guides\/img\/)/;

/**
 * Point every internal page link inside a block of HTML at the given locale,
 * in the published trailing-slash form.
 *
 * This is what keeps a Hindi page's links on Hindi pages, whether the link was
 * written in a component, in routes.js or inside a translated paragraph. An
 * anchor carrying `data-lang-switch` keeps its language - it is the one link
 * whose job is to leave the current one - but still gets the slash.
 */
export function localizeHtml(html, lang) {
  return html.replace(/<a\b[^>]*>/g, (tag) =>
    tag.replace(/(\shref=")(\/[^"]*)"/, (m, pre, href) => {
      if (href.startsWith('//') || NOT_A_PAGE.test(href)) return m;
      // A ?query (like ?mode=file) and a #hash ride along after the path.
      const [beforeHash, hash = ''] = href.split('#');
      const [p, query = ''] = beforeHash.split('?');
      const target = splitLocale(p);
      const to = /\sdata-lang-switch\b/.test(tag) || target.lang !== DEFAULT_LOCALE ? target.lang : lang;
      return `${pre}${localizePath(target.path, to)}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}"`;
    }),
  );
}

// ---------------------------------------------------------------------------
// translate="no"
// ---------------------------------------------------------------------------

/**
 * Names a browser translator must never touch: fonts the reader has to find by
 * exactly this name in Word, file types and the brand. Longest first, so
 * "Kruti Dev 010" wins over "Kruti Dev".
 */
export const PROTECTED_NAMES = [
  'Walkman Chanakya 905',
  'Abbasi Chanakya New',
  'Noto Sans Devanagari',
  'Chanakya 905',
  'Kruti Dev 010',
  'DevLys 010',
  'Nirmala UI',
  'MyKrutiDev',
  'Kruti Dev',
  'KrutiDev',
  'DevLys',
  'Mangal',
  'MS Word',
  '.docx',
  '.txt',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_RE = new RegExp(`(?<![\\w.-])(${PROTECTED_NAMES.map(esc).join('|')})(?![\\w])`, 'g');

/**
 * Mark authored HTML so a browser translator leaves the data alone:
 *  - every <code> (legacy-font keystrokes like `fgUnh`) gets translate="no";
 *  - protected names in running text are wrapped in <span translate="no">.
 * Only text between tags is touched, never an attribute value.
 */
export function markNoTranslate(html) {
  const parts = html.split(/(<[^>]+>)/);
  let shielded = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('<')) {
      if (/^<code\b/i.test(part)) {
        if (!/\stranslate=/.test(part)) parts[i] = part.replace(/^<code\b/i, '<code translate="no"');
        shielded++;
      } else if (/^<\/code>/i.test(part)) {
        shielded--;
      }
      continue;
    }
    if (shielded > 0 || !part) continue;
    parts[i] = part.replace(NAME_RE, '<span translate="no">$1</span>');
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// The component-facing helper
// ---------------------------------------------------------------------------

/**
 * Everything a component needs, bound to one locale:
 *   t(key, vars)    plain text - for attributes, <title>, JSON-LD, text nodes
 *   html(key, vars) authored HTML - protected and localized, for set:html
 *   raw(key)        arrays and objects (FAQ lists, page bodies)
 *   path(p)         a route path in this locale
 */
export function useT(lang) {
  return {
    lang,
    t: (key, vars) => t(lang, key, vars),
    raw: (key) => raw(lang, key),
    maybe: (key) => maybe(lang, key),
    html: (key, vars) => renderHtml(t(lang, key, vars), lang),
    render: (s) => renderHtml(s, lang),
    listTitle: (s) => listTitle(s, lang),
    path: (p) => localizePath(p, lang),
  };
}

/**
 * A page title as it appears in a LIST of pages (the /all-converters cards and
 * the footer), with font names in the reader's language: on Hindi pages
 * "DevLys से यूनिकोड कन्वर्टर" -> "देवलिस से यूनिकोड कन्वर्टर".
 *
 * Lists only. A tool page keeps the exact Latin name (translate="no") wherever
 * the reader must pick that font in Word. The names come from `fontNames` in
 * the dictionaries - identity in en.json, so English is unchanged - and are
 * the same Hindi names the nav labels use (i18n.test.js checks both).
 */
export function listTitle(s, lang) {
  const names = raw(lang, 'fontNames');
  const keys = Object.keys(names).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\w-])(${keys.map(esc).join('|')})(?![\\w])`, 'g');
  return s.replace(re, (m) => names[m]);
}

/** Authored HTML, ready for set:html. */
export const renderHtml = (s, lang) => localizeHtml(markNoTranslate(s), lang);

/** Shorthand for a page's own text: page(lang, '/x', 'h1'). */
export const pageText = (lang, path, field) => t(lang, `pages.${path}.${field}`);

// ---------------------------------------------------------------------------
// Key parity - also run as a test, and at import so the build fails fast
// ---------------------------------------------------------------------------

/** Every leaf key, flattened with dots ("pages./.faq.0.q"). */
export function flatKeys(node, prefix = '') {
  if (node === null || typeof node !== 'object') return [prefix];
  const entries = Array.isArray(node) ? node.map((v, i) => [String(i), v]) : Object.entries(node);
  return entries.flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k));
}

/** Keys in `a` that `b` lacks, both ways. Empty arrays mean the files agree. */
export function keyDiff(a, b) {
  const ka = new Set(flatKeys(a));
  const kb = new Set(flatKeys(b));
  return {
    onlyInFirst: [...ka].filter((k) => !kb.has(k)),
    onlyInSecond: [...kb].filter((k) => !ka.has(k)),
  };
}

export function assertParity(a = en, b = hi) {
  const { onlyInFirst, onlyInSecond } = keyDiff(a, b);
  if (onlyInFirst.length || onlyInSecond.length) {
    throw new Error(
      'i18n: en.json and hi.json disagree.\n' +
        (onlyInFirst.length ? `  missing in hi.json: ${onlyInFirst.join(', ')}\n` : '') +
        (onlyInSecond.length ? `  missing in en.json: ${onlyInSecond.join(', ')}\n` : ''),
    );
  }
}

/**
 * Every page's <title> and meta description is its own, in each language.
 * Two pages sharing one compete with each other in search, so a duplicate
 * THROWS - and because this runs at import, it fails the build.
 */
export function assertUniqueMeta(dicts = DICTS) {
  const problems = [];
  for (const [lang, dict] of Object.entries(dicts)) {
    for (const field of ['title', 'description']) {
      const seen = new Map();
      for (const [path, page] of Object.entries(dict.pages ?? {})) {
        const v = page[field]?.trim();
        if (!v) {
          problems.push(`${lang} ${path}: no ${field}`);
          continue;
        }
        if (seen.has(v)) problems.push(`${lang}: ${path} has the same ${field} as ${seen.get(v)}`);
        else seen.set(v, path);
      }
    }
  }
  if (problems.length) throw new Error(`i18n: titles/descriptions must be unique:\n  ${problems.join('\n  ')}`);
}

assertParity();
assertUniqueMeta();

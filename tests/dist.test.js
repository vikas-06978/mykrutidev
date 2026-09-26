/**
 * Checks on the BUILT site, run after `astro build` (npm run test:dist).
 *
 * The unit tests prove the dictionaries and helpers are right; these prove the
 * pages that actually ship are: every English page has its Hindi twin, the SEO
 * tags point where they should, Hindi pages keep their readers on Hindi pages,
 * and a converter behaves identically in both languages.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { SITE, PAGES, isLive, isIndexable, statusOf, navGroups } from '../src/lib/routes.js';
import { convert, FONTS } from '../src/lib/fontMaps.js';
import { THEMES, readThemes } from '../src/lib/themeColors.js';
import { PRINTABLES, chartRows, practiceSheets, matraRows, pdfFile, pdfHref } from '../src/lib/printables.js';
import { wholeKeys } from '../src/lib/tutor.build.js';
import { MAX_BYTES, OPEN_FONTS, embeddedFonts } from '../scripts/build-pdfs.mjs';
import { PDFDocument } from 'pdf-lib';
import jsQR from 'jsqr';
import { readUpiId, upiLink, QUIET_ZONE } from '../src/lib/support.build.js';
import { GA_ID, analyticsScript } from '../src/lib/analytics.js';

const isHiPath = (p) => p === '/hi' || p.startsWith('/hi/');

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(new URL('../src/lib/__fixtures__/kruti-dev.json', import.meta.url), 'utf8'),
);
const RE_DEVA = /[ऀ-ॿ]/;

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });

/** dist/hi/x/index.html -> "/hi/x"; dist/index.html -> "/" */
const urlPathOf = (file) => {
  const rel = relative(DIST, file).split(sep).join('/').replace(/(^|\/)index\.html$/, '');
  return rel ? `/${rel}` : '/';
};

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : undefined;
};

let pages; // Map<urlPath, html> - every page except the 404, which is not a route
let notFound; // dist/404.html

before(() => {
  assert.ok(existsSync(DIST), 'dist/ not found - run `astro build` first');
  const files = walk(DIST);
  pages = new Map(files.filter((f) => !f.endsWith(`${sep}404.html`)).map((f) => [urlPathOf(f), readFileSync(f, 'utf8')]));
  notFound = readFileSync(join(DIST, '404.html'), 'utf8');
});

const english = () => [...pages.keys()].filter((p) => p !== '/hi' && !p.startsWith('/hi/'));
const hindiOf = (p) => (p === '/' ? '/hi' : `/hi${p}`);
/** A page path in its published form: "/x" -> "/x/", "/hi" -> "/hi/". */
const slash = (p) => (p === '/' ? '/' : `${p.replace(/\/$/, '')}/`);
/** The published URL of a page: absolute, with the trailing slash. */
const abs = (p) => new URL(p === '/' ? '/' : `${p.replace(/\/$/, '')}/`, SITE).href;

describe('every page exists in both languages', () => {
  test('each English page has a /hi twin, and nothing else lives under /hi', () => {
    const en = english();
    const hi = [...pages.keys()].filter((p) => p === '/hi' || p.startsWith('/hi/'));
    assert.ok(en.length >= PAGES.length, `expected ${PAGES.length} English pages, found ${en.length}`);
    for (const p of en) assert.ok(pages.has(hindiOf(p)), `${p} has no Hindi page at ${hindiOf(p)}`);
    assert.equal(hi.length, en.length, 'Hindi pages that have no English twin');
  });

  test('every route in routes.js was built in both languages', () => {
    for (const p of PAGES) {
      assert.ok(pages.has(p.path), `missing ${p.path}`);
      assert.ok(pages.has(hindiOf(p.path)), `missing ${hindiOf(p.path)}`);
    }
  });
});

describe('language and SEO tags', () => {
  test('<html lang>, og:locale and og:locale:alternate match the language', () => {
    for (const [p, html] of pages) {
      const isHi = p === '/hi' || p.startsWith('/hi/');
      assert.match(html, new RegExp(`<html lang="${isHi ? 'hi' : 'en'}"`), p);
      assert.match(html, new RegExp(`property="og:locale" content="${isHi ? 'hi_IN' : 'en_IN'}"`), p);
      assert.match(html, new RegExp(`property="og:locale:alternate" content="${isHi ? 'en_IN' : 'hi_IN'}"`), p);
    }
  });

  test('hreflang en, hi and x-default on every page, pointing at the twin pair', () => {
    for (const p of english()) {
      const want = { en: abs(p), hi: abs(hindiOf(p)), 'x-default': abs(p) };
      for (const q of [p, hindiOf(p)]) {
        const links = [...pages.get(q).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
        const got = Object.fromEntries(links.map((m) => [m[1], m[2]]));
        assert.deepEqual(got, want, q);
      }
    }
  });

  test('canonical is self-referencing and stays in its own language', () => {
    for (const p of english()) {
      const page = PAGES.find((x) => x.path === p);
      const target = page?.canonical ?? p;
      assert.match(pages.get(p), new RegExp(`rel="canonical" href="${abs(target)}"`), p);
      assert.match(pages.get(hindiOf(p)), new RegExp(`rel="canonical" href="${abs(hindiOf(target))}"`), hindiOf(p));
    }
  });

  test('every Hindi page has a Hindi <title> and meta description', () => {
    for (const p of english()) {
      const html = pages.get(hindiOf(p));
      assert.match(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '', RE_DEVA, `${hindiOf(p)} title`);
      assert.match(html.match(/name="description" content="([^"]*)"/)?.[1] ?? '', RE_DEVA, `${hindiOf(p)} description`);
    }
  });

  test('noindex is the same in both languages', () => {
    for (const p of english()) {
      assert.equal(
        pages.get(hindiOf(p)).includes('name="robots" content="noindex'),
        pages.get(p).includes('name="robots" content="noindex'),
        p,
      );
    }
  });

  test('the sitemap lists every indexable page in both languages, with hreflang', () => {
    const xml = readdirSync(DIST)
      .filter((f) => /^sitemap-\d+\.xml$/.test(f))
      .map((f) => readFileSync(join(DIST, f), 'utf8'))
      .join('\n');
    const locs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, '')));
    for (const p of PAGES) {
      const inSitemap = (u) => locs.has(abs(u).replace(/\/$/, ''));
      assert.equal(inSitemap(p.path), isIndexable(abs(p.path)), `en ${p.path}`);
      assert.equal(inSitemap(hindiOf(p.path)), isIndexable(abs(p.path)), `hi ${p.path}`);
    }
    assert.match(xml, /hreflang="hi"/);
    assert.match(xml, /hreflang="en"/);
  });
});

describe('links', () => {
  const NOT_A_PAGE = /^\/(?:_astro|data|downloads|fonts|favicon|sitemap|robots\.txt)/;

  test('internal links on a Hindi page go to Hindi pages', () => {
    for (const p of english()) {
      const q = hindiOf(p);
      for (const [tag] of pages.get(q).matchAll(/<a\b[^>]*>/g)) {
        const href = attr(tag, 'href');
        if (!href?.startsWith('/') || href.startsWith('//') || NOT_A_PAGE.test(href)) continue;
        if (tag.includes('data-lang-switch')) continue;
        assert.ok(href === '/hi' || href.startsWith('/hi/') || href.startsWith('/hi#'), `${q} links to ${href}`);
      }
    }
  });

  test('internal links on an English page stay on English pages', () => {
    for (const p of english()) {
      for (const [tag] of pages.get(p).matchAll(/<a\b[^>]*>/g)) {
        const href = attr(tag, 'href');
        if (!href?.startsWith('/') || tag.includes('data-lang-switch')) continue;
        assert.ok(!(href === '/hi' || href.startsWith('/hi/')), `${p} links to ${href}`);
      }
    }
  });

  test('the switch links to the SAME page in the other language', () => {
    for (const p of english()) {
      const q = hindiOf(p);
      const toHi = [...pages.get(p).matchAll(/<a\b[^>]*data-lang-switch="hi"[^>]*>/g)].map((m) => attr(m[0], 'href'));
      const toEn = [...pages.get(q).matchAll(/<a\b[^>]*data-lang-switch="en"[^>]*>/g)].map((m) => attr(m[0], 'href'));
      assert.ok(toHi.length > 0 && toHi.every((h) => h === slash(q)), `${p} -> ${toHi}`);
      assert.ok(toEn.length > 0 && toEn.every((h) => h === slash(p)), `${q} -> ${toEn}`);
    }
  });

  test('the "available in Hindi" banner is on English pages only, and never redirects', () => {
    for (const p of english()) {
      assert.match(pages.get(p), /data-lang-banner/, p);
      assert.doesNotMatch(pages.get(hindiOf(p)), /data-lang-banner/, hindiOf(p));
    }
    for (const html of pages.values()) {
      assert.doesNotMatch(html, /http-equiv="refresh"/i);
      assert.doesNotMatch(html, /location\.(href|replace|assign)\s*[=(]/);
    }
  });
});

describe('"Soon" badges come from the status flag, everywhere, in both languages', () => {
  const BADGE = /<span\b[^>]*\bdata-soon-badge\b[^>]*>([^<]*)<\/span>/g;
  const TEXT = { en: 'Soon', hi: 'जल्द' };
  const langOf = (p) => (p === '/hi' || p.startsWith('/hi/') ? 'hi' : 'en');

  /** Every listed route on a page: [{ route, html }], nav rows and cards alike. */
  const rows = (html) =>
    [...html.matchAll(/<li\b[^>]*\bdata-route="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({
      route: m[1],
      html: m[2],
    }));
  const section = (html, marker) => html.split(marker)[1]?.split('</nav>')[0] ?? '';

  test('on every page, a listed route shows the badge exactly when its status is "soon"', () => {
    let soon = 0;
    let live = 0;
    for (const [p, html] of pages) {
      for (const r of rows(html)) {
        const page = PAGES.find((x) => x.path === r.route);
        assert.ok(page, `${p}: data-route="${r.route}" is not in routes.js`);
        const badges = [...r.html.matchAll(BADGE)];
        if (statusOf(page) === 'soon') {
          soon++;
          assert.equal(badges.length, 1, `${p}: ${r.route} is coming soon but has ${badges.length} badges`);
          assert.equal(badges[0][1].trim(), TEXT[langOf(p)], `${p}: ${r.route} badge text`);
        } else {
          live++;
          assert.equal(badges.length, 0, `${p}: live ${r.route} shows a Soon badge`);
        }
      }
    }
    assert.ok(soon > 100 && live > 100, `too few rows checked (${soon} soon, ${live} live)`);
  });

  test('no badge anywhere outside a listed route', () => {
    for (const [p, html] of pages) {
      const inRows = rows(html).reduce((n, r) => n + [...r.html.matchAll(BADGE)].length, 0);
      assert.equal([...html.matchAll(BADGE)].length, inRows, p);
    }
  });

  test('every coming-soon item in the nav has the badge, desktop and mobile, en and hi', () => {
    const soonInNav = navGroups().flatMap((g) => g.pages).filter((x) => x.status === 'soon');
    assert.ok(soonInNav.length > 0);
    for (const home of ['/', '/hi']) {
      const html = pages.get(home);
      for (const marker of ['data-desktop-nav', 'data-mobile-nav']) {
        const nav = rows(section(html, marker));
        for (const s of soonInNav) {
          const r = nav.find((x) => x.route === s.path);
          assert.ok(r, `${home} ${marker}: ${s.path} missing`);
          assert.match(r.html, /data-soon-badge/, `${home} ${marker}: ${s.path} has no badge`);
          assert.match(r.html, /aria-disabled="true"/, `${home} ${marker}: ${s.path} must stay greyed, not a link`);
        }
      }
    }
  });

  test('the All converters page lists every converter, with the badge on exactly the soon ones', () => {
    for (const p of ['/all-converters', '/hi/all-converters']) {
      const listed = new Map(rows(pages.get(p)).map((r) => [r.route, r.html]));
      for (const page of PAGES.filter((x) => x.kind === 'converter')) {
        assert.ok(listed.has(page.path), `${p}: ${page.path} missing`);
        assert.equal(/data-soon-badge/.test(listed.get(page.path)), statusOf(page) === 'soon', `${p}: ${page.path}`);
      }
    }
  });

  test('both Abbasi Chanakya pages are live and never show the badge', () => {
    for (const route of ['/abbasi-chanakya-to-unicode', '/unicode-to-abbasi-chanakya']) {
      assert.equal(statusOf(PAGES.find((x) => x.path === route)), 'live', route);
      for (const [p, html] of pages) {
        for (const r of rows(html).filter((x) => x.route === route)) {
          assert.doesNotMatch(r.html, /data-soon-badge/, `${p}: ${route}`);
          assert.match(r.html, /<a\b/, `${p}: ${route} must be a link`);
        }
      }
    }
  });
});

describe('font names in the nav, the footer and /all-converters', () => {
  const LATIN = ['Abbasi Chanakya', 'Chanakya', 'DevLys', 'Shusha', 'Mangal'];
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  /** Visible text of the nav, footer and (on /all-converters) the card titles. */
  const listText = (html) => {
    const navs = [...html.matchAll(/<nav\b[^>]*data-(?:desktop|mobile)-nav[^>]*>([\s\S]*?)<\/nav>/g)].map((m) => m[1]);
    // The footer's links only: its legal line names the trademarks as they are
    // registered, which is exactly where the Latin spelling belongs.
    const footer = html.match(/<nav aria-labelledby="footer-conv"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const cards = [...html.matchAll(/<li\b[^>]*data-route="[^"]*"[^>]*>[\s\S]*?<span class="font-medium text-ink"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1]);
    return strip([...navs, footer, ...cards].join('\n'));
  };

  test('Hindi pages use Hindi font names there', () => {
    for (const [p, html] of pages) {
      if (!(p === '/hi' || p.startsWith('/hi/'))) continue;
      const text = listText(html);
      for (const name of LATIN) assert.ok(!text.includes(name), `${p}: "${name}" in the nav, footer or card titles`);
    }
    const all = listText(pages.get('/hi/all-converters'));
    for (const hiName of ['देवलिस', 'चाणक्य', 'शुषा', 'अब्बासी चाणक्य', 'मंगल']) assert.ok(all.includes(hiName), hiName);
  });

  test('English pages still use the Latin names', () => {
    const text = listText(pages.get('/all-converters'));
    for (const name of LATIN) assert.ok(text.includes(name), name);
  });

  test('a Hindi tool page keeps the exact Latin font name in its own text', () => {
    const h1 = pages.get('/hi/devlys-to-unicode').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1];
    assert.match(h1, /<span translate="no">DevLys<\/span>/);
  });
});

describe('printable charts and PDFs', () => {
  const DOWNLOADS = join(DIST, 'downloads');
  const both = (p) => [p, hindiOf(p)];

  test('the build wrote every PDF: it opens, is A4, has the right page count, is under 500 KB', async () => {
    for (const p of PRINTABLES) {
      for (const lang of ['en', 'hi']) {
        const file = join(DOWNLOADS, pdfFile(p, lang));
        assert.ok(existsSync(file), `missing ${file}`);
        const bytes = readFileSync(file);
        assert.ok(bytes.length < MAX_BYTES, `${p.pdf}-${lang}: ${bytes.length} bytes`);
        const doc = await PDFDocument.load(bytes); // throws if it does not open
        assert.equal(doc.getPageCount(), p.pages, `${p.pdf}-${lang}: pages`);
        for (const page of doc.getPages()) {
          const { width, height } = page.getSize();
          const [w, h] = p.landscape ? [841.89, 595.28] : [595.28, 841.89];
          assert.ok(Math.abs(width - w) < 1 && Math.abs(height - h) < 1, `${p.pdf}-${lang}: ${width}x${height} is not A4`);
        }
        const fonts = embeddedFonts(bytes);
        assert.ok(fonts.length > 0, `${p.pdf}-${lang}: no embedded font`);
        for (const f of fonts) assert.match(f, OPEN_FONTS, `${p.pdf}-${lang} embeds ${f}`);
      }
    }
  });

  test('every PDF link on every page is a real PDF in the build, downloaded under its own name', () => {
    let links = 0;
    for (const [p, html] of pages) {
      for (const [tag] of html.matchAll(/<a\b(?:[^>"]|"[^"]*")*\bhref="[^"]*\.pdf"(?:[^>"]|"[^"]*")*>/g)) {
        const href = attr(tag, 'href');
        assert.match(href, /^\/downloads\/mykrutidev-[a-z-]+\.pdf$/, `${p}: ${href}`);
        assert.equal(attr(tag, 'download'), href.slice('/downloads/'.length), `${p}: download name for ${href}`);
        assert.equal(attr(tag, 'type'), 'application/pdf', `${p}: type for ${href}`);
        const file = join(DIST, href);
        assert.ok(existsSync(file) && statSync(file).size > 10 * 1024, `${p}: ${href} is missing or tiny`);
        links++;
      }
    }
    assert.ok(links >= PRINTABLES.length * 2, `only ${links} PDF links`);
  });

  test('the PDFs are committed in public/downloads, so they exist in dev too', () => {
    for (const p of PRINTABLES) {
      for (const lang of ['en', 'hi']) {
        const src = fileURLToPath(new URL(`../public/downloads/${pdfFile(p, lang)}`, import.meta.url));
        assert.ok(existsSync(src), `missing ${src} - run npm run pdfs`);
      }
    }
  });

  test('every key on the keyboard and finger charts IS the tutor keyboard, labelled from the font (normal + Shift)', () => {
    const want = chartRows()
      .flat()
      .map((c) => ({ base: c.base, shift: c.shift, baseLabel: c.baseText, shiftLabel: c.shiftText, finger: c.finger, home: String(c.home) }));
    for (const route of ['/kruti-dev-keyboard', '/hindi-typing-finger-chart']) {
      for (const p of both(route)) {
        // Quoted values may contain ">" (the "." key's Shift character is ">").
        const got = [...pages.get(p).matchAll(/<span\b(?:[^>"]|"[^"]*")*\bdata-cap-key\b(?:[^>"]|"[^"]*")*>/g)].map(([tag]) => ({
          base: attr(tag, 'data-base'),
          shift: attr(tag, 'data-shift'),
          baseLabel: attr(tag, 'data-base-label') ?? '',
          shiftLabel: attr(tag, 'data-shift-label') ?? '',
          finger: attr(tag, 'data-finger'),
          home: attr(tag, 'data-home'),
        }));
        assert.deepEqual(got, want, p);
      }
    }
  });

  test('the practice sheets are the tutor lessons, line for line, with the tutor keystrokes', () => {
    const sheets = practiceSheets();
    for (const p of both('/hindi-typing-practice-sheets')) {
      const html = pages.get(p);
      const deva = [...html.matchAll(/data-deva[^>]*>\s*([^<]*?)\s*</g)].map((m) => decode(m[1]));
      const keys = [...html.matchAll(/data-keys[^>]*>([^<]*)</g)].map((m) => decode(m[1]));
      assert.deepEqual(deva, sheets.flatMap((s) => s.drills.map((d) => d.deva)), `${p}: drills`);
      assert.deepEqual(keys, sheets.flatMap((s) => s.drills.map((d) => d.keys)), `${p}: keys`);
      assert.equal((html.match(/<section class="pr-sheet"/g) ?? []).length, sheets.length, `${p}: one sheet per level`);
    }
  });

  test('the matra and conjunct chart: each row carries the tutor keystrokes for its example', () => {
    for (const p of both('/kruti-dev-matra-chart')) {
      const rows = [...pages.get(p).matchAll(/<tr\b[^>]*data-matra="([^"]+)"[^>]*>/g)].map(([tag]) => ({
        id: attr(tag, 'data-matra'),
        example: attr(tag, 'data-example'),
        keys: attr(tag, 'data-keys'),
      }));
      assert.deepEqual(rows, matraRows().map((r) => ({ id: r.id, example: r.example, keys: wholeKeys(r.example) })), p);
    }
  });

  test('the progress log has 30 rows', () => {
    for (const p of both('/hindi-typing-progress-log')) {
      assert.equal((pages.get(p).match(/data-log-row/g) ?? []).length, 30, p);
    }
  });

  test('each printable page: its PDF in its own language, Print, "Practise online", the others, a FAQ', () => {
    for (const pr of PRINTABLES) {
      for (const [p, lang] of [[pr.path, 'en'], [hindiOf(pr.path), 'hi']]) {
        const html = pages.get(p);
        assert.match(html, new RegExp(`<a href="${pdfHref(pr, lang)}" download="${pdfFile(pr, lang)}" type="application/pdf"`), `${p}: PDF link`);
        assert.match(html, /data-print\b/, `${p}: Print`);
        assert.match(html, new RegExp(`href="${lang === 'hi' ? '/hi' : ''}/hindi-typing-test/"`), `${p}: Practise online`);
        for (const other of PRINTABLES.filter((o) => o !== pr)) {
          assert.ok(html.includes(pdfHref(other, lang)), `${p}: no link to ${other.pdf}`);
        }
        assert.match(html, /<h2 id="faq-heading"/, `${p}: FAQ`);
      }
    }
  });

  test('the Typing Tutor, the Hindi Keyboard, the menu and the home page link to the printables', () => {
    for (const p of [...both('/hindi-typing-test'), ...both('/hindi-keyboard')]) {
      const lang = isHiPath(p) ? 'hi' : 'en';
      for (const pr of PRINTABLES) assert.ok(pages.get(p).includes(pdfHref(pr, lang)), `${p}: ${pr.pdf}`);
    }
    for (const [p, html] of pages) {
      const prefix = isHiPath(p) ? '/hi' : '';
      assert.ok(html.includes(`href="${prefix}/kruti-dev-keyboard/"`), `${p}: no menu link to the printables`);
    }
  });
});

describe('SEO basics', () => {
  const isHi = (p) => p === '/hi' || p.startsWith('/hi/');
  const routeOf = (p) => (p === '/hi' ? '/' : isHi(p) ? p.slice(3) : p);
  const pageOf = (p) => PAGES.find((x) => x.path === routeOf(p));
  const jsonLd = (html) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  // Same rule as Base.astro. tests/seo.test.js checks it against the tools
  // actually found on each built page.
  const isTool = (page) =>
    !!page && isLive(page) && (page.kind === 'converter' || !!page.tool || !!page.app || !!(page.from && page.to));

  test('every page has exactly one <h1>', () => {
    for (const [p, html] of pages) {
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1, p);
    }
  });

  test('titles and descriptions are unique per language across all built pages', () => {
    for (const lang of ['en', 'hi']) {
      for (const [field, re] of [
        ['title', /<title>([^<]*)<\/title>/],
        ['description', /name="description" content="([^"]*)"/],
      ]) {
        const seen = new Map();
        for (const [p, html] of pages) {
          if (isHi(p) !== (lang === 'hi')) continue;
          const v = html.match(re)?.[1];
          assert.ok(v, `${p}: no ${field}`);
          assert.ok(!seen.has(v), `${p} and ${seen.get(v)} share a ${field}`);
          seen.set(v, p);
        }
      }
    }
  });

  test('live tool pages: "How to use" (3 steps + a tip) and FAQ under h2 headings, tool first', () => {
    let n = 0;
    for (const [p, html] of pages) {
      const page = pageOf(p);
      if (!isTool(page)) continue;
      n++;
      assert.match(html, /<h2 id="howto-heading"[^>]*>/, `${p}: no How to use`);
      assert.match(html, /<h2 id="faq-heading"[^>]*>/, `${p}: no FAQ`);
      const steps = html.match(/<ol class="howto[^"]*"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? '';
      assert.equal((steps.match(/<li\b/g) ?? []).length, 3, `${p}: steps`);
      // Order: tool, then How to use, then FAQ.
      const at = (s) => html.indexOf(s);
      assert.ok(at('id="tool"') > 0 && at('id="tool"') < at('id="howto-heading"'), `${p}: help above the tool`);
      assert.ok(at('id="howto-heading"') < at('id="faq-heading"'), `${p}: FAQ before How to use`);
      // FAQ answers sit in <details>.
      assert.match(html.slice(at('id="faq-heading"')), /<details\b/, `${p}: FAQ without details`);
    }
    assert.ok(n >= 28, `only ${n} tool pages`);
  });

  test('no two pages share a "How to use" step or tip (duplicate text hurts ranking)', () => {
    for (const lang of ['en', 'hi']) {
      const seen = new Map();
      for (const [p, html] of pages) {
        if (isHi(p) !== (lang === 'hi')) continue;
        const block = html.match(/<section aria-labelledby="howto-heading"[\s\S]*?<\/section>/)?.[0];
        if (!block) continue;
        const items = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
          .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/^\d+/, '').trim());
        for (const s of items) {
          assert.ok(!seen.has(s), `${p} repeats "${s.slice(0, 60)}" from ${seen.get(s)}`);
          seen.set(s, p);
        }
      }
    }
  });

  test('every live converter links to its reverse and to at least 2 related tools', () => {
    for (const [p, html] of pages) {
      const page = pageOf(p);
      if (!page || page.kind !== 'converter' || !isLive(page)) continue;
      const hrefs = new Set([...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => routeOf(m[1].replace(/\/$/, '') || '/')));
      const rev = PAGES.find((x) => x.kind === 'converter' && x.from === page.to && x.to === page.from);
      if (rev && isLive(rev)) assert.ok(hrefs.has(rev.path), `${p}: no link to its reverse ${rev.path}`);
      const related = page.related.filter((r) => isLive(PAGES.find((x) => x.path === r)));
      assert.ok(related.length >= 2, `${p}: fewer than 2 live related pages`);
      for (const r of related) assert.ok(hrefs.has(r), `${p}: no link to related ${r}`);
    }
  });

  test('WebApplication data on tool pages only; BreadcrumbList on every page', () => {
    for (const [p, html] of pages) {
      const types = jsonLd(html).map((j) => j['@type']);
      assert.ok(types.includes('BreadcrumbList'), `${p}: no BreadcrumbList`);
      assert.equal(types.includes('WebApplication'), isTool(pageOf(p)), `${p}: WebApplication`);
    }
  });

  test('every image has alt text', () => {
    for (const [p, html] of pages) {
      for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
        assert.match(tag, /\salt="[^"]+"/, `${p}: ${tag}`);
      }
    }
  });
});

describe('themes', () => {
  const styles = (f) => readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8');
  const themes = readThemes(styles('global.css'), styles('themes.css'));
  const paperOf = (theme) => themes[theme].paper;

  test('every page sets the theme and accent in <head>, before <body>', () => {
    for (const [p, html] of pages) {
      const [head] = html.split('<body');
      assert.match(head, /<meta name="theme-color"/, p);
      assert.match(head, /'mkd-theme'/, `${p}: no theme script in <head>`);
      assert.match(head, /'mkd-accent'/, `${p}: the theme script does not restore the accent`);
      // Inline, not a module: it must run while the head is parsed.
      const script = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find((m) => m[2].includes('mkd-theme'));
      assert.ok(script && !/type="module"|\bsrc=/.test(script[1]), `${p}: theme script must be inline`);
    }
  });

  test('the browser-bar colours in the script match --color-paper for each theme', () => {
    const html = pages.get('/');
    const bar = Object.fromEntries(
      [...html.match(/var BAR = \{([^}]+)\}/)[1].matchAll(/(\w+):\s*'(#[0-9a-f]{6})'/gi)].map((m) => [m[1], m[2]]),
    );
    for (const theme of THEMES) assert.equal(bar[theme], paperOf(theme), theme);
    assert.match(html, new RegExp(`<meta name="theme-color" content="${paperOf('light')}"`));
  });
});

describe('converters behave identically in both languages', () => {
  /** What a page's converter is configured to do, read from its markup. */
  const converterOf = (html) => {
    const tag = html.match(/<div\b[^>]*\bdata-converter\b[^>]*>/)?.[0];
    if (!tag) return null;
    const sample = html.match(/data-role="sample"[^>]*data-sample="([^"]*)"/)?.[1];
    return {
      from: attr(tag, 'data-from'),
      to: attr(tag, 'data-to'),
      reverse: attr(tag, 'data-reverse'),
      sample: sample === undefined ? undefined : decode(sample),
    };
  };
  const scripts = (html) => [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]).sort();

  const convertedPairs = () =>
    english()
      .map((p) => ({ p, en: converterOf(pages.get(p)), hi: converterOf(pages.get(hindiOf(p))) }))
      .filter((x) => x.en || x.hi);

  test('the same converter, the same direction and the same sample on both pages', () => {
    const pairs = convertedPairs();
    assert.ok(pairs.length >= 10, `only ${pairs.length} converter pages found`);
    for (const { p, en, hi } of pairs) {
      assert.ok(en && hi, `${p}: converter missing in one language`);
      assert.equal(hi.from, en.from, p);
      assert.equal(hi.to, en.to, p);
      assert.equal(hi.sample, en.sample, `${p}: the example text must not be translated`);
      // The swap link is the same route, in each page's own language.
      assert.equal(hi.reverse, en.reverse, p);
    }
  });

  test('both pages load exactly the same script bundles', () => {
    for (const p of english()) {
      assert.deepEqual(scripts(pages.get(hindiOf(p))), scripts(pages.get(p)), p);
    }
  });

  test('every Kruti Dev fixture converts to the same output on the English and Hindi page', () => {
    const groups = Object.entries(FIXTURES).filter(([k]) => !k.startsWith('_'));
    let checked = 0;
    for (const { p, en, hi } of convertedPairs()) {
      const run = (cfg, input) => convert(input, cfg.from, cfg.to, { keepEnglish: true });
      const srcKind = FONTS[en.from].kind;
      for (const [, cases] of groups) {
        for (const c of cases) {
          const input = srcKind === 'unicode' ? c.u : c.k;
          assert.equal(run(hi, input), run(en, input), `${p}: ${JSON.stringify(input)}`);
          checked++;
        }
      }
      if (en.sample) assert.equal(run(hi, hi.sample), run(en, en.sample), `${p}: sample`);
    }
    assert.ok(checked > 1000, `only ${checked} conversions compared`);
  });

  test('live converter pages show a converter in Hindi too; pending ones in neither', () => {
    for (const page of PAGES.filter((x) => x.kind === 'converter')) {
      const has = (u) => /\bdata-converter\b/.test(pages.get(u));
      assert.equal(has(page.path), isLive(page), page.path);
      assert.equal(has(hindiOf(page.path)), isLive(page), hindiOf(page.path));
    }
  });
});

describe('translate="no" and code examples', () => {
  test('converter boxes, their labels and code examples carry translate="no"', () => {
    for (const html of pages.values()) {
      for (const [tag] of html.matchAll(/<textarea\b[^>]*>/g)) {
        assert.match(tag, /translate="no"/, tag.slice(0, 80));
      }
      for (const [tag] of html.matchAll(/<code\b[^>]*>/g)) {
        assert.match(tag, /translate="no"/, tag);
      }
    }
  });

  test('exact font names in page text sit inside translate="no"', () => {
    const NAMES = ['Kruti Dev 010', 'DevLys 010', 'Abbasi Chanakya New', 'Mangal', 'MyKrutiDev'];
    const VOID = /^<(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/i;
    for (const [p, html] of pages) {
      const body = (html.split('<body')[1] ?? '')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '');
      // Walk the tags, keeping a stack of "is this element (or an ancestor)
      // translate=no", and check every text run that names a font.
      const stack = [false];
      for (const part of body.split(/(<[^>]+>)/)) {
        if (part.startsWith('</')) {
          if (stack.length > 1) stack.pop();
        } else if (part.startsWith('<')) {
          if (VOID.test(part) || part.endsWith('/>') || part.startsWith('<!')) continue;
          stack.push(stack.at(-1) || /\stranslate="no"/.test(part));
        } else if (!stack.at(-1)) {
          for (const name of NAMES) {
            assert.ok(!part.includes(name), `${p}: "${name}" is translatable in "${part.trim().slice(0, 80)}"`);
          }
        }
      }
    }
  });

  test('no Devanagari inside a <code> example on any page', () => {
    for (const [p, html] of pages) {
      for (const [, body] of html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)) {
        assert.doesNotMatch(body, RE_DEVA, `${p}: <code>${body}</code>`);
      }
    }
  });

  test('every <code> example on a Hindi page is one the English page has too', () => {
    const codes = (html) => [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map((m) => m[1]).sort();
    for (const p of english()) {
      assert.deepEqual(codes(pages.get(hindiOf(p))), codes(pages.get(p)), p);
    }
  });
});

describe('security headers (dist/_headers)', () => {
  const headers = () => readFileSync(join(DIST, '_headers'), 'utf8');
  const csp = () => headers().match(/^\s+Content-Security-Policy: (.+)$/m)?.[1] ?? '';
  const allHtml = () => [...pages.values(), notFound];

  test('the build wrote them, with a policy for every page', () => {
    assert.ok(existsSync(join(DIST, '_headers')), 'dist/_headers is missing');
    assert.match(headers(), /^\/\*$/m);
    assert.match(csp(), /frame-ancestors 'none'/);
  });

  test('every inline script on every page is allowed by its hash, so none is blocked', () => {
    const policy = csp();
    for (const html of allHtml()) {
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/i.test(m[1]) || /application\/(ld\+)?json/i.test(m[1])) continue;
        const hash = `'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`;
        assert.ok(policy.includes(hash), `inline script not in the CSP: ${m[2].slice(0, 80)}`);
      }
    }
  });

  test('no inline event handlers or javascript: links, which the policy would block', () => {
    for (const html of allHtml()) {
      assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
      assert.doesNotMatch(html, /href\s*=\s*["']?\s*javascript:/i);
    }
  });
});

describe('Google Analytics', () => {
  test('every page, the 404 included, has the tag once, at the top of <head>', () => {
    const tag = `<script>${analyticsScript()}</script>`;
    for (const [p, html] of [...pages, ['404', notFound]]) {
      assert.equal(html.split(tag).length - 1, 1, `${p}: the analytics tag is missing or repeated`);
      const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
      assert.ok(head.includes(tag), `${p}: the analytics tag is not in <head>`);
      assert.equal(head.search(/<script\b/), head.indexOf(tag), `${p}: another script runs before the analytics tag`);
      assert.equal(html.match(/googletagmanager\.com\/gtag\/js/g)?.length, 1, `${p}: Google's own tag pasted in as well`);
    }
  });

  test('the privacy policy names its cookies, in both languages', () => {
    for (const p of ['/privacy-policy', '/hi/privacy-policy']) {
      const html = pages.get(p);
      for (const cookie of ['_ga', `_ga_${GA_ID.replace(/^G-/, '')}`]) {
        assert.match(html, new RegExp(`<code[^>]*>${cookie}</code>`), `${p} does not name the ${cookie} cookie`);
      }
      assert.doesNotMatch(html, /no (advertising or )?analytics cookies|no tracking cookies/i, p);
    }
  });
});

describe('the support option (PUBLIC_UPI_ID)', () => {
  // The same setting the build read: set in CI with a test ID and on
  // Cloudflare with the real one, usually unset on a laptop.
  const upiId = readUpiId(process.env.PUBLIC_UPI_ID);
  const support = () => ({ en: pages.get('/support'), hi: pages.get('/hi/support') });

  /** Read the QR on the page back as a phone would, from the SVG the build drew. */
  const scanPage = (html) => {
    const svg = html.match(/<div class="sp-qr[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)/)?.[1];
    assert.ok(svg, 'no QR code on the page');
    const size = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
    const scale = 6;
    const px = size * scale;
    const data = new Uint8ClampedArray(px * px * 4).fill(255);
    for (const [, x, y, run] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
      for (let dx = 0; dx < Number(run) * scale; dx++) {
        for (let dy = 0; dy < scale; dy++) {
          const i = ((Number(y) * scale + dy) * px + Number(x) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
    assert.ok(size > QUIET_ZONE * 2);
    return jsQR(data, px, px)?.data ?? null;
  };

  test('the page exists in both languages and is never indexed', () => {
    for (const html of Object.values(support())) {
      assert.ok(html, 'missing /support page');
      assert.match(html, /<meta name="robots" content="noindex/);
    }
  });

  test('with a UPI ID: the link and the QR pay exactly that ID, and every footer links to the page', { skip: !upiId && 'PUBLIC_UPI_ID not set' }, () => {
    const link = upiLink(upiId);
    for (const html of Object.values(support())) {
      assert.ok(html.includes(`href="${link.replaceAll('&', '&amp;')}"`), 'Pay button does not carry the exact link');
      assert.equal(scanPage(html), link);
      assert.ok(html.includes(`>${upiId}</code>`), 'UPI ID not shown');
    }
    for (const [path, html] of pages) {
      const href = path === '/hi' || path.startsWith('/hi/') ? '/hi/support/' : '/support/';
      assert.ok(html.includes(`href="${href}"`) && html.includes('data-support-link'), `${path}: no footer link to ${href}`);
    }
  });

  test('without a UPI ID: no payment anywhere, and no footer link', { skip: !!upiId && 'PUBLIC_UPI_ID is set' }, () => {
    for (const html of [...pages.values(), notFound]) {
      assert.doesNotMatch(html, /upi:\/\//);
      assert.doesNotMatch(html, /<[^>]+\sdata-support-(link|upi)[\s>=]/);
    }
  });
});

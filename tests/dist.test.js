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

import { SITE, PAGES, isLive, isIndexable, statusOf, navGroups } from '../src/lib/routes.js';
import { convert, FONTS } from '../src/lib/fontMaps.js';

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

let pages; // Map<urlPath, html>

before(() => {
  assert.ok(existsSync(DIST), 'dist/ not found - run `astro build` first');
  pages = new Map(walk(DIST).map((f) => [urlPathOf(f), readFileSync(f, 'utf8')]));
});

const english = () => [...pages.keys()].filter((p) => p !== '/hi' && !p.startsWith('/hi/'));
const hindiOf = (p) => (p === '/' ? '/hi' : `/hi${p}`);
const abs = (p) => new URL(p, SITE).href;

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
  const NOT_A_PAGE = /^\/(?:_astro|data|fonts|favicon|sitemap|robots\.txt)/;

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
      assert.ok(toHi.length > 0 && toHi.every((h) => h === q), `${p} -> ${toHi}`);
      assert.ok(toEn.length > 0 && toEn.every((h) => h === p), `${q} -> ${toEn}`);
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

describe('themes', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  /** --color-paper in the @theme block (light) and in each [data-theme] block. */
  const paperOf = (theme) => {
    const block =
      theme === 'light'
        ? css.match(/@theme\s*\{([\s\S]*?)\n\}/)[1]
        : css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`))[1];
    return block.match(/--color-paper:\s*(#[0-9a-f]{6})/i)[1].toLowerCase();
  };

  test('every page sets the theme in <head>, before <body>', () => {
    for (const [p, html] of pages) {
      const [head] = html.split('<body');
      assert.match(head, /<meta name="theme-color"/, p);
      assert.match(head, /localStorage\.getItem\(KEY\)/, `${p}: no theme script in <head>`);
      // Inline, not a module: it must run while the head is parsed.
      const script = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find((m) => m[2].includes('mkd-theme'));
      assert.ok(script && !/type="module"|\bsrc=/.test(script[1]), `${p}: theme script must be inline`);
    }
  });

  test('the browser-bar colours in the script match --color-paper for each theme', () => {
    const html = pages.get('/');
    const bar = JSON.parse(
      html.match(/var BAR = (\{[^}]+\})/)[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'),
    );
    for (const theme of ['light', 'dark', 'reading']) assert.equal(bar[theme], paperOf(theme), theme);
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

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PAGES,
  getPage,
  isLive,
  livePages,
  pendingPages,
  liveConverters,
  navMenus,
  NAV_MENUS,
  allGroups,
  reversePage,
  isIndexable,
  assertKnownFonts,
  SITE,
  statusOf,
} from './routes.js';

describe('status: the one flag every "Soon" badge renders from', () => {
  test('is "soon" exactly when a page is not live, for every route', () => {
    for (const p of PAGES) assert.equal(statusOf(p), isLive(p) ? 'live' : 'soon', p.path);
  });

  test('nav and /all-converters items carry it, agreeing with `live`', () => {
    for (const g of allGroups()) {
      for (const p of g.pages) {
        assert.equal(p.status, statusOf(getPage(p.path)), p.path);
        assert.equal(p.live, p.status === 'live', p.path);
      }
    }
  });

  test('Abbasi and newspaper Chanakya pages are live; the Walkman-Chanakya pairs were removed', () => {
    for (const path of ['/abbasi-chanakya-to-unicode', '/unicode-to-abbasi-chanakya', '/chanakya-to-unicode', '/unicode-to-chanakya']) {
      assert.equal(statusOf(getPage(path)), 'live', path);
    }
    assert.equal(getPage('/chanakya-to-unicode').from, 'chanakya-news');
    for (const path of ['/chanakya-to-kruti-dev', '/kruti-dev-to-chanakya']) assert.equal(getPage(path), undefined, path);
  });
});
import { FONTS } from './fontMaps.js';

const PAGES_DIR = fileURLToPath(new URL('../pages', import.meta.url));

/** Route path -> the file Astro would build it from. */
function routeToFile(path) {
  return path === '/' ? 'index.astro' : `${path.slice(1)}.astro`;
}

describe('the routes table itself', () => {
  test('every path is unique', () => {
    const seen = new Set();
    for (const p of PAGES) {
      assert.ok(!seen.has(p.path), `duplicate path ${p.path}`);
      seen.add(p.path);
    }
  });

  test('every path is absolute and has no trailing slash', () => {
    for (const p of PAGES) {
      assert.match(p.path, /^\//, `${p.path} must start with /`);
      if (p.path !== '/') assert.doesNotMatch(p.path, /\/$/, `${p.path} has a trailing slash`);
    }
  });

  test('every page carries the fields the layout reads', () => {
    for (const p of PAGES) {
      for (const field of ['ready', 'kind', 'group', 'nav', 'h1', 'title', 'description']) {
        assert.ok(p[field] !== undefined, `${p.path} is missing ${field}`);
      }
      assert.ok(['converter', 'content'].includes(p.kind), `${p.path} has kind ${p.kind}`);
      assert.ok(Array.isArray(p.related), `${p.path} related must be an array`);
    }
  });

  test('every font key referenced actually exists', () => {
    for (const p of PAGES) {
      for (const key of [p.from, p.to]) {
        if (key) assert.ok(FONTS[key], `${p.path} references unknown font ${key}`);
      }
    }
  });

  test('every related link points at a real page', () => {
    for (const p of PAGES) {
      for (const rel of p.related) {
        assert.ok(getPage(rel), `${p.path} links to missing page ${rel}`);
      }
    }
  });

  test('no page lists itself as related', () => {
    for (const p of PAGES) {
      assert.ok(!p.related.includes(p.path), `${p.path} links to itself`);
    }
  });

  test('a converter page is either a full pair or no pair at all', () => {
    for (const p of PAGES.filter((x) => x.kind === 'converter')) {
      assert.equal(
        Boolean(p.from),
        Boolean(p.to),
        `${p.path} has only one half of its pair`,
      );
    }
  });

  test('a page that is not ready explains why', () => {
    for (const p of PAGES.filter((x) => !x.ready && x.kind === 'converter')) {
      assert.ok(p.note, `${p.path} is not ready but gives no reason`);
    }
  });
});

describe('the ready flag cannot outrank an unverified mapping', () => {
  test('no live page converts with a font that is not accurate', () => {
    for (const p of livePages()) {
      for (const key of [p.from, p.to]) {
        if (!key) continue;
        assert.ok(
          FONTS[key].accurate,
          `${p.path} is live but ${key} is not marked accurate`,
        );
      }
    }
  });

  test('ready:true alone does not make a page live', () => {
    // chanakya is deliberately not accurate; pretend someone gives it a page.
    const pretend = { path: '/chanakya-to-unicode', ready: true, kind: 'converter', from: 'chanakya', to: 'unicode' };
    assert.equal(isLive(pretend), false);
  });

  test('a converter page with no font pair can never be live', () => {
    const pretend = { path: '/punjabi-font-converter', ready: true, kind: 'converter', from: null, to: null };
    assert.equal(isLive(pretend), false);
  });

  test('live + pending together account for every page', () => {
    assert.equal(livePages().length + pendingPages().length, PAGES.length);
  });

  test('the four Phase 1 converters are live', () => {
    for (const path of ['/', '/unicode-to-kruti-dev', '/kruti-dev-to-mangal', '/mangal-to-kruti-dev']) {
      assert.ok(isLive(getPage(path)), `${path} should be live`);
    }
  });

  test('the four Phase 2 DevLys converters are live', () => {
    for (const path of ['/devlys-to-unicode', '/unicode-to-devlys', '/devlys-to-mangal', '/mangal-to-devlys']) {
      assert.ok(isLive(getPage(path)), `${path} should be live`);
    }
  });


  test('every unverified font keeps its pages off', () => {
    for (const key of Object.keys(FONTS).filter((k) => !FONTS[k].accurate)) {
      const pages = PAGES.filter((p) => p.from === key || p.to === key);
      for (const p of pages) {
        assert.equal(isLive(p), false, `${p.path} uses unverified ${key} but is live`);
      }
    }
  });
});

describe('routes match the files on disk', () => {
  const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.astro'));

  /** /store lives in store/index.astro, /store/thanks in store/thanks.astro, /store/<product> in store/[product].astro. */
  const nestedFile = (path) => {
    const [dir, leaf] = path.slice(1).split('/');
    const inside = existsSync(`${PAGES_DIR}/${dir}`) ? readdirSync(`${PAGES_DIR}/${dir}`) : [];
    if (leaf === undefined) return inside.includes('index.astro');
    return inside.includes(`${leaf}.astro`) || inside.some((f) => /^\[\w+\]\.astro$/.test(f));
  };

  test('every page in the table has an .astro file', () => {
    for (const p of PAGES) {
      assert.ok(
        files.includes(routeToFile(p.path)) || nestedFile(p.path),
        `${p.path} has no ${routeToFile(p.path)}`,
      );
    }
  });

  test('every .astro page file has a table entry', () => {
    // 404.astro is the host's error page for every missing URL, not a route.
    // support.astro (linked only from the footer) and links.astro (ToolMitra's
    // Instagram bio link) are never indexed, so they are kept out of the table
    // (and so out of the nav, sitemap and search checks).
    const OFF_TABLE = ['404.astro', 'support.astro', 'links.astro'];
    for (const f of files.filter((x) => !OFF_TABLE.includes(x))) {
      const path = f === 'index.astro' ? '/' : `/${f.replace(/\.astro$/, '')}`;
      assert.ok(getPage(path), `${f} has no routes.js entry`);
    }
  });
});

describe('navigation', () => {
  const MENUS = navMenus();

  test('three menus: converters, typing, tools', () => {
    assert.deepEqual(MENUS.map((m) => m.key), ['converters', 'typing', 'tools']);
  });

  test('every path in NAV_MENUS is a real, live page', () => {
    // navMenus() drops a page that is not live; a typo or a page switched off
    // must fail here instead of quietly vanishing from the header.
    for (const m of NAV_MENUS) {
      for (const path of m.paths) {
        const p = getPage(path);
        assert.ok(p, `${m.key}: ${path} is not in routes.js`);
        assert.ok(isLive(p), `${m.key}: ${path} is not live`);
      }
    }
  });

  test('each menu is short, has no duplicates, and ends at its section of All tools', () => {
    const seen = new Set();
    for (const m of MENUS) {
      assert.ok(m.pages.length >= 3 && m.pages.length <= 8, `${m.key} has ${m.pages.length} items`);
      for (const p of m.pages) {
        assert.ok(!seen.has(p.path), `${p.path} is in two menus`);
        seen.add(p.path);
      }
      assert.equal(m.all, `/all-converters#${m.key}`);
    }
  });

  test('the Converters menu holds converters only, led by the home page', () => {
    const conv = MENUS.find((m) => m.key === 'converters');
    assert.equal(conv.pages[0].path, '/');
    for (const p of conv.pages) assert.ok(p.from && p.to, `${p.path} is not a converter`);
  });

  test('every typing menu page carries a nav subtitle', () => {
    for (const p of MENUS.find((m) => m.key === 'typing').pages) {
      assert.ok(p.navSub, `${p.path} has no nav subtitle`);
    }
  });

  test('every live converter is on All tools, one click from the header', () => {
    const listed = new Set(allGroups().flatMap((g) => g.pages.filter((p) => p.live).map((p) => p.path)));
    for (const p of liveConverters()) assert.ok(listed.has(p.path), `${p.path} is live but not on All tools`);
  });

  test('the Roman typing page is a tool, and indexable', () => {
    const p = getPage('/english-to-hindi-typing');
    assert.ok(p, 'the typing page is missing from routes.js');
    assert.ok(isLive(p));
    assert.ok(navMenus().some((m) => m.pages.some((t) => t.path === p.path)), 'not offered in the nav');
    assert.equal(isIndexable(new URL(p.path, SITE).href), true);
  });

  test('a tool that is not ready is not offered', () => {
    const pretend = { ...getPage('/english-to-hindi-typing'), ready: false };
    assert.equal(isLive(pretend), false);
  });

  test('all-converters lists every converter page exactly once', () => {
    const listed = allGroups().flatMap((g) => g.pages.map((p) => p.path));
    const expected = PAGES.filter((p) => p.kind === 'converter').map((p) => p.path);
    assert.deepEqual([...listed].sort(), [...expected].sort());
  });

  test('all-converters marks liveness correctly', () => {
    for (const g of allGroups()) {
      for (const p of g.pages) assert.equal(p.live, isLive(getPage(p.path)));
    }
  });
});

describe('reverse pages', () => {
  test('reversePage is symmetric where it resolves', () => {
    for (const p of PAGES) {
      const r = reversePage(p);
      if (!r) continue;
      assert.equal(reversePage(r)?.path, p.path, `${p.path} <-> ${r.path} not symmetric`);
    }
  });

  test('every live converter has a live reverse page', () => {
    // Not a hard requirement of the design, but it is true today and a swap
    // link that leads to "coming soon" would be a poor experience.
    for (const p of liveConverters()) {
      const r = reversePage(p);
      assert.ok(r && isLive(r), `${p.path} has no live reverse`);
    }
  });
});

describe('indexing', () => {
  test('isIndexable accepts exactly the live, self-canonical pages', () => {
    for (const p of PAGES) {
      const url = new URL(p.path, SITE).href;
      assert.equal(isIndexable(url), isLive(p) && !p.canonical, `${p.path}`);
    }
  });

  test('a live page that canonicalises elsewhere stays out of the index', () => {
    // It is usable and crawlable - it just must not compete with the page that
    // owns the conversion, or the two split the ranking signal between them.
    const dupes = PAGES.filter((p) => p.canonical);
    assert.ok(dupes.length > 0, 'expected at least one canonicalised page');
    for (const p of dupes) {
      assert.ok(isLive(p), `${p.path}: canonical override on a dead page is pointless`);
      assert.ok(getPage(p.canonical), `${p.path}: canonical target is not a real page`);
      assert.ok(isLive(getPage(p.canonical)), `${p.path}: canonical target is not live`);
      assert.equal(isIndexable(new URL(p.path, SITE).href), false, p.path);
    }
  });

  test('a trailing slash does not change the verdict', () => {
    assert.equal(isIndexable(`${SITE}/kruti-dev-to-mangal/`), true);
    assert.equal(isIndexable(`${SITE}/kruti-dev-to-mangal`), true);
  });

  test('an unknown URL is not indexable', () => {
    assert.equal(isIndexable(`${SITE}/no-such-page`), false);
  });
});

/**
 * The build-time font-key guard. Every entry in PAGES is correct, so the site
 * itself never fires this - which is exactly why the throw path is tested
 * directly rather than left to the one day somebody mistypes a key.
 */
describe('assertKnownFonts - the build-time guard', () => {
  const fonts = { 'kruti-dev': {}, unicode: {} };

  test('the real table passes, which is why importing routes.js works at all', () => {
    assert.doesNotThrow(() => assertKnownFonts(PAGES, FONTS));
  });

  test('an unknown `from` is caught', () => {
    assert.throws(
      () => assertKnownFonts([{ path: '/x', from: 'krooti-dev', to: 'unicode' }], fonts),
      /unknown font "krooti-dev"/,
    );
  });

  test('an unknown `to` is caught as well as an unknown `from`', () => {
    assert.throws(
      () => assertKnownFonts([{ path: '/x', from: 'unicode', to: 'mangel' }], fonts),
      /unknown font "mangel"/,
    );
  });

  test('the message names the page, so the fix is obvious', () => {
    assert.throws(
      () => assertKnownFonts([{ path: '/devlys-to-mangal', from: 'nope' }], fonts),
      /\/devlys-to-mangal/,
    );
  });

  test('a page with no fonts at all is fine', () => {
    // The tool pages - /hindi-keyboard, /hindi-typing-test - carry neither.
    assert.doesNotThrow(() => assertKnownFonts([{ path: '/hindi-keyboard' }], fonts));
  });

  test('it checks every page, not just the first', () => {
    assert.throws(
      () => assertKnownFonts(
        [{ path: '/ok', from: 'unicode' }, { path: '/bad', from: 'ghost' }],
        fonts,
      ),
      /\/bad/,
    );
  });
});

describe('font links under each converter', async () => {
  const { FONT_LINKS, fontLinksFor, liveToolCount, getPage: page, isLive: live, PAGES: all } = await import('./routes.js');

  test('every link points at a live converter', () => {
    for (const l of FONT_LINKS) assert.ok(live(page(l.path)), l.path);
  });

  test('a page never links to itself or to a font it already converts', () => {
    for (const p of all.filter((x) => x.kind === 'converter' && live(x))) {
      for (const l of fontLinksFor(p)) {
        assert.notEqual(l.path, p.path);
        assert.ok(!l.fonts.includes(p.from) && !l.fonts.includes(p.to), `${p.path} -> ${l.key}`);
      }
    }
    assert.ok(!fontLinksFor(page('/')).some((l) => l.key === 'kruti-dev'));
    assert.ok(fontLinksFor(page('/')).some((l) => l.key === 'preeti'));
  });

  test('the tool count is every live page All tools lists', () => {
    assert.ok(liveToolCount() >= 50);
  });
});

describe('removed pages redirect to a live page', () => {
  test('Walkman-Chanakya pairs and Punjabi, in every language, with and without the slash', async () => {
    const { parseRedirects } = await import('../../scripts/serve-dist.mjs');
    const { readFileSync } = await import('node:fs');
    const rules = parseRedirects(readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8'));
    const gone = ['/kruti-dev-to-chanakya', '/chanakya-to-kruti-dev', '/punjabi-font-converter'];
    // Live again, for the newspaper Chanakya font: never redirected.
    for (const path of ['/chanakya-to-unicode', '/unicode-to-chanakya']) {
      assert.ok(isLive(getPage(path)), path);
      for (const lang of ['', '/hi']) assert.equal(rules.get(`${lang}${path}`), undefined, path);
    }
    for (const lang of ['', '/hi', '/bn', '/mr', '/ta', '/gu', '/pa']) {
      for (const path of gone) {
        assert.equal(getPage(path), undefined, path);
        for (const from of [`${lang}${path}`, `${lang}${path}/`]) {
          const rule = rules.get(from);
          assert.ok(rule, from);
          assert.equal(rule.status, 301, from);
          assert.ok(rule.to.startsWith(`${lang}/`), from);
          assert.ok(isLive(getPage(rule.to.slice(lang.length).replace(/\/$/, ''))), `${from} -> ${rule.to}`);
        }
      }
    }
  });
});

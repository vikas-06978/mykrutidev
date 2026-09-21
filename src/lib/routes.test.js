import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PAGES,
  getPage,
  isLive,
  livePages,
  pendingPages,
  liveConverters,
  navGroups,
  allGroups,
  reversePage,
  isIndexable,
  SITE,
} from './routes.js';
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
    // devlys is deliberately not accurate; pretend someone flips ready.
    const pretend = { ...getPage('/devlys-to-unicode'), ready: true };
    assert.equal(isLive(pretend), false);
  });

  test('a converter page with no font pair can never be live', () => {
    const pretend = { ...getPage('/tamil-font-converter'), ready: true };
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

  test('every page in the table has an .astro file', () => {
    for (const p of PAGES) {
      assert.ok(
        files.includes(routeToFile(p.path)),
        `${p.path} has no ${routeToFile(p.path)}`,
      );
    }
  });

  test('every .astro page file has a table entry', () => {
    for (const f of files) {
      const path = f === 'index.astro' ? '/' : `/${f.replace(/\.astro$/, '')}`;
      assert.ok(getPage(path), `${f} has no routes.js entry`);
    }
  });
});

describe('navigation', () => {
  test('nav contains only converter pages', () => {
    for (const g of navGroups()) {
      for (const p of g.pages) assert.equal(p.kind, 'converter', `${p.path}`);
    }
  });

  test('every nav group has at least one live page', () => {
    // A menu of nothing but "soon" rows is a dead end.
    for (const g of navGroups()) {
      assert.ok(
        g.pages.some((p) => p.live),
        `nav group "${g.name}" has no live page`,
      );
    }
  });

  test('nav liveness flags match isLive, so nothing unusable gets linked', () => {
    for (const g of navGroups()) {
      for (const p of g.pages) {
        assert.equal(p.live, isLive(getPage(p.path)), `${p.path}`);
      }
    }
  });

  test('nav lists live pages before pending ones within a group', () => {
    for (const g of navGroups()) {
      const firstPending = g.pages.findIndex((p) => !p.live);
      if (firstPending === -1) continue;
      assert.ok(
        g.pages.slice(firstPending).every((p) => !p.live),
        `nav group "${g.name}" interleaves live and pending items`,
      );
    }
  });

  test('nav groups are non-empty and uniquely named', () => {
    const names = navGroups().map((g) => g.name);
    assert.equal(new Set(names).size, names.length);
    for (const g of navGroups()) assert.ok(g.pages.length > 0);
  });

  test('every live converter is reachable from the nav', () => {
    const reachable = new Set(
      navGroups().flatMap((g) => g.pages.filter((p) => p.live).map((p) => p.path)),
    );
    for (const p of liveConverters()) {
      assert.ok(reachable.has(p.path), `${p.path} is live but not in any nav group`);
    }
  });

  test('the nav groups match the example layout: Kruti Dev, Unicode / Hindi, Mangal', () => {
    assert.deepEqual(
      navGroups().map((g) => g.name),
      ['Kruti Dev', 'Unicode / Hindi', 'Mangal'],
    );
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
    // It is usable and crawlable — it just must not compete with the page that
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
    assert.equal(isIndexable(`${SITE}/devlys-to-unicode/`), false);
  });

  test('an unknown URL is not indexable', () => {
    assert.equal(isIndexable(`${SITE}/no-such-page`), false);
  });
});

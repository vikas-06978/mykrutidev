/**
 * The SEO gate. Runs after every `npm run build` (postbuild), so a build that
 * would ship any of these problems fails:
 *
 *   - duplicate <title> or meta description between indexable pages
 *   - a page without exactly one <h1>
 *   - an <img> without alt text
 *   - an internal link to a page or file that was not built
 *   - an internal page link not in the published trailing-slash form
 *   - an indexable page missing from the sitemap, or a sitemap URL that is
 *     not an indexable page
 *   - a missing or one-sided hreflang pair, or a wrong canonical
 *   - a page more than two clicks from the home page
 *   - a missing Open Graph image, or broken structured data
 *   - a search landing page or guide outside its word range
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE } from '../src/lib/routes.js';
import { GUIDES, guidePath } from '../src/lib/guides.js';
import en from '../src/i18n/en.json' with { type: 'json' };
import hi from '../src/i18n/hi.json' with { type: 'json' };

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });

/** dist/hi/x/index.html -> "/hi/x/"; dist/index.html -> "/"; dist/404.html -> "/404.html" */
const urlOf = (file) => {
  const rel = relative(DIST, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  return rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
};

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : undefined;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b(?:[^>"]|"[^"]*")*>`, 'g'))].map((m) => m[0]);
const meta = (html, key, value) => {
  const tag = tags(html, 'meta').find((t) => attr(t, key) === value);
  return tag ? attr(tag, 'content') : undefined;
};
const linkRel = (html, rel) => tags(html, 'link').filter((t) => attr(t, 'rel') === rel);
const abs = (p) => new URL(p, SITE).href;
/** Internal link targets on a page, without #fragment or ?query. */
const internal = (html) =>
  tags(html, 'a')
    .map((t) => attr(t, 'href'))
    .filter((h) => h && h.startsWith('/') && !h.startsWith('//'))
    .map((h) => h.split('#')[0].split('?')[0])
    .filter(Boolean);
const isFile = (h) => /\.[a-z0-9]+$/i.test(h);
const pathOf = (url) => new URL(url).pathname;

let pages; // Map<url, html>, every built HTML file
let indexable; // urls of pages without noindex
let sitemap; // Set of urls from the sitemap

before(() => {
  assert.ok(existsSync(DIST), 'dist/ not found - run `astro build` first');
  pages = new Map(walk(DIST).map((f) => [urlOf(f), readFileSync(f, 'utf8')]));
  indexable = [...pages].filter(([, html]) => !/<meta name="robots" content="noindex/.test(html)).map(([u]) => u);
  const index = readFileSync(join(DIST, 'sitemap-index.xml'), 'utf8');
  const parts = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => pathOf(m[1]).slice(1));
  assert.ok(parts.length > 0, 'sitemap-index.xml lists no sitemaps');
  sitemap = new Set(
    parts.flatMap((f) => [...readFileSync(join(DIST, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])),
  );
});

describe('titles, headings and images', () => {
  test('no two indexable pages share a <title> or a meta description', () => {
    for (const field of ['title', 'description']) {
      const seen = new Map();
      for (const u of indexable) {
        const html = pages.get(u);
        const v =
          field === 'title' ? decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '') : meta(html, 'name', 'description');
        assert.ok(v?.trim(), `${u}: no ${field}`);
        assert.ok(!seen.has(v), `${u} has the same ${field} as ${seen.get(v)}: "${v}"`);
        seen.set(v, u);
      }
    }
  });

  test('every page has exactly one <h1>', () => {
    for (const [u, html] of pages) assert.equal((html.match(/<h1\b/g) ?? []).length, 1, u);
  });

  test('every image has alt text', () => {
    for (const [u, html] of pages) {
      for (const img of tags(html, 'img')) {
        if (attr(img, 'aria-hidden') === 'true') continue;
        assert.ok(attr(img, 'alt')?.trim(), `${u}: ${img.slice(0, 120)}`);
      }
    }
  });
});

describe('links', () => {

  test('every internal link points at something that was built', () => {
    let n = 0;
    for (const [u, html] of pages) {
      for (const h of internal(html)) {
        n++;
        const ok = isFile(h) ? existsSync(join(DIST, decodeURIComponent(h))) : pages.has(h);
        assert.ok(ok, `${u} links to ${h}, which does not exist`);
      }
    }
    assert.ok(n > 1000, `only ${n} internal links found`);
  });

  test('page links use the published form, with the trailing slash', () => {
    for (const [u, html] of pages) {
      for (const h of internal(html)) {
        if (isFile(h)) continue;
        assert.ok(h === '/' || h.endsWith('/'), `${u} links to ${h} without the trailing slash`);
      }
    }
  });

  test('every indexable page is at most two clicks from its language\'s home page', () => {
    // Pages reachable in two clicks from `home`.
    const near = (home) => {
      const seen = new Set([home]);
      let frontier = [home];
      for (let d = 1; d <= 2; d++) {
        const next = [];
        for (const u of frontier) {
          for (const h of internal(pages.get(u))) {
            if (pages.has(h) && !seen.has(h)) {
              seen.add(h);
              next.push(h);
            }
          }
        }
        frontier = next;
      }
      return seen;
    };
    const reached = new Set([...near('/'), ...near('/hi/')]);
    // A page that canonicalises to another (the hub that repeats the home
    // page's converter) counts as reached when its canonical is.
    const far = indexable.filter((u) => {
      if (reached.has(u)) return false;
      const canonical = attr(linkRel(pages.get(u), 'canonical')[0] ?? '', 'href');
      return !(canonical && canonical !== abs(u) && reached.has(pathOf(canonical)));
    });
    assert.deepEqual(far, [], 'more than two clicks from / (English) or /hi/ (Hindi)');
  });
});

describe('sitemap, canonical and hreflang', () => {
  test('robots.txt points at the sitemap index', () => {
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
    assert.match(robots, new RegExp(`Sitemap: ${abs('/sitemap-index.xml')}`));
  });

  test('every indexable page is in the sitemap, and the sitemap lists only indexable pages', () => {
    const want = indexable.filter((u) => {
      const canonical = attr(linkRel(pages.get(u), 'canonical')[0] ?? '', 'href');
      return canonical === abs(u); // a page canonicalised elsewhere stays out
    });
    for (const u of want) assert.ok(sitemap.has(abs(u)), `${u} is missing from the sitemap`);
    for (const url of sitemap) assert.ok(want.includes(pathOf(url)), `sitemap lists ${url}, which is not an indexable page`);
    assert.ok(want.some((u) => u.startsWith('/hi/')), 'no Hindi pages in the sitemap');
  });

  test('every page has one absolute, trailing-slash canonical that exists', () => {
    for (const [u, html] of pages) {
      if (u === '/404.html') continue;
      const links = linkRel(html, 'canonical');
      assert.equal(links.length, 1, `${u}: canonical links`);
      const href = attr(links[0], 'href');
      assert.ok(href.startsWith(`${SITE}/`) && href.endsWith('/'), `${u}: canonical ${href}`);
      assert.ok(pages.has(pathOf(href)), `${u}: canonical ${href} was not built`);
    }
  });

  test('hreflang: en, hi and x-default on every page, each pair pointing at each other', () => {
    for (const [u, html] of pages) {
      if (u === '/404.html') continue;
      const alt = Object.fromEntries(linkRel(html, 'alternate').map((t) => [attr(t, 'hreflang'), attr(t, 'href')]));
      assert.deepEqual(Object.keys(alt).sort(), ['en', 'hi', 'x-default'], u);
      assert.equal(alt['x-default'], alt.en, `${u}: x-default`);
      assert.ok([alt.en, alt.hi].includes(abs(u)), `${u}: its own URL is not one of its alternates`);
      for (const lang of ['en', 'hi']) {
        const twin = pathOf(alt[lang]);
        assert.ok(pages.has(twin), `${u}: hreflang ${lang} ${alt[lang]} was not built`);
        const back = Object.fromEntries(
          linkRel(pages.get(twin), 'alternate').map((t) => [attr(t, 'hreflang'), attr(t, 'href')]),
        );
        assert.deepEqual(back, alt, `${u} and ${twin} disagree about their pair`);
      }
    }
  });

  test('the 404 page is never indexed and names no canonical', () => {
    const html = pages.get('/404.html');
    assert.ok(html, 'dist/404.html was not built');
    assert.match(html, /<meta name="robots" content="noindex/);
    assert.equal(linkRel(html, 'canonical').length, 0);
    assert.ok(internal(html).length >= 6, '404 page offers too few links');
  });
});

describe('sharing previews and structured data', () => {
  test('every page has an Open Graph image that exists, and a large Twitter card', () => {
    for (const [u, html] of pages) {
      const img = meta(html, 'property', 'og:image');
      assert.ok(img?.startsWith(`${SITE}/og/`) && img.endsWith('.png'), `${u}: og:image ${img}`);
      assert.ok(existsSync(join(DIST, pathOf(img))), `${u}: ${img} was not built`);
      assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image', u);
      assert.equal(meta(html, 'name', 'twitter:image'), img, u);
      assert.ok(meta(html, 'property', 'og:image:alt'), `${u}: og:image:alt`);
    }
  });

  test('indexable pages each have their own Open Graph image', () => {
    const seen = new Map();
    for (const u of indexable) {
      const canonical = attr(linkRel(pages.get(u), 'canonical')[0] ?? '', 'href');
      if (canonical !== abs(u)) continue;
      const img = meta(pages.get(u), 'property', 'og:image');
      assert.ok(!seen.has(img), `${u} shares ${img} with ${seen.get(img)}`);
      seen.set(img, u);
    }
  });

  const jsonLd = (html) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

  test('structured data parses, and every page has a BreadcrumbList that ends at itself', () => {
    for (const [u, html] of pages) {
      const data = jsonLd(html); // throws on invalid JSON
      if (u === '/404.html') continue;
      const crumbs = data.find((d) => d['@type'] === 'BreadcrumbList');
      assert.ok(crumbs, `${u}: no BreadcrumbList`);
      const items = crumbs.itemListElement;
      assert.equal(items.at(-1).item, abs(u), `${u}: breadcrumb does not end at the page`);
      items.forEach((it, i) => assert.equal(it.position, i + 1, `${u}: breadcrumb positions`));
    }
  });

  test('Organization and WebSite on the home pages; Article on every guide', () => {
    for (const u of ['/', '/hi/']) {
      const types = jsonLd(pages.get(u)).map((d) => d['@type']);
      assert.ok(types.includes('Organization') && types.includes('WebSite'), `${u}: ${types}`);
    }
    for (const g of GUIDES) {
      for (const u of [`${guidePath(g)}/`, `/hi${guidePath(g)}/`]) {
        const article = jsonLd(pages.get(u)).find((d) => d['@type'] === 'Article');
        assert.ok(article, `${u}: no Article`);
        assert.equal(article.dateModified, g.updated, u);
        assert.ok(article.author?.name && article.headline && article.image, `${u}: Article fields`);
      }
    }
  });

  test('visible breadcrumbs on every page but the home pages and the 404', () => {
    for (const [u, html] of pages) {
      const home = u === '/' || u === '/hi/' || u === '/404.html';
      assert.equal(/<nav\b[^>]*\sdata-breadcrumbs\b/.test(html), !home, u);
    }
  });
});

describe('content length', () => {
  const words = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\{\{[^}]+\}\}/g, ' ').split(/\s+/).filter(Boolean).length;
  const below = (p) =>
    words(
      [
        ...(p.howTo ? [...p.howTo.steps, p.howTo.tip] : []),
        ...(p.problems ?? []).flatMap((x) => [x.problem, x.fix]),
        ...(p.faq ?? []).flatMap((f) => [f.q, f.a]),
        ...(p.body ?? []),
      ].join(' '),
    );
  // The pages built to answer one search each: tool on top, then 600-1000
  // words of help below it (how to use, problems & fixes, FAQ, article).
  const LANDING = [
    '/',
    '/unicode-to-kruti-dev',
    '/kruti-dev-010-font',
    '/mangal-to-kruti-dev',
    '/hindi-typing-test',
    '/hindi-typing-test-for-exams',
    '/remington-hindi-keyboard',
    '/english-to-hindi-typing',
    '/how-to-type-hindi-in-ms-word',
  ];

  test('search landing pages: 600-1000 words below the tool, with problems, FAQ and how-to', () => {
    for (const [lang, d] of [['en', en], ['hi', hi]]) {
      for (const path of LANDING) {
        const p = d.pages[path];
        const n = below(p);
        assert.ok(n >= 600 && n <= 1000, `${lang} ${path}: ${n} words`);
        assert.ok(p.howTo?.steps?.length === 3, `${lang} ${path}: how to use`);
        assert.ok(p.problems?.length >= 3, `${lang} ${path}: problems & fixes`);
        assert.ok(p.faq?.length >= 3, `${lang} ${path}: FAQ`);
      }
    }
  });

  test('guides: at least 550 words of article each, in both languages', () => {
    for (const [lang, d] of [['en', en], ['hi', hi]]) {
      for (const g of GUIDES) assert.ok(below(d.articles[g.slug]) >= 550, `${lang} ${g.slug}: ${below(d.articles[g.slug])}`);
    }
  });
});

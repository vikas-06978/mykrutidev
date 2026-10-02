/**
 * Single source of truth for the page cluster.
 *
 * Five things read this array and nothing else:
 *   1. the sitemap `filter()` in astro.config.mjs   (only live pages)
 *   2. Header.astro's nav                           (only live pages, grouped)
 *   3. the interlink block in ConverterPage.astro   (`related`)
 *   4. each page's `noindex` flag                   (everything not live)
 *   5. /all-converters                              (the whole table, with status)
 *
 * robots.txt deliberately does NOT: a noindex page must stay crawlable, or
 * the crawler never reads its noindex (see src/pages/robots.txt.ts).
 *
 * Adding a page = one entry here + one .astro file + its text in
 * src/i18n/en.json and hi.json (under `pages`).
 *
 * The WORDS of a page - nav label, h1, title, description, note - are not in
 * this file. They live in src/i18n/en.json so there is one English source that
 * the Hindi file mirrors key for key; they are merged back onto each entry
 * below, so `page.h1` and friends still read the English text.
 *
 * ---------------------------------------------------------------------------
 * `ready` IS THE FLAG. Set it true to activate a page.
 *
 * It is necessary but NOT sufficient: isLive() also requires both of the page's
 * fonts to carry `accurate: true` in fontMaps.js. So a converter page cannot go
 * live on an unverified mapping even if someone flips `ready` by mistake - the
 * page keeps rendering "coming soon" until the map is actually done and tested.
 * That is deliberate. Accuracy is the entire product.
 *
 * To activate a converter page:
 *   1. fill in its map in fontMaps.js
 *   2. add fixtures to __fixtures__/ and get `npm test` green
 *   3. set `accurate: true` on the font
 *   4. set `ready: true` here, and write the page copy
 * ---------------------------------------------------------------------------
 */

import { FONTS, isPairAccurate } from './fontMaps.js';
import { guideRoutes } from './guides.js';
import en from '../i18n/en.json' with { type: 'json' };

export const SITE = 'https://mykrutidev.com';

/**
 * @typedef {object} Page
 * @property {string}  path
 * @property {boolean} ready     author's switch - see the note above
 * @property {'converter'|'content'} kind  decides which "not ready" panel shows
 * @property {string|null} from  font key, null on content pages
 * @property {string|null} to
 * @property {string}  group     nav grouping (by source font family)
 * @property {string}  nav       short label for the nav menu
 * @property {string}  h1
 * @property {string}  title
 * @property {string}  description
 * @property {string[]} related
 * @property {string}  [note]    why it is not ready yet, shown on the panel
 * @property {boolean} [beta]    live, but shows a Beta badge beside the h1
 * @property {string}  [betaNote] one line under the badge saying what it is for
 * @property {boolean} [documents] offer "Convert a document" under the boxes
 * @property {boolean} [app]  a content page that embeds a tool (PageView's TOOLS)
 *   without being a menubar `tool` itself: it still gets WebApplication data
 */

/** @type {Page[]} */
export const PAGES = [
  // ==========================================================================
  // LIVE - mapping verified against real documents and covered by fixtures
  // ==========================================================================
  {
    path: '/',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'unicode',
    group: 'Kruti Dev',
    related: ['/unicode-to-kruti-dev', '/kruti-dev-to-mangal', '/mangal-to-kruti-dev'],
    documents: true,
  },
  {
    path: '/unicode-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'kruti-dev',
    group: 'Unicode / Hindi',
    related: ['/', '/mangal-to-kruti-dev', '/kruti-dev-to-mangal'],
    documents: true,
  },
  {
    path: '/kruti-dev-to-mangal',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'mangal',
    group: 'Kruti Dev',
    related: ['/', '/mangal-to-kruti-dev', '/unicode-to-kruti-dev'],
    documents: true,
  },
  {
    path: '/mangal-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'mangal',
    to: 'kruti-dev',
    group: 'Mangal',
    related: ['/kruti-dev-to-mangal', '/unicode-to-kruti-dev', '/'],
    documents: true,
  },
  {
    path: '/english-to-hindi-typing',
    ready: true,
    // Not a converter: it does not map one font onto another, it guesses Hindi
    // from an English spelling. `kind: 'content'` keeps it out of the converter
    // nav groups and the reverse-page graph, where it has no meaning.
    kind: 'content',
    from: null,
    to: null,
    // Its own top-level nav item rather than a group, because it answers a
    // different question from every other page here: "I do not have a Hindi
    // keyboard" rather than "I have a file in the wrong font".
    tool: true,
    group: 'More',
    related: ['/hindi-keyboard', '/hindi-typing-test', '/unicode-to-kruti-dev'],
  },
  {
    path: '/hindi-typing-test',
    ready: true,
    // Not a converter: nothing is mapped onto anything. It scores keystrokes
    // against a passage, and the Kruti Dev half of it only borrows the engine
    // at build time to produce the target text.
    kind: 'content',
    from: null,
    to: null,
    tool: true,
    group: 'More',
    related: ['/hindi-keyboard', '/english-to-hindi-typing', '/unicode-to-kruti-dev'],
  },
  {
    path: '/hindi-keyboard',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    tool: true,
    group: 'More',
    related: ['/hindi-typing-test', '/english-to-hindi-typing', '/unicode-to-kruti-dev'],
  },
  {
    path: '/all-converters',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    related: ['/', '/unicode-to-kruti-dev', '/kruti-dev-to-mangal'],
  },

  // ---- DevLys: layout verified against Kruti Dev 010, outline by outline ---
  {
    path: '/devlys-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'devlys',
    to: 'unicode',
    group: 'DevLys',
    related: ['/unicode-to-devlys', '/devlys-to-mangal', '/'],
  },
  {
    path: '/unicode-to-devlys',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'devlys',
    group: 'Unicode / Hindi',
    related: ['/devlys-to-unicode', '/mangal-to-devlys', '/unicode-to-kruti-dev'],
  },
  {
    path: '/devlys-to-mangal',
    ready: true,
    kind: 'converter',
    from: 'devlys',
    to: 'mangal',
    group: 'DevLys',
    related: ['/devlys-to-unicode', '/mangal-to-devlys', '/kruti-dev-to-mangal'],
  },
  {
    path: '/mangal-to-devlys',
    ready: true,
    kind: 'converter',
    from: 'mangal',
    to: 'devlys',
    group: 'Mangal',
    related: ['/devlys-to-mangal', '/unicode-to-devlys', '/mangal-to-kruti-dev'],
  },

  // ---- Abbasi Chanakya New: built from the real font file, glyph by glyph ---
  // Filed under "Chanakya" because that is what its visitors call the font, but
  // it is its own map and its own font key. The generic Chanakya pages below
  // stay "coming soon": that layout differs from this one in several keys.
  {
    path: '/abbasi-chanakya-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'abbasi-chanakya',
    to: 'unicode',
    group: 'Chanakya',
    related: ['/unicode-to-abbasi-chanakya', '/', '/devlys-to-unicode'],
    // Not yet checked against a real document typed in this font - see the
    // handoff in vendor/fonts/Abbasi Chanakya New/. Drop both once it has been.
    beta: true,
  },
  {
    path: '/unicode-to-abbasi-chanakya',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'abbasi-chanakya',
    // Under "Chanakya" rather than "Unicode / Hindi" so both Abbasi pages sit
    // together in one dropdown.
    group: 'Chanakya',
    related: ['/abbasi-chanakya-to-unicode', '/unicode-to-kruti-dev', '/unicode-to-devlys'],
    beta: true,
  },

  // ---- Legacy <-> legacy: no new mapping, just two verified ones chained ----
  // convert() routes legacy -> legacy through Unicode, so each of these is as
  // accurate as its two halves, which are already live above. A pair with
  // Abbasi Chanakya inherits its Beta badge.
  {
    path: '/kruti-dev-to-devlys',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'devlys',
    group: 'Kruti Dev',
    related: ['/devlys-to-kruti-dev', '/devlys-to-unicode', '/'],
  },
  {
    path: '/devlys-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'devlys',
    to: 'kruti-dev',
    group: 'DevLys',
    related: ['/kruti-dev-to-devlys', '/devlys-to-unicode', '/unicode-to-kruti-dev'],
  },
  {
    path: '/kruti-dev-to-abbasi-chanakya',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'abbasi-chanakya',
    group: 'Kruti Dev',
    related: ['/abbasi-chanakya-to-kruti-dev', '/unicode-to-abbasi-chanakya', '/'],
    beta: true,
  },
  {
    path: '/abbasi-chanakya-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'abbasi-chanakya',
    to: 'kruti-dev',
    group: 'Chanakya',
    related: ['/kruti-dev-to-abbasi-chanakya', '/abbasi-chanakya-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/devlys-to-abbasi-chanakya',
    ready: true,
    kind: 'converter',
    from: 'devlys',
    to: 'abbasi-chanakya',
    group: 'DevLys',
    related: ['/abbasi-chanakya-to-devlys', '/unicode-to-abbasi-chanakya', '/devlys-to-unicode'],
    beta: true,
  },
  {
    path: '/abbasi-chanakya-to-devlys',
    ready: true,
    kind: 'converter',
    from: 'abbasi-chanakya',
    to: 'devlys',
    group: 'Chanakya',
    related: ['/devlys-to-abbasi-chanakya', '/abbasi-chanakya-to-unicode', '/unicode-to-devlys'],
    beta: true,
  },
  {
    path: '/mangal-to-abbasi-chanakya',
    ready: true,
    kind: 'converter',
    from: 'mangal',
    to: 'abbasi-chanakya',
    group: 'Mangal',
    related: ['/abbasi-chanakya-to-mangal', '/unicode-to-abbasi-chanakya', '/mangal-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/abbasi-chanakya-to-mangal',
    ready: true,
    kind: 'converter',
    from: 'abbasi-chanakya',
    to: 'mangal',
    group: 'Chanakya',
    related: ['/mangal-to-abbasi-chanakya', '/abbasi-chanakya-to-unicode', '/kruti-dev-to-mangal'],
    beta: true,
  },

  // ==========================================================================
  // SCAFFOLDED - routes and SEO exist, mapping does not. Coming soon panel.
  // ==========================================================================

  // ---- Chanakya: a genuinely different vendor layout, map is empty ---------
  {
    path: '/chanakya-to-unicode',
    ready: false,
    kind: 'converter',
    from: 'chanakya',
    to: 'unicode',
    group: 'Chanakya',
    related: ['/unicode-to-chanakya', '/chanakya-to-kruti-dev', '/'],
  },
  {
    path: '/unicode-to-chanakya',
    ready: false,
    kind: 'converter',
    from: 'unicode',
    to: 'chanakya',
    group: 'Unicode / Hindi',
    related: ['/chanakya-to-unicode', '/'],
  },
  {
    path: '/kruti-dev-to-chanakya',
    ready: false,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'chanakya',
    group: 'Kruti Dev',
    related: ['/chanakya-to-kruti-dev', '/chanakya-to-unicode', '/'],
  },
  {
    path: '/chanakya-to-kruti-dev',
    ready: false,
    kind: 'converter',
    from: 'chanakya',
    to: 'kruti-dev',
    group: 'Chanakya',
    related: ['/kruti-dev-to-chanakya', '/chanakya-to-unicode'],
  },

  // ---- Shusha: older Hindi DTP font, map is empty --------------------------
  {
    path: '/shusha-to-unicode',
    ready: false,
    kind: 'converter',
    from: 'shusha',
    to: 'unicode',
    group: 'Shusha',
    related: ['/unicode-to-shusha', '/'],
  },
  {
    path: '/unicode-to-shusha',
    ready: false,
    kind: 'converter',
    from: 'unicode',
    to: 'shusha',
    group: 'Unicode / Hindi',
    related: ['/shusha-to-unicode', '/'],
  },

  // ---- Preeti: Nepali, not Hindi. Map read off the font file, glyph by glyph;
  // Beta until a real Preeti document has been run through it.
  {
    path: '/preeti-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'preeti',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-preeti', '/preeti-to-kruti-dev', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-preeti',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'preeti',
    group: 'Nepali',
    related: ['/preeti-to-unicode', '/preeti-to-kruti-dev', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/preeti-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'preeti',
    to: 'kruti-dev',
    group: 'Nepali',
    related: ['/kruti-dev-to-preeti', '/preeti-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/kruti-dev-to-preeti',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'preeti',
    // Under Nepali rather than Kruti Dev, so the four Preeti pages share one menu.
    group: 'Nepali',
    related: ['/preeti-to-kruti-dev', '/unicode-to-preeti', '/'],
    beta: true,
  },

  // ==========================================================================
  // PLANNED - other Indic scripts. Routes only, no mapping work started.
  // Activate only after a keyword-volume check AND a tested mapping.
  // ==========================================================================
  {
    path: '/marathi-font-converter',
    ready: false,
    kind: 'converter',
    // Null on purpose, even though Marathi is Devanagari and the Kruti Dev map
    // would "work". Pointing it at a Hindi-verified map would let this page go
    // live on a mapping nobody has checked against Marathi text.
    from: null,
    to: null,
    group: 'Other scripts',
    related: ['/', '/all-converters'],
  },
  {
    path: '/gujarati-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    related: ['/all-converters'],
  },
  {
    path: '/tamil-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    related: ['/all-converters'],
  },
  {
    path: '/bengali-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    related: ['/all-converters'],
  },
  {
    path: '/punjabi-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    related: ['/all-converters'],
  },

  // ==========================================================================
  // CONTENT - reference pages, not converters. Copy still to be written.
  // ==========================================================================
  {
    path: '/hindi-font-converter',
    ready: true,
    // A hub page that also converts. kind stays 'content' so it is not listed
    // as a converter in the nav or the footer - those are keyed by direction,
    // and this page's direction is already "/".
    kind: 'content',
    from: 'kruti-dev',
    to: 'unicode',
    // Same pair as "/", so it must not compete with it in search. Live and
    // fully usable, canonicalised to the homepage, kept out of the sitemap.
    canonical: '/',
    group: 'More',
    related: ['/', '/all-converters', '/unicode-to-kruti-dev'],
  },
  // ---- Search landing pages: each answers one query with the tool that
  // solves it on top, then how-to, problems, FAQ and three related tools.
  {
    path: '/kruti-dev-010-font',
    ready: true,
    // Hosts the Kruti Dev -> Unicode converter because that is what someone
    // without the font needs, but the page is ABOUT the font (install, check,
    // what it is), so it is its own canonical and not a duplicate of "/".
    kind: 'content',
    from: 'kruti-dev',
    to: 'unicode',
    group: 'More',
    related: ['/', '/kruti-dev-keyboard', '/unicode-to-kruti-dev'],
  },
  {
    path: '/hindi-typing-test-for-exams',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    tool: true,
    group: 'More',
    related: ['/hindi-typing-test', '/hindi-typing-practice-sheets', '/remington-hindi-keyboard'],
  },
  {
    path: '/remington-hindi-keyboard',
    ready: true,
    // Type on your own keyboard in the Remington layout; the converter turns
    // the keystrokes into Unicode Hindi as you go. Same converter as "/",
    // different question (the layout, not a file), so its own canonical.
    kind: 'content',
    from: 'kruti-dev',
    to: 'unicode',
    // Not a menu `tool`: tools have no source font, and this page has one.
    // It is linked from the footer, the tutor and the keyboard chart instead.
    group: 'More',
    related: ['/kruti-dev-keyboard', '/hindi-typing-test', '/hindi-keyboard'],
  },
  {
    path: '/how-to-type-hindi-in-ms-word',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    // English to Hindi typing sits at the top of this page (PageView's TOOLS).
    app: true,
    group: 'More',
    related: ['/english-to-hindi-typing', '/unicode-to-kruti-dev', '/hindi-keyboard'],
  },
  // ---- Printables: an HTML page + a PDF each, built from the tutor's data
  // (src/lib/printables.js). The keyboard chart carries the one menu entry;
  // every printable page lists the other four.
  {
    path: '/kruti-dev-keyboard',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    menu: true,
    group: 'More',
    related: ['/hindi-typing-test', '/hindi-typing-finger-chart', '/hindi-keyboard'],
  },
  {
    path: '/hindi-typing-finger-chart',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    group: 'More',
    related: ['/hindi-typing-test', '/kruti-dev-keyboard', '/hindi-typing-practice-sheets'],
  },
  {
    path: '/hindi-typing-practice-sheets',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    group: 'More',
    related: ['/hindi-typing-test', '/hindi-typing-progress-log', '/kruti-dev-keyboard'],
  },
  {
    path: '/kruti-dev-matra-chart',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    group: 'More',
    related: ['/hindi-typing-test', '/unicode-to-kruti-dev', '/kruti-dev-keyboard'],
  },
  {
    path: '/hindi-typing-progress-log',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    group: 'More',
    related: ['/hindi-typing-test', '/hindi-typing-practice-sheets', '/english-to-hindi-typing'],
  },
  // ---- Everyday Hindi tools (HindiTool.astro, src/lib/toolPages.js). Each has
  // exactly one right answer, so each is live without a Beta badge.
  {
    path: '/number-to-hindi-words',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/amount-in-words', '/english-to-hindi-numbers', '/english-date-to-hindi'],
  },
  {
    path: '/amount-in-words',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/number-to-hindi-words', '/hindi-to-english-numbers', '/english-date-to-hindi'],
  },
  {
    path: '/hindi-to-english-numbers',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/english-to-hindi-numbers', '/number-to-hindi-words', '/hindi-word-counter'],
  },
  {
    path: '/english-to-hindi-numbers',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-english-numbers', '/english-date-to-hindi', '/number-to-hindi-words'],
  },
  {
    path: '/english-date-to-hindi',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/english-to-hindi-numbers', '/number-to-hindi-words', '/hindi-word-counter'],
  },
  {
    path: '/hindi-word-counter',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-typing-test', '/hindi-to-iast', '/english-to-hindi-typing'],
  },
  {
    path: '/hindi-to-iast',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-gujarati-script', '/hindi-word-counter', '/english-to-hindi-typing'],
  },
  {
    path: '/hindi-to-gujarati-script',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-bengali-script', '/hindi-to-odia-script', '/hindi-to-iast'],
  },
  {
    path: '/hindi-to-bengali-script',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-odia-script', '/hindi-to-telugu-script', '/hindi-to-iast'],
  },
  {
    path: '/hindi-to-odia-script',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-telugu-script', '/hindi-to-kannada-script', '/hindi-to-iast'],
  },
  {
    path: '/hindi-to-telugu-script',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-kannada-script', '/hindi-to-malayalam-script', '/hindi-to-iast'],
  },
  {
    path: '/hindi-to-kannada-script',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-malayalam-script', '/hindi-to-gujarati-script', '/hindi-to-iast'],
  },
  {
    path: '/hindi-to-malayalam-script',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    app: true,
    group: 'More',
    related: ['/hindi-to-gujarati-script', '/hindi-to-bengali-script', '/hindi-to-iast'],
  },
  // ---- Who runs the site and on what terms (linked from every footer).
  {
    path: '/about',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/', '/hindi-typing-test', '/all-converters'],
  },
  {
    path: '/contact',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/about', '/privacy-policy', '/terms'],
  },
  {
    path: '/privacy-policy',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/', '/english-to-hindi-typing', '/terms'],
  },
  {
    path: '/terms',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/about', '/privacy-policy', '/contact'],
  },
];

/** The contact address printed on /contact and in Organization data. */
export const CONTACT_EMAIL = 'contact@mykrutidev.com';

/** The fields that are words rather than structure - see the note at the top. */
const TEXT_FIELDS = ['nav', 'navSub', 'h1', 'title', 'description', 'note', 'betaNote'];

for (const p of PAGES) {
  const text = en.pages?.[p.path];
  if (!text) throw new Error(`routes.js: ${p.path} has no text in src/i18n/en.json`);
  for (const f of TEXT_FIELDS) if (text[f] !== undefined) p[f] = text[f];
}

/** @type {Map<string, Page>} */
const BY_PATH = new Map(PAGES.map((p) => [p.path, p]));

export const getPage = (path) => BY_PATH.get(path);

/**
 * The real gate. `ready` is the author's intent; this also insists the mapping
 * behind it is verified, so an unverified font can never reach a live page.
 */
export function isLive(page) {
  if (!page?.ready) return false;
  if (page.kind === 'content') return true;
  if (!page.from || !page.to) return false;
  return isPairAccurate(page.from, page.to);
}

/**
 * The one status flag every list on the site reads: 'live' or 'soon'.
 *
 * Derived from isLive(), never hand-set, so a page cannot show as live on an
 * unverified mapping. Every "Soon" badge (header dropdowns, mobile menu,
 * /all-converters, the related-converter cards) renders from this through
 * SoonBadge.astro - none is placed by hand.
 *
 * @returns {'live' | 'soon'}
 */
export const statusOf = (page) => (isLive(page) ? 'live' : 'soon');

export const livePages = () => PAGES.filter(isLive);
export const pendingPages = () => PAGES.filter((p) => !isLive(p));
export const liveConverters = () =>
  PAGES.filter((p) => isLive(p) && p.kind === 'converter');

/**
 * Every converter page, bucketed by its `group` and tagged with its status.
 * `live` is the same fact as a boolean, kept for the code that sorts on it.
 */
function groupConverters() {
  const groups = new Map();
  for (const p of PAGES) {
    if (p.kind !== 'converter') continue;
    if (!groups.has(p.group)) groups.set(p.group, []);
    const status = statusOf(p);
    groups.get(p.group).push({ ...p, status, live: status === 'live' });
  }
  return groups;
}

/**
 * Nav menus, grouped by source font family.
 *
 * A group only appears if it has at least one live page: a menu containing
 * nothing but "soon" items is a dead end. Within a group every converter is
 * listed, live ones first, and `live` tells the menu whether to render a link
 * or a greyed-out placeholder - so the menu doubles as a roadmap without ever
 * linking somewhere unusable.
 */
export function navGroups() {
  return [...groupConverters()]
    .filter(([, pages]) => pages.some((p) => p.live))
    .map(([name, pages]) => ({
      name,
      pages: [...pages].sort((a, b) => Number(b.live) - Number(a.live)),
    }));
}

/**
 * Live pages that sit in the menubar as their own item rather than inside a
 * source-font group.
 *
 * A converter is filed under the font you already have, because that is the
 * question its visitor arrives with. A tool like Roman typing has no source
 * font at all, so it has nowhere to be filed and gets its own entry.
 */
export const navTools = () => PAGES.filter((p) => (p.tool || p.menu) && isLive(p));

/** /all-converters, grouped the same way but showing every group. */
export function allGroups() {
  return [...groupConverters()].map(([name, pages]) => ({ name, pages }));
}

/**
 * The reverse-direction page, when one exists - powers the swap arrow.
 *
 * Converter pages only, on both sides. A content page may carry a `from`/`to`
 * pair so it can host a working converter, but it does not own that direction:
 * "/" does. Letting a hub into this graph makes it asymmetric, because the
 * reverse of its reverse is the page that actually owns the pair.
 */
export function reversePage(page) {
  if (page?.kind !== 'converter' || !page.from || !page.to) return null;
  return (
    PAGES.find(
      (p) => p.kind === 'converter' && p.from === page.to && p.to === page.from,
    ) ?? null
  );
}

/**
 * Live, and not pointing its canonical somewhere else.
 *
 * A page can be perfectly usable and still not belong in the index: a hub that
 * repeats a converter already published at another path would just split the
 * signal between two URLs. Those carry `canonical` and are excluded here.
 */
const isSelfCanonical = (page) => isLive(page) && !page.canonical;

/** Absolute URLs of every page Google is allowed to index (English). */
export const indexableUrls = () =>
  [...PAGES.filter(isSelfCanonical).map((p) => p.path), ...guideRoutes()].map(
    (p) => new URL(p === '/' ? '/' : `${p}/`, SITE).href,
  );

/**
 * The route path behind a URL path, with any language prefix removed:
 * "/hi/hindi-keyboard/" -> "/hindi-keyboard", "/hi" -> "/". The Hindi pages
 * are the same routes as the English ones, so every rule here applies to both.
 */
export function routeOf(urlPath) {
  const clean = urlPath.replace(/\/$/, '') || '/';
  const m = clean.match(/^\/hi(\/.*)?$/);
  return m ? m[1] || '/' : clean;
}

/** Used by the sitemap integration's `filter()`. English and /hi alike. */
export function isIndexable(absoluteUrl) {
  const path = routeOf(new URL(absoluteUrl).pathname);
  if (GUIDE_ROUTES.has(path)) return true;
  const page = BY_PATH.get(path);
  return page ? isSelfCanonical(page) : false;
}

/** The guides are not in PAGES (they are articles, not tools) but are indexed. */
const GUIDE_ROUTES = new Set(guideRoutes());

/**
 * Guard: catch a typo'd font key at build time rather than at runtime.
 *
 * Separated from the call below so it can be tested, for the same reason
 * assertAligned() in tutor.build.js is: every entry in PAGES is correct, which
 * leaves the throw path with nothing to exercise it. A guard nobody has ever
 * seen fire is a guard that might throw a TypeError instead of the message it
 * promises, on the one day somebody mistypes a font key.
 *
 * @param {{path: string, from?: string, to?: string}[]} pages
 * @param {Record<string, unknown>} fonts
 */
export function assertKnownFonts(pages, fonts) {
  for (const p of pages) {
    for (const key of [p.from, p.to]) {
      if (key && !fonts[key]) {
        throw new Error(`routes.js: ${p.path} references unknown font "${key}"`);
      }
    }
  }
}

assertKnownFonts(PAGES, FONTS);

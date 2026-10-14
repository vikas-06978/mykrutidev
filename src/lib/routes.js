/**
 * Single source of truth for the page cluster.
 *
 * Five things read this array and nothing else:
 *   1. the sitemap `filter()` in astro.config.mjs   (only live pages)
 *   2. Header.astro's nav                           (NAV_MENUS: the most used live pages)
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
import { PREFIXED_LOCALES } from '../i18n/locales.js';
import { TOOL_PATHS, TYPING_PATHS } from './toolPages.js';
import { PRODUCTS, shownProducts, hasPage } from './store.js';
import { WORD_FONTS, isUnicodeKey } from './wordFonts.js';
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
 * (Upload Word file is offered on every page docPairFor() accepts.)
 * @property {boolean} [app]  a content page that embeds a tool (PageView's TOOLS)
 *   without being a menubar `tool` itself: it still gets WebApplication data
 * @property {string} [product]  a store product's page: the catalog id (store.js)
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
  },
  {
    path: '/unicode-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'kruti-dev',
    group: 'Unicode / Hindi',
    related: ['/', '/mangal-to-kruti-dev', '/kruti-dev-to-mangal'],
  },
  {
    path: '/kruti-dev-to-mangal',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'mangal',
    group: 'Kruti Dev',
    related: ['/', '/mangal-to-kruti-dev', '/unicode-to-kruti-dev'],
  },
  {
    path: '/mangal-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'mangal',
    to: 'kruti-dev',
    group: 'Mangal',
    related: ['/kruti-dev-to-mangal', '/unicode-to-kruti-dev', '/'],
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
  // it is its own map and its own font key. Walkman-Chanakya 905 has no pages:
  // its font file was never supplied (its Kruti Dev pairs redirect, see
  // public/_redirects). The newspaper Chanakya font has its own pages below.
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

  // ---- Chanakya, the newspaper font: read off its own font file -------------
  // Not Walkman-Chanakya 905, whose file was never supplied (see CHANAKYA_NEWS
  // in fontMaps.js). Patrika draws the same keys, with digits on `v`-`~`.
  {
    path: '/chanakya-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'chanakya-news',
    to: 'unicode',
    group: 'Chanakya',
    related: ['/unicode-to-chanakya', '/patrika-to-unicode', '/abbasi-chanakya-to-unicode'],
    beta: true,
  },
  {
    path: '/unicode-to-chanakya',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'chanakya-news',
    group: 'Chanakya',
    related: ['/chanakya-to-unicode', '/unicode-to-patrika', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/patrika-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'patrika',
    to: 'unicode',
    group: 'Chanakya',
    related: ['/unicode-to-patrika', '/chanakya-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-patrika',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'patrika',
    group: 'Chanakya',
    related: ['/patrika-to-unicode', '/unicode-to-chanakya', '/unicode-to-kruti-dev'],
    beta: true,
  },


  // ---- Shusha and Shivaji: one layout, read off the font files. Shivaji is
  // the Marathi name, with a full stop where Shusha has the danda. Beta until
  // a real document typed in either has been run through it.
  {
    path: '/shusha-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'shusha',
    to: 'unicode',
    group: 'Shusha',
    related: ['/unicode-to-shusha', '/shivaji-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-shusha',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'shusha',
    group: 'Shusha',
    related: ['/shusha-to-unicode', '/unicode-to-shivaji', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/shivaji-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'shivaji',
    to: 'unicode',
    group: 'Marathi',
    related: ['/unicode-to-shivaji', '/marathi-font-converter', '/shusha-to-unicode'],
    beta: true,
  },
  {
    path: '/unicode-to-shivaji',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'shivaji',
    group: 'Marathi',
    related: ['/shivaji-to-unicode', '/unicode-to-shusha', '/unicode-to-kruti-dev'],
    beta: true,
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

  {
    // The broad "Marathi font converter" search, answered with the font most
    // Maharashtra offices typed in: DV-TT Surekh (and Yogesh, the same layout).
    // Shivaji has its own pages above.
    path: '/marathi-font-converter',
    ready: true,
    kind: 'converter',
    from: 'dvtt',
    to: 'unicode',
    group: 'Marathi',
    related: ['/unicode-to-dvtt-surekh', '/shivaji-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-dvtt-surekh',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'dvtt',
    group: 'Marathi',
    related: ['/marathi-font-converter', '/unicode-to-shivaji', '/unicode-to-kruti-dev'],
    beta: true,
  },
  // ---- Fonts that share a keyboard with Kruti Dev, Preeti, Shusha or
  // Shivaji, each with keys of its own. Every map was read off the font file
  // (see fontMaps.js and fontVariants.test.js). Beta until a real document
  // in each has been run through it.
  {
    path: '/arjun-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'arjun',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-arjun', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-arjun',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'arjun',
    group: 'More Hindi fonts',
    related: ['/arjun-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/kundli-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'kundli',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-kundli', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-kundli',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'kundli',
    group: 'More Hindi fonts',
    related: ['/kundli-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/krishna-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'krishna',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-krishna', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-krishna',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'krishna',
    group: 'More Hindi fonts',
    related: ['/krishna-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/new-delhi-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'new-delhi',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-new-delhi', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-new-delhi',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'new-delhi',
    group: 'More Hindi fonts',
    related: ['/new-delhi-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/ruchi-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'ruchi',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-ruchi', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-ruchi',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'ruchi',
    group: 'More Hindi fonts',
    related: ['/ruchi-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/devlys-020-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'devlys-020',
    to: 'unicode',
    group: 'DevLys',
    related: ['/unicode-to-devlys-020', '/devlys-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-devlys-020',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'devlys-020',
    group: 'DevLys',
    related: ['/devlys-020-to-unicode', '/unicode-to-devlys', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/ajay-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'ajay',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-ajay', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-ajay',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'ajay',
    group: 'More Hindi fonts',
    related: ['/ajay-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/aman-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'aman',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-aman', '/krishna-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-aman',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'aman',
    group: 'More Hindi fonts',
    related: ['/aman-to-unicode', '/unicode-to-krishna', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/agra-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'agra',
    to: 'unicode',
    group: 'More Hindi fonts',
    related: ['/unicode-to-agra', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-agra',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'agra',
    group: 'More Hindi fonts',
    related: ['/agra-to-unicode', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/himalaya-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'himalaya',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-himalaya', '/preeti-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-himalaya',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'himalaya',
    group: 'Nepali',
    related: ['/himalaya-to-unicode', '/unicode-to-preeti', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/akshar-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'akshar',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-akshar', '/himalaya-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-akshar',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'akshar',
    group: 'Nepali',
    related: ['/akshar-to-unicode', '/unicode-to-himalaya', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/dina-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'dina',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-dina', '/preeti-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-dina',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'dina',
    group: 'Nepali',
    related: ['/dina-to-unicode', '/unicode-to-preeti', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/devanagari-bold-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'devanagari-bold',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-devanagari-bold', '/preeti-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-devanagari-bold',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'devanagari-bold',
    group: 'Nepali',
    related: ['/devanagari-bold-to-unicode', '/unicode-to-preeti', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/narad-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'narad',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-narad', '/preeti-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-narad',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'narad',
    group: 'Nepali',
    related: ['/narad-to-unicode', '/unicode-to-preeti', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/aakriti-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'aakriti',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-aakriti', '/preeti-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-aakriti',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'aakriti',
    group: 'Nepali',
    related: ['/aakriti-to-unicode', '/unicode-to-preeti', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/anjali-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'anjali',
    to: 'unicode',
    group: 'Nepali',
    related: ['/unicode-to-anjali', '/preeti-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-anjali',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'anjali',
    group: 'Nepali',
    related: ['/anjali-to-unicode', '/unicode-to-preeti', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/shusha02-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'shusha02',
    to: 'unicode',
    group: 'Shusha',
    related: ['/unicode-to-shusha02', '/shusha-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-shusha02',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'shusha02',
    group: 'Shusha',
    related: ['/shusha02-to-unicode', '/unicode-to-shusha', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/shivaji02-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'shivaji02',
    to: 'unicode',
    group: 'Marathi',
    related: ['/unicode-to-shivaji02', '/shivaji-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-shivaji02',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'shivaji02',
    group: 'Marathi',
    related: ['/shivaji02-to-unicode', '/unicode-to-shivaji', '/unicode-to-kruti-dev'],
    beta: true,
  },
  // ---- Gujarati: Terafont and LMG Arun, one typewriter keyboard, read off the
  // font files. The broad "Gujarati font converter" search is answered with
  // Terafont's map, which LMG Arun text reads correctly with too (LMG only
  // adds three keys). Beta until a real document in each has been run through.
  {
    path: '/gujarati-font-converter',
    ready: true,
    kind: 'converter',
    from: 'terafont',
    to: 'unicode',
    group: 'Gujarati',
    related: ['/unicode-to-terafont-varun', '/lmg-arun-to-unicode', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-terafont-varun',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'terafont',
    group: 'Gujarati',
    related: ['/gujarati-font-converter', '/unicode-to-lmg-arun', '/unicode-to-kruti-dev'],
    beta: true,
  },
  {
    path: '/lmg-arun-to-unicode',
    ready: true,
    kind: 'converter',
    from: 'lmg-arun',
    to: 'unicode',
    group: 'Gujarati',
    related: ['/unicode-to-lmg-arun', '/gujarati-font-converter', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-lmg-arun',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'lmg-arun',
    group: 'Gujarati',
    related: ['/lmg-arun-to-unicode', '/unicode-to-terafont-varun', '/unicode-to-kruti-dev'],
    beta: true,
  },
  // ---- Tamil: Bamini, the Tamil typewriter layout, read off the font file.
  // Beta until a real Bamini document has been run through it.
  {
    path: '/tamil-font-converter',
    ready: true,
    kind: 'converter',
    from: 'bamini',
    to: 'unicode',
    group: 'Tamil',
    related: ['/unicode-to-bamini', '/gujarati-font-converter', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-bamini',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'bamini',
    group: 'Tamil',
    related: ['/tamil-font-converter', '/unicode-to-terafont-varun', '/unicode-to-kruti-dev'],
    beta: true,
  },
  // ---- Bengali: SutonnyMJ, the Bijoy layout, read off the font file. Beta
  // until a real SutonnyMJ document has been run through it.
  {
    path: '/bengali-font-converter',
    ready: true,
    kind: 'converter',
    from: 'sutonny',
    to: 'unicode',
    group: 'Bengali',
    related: ['/unicode-to-sutonnymj', '/tamil-font-converter', '/'],
    beta: true,
  },
  {
    path: '/unicode-to-sutonnymj',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'sutonny',
    group: 'Bengali',
    related: ['/bengali-font-converter', '/unicode-to-bamini', '/unicode-to-kruti-dev'],
    beta: true,
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
    path: '/kruti-dev-alphabet-chart',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    group: 'More',
    related: ['/kruti-dev-keyboard', '/kruti-dev-matra-chart', '/remington-hindi-keyboard'],
  },
  {
    path: '/kruti-dev-alt-codes',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    printable: true,
    group: 'More',
    related: ['/kruti-dev-alphabet-chart', '/unicode-to-kruti-dev', '/kruti-dev-keyboard'],
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
  {
    path: '/refund-policy',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/delivery-policy', '/terms', '/contact'],
  },
  {
    path: '/delivery-policy',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/refund-policy', '/terms', '/contact'],
  },
  // ==========================================================================
  // THE STORE (src/lib/store.js). Not "live" until a product is: with nothing
  // on sale the pages stay out of the sitemap and carry noindex. A product's
  // page goes live when its status in the catalog is 'live'. The thanks page,
  // where Razorpay sends the buyer back, is never indexed.
  // ==========================================================================
  {
    path: '/store',
    ready: shownProducts().length > 0,
    kind: 'content',
    from: null,
    to: null,
    trust: true,
    group: 'More',
    related: ['/refund-policy', '/delivery-policy', '/terms'],
  },
  ...PRODUCTS.map((product) => ({
    path: `/store/${product.id}`,
    ready: hasPage(product),
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    product: product.id,
    related: ['/store', '/refund-policy', '/delivery-policy'],
  })),
  {
    path: '/store/thanks',
    ready: false,
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    related: ['/store', '/refund-policy', '/contact'],
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
 * The header's menus: the most used pages, in three menus, each ending in a
 * link to the full list on /all-converters.
 *
 * The header used to have one dropdown per source font. With every font
 * added it grew another, so the most used tools (Kruti Dev and Unicode)
 * were buried among rare ones. Now the header holds a fixed, short list
 * chosen by what people search for most, and /all-converters ("All tools")
 * holds everything, with a search. Nothing is more than a click away from
 * the header, and the header never grows.
 *
 * Only live pages are listed: a menu is no place for "coming soon".
 */
export const NAV_MENUS = [
  {
    key: 'converters',
    all: '/all-converters#converters',
    paths: [
      '/',
      '/unicode-to-kruti-dev',
      '/kruti-dev-to-mangal',
      '/mangal-to-kruti-dev',
      '/devlys-to-unicode',
      '/preeti-to-unicode',
      '/marathi-font-converter',
      '/gujarati-font-converter',
    ],
  },
  {
    key: 'typing',
    all: '/all-converters#typing',
    paths: [
      '/english-to-hindi-typing',
      '/hindi-typing-test',
      '/hindi-typing-test-for-exams',
      '/hindi-keyboard',
      '/remington-hindi-keyboard',
      '/kruti-dev-keyboard',
    ],
  },
  {
    key: 'tools',
    all: '/all-converters#tools',
    paths: [
      '/number-to-hindi-words',
      '/amount-in-words',
      '/english-date-to-hindi',
      '/hindi-word-counter',
      '/hindi-to-english-numbers',
      '/hindi-to-iast',
    ],
  },
];

/** NAV_MENUS with each path resolved to its live page. */
export function navMenus() {
  return NAV_MENUS.map((m) => ({
    key: m.key,
    all: m.all,
    pages: m.paths.map(getPage).filter((p) => p && isLive(p)),
  }));
}

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
 * "/hi/hindi-keyboard/" -> "/hindi-keyboard", "/bn" -> "/". Every language's
 * pages are the same routes as the English ones, so every rule here applies
 * to all of them.
 */
export function routeOf(urlPath) {
  const clean = urlPath.replace(/\/$/, '') || '/';
  const m = clean.match(/^\/([a-z]{2})(\/.*)?$/);
  return m && PREFIXED_LOCALES.includes(m[1]) ? m[2] || '/' : clean;
}

/** Used by the sitemap integration's `filter()`. Every language alike. */
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

/**
 * How many live pages All tools lists: every live converter, every everyday
 * tool and every typing page. The number the site quotes ("All 52 tools").
 */
export function liveToolCount() {
  const converters = allGroups().reduce((n, g) => n + g.pages.filter((p) => p.live).length, 0);
  const others = [...TOOL_PATHS, ...TYPING_PATHS].map(getPage).filter((p) => p && isLive(p)).length;
  return converters + others;
}

/**
 * The font links under a converter's intro: one per font family, so a visitor
 * who landed on the wrong font sees the others without opening a menu.
 * `fonts` are the registry keys a link is about: it is left out on a page
 * that already converts that font.
 */
export const FONT_LINKS = [
  { key: 'kruti-dev', path: '/', fonts: ['kruti-dev'] },
  { key: 'devlys', path: '/devlys-to-unicode', fonts: ['devlys'] },
  { key: 'mangal', path: '/kruti-dev-to-mangal', fonts: ['mangal'] },
  { key: 'chanakya', path: '/chanakya-to-unicode', fonts: ['chanakya-news', 'patrika', 'abbasi-chanakya'] },
  { key: 'preeti', path: '/preeti-to-unicode', fonts: ['preeti'] },
  { key: 'marathi', path: '/marathi-font-converter', fonts: ['dvtt'] },
  { key: 'shivaji', path: '/shivaji-to-unicode', fonts: ['shivaji'] },
  { key: 'shusha', path: '/shusha-to-unicode', fonts: ['shusha'] },
  { key: 'gujarati', path: '/gujarati-font-converter', fonts: ['terafont', 'lmg-arun'] },
  { key: 'tamil', path: '/tamil-font-converter', fonts: ['bamini'] },
  { key: 'bengali', path: '/bengali-font-converter', fonts: ['sutonny'] },
];

/** FONT_LINKS for one page: live targets only, minus the fonts it converts. */
export function fontLinksFor(page) {
  return FONT_LINKS.filter(
    (l) => l.path !== page.path && !l.fonts.includes(page.from) && !l.fonts.includes(page.to) && isLive(getPage(l.path)),
  );
}

/**
 * Whether a converter page offers "Upload Word file", as { from, to }: on
 * every live converter whose two fonts the document converter can read and
 * write (wordFonts.js). Null on every other page.
 */
export function docPairFor(page) {
  if (!page || page.kind !== 'converter' || !isLive(page) || !page.from || !page.to) return null;
  const known = (k) => isUnicodeKey(k) || (k in WORD_FONTS && FONTS[k]?.accurate);
  if (!known(page.from) || !known(page.to)) return null;
  if (isUnicodeKey(page.from) && isUnicodeKey(page.to)) return null;
  return { from: page.from, to: page.to };
}

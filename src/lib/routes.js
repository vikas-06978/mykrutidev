/**
 * Single source of truth for the page cluster.
 *
 * Six things read this array and nothing else:
 *   1. the sitemap `filter()` in astro.config.mjs   (only live pages)
 *   2. Header.astro's nav                           (only live pages, grouped)
 *   3. the interlink block in ConverterPage.astro   (`related`)
 *   4. each page's `noindex` flag                   (everything not live)
 *   5. robots.txt                                   (disallow everything not live)
 *   6. /all-converters                              (the whole table, with status)
 *
 * Adding a page = one entry here + one .astro file.
 *
 * ---------------------------------------------------------------------------
 * `ready` IS THE FLAG. Set it true to activate a page.
 *
 * It is necessary but NOT sufficient: isLive() also requires both of the page's
 * fonts to carry `accurate: true` in fontMaps.js. So a converter page cannot go
 * live on an unverified mapping even if someone flips `ready` by mistake — the
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

export const SITE = 'https://mykrutidev.com';

/**
 * @typedef {object} Page
 * @property {string}  path
 * @property {boolean} ready     author's switch — see the note above
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
 */

/** @type {Page[]} */
export const PAGES = [
  // ==========================================================================
  // LIVE — mapping verified against real documents and covered by fixtures
  // ==========================================================================
  {
    path: '/',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'unicode',
    group: 'Kruti Dev',
    nav: 'Kruti Dev → Unicode',
    h1: 'Kruti Dev to Unicode Converter',
    title: 'Kruti Dev to Unicode Converter | KrutiDev to Hindi Unicode Online',
    description:
      'Free Kruti Dev to Unicode converter with correct matra order and conjuncts. Paste KrutiDev text and get clean Unicode Hindi instantly, with English and numbers untouched and nothing uploaded.',
    related: ['/unicode-to-kruti-dev', '/kruti-dev-to-mangal', '/mangal-to-kruti-dev'],
  },
  {
    path: '/unicode-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'unicode',
    to: 'kruti-dev',
    group: 'Unicode / Hindi',
    nav: 'Unicode / Hindi → Kruti Dev',
    h1: 'Unicode to Kruti Dev Converter',
    title: 'Unicode to Kruti Dev Converter | Hindi to KrutiDev 010 Online Free',
    description:
      'Convert Unicode Hindi to Kruti Dev 010 font text. Type Hindi straight from your phone or Windows keypad and get KrutiDev out, with correct half-letters and matras. Free, no signup.',
    related: ['/', '/mangal-to-kruti-dev', '/kruti-dev-to-mangal'],
  },
  {
    path: '/kruti-dev-to-mangal',
    ready: true,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'mangal',
    group: 'Kruti Dev',
    nav: 'Kruti Dev → Mangal',
    h1: 'Kruti Dev to Mangal Converter',
    title: 'Kruti Dev to Mangal Converter | KrutiDev to Mangal Font Hindi Online',
    description:
      'Convert Kruti Dev text to Mangal font Hindi for government forms and CRA/NPS portals. Accurate matra placement, instant preview in real Mangal, free and fully browser-based.',
    related: ['/', '/mangal-to-kruti-dev', '/unicode-to-kruti-dev'],
  },
  {
    path: '/mangal-to-kruti-dev',
    ready: true,
    kind: 'converter',
    from: 'mangal',
    to: 'kruti-dev',
    group: 'Mangal',
    nav: 'Mangal → Kruti Dev',
    h1: 'Mangal to Kruti Dev Converter',
    title: 'Mangal to Kruti Dev Converter | Mangal Font to KrutiDev 010 Free',
    description:
      'Paste Mangal (Unicode) Hindi and get Kruti Dev 010 text back, ready for legacy typing tests and old DTP files. Live conversion, accurate conjuncts, nothing leaves your browser.',
    related: ['/kruti-dev-to-mangal', '/unicode-to-kruti-dev', '/'],
  },
  {
    path: '/all-converters',
    ready: true,
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    nav: 'All converters',
    h1: 'All Hindi and Indic Font Converters',
    title: 'All Font Converters | Kruti Dev, DevLys, Chanakya, Mangal, Unicode',
    description:
      'Every converter on MyKrutiDev: Kruti Dev, DevLys, Chanakya, Shusha and Mangal for Hindi, Preeti for Nepali, plus the Indic scripts we are working on next.',
    related: ['/', '/unicode-to-kruti-dev', '/kruti-dev-to-mangal'],
  },

  // ==========================================================================
  // SCAFFOLDED — routes and SEO exist, mapping does not. Coming soon panel.
  // ==========================================================================

  // ---- DevLys: seeded from Kruti Dev, never diffed against real documents ---
  {
    path: '/devlys-to-unicode',
    ready: false,
    kind: 'converter',
    from: 'devlys',
    to: 'unicode',
    group: 'DevLys',
    nav: 'DevLys → Unicode',
    h1: 'DevLys to Unicode Converter',
    title: 'DevLys to Unicode Converter | DevLys 010 to Hindi Unicode Online',
    description:
      'Convert DevLys 010 Hindi text to Unicode with correct matras and conjuncts. Free and browser-based.',
    related: ['/unicode-to-devlys', '/devlys-to-mangal', '/'],
    note: 'The DevLys map is currently a copy of the Kruti Dev map. The two layouts are close but not identical, and until the differences are checked against real DevLys files this page would quietly produce wrong letters.',
  },
  {
    path: '/unicode-to-devlys',
    ready: false,
    kind: 'converter',
    from: 'unicode',
    to: 'devlys',
    group: 'Unicode / Hindi',
    nav: 'Unicode / Hindi → DevLys',
    h1: 'Unicode to DevLys Converter',
    title: 'Unicode to DevLys Converter | Hindi Unicode to DevLys 010 Font',
    description:
      'Convert Unicode Hindi back to DevLys 010 font text online. Live conversion, no upload, free.',
    related: ['/devlys-to-unicode', '/'],
    note: 'The DevLys map is currently a copy of the Kruti Dev map and has not been verified against real DevLys files.',
  },
  {
    path: '/devlys-to-mangal',
    ready: false,
    kind: 'converter',
    from: 'devlys',
    to: 'mangal',
    group: 'DevLys',
    nav: 'DevLys → Mangal',
    h1: 'DevLys to Mangal Converter',
    title: 'DevLys to Mangal Converter | DevLys 010 to Mangal Font Hindi',
    description:
      'Convert DevLys font Hindi to Mangal for government forms and Unicode documents. Free, instant, private.',
    related: ['/devlys-to-unicode', '/kruti-dev-to-mangal'],
    note: 'Waiting on the same DevLys verification as the other DevLys pages.',
  },
  {
    path: '/mangal-to-devlys',
    ready: false,
    kind: 'converter',
    from: 'mangal',
    to: 'devlys',
    group: 'Mangal',
    nav: 'Mangal → DevLys',
    h1: 'Mangal to DevLys Converter',
    title: 'Mangal to DevLys Converter | Mangal Unicode to DevLys 010 Font',
    description:
      'Convert Mangal (Unicode) Hindi to DevLys 010 font text for legacy documents and typing practice.',
    related: ['/devlys-to-mangal', '/mangal-to-kruti-dev'],
    note: 'Waiting on the same DevLys verification as the other DevLys pages.',
  },

  // ---- Chanakya: a genuinely different vendor layout, map is empty ---------
  {
    path: '/chanakya-to-unicode',
    ready: false,
    kind: 'converter',
    from: 'chanakya',
    to: 'unicode',
    group: 'Chanakya',
    nav: 'Chanakya → Unicode',
    h1: 'Chanakya to Unicode Converter',
    title: 'Chanakya to Unicode Converter | Chanakya 905 to Hindi Unicode',
    description:
      'Convert Chanakya font Hindi to Unicode instantly in your browser. Free, no signup, nothing uploaded.',
    related: ['/unicode-to-chanakya', '/chanakya-to-kruti-dev', '/'],
    note: 'Chanakya 905 uses a different keyboard layout from Kruti Dev, so none of the existing map applies. It is being built from real Chanakya documents rather than guessed.',
  },
  {
    path: '/unicode-to-chanakya',
    ready: false,
    kind: 'converter',
    from: 'unicode',
    to: 'chanakya',
    group: 'Unicode / Hindi',
    nav: 'Unicode / Hindi → Chanakya',
    h1: 'Unicode to Chanakya Converter',
    title: 'Unicode to Chanakya Converter | Hindi Unicode to Chanakya 905 Font',
    description:
      'Convert Unicode Hindi back to Chanakya font encoding. Live, free and fully client-side.',
    related: ['/chanakya-to-unicode', '/'],
    note: 'Waiting on the Chanakya 905 layout, which is being built from real documents.',
  },
  {
    path: '/kruti-dev-to-chanakya',
    ready: false,
    kind: 'converter',
    from: 'kruti-dev',
    to: 'chanakya',
    group: 'Kruti Dev',
    nav: 'Kruti Dev → Chanakya',
    h1: 'Kruti Dev to Chanakya Converter',
    title: 'Kruti Dev to Chanakya Converter | KrutiDev to Chanakya 905 Hindi',
    description:
      'Convert Kruti Dev text to Chanakya font encoding online. Free, browser-based, no upload.',
    related: ['/chanakya-to-kruti-dev', '/chanakya-to-unicode', '/'],
    note: 'Waiting on the Chanakya 905 layout. The Kruti Dev half of this conversion is already done and tested.',
  },
  {
    path: '/chanakya-to-kruti-dev',
    ready: false,
    kind: 'converter',
    from: 'chanakya',
    to: 'kruti-dev',
    group: 'Chanakya',
    nav: 'Chanakya → Kruti Dev',
    h1: 'Chanakya to Kruti Dev Converter',
    title: 'Chanakya to Kruti Dev Converter | Chanakya 905 to KrutiDev 010',
    description:
      'Convert Chanakya font Hindi to Kruti Dev 010 text online, free and entirely in your browser.',
    related: ['/kruti-dev-to-chanakya', '/chanakya-to-unicode'],
    note: 'Waiting on the Chanakya 905 layout. The Kruti Dev half of this conversion is already done and tested.',
  },

  // ---- Shusha: older Hindi DTP font, map is empty --------------------------
  {
    path: '/shusha-to-unicode',
    ready: false,
    kind: 'converter',
    from: 'shusha',
    to: 'unicode',
    group: 'Shusha',
    nav: 'Shusha → Unicode',
    h1: 'Shusha to Unicode Converter',
    title: 'Shusha to Unicode Converter | Shusha Hindi Font to Unicode Online',
    description:
      'Convert Shusha font Hindi to Unicode in your browser. Free, private, no upload required.',
    related: ['/unicode-to-shusha', '/'],
    note: 'The Shusha layout has not been mapped yet. It is an older DTP font with its own arrangement, so nothing can be reused from Kruti Dev.',
  },
  {
    path: '/unicode-to-shusha',
    ready: false,
    kind: 'converter',
    from: 'unicode',
    to: 'shusha',
    group: 'Unicode / Hindi',
    nav: 'Unicode / Hindi → Shusha',
    h1: 'Unicode to Shusha Converter',
    title: 'Unicode to Shusha Converter | Hindi Unicode to Shusha Font Online',
    description:
      'Convert Unicode Hindi back to Shusha font text. Free, instant and fully client-side.',
    related: ['/shusha-to-unicode', '/'],
    note: 'The Shusha layout has not been mapped yet.',
  },

  // ---- Preeti: Nepali, not Hindi ------------------------------------------
  {
    path: '/preeti-to-unicode',
    ready: false,
    kind: 'converter',
    from: 'preeti',
    to: 'unicode',
    group: 'Nepali',
    nav: 'Preeti → Unicode',
    h1: 'Preeti to Unicode Converter (Nepali)',
    title: 'Preeti to Unicode Converter | Nepali Preeti Font to Unicode Online',
    description:
      'Convert Preeti font Nepali to Unicode Devanagari. Free, browser-based, nothing uploaded. Preeti is the Nepali equivalent of Kruti Dev.',
    related: ['/unicode-to-preeti', '/'],
    note: 'Preeti is Nepali rather than Hindi. It shares the Devanagari script but has its own layout and its own conjunct set, so it needs its own map and its own test documents.',
  },
  {
    path: '/unicode-to-preeti',
    ready: false,
    kind: 'converter',
    from: 'unicode',
    to: 'preeti',
    group: 'Nepali',
    nav: 'Unicode → Preeti',
    h1: 'Unicode to Preeti Converter (Nepali)',
    title: 'Unicode to Preeti Converter | Nepali Unicode to Preeti Font Online',
    description:
      'Convert Unicode Nepali Devanagari back to Preeti font text, free and entirely in your browser.',
    related: ['/preeti-to-unicode', '/'],
    note: 'Waiting on the Preeti layout and Nepali test documents.',
  },

  // ==========================================================================
  // PLANNED — other Indic scripts. Routes only, no mapping work started.
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
    nav: 'Marathi',
    h1: 'Marathi Font Converter',
    title: 'Marathi Font Converter | Legacy Marathi Fonts to Unicode (Planned)',
    description:
      'A planned Marathi font converter for Shree Lipi and other legacy Devanagari Marathi fonts to Unicode.',
    related: ['/', '/all-converters'],
    note: 'Planned. Marathi uses the same Devanagari script as Hindi, so parts of the Kruti Dev work may carry over, but Shree Lipi and the other Marathi DTP fonts have their own layouts, and Marathi conjuncts differ enough that this needs testing against real Marathi documents before anything ships.',
  },
  {
    path: '/gujarati-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    nav: 'Gujarati',
    h1: 'Gujarati Font Converter',
    title: 'Gujarati Font Converter | Legacy Gujarati Fonts to Unicode (Planned)',
    description:
      'A planned Gujarati font converter for legacy Gujarati DTP fonts to Unicode Gujarati.',
    related: ['/all-converters'],
    note: 'Planned. Gujarati is a different script from Devanagari, so none of the current engine applies. It needs its own character map built from scratch.',
  },
  {
    path: '/tamil-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    nav: 'Tamil',
    h1: 'Tamil Font Converter',
    title: 'Tamil Font Converter | Bamini and Legacy Tamil Fonts to Unicode',
    description:
      'A planned Tamil font converter for Bamini and other legacy Tamil fonts to Unicode Tamil.',
    related: ['/all-converters'],
    note: 'Planned. Bamini and the other legacy Tamil fonts use a different script with different reordering rules, so this needs its own engine work, not just a new table.',
  },
  {
    path: '/bengali-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    nav: 'Bengali',
    h1: 'Bengali Font Converter',
    title: 'Bengali Font Converter | Bijoy and Legacy Bengali Fonts to Unicode',
    description:
      'A planned Bengali font converter for Bijoy and other legacy Bengali fonts to Unicode Bengali.',
    related: ['/all-converters'],
    note: 'Planned. Bijoy uses its own script and layout, and Bengali conjuncts are more elaborate than Devanagari ones. It needs its own map and its own tests.',
  },
  {
    path: '/punjabi-font-converter',
    ready: false,
    kind: 'converter',
    from: null,
    to: null,
    group: 'Other scripts',
    nav: 'Punjabi',
    h1: 'Punjabi Gurmukhi Font Converter',
    title: 'Punjabi Font Converter | AnmolLipi and Asees Gurmukhi to Unicode',
    description:
      'A planned Punjabi font converter for AnmolLipi, Asees and other legacy Gurmukhi fonts to Unicode.',
    related: ['/all-converters'],
    note: 'Planned. Gurmukhi is a separate script from Devanagari and needs its own character map built from real AnmolLipi and Asees documents.',
  },

  // ==========================================================================
  // CONTENT — reference pages, not converters. Copy still to be written.
  // ==========================================================================
  {
    path: '/hindi-font-converter',
    ready: true,
    // A hub page that also converts. kind stays 'content' so it is not listed
    // as a converter in the nav or the footer — those are keyed by direction,
    // and this page's direction is already "/".
    kind: 'content',
    from: 'kruti-dev',
    to: 'unicode',
    // Same pair as "/", so it must not compete with it in search. Live and
    // fully usable, canonicalised to the homepage, kept out of the sitemap.
    canonical: '/',
    group: 'More',
    nav: 'Hindi font converter',
    h1: 'Hindi Font Converter',
    title: 'Hindi Font Converter | Kruti Dev, DevLys, Chanakya, Mangal, Unicode',
    description:
      'One place for every Hindi font conversion: Kruti Dev, DevLys, Chanakya, Shusha, Mangal and Unicode, with a guide to which one you actually need.',
    related: ['/', '/all-converters', '/unicode-to-kruti-dev'],
  },
  {
    path: '/kruti-dev-font-download',
    ready: false,
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    nav: 'Font download',
    h1: 'Kruti Dev Font Download',
    title: 'Kruti Dev Font Download | Install KrutiDev 010 on Windows and Mac',
    description:
      'How to download and install the Kruti Dev 010 Hindi font on Windows, Mac and Android, and what to do when documents show garbled text.',
    related: ['/kruti-dev-keyboard', '/'],
  },
  {
    path: '/kruti-dev-keyboard',
    ready: false,
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    nav: 'Keyboard chart',
    h1: 'Kruti Dev Keyboard Layout and Typing Chart',
    title: 'Kruti Dev Keyboard Layout | KrutiDev 010 Typing Chart and Shortcuts',
    description:
      'Full Kruti Dev 010 keyboard layout: which key types which Hindi letter, matras, half-letters and conjuncts, with a printable chart.',
    related: ['/kruti-dev-font-download', '/'],
  },
  {
    path: '/about',
    ready: false,
    kind: 'content',
    from: null,
    to: null,
    group: 'More',
    nav: 'About',
    h1: 'About MyKrutiDev',
    title: 'About MyKrutiDev | Accurate, Private Hindi Font Conversion',
    description:
      'Why MyKrutiDev exists, how the conversion engine handles matras and conjuncts, and why your text never leaves your browser.',
    related: ['/'],
  },
];

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

export const livePages = () => PAGES.filter(isLive);
export const pendingPages = () => PAGES.filter((p) => !isLive(p));
export const liveConverters = () =>
  PAGES.filter((p) => isLive(p) && p.kind === 'converter');

/** Every converter page, bucketed by its `group` and tagged with liveness. */
function groupConverters() {
  const groups = new Map();
  for (const p of PAGES) {
    if (p.kind !== 'converter') continue;
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push({ ...p, live: isLive(p) });
  }
  return groups;
}

/**
 * Nav menus, grouped by source font family.
 *
 * A group only appears if it has at least one live page: a menu containing
 * nothing but "soon" items is a dead end. Within a group every converter is
 * listed, live ones first, and `live` tells the menu whether to render a link
 * or a greyed-out placeholder — so the menu doubles as a roadmap without ever
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

/** /all-converters, grouped the same way but showing every group. */
export function allGroups() {
  return [...groupConverters()].map(([name, pages]) => ({ name, pages }));
}

/**
 * The reverse-direction page, when one exists — powers the swap arrow.
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

/** Absolute URLs of every page Google is allowed to index. */
export const indexableUrls = () =>
  PAGES.filter(isSelfCanonical).map((p) => new URL(p.path, SITE).href);

/** Used by the sitemap integration's `filter()`. */
export function isIndexable(absoluteUrl) {
  const path = new URL(absoluteUrl).pathname.replace(/\/$/, '') || '/';
  const page = BY_PATH.get(path);
  return page ? isSelfCanonical(page) : false;
}

/** Guard: catch a typo'd font key at build time rather than at runtime. */
for (const p of PAGES) {
  for (const key of [p.from, p.to]) {
    if (key && !FONTS[key]) {
      throw new Error(`routes.js: ${p.path} references unknown font "${key}"`);
    }
  }
}

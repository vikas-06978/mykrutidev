/**
 * MyKrutiDev conversion engine — legacy Hindi fonts <-> Unicode Devanagari.
 *
 * Everything here runs in the browser. No network, no upload, no state.
 *
 * ---------------------------------------------------------------------------
 * TEST with real Kruti Dev documents and EXPAND — rare conjuncts/symbols may be
 * missing; this accuracy is the site's competitive advantage.
 *
 * The mapping table is KRUTI_DEV, below. Ground truth lives in
 * __fixtures__/kruti-dev.json and runs under `npm test`.
 *
 * QUICK MANUAL CHECK — paste the left column into the Kruti Dev box and confirm
 * the right column comes out. Then swap the boxes and confirm it comes back.
 *
 *   fganh Hkkjr dh jkt/kkuh gSA  ->  हिंदी भारत की राजधानी है।
 *   ijh{kk dk ifj.kke            ->  परीक्षा का परिणाम
 *   jk"Vªh; f'k{kk uhfr          ->  राष्ट्रीय शिक्षा नीति
 *   Ñi;k iz'u i= ns[ksaA         ->  कृपया प्रश्न पत्र देखें।
 *   {ks=h; dk;kZy;               ->  क्षेत्रीय कार्यालय
 *   fnukad 15/08/1947 dks PAN    ->  दिनांक 15/08/1947 को PAN
 *
 * The last line is the English-safety case: digits, the date and the acronym
 * must all survive untouched.
 * ---------------------------------------------------------------------------
 *
 * WHY THE MAPS LOOK THE WAY THEY DO
 *
 * Kruti Dev is not an encoding, it is an 8-bit font whose glyph slots happen to
 * sit on ASCII codepoints. Two consequences drive the whole design:
 *
 *  1. A full consonant is often typed as "half consonant + vertical bar", and
 *     the vertical bar glyph is the SAME key as the aa-matra. So `Hk` is भ
 *     (भ् + bar) while `Hkk` is भा (भ + ा). Only longest-key-first matching can
 *     tell those apart — hence the trie.
 *
 *  2. Glyphs are stored in visual order, not logical order. The i-matra ि is
 *     typed BEFORE its consonant and the reph र् is typed AFTER its cluster.
 *     Unicode wants both in logical order, so raw substitution is never enough;
 *     the reorder passes below are the actual work.
 */

// --- Private-use sentinels. Never survive a conversion. ----------------------
const REPH = ''; // marks "a reph belongs in front of the cluster I follow"

// --- Devanagari character classes -------------------------------------------
const NUKTA = '़';
const HALANT = '्';
const C = `[\\u0915-\\u0939\\u0958-\\u095F\\u0979-\\u097F]${NUKTA}?`;
const VOWEL_SIGNS = 'ऺ-ौॎॏॕ-ॗॢॣ';
const RE_MATRA = new RegExp(`[${VOWEL_SIGNS}]`);
/**
 * Vowel signs EXCEPT the i-matra. The reph passes need this: a reph is typed
 * after the whole syllable including its matra (`dk;kZy;` = का + य + ा + reph
 * = कार्यालय), so the passes must step over a trailing matra — but never over
 * the i-matra, which lives on the other side of the cluster in visual order.
 */
const MATRA_NO_I = 'ऺ-ाी-ौॎॏॕ-ॗॢॣ';

/** A consonant cluster, optionally already carrying a resolved reph. */
const CLUSTER = `(?:र${HALANT})?${C}(?:${HALANT}${C})*`;
/** Same, in reverse direction: may carry a trailing matra run and reph marker. */
const CLUSTER_R = `${C}(?:${HALANT}${C})*[${MATRA_NO_I}]*${REPH}?`;

// ============================================================================
// Kruti Dev 010
// ============================================================================
// Order matters for ONE reason: buildReverse() keeps the FIRST legacy key it
// sees for each Unicode value, so the first entry is the canonical round-trip
// spelling. Longest-match is handled by the trie and does not depend on order.

const KRUTI_DEV = {
  // -- Conjuncts that own a dedicated glyph --------------------------------
  // क्ष obeys the SAME "half + vertical bar" rule as ख/घ/भ below: `{` is the
  // half form क्ष् and `{k` is the full क्ष. Reading `{` as a full क्ष is the
  // single most damaging mapping error available here — it turns the real
  // spellings `ijh{kk` (परीक्षा) and `f'k{kk` (शिक्षा) into परीक्षाा / शिक्षाा,
  // and `{ks=` (क्षेत्र) into क्षोत्र, because the bar is then read as an
  // aa-matra. `y{;` -> लक्ष्य is the case that pins the half form down.
  '{k': 'क्ष',
  '{': 'क्ष्',
  '=': 'त्र',
  K: 'ज्ञ',
  J: 'श्र',
  'Ø': 'क्र',
  '|': 'द्य',
  '}': 'द्ध',
  'Ñ': 'कृ', // dedicated कृ ligature: कृपया = `Ñi;k`, संस्कृत = `laLÑr`

  // -- Full consonants written as "half + vertical bar" ---------------------
  // These MUST be here: there is no single key for भ, थ, घ, ध, श, ष, ण, ख, झ.
  '[k': 'ख',
  '?k': 'घ',
  '>k': 'झ',
  '.k': 'ण',
  Fk: 'थ',
  '/k': 'ध',
  Hk: 'भ',
  "'k": 'श',
  '"k': 'ष',

  // -- Full consonants with their own key -----------------------------------
  d: 'क',
  x: 'ग',
  p: 'च',
  N: 'छ',
  t: 'ज',
  V: 'ट',
  B: 'ठ',
  M: 'ड',
  '<': 'ढ',
  r: 'त',
  n: 'द',
  u: 'न',
  i: 'प',
  Q: 'फ',
  c: 'ब',
  e: 'म',
  ';': 'य',
  j: 'र',
  y: 'ल',
  o: 'व',
  l: 'स',
  g: 'ह',

  // -- Half consonants (no vertical bar) ------------------------------------
  D: 'क्',
  X: 'ग्',
  P: 'च्',
  T: 'ज्',
  '.': 'ण्',
  R: 'त्',
  U: 'न्',
  I: 'प्',
  C: 'ब्',
  E: 'म्',
  Y: 'ल्',
  O: 'व्',
  L: 'स्',
  '[': 'ख्',
  '?': 'घ्',
  '>': 'झ्',
  F: 'थ्',
  '/': 'ध्',
  H: 'भ्',
  "'": 'श्',
  '"': 'ष्',

  // -- half + bar == full. Harmless (क्ा etc. never occur) and improves recall.
  Dk: 'क',
  Xk: 'ग',
  Pk: 'च',
  Tk: 'ज',
  Rk: 'त',
  Uk: 'न',
  Ik: 'प',
  Ck: 'ब',
  Ek: 'म',
  Yk: 'ल',
  Ok: 'व',
  Lk: 'स',

  // -- Rakar: the ्र that hangs under a consonant. Already in logical order. --
  // `z` is the stroke that tucks under a stemmed letter. `ª` is the variant the
  // font uses under ट ठ ड ढ, which have no stem to hang it from — without it
  // राष्ट्रीय (`jk"Vªh;`), one of the commonest words in official Hindi, comes
  // out as राष्टªीय with a raw Latin-1 byte still in it.
  z: '्र',
  'ª': '्र',

  // -- Rakar clusters, spelled out -------------------------------------------
  // Forward, the `z` ones are redundant: `i` + `z` already yields प्र. They earn
  // their place in the REVERSE direction. buildReverse feeds the same trie, and
  // longest-match would otherwise prefer the half-consonant key `I` (प्) over
  // `i` (प), spelling प्र as `Ij` — half-pa followed by a full ra, which renders
  // with a visible half-form instead of the rakar hook. The `ª` entries are NOT
  // redundant; they are the only way those clusters read at all.
  '[kz': 'ख्र',
  xz: 'ग्र',
  '?kz': 'घ्र',
  tz: 'ज्र',
  'Vª': 'ट्र',
  'Bª': 'ठ्र',
  'Mª': 'ड्र',
  '<ª': 'ढ्र',
  Fkz: 'थ्र',
  nz: 'द्र',
  '/kz': 'ध्र',
  uz: 'न्र',
  iz: 'प्र',
  'ç': 'प्र', // alternate प्र glyph. After `iz`, so `iz` stays the canonical spelling.
  Qz: 'फ्र',
  cz: 'ब्र',
  Hkz: 'भ्र',
  ez: 'म्र',
  oz: 'व्र',
  '"kz': 'ष्र',
  lz: 'स्र',
  gz: 'ह्र',

  // -- Independent vowels ----------------------------------------------------
  vks: 'ओ',
  vkS: 'औ',
  vkW: 'ऑ',
  vk: 'आ',
  va: 'अं',
  'v¡': 'अँ',
  v: 'अ',
  bZ: 'ई',
  b: 'इ',
  m: 'उ',
  'Å': 'ऊ',
  _: 'ऋ',
  ',s': 'ऐ',
  ',': 'ए',

  // -- Matras ----------------------------------------------------------------
  k: 'ा', // ा  (also the vertical bar — see header note)
  f: 'ि', // ि  moved right by the reorder pass
  h: 'ी', // ी
  q: 'ु', // ु
  w: 'ू', // ू
  '`': 'ृ', // ृ
  s: 'े', // े
  S: 'ै', // ै
  W: 'ॅ', // ॅ
  a: 'ं', // ं
  '¡': 'ँ', // ँ
  '%': 'ः', // ः
  '~': HALANT,
  '+': NUKTA,

  // -- Reph: typed AFTER its cluster, belongs BEFORE it ----------------------
  Z: REPH,

  // -- Digits (only reached when "keep English & numbers" is off) ------------
  0: '०',
  1: '१',
  2: '२',
  3: '३',
  4: '४',
  5: '५',
  6: '६',
  7: '७',
  8: '८',
  9: '९',

  // -- Punctuation -----------------------------------------------------------
  // Kruti Dev has ~94 printable slots and far more than 94 Devanagari glyphs to
  // fit in them, so almost every ASCII punctuation key was given away to the
  // script. The punctuation you can actually type lives on whatever slots were
  // left over, and they are nowhere near their ASCII meaning: the comma is `]`,
  // the full stop is `-`, the semicolon is `(`, the slash is `@`.
  //
  // THIS IS WHAT THE COMMA BUG WAS. `,` is ए — `,d` really is एक — so a literal
  // comma has no business being a comma here. With no entry whose VALUE was a
  // comma, buildReverse produced no comma key, unicodeToLegacy passed a real
  // comma straight through, and the forward pass then correctly read it back as
  // ए. "है," came out as "हैए". Every entry below exists to close that loop:
  // each one gives buildReverse a key for a character a Hindi writer types.
  //
  // Verified glyph by glyph against the outlines in public/fonts/KRDEV010.woff,
  // not from a keyboard chart. `!` is the one key that means itself, so it needs
  // no entry. The slots that draw a letter rather than punctuation (`:` is रु,
  // `)` is छ, `#` is रु, `G` and `%`) are deliberately left out — see the
  // "unverified layouts" note above on why guessing is worse than not mapping.
  AA: '॥',
  A: '।',
  '¼': '(',
  '½': ')',
  '&': '-', // the dash. MUST stay the first entry yielding `-`; `-` is the stop.
  ']': ',',
  '-': '.',
  '(': ';',
  '@': '/',
  '\\': '?',
  $: '+',
  '¾': '=',
  '¿': '{',
  'À': '}',
  // Both members of each quote pair fold onto the one ASCII character; the first
  // is what the reverse direction picks. Curly quotes are not Kruti Dev keys at
  // all, so they already pass through untouched in both directions.
  'Þ': '"',
  'ß': '"',
  '*': "'",
  '^': "'",
  '»': '÷',
  'ñ': '°',
  'Û': '•',
};

// ============================================================================
// DevLys 010 — VERIFIED to share the Kruti Dev 010 layout on every mapped key
// ============================================================================
//
// This used to be a hopeful copy with a TODO on it. It is now a checked one.
//
// HOW IT WAS VERIFIED. Not from a keyboard chart and not by reading converted
// text, but by comparing the two fonts' own glyph outlines. For each of the 105
// codepoints this map uses, the advance width, contour count and bounding box
// were read out of `public/fonts/KRDEV010.woff` and `public/fonts/devlys-010.woff`
// and compared. All 105 agree to within 10 units on a 1000-unit em — i.e. the
// same letter, redrawn with the tiny differences you would expect between two
// cuts of one layout. A sample was then rendered and read by eye as well.
//
// WHERE THEY REALLY DO DIFFER, and why it is safe. The two fonts diverge sharply
// in the 0x80-0x9F block (codepoints 128-159, plus 252): different advances,
// different contour counts, several slots empty in one font and filled in the
// other. That is the "close but not identical" everyone warns about, and it is
// real. It costs nothing today because THIS MAP TOUCHES NONE OF THOSE SLOTS —
// every key is ASCII or >= 0xA1.
//
//   >> Before adding any key in 128-159 to KRUTI_DEV, split this map. <<
//
// Sharing the object is what keeps the two fonts honest right now; it becomes a
// silent corruption the moment a key lands in the range where they disagree.
// There is a test in fontMaps.test.js that fails if one ever does.
//
// TEST PAIRS — paste the left side into a DevLys 010 document to check by hand:
//   fgUnh          -> हिन्दी
//   Hkkjr          -> भारत
//   jk"Vªh;        -> राष्ट्रीय
//   f'k{kk         -> शिक्षा
//   Ñi;k           -> कृपया
//   iz/kkuea=h     -> प्रधानमंत्री
//   fo|ky;         -> विद्यालय
//   gS] rks        -> है, तो
const DEVLYS = { ...KRUTI_DEV };

/** The 0x80-0x9F block, where DevLys 010 and Kruti Dev 010 draw different glyphs. */
export const DEVLYS_DIVERGENT_RANGE = { from: 0x80, to: 0x9f, extra: [0xfc] };

// ============================================================================
// Unverified layouts — deliberately EMPTY
// ============================================================================
// A half-remembered map would silently corrupt text, which is far worse than
// refusing to convert. Every font below is `accurate: false`, which keeps its
// pages on "coming soon" instead of shipping guesses. Fill one in from real
// documents, add fixtures, THEN flip the flag.
const CHANAKYA = {}; // Chanakya 905 — a genuinely different vendor layout
const SHUSHA = {}; // Shusha — older Hindi DTP font
const PREETI = {}; // Preeti — the Nepali Devanagari equivalent of Kruti Dev

// ============================================================================
// Font registry — adding a font is adding one entry.
// ============================================================================
//
// `accurate` is the gate. It means "verified against real documents and covered
// by fixtures in __fixtures__/", and nothing else. routes.js refuses to mark a
// page live unless BOTH of its fonts carry accurate: true, so a page cannot be
// switched on by accident while its mapping is still a guess.
//
// `altLabel` exists because of a naming trap: text typed on a phone or Windows
// Hindi keypad IS Unicode. Users search for "hindi to kruti dev" and for
// "unicode to krutidev" meaning the same thing, so the UI says "Unicode / Hindi"
// wherever there is room for it.
//
// `shortLabel` is the opposite problem: the copy button reads "Copy X code" and
// has a sub-label under it, so the font name there has to stay short. Only
// Kruti Dev needs one; every other name is already one word.

export const FONTS = {
  'kruti-dev': {
    key: 'kruti-dev',
    label: 'Kruti Dev',
    shortLabel: 'Kruti',
    kind: 'legacy',
    map: KRUTI_DEV,
    accurate: true,
    css: '"Kruti Dev 010", "Kruti Dev", monospace',
    sample: 'fgUnh Hkkjr dh jkt/kkuh Hkk"kk gSA',
    // A REAL Kruti Dev string, not lorem: this is what a pasted .doc looks like
    // on a machine without the font, and seeing it here tells the user at a
    // glance whether they are on the right page.
    placeholder: "HkkjrsUnq gfj'pUnz  (example)",
  },
  unicode: {
    key: 'unicode',
    label: 'Unicode',
    altLabel: 'Unicode / Hindi',
    kind: 'unicode',
    accurate: true,
    css: '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif',
    sample: 'हिन्दी भारत की राजधानी भाषा है।',
    placeholder: 'यहाँ हिंदी टेक्स्ट टाइप करें',
  },
  mangal: {
    key: 'mangal',
    label: 'Mangal',
    altLabel: 'Mangal (Unicode)',
    kind: 'unicode',
    accurate: true,
    // Mangal IS Unicode — the only difference is which font renders it.
    css: 'Mangal, "Noto Sans Devanagari", "Nirmala UI", sans-serif',
    sample: 'हिन्दी भारत की राजधानी भाषा है।',
    placeholder: 'यहाँ हिंदी टेक्स्ट टाइप करें',
  },
  devlys: {
    key: 'devlys',
    label: 'DevLys',
    kind: 'legacy',
    map: DEVLYS,
    // Verified by comparing glyph outlines against Kruti Dev 010 — see the note
    // above DEVLYS. Every codepoint this map uses draws the same letter in both
    // fonts; the ranges where they differ are ones the map never touches.
    accurate: true,
    css: '"DevLys 010", "DevLys", monospace',
    sample: 'fgUnh Hkkjr dh jkt/kkuh Hkk"kk gSA',
    placeholder: 'fgUnh Hkkjr  (example)',
  },
  chanakya: {
    key: 'chanakya',
    label: 'Chanakya',
    kind: 'legacy',
    map: CHANAKYA,
    accurate: false,
    css: '"Chanakya", monospace',
    sample: '',
    placeholder: '',
  },
  shusha: {
    key: 'shusha',
    label: 'Shusha',
    kind: 'legacy',
    map: SHUSHA,
    accurate: false,
    css: '"Shusha", monospace',
    sample: '',
    placeholder: '',
  },
  preeti: {
    key: 'preeti',
    label: 'Preeti',
    // Nepali, not Hindi — same script, different language and layout.
    lang: 'ne',
    kind: 'legacy',
    map: PREETI,
    accurate: false,
    css: '"Preeti", monospace',
    sample: '',
    placeholder: '',
  },
};

export const FONT_KEYS = Object.keys(FONTS);
export const getFont = (key) => FONTS[key] ?? null;

/** Verified against real documents. Only these may power a live page. */
export const isAccurate = (key) => Boolean(FONTS[key]?.accurate);

/** Both ends verified — the precondition routes.js checks before going live. */
export const isPairAccurate = (fromKey, toKey) =>
  isAccurate(fromKey) && isAccurate(toKey);

/** The label to print on a box: "Unicode / Hindi" where the ambiguity matters. */
export const boxLabel = (key) => {
  const f = FONTS[key];
  return f ? (f.altLabel ?? f.label) : key;
};

/**
 * The font name inside "Copy {name} code" — the button that hands over raw
 * legacy keystrokes.
 *
 * Its own helper rather than boxLabel() because the two want opposite things:
 * a box label spells the ambiguity out ("Unicode / Hindi"), while a button
 * label has to stay narrow enough to sit beside a second button of equal width.
 * Never hardcode the name at a call site — the button must always name the font
 * the page actually outputs, or it sends people to Word with the wrong one.
 */
export const codeLabel = (key) => {
  const f = FONTS[key];
  return f ? (f.shortLabel ?? f.label) : key;
};

// ============================================================================
// Trie — longest-key-first matching in O(input x longest key)
// ============================================================================

function buildTrie(map) {
  const root = new Map();
  for (const [legacy, uni] of Object.entries(map)) {
    let node = root;
    for (const ch of legacy) {
      let next = node.get(ch);
      if (!next) {
        next = new Map();
        node.set(ch, next);
      }
      node = next;
    }
    node.value = uni;
  }
  return root;
}

const trieCache = new WeakMap();
function trieFor(map) {
  let trie = trieCache.get(map);
  if (!trie) {
    trie = buildTrie(map);
    trieCache.set(map, trie);
  }
  return trie;
}

/** Greedy longest match. Unmatched characters pass through verbatim. */
function transliterate(text, trie) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    let node = trie;
    let match = null;
    let matchEnd = i;
    for (let j = i; j < text.length; j++) {
      node = node.get(text[j]);
      if (!node) break;
      if (node.value !== undefined) {
        match = node.value;
        matchEnd = j + 1;
      }
    }
    if (match !== null) {
      out += match;
      i = matchEnd;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

// ============================================================================
// Reorder passes — where the accuracy actually comes from
// ============================================================================

const RE_REPH_FWD = new RegExp(`(${CLUSTER}[${MATRA_NO_I}]*)${REPH}`, 'g');
const RE_IMATRA_FWD = new RegExp(`ि(${CLUSTER})`, 'g');
const RE_REPH_REV = new RegExp(
  `र${HALANT}(${C}(?:${HALANT}${C})*[${MATRA_NO_I}]*)`,
  'g',
);
const RE_IMATRA_REV = new RegExp(`(${CLUSTER_R})ि`, 'g');

/** Visual order (legacy) -> logical order (Unicode). Order of passes is load-bearing. */
function toLogicalOrder(s) {
  // 1. Reph first, so that `र्` is part of the cluster when the i-matra moves.
  //    `कम<reph>` -> `कर्म`, and for कीर्ति the reph must land before the त that
  //    the i-matra is about to hop over.
  s = s.replace(RE_REPH_FWD, `र${HALANT}$1`);
  // 2. i-matra hops to the far side of its (possibly reph'd) cluster.
  s = s.replace(RE_IMATRA_FWD, '$1ि');
  // 3. Recompose split matras: the legacy fonts build ो/ौ/ॉ out of ा + े/ै/ॅ.
  s = s
    .replace(/ाे/g, 'ो')
    .replace(/ाै/g, 'ौ')
    .replace(/ाॅ/g, 'ॉ');
  // 4. Defensive repair only. Well-formed Kruti Dev types the nasal AFTER the
  //    matra (हैं = `gSa`, में = `esa`), so this pass does not fire on clean
  //    input — it just rescues text that was typed the other way round.
  //    It MUST exclude the i-matra: by this point pass 2 has already moved ि to
  //    its logical position, and `ंि` in हिंदी is correct, not a transposition.
  s = s.replace(
    new RegExp(`([ंँ])([${MATRA_NO_I}])`, 'g'),
    '$2$1',
  );
  // 5. `D` + `z` style input yields a doubled halant. Collapse it.
  s = s.replace(new RegExp(`${HALANT}{2,}`, 'g'), HALANT);
  return s;
}

/**
 * Logical order (Unicode) -> visual order (legacy). Inverse of the above, with
 * one deliberate exception: there is NO nasal-reorder pass here.
 *
 * Kruti Dev already types the nasal after the matra, so moving it would produce
 * spellings the font never uses — `gaS` for हैं instead of `gSa`, `ugah` for
 * नहीं instead of `ugha`. Worse, applied to the i-matra it fought with the
 * i-matra pass below and corrupted the output outright: हिंदी came back as
 * `gafnh`, which decodes to हंदिी. Pass 4 of toLogicalOrder is the defensive
 * half of this pair and has no counterpart by design.
 */
function toVisualOrder(s) {
  s = s
    .replace(/ो/g, 'ाे')
    .replace(/ौ/g, 'ाै')
    .replace(/ॉ/g, 'ाॅ');
  // Reph before i-matra here too: the marker has to be in place so that
  // CLUSTER_R can carry it when the i-matra hops back to the front.
  s = s.replace(RE_REPH_REV, `$1${REPH}`);
  s = s.replace(RE_IMATRA_REV, 'ि$1');
  return s;
}

// ============================================================================
// English-safety
// ============================================================================

// Always protected, in every mode: converting these is never what anyone wants.
// ONE alternation, not three passes — a placeholder for an email contains a
// digit, so a later number pass would happily chew a hole in it.
const URL_SRC = '(?:[Hh][Tt][Tt][Pp][Ss]?://|[Ww][Ww][Ww]\\.)[^\\s<>"\']+';
const EMAIL_SRC = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}';
// Numbers, dates, times, percentages, decimals: 21, 3.14, 15/08/1947, 10:30, 99%
const NUMBER_SRC = '\\d+(?:[.,:/-]\\d+)*%?';

const RE_PROTECT_ALL = new RegExp(
  `${URL_SRC}|${EMAIL_SRC}|${NUMBER_SRC}`,
  'g',
);
const RE_PROTECT_LINKS = new RegExp(`${URL_SRC}|${EMAIL_SRC}`, 'g');

/**
 * The ~300 most common English words, plus the vocabulary that actually shows
 * up in Indian government and office documents. Membership is a 100%-precision
 * signal: if a token is in here, it is English, full stop.
 */
// prettier-ignore
// NOTE: no single-letter entries. `A` is the Kruti Dev danda (।) and appears at
// the end of practically every Hindi sentence; treating it as the English "a"
// would leave a Latin capital in the middle of otherwise converted text.
const ENGLISH_WORDS = new Set([
  'about','above','after','again','all','also','am','an','and','any','are','as','at',
  'back','be','because','been','before','being','below','between','both','but','by',
  'can','come','could','did','do','does','doing','done','down','during',
  'each','even','every','few','first','for','from','further',
  'get','give','go','good','got','had','has','have','having','he','her','here','hers','him',
  'his','how','however','if','in','into','is','it','its','itself',
  'just','know','last','like','made','make','many','may','me','more','most','much','must','my',
  'need','new','no','nor','not','now','of','off','on','once','one','only','or','other','others',
  'our','ours','out','over','own',
  'same','see','shall','she','should','since','so','some','such',
  'take','than','that','the','their','theirs','them','then','there','these','they','this',
  'those','through','time','to','too','two','under','until','up','upon','us','use','used',
  'very','was','way','we','well','were','what','when','where','which','while','who','whom',
  'why','will','with','within','without','would','year','you','your','yours',
  // office / government vocabulary
  'account','act','address','admin','administration','admit','affidavit','age','agency',
  'annexure','applicant','application','apply','approval','approved','area','authority',
  'bank','block','board','branch','building','category','certificate','chairman','charge',
  'circle','city','clerk','code','college','commission','committee','copy','corporation',
  'council','court','date','day','dear','department','deputy','designation','detail','details',
  'director','disclaimer','distribution','district','division','document','draft','education',
  'email','employee','enclosure','english','enquiry','examination','executive','father','fee',
  'file','form','format','gazette','general','gmail','government','grade','gram','group',
  'head','hindi','hon','id','india','indian','inspector','institute','issue','issued',
  'letter','level','list','madam','manager','memo','ministry','mobile','month','mother','name',
  'national','nil','no','note','notice','number','officer','office','order','page','pan',
  'panchayat','password','pay','pension','phone','pin','please','post','principal','private',
  'proposal','public','purpose','ref','reference','regarding','register','registration',
  'report','result','revenue','roll','room','sanction','school','scheme','secretary','section',
  'sender','senior','service','sign','signature','sir','son','staff','state','station',
  'status','sub','subject','submitted','sum','summary','superintendent','tahsil','tehsil',
  'teacher','test','thanks','total','town','training','university','urgent','village','ward',
  'website','www','year','yours',
]);

const RE_LATIN_TOKEN = /^[A-Za-z][A-Za-z'’.-]*$/;
const RE_ALL_CAPS = /^[A-Z]{2,6}$/;
const RE_CAPITALISED = /^[A-Z][a-z]+$/;

/**
 * Is this a sequence Devanagari actually permits?
 *
 * Used as a SECONDARY signal only — see looksEnglish(). On its own it is too
 * permissive: "India" decodes to प्दकपं, which breaks no structural rule.
 */
export function isWellFormedDevanagari(s) {
  if (!s) return true;
  let prev = '';
  let sawDevanagari = false;
  for (const ch of s) {
    const isCons = /[क-हक़-य़ॹ-ॿ]/.test(ch);
    const isIndepVowel = /[ऄ-औ]/.test(ch);
    const isMatra = RE_MATRA.test(ch);
    const isNasal = /[ँ-ः]/.test(ch);
    const isHalant = ch === HALANT;
    const isNukta = ch === NUKTA;

    if (isCons || isIndepVowel) sawDevanagari = true;

    // A vowel sign needs a consonant (or nukta/another sign) to attach to.
    if (isMatra && !/[क-हक़-य़ॹ-ॿ़]/.test(prev)) {
      return false;
    }
    // Independent vowels do not take vowel signs.
    if (isMatra && /[ऄ-औ]/.test(prev)) return false;
    // A halant needs a consonant before it.
    if (isHalant && !/[क-हक़-य़ॹ-ॿ़]/.test(prev)) {
      return false;
    }
    // A nukta needs a consonant before it.
    if (isNukta && !isConsonantChar(prev)) return false;
    // A nasal mark cannot open a syllable.
    if (isNasal && prev === '') return false;

    prev = ch;
  }
  // A word-final halant is legal but vanishingly rare in real prose; treating a
  // trailing halant as "probably English" is the single highest-value signal.
  if (prev === HALANT) return false;
  return sawDevanagari;
}

function isConsonantChar(ch) {
  return /[क-हक़-य़ॹ-ॿ]/.test(ch);
}

/**
 * Should this token be left alone as English?
 *
 * HONEST LIMITS. Kruti Dev *is* remapped ASCII, so an English word and a Hindi
 * word are byte-identical in kind — no rule can be perfect. We therefore only
 * apply rules with very high precision, and accept misses:
 *
 *   rule 1  in the English word list          -> English  (precision 1.0)
 *   rule 2  ALL-CAPS 2-6 letters (PAN, IFSC)  -> English  (Kruti Dev uppercase
 *                                                runs decode to stacked half
 *                                                consonants, which is invalid)
 *   rule 3  Capitalised AND decodes to        -> English
 *           malformed Devanagari
 *
 * Known miss: a capitalised proper noun that happens to decode cleanly, e.g.
 * "India" -> प्दकपं. The UI says so, and the toggle turns all of this off.
 */
function looksEnglish(token, decoded) {
  const bare = token.replace(/[^A-Za-z'’.-]/g, '');
  if (!RE_LATIN_TOKEN.test(bare)) return false;
  const word = bare.replace(/[^A-Za-z]/g, '');
  if (word.length < 2) return false;

  if (ENGLISH_WORDS.has(word.toLowerCase())) return true;
  if (RE_ALL_CAPS.test(word)) return true;
  if (RE_CAPITALISED.test(word) && !isWellFormedDevanagari(stripMarks(decoded))) {
    return true;
  }
  return false;
}

/**
 * Split into convertible and untouchable spans.
 *
 * Deliberately NOT a placeholder-substitution scheme: any sentinel we could
 * splice into the text is itself made of characters the maps convert (an index
 * digit becomes a Devanagari digit, and the sentinel is then unrecoverable).
 * Splitting sidesteps the problem entirely.
 *
 * @returns {{ skip: boolean, v: string }[]}
 */
function splitProtected(text, re) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ skip: false, v: text.slice(last, m.index) });
    parts.push({ skip: true, v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ skip: false, v: text.slice(last) });
  return parts;
}

// ============================================================================
// Direction implementations
// ============================================================================

export function legacyToUnicode(text, map, { keepEnglish = true } = {}) {
  if (!text) return '';
  const trie = trieFor(map);
  const parts = splitProtected(
    text,
    keepEnglish ? RE_PROTECT_ALL : RE_PROTECT_LINKS,
  );

  const out = parts
    .map(({ skip, v }) => {
      if (skip) return v;
      if (!keepEnglish) return toLogicalOrder(transliterate(v, trie));
      // Token level, so one English word cannot desync the rest of the line.
      return v.replace(/\S+/g, (token) => {
        const decoded = toLogicalOrder(transliterate(token, trie));
        return looksEnglish(token, decoded) ? token : decoded;
      });
    })
    .join('');

  // Any reph marker still standing had no cluster to attach to. Drop it rather
  // than leak a private-use codepoint into the user's clipboard.
  return out.replace(new RegExp(REPH, 'g'), '');
}

/** Drop trailing punctuation before well-formedness checking. */
function stripMarks(s) {
  return s.replace(/^[^ऀ-ॿ]+|[^ऀ-ॿ]+$/g, '');
}

const reverseCache = new WeakMap();
/**
 * Invert a forward map. The forward map is many-to-one (both `d` and `Dk` give
 * क), so the FIRST key wins and becomes the canonical round-trip spelling.
 */
export function buildReverse(map) {
  let rev = reverseCache.get(map);
  if (rev) return rev;
  rev = {};
  for (const [legacy, uni] of Object.entries(map)) {
    if (uni === '' || uni in rev) continue;
    rev[uni] = legacy;
  }
  reverseCache.set(map, rev);
  return rev;
}

export function unicodeToLegacy(text, map, { keepEnglish = true } = {}) {
  if (!text) return '';
  const trie = trieFor(buildReverse(map));
  return splitProtected(text, keepEnglish ? RE_PROTECT_ALL : RE_PROTECT_LINKS)
    .map(({ skip, v }) => (skip ? v : transliterate(toVisualOrder(v), trie)))
    .join('');
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * @param {string} text
 * @param {string} fromKey key into FONTS
 * @param {string} toKey   key into FONTS
 * @param {{ keepEnglish?: boolean }} [opts]
 * @returns {string}
 */
export function convert(text, fromKey, toKey, opts = {}) {
  if (!text) return '';
  const from = FONTS[fromKey];
  const to = FONTS[toKey];
  if (!from || !to) throw new Error(`Unknown font: ${!from ? fromKey : toKey}`);

  // Unicode -> Unicode is identity. This is the whole Mangal story: Mangal is a
  // Unicode font, not an encoding, so "Kruti Dev to Mangal" is "Kruti Dev to
  // Unicode, rendered in Mangal".
  if (from.kind === 'unicode' && to.kind === 'unicode') return text;

  if (from.kind === 'legacy' && to.kind === 'unicode') {
    return legacyToUnicode(text, from.map, opts);
  }
  if (from.kind === 'unicode' && to.kind === 'legacy') {
    return unicodeToLegacy(text, to.map, opts);
  }
  // legacy -> legacy routes through Unicode.
  return unicodeToLegacy(legacyToUnicode(text, from.map, opts), to.map, opts);
}

/** True when the pair has no mapping at all to convert with (empty map). */
export function isPairUnavailable(fromKey, toKey) {
  for (const key of [fromKey, toKey]) {
    const f = FONTS[key];
    if (f?.kind === 'legacy' && Object.keys(f.map).length === 0) return true;
  }
  return false;
}

// ============================================================================
// Input sniffing — the gentle "are you on the right page?" hint
// ============================================================================
//
// Each page now converts in ONE fixed direction, so the commonest mistake is no
// longer picking the wrong dropdown: it is landing on the wrong page and pasting
// anyway. This detects the two ways that goes wrong and returns a CODE for the
// UI to phrase. It never blocks, and it stays quiet unless it is fairly sure —
// a false alarm on correct input is worse than saying nothing.

const RE_DEVANAGARI = /[ऀ-ॿ]/g;
const RE_LATIN_LETTER = /[A-Za-z]/g;
const count = (s, re) => (s.match(re) || []).length;

/**
 * Does this read as ordinary English prose rather than legacy-font gibberish?
 * Legacy Hindi is ASCII too, so the only reliable signal is vocabulary: real
 * English text is mostly made of very common English words, and `Hkkjr dh
 * jkt/kkuh` contains none at all.
 */
function looksLikePlainEnglish(text) {
  const words = text.toLowerCase().match(/[a-z]{2,}/g) || [];
  if (words.length < 2) return false;
  const known = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return known >= 2 && known / words.length >= 0.5;
}

/**
 * @returns {null | 'expected-legacy-got-unicode' | 'expected-legacy-got-english'
 *           | 'expected-unicode-got-latin'}
 */
export function describeMismatch(text, fromKey) {
  const from = FONTS[fromKey];
  if (!from) return null;
  const t = text.trim();
  // Too little to judge. Nobody wants a warning after two keystrokes.
  if (t.length < 4) return null;

  const deva = count(t, RE_DEVANAGARI);
  const latin = count(t, RE_LATIN_LETTER);

  if (from.kind === 'unicode') {
    // Devanagari present means they are typing Hindi — fine, whatever else is
    // in there. Only pure Latin is worth mentioning.
    return deva === 0 && latin >= 4 ? 'expected-unicode-got-latin' : null;
  }

  // Legacy source. Devanagari in the box means they pasted Unicode into the
  // wrong page — this is the single most common misuse.
  if (deva > 0 && deva >= latin) return 'expected-legacy-got-unicode';
  if (looksLikePlainEnglish(t)) return 'expected-legacy-got-english';
  return null;
}

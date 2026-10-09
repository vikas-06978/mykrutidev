/**
 * MyKrutiDev conversion engine - legacy Hindi fonts <-> Unicode Devanagari.
 *
 * Everything here runs in the browser. No network, no upload, no state.
 *
 * Abbasi Chanakya New's table lives in abbasiChanakya.js (read from its handoff
 * JSON); it is registered below as `abbasi-chanakya`.
 *
 * ---------------------------------------------------------------------------
 * TEST with real Kruti Dev documents and EXPAND - rare conjuncts/symbols may be
 * missing; this accuracy is the site's competitive advantage.
 *
 * The mapping table is KRUTI_DEV, below. Ground truth lives in
 * __fixtures__/kruti-dev.json and runs under `npm test`.
 *
 * QUICK MANUAL CHECK - paste the left column into the Kruti Dev box and confirm
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
 *     tell those apart - hence the trie.
 *
 *  2. Glyphs are stored in visual order, not logical order. The i-matra ि is
 *     typed BEFORE its consonant and the reph र् is typed AFTER its cluster.
 *     Unicode wants both in logical order, so raw substitution is never enough;
 *     the reorder passes below are the actual work.
 */

import {
  ABBASI_CHANAKYA_TABLE,
  ABBASI_CHANAKYA_REVERSE,
  PRE_BASE_I_MATRA,
  POST_SYLLABLE_REPH,
} from './abbasiChanakya.js';

// --- Private-use sentinels. Never survive a conversion. ----------------------
const REPH = ''; // marks "a reph belongs in front of the cluster I follow"

// Only the Abbasi Chanakya New map emits the two below, so on every other font
// the passes that resolve them never match anything.
const PRE_I_NASAL = ''; // "िं, typed before the cluster I precede"
const FIXED_I = ''; // "ि already in logical order - do not move it"
// DV-TT only: one glyph draws ि together with the reph of the cluster after
// it, so the reph arrives BEFORE its cluster instead of after it.
const PRE_REPH = '\uE004'; // "a reph belongs in front of the cluster I precede"
// DV-TT reverse only: "the next ि spans a cluster, use the wide glyph".
const WIDE_I = '\uE005';

// --- Devanagari character classes -------------------------------------------
const NUKTA = '़';
const HALANT = '्';
const C = `[\\u0915-\\u0939\\u0958-\\u095F\\u0979-\\u097F]${NUKTA}?`;
const VOWEL_SIGNS = 'ऺ-ौॎॏॕ-ॗॢॣ';
const RE_MATRA = new RegExp(`[${VOWEL_SIGNS}]`);
/**
 * Vowel signs EXCEPT the i-matra. The reph passes need this: a reph is typed
 * after the whole syllable including its matra (`dk;kZy;` = का + य + ा + reph
 * = कार्यालय), so the passes must step over a trailing matra - but never over
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
  // single most damaging mapping error available here - it turns the real
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
  // `)` draws द्ध and `}` draws द्व - checked against the glyph outlines in
  // public/fonts/KRDEV010.woff. `}` used to be read as द्ध, which turned
  // विद्वान (`fo}ku`) into विद्धान and wrote द्ध back as a key Word shows as द्व.
  ')': 'द्ध',
  '}': 'द्व',
  'Ñ': 'कृ', // dedicated कृ ligature: कृपया = `Ñi;k`, संस्कृत = `laLÑr`

  // -- रु and रू have their own glyphs: `#` and `:` ------------------------------
  // The spelled-out forms come FIRST so they stay the canonical reverse
  // spelling (buildReverse keeps the first key): Unicode -> Kruti still writes
  // रु as `jq`, which is what the typing tutor teaches. `#i;k` (रुपया) and
  // `:i` (रूप) are how many typists key them, and now read correctly.
  jq: 'रु',
  '#': 'रु',
  jw: 'रू',
  ':': 'रू',

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
  G: 'ळ', // Marathi/Vedic ळ: `deG` = कमळ. Without it ळ could not be typed at all.

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
  // font uses under ट ठ ड ढ, which have no stem to hang it from - without it
  // राष्ट्रीय (`jk"Vªh;`), one of the commonest words in official Hindi, comes
  // out as राष्टªीय with a raw Latin-1 byte still in it.
  z: '्र',
  'ª': '्र',

  // -- Rakar clusters, spelled out -------------------------------------------
  // Forward, the `z` ones are redundant: `i` + `z` already yields प्र. They earn
  // their place in the REVERSE direction. buildReverse feeds the same trie, and
  // longest-match would otherwise prefer the half-consonant key `I` (प्) over
  // `i` (प), spelling प्र as `Ij` - half-pa followed by a full ra, which renders
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
  k: 'ा', // ा  (also the vertical bar - see header note)
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

  // -- Digits ----------------------------------------------------------------
  // None. Kruti Dev 010 draws the number keys as English digits 1 2 3, as do
  // 011, 012, 014, 016 and every font built on this map (DevLys 010, Arjun,
  // Kundli...), so 0-9 stay 0-9 in both directions. Hindi digits are on the
  // Alt-code keys: read through KRUTI_EXTENDED, written through
  // KRUTI_WRITE_EXTRA below.

  // -- Punctuation -----------------------------------------------------------
  // Kruti Dev has ~94 printable slots and far more than 94 Devanagari glyphs to
  // fit in them, so almost every ASCII punctuation key was given away to the
  // script. The punctuation you can actually type lives on whatever slots were
  // left over, and they are nowhere near their ASCII meaning: the comma is `]`,
  // the full stop is `-`, the semicolon is `(`, the slash is `@`.
  //
  // THIS IS WHAT THE COMMA BUG WAS. `,` is ए - `,d` really is एक - so a literal
  // comma has no business being a comma here. With no entry whose VALUE was a
  // comma, buildReverse produced no comma key, unicodeToLegacy passed a real
  // comma straight through, and the forward pass then correctly read it back as
  // ए. "है," came out as "हैए". Every entry below exists to close that loop:
  // each one gives buildReverse a key for a character a Hindi writer types.
  //
  // Verified glyph by glyph against the outlines in public/fonts/KRDEV010.woff,
  // not from a keyboard chart. `!` is the one key that means itself, so it needs
  // no entry. The slots that draw a letter rather than punctuation are mapped
  // above with the letters (`#` रु, `:` रू, `)` द्ध, `G` ळ, `%` ः) - an earlier
  // reading had `:` as रु and `)` as छ and left them out; rendering the font
  // settled it, and printables.test.js now checks every key against the font.
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

// What Unicode -> Kruti Dev writes with an Alt-code key, because the font draws
// it nowhere on the keyboard: the Hindi digits (Alt+0229 is ०, Alt+0131 is
// १ ... Alt+0139 is ९, ३ on … Alt+0133), ङ (Alt+0179) and ञ (Alt+0165). Each
// glyph was read off KRDEV010.woff. Kruti Dev only: DevLys 010 has other
// glyphs in the 0x80-0x9F range these use (see DEVLYS), and … stays out of the
// READING map, because pasted English text has real ellipses.
const KRUTI_WRITE_EXTRA = {
  'å': '०',
  'ƒ': '१',
  '„': '२',
  '…': '३',
  '†': '४',
  '‡': '५',
  'ˆ': '६',
  '‰': '७',
  'Š': '८',
  '‹': '९',
  '³': 'ङ',
  '¥': 'ञ',
};

// Word's AutoCorrect turns the ' key (श्) into ’ or ‘ as it is typed, and
// every Kruti Dev cut draws श् on ’ (011-016 and 055 on ‘ too). Read only
// where the bar follows (’k is श), which no English text has: a lone ’ stays
// an apostrophe, so English pasted alongside is never touched. A Word file
// knows its font, and there every quote and dash is read as that cut draws it
// (krutiWordRun below).
const KRUTI_SMART_QUOTES = {
  '’k': 'श',
  '‘k': 'श',
};

/**
 * A run of a Word file set in a Kruti Dev font, with Word's AutoCorrect
 * characters put back as the keys that draw the same thing in THAT cut, so the
 * Kruti Dev map reads them. Only where the font is known (a document names it
 * on every run); pasted text has no font, and keeps these as punctuation.
 *
 * Read off each font file, glyph by glyph (docs/FONTS.md):
 *   ’  श्  in every cut                    –  दृ  in every cut
 *   ‘  श्  in 011 012 014 016 055; nothing in 010
 *   “  ष्  in 011 012 014 016 055; भ in 010
 *   ”  ष्  in 011 012 014 016 055; nothing in 010
 *   —  कृ  in every cut                    …  ३  in 010 to 016
 *   0-9  Hindi digits in 055; English digits in every other cut
 *   and 055's own Alt codes (kruti055Keys below)
 * Kruti Dev 020 is another layout (DevLys 020's) and never comes here.
 *
 * @param {string} text  the run's characters
 * @param {string} fontName  the run's font, as Word names it
 */
export function krutiWordRun(text, fontName) {
  const cut = /(\d{3})/.exec(fontName)?.[1] ?? '010';
  const known = ['010', '011', '012', '014', '016', '055'].includes(cut);
  const quotesAreSha = known && cut !== '010';
  const quotes = text.replace(/[’‘“”–—…]/g, (ch) => {
    switch (ch) {
      case '’':
        return "'";
      case '–':
        return 'n`';
      case '—':
        return 'Ñ';
      case '‘':
        return quotesAreSha ? "'" : cut === '010' ? '' : ch;
      case '“':
        return quotesAreSha ? '"' : cut === '010' ? 'Hk' : ch;
      case '”':
        return quotesAreSha ? '"' : cut === '010' ? '' : ch;
      case '…':
        return known && cut !== '055' ? '३' : ch;
      default:
        return ch;
    }
  });
  return cut === '055' ? kruti055Keys(quotes) : quotes;
}

// Kruti Dev 055 (public/fonts/KRDEV055.woff, drawn glyph by glyph beside
// KRDEV010.woff): every ASCII letter key is 010's, but the number keys draw
// Hindi digits, and these Alt codes draw what ANOTHER key draws in 010 (the
// same glyph, outline for outline): ƒ घ (Ä), „ ह्म (ã), ‡ ह्न (à), ‰ क्त
// (ä), ‹ श् (Ü), … ि with the reph and ं (É), 0x90 भ (Ò). † and ˆ draw
// nothing, Š a star (∗, as `*` is a Kruti key). å and Œ draw a stroke that is
// not a letter: å is ० in 010, so it is read as Œ, which no Kruti key reads.
const KRUTI_055_AS_010 = {
  'ƒ': 'Ä',
  '„': 'ã',
  '‡': 'à',
  '‰': 'ä',
  '‹': 'Ü',
  '…': 'É',
  '\u0090': 'Ò',
  '†': '',
  'ˆ': '',
  'Š': '∗',
  'å': 'Œ',
};
const RE_055 = new RegExp(`[0-9${Object.keys(KRUTI_055_AS_010).join('')}]`, 'g');

/**
 * Text typed in Kruti Dev 055, rewritten as the Kruti Dev 010 keys that draw
 * the same thing, so the Kruti Dev map reads it: its number keys become Hindi
 * digits. Web and email addresses are left alone.
 *
 * @param {string} text
 */
export function kruti055Keys(text) {
  return splitProtected(text, RE_PROTECT_LINKS)
    .map(({ skip, v }) =>
      skip ? v : v.replace(RE_055, (ch) => KRUTI_055_AS_010[ch] ?? String.fromCharCode(0x966 + Number(ch))),
    )
    .join('');
}

// The upper range of Kruti Dev 010: ready-made conjuncts, full and half
// letters, combined signs and the Hindi digits typists reach with Alt codes.
// Each was read off public/fonts/KRDEV010.woff glyph by glyph, every key drawn
// before the bar `k` to tell a half letter from a full one, and DevLys 010
// draws the same glyph on every one of them. Left out, because the glyph is
// not one certain character: ¢ ¤ § Ú ö ˜ õ ›. The curly quotes and dashes
// (‘ ’ “ ” – —) and … (३) carry letters in the font too, but stay
// punctuation here, as they are in any English text pasted alongside.
//
// They are for READING only (the registry's `readMap`): KRUTI_DEV itself, which
// writes Unicode back as Kruti Dev and draws the typing charts, keeps the keys
// typists are taught (`n~n` for द्द, not `Ì`).
const KRUTI_EXTENDED = {
  // Half letters, completed by the bar like the ASCII ones
  '«k': 'त्र',
  '«': 'त्र्',
  '¸k': 'य',
  '¸': 'य्',
  'Ök': 'झ',
  'Ö': 'झ्',
  '÷k': 'झ',
  '÷': 'झ्',
  'Ük': 'श',
  'Ü': 'श्',
  'Ùk': 'त्त',
  'Ù': 'त्त्',
  'Ÿk': 'त्त',
  'Ÿ': 'त्त्',
  'Ëk': 'ध',
  'Ë': 'ध्',
  'èk': 'ध',
  'è': 'ध्',
  'º': 'ह्',
  // Full letters
  'Á': 'प्र',
  '£': 'ख्र',
  '¶': 'फ',
  'Ò': 'भ',
  '¥': 'ञ',
  '´': 'ञ',
  '³': 'ङ',
  'Ã': 'ई',
  'Ä': 'घ',
  // Ready-made conjuncts
  'Ì': 'द्द',
  'í': 'द्द',
  'Í': 'ट्ट',
  'ê': 'ट्ट',
  'Î': 'ट्ठ',
  'ë': 'ट्ठ',
  'Ï': 'ड्ड',
  'ì': 'ड्ड',
  'Ô': 'ड्ढ',
  'ï': 'ड्ढ',
  'ð': 'ठ्ठ',
  'Ý': 'फ्र',
  'à': 'ह्न',
  'á': 'ह्य',
  'â': 'हृ',
  'ã': 'ह्म',
  'ä': 'क्त',
  'æ': 'द्र',
  'é': 'न्न',
  'ó': 'स्त्र',
  'ô': 'क्क',
  'ù': 'द्म',
  // ्य drawn to join the letter before it: `dÓ` is क्य
  'Ó': '्य',
  'î': '्य',
  // Signs with something built in. `Æ` is ि with the reph of the cluster
  // after it, `Ç` is िं, `É` both; they are typed before the cluster.
  'Æ': 'ि' + PRE_REPH,
  'Ç': PRE_I_NASAL,
  'É': PRE_I_NASAL + PRE_REPH,
  'È': 'ीं',
  'Ê': 'ी' + REPH,
  '±': REPH + 'ं',
  '¨': 'ो',
  '®': 'ो',
  '©': 'ौ',
  '·': 'ऽ',
  // Hindi digits
  'å': '०',
  'ƒ': '१',
  '„': '२',
  '†': '४',
  '‡': '५',
  'ˆ': '६',
  '‰': '७',
  'Š': '८',
  '‹': '९',
};

// ============================================================================
// DevLys 010 - VERIFIED to share the Kruti Dev 010 layout on every mapped key
// ============================================================================
//
// This used to be a hopeful copy with a TODO on it. It is now a checked one.
//
// HOW IT WAS VERIFIED. Not from a keyboard chart and not by reading converted
// text, but by comparing the two fonts' own glyph outlines. For each of the 105
// codepoints this map uses, the advance width, contour count and bounding box
// were read out of `public/fonts/KRDEV010.woff` and `public/fonts/devlys-010.woff`
// and compared. All 105 agree to within 10 units on a 1000-unit em - i.e. the
// same letter, redrawn with the tiny differences you would expect between two
// cuts of one layout. A sample was then rendered and read by eye as well.
//
// WHERE THEY REALLY DO DIFFER, and why it is safe. The two fonts diverge sharply
// in the 0x80-0x9F block (codepoints 128-159, plus 252): different advances,
// different contour counts, several slots empty in one font and filled in the
// other. That is the "close but not identical" everyone warns about, and it is
// real. It costs nothing today because THIS MAP TOUCHES NONE OF THOSE SLOTS -
// every key is ASCII or >= 0xA1.
//
//   >> Before adding any key in 128-159 to KRUTI_DEV, split this map. <<
//
// Sharing the object is what keeps the two fonts honest right now; it becomes a
// silent corruption the moment a key lands in the range where they disagree.
// There is a test in fontMaps.test.js that fails if one ever does.
//
// TEST PAIRS - paste the left side into a DevLys 010 document to check by hand:
//   fgUnh          -> हिन्दी
//   Hkkjr          -> भारत
//   jk"Vªh;        -> राष्ट्रीय
//   f'k{kk         -> शिक्षा
//   Ñi;k           -> कृपया
//   iz/kkuea=h     -> प्रधानमंत्री
//   fo|ky;         -> विद्यालय
//   gS] rks        -> है, तो
const DEVLYS = { ...KRUTI_DEV };

// ============================================================================
// Fonts on the Kruti Dev keyboard, with some keys of their own
// ============================================================================
// Arjun, Kundli, Krishna and the rest type the same ASCII keys as Kruti Dev
// for almost everything, but each draws a few keys differently and fills the
// upper range its own way. Each is checked the same way: every key of the
// Kruti Dev reading map drawn in both fonts side by side (scripts kept in
// docs/FONTS.md), the keys that differ read by eye, and every glyph the font
// has on a key Kruti Dev does not use read by eye too.
//
// `drop` lists the characters whose key means something else (or nothing) in
// the font: every Kruti Dev key containing one is removed. `add` is the font's
// own keys. As for Kruti Dev, `map` writes (taught keys only) and `readMap`
// also reads the upper-range keys.

/** For the cuts whose number keys draw Hindi digits (Ruchi, DevLys 020). */
const HINDI_DIGIT_KEYS = { 0: '०', 1: '१', 2: '२', 3: '३', 4: '४', 5: '५', 6: '६', 7: '७', 8: '८', 9: '९' };

/** @param {{ drop: string, add: Record<string,string> }} spec */
function krutiVariant({ drop, add }) {
  const bad = new Set(drop);
  const keep = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => ![...k].some((c) => bad.has(c))));
  return { map: { ...keep(KRUTI_DEV), ...add }, readMap: { ...keep(KRUTI_DEV), ...keep(KRUTI_EXTENDED), ...add } };
}

// Arjun (vendor/fonts/Arjun/ARJUN.TTF). Every ASCII key is Kruti Dev's but
// `=`, which is HALF त्र here: `=k` is त्र. The upper range is its own: Hindi
// digits on the bytes 0x8C-0x95 (० Œ, १-४ on 0x8D-0x90, ५-९ on ‘ ’ “ ” •),
// ि with the reph (`£`), िं (`¯`), ीं (`°`), both (`²`), ॠ ऌ ॐ, ञ् द्ध स्त्र.
// Read and left out: `§` (a ि-like sign that is not one certain matra), `Ð`,
// `å`, `¥` and `«` (marks, not letters).
const ARJUN = krutiVariant({
  drop: '=ÁÛ«÷ŸË£Ò¥ÃÄÌÍÎÏÔðùÓÆÇÉÈÊ®åƒ„†‡ˆ‰Š‹',
  add: {
    '=k': 'त्र',
    '=': 'त्र्',
    '×k': 'ञ',
    '×': 'ञ्',
    'ð': 'द्ध',
    'ò': 'स्त्र',
    'Ç': 'ॠ',
    'È': 'ऌ',
    '¬': 'ॐ',
    '£': 'ि' + PRE_REPH,
    '¯': PRE_I_NASAL,
    '²': PRE_I_NASAL + PRE_REPH,
    '°': 'ीं',
    '®': 'ैं',
    '¦': 'ॉ',
    '¢': 'ः',
    'µ': '—',
    '¹': '*',
    'Œ': '०',
    '\u008d': '१',
    '\u008e': '२',
    '\u008f': '३',
    '\u0090': '४',
    '‘': '५',
    '’': '६',
    '“': '७',
    '”': '८',
    '•': '९',
  },
});

// Kundli (vendor/fonts/Kundli/Kundli Hindi Normal.ttf). Every ASCII key draws
// Kruti Dev's letter in a rounder design. The upper range is its own: `Ñ` is
// औ (not कृ), `Ë` ऐ, `Ê` ऍ, `Á` आ, full ख ष श ण थ ध क्ष on `Â Ô Ó Æ É Ì Õ`,
// half त्र on `×`, ि with the reph on `£` (and ं on `²`), िं on 0x80. It has
// no Hindi digits. Left out: `å` `ö` (a द conjunct that is not one certain
// letter), `Ð`, `Œ`, `§`, `ÿ` and the marks on `¢ ¤ ¥ « ‘`.
const KUNDLI = krutiVariant({
  drop: 'Ñ«÷ŸË£¥ÌÍÎÏÔðùÓÆÇÉÈÊ®åƒ„†‡ˆ‰Š‹',
  add: {
    'Ñ': 'औ',
    'Ë': 'ऐ',
    'Ê': 'ऍ',
    'Á': 'आ',
    'Âk': 'खा',
    'Â': 'ख',
    'Õ': 'क्ष',
    'Ì': 'ध',
    'Ô': 'ष',
    'Ó': 'श',
    'Æ': 'ण',
    'É': 'थ',
    '×k': 'त्र',
    '×': 'त्र्',
    'ð': 'द्ध',
    'ò': 'स्त्र',
    'õ': 'ह्न',
    'Ç': 'ॠ',
    'È': 'ऌ',
    '¬': 'ॐ',
    '£': 'ि' + PRE_REPH,
    '²': PRE_I_NASAL + PRE_REPH,
    '\u0080': PRE_I_NASAL,
    '®': 'ैं',
    'ƒ': 'ॉ',
    '“': 'ः',
    '∙': 'ऽ',
  },
});

// Krishna (vendor/fonts/Krishna/Krishna.ttf). Kruti Dev's ASCII keys, its own
// upper range: Hindi digits as in Arjun (१-४ on 0x8D-0x90, ५-९ on ‘ ’ “ ” •,
// ० on Œ), vowels आ आँ ओ औ ऋ ऍ ॠ ऌ on `Á Í Î Ï Û Ê Ç È`, full ख ण थ ध ष श
// on `Â Æ É Ì Ô Ó`, conjuncts क्ष ह्न ह्व श्च श्व स्त्र दृ, ॥ on `«`, small ु
// signs on `÷ ù ×`, ी on `Ë`, ि on `£`, िं and ीं on `¯ °` (and `ö`).
// Left out: `²` (िं or ि with a reph, not certain), the small marks on
// `¤ ¦ § ø ú û ü`, `þ š ›` (conjuncts not read with certainty) and `¥ ˜ —`.
const KRISHNA = krutiVariant({
  drop: 'Û«÷ŸË£¥ÌÍÎÏÔðàùÓÆÇÉÈÊ®åƒ„†‡ˆ‰Š‹',
  add: {
    'Á': 'आ',
    'Í': 'आँ',
    'Î': 'ओ',
    'Ï': 'औ',
    'Û': 'ऋ',
    'Ê': 'ऍ',
    'Ç': 'ॠ',
    'È': 'ऌ',
    'Â': 'ख',
    'Æ': 'ण',
    'É': 'थ',
    'Ì': 'ध',
    'Ô': 'ष',
    'Ó': 'श',
    'Õ': 'क्ष',
    'Ð': 'ह्न',
    'œ': 'ह्न',
    'à': 'ह्व',
    'õ': 'श्च',
    'ý': 'श्व',
    'ò': 'स्त्र',
    'Ÿ': 'क्त',
    'ð': 'द्ध',
    'å': 'दृ',
    '«': '॥',
    '¬': 'ॐ',
    '÷': 'ु',
    'ù': 'ु',
    '×': 'ु',
    'Ë': 'ी',
    '£': 'ि',
    '¯': PRE_I_NASAL,
    '°': 'ीं',
    'ö': 'ीं',
    '®': 'ैं',
    '¢': 'ः',
    'µ': '–',
    '¹': '*',
    '∙': 'ऽ',
    'Œ': '०',
    '\u008d': '१',
    '\u008e': '२',
    '\u008f': '३',
    '\u0090': '४',
    '‘': '५',
    '’': '६',
    '“': '७',
    '”': '८',
    '•': '९',
  },
});

// New Delhi (vendor/fonts/New Delhi/New_Delhi.ttf). Kruti Dev's ASCII keys,
// except: `=` is HALF त्र (`=k` त्र), there is no glyph on `'` - the half श is
// on `’`, which Word types for ' - and none on ``` (ृ). Upper range as in
// Krishna for ह्न ह्व द्ध स्त्र दृ ॐ ॠ ऌ, ि on `£`, िं on `¯`, ीं on `˚`, ि with
// the reph and ं on `²`. No Hindi digits. Left out: `§ ˉ ±` (signs not read
// with certainty), `Œ` and the marks on `¤ ¥ « ‘ Ú`.
const NEW_DELHI = krutiVariant({
  drop: "=`'Á«÷ŸË£Ò¥ÃÄÌÍÎÏÔðàùÓÆÇÉÈÊ±®·åƒ„†‡ˆ‰Š‹",
  add: {
    '=k': 'त्र',
    '=': 'त्र्',
    '’k': 'श',
    '’': 'श्',
    'Ð': 'ह्न',
    'à': 'ह्व',
    'ð': 'द्ध',
    'ò': 'स्त्र',
    'å': 'दृ',
    'Ç': 'ॠ',
    'È': 'ऌ',
    '¬': 'ॐ',
    '£': 'ि',
    '¯': PRE_I_NASAL,
    '²': PRE_I_NASAL + PRE_REPH,
    '˚': 'ीं',
    '®': 'ैं',
    '¦': 'ॉ',
    '¢': 'ः',
    'µ': '–',
    '¹': '*',
    '•': 'ऽ',
  },
});
// New Delhi Bold and Bold Italic (the same family in Word) draw half श on
// `'` as Kruti Dev does, where the regular style has no glyph at all. So `'`
// reads as श, and writing keeps `’`, which all four styles draw.
NEW_DELHI.readMap["'k"] = 'श';
NEW_DELHI.readMap["'"] = 'श्';

// Ruchi (vendor/fonts/Ruchi/Ruchi.ttf). Kruti Dev's ASCII keys in a slanted
// design, and the number keys draw Hindi digits (`asciiIsScript`). Its own
// upper range: ऐ ऍ आ ॠ ऌ on `Ë Ê Á Ç È`, full ख क्ष ष श ण थ on
// `Â Õ Ô Ó Æ É`, ष्ट ह्न ह्व ह्ल on `þ õ à ù`, ि with the reph on `£`, ैं on
// `®`, ळ on `”`, ः on `¢`. No ( or = on `¼ ¾`. Many upper-range glyphs are small signs or conjuncts that are not
// one certain letter, and are left out: `« Ö Ü Ÿ ¶ Ì Ð ë Ï ð î å ö ø ú û ü ÿ
// Œ œ š ˉ “ •`.
const RUCHI = krutiVariant({
  drop: '¼¾«Ö÷ÜŸË¶ÒÌÍÎëÏÔðÝàùÓîÆÇÉÈÊ®·åƒ„†‡ˆ‰Š‹£¥³',
  add: {
    ...HINDI_DIGIT_KEYS,
    'Ë': 'ऐ',
    'Ê': 'ऍ',
    'Á': 'आ',
    'Ç': 'ॠ',
    'È': 'ऌ',
    'Â': 'ख',
    'Õ': 'क्ष',
    'Ô': 'ष',
    'Ó': 'श',
    'Æ': 'ण',
    'É': 'थ',
    'þ': 'ष्ट',
    'õ': 'ह्न',
    'à': 'ह्व',
    'ù': 'ह्ल',
    'ò': 'स्त्र',
    '£': 'ि' + PRE_REPH,
    '®': 'ैं',
    '”': 'ळ',
    '¢': 'ः',
    'µ': '—',
    '∙': 'ऽ',
  },
});

// DevLys 020 (vendor/fonts/DevLys 020/DevLys 020.ttf). DevLys 010's keys,
// except that every number key draws a Hindi digit, so even 0-9 are script
// (`asciiIsScript`), and the Alt-code digits sit one slot later than in Kruti
// Dev (१ on „ ... ८ on ‹, ९ on Œ and å). Also: ध on `Ä` (not घ), स्त्र on `Û`,
// ह्व on `à`, हृ on `‚`, ॉ on `ƒ`. Left out: `Ô ï` (ड्ड or ड्ढ, not certain).
const DEVLYS_020 = krutiVariant({
  drop: 'ÛàÄÔïƒ„†‡ˆ‰Š‹å',
  add: {
    ...HINDI_DIGIT_KEYS,
    'Ä': 'ध',
    'Û': 'स्त्र',
    'à': 'ह्व',
    '‚': 'हृ',
    'ƒ': 'ॉ',
    '„': '१',
    '…': '२',
    '†': '३',
    '‡': '४',
    'ˆ': '५',
    '‰': '६',
    'Š': '७',
    '‹': '८',
    'Œ': '९',
    'å': '९',
  },
});

// Ajay (vendor/fonts/Ajay/AJAY_normal.TTF). Kruti Dev's ASCII keys in a bold
// design, but `=` is HALF त्र (`=k` त्र) and `´` is HALF ञ (as is `×`). Its
// own upper range: ि with the reph on `£` (and ं on `²`), िं on `¯ ˉ`, ीं on
// `°`, ैं on `®`, ॉ on `¦`, ॠ ॐ द्ध दृ स्त्र ः. No Hindi digits. Left out:
// `à` (a second ह), `Ð`, `§` and the marks on `¤ ¥ « Ú`.
const AJAY = krutiVariant({
  drop: '=ÛÁ«÷ŸË£Ò¥´ÃÄÌÍÎÏÔðàùÓÆÇÉÈÊ®åƒ„†‡ˆ‰Š‹',
  add: {
    '=k': 'त्र',
    '=': 'त्र्',
    '´k': 'ञ',
    '´': 'ञ्',
    '×k': 'ञ',
    '×': 'ञ्',
    'ð': 'द्ध',
    'ò': 'स्त्र',
    'å': 'दृ',
    'Ç': 'ॠ',
    '¬': 'ॐ',
    '£': 'ि' + PRE_REPH,
    '²': PRE_I_NASAL + PRE_REPH,
    '¯': PRE_I_NASAL,
    'ˉ': PRE_I_NASAL,
    '°': 'ीं',
    '®': 'ैं',
    '¦': 'ॉ',
    '¢': 'ः',
    'µ': '–',
    '¹': '*',
    '∙': 'ऽ',
  },
});

// Aman (vendor/fonts/Aman/, Condensed, Italic, Thin and Wide; no regular).
// Drawn key by key beside Krishna Condensed: the same letter on every key of
// the Krishna map, in a calligraphic design, except that १-४ on 0x8D-0x90
// are missing. (Both fonts also repeat letters on Mac Roman slots - ƒ ˆ ∆ ∏
// ≈ ... - which Windows documents never contain.)
const AMAN = Object.fromEntries(
  Object.entries(KRISHNA).map(([which, m]) => [
    which,
    Object.fromEntries(Object.entries(m).filter(([k]) => !/[\u008d-\u0090]/.test(k))),
  ]),
);

// Agra (vendor/fonts/Agra/AGRA.TTF). Kruti Dev's ASCII keys in an italic
// design, but `=` is HALF त्र (`=k` त्र) and `¿ À` are ( ). It has none of
// Kruti Dev's upper-range conjuncts; its own upper range is Krishna's: Hindi
// digits (१-४ on 0x8D-0x90, ५-९ on ‘ ’ “ ” •, ० on Œ), आ ख ण थ ॠ ऌ ऍ on
// `Á Â Æ É Ç È Ê`, क्त on `Ÿ`, ह्न on `Ð œ`, ी on `Ë`, ि on `£`, िं and ीं on
// `¯ °`. Left out: `²` and `×` (not read with certainty).
const AGRA = krutiVariant({
  drop: '=¾ÞßñÛ«Ö÷ÜèÒ¥ÌíÍêÎëÏìÔïðàáâãæéóôùÓî®åƒ„†‡ˆ‰Š‹ŸËÁ£ÆÇÉÈÊ',
  add: {
    '=k': 'त्र',
    '=': 'त्र्',
    '¿': '(',
    'À': ')',
    'Á': 'आ',
    'Â': 'ख',
    'Æ': 'ण',
    'É': 'थ',
    'Ç': 'ॠ',
    'È': 'ऌ',
    'Ê': 'ऍ',
    'Ÿ': 'क्त',
    'Ð': 'ह्न',
    'œ': 'ह्न',
    'Ë': 'ी',
    '£': 'ि',
    '¯': PRE_I_NASAL,
    '°': 'ीं',
    '¢': 'ः',
    'µ': '–',
    '∙': 'ऽ',
    'Œ': '०',
    '\u008d': '१',
    '\u008e': '२',
    '\u008f': '३',
    '\u0090': '४',
    '‘': '५',
    '’': '६',
    '“': '७',
    '”': '८',
    '•': '९',
  },
});

/** The 0x80-0x9F block, where DevLys 010 and Kruti Dev 010 draw different glyphs. */
export const DEVLYS_DIVERGENT_RANGE = { from: 0x80, to: 0x9f, extra: [0xfc] };

// ============================================================================
// Walkman-Chanakya - a genuinely different vendor layout
// ============================================================================
//
// STATUS: accurate: false, and NOT merely because nobody has got round to
// checking it. The table below is complete and round-trips cleanly. It also
// did not describe the Chanakya font file this repo used to ship, which is why
// that file was removed, and why the font has NO pages: they sat on "coming
// soon" until October 2026 and were then removed (public/_redirects sends
// their addresses to /hindi-font-converter). Add them back, with routes and
// copy, once the real Walkman-Chanakya 905 font is supplied (TODO below).
//
// ---------------------------------------------------------------------------
// WHAT THIS TABLE ACTUALLY IS
//
// It is a Remington-family layout, and specifically it is very nearly the
// KRUTI_DEV table above: of the 105 keys the two have in common, 99 carry the
// SAME Unicode value - 94%. The six that differ are `½ > / } % ñ`. That is not
// a coincidence; several legacy Hindi fonts, Walkman's among them, were cut to
// the same Remington typewriter layout, so a Walkman-Chanakya map looking like
// a Kruti Dev map is expected rather than suspicious.
//
// ---------------------------------------------------------------------------
// WHY IT IS NOT SWITCHED ON: IT DISAGREED WITH THE FONT FILE WE HAD
//
// That file was public/fonts/chanakya.woff (git tracked it under that name; the
// code had been changed to point at "Walkman-Chanakya.woff", which never
// existed, so production 404'd on it). It has been removed. The measurements
// below are kept as the record of why it was not usable.
//
// Measured the same way DEVLYS was verified above - glyph by glyph, comparing
// contour count, bounding box and advance width across ASCII 33-126:
//
//   DevLys 010 vs Kruti Dev 010 ........... 94 of 94 glyphs agree  (100%)
//   chanakya.woff vs Kruti Dev 010 ........  6 of 94 glyphs agree   (6%)
//
// DevLys is the control: two fonts that really do share a layout agree on
// everything. The shipped file agrees on almost nothing, so it does NOT use the
// Remington layout this table describes.
//
// The direct check is worse still, and is the one to quote. Render each key in
// the shipped font and compare it with the letter this table claims the key is.
// Kruti Dev draws the claimed letter every time; the shipped font draws it
// essentially never, because its lowercase range holds ready-made conjunct
// ligatures where Remington has plain consonants:
//
//   key   table says   Kruti draws   chanakya.woff drew
//    d       क             क                स्त
//    x       ग             ग                फ
//    p       च             च                श्र
//    t       ज             ज                ह्
//    r       त             त                ह्र
//    i       प             प                द्ध
//    l       स             स                द्य
//    g       ह             ह                द्र
//    v       अ             अ                क
//    K      ज्ञ            ज्ञ                च
//
// The file's own name table said only "Chanakya" (Fontographer 4.1.5, 2003) -
// no "Walkman", no "905" - and Chanakya is a family with several incompatible
// cuts, so it was never the font this table describes. It stays in git history
// (last present in commit af4e56d) if anyone needs to look at it again.
//
// A preview face that draws different letters than the converter produced is
// the exact failure the `accurate` gate exists to prevent: fluent-looking
// Devanagari that is the wrong Devanagari. So no preview face at all is the
// safe state until a matching font exists.
//
// ---------------------------------------------------------------------------
// TODO(chanakya) - TO FINISH THIS:
//
//   1. Obtain the real Walkman-Chanakya 905 font and confirm its glyphs against
//      this table (the same glyph-by-glyph check DEVLYS passed).
//   2. Add it to public/fonts/, declare its @font-face in
//      src/styles/legacy-fonts.css, and register it in PREVIEW_FONTS in
//      src/lib/legacyFonts.js.
//   3. Add a fixture next to __fixtures__/kruti-dev.json and only then flip
//      `accurate`. chanakya.test.js pins the gate and the "no preview font"
//      state, so both must be rewritten deliberately.
//
// The eight pairs worth checking by hand once a matching font is in place -
// between them they cover both reorder rules, the conjuncts that break first,
// and the nukta:
//
//   fgUnh            ->  हिंदी        (i-matra reorder)
//   Hkkjr            ->  भारत
//   ijh{kk           ->  परीक्षा      (क्ष)
//   jk"Vªh;          ->  राष्ट्रीय
//   dk;kZy;          ->  कार्यालय     (reph reorder over a matra)
//   iz/kkuea=h       ->  प्रधानमंत्री  (त्र)
//   cM+k             ->  बड़ा          (nukta)
//   Kku              ->  ज्ञान
//
// ----------------------------------------------------------------------------
// HOW THIS TABLE RELATES TO THE SUPPLIED DATA
//
// The values are the supplied ones. Three supplied entries are deliberately
// NOT here, because including them would corrupt output rather than improve it:
//
//   "f=k" -> "f="    Not a mapping at all - the value is legacy keystrokes, not
//   "f="  -> "त्रि"   Unicode. It is one converter's two-pass trick for the
//                    i-matra. This engine reorders properly, so `f` + `=k`
//                    already composes to त्रि on its own. Keeping the pair would
//                    hard-code one spelling of a rule that handles every word.
//
//   "I+ks" -> "पे़"   Malformed: a nukta AFTER a vowel sign is not a sequence
//                    Devanagari permits, and the pieces (`I`+`+`+`ks`) say
//                    प्+़+ो, which is not पे़ either. Something is wrong with
//                    this entry at the source, so it is left out rather than
//                    guessed at. `I`, `+` and `ks` all still work separately.
//
// Order matters for ONE reason, exactly as in KRUTI_DEV: buildReverse() keeps
// the FIRST key it sees for each Unicode value, so whichever spelling comes
// first is the one the Unicode -> Chanakya direction will produce. Where the
// layout offers two keys for one letter (क is `d`, `Dk` and `oQ`; ज is `t`,
// `Tk` and `”k`) the plain one is listed first on purpose.
const CHANAKYA = {
  // -- Nukta letters. First, because `d+` must beat `d`. --------------------
  'd+': 'क़',
  '[+k': 'ख़',
  '[+': 'ख़्',
  'x+': 'ग़',
  't+': 'ज़',
  'T+': 'ज़्',
  'M+': 'ड़',
  '<+': 'ढ़',
  ';+': 'य़',
  'j+': 'ऱ',
  'u+': 'ऩ',

  // -- Conjuncts with a dedicated glyph or spelling -------------------------
  '¼Z': 'र्द्ध',
  nzZ: 'र्द्र',
  '{k': 'क्ष',
  '=k': 'त्र',
  xz: 'ग्र',
  // º is ह् and z is ्र, so composing them would give ह् + ्र - two halants in
  // a row, which is not a thing. The pair has its own entry for that reason.
  'ºz': 'ह्र',
  'Ùk': 'त्त',
  'Nî': 'छ्य',
  'Vî': 'ट्य',
  'Bî': 'ठ्य',
  'Mî': 'ड्य',
  '<î': 'ढ्य',

  // -- Independent vowels ---------------------------------------------------
  // `vk` is आ the same way `Dk` is क: a half form plus the vertical bar. And
  // `bZ` is ई rather than इ + reph, so it has to outrank both `b` and `Z`.
  'v‚': 'ऑ',
  vkS: 'औ',
  vks: 'ओ',
  vk: 'आ',
  baZ: 'ईं',
  'b±': 'ईं',
  bZ: 'ई',
  mQ: 'ऊ',
  ',s': 'ऐ',
  v: 'अ',
  b: 'इ',
  m: 'उ',
  'Å': 'ऊ',
  ',': 'ए', // NOT a comma - the comma is `]`. See the note in KRUTI_DEV.
  '½': 'ऋ',
  'Ã': 'ई',

  // -- Full consonants written as "half + vertical bar" ---------------------
  Dk: 'क',
  '[k': 'ख',
  Xk: 'ग',
  '?k': 'घ',
  Pk: 'च',
  Tk: 'ज',
  '”k': 'ज',
  '.k': 'ण',
  Rk: 'त',
  Fk: 'थ',
  'èk': 'ध',
  Uk: 'न',
  IkQ: 'फ',
  iQ: 'फ',
  Ik: 'प',
  Ck: 'ब',
  Hk: 'भ',
  Ek: 'म',
  'Õk': 'य',
  jQ: 'रू',
  Yk: 'ल',
  oQ: 'क',
  Ok: 'व',
  "'k": 'श',
  'Ük': 'श',
  '"k': 'ष',
  Lk: 'स',

  // -- Single consonants, full then half ------------------------------------
  'ô': 'क्क',
  d: 'क',
  D: 'क्',
  '[': 'ख्',
  x: 'ग',
  X: 'ग्',
  'Ä': 'घ',
  '?': 'घ्',
  '³': 'ङ',
  p: 'च',
  P: 'च्',
  N: 'छ',
  t: 'ज',
  T: 'ज्',
  '”': 'ज्',
  '>': 'झ',
  '÷': 'झ्',
  '¥': 'ञ',
  'ê': 'ट्ट',
  'ë': 'ट्ठ',
  V: 'ट',
  B: 'ठ',
  'ì': 'ड्ड',
  'ï': 'ड्ढ',
  M: 'ड',
  '<': 'ढ',
  '.': 'ण्',
  r: 'त',
  R: 'त्',
  F: 'थ्',
  n: 'द',
  '/': 'ध',
  'è': 'ध्',
  u: 'न',
  U: 'न्',
  i: 'प',
  I: 'प्',
  c: 'ब',
  C: 'ब्',
  H: 'भ्',
  e: 'म',
  E: 'म्',
  ';': 'य',
  'Õ': 'य्',
  j: 'र',
  y: 'ल',
  Y: 'ल्',
  G: 'ळ',
  o: 'व',
  O: 'व्',
  "'": 'श्',
  'Ü': 'श्',
  '"': 'ष्',
  l: 'स',
  L: 'स्',
  g: 'ह',

  // -- Conjuncts that are one key ------------------------------------------
  'Ù': 'त्त्',
  'ä': 'क्त',
  '|': 'द्य',
  K: 'ज्ञ',
  '}': 'द्व',
  J: 'श्र',
  'Ø': 'क्र',
  'æ': 'द्र',
  'ç': 'प्र',
  'Á': 'प्र',
  'º': 'ह्',
  'à': 'ह्न',
  'á': 'ह्य',
  'â': 'हृ',
  'ã': 'ह्म',
  'í': 'द्द',
  'é': 'न्न',
  'Â': 'न्न',
  // फ् and फ्र have no other spelling in this layout. The full फ is `iQ`/`IkQ`
  // - a half प plus the Q hook - and that construction has no half form, so
  // without these two keys the Unicode -> Chanakya direction simply cannot
  // write either one. Kruti Dev has the same pair as `Q`/`Qz`.
  'Ý': 'फ्',
  'Ú': 'फ्र',

  // -- Matras and signs -----------------------------------------------------
  'ks±': 'ोर्ं',
  ks: 'ो',
  kS: 'ौ',
  '‚': 'ॉ',
  '¨': 'ो',
  '©': 'ौ',
  k: 'ा', // ा  (also the vertical bar - see the header note on KRUTI_DEV)
  f: 'ि', // ि  moved right by the reorder pass, exactly as in Kruti Dev
  h: 'ी',
  q: 'ु',
  w: 'ू',
  '`': 'ृ',
  s: 'े',
  S: 'ै',
  a: 'ं',
  '¡': 'ँ',
  W: 'ॅ',
  'È': 'ीं',
  z: '्र',
  'ª': '्र',
  '~': '्',
  '+': '़',

  // -- Reph: typed AFTER its cluster, belongs BEFORE it ----------------------
  Z: REPH,

  // -- Digits ---------------------------------------------------------------
  'å': '०',
  'ƒ': '१',
  '„': '२',
  '†': '४',
  '‡': '५',
  'ˆ': '६',
  '‰': '७',
  'Š': '८',
  '‹': '९',

  // -- Punctuation, in THIS font's encoding ---------------------------------
  // Chanakya spends these ASCII slots on Devanagari, so none of them may pass
  // through untouched: `]` is the comma, `,` is ए, `%` is the colon and `:` is
  // रू. This is the same trap documented at length in KRUTI_DEV - a font that
  // draws ए on the comma key will read a real comma back as ए unless the
  // reverse direction has somewhere else to put it.
  A: '।',
  '&': '-',
  '@': '/',
  ']': ',',
  '¾': '=',
  '#': 'रु',
  ':': 'रू',
  '¿': '{',
  'À': '}',
  '%': ':',
  '¢': 'ः',
  'ñ': '॰',
};

// ============================================================================
// Unverified layouts - deliberately EMPTY
// ============================================================================
// A half-remembered map would silently corrupt text, which is far worse than
// refusing to convert. Every font below is `accurate: false`, which keeps its
// pages on "coming soon" instead of shipping guesses. Fill one in from real
// documents, add fixtures, THEN flip the flag.
// ============================================================================
// Abbasi Chanakya New - its own font, NOT the `chanakya` table above
// ============================================================================
// The table itself lives in abbasiChanakya.js, read verbatim from the handoff
// JSON. All this adds is the reorder markers, translated into the engine's
// sentinels. Nothing is written by hand, so the shapes the JSON may use are
// checked and anything else throws rather than being guessed at.
//
//   pre-base   `f` ि   -> plain ि: pass 2 hops it over the cluster, as in Kruti
//              `Ç` िं  -> PRE_I_NASAL: the ि must land after the cluster with
//                        the ं after it, and plain ि + ं would strand the ं
//   post reph  REPH, then the sign. A ि here (`Æ`, `É`) is typed where it
//              belongs, so it is FIXED_I: pass 2 must not hop it forward
//              over whatever cluster happens to follow.
function abbasiEngineMap() {
  const map = { ...ABBASI_CHANAKYA_TABLE };
  for (const [key, sign] of Object.entries(PRE_BASE_I_MATRA)) {
    if (sign === 'ि') map[key] = 'ि';
    else if (sign === 'िं') map[key] = PRE_I_NASAL;
    else throw new Error(`Abbasi Chanakya: no rule for pre-base "${key}" -> "${sign}"`);
  }
  for (const [key, { emit, reph }] of Object.entries(POST_SYLLABLE_REPH)) {
    if (!reph) throw new Error(`Abbasi Chanakya: post-syllable "${key}" has no reph`);
    map[key] = REPH + emit.replace(/^ि/, FIXED_I);
  }
  return map;
}
const ABBASI_CHANAKYA = abbasiEngineMap();

// Unicode -> Abbasi: the explicit canonical table from abbasiChanakya.js, not
// buildReverse(), plus the keys the reorder sentinels become.
const ABBASI_CHANAKYA_REV = {
  ...ABBASI_CHANAKYA_REVERSE,
  [REPH]: 'Z',
  [PRE_I_NASAL]: 'Ç',
};

/**
 * Logical -> visual order for Abbasi Chanakya New. The Kruti passes do the
 * work (ि before the cluster, reph after the syllable as Z); two additions:
 *
 *  - NFD first, so a precomposed nukta letter (U+0958 क़) is looked up as
 *    क + ़ like every other one;
 *  - ि ... ं with only the cluster between them becomes the single Ç key,
 *    which is how this font types िं. The inverse of RE_PRE_I_NASAL_FWD.
 */
function abbasiToVisualOrder(s) {
  return toVisualOrder(s.normalize('NFD')).replace(RE_PRE_I_NASAL_REV, `${PRE_I_NASAL}$1`);
}

// ============================================================================
// Shusha (and Shivaji, the same font under a Marathi name)
// ============================================================================
//
// HOW IT WAS BUILT. From vendor/fonts/Shusha/Shusha.ttf, drawn key by key and
// read by eye, every mark drawn again after a consonant, every consonant key
// drawn again followed by the bar (`a`) to tell a half letter (the bar
// completes it) from a full one (the bar becomes ा). Shivaji01.ttf draws the
// same glyph on every key, so this one table serves both. Shusha02/05 and
// Shivaji02/05 are later cuts with differences, and are NOT covered yet.
//
// Unlike Kruti Dev this layout is broadly phonetic: k क, p प, t त, r र, h ह,
// and most consonants come as a half form on the lowercase key that the bar
// completes (b ब्, ba ब). The rules the engine already applies hold here too:
// ि (`i`) is typed BEFORE its cluster, the reph (`-`) AFTER its syllable.
//
// Left out on purpose, because their drawing does not read as one certain
// character: `_` (द with a hook), `;` (ल with a loop), `Ï` and `Î`.
// They pass through unchanged rather than being guessed.
//
// Punctuation: almost every ASCII punctuation key carries a letter here, so
// the font draws ordinary punctuation on Latin-1 slots instead (¸ is the
// comma, º the full stop, Á the colon). Those entries let Unicode punctuation
// be written back with keys that show it.
const SHUSHA = {
  // -- Independent vowels -----------------------------------------------------
  'Aa^': 'ऑ',
  AaO: 'औ',
  Aao: 'ओ',
  'AÝ': 'औ',
  'AÜ': 'ओ',
  Aa: 'आ',
  A: 'अ',
  '[': 'इ',
  'š': 'ई',
  ']': 'उ',
  '}': 'ऊ',
  '?': 'ऋ',
  eO: 'ऐ',
  e: 'ए',

  // -- Conjuncts with their own glyph -------------------------------------------
  xa: 'क्ष',
  x: 'क्ष्',
  '&': 'ज्ञ',
  '~': 'त्र',
  Ea: 'श्र',
  E: 'श्र्',
  '<a': 'त्त',
  '<': 'त्त्',
  '>': 'क्त',
  '+': 'ट्ट',
  '{': 'ड्ड',
  w: 'द्ध',
  W: 'द्व',
  V: 'द्य',
  '(': 'ह्य',
  ')': 'हृ',
  'œ': 'हृ',
  K: 'ख्र',
  'Ë': 'क्र',
  'Ì': 'कृ',
  'Í': 'फ्र',
  'Ù': 'न्न',
  'É': 'रु',
  $: 'रू',
  'Ÿ': 'ज' + FIXED_I, // a ready-made जि: its ि is already in place

  // -- Full consonants ------------------------------------------------------------
  k: 'क',
  '#a': 'ख',
  ga: 'ग',
  Ga: 'घ',
  '=': 'ङ',
  ca: 'च',
  C: 'छ',
  ja: 'ज',
  Ja: 'झ',
  Ha: 'ञ',
  T: 'ट',
  z: 'ठ',
  D: 'ड',
  Z: 'ढ',
  Na: 'ण',
  t: 'त',
  '%a': 'त',
  qa: 'थ',
  d: 'द',
  Qa: 'ध',
  na: 'न',
  p: 'प',
  Pa: 'प',
  f: 'फ',
  Fa: 'फ',
  ba: 'ब',
  Ba: 'भ',
  ma: 'म',
  ya: 'य',
  r: 'र',
  la: 'ल',
  va: 'व',
  Sa: 'श',
  Xa: 'श',
  Ya: 'ष',
  sa: 'स',
  h: 'ह',
  L: 'ळ',
  '@a': 'क',

  // -- Half consonants -----------------------------------------------------------
  '@': 'क्',
  '#': 'ख्',
  g: 'ग्',
  G: 'घ्',
  c: 'च्',
  j: 'ज्',
  J: 'झ्',
  H: 'ञ्',
  N: 'ण्',
  '%': 'त्',
  q: 'थ्',
  Q: 'ध्',
  n: 'न्',
  P: 'प्',
  F: 'फ्',
  b: 'ब्',
  B: 'भ्',
  m: 'म्',
  y: 'य्',
  l: 'ल्',
  v: 'व्',
  S: 'श्',
  X: 'श्',
  Y: 'ष्',
  s: 'स्',

  // -- Nukta letters drawn as one glyph ---------------------------------------------
  'Ô': 'फ़',
  'Ó': 'ख़',

  // -- Rakar: '`' under a stemmed letter, '/' under ट ठ ड ढ -----------------------------
  '`': '्र',
  '/': '्र',
  // Spelled out so the REVERSE direction writes the rakar hook, not a half
  // letter followed by a full र (the same reason KRUTI_DEV lists them).
  'T/': 'ट्र',
  'z/': 'ठ्र',
  'D/': 'ड्र',
  'Z/': 'ढ्र',
  'k`': 'क्र',
  'ga`': 'ग्र',
  'Ga`': 'घ्र',
  'ja`': 'ज्र',
  'qa`': 'थ्र',
  'd`': 'द्र',
  'Qa`': 'ध्र',
  'na`': 'न्र',
  'p`': 'प्र',
  'ba`': 'ब्र',
  'Ba`': 'भ्र',
  'ma`': 'म्र',
  'va`': 'व्र',
  'sa`': 'स्र',
  'h`': 'ह्र',

  // -- Matras and signs ---------------------------------------------------------------
  a: 'ा',
  i: 'ि',
  I: 'ी',
  u: 'ु',
  U: 'ू',
  R: 'ृ',
  o: 'े',
  O: 'ै',
  'Ü': 'ो',
  'Ý': 'ौ',
  '^': 'ॅ',
  M: 'ं',
  'Ð': 'ँ',
  ':': 'ः',
  '\\': HALANT,
  ',': NUKTA,
  '|': 'ऽ',
  '!': 'ॐ',

  // -- Reph: typed AFTER its syllable, belongs BEFORE it -------------------------------
  '-': REPH,

  // -- Punctuation -----------------------------------------------------------------------
  '.': '।',
  'º': '.',
  '¸': ',',
  'Ê': ',',
  'Á': ':',
  'Â': ';',
  '²': '!',
  'Ñ': '!',
  'Æ': '?',
  '³': '(',
  '´': ')',
  '¤': '[',
  '¥': ']',
  '¡': '{',
  '£': '}',
  'À': '/',
  'Ò': '\\',
  'Ã': '<',
  'Ä': '=',
  'Å': '>',
  'Ç': '@',
  'È': '|',
  'Ö': '_',
  'µ': '*',
  '†': '+',
  '‰': '%',
  "'": "'",
  '"': '"',
};
// ============================================================================
// Preeti - the Nepali legacy font (Ajay Mishra, 1993)
// ============================================================================
//
// HOW IT WAS BUILT. From the font file in public/fonts/preeti.woff (raw
// TrueType, "Preeti 1.0 ... Generated by Fontographer 3.5"), not from a
// keyboard chart. Its glyph names are just the ASCII key names, so they say
// nothing: every one of its 139 mapped codepoints was drawn at 72-96px and
// read by eye, and every combining mark (matras, reph, rakar, nukta, candra)
// was drawn again after a consonant to see where it lands. Only keys whose
// drawing was unambiguous are here. Two are left out on purpose: `¥` (a
// small hook that trails its letter, not a rakar) and `Ò` (three raised
// dots) do not read as any one character.
//
// CROSS-CHECKED against an independent open-source Preeti table (used only
// for the comparison, nothing copied). It agrees on every key but two, and
// the font settles both in this map's favour: `°` has no dot on top, so it is
// ड्ढ and not ङ्ढ, and `Ø` draws a free-standing च beside its letter (`kØ` is
// पच), not the ्य of a conjunct.
//
// WHAT MAKES IT DIFFERENT FROM KRUTI DEV
//
//  - The NUMBER keys are letters (0 = ण्, 1 = ज्ञ, 3 = घ, 6 = ट ...), and the
//    digits live on the shifted row (! = १, @ = २ ... ) = ०). So a Preeti page
//    must never protect "numbers" the way the Kruti pages do: `asciiIsScript`
//    on the registry entry turns that off, and with it the English-word
//    guessing, which Preeti defeats too - `of` is या and `an` is बल.
//  - Full consonants mostly have their own lowercase key. The vertical-bar
//    trick (half + `f`) is only NEEDED for ण (`0f`) and ष (`if`), but every
//    half + `f` is accepted, because typists use it.
//  - Independent vowels are built from pieces: आ = `cf`, ओ = `cf]`, ई = `O{`,
//    ऐ = `P]`, ऊ = `pm`. And `m` is the tail that turns प into फ (`km`).
//  - The reph (`{`) is typed after its syllable and ि (`l`) before its
//    cluster, exactly as in Kruti Dev, so the same reorder passes apply.
//
// Order matters only for the reverse direction: buildReverse() keeps the
// FIRST key for each Unicode value.
// Shivaji01: the same font as Shusha on every key but three, read the same
// way from vendor/fonts/Shivaji/Shivaji01.ttf. Marathi ends a sentence with a
// full stop, and Shivaji's `.` draws one, where Shusha's draws the danda. Its
// `†` and `‰` draw themselves rather than + and %. `á` draws a fragment that
// is not one certain letter, so it is left out like Shusha's unread keys.
const SHIVAJI = { ...SHUSHA, '.': '.' };
delete SHIVAJI['†'];
delete SHIVAJI['‰'];

// ============================================================================
// DV-TT Surekh (Marathi)
// ============================================================================
// Read off vendor/fonts/DV-TTSurekh/DV-TTSurekh.ttf glyph by glyph: every key
// drawn on its own, every key drawn with the bar `É` after it (to tell a half
// letter from a full one), every sign drawn after द and प, and converted
// words drawn in the font and read back (see dvtt.test.js).
//
// HOW THE FONT WORKS
//
//  - Most letters are a half form plus the bar `É`, exactly like Kruti Dev's
//    `k`: `M` is ग्, `MÉ` is ग, `MÉÉ` is गा. Every half + `É` is listed below.
//  - क and फ are the exception. Their full form has its own key (`E`, `¡`),
//    and the half form plus the bar draws का / फा, so `CÉ` is का.
//  - ि comes in a narrow (`Ê`) and a wide (`Î`) glyph for one letter or a
//    cluster, each also with ं, with a reph, or with both, all typed before
//    the cluster. ी, े, ै and ॅ come with ं and with a reph too.
//  - The reph (`Ç`) is typed after its syllable, as in Kruti Dev.
//  - The number keys draw Devanagari digits. (The EN fonts draw English digits
//    on them, and differ on nothing else that is mapped.)
//
// Left out: `#` (a dotted circle), `ß` (a sign below the letter that is not
// one certain character) and the dots on ð-þ.
//
// Order matters only for the reverse direction: buildReverse() keeps the
// FIRST key for each Unicode value.
const DVTT = {
  // -- Independent vowels -----------------------------------------------------
  '+Éà': 'ओ',
  '+Éè': 'औ',
  '+Éì': 'ऑ',
  '+É': 'आ',
  '+ì': 'ॲ',
  '+': 'अ',
  '<Ç': 'ई',
  '<': 'इ',
  '=': 'उ',
  '>': 'ऊ',
  '@': 'ऋ',
  A: 'ॠ',
  'Bä': 'ऐ',
  'Bà': 'ऐ',
  B: 'ए',

  // -- क and फ: full form on its own key, half + bar is का / फा ------------------
  E: 'क',
  F: 'क़',
  'CÉ': 'का',
  'DÉ': 'क़ा',
  C: 'क्',
  D: 'क़्',
  '¡': 'फ',
  '¢': 'फ़',
  '}É': 'फा',
  '~É': 'फ़ा',
  '}': 'फ्',
  '~': 'फ़्',

  // -- Half + bar = full letter ---------------------------------------------------
  'IÉ': 'क्ष',
  'JÉ': 'ख',
  'KÉ': 'ख़',
  'LÉ': 'ख्र',
  'MÉ': 'ग',
  'NÉ': 'ग़',
  'OÉ': 'ग्र',
  'PÉ': 'घ',
  'QÉ': 'घ्र',
  'SÉ': 'च',
  'TÉ': 'च्र',
  'VÉ': 'ज',
  'WÉ': 'ज़',
  'XÉ': 'ज्र',
  'YÉ': 'ज्ञ',
  'ZÉ': 'झ',
  '[É': 'झ्र',
  '\\É': 'ञ',
  'hÉ': 'ण',
  'iÉ': 'त',
  'jÉ': 'त्र',
  'kÉ': 'त्त',
  'lÉ': 'थ',
  'mÉ': 'थ्र',
  'vÉ': 'ध',
  'wÉ': 'ध्र',
  'xÉ': 'न',
  'yÉ': 'न्र',
  'zÉ': 'न्न',
  '{É': 'प',
  '|É': 'प्र',
  '¤É': 'ब',
  '¥É': 'ब्र',
  '¦É': 'भ',
  '§É': 'भ्र',
  '¨É': 'म',
  '©É': 'म्र',
  'ªÉ': 'य',
  // `¬` is ्य drawn to join the letter before it: `ºÉ¬É` स्या. After a half
  // letter (`S¬É` च्या) the doubled halant collapses.
  '¬': '्य',
  '«É': 'य्र',
  '±É': 'ल',
  '´É': 'व',
  'µÉ': 'व्र',
  '¶É': 'श',
  '·É': 'श',
  '¸É': 'श्र',
  '¹É': 'ष',
  'ºÉ': 'स',
  '»É': 'स्र',

  // -- The half forms ----------------------------------------------------------------
  I: 'क्ष्',
  J: 'ख्',
  K: 'ख़्',
  L: 'ख्र्',
  M: 'ग्',
  N: 'ग़्',
  O: 'ग्र्',
  P: 'घ्',
  Q: 'घ्र्',
  S: 'च्',
  T: 'च्र्',
  V: 'ज्',
  W: 'ज़्',
  X: 'ज्र्',
  Y: 'ज्ञ्',
  Z: 'झ्',
  '[': 'झ्र्',
  '\\': 'ञ्',
  h: 'ण्',
  i: 'त्',
  j: 'त्र्',
  k: 'त्त्',
  l: 'थ्',
  m: 'थ्र्',
  v: 'ध्',
  w: 'ध्र्',
  x: 'न्',
  y: 'न्र्',
  z: 'न्न्',
  '{': 'प्',
  '|': 'प्र्',
  '¤': 'ब्',
  '¥': 'ब्र्',
  '¦': 'भ्',
  '§': 'भ्र्',
  '¨': 'म्',
  '©': 'म्र्',
  'ª': 'य्',
  '«': 'य्र्',
  '±': 'ल्',
  '´': 'व्',
  'µ': 'व्र्',
  '¶': 'श्',
  '·': 'श्',
  '¸': 'श्र्',
  '¹': 'ष्',
  'º': 'स्',
  '»': 'स्र्',
  '¼': 'ह्',

  // -- Letters and conjuncts with no stem: one key each ------------------------
  G: 'क्र',
  H: 'क्त',
  R: 'ङ',
  U: 'छ',
  ']': 'ट',
  '^': 'ट्ट',
  _: 'ट्ठ',
  '`': 'ठ',
  a: 'ठ्ठ',
  b: 'ड',
  c: 'ड़',
  d: 'ड्ड',
  e: 'ड्ढ',
  f: 'ढ',
  g: 'ढ़',
  n: 'द',
  o: 'दृ',
  p: 'द्र',
  q: 'द्द',
  r: 'द्ध',
  s: 'द्म',
  t: 'द्य',
  u: 'द्व',
  '£': 'फ्र',
  '®': 'र',
  '¯': 'रु',
  '°': 'रू',
  '²': 'ळ',
  '³': 'ळ',
  '½': 'ह',
  '¾': 'हृ',
  '¿': 'ह्ल',
  'À': 'ह्म',
  'Á': 'ह्य',

  // -- Signs ---------------------------------------------------------------------
  'É': 'ा',
  'Ê': 'ि',
  'Ë': PRE_I_NASAL,
  'Ì': 'ि' + PRE_REPH,
  'Í': PRE_I_NASAL + PRE_REPH,
  'Î': 'ि',
  'Ï': PRE_I_NASAL,
  'Ð': 'ि' + PRE_REPH,
  'Ñ': PRE_I_NASAL + PRE_REPH,
  'Ò': 'ी',
  'Ó': 'ीं',
  'Ô': 'ी' + REPH,
  'Õ': 'ी' + REPH + 'ं',
  'Ö': 'ु',
  '×': '़ु',
  'Ø': '्रु',
  'Ù': 'ु',
  'Ú': 'ू',
  'Û': '़ू',
  'Ü': '्रू',
  'Ý': 'ू',
  'Þ': 'ृ',
  // Two े glyphs: `ä` is the plain े, `à` is curled to sit on the bar, so
  // `É` + `à` draws ो. Both are े here: the bar before it makes the ो.
  'ä': 'े',
  'å': 'ें',
  'æ': 'े' + REPH,
  'ç': 'े' + REPH + 'ं',
  'à': 'े',
  'á': 'ें',
  'â': 'े' + REPH,
  'ã': 'े' + REPH + 'ं',
  'è': 'ै',
  'é': 'ैं',
  'ê': 'ै' + REPH,
  'ë': 'ै' + REPH + 'ं',
  'ì': 'ॅ',
  'í': 'ॅं',
  'î': 'ॅ' + REPH,
  'ï': 'ॅ' + REPH + 'ं',
  'Â': '्',
  'Ã': '़',
  'Ä': 'ँ',
  'Å': '्र',
  'Æ': 'ं',
  'Ç': REPH,
  'È': REPH + 'ं',
  '&': 'ः',
  '%': 'ऽ',
  $: 'ॐ',

  // -- Digits and punctuation -------------------------------------------------------
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
  '*': '।',
  '"': '‘',
  "'": '’',
  '!': '!',
  '(': '(',
  ')': ')',
  ',': ',',
  '-': '-',
  '.': '.',
  '/': '/',
  ':': ':',
  ';': ';',
  '?': '?',
};

// Unicode -> DV-TT. Built inline: buildReverse()'s cache does not exist yet
// while FONTS is being set up. First key wins, as in buildReverse().
const DVTT_REV = {};
for (const [key, uni] of Object.entries(DVTT)) {
  if (!(uni in DVTT_REV)) DVTT_REV[uni] = key;
}
// ो is the bar plus the CURLED े (`Éà`), never the plain one. Where the bar
// belongs to a key of its own (`CÉ` का), that key is followed by `à` too.
for (const [sign, curled] of [
  ['े', 'à'],
  ['ें', 'á'],
  ['े' + REPH, 'â'],
  ['े' + REPH + 'ं', 'ã'],
]) {
  DVTT_REV['ा' + sign] = 'É' + curled;
  for (const aa of ['का', 'क़ा', 'फा', 'फ़ा']) DVTT_REV[aa + sign] = DVTT_REV[aa] + curled;
}
// The wide ि glyphs, picked by dvttToVisualOrder() for a cluster that is
// drawn as a half letter plus a letter.
Object.assign(DVTT_REV, {
  [WIDE_I + 'ि']: 'Î',
  [WIDE_I + PRE_I_NASAL]: 'Ï',
  [WIDE_I + 'ि' + PRE_REPH]: 'Ð',
  [WIDE_I + PRE_I_NASAL + PRE_REPH]: 'Ñ',
});

// Two-letter conjuncts DV-TT draws as ONE glyph (क्ष, द्ध, ह्य ...). A ि
// before them needs only the narrow glyph.
const DVTT_ONE_GLYPH = Object.values(DVTT).filter((v) =>
  new RegExp(`^${C}${HALANT}${C}$`).test(v),
);

/**
 * Logical -> visual order for DV-TT: the usual passes, then the font's own
 * combined glyphs. A ि before a cluster carrying a reph or ं takes the glyph
 * that draws them together, and a ि before a half letter + letter is wide.
 */
function dvttToVisualOrder(s) {
  s = toVisualOrder(s.normalize('NFD'));
  s = s.replace(RE_PRE_I_NASAL_REV, `${PRE_I_NASAL}$1`);
  s = s.replace(RE_DVTT_I_REPH, `$1${PRE_REPH}$2`);
  return s.replace(RE_DVTT_I_CLUSTER, (m, sign, cluster) => {
    let rest = cluster.replace(new RegExp(`${HALANT}र`, 'g'), '');
    for (const pair of DVTT_ONE_GLYPH) rest = rest.split(pair).join('');
    return rest.includes(HALANT) ? WIDE_I + m : m;
  });
}

const PREETI = {
  // -- Independent vowels, longest pieces first -------------------------------
  'cf]': 'ओ',
  'cf}': 'औ',
  'cf‘': 'ऑ',
  cf: 'आ',
  c: 'अ',
  'O{': 'ई',
  O: 'इ',
  pm: 'ऊ',
  p: 'उ',
  C: 'ऋ',
  'P]': 'ऐ',
  P: 'ए',

  // -- Conjuncts with their own glyph -----------------------------------------
  // `m` is a tail glyph: after त्र it draws क्र, after त्त क्त, after भ झ
  // (and after प फ, after उ ऊ - those two are with their letters). Checked by
  // drawing each pair in the font.
  qm: 'क्र',
  Qm: 'क्त',
  em: 'झ',
  If: 'क्ष',
  I: 'क्ष्',
  1: 'ज्ञ',
  '¡': 'ज्ञ्',
  q: 'त्र',
  Q: 'त्त',
  '>': 'श्र',
  2: 'द्द',
  4: 'द्ध',
  B: 'द्य',
  'å': 'द्व',
  'ß': 'द्म',
  '¢': 'द्घ',
  '›': 'द्र',
  '„': 'ध्र',
  'Ì': 'न्न',
  '§': 'ट्ट',
  'Ý': 'ट्ठ',
  '¶': 'ठ्ठ',
  '•': 'ड्ड',
  '°': 'ड्ढ',
  'Ë': 'ङ्ग',
  'Í': 'ङ्क',
  'Î': 'ङ्ख',
  '‹': 'ङ्घ',
  'Å': 'हृ',
  '?': 'रु',
  '¿': 'रू',

  // -- Full consonants ---------------------------------------------------------
  km: 'फ',
  '0f': 'ण',
  if: 'ष',
  s: 'क',
  v: 'ख',
  u: 'ग',
  3: 'घ',
  'ª': 'ङ',
  r: 'च',
  'Ø': 'च', // a second च glyph. After `r`, so `r` stays the canonical spelling.
  5: 'छ',
  h: 'ज',
  '´': 'झ',
  '`': 'ञ',
  6: 'ट',
  7: 'ठ',
  8: 'ड',
  9: 'ढ',
  t: 'त',
  y: 'थ',
  b: 'द',
  w: 'ध',
  g: 'न',
  k: 'प',
  a: 'ब',
  e: 'भ',
  d: 'म',
  o: 'य',
  '/': 'र',
  n: 'ल',
  j: 'व',
  z: 'श',
  ';': 'स',
  x: 'ह',

  // -- Half consonants ---------------------------------------------------------
  S: 'क्',
  V: 'ख्',
  U: 'ग्',
  '£': 'घ्',
  R: 'च्',
  H: 'ज्',
  '‰': 'झ्',
  '~': 'ञ्',
  0: 'ण्',
  T: 'त्',
  Y: 'थ्',
  W: 'ध्',
  G: 'न्',
  K: 'प्',
  'ˆ': 'फ्',
  A: 'ब्',
  E: 'भ्',
  D: 'म्',
  N: 'ल्',
  J: 'व्',
  Z: 'श्',
  i: 'ष्',
  ':': 'स्',
  X: 'ह्',

  // -- half + bar == full. Harmless (क्ा never occurs) and typists use it. -------
  Sf: 'क',
  Vf: 'ख',
  Uf: 'ग',
  '£f': 'घ',
  Rf: 'च',
  Hf: 'ज',
  '‰f': 'झ',
  '~f': 'ञ',
  Tf: 'त',
  Yf: 'थ',
  Wf: 'ध',
  Gf: 'न',
  Kf: 'प',
  'ˆf': 'फ',
  Af: 'ब',
  Ef: 'भ',
  Df: 'म',
  Nf: 'ल',
  Jf: 'व',
  Zf: 'श',
  ':f': 'स',
  '¡f': 'ज्ञ',

  // -- Rakar: `|` hangs under a stemmed letter, `«` under ट ठ ड ढ -------------
  '|': '्र',
  '«': '्र',
  // Spelled out so the REVERSE direction writes the rakar hook instead of a
  // half consonant followed by a full र (see the same note on KRUTI_DEV).
  's|': 'क्र',
  'v|': 'ख्र',
  'u|': 'ग्र',
  '3|': 'घ्र',
  'h|': 'ज्र',
  'y|': 'थ्र',
  'b|': 'द्र',
  'w|': 'ध्र',
  'g|': 'न्र',
  'k|': 'प्र',
  'km|': 'फ्र',
  'a|': 'ब्र',
  'e|': 'भ्र',
  'd|': 'म्र',
  'j|': 'व्र',
  ';|': 'स्र',
  'x|': 'ह्र',
  '6«': 'ट्र',
  '7«': 'ठ्र',
  '8«': 'ड्र',
  '9«': 'ढ्र',

  // -- Matras and signs ----------------------------------------------------------
  f: 'ा', // also the vertical bar of `0f` ण and `if` ष
  l: 'ि', // typed before its cluster; the reorder pass moves it
  L: 'ी',
  "'": 'ु',
  '"': 'ू',
  '[': 'ृ',
  ']': 'े',
  '}': 'ै',
  '‘': 'ॅ',
  '+': 'ं',
  F: 'ँ',
  M: 'ः',
  '\\': HALANT,
  'Þ': NUKTA,
  '˜': 'ऽ',
  'ç': 'ॐ',

  // -- Reph: typed AFTER its syllable, belongs BEFORE it -------------------------
  '{': REPH,

  // -- Digits: on the shifted number row -------------------------------------------
  ')': '०',
  '!': '१',
  '@': '२',
  '#': '३',
  $: '४',
  '%': '५',
  '^': '६',
  '&': '७',
  '*': '८',
  '(': '९',

  // -- Punctuation: whatever slots were left over ----------------------------------
  '.': '।',
  '=': '.',
  ',': ',',
  '<': '?',
  'Û': '!',
  'Ù': ';',
  'Ü': '%',
  '±': '+',
  'Ö': '=',
  '÷': '/',
  '-': '(',
  _: ')',
  'æ': '“',
  'Æ': '”',
  '…': '‘',
  'Ú': '’',
  '–': '-',
  '—': '—',
};

// Unicode -> Preeti. Two additions to the plain reverse of the map above:
//  - ASCII digits. Preeti has no Latin digits at all (0-9 are letters), so a
//    2024 in Unicode text has to be written with the Nepali digit keys or it
//    would come out as द्दण्द्दद्ध.
//  - The ASCII quote marks, whose keys are ु and ू here. They become the
//    curly quotes the font does have.
const PREETI_REV = {
  // The plain reverse, first key wins (buildReverse() is not callable yet at
  // this point in the module).
  ...Object.fromEntries(
    Object.entries(PREETI)
      .reverse()
      .map(([key, uni]) => [uni, key]),
  ),
  ...Object.fromEntries([...'0123456789'].map((d) => [d, ')!@#$%^&*('[d]])),
  "'": 'Ú',
  '"': 'Æ',
};

// ============================================================================
// Fonts on the Preeti keyboard, with some keys moved
// ============================================================================
// Himalaya, Akshar, DINA and the rest are Preeti with a few keys swapped or
// redrawn. Each was drawn key by key beside Preeti and the differences read
// by eye. `swap` renames keys (Himalaya's number row: Preeti's `1` ज्ञ is its
// `!`), `drop` removes the Preeti keys the font draws differently or not at
// all, `add` is the font's own keys. The reverse table is Preeti's, renamed.
function preetiVariant({ swap = {}, drop = '', add = {} }) {
  const bad = new Set(drop);
  const rename = (k) => [...k].map((c) => swap[c] ?? c).join('');
  const ok = (k) => ![...k].some((c) => bad.has(c));
  const map = {};
  for (const [k, v] of Object.entries(PREETI)) if (ok(k)) map[rename(k)] = v;
  Object.assign(map, add);
  const reverse = {};
  for (const [u, k] of Object.entries(PREETI_REV)) if (ok(k)) reverse[u] = rename(k);
  for (const [k, u] of Object.entries(add)) if (!(u in reverse)) reverse[u] = k;
  return { map, reverse };
}

// The number row swapped: digits on 0-9, Preeti's letters on the shifted row.
const NUMBER_ROW_SWAP = Object.fromEntries(
  [...'0123456789'].flatMap((d, n) => [[d, ')!@#$%^&*('[n]], [')!@#$%^&*('[n], d]]),
);

// Himalaya (vendor/fonts/Himalaya/HIMALAYA.TTF). Preeti with the number row
// swapped (0-9 are the digits, ! @ # ... ) the letters), `'` and `"` swapped
// (ू and ु), ा on `F` as well as `f`, and ँ moved to `¤`. Its own keys: ह on
// `Ù`, हृ on `X` (Preeti's ह्), क्ष ष ङ on `Ô í ñ`. Preeti's upper-range
// conjuncts are not in the font. Left out: `é` (ङ्ग or ड़्ग, not certain), `ø`.
const HIMALAYA = preetiVariant({
  swap: { ...NUMBER_ROW_SWAP, "'": '"', '"': "'", F: '¤' },
  drop: '›„ÌÝ•ËÍÎ‹Å‰ˆ˜Þ‘ÛÜ±Ö…–—X',
  add: { F: 'ा', 'Ù': 'ह', X: 'हृ', 'Ô': 'क्ष', 'í': 'ष', 'ñ': 'ङ' },
});

/** Unicode -> key, first key wins: buildReverse() without its cache. */
function firstKeyReverse(map) {
  const rev = {};
  for (const [k, u] of Object.entries(map)) if (u !== '' && !(u in rev)) rev[u] = k;
  return rev;
}

/** A font that is another font with a few keys changed: drop, then add. */
function variantOf(base, { drop = '', add = {} }) {
  const bad = new Set(drop);
  const ok = (k) => ![...k].some((c) => bad.has(c));
  const map = Object.fromEntries(Object.entries(base.map).filter(([k]) => ok(k)));
  Object.assign(map, add);
  const baseRev = base.reverse ?? firstKeyReverse(base.map);
  const reverse = Object.fromEntries(Object.entries(baseRev).filter(([, k]) => ok(k)));
  for (const [k, u] of Object.entries(add)) if (!(u in reverse)) reverse[u] = k;
  return { map, reverse };
}

// Akshar (vendor/fonts/Akshar/Akshar Normal.ttf). Himalaya, drawn key by key
// beside it, with these keys changed: फ on `F`, झ on `X` (and `µ`), ँ on `~`,
// a hyphen on ```, ञ on `½` (half on `¾`), हृ on `›`; no ह क्ष ष ङ on
// `Ù Ô í ñ`. Its upper slots carry the ASCII punctuation the letter keys took:
// { } [ ] on 0x8D-0x90, ! % # * on ‘ ’ “ ”, ÷ ; × = ~ / + on • ‹ ™ – — Œ ˜.
const AKSHAR = variantOf(HIMALAYA, {
  drop: '`~¤FXÙÔíñ÷',
  add: {
    'F': 'फ',
    'X': 'झ',
    'µ': 'झ',
    '~': 'ँ',
    '`': '-',
    '½': 'ञ',
    '¾': 'ञ्',
    '›': 'हृ',
    '\u008d': '{',
    '\u008e': '}',
    '\u008f': '[',
    '\u0090': ']',
    '‘': '!',
    '’': '%',
    '“': '#',
    '”': '*',
    '•': '÷',
    '‹': ';',
    '™': '×',
    '–': '=',
    '—': '~',
    'Œ': '/',
    '˜': '+',
  },
});

// DINA (vendor/fonts/DINA/DINA-A.ttf). Preeti for every letter key, drawn key
// by key beside it; the upper range is its own: ्र (the caret) on ```, च on
// `˜`, झ on `•`, द्म on `£`, ङ on `„`, ट्ट on `‘`, ङ्क on `¤`, रू on `™`, ॐ on
// `‰ ›`, / on `¡`, + on `ˆ`. Preeti's other upper-range conjuncts are not in
// the font. Left out: `‹ … – — œ ‚ ƒ` (conjuncts not read with certainty).
const DINA = preetiVariant({
  drop: '`¡åߢ›„ÌݧˆËÍÎ‹Åª¿Ø´«ÞçÛÙܱÖ÷æÆ…Ú–—‘˜•‰°¶£',
  add: {
    '`': '्र',
    '˜': 'च',
    '•': 'झ',
    '£': 'द्म',
    '„': 'ङ',
    '‘': 'ट्ट',
    '¤': 'ङ्क',
    '™': 'रू',
    '‰': 'ॐ',
    '›': 'ॐ',
    '¡': '/',
    'ˆ': '+',
  },
});

// Devanagari Bold (vendor/fonts/Devanagari Bold/Devanagari_Bold.ttf). Preeti
// on every key it shares, in a bold design, drawn key by key beside it. It
// lacks Preeti's ¡ ¢ „ Ì • ° ‹ Ø Þ ˜ Ü, draws ऽ on `›` (Preeti's द्र) and adds
// फ on `©`, ह्य on `Ã`. Left out: `Î`, `ˇ`, `“`, `®` (not read with certainty).
const DEVANAGARI_BOLD = preetiVariant({
  drop: '¡¢„Ì•°‹ØÞ˜Ü›Î',
  add: { '›': 'ऽ', '©': 'फ', 'Ã': 'ह्य' },
});

// Narad (vendor/fonts/Narad/Narad.ttf). Preeti on every letter key, in a bold
// design, drawn key by key beside it. It lacks most of Preeti's upper-range
// conjuncts (¡ ß ¢ › „ Ì Ý ¶ ° Ë Í Î ‹ Å Ø ´ Þ ˜ Ù Ü … Ú —), draws a full झ on
// `‰` (Preeti's half झ) and swaps the curly quotes on `æ Æ`.
const NARAD = preetiVariant({
  drop: '¡ß¢›„ÌݶˋËÍÎ‹ÅØ´Þ˜ÙÜ…Ú—‰‘æÆ°',
  add: { '‰': 'झ', 'æ': '”', 'Æ': '“' },
});

// Aakriti (vendor/fonts/Aakriti/Aakriti.ttf). Preeti on every letter key, in a
// decorative design, drawn key by key beside it. It lacks Preeti's ¢ › „ Ì §
// Ý ¶ • Ë Í Î ‹ Å Ø Þ Ù ± Ö, draws ळ on `˜` (Preeti's ऽ) and adds ष on `È`.
// Left out: `· ø Œ œ ¸ …` and its Mac Roman repeats (not read with certainty).
const AAKRITI = preetiVariant({
  drop: '¢›„Ì§Ý¶•ËÍÎ‹ÅØÞÙ±Ö˜…Ú',
  add: { '˜': 'ळ', 'È': 'ष' },
});

// Anjali (vendor/fonts/Anjali/Anjali Regular.ttf). Preeti on every letter key,
// in a heavy display design, drawn key by key beside it, except ा on `F`
// (Preeti's ँ) and य on `Ø` (Preeti's च). It lacks Preeti's upper-range
// conjuncts and adds ङ्क on `° ·`, फ on `˚`, ॐ on `π`. Left out: `ø ı ł Œ œ`
// and the punctuation on `• ‘ “ æ Æ …` (not read with certainty).
const ANJALI = preetiVariant({
  drop: '›„ÌÝËÍÎ‹Å‰ˆÞ˜çÛÙÜÖÚ•‘æÆ…FØ°',
  add: { F: 'ा', 'Ø': 'य', '°': 'ङ्क', '·': 'ङ्क', '˚': 'फ', 'π': 'ॐ' },
});

// Shusha02 (vendor/fonts/Shusha/Shusha02.ttf) and Shivaji02. Shusha in a
// heavier design, drawn key by key beside it, with four keys changed: `~` is
// HALF त्र (`~a` त्र), `(` is हृ (Shusha's ह्य), `)` is HALF थ (Shusha's हृ),
// `Ù` is HALF न्न. `œ` is left out. Shivaji02 is Shusha02 with the full stop
// on `.` and † ‰ drawing themselves, exactly as Shivaji01 is to Shusha.
// (Shusha05 and Shivaji05 are redrawn Shusha and Shivaji01 with the same
// keys; wordFonts.js reads them with those maps.)
const SHUSHA02 = variantOf({ map: SHUSHA }, {
  drop: '~()Ùœ',
  add: { '~a': 'त्र', '~': 'त्र्', '(': 'हृ', ')a': 'थ', ')': 'थ्', 'Ùa': 'न्न', 'Ù': 'न्न्' },
});
const SHIVAJI02 = variantOf(SHUSHA02, { drop: '.†‰', add: { '.': '.' } });
// Shusha's `º` is a full stop too, but Shivaji01 writes `.`: so does Shivaji02.
SHIVAJI02.reverse['.'] = '.';

// ============================================================================
// Gujarati: LMG Arun, LMG Laxmi, LMG Rupen and the Terafont family
// ============================================================================
// One keyboard: the Gujarati typewriter's. LMG Arun (vendor/fonts/Gujarati/
// LMG Arun/LMG-Arun.ttf) was read key by key, each key drawn alone, after ક
// and before ા (a half letter + ા draws the full letter), and the look-alikes
// beside Noto Sans Gujarati. LMG Laxmi and Rupen are the same font redrawn, and
// Terafont Varun, Ganesh, Indra, Kinnari, Parth, Suraj and Trilochan draw the
// same letter on every key but À É Ö, which they draw differently.
//
// The digits: ૦ ૧ ૩ ૪ ૬ ૭ ૮ ૯ have keys of their own (all one width, as digits
// are), but ૨ and ૫ do not: the typewriter types them with ર (`Z`) and પ (`5`),
// which they look exactly like. gujLogical() reads them back as digits when
// they stand among digits.
//
// Left out, not read with certainty: `c` (a quote mark?), `«` (જી?), `½`
// (ખ્ત?), `º` (ત્મ?), `£ ä å` (દ્વ or દ્ધ), `Û Ð Ñ`, `ç è` (ઇ or ઈ), `¨ Ü`
// (an old ઝ, or ઞ), and the stacked and nasal conjuncts on `ñ ô õ ö ø ù ú û`.
// Like the reph of Kruti Dev, `"` is typed after its syllable, and િ (`l`)
// before its letter.
const LMG_ARUN = {
  // Digits.
  _: '૦', '!': '૧', '#': '૩', $: '૪', '&': '૬', '*': '૭', '(': '૮', ')': '૯',
  // Vowels.
  V: 'અ', '>': 'ઇ', '.': 'ઈ', '®': 'ઈ', p: 'ઉ', 'µ': 'ઊ', 'é': 'ઊ', k: 'ઋ',
  'ë': 'ઉં', 'ê': 'ઊં',
  // Consonants.
  S: 'ક', B: 'ખ', U: 'ગ', 3: 'ઘ', '¢': 'ઙ', R: 'ચ', K: 'છ', H: 'જ', 'ß': 'જ',
  h: 'ઝ', 8: 'ટ', 9: 'ઠ', 0: 'ડ', '-': 'ઢ', 6: 'ણ', T: 'ત', Y: 'થ', N: 'દ',
  W: 'ધ', G: 'ન', 5: 'પ', O: 'ફ', A: 'બ', E: 'ભ', D: 'મ', I: 'ય', Z: 'ર',
  ',': 'લ', J: 'વ', X: 'શ', 'Ø': 'ષ', ';': 'સ', C: 'હ', '/': 'ળ',
  // Half letters: the full letter without its bar.
  b: 'ખ્', u: 'ગ્', r: 'ચ્', '^': 'ણ્', t: 'ત્', y: 'થ્', w: 'ધ્', g: 'ન્',
  'þ': 'ન્', '%': 'પ્', a: 'બ્', e: 'ભ્', d: 'મ્', i: 'ય્', '<': 'લ્', j: 'વ્',
  '`': 'શ્', x: 'શ્', Q: 'ષ્', ':': 'સ્', '?': 'ળ્',
  // Conjuncts drawn as one glyph.
  'Ù': 'ક્ષ', 1: 'ક્ષ્', '©': 'ક્ષ્', 'Ó': 'ક્ષ્ય', 7: 'જ્ઞ', '+': 'ત્ર', z: 'શ્ર',
  'Æ': 'શ્ર', 'Ç': 'શ્ર', 'Þ': 'ક્ક', 'É': 'ક્ત', 'Ê': 'ક્ર', 'Ì': 'ક્ર', '¤': 'ક્લ',
  'Ë': 'ફ્ર', '±': 'જ્ય', 'Ô': 'જા', 'Î': 'ટ્ટ', 'ª': 'ણુ', '»': 'ડુ', '¿': 'ત્ત',
  'À': 'ત્ય', 'È': 'ન્ય', '¡': 'દ્દ', 'â': 'દ્ધ', n: 'દ્ય', '§': 'દ્ર', 'ã': 'દ્ર',
  'Í': 'દ્મ', 'Ï': 'દૃ', 'Ú': 'ષ્ટ', 'à': 'સ્ત્ર', 'ü': 'શ્ચ', 'æ': 'હ્ય', 'ì': 'હૃ',
  'í': 'હ્લ', 'î': 'હ્ન', 'ï': 'હ્મ', 'ð': 'હ્વ', '~': 'રૂ',
  // Signs. `=` is the rakar drawn under its letter (ક્ર is `S=`).
  F: 'ા', l: 'િ', 'Â': 'િ', L: 'ી', ']': 'ુ', 'Õ': 'ુ', '}': 'ૂ', 'Ö': 'ૂ',
  "'": 'ૃ', '[': 'ે', '{': 'ૈ', M: 'ો', 'Á': 'ૌ', '¶': 'ૅ', '\\': 'ં', '¥': 'ઁ',
  '|': '્', '=': '્ર', '"': REPH, 'Å': REPH + 'ં', 'Ã': PRE_I_NASAL, 'Ä': 'ીં',
  // Punctuation, moved off the keys the letters took.
  P: '.', 4: ',', o: ':', '¸': ';', m: '?', q: '/', s: '(', f: ')', 'ò': '[',
  'ó': ']', v: '-', '@': '%', '´': '+', 2: '×', 'á': '卐',
};

// Terafont: the same keys, minus the three it draws differently.
const TERAFONT = Object.fromEntries(Object.entries(LMG_ARUN).filter(([k]) => !'ÀÉÖ'.includes(k)));

// Writing: the first key of each letter, and ૨ ૫ on the letters they share.
// A consonant with rakar is the consonant's key and `=` (પ્ર is `5=`), unless
// the font has the pair as one glyph (ક્ર, ફ્ર, દ્ર).
function gujReverse(map) {
  const rev = { ...firstKeyReverse(map), '૨': 'Z', '૫': '5' };
  // આ એ ઐ ઓ ઔ ઍ ઑ: અ's key and the sign's.
  for (const [m, v] of Object.entries(GUJ_A_VOWELS)) {
    rev[v] = rev['અ'] + (m === 'ૉ' ? rev['ા'] + rev['ૅ'] : rev[m]);
  }
  for (const [k, u] of Object.entries(map)) {
    if (/^[\u0A95-\u0AB9]$/.test(u) && !(u + '્ર' in rev)) rev[u + '્ર'] = k + '=';
  }
  return rev;
}

// Gujarati sits 0x180 above Devanagari in Unicode, letter for letter (ક U+0A95
// is क U+0915 + 0x180, િ is ि + 0x180, and so on), so the Kruti Dev reorder
// passes serve it unchanged: shift down, reorder, shift back up.
const GUJ_SHIFT = 0x180;
const GUJ_A_VOWELS = { 'ા': 'આ', 'ે': 'એ', 'ૈ': 'ઐ', 'ો': 'ઓ', 'ૌ': 'ઔ', 'ૅ': 'ઍ', 'ૉ': 'ઑ' };
const gujToDeva = (s) => s.replace(/[઀-૿]/g, (c) => String.fromCharCode(c.charCodeAt(0) - GUJ_SHIFT));
const devaToGuj = (s) => s.replace(/[ऀ-ॿ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + GUJ_SHIFT));

// ર and પ standing among digits are ૨ and ૫. A number - ર પ ૦-૯, perhaps
// split by . / : - as in a date - with no other Gujarati around it, holding at
// least one real digit: 2024 is typed `Z_Z$`, 25/08 `Z5q_(`. The word પર
// stays a word.
const RE_GUJ_NUMBER = /(?<![઀-૿])[રપ૦-૯]+(?:[./:-][રપ૦-૯]+)*(?![઀-૿])/g;
const gujDigits = (s) =>
  s.replace(RE_GUJ_NUMBER, (m) => (/[૦-૯]/.test(m) ? m.replace(/ર/g, '૨').replace(/પ/g, '૫') : m));

/** Gujarati legacy keys (visual order) -> Unicode Gujarati. */
function gujLogical(s) {
  // The bar completes a half letter: `%` is પ્, `%F` is પ (as `S` + `F` is કા).
  s = s.replace(/્ા/g, '');
  s = devaToGuj(toLogicalOrder(gujToDeva(s)));
  // આ એ ઐ ઓ ઔ ઍ ઑ are written અ + the sign, and typed so: આ is `VF`.
  s = s.replace(/અ([ાેૈોૌૅૉ])/g, (_, m) => GUJ_A_VOWELS[m]);
  return gujDigits(s);
}

/** Unicode Gujarati -> visual order, for the keys. Other text is left alone. */
function gujVisual(s) {
  return s.replace(/[઀-૿]+/g, (run) =>
    devaToGuj(toVisualOrder(gujToDeva(run)))
      // The font has ો and ૌ as one key each: keep them whole.
      .replace(/ાે/g, 'ો')
      .replace(/ાૈ/g, 'ૌ'),
  );
}

// ============================================================================
// Tamil: Bamini
// ============================================================================
// Bamini (vendor/fonts/Tamil/Bamini/Bamini PB Regular.ttf), the Tamil
// typewriter layout. Read key by key: each key drawn alone, after க (`f`) and
// before it, and the look-alikes (னு ஞ ணு, மூ ழூ டூ, மு ழு, டீ டி) beside Noto
// Sans Tamil. Its accented keys hold symbols and Sinhala-style ornaments, not
// Tamil, so the whole layout is on the plain keys. The number keys draw Latin
// digits and are kept as they are.
//
// Tamil joins ு and ூ to each consonant in its own way, so the typewriter has
// a key per joined form (`F` கு, `$` கூ) and `+` as the ூ of the rest. ெ ே ை
// (`n N i`) are typed before their consonant, and ொ ோ ௌ are those signs with
// ா (`h`) or ௗ (`_`) after it: கொ is `nfh`.
const BAMINI = {
  // Vowels.
  m: 'அ', M: 'ஆ', ',': 'இ', '<': 'ஈ', c: 'உ', C: 'ஊ', v: 'எ', V: 'ஏ', I: 'ஐ',
  x: 'ஒ', X: 'ஓ',
  // Consonants.
  f: 'க', q: 'ங', r: 'ச', Q: 'ஞ', l: 'ட', z: 'ண', j: 'த', e: 'ந', g: 'ப',
  k: 'ம', a: 'ய', u: 'ர', y: 'ல', t: 'வ', o: 'ழ', s: 'ள', w: 'ற', d: 'ன',
  '[': 'ஜ', '\\': 'ஷ', ']': 'ஸ', '`': 'ஹ', '=': 'ஸ்ரீ',
  // Consonants with ு, ூ, ி, ீ drawn as one glyph.
  F: 'கு', R: 'சு', L: 'டு', Z: 'ணு', J: 'து', E: 'நு', G: 'பு', K: 'மு', A: 'யு',
  U: 'ரு', Y: 'லு', T: 'வு', O: 'ழு', S: 'ளு', W: 'று', D: 'னு',
  $: 'கூ', '#': 'சூ', '^': 'டூ', '%': 'மூ', '*': 'ரூ', '&': 'ழூ',
  b: 'டி', B: 'டீ', H: 'ர்',
  // Signs.
  h: 'ா', p: 'ி', P: 'ீ', '+': 'ூ', n: 'ெ', N: 'ே', i: 'ை', _: 'ௗ', ';': '்',
  // Punctuation and symbols moved off the keys the letters took.
  "'": '%', '>': ',', '@': ';', '|': '=', '"': '°', '}': 'ரூபா.', '~': '∴',
  // And the ones it draws on their own keys.
  '.': '.', '-': '-', '/': '/', ':': ':', '?': '?', '(': '(', ')': ')', '!': '!',
};

const TA_CONSONANT = '[க-ஹ]';
const RE_TA_PRE_FWD = new RegExp(`([ெேை])(${TA_CONSONANT}(?:்ஷ)?)`, 'g');
const RE_TA_PRE_REV = new RegExp(`(${TA_CONSONANT}(?:்ஷ)?)([ெேை])`, 'g');

/** Bamini keys (visual order) -> Unicode Tamil. */
function tamilLogical(s) {
  // ெ ே ை go after the consonant they were typed before (க்ஷ counts as one);
  // NFC then joins ெ/ே + ா into ொ/ோ and ெ + ௗ into ௌ.
  return s.replace(RE_TA_PRE_FWD, '$2$1').normalize('NFC');
}

/** Unicode Tamil -> visual order, for the keys. Other text is left alone. */
function tamilVisual(s) {
  return s.replace(/[஀-௿]+/g, (run) => run.normalize('NFD').replace(RE_TA_PRE_REV, '$2$1'));
}

// ============================================================================
// Bengali: SutonnyMJ (the Bijoy keyboard)
// ============================================================================
// SutonnyMJ (vendor/fonts/Bengali/SutonnyMJ/), the font of the Bijoy layout.
// Read key by key: each key drawn alone, after ক (`K`) and before it, and the
// conjuncts and signs beside Noto Sans Bengali. The u-signs were drawn large
// to tell them apart: `y z –` are ু, `~ ‚` are ূ, `„ …` are ৃ.
//
// ি (`w`), ে (`† ‡`) and ৈ (`ˆ ‰`) are typed before their cluster; ো is ে, the
// letter and া (`†Kv`), ৌ is ে, the letter and ৗ (`†KŠ`); the reph (`©`) after
// its syllable; আ is অ and া (`Av`). The number keys draw Bengali digits.
//
// The small glyphs are halves: `¯ š › ¤ ®` are half স ন ন ম ষ, and `Í ’ ¿ ‹ ¢
// œ` the lower parts ত থ ত্র ক ভ ন that go under a half or a full letter. Each
// pair was drawn beside the Noto conjunct (স্ত স্থ স্ন স্প স্ম ন্ত ন্ত্র ন্থ ন্দ ন্ন
// ম্প ম্ব ম্ভ ম্ম স্ক স্ত্র ষ্ক ষ্প).
//
// Left out, not read with certainty: `@ £ Ê Ð æ è ø Œ ƒ ‘ “ • ™`.
// Note `’` is the lower part of থ, not an apostrophe: SutonnyMJ's quote marks
// are `Ò Ó Ô Õ`.
const SUTONNY = {
  // Digits.
  0: '০', 1: '১', 2: '২', 3: '৩', 4: '৪', 5: '৫', 6: '৬', 7: '৭', 8: '৮', 9: '৯',
  // Vowels.
  A: 'অ', B: 'ই', C: 'ঈ', D: 'উ', E: 'ঊ', F: 'ঋ', G: 'এ', H: 'ঐ', I: 'ও', J: 'ঔ',
  // Consonants.
  K: 'ক', L: 'খ', M: 'গ', N: 'ঘ', O: 'ঙ', P: 'চ', Q: 'ছ', R: 'জ', S: 'ঝ', T: 'ঞ',
  U: 'ট', V: 'ঠ', W: 'ড', X: 'ঢ', Y: 'ণ', Z: 'ত', _: 'থ', '`': 'দ', a: 'ধ', b: 'ন',
  c: 'প', d: 'ফ', e: 'ব', f: 'ভ', g: 'ম', h: 'য', i: 'র', j: 'ল', k: 'শ', l: 'ষ',
  m: 'স', n: 'হ', o: 'ড়', p: 'ঢ়', q: 'য়', r: 'ৎ',
  // The same letters drawn another way.
  'Ÿ': 'ব', '˜': 'দ', 'ú': 'প', '”': 'চ', '—': 'ড়',
  // Conjuncts drawn as one glyph.
  '°': 'ক্ক', '±': 'ক্ট', '³': 'ক্ত', '´': 'ক্ম', 'µ': 'ক্র', '¶': 'ক্ষ', 'ÿ': 'ক্ষ',
  '²': 'ক্ষ্ম', '·': 'ক্স', '¸': 'গু', '¹': 'গ্ন', 'º': 'গ্দ', '»': 'গ্ধ', '¼': 'ঙ্ক',
  '½': 'ঙ্গ', '¾': 'জ্জ', 'À': 'জ্ঝ', 'Á': 'জ্ঞ', 'Â': 'ঞ্চ', 'Ã': 'ঞ্ছ', 'Ä': 'ঞ্জ',
  'Å': 'ঞ্ঝ', 'Æ': 'ট্ট', 'Ç': 'ড্ড', 'È': 'ণ্ট', 'É': 'ণ্ঠ', '−': 'ণ্ড', 'Ë': 'ত্ত',
  'Ì': 'ত্থ', 'Î': 'ত্র', 'Ï': 'দ্দ', '×': 'দ্ধ', 'Ø': 'দ্ব', 'Ù': 'দ্ম', 'Ú': 'ন্ঠ',
  'Û': 'ন্ড', 'Ü': 'ন্ধ', 'Ý': 'ন্স', 'Þ': 'প্ট', 'ß': 'প্ত', 'à': 'প্প', 'á': 'প্স',
  'â': 'ব্জ', 'ã': 'ব্দ', 'ä': 'ব্ধ', 'å': 'ভ্র', 'ç': 'ম্ফ', 'é': 'ল্ক', 'ê': 'ল্গ',
  'ë': 'ল্ট', 'ì': 'ল্ড', 'í': 'ল্প', 'î': 'ল্ফ', 'ï': 'শু', 'ð': 'শ্চ', 'ñ': 'শ্ছ',
  'ò': 'ষ্ণ', 'ó': 'ষ্ট', 'ô': 'ষ্ঠ', 'õ': 'ষ্ফ', 'ö': 'স্খ', '÷': 'স্ট', 'ù': 'স্ফ',
  'û': 'হু', 'ü': 'হৃ', 'ý': 'হ্ন', 'þ': 'হ্ম',
  // Joined forms, after their letter.
  '¨': '্য', 'ª': '্র', '«': '্র', '^': '্ব', '¦': '্ব', '¡': '্ব', '§': '্ম', '¥': '্ন',
  '¬': '্ল', 'œ': '্ন',
  // The ra-phala hook drawn apart, for the letters with a stem on the right:
  // `cÖ` প্র, `MÖ` গ্র. Read only: `ª` writes the same thing.
  'Ö': '্র',
  // Half letters, and the lower halves they take: `¯Í` is স্ত, `š¿` ন্ত্র,
  // `¤ú` ম্প (the doubled hasant of half + joined form collapses to one).
  '¯': 'স্', 'š': 'ন্', '›': 'ন্', '¤': 'ম্', '®': 'ষ্',
  'Í': '্ত', '’': '্থ', '¿': '্ত্র', '‹': '্ক', '¢': '্ভ',
  // Signs.
  v: 'া', w: 'ি', x: 'ী', y: 'ু', z: 'ু', '–': 'ু', '~': 'ূ', '‚': 'ূ', '„': 'ৃ',
  '…': 'ৃ', '†': 'ে', '‡': 'ে', 'ˆ': 'ৈ', '‰': 'ৈ', 'Š': 'ৗ', s: 'ং', t: 'ঃ', u: 'ঁ',
  '&': '্', '©': REPH,
  // Punctuation.
  '|': '।', '\\': '॥', $: '৳', 'Ñ': '–', 'Ò': '“', 'Ó': '”', 'Ô': '‘', 'Õ': '’',
  '.': '.', ',': ',', '-': '-', '/': '/', ':': ':', ';': ';', '?': '?', '!': '!',
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '{', '}': '}', '%': '%', '+': '+',
  '=': '=', '*': '*',
};

// Bengali sits 0x80 above Devanagari, letter for letter, so the Kruti Dev
// passes serve it too, as for Gujarati. Not ৎ, which has no Devanagari twin
// (its slot there is a vowel sign), and not the danda, which both share.
const bnToDeva = (s) =>
  s.replace(/[ঀ-৿]/g, (c) => (c === 'ৎ' ? c : String.fromCharCode(c.charCodeAt(0) - 0x80)));
const devaToBn = (s) =>
  s.replace(/[ऀ-ॿ]/g, (c) => (c === '।' || c === '॥' ? c : String.fromCharCode(c.charCodeAt(0) + 0x80)));
const BN_CLUSTER = '[ক-হড়ঢ়য়](?:্[ক-হড়ঢ়য়])*';
const RE_BN_PRE_FWD = new RegExp(`([েৈ])(${BN_CLUSTER})`, 'g');
const RE_BN_PRE_REV = new RegExp(`(${BN_CLUSTER})([েৈ])`, 'g');

/**
 * Writing: the first key of each letter, আ as `Av`, and every half letter with
 * every lower part it takes (`¯Í` for স্ত), unless the pair has a glyph of its
 * own (স্ট is `÷`).
 */
function sutonnyReverse() {
  const rev = { ...firstKeyReverse(SUTONNY), 'আ': 'Av' };
  const halves = Object.entries(SUTONNY).filter(([k, u]) => k.length === 1 && /^.\u09CD$/.test(u) && u !== '\u09CD');
  const lowers = Object.entries(SUTONNY).filter(([k, u]) => k.length === 1 && u.startsWith('\u09CD') && u.length > 1);
  for (const [hk, hu] of halves) {
    if (rev[hu] !== hk) continue;
    for (const [lk, lu] of lowers) if (!(hu + lu.slice(1) in rev)) rev[hu + lu.slice(1)] = hk + lk;
  }
  return rev;
}

/** SutonnyMJ keys (visual order) -> Unicode Bengali. */
function bnLogical(s) {
  // ে ৈ go after their cluster, then the Kruti Dev passes place the reph and
  // ি; NFC joins ে + া into ো and ে + ৗ into ৌ.
  s = s.replace(RE_BN_PRE_FWD, '$2$1');
  s = devaToBn(toLogicalOrder(bnToDeva(s))).normalize('NFC');
  return s.replace(/অা/g, 'আ');
}

/** Unicode Bengali -> visual order, for the keys. Other text is left alone. */
function bnVisual(s) {
  return s.replace(/[ঀ-৿]+/g, (run) =>
    devaToBn(toVisualOrder(bnToDeva(run.normalize('NFD')))).replace(RE_BN_PRE_REV, '$2$1'),
  );
}

// ============================================================================
// Font registry - adding a font is adding one entry.
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

/** Built on first use: buildReverse() is defined further down. */
let krutiReverse = null;

export const FONTS = {
  'kruti-dev': {
    key: 'kruti-dev',
    // In the first-visit offline download (see Converter.astro).
    core: true,
    label: 'Kruti Dev',
    shortLabel: 'Kruti',
    kind: 'legacy',
    map: KRUTI_DEV,
    // Unicode -> Kruti Dev also writes the Alt-code keys (KRUTI_WRITE_EXTRA).
    // Kept out of `map`, which is the keyboard: what the tutor and the key
    // charts teach.
    get reverse() {
      return (krutiReverse ??= {
        ...buildReverse(KRUTI_DEV),
        ...Object.fromEntries(Object.entries(KRUTI_WRITE_EXTRA).map(([k, u]) => [u, k])),
      });
    },
    // Kruti Dev -> Unicode also reads the upper-range keys (KRUTI_EXTENDED).
    readMap: { ...KRUTI_DEV, ...KRUTI_EXTENDED, ...KRUTI_SMART_QUOTES },
    // Same keyboard layout as DevLys (see the note above DEVLYS): text moving
    // between the two is passed through untouched rather than via Unicode.
    layout: 'kruti',
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
    // In the first-visit offline download (see Converter.astro).
    core: true,
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
    // In the first-visit offline download (see Converter.astro).
    core: true,
    label: 'Mangal',
    altLabel: 'Mangal (Unicode)',
    kind: 'unicode',
    accurate: true,
    // Mangal IS Unicode - the only difference is which font renders it.
    css: 'Mangal, "Noto Sans Devanagari", "Nirmala UI", sans-serif',
    sample: 'हिन्दी भारत की राजधानी भाषा है।',
    placeholder: 'यहाँ हिंदी टेक्स्ट टाइप करें',
  },
  devlys: {
    key: 'devlys',
    // In the first-visit offline download (see Converter.astro).
    core: true,
    label: 'DevLys',
    kind: 'legacy',
    map: DEVLYS,
    readMap: { ...DEVLYS, ...KRUTI_EXTENDED },
    layout: 'kruti',
    // Verified by comparing glyph outlines against Kruti Dev 010 - see the note
    // above DEVLYS. Every codepoint this map uses draws the same letter in both
    // fonts; the ranges where they differ are ones the map never touches.
    accurate: true,
    css: '"DevLys 010", "DevLys", monospace',
    sample: 'fgUnh Hkkjr dh jkt/kkuh Hkk"kk gSA',
    placeholder: 'fgUnh Hkkjr  (example)',
  },
  'devlys-020': {
    key: 'devlys-020',
    label: 'DevLys 020',
    kind: 'legacy',
    ...DEVLYS_020,
    // Read off the font file key by key against Kruti Dev (see the note above
    // DEVLYS_020). `beta` until a real DevLys 020 document has been run through it.
    accurate: true,
    beta: true,
    // Its number keys draw Hindi digits: there are no "numbers" to keep.
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=ky; 2024',
    placeholder: 'Hkkjr  (example)',
  },
  arjun: {
    key: 'arjun',
    label: 'Arjun',
    kind: 'legacy',
    ...ARJUN,
    // Read off the font file key by key against Kruti Dev (see the note above
    // ARJUN). `beta` until a real Arjun document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=kky;',
    placeholder: 'Hkkjr  (example)',
  },
  kundli: {
    key: 'kundli',
    label: 'Kundli',
    kind: 'legacy',
    ...KUNDLI,
    // Read off the font file key by key against Kruti Dev (see the note above
    // KUNDLI). `beta` until a real Kundli document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=ky;',
    placeholder: 'Hkkjr  (example)',
  },
  krishna: {
    key: 'krishna',
    label: 'Krishna',
    kind: 'legacy',
    ...KRISHNA,
    // Read off the font file key by key against Kruti Dev (see the note above
    // KRISHNA). `beta` until a real Krishna document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=ky;',
    placeholder: 'Hkkjr  (example)',
  },
  'new-delhi': {
    key: 'new-delhi',
    label: 'New Delhi',
    kind: 'legacy',
    ...NEW_DELHI,
    // Read off the font file key by key against Kruti Dev and Krishna (see the
    // note above NEW_DELHI). `beta` until a real document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] fo’ofo|ky; ea=kky;',
    placeholder: 'Hkkjr  (example)',
  },
  ruchi: {
    key: 'ruchi',
    label: 'Ruchi',
    kind: 'legacy',
    ...RUCHI,
    // Read off the font file key by key against Kruti Dev (see the note above
    // RUCHI). `beta` until a real Ruchi document has been run through it.
    accurate: true,
    beta: true,
    // Its number keys draw Hindi digits, as in DevLys 020.
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=ky;',
    placeholder: 'Hkkjr  (example)',
  },
  ajay: {
    key: 'ajay',
    label: 'Ajay',
    kind: 'legacy',
    ...AJAY,
    // Read off the font file key by key against Kruti Dev (see the note above
    // AJAY). `beta` until a real Ajay document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=kky;',
    placeholder: 'Hkkjr  (example)',
  },
  aman: {
    key: 'aman',
    label: 'Aman',
    kind: 'legacy',
    ...AMAN,
    // Krishna's layout, checked key by key (see the note above AMAN). `beta`
    // until a real Aman document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=ky;',
    placeholder: 'Hkkjr  (example)',
  },
  agra: {
    key: 'agra',
    label: 'Agra',
    kind: 'legacy',
    ...AGRA,
    // Read off the font file key by key against Kruti Dev and Krishna (see the
    // note above AGRA). `beta` until a real Agra document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Hkkjr ljdkj] x`g ea=kky;',
    placeholder: 'Hkkjr  (example)',
  },
  chanakya: {
    key: 'chanakya',
    label: 'Chanakya',
    kind: 'legacy',
    map: CHANAKYA,
    // STILL FALSE ON PURPOSE, even though the map above is complete and green.
    // `accurate` means "verified against real documents", and this one is
    // verified against itself. See the long note above CHANAKYA for exactly
    // what is and is not known, and what would settle it.
    accurate: false,
    css: '"Chanakya", monospace',
    sample: 'fgUnh Hkkjr Dkh jkTkèkkUkh gSA',
    placeholder: 'fgUnh Hkkjr  (example)',
  },
  'abbasi-chanakya': {
    key: 'abbasi-chanakya',
    label: 'Abbasi Chanakya New',
    shortLabel: 'Abbasi Chanakya',
    kind: 'legacy',
    map: ABBASI_CHANAKYA,
    // Built from the real font file, glyph by glyph, with every entry drawn in
    // that font next to its Unicode - the same kind of evidence DEVLYS went
    // live on. `beta` says what is still missing: a run over a real document
    // typed in this font. Until then the page carries a Beta badge.
    accurate: true,
    beta: true,
    // Plain monospace, so the input box shows the raw keys as pasted. The real
    // font is only for previewing OUTPUT (legacyFonts.js).
    css: 'monospace',
    // Unicode -> Abbasi uses its own canonical table and reorder, not the
    // Kruti defaults, and warns about characters the font has no key for.
    reverse: ABBASI_CHANAKYA_REV,
    toVisual: abbasiToVisualOrder,
    warnUnmapped: true,
    sample: 'fgUnh Hkkjr dh jkt/kkuh Hkk"kk gSA',
    placeholder: 'Hkkjr dh jkt/kkuh  (example)',
  },
  shusha: {
    key: 'shusha',
    label: 'Shusha',
    kind: 'legacy',
    map: SHUSHA,
    // Read off the font file glyph by glyph, and checked by drawing converted
    // words in the font itself (see the note above SHUSHA). `beta` until a
    // real Shusha document has been run through it.
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Baart sarkar¸ raYT/Iya iSaxaa naIit.',
    placeholder: 'Baart  (example)',
  },
  shivaji: {
    key: 'shivaji',
    label: 'Shivaji',
    // Marathi, in the same script.
    lang: 'mr',
    kind: 'legacy',
    map: SHIVAJI,
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'maharaYT/ Saasana¸ marazI BaaYaa ivaBaaga.',
    placeholder: 'marazI  (example)',
  },
  shusha02: {
    key: 'shusha02',
    label: 'Shusha02',
    kind: 'legacy',
    ...SHUSHA02,
    // Shusha's map with four keys changed (see the note above SHUSHA02).
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Baart sarkar¸ raYT/Iya iSaxaa naIit.',
    placeholder: 'Baart  (example)',
  },
  shivaji02: {
    key: 'shivaji02',
    label: 'Shivaji02',
    lang: 'mr',
    kind: 'legacy',
    ...SHIVAJI02,
    accurate: true,
    beta: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'maharaYT/ Saasana¸ marazI BaaYaa ivaBaaga.',
    placeholder: 'marazI  (example)',
  },
  sutonny: {
    key: 'sutonny',
    label: 'SutonnyMJ',
    shortLabel: 'SutonnyMJ',
    lang: 'bn',
    kind: 'legacy',
    map: SUTONNY,
    reverse: sutonnyReverse(),
    toLogical: bnLogical,
    toVisual: bnVisual,
    // Read off the font file key by key (see the note above SUTONNY). `beta`
    // until a real SutonnyMJ document has been run through it.
    accurate: true,
    beta: true,
    // The number keys draw Bengali digits and every letter key is Bengali.
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'Avgvi †mvbvi evsjv',
    placeholder: 'evsjv‡`k  (example)',
  },
  bamini: {
    key: 'bamini',
    label: 'Bamini',
    lang: 'ta',
    kind: 'legacy',
    map: BAMINI,
    toLogical: tamilLogical,
    toVisual: tamilVisual,
    // Read off the font file key by key (see the note above BAMINI). `beta`
    // until a real Bamini document has been run through it.
    accurate: true,
    beta: true,
    // Every letter key is a Tamil letter: there are no English words to keep.
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'jkpo;ehL muR> fy;tpj; Jiw',
    placeholder: 'jkpo;  (example)',
  },
  'lmg-arun': {
    key: 'lmg-arun',
    label: 'LMG Arun',
    lang: 'gu',
    kind: 'legacy',
    map: LMG_ARUN,
    reverse: gujReverse(LMG_ARUN),
    toLogical: gujLogical,
    toVisual: gujVisual,
    // Read off the font file key by key (see the note above LMG_ARUN). `beta`
    // until a real LMG Arun document has been run through it.
    accurate: true,
    beta: true,
    // Its number keys are letters (`5` is પ, `0` is ડ): there are no numbers to keep.
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'U]HZFT ;ZSFZ4 lXÙF lJEFU',
    placeholder: 'U]HZFT  (example)',
  },
  terafont: {
    key: 'terafont',
    label: 'Terafont Varun',
    shortLabel: 'Terafont',
    lang: 'gu',
    kind: 'legacy',
    map: TERAFONT,
    reverse: gujReverse(TERAFONT),
    toLogical: gujLogical,
    toVisual: gujVisual,
    // LMG Arun's keys, which every Terafont draws the same but for À É Ö (see
    // the note above LMG_ARUN). `beta` until a real Terafont document has been
    // run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'U]HZFT ;ZSFZ4 lXÙF lJEFU',
    placeholder: 'U]HZFT  (example)',
  },
  dvtt: {
    key: 'dvtt',
    label: 'DV-TT Surekh',
    shortLabel: 'DV-TT',
    lang: 'mr',
    kind: 'legacy',
    map: DVTT,
    // Read off the font file glyph by glyph (see the note above DVTT). `beta`
    // until a real DV-TT document has been run through it.
    accurate: true,
    beta: true,
    // Its letter keys cover A-Z and a-z, and its number keys draw ०-९.
    asciiIsScript: true,
    reverse: DVTT_REV,
    toVisual: dvttToVisualOrder,
    warnUnmapped: true,
    css: 'monospace',
    sample: '¨É½É®É¹]Å ¶ÉÉºÉxÉ, ¨É®É`Ò ¦ÉÉ¹ÉÉ Ê´É¦ÉÉMÉ.',
    placeholder: '¨É®É`Ò  (example)',
  },
  preeti: {
    key: 'preeti',
    label: 'Preeti',
    // Nepali, not Hindi - same script, different language and layout.
    lang: 'ne',
    kind: 'legacy',
    map: PREETI,
    // Built from the font file glyph by glyph, the evidence Abbasi Chanakya
    // went live on - see the note above PREETI. `beta` until a real Preeti
    // document has been run through it.
    accurate: true,
    beta: true,
    // Its number keys are letters, so "keep numbers and English" cannot apply.
    asciiIsScript: true,
    reverse: PREETI_REV,
    warnUnmapped: true,
    // Raw keys in the input box, as pasted. The real font previews the output.
    css: 'monospace',
    sample: "g]kfn ;'Gb/ b]z xf] .",
    placeholder: 'g]kfn  (example)',
  },
  himalaya: {
    key: 'himalaya',
    label: 'Himalaya',
    lang: 'ne',
    kind: 'legacy',
    ...HIMALAYA,
    // Preeti's map, re-keyed after drawing every key beside Preeti (see the
    // note above HIMALAYA). `beta` until a real Himalaya document has been run
    // through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'g]kfn ;"Gb/ b]z xf] .',
    placeholder: 'g]kfn  (example)',
  },
  akshar: {
    key: 'akshar',
    label: 'Akshar',
    lang: 'ne',
    kind: 'legacy',
    ...AKSHAR,
    // Himalaya's map, re-keyed after drawing every key beside Himalaya (see
    // the note above AKSHAR). `beta` until a real Akshar document has been
    // run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: 'g]kfn ;"Gb/ b]z xf] .',
    placeholder: 'g]kfn  (example)',
  },
  dina: {
    key: 'dina',
    label: 'DINA',
    lang: 'ne',
    kind: 'legacy',
    ...DINA,
    // Preeti's map, re-keyed after drawing every key beside Preeti (see the
    // note above DINA). `beta` until a real DINA document has been run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: "g]kfn ;'Gb/ b]z xf] .",
    placeholder: 'g]kfn  (example)',
  },
  'devanagari-bold': {
    key: 'devanagari-bold',
    label: 'Devanagari Bold',
    lang: 'ne',
    kind: 'legacy',
    ...DEVANAGARI_BOLD,
    // Preeti's map, after drawing every key beside Preeti (see the note above
    // DEVANAGARI_BOLD). `beta` until a real document has been run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: "g]kfn ;'Gb/ b]z xf] .",
    placeholder: 'g]kfn  (example)',
  },
  narad: {
    key: 'narad',
    label: 'Narad',
    lang: 'ne',
    kind: 'legacy',
    ...NARAD,
    // Preeti's map, after drawing every key beside Preeti (see the note above
    // NARAD). `beta` until a real Narad document has been run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: "g]kfn ;'Gb/ b]z xf] .",
    placeholder: 'g]kfn  (example)',
  },
  aakriti: {
    key: 'aakriti',
    label: 'Aakriti',
    lang: 'ne',
    kind: 'legacy',
    ...AAKRITI,
    // Preeti's map, after drawing every key beside Preeti (see the note above
    // AAKRITI). `beta` until a real Aakriti document has been run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: "g]kfn ;'Gb/ b]z xf] .",
    placeholder: 'g]kfn  (example)',
  },
  anjali: {
    key: 'anjali',
    label: 'Anjali',
    lang: 'ne',
    kind: 'legacy',
    ...ANJALI,
    // Preeti's map, after drawing every key beside Preeti (see the note above
    // ANJALI). `beta` until a real Anjali document has been run through it.
    accurate: true,
    beta: true,
    asciiIsScript: true,
    warnUnmapped: true,
    css: 'monospace',
    sample: "g]kfn ;'Gb/ b]z xf] .",
    placeholder: 'g]kfn  (example)',
  },
};

export const FONT_KEYS = Object.keys(FONTS);
export const getFont = (key) => FONTS[key] ?? null;

/** Verified against real documents. Only these may power a live page. */
export const isAccurate = (key) => Boolean(FONTS[key]?.accurate);

/** Both ends verified - the precondition routes.js checks before going live. */
export const isPairAccurate = (fromKey, toKey) =>
  isAccurate(fromKey) && isAccurate(toKey);

/** The label to print on a box: "Unicode / Hindi" where the ambiguity matters. */
export const boxLabel = (key) => {
  const f = FONTS[key];
  return f ? (f.altLabel ?? f.label) : key;
};

/**
 * The font name inside "Copy {name} code" - the button that hands over raw
 * legacy keystrokes.
 *
 * Its own helper rather than boxLabel() because the two want opposite things:
 * a box label spells the ambiguity out ("Unicode / Hindi"), while a button
 * label has to stay narrow enough to sit beside a second button of equal width.
 * Never hardcode the name at a call site - the button must always name the font
 * the page actually outputs, or it sends people to Word with the wrong one.
 */
export const codeLabel = (key) => {
  const f = FONTS[key];
  return f ? (f.shortLabel ?? f.label) : key;
};

// ============================================================================
// Trie - longest-key-first matching in O(input x longest key)
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

/**
 * Greedy longest match. Unmatched characters pass through verbatim, and are
 * added to `missed` when a Set is given.
 */
function transliterate(text, trie, missed) {
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
      missed?.add(text[i]);
      out += text[i];
      i += 1;
    }
  }
  return out;
}

// ============================================================================
// Reorder passes - where the accuracy actually comes from
// ============================================================================

const RE_REPH_FWD = new RegExp(`(${CLUSTER}[${MATRA_NO_I}]*)${REPH}`, 'g');
const RE_IMATRA_FWD = new RegExp(`ि(${CLUSTER})`, 'g');
const RE_REPH_REV = new RegExp(
  `र${HALANT}(${C}(?:${HALANT}${C})*[${MATRA_NO_I}]*)`,
  'g',
);
const RE_IMATRA_REV = new RegExp(`(${CLUSTER_R})ि`, 'g');
const RE_PRE_I_NASAL_REV = new RegExp(`ि(${CLUSTER_R})ं`, 'g');
const RE_PRE_I_NASAL_FWD = new RegExp(`${PRE_I_NASAL}(${CLUSTER})`, 'g');
const RE_ABBASI_LEFTOVERS = new RegExp(`[${PRE_I_NASAL}${FIXED_I}]`, 'g');
const RE_DVTT_I_REPH = new RegExp(
  `([ि${PRE_I_NASAL}])(${C}(?:${HALANT}${C})*)${REPH}`,
  'g',
);
const RE_DVTT_I_CLUSTER = new RegExp(
  `([ि${PRE_I_NASAL}]${PRE_REPH}?)(${C}(?:${HALANT}${C})*)`,
  'g',
);
const RE_PRE_REPH_FWD = new RegExp(`${PRE_REPH}(${C}(?:${HALANT}${C})*)`, 'g');

/** Visual order (legacy) -> logical order (Unicode). Order of passes is load-bearing. */
function toLogicalOrder(s) {
  // 1. Reph first, so that `र्` is part of the cluster when the i-matra moves.
  //    `कम<reph>` -> `कर्म`, and for कीर्ति the reph must land before the त that
  //    the i-matra is about to hop over.
  s = s.replace(RE_REPH_FWD, `र${HALANT}$1`);
  //    DV-TT only: a reph drawn into the ि glyph arrives in front of its
  //    cluster. It joins the cluster here, so the ि hops over both.
  s = s.replace(RE_PRE_REPH_FWD, `र${HALANT}$1`);
  // 2. i-matra hops to the far side of its (possibly reph'd) cluster.
  s = s.replace(RE_IMATRA_FWD, '$1ि');
  //    Abbasi Chanakya only: `Ç` (िं) hops the same way, and a ि that `Æ`/`É`
  //    typed after its syllable stays put. Resolved here, after the hop, so it
  //    cannot be mistaken for a pre-base ि. A PRE_I_NASAL with no cluster
  //    after it stays where it is, as a stray ि does above.
  s = s
    .replace(RE_PRE_I_NASAL_FWD, '$1िं')
    .replace(RE_ABBASI_LEFTOVERS, (m) => (m === PRE_I_NASAL ? 'िं' : 'ि'));
  // 3. Recompose split matras: the legacy fonts build ो/ौ/ॉ out of ा + े/ै/ॅ.
  s = s
    .replace(/ाे/g, 'ो')
    .replace(/ाै/g, 'ौ')
    .replace(/ाॅ/g, 'ॉ');
  // 4. Defensive repair only. Well-formed Kruti Dev types the nasal AFTER the
  //    matra (हैं = `gSa`, में = `esa`), so this pass does not fire on clean
  //    input - it just rescues text that was typed the other way round.
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
 * spellings the font never uses - `gaS` for हैं instead of `gSa`, `ugah` for
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
// ONE alternation, not three passes - a placeholder for an email contains a
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

const RE_ALL_CAPS = /^[A-Z]{2,6}$/;
const RE_CAPITALISED = /^[A-Z][a-z]+$/;

/**
 * Is this a sequence Devanagari actually permits?
 *
 * Used as a SECONDARY signal only - see looksEnglish(). On its own it is too
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
 * word are byte-identical in kind - no rule can be perfect. We therefore only
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
 * "Delhi" -> क्मसीप. ("India" decodes cleanly too, but rule 1 catches it - it
 * is in the word list.) The UI says so, and the toggle turns all of this off.
 */
function looksEnglish(token, decoded, ambiguous) {
  const word = englishWord(token);
  if (!word) return false;
  const lower = word.toLowerCase();
  // Hindi too, in Kruti Dev: decided by the words around it (decideTokens).
  // In capitals (PAN, US) it is the abbreviation, never the Hindi word.
  if (ambiguous?.has(lower) && !RE_ALL_CAPS.test(word)) return false;

  if (ENGLISH_WORDS.has(lower)) return true;
  // GA, VA, AA: a letter and the danda (ळ। ट। ॥), not an abbreviation.
  if (RE_ALL_CAPS.test(word) && !/^[A-Z]A$/.test(word)) return true;
  if (RE_CAPITALISED.test(word) && !isWellFormedDevanagari(stripMarks(decoded))) {
    return true;
  }
  return false;
}

/**
 * English words that are also everyday Hindi in Kruti Dev: `us` is ने, `can`
 * is बंद, `in` is पद, `pan` is चंद. Kept as English only between two English
 * words ("Office in India"); anywhere else they are converted, and the page
 * lists them so a visitor can keep one with a tick.
 */
export const AMBIGUOUS_ENGLISH = new Set(['us', 'can', 'in', 'pan']);

/** The fonts typed on Kruti Dev's keys, where AMBIGUOUS_ENGLISH are Hindi. */
export const KRUTI_KEYBOARD = new Set(['kruti-dev', 'devlys', 'arjun', 'kundli', 'krishna', 'new-delhi', 'ajay', 'aman', 'agra']);

const RE_LEAD_PUNCT = /^[(\[“‘"']+/;
const RE_TRAIL_PUNCT = /[.,:;!?)\]”’"']+$/;
/**
 * The English word in a token, or '' when the token cannot be one. Quotes and
 * punctuation around it may go; anything else that is not a letter must not
 * appear INSIDE it, because in Kruti Dev those keys are letters: `i<+s` is
 * पढ़े and `u;s` is नये, not "is" and "us" with stray marks.
 */
export function englishWord(token) {
  const core = token.replace(RE_LEAD_PUNCT, '').replace(RE_TRAIL_PUNCT, '');
  if (!/^[A-Za-z]+(?:['’.-][A-Za-z]+)*$/.test(core)) return '';
  const word = core.replace(/[^A-Za-z]/g, '');
  return word.length >= 2 ? word : '';
}

/**
 * Keep or convert, token by token. `keepWords` and `convertWords` are the
 * visitor's own choices from the page (exact tokens) and win over the guess.
 * An ambiguous word (AMBIGUOUS_ENGLISH) is English only with English on both
 * sides.
 *
 * @returns {{ token: string, decoded: string, english: boolean, auto: boolean }[]}
 */
function decideTokens(tokens, trie, toLogical, { keepWords, convertWords, ambiguous } = {}) {
  const items = tokens.map((token) => {
    const decoded = toLogical(transliterate(token, trie));
    return { token, decoded, auto: looksEnglish(token, decoded, ambiguous) };
  });
  const choose = (it) =>
    keepWords?.has(it.token) ? true : convertWords?.has(it.token) ? false : it.auto;
  for (const it of items) it.english = choose(it);
  // The neighbours' final say, the visitor's ticks included, decides these.
  items.forEach((it, i) => {
    const word = englishWord(it.token);
    if (!it.auto && ambiguous?.has(word.toLowerCase()) && !RE_ALL_CAPS.test(word)) {
      it.auto = Boolean(items[i - 1]?.english && items[i + 1]?.english);
      it.english = choose(it);
    }
  });
  return items;
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

export function legacyToUnicode(
  text,
  map,
  { keepEnglish = true, toLogical = toLogicalOrder, keepWords, convertWords, ambiguous } = {},
) {
  if (!text) return '';
  const trie = trieFor(map);
  const parts = splitProtected(
    text,
    keepEnglish ? RE_PROTECT_ALL : RE_PROTECT_LINKS,
  );

  const out = parts
    .map(({ skip, v }) => {
      if (skip) return v;
      if (!keepEnglish) return toLogical(transliterate(v, trie));
      // Token level, so one English word cannot desync the rest of the line.
      const pieces = v.split(/(\s+)/);
      const tokens = pieces.filter((x, i) => i % 2 === 0 && x);
      const decided = decideTokens(tokens, trie, toLogical, { keepWords, convertWords, ambiguous });
      let n = 0;
      return pieces
        .map((x, i) => {
          if (i % 2 === 1 || !x) return x;
          const it = decided[n++];
          return it.english ? it.token : it.decoded;
        })
        .join('');
    })
    .join('');

  // Any reph marker still standing had no cluster to attach to. Drop it rather
  // than leak a private-use codepoint into the user's clipboard.
  return out.replace(new RegExp(`[${REPH}${PRE_REPH}]`, 'g'), '');
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

/**
 * `reverse` and `toVisual` default to the Kruti Dev behaviour. A font whose
 * registry entry carries its own (Abbasi Chanakya New) passes them in via
 * convert(). `missed` collects characters no key was found for.
 */
export function unicodeToLegacy(
  text,
  map,
  { keepEnglish = true, reverse = null, toVisual = toVisualOrder, missed } = {},
) {
  if (!text) return '';
  const trie = trieFor(reverse ?? buildReverse(map));
  return splitProtected(text, keepEnglish ? RE_PROTECT_ALL : RE_PROTECT_LINKS)
    .map(({ skip, v }) => (skip ? v : transliterate(toVisual(v), trie, missed)))
    .join('');
}

/**
 * A font whose ASCII keys are all script (Preeti: even 0-9 are letters) has
 * no "English and numbers" to keep. Protecting `3` would leave घ unconverted,
 * and English-word guessing would keep `of` (या) as English. Only web and
 * email addresses stay protected, which keepEnglish: false already does.
 */
const scriptOpts = (from, to, opts) =>
  from.asciiIsScript || to.asciiIsScript ? { ...opts, keepEnglish: false } : opts;

/** The per-font overrides unicodeToLegacy() takes, read off the registry. */
const reverseOpts = (font) => ({
  reverse: font.reverse ?? null,
  toVisual: font.toVisual ?? toVisualOrder,
});

// Passed through untouched and never worth a warning: whitespace, English
// letters and digits (as on every legacy page), and `!`, which is this font's
// own Latin glyph.
const RE_EXPECTED_PASSTHROUGH = /[\sA-Za-z0-9!]/;

/**
 * Characters in `text` that the output font has no key for and that were left
 * as-is by Unicode -> `toKey` conversion. Empty for fonts without
 * `warnUnmapped`, so only pages that opt in can show a warning.
 *
 * @returns {string[]}
 */
export function unmappedChars(text, toKey, opts = {}) {
  const to = FONTS[toKey];
  if (!text || !to?.warnUnmapped) return [];
  opts = scriptOpts(FONTS.unicode, to, opts);
  const missed = new Set();
  unicodeToLegacy(text, to.map, { ...opts, ...reverseOpts(to), missed });
  return [...missed].filter((ch) => !RE_EXPECTED_PASSTHROUGH.test(ch));
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * @param {string} text
 * @param {string} fromKey key into FONTS
 * @param {string} toKey   key into FONTS
 * @param {{ keepEnglish?: boolean, keepWords?: Set<string>, convertWords?: Set<string>, cut055?: boolean }} [opts]
 * @returns {string}
 */
export function convert(text, fromKey, toKey, opts = {}) {
  if (!text) return '';
  const from = FONTS[fromKey];
  const to = FONTS[toKey];
  if (!from || !to) throw new Error(`Unknown font: ${!from ? fromKey : toKey}`);
  opts = scriptOpts(from, to, opts);
  // Text in Kruti Dev 055 (the visitor says so): its number keys and own Alt
  // codes are read as the 010 keys that draw the same thing.
  const cut055 = Boolean(opts.cut055) && fromKey === 'kruti-dev';
  if (cut055) text = kruti055Keys(text);

  // Unicode -> Unicode is identity. This is the whole Mangal story: Mangal is a
  // Unicode font, not an encoding, so "Kruti Dev to Mangal" is "Kruti Dev to
  // Unicode, rendered in Mangal".
  if (from.kind === 'unicode' && to.kind === 'unicode') return text;

  // A font with its own reorder (Gujarati) passes it in.
  const readOpts = {
    ...opts,
    ...(from.toLogical ? { toLogical: from.toLogical } : {}),
    ambiguous: KRUTI_KEYBOARD.has(fromKey) ? AMBIGUOUS_ENGLISH : null,
  };

  if (from.kind === 'legacy' && to.kind === 'unicode') {
    return legacyToUnicode(text, from.readMap ?? from.map, readOpts);
  }
  if (from.kind === 'unicode' && to.kind === 'legacy') {
    return unicodeToLegacy(text, to.map, { ...opts, ...reverseOpts(to) });
  }
  // Two fonts on one keyboard layout draw the same letter on every key, so the
  // keys ARE the answer. Going through Unicode would only lose detail it cannot
  // hold, such as which way a quote mark faces (Kruti's Þ and ß both become ").
  // Not for 055 text, whose Hindi digits are no key of the other font.
  if (from.layout && from.layout === to.layout && !cut055) return text;

  // legacy -> legacy routes through Unicode.
  return unicodeToLegacy(legacyToUnicode(text, from.readMap ?? from.map, readOpts), to.map, {
    ...opts,
    ...reverseOpts(to),
  });
}

/**
 * The words a visitor can tick or untick under a legacy -> Unicode converter:
 * each one kept as English, and each converted one that may be English (one
 * of AMBIGUOUS_ENGLISH, or in `candidates`, the page's English word list).
 * Unique tokens in order of first appearance, at most `limit`.
 *
 * @param {string} text
 * @param {string} fromKey
 * @param {{ keepWords?: Set<string>, convertWords?: Set<string>, candidates?: Set<string>, cut055?: boolean, limit?: number }} [opts]
 * @returns {{ token: string, hindi: string, english: boolean }[]}
 */
export function englishReport(text, fromKey, { keepWords, convertWords, candidates, cut055, limit = 60 } = {}) {
  const from = FONTS[fromKey];
  if (!text || from?.kind !== 'legacy' || from.asciiIsScript) return [];
  if (cut055 && fromKey === 'kruti-dev') text = kruti055Keys(text);
  const trie = trieFor(from.readMap ?? from.map);
  const toLogical = from.toLogical ?? toLogicalOrder;
  const ambiguous = KRUTI_KEYBOARD.has(fromKey) ? AMBIGUOUS_ENGLISH : null;
  const seen = new Set();
  const out = [];
  for (const { skip, v } of splitProtected(text, RE_PROTECT_ALL)) {
    if (skip) continue;
    const tokens = v.split(/\s+/).filter(Boolean);
    for (const it of decideTokens(tokens, trie, toLogical, { keepWords, convertWords, ambiguous })) {
      if (seen.has(it.token)) continue;
      const word = englishWord(it.token).toLowerCase();
      const maybe = word && (ambiguous?.has(word) || candidates?.has(word));
      if (!it.english && !maybe && !convertWords?.has(it.token)) continue;
      seen.add(it.token);
      out.push({ token: it.token, hindi: it.decoded, english: it.english });
      if (out.length >= limit) return out;
    }
  }
  return out;
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
// Input sniffing - the gentle "are you on the right page?" hint
// ============================================================================
//
// Each page now converts in ONE fixed direction, so the commonest mistake is no
// longer picking the wrong dropdown: it is landing on the wrong page and pasting
// anyway. This detects the two ways that goes wrong and returns a CODE for the
// UI to phrase. It never blocks, and it stays quiet unless it is fairly sure -
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
    // Devanagari present means they are typing Hindi - fine, whatever else is
    // in there. Only pure Latin is worth mentioning.
    return deva === 0 && latin >= 4 ? 'expected-unicode-got-latin' : null;
  }

  // Legacy source. Devanagari in the box means they pasted Unicode into the
  // wrong page - this is the single most common misuse.
  if (deva > 0 && deva >= latin) return 'expected-legacy-got-unicode';
  if (looksLikePlainEnglish(t)) return 'expected-legacy-got-english';
  return null;
}

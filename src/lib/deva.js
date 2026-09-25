/**
 * The two Devanagari facts both transliteration engines need, and neither owns.
 *
 * translit.js (rules + Sanscript) and googleTranslit.js (the Input Tools API)
 * produce Hindi by completely different means, but they have to agree on two
 * things or the page would hand back a different string depending on whether
 * the network happened to be up:
 *
 *   - which spans of the input are STRUCTURE and must never be transliterated
 *   - how a nukta letter is spelled once it comes out
 *
 * This module exists so those two answers are written once. It deliberately
 * imports nothing: googleTranslit.js must stay free of Sanscript's ~33 KB of
 * scheme tables so it can be loaded on the first keystroke without dragging the
 * fallback engine in behind it.
 */

// ---------------------------------------------------------------------------
// Structure, not words
// ---------------------------------------------------------------------------

/**
 * Spans that are never transliterated by either engine.
 *
 * The rule engine would spell a URL out letter by letter; Google is worse, and
 * confidently returns `हत्तपः://गूगल.कॉम` for `https://google.com` because it
 * has no idea it was handed an address. Both are wrong in the same way, so both
 * are fixed here.
 */
export const PROTECTED = new RegExp(
  [
    '(?:[Hh][Tt][Tt][Pp][Ss]?://|[Ww][Ww][Ww]\\.)[^\\s<>"\']+', // URLs
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', // emails
  ].join('|'),
  'g',
);

/**
 * Cut text into alternating transliterate / pass-through spans.
 *
 * The pieces concatenate back to the original exactly, so a caller can map over
 * them and join without tracking offsets.
 *
 * @param {string} text
 * @returns {{ skip: boolean, v: string }[]}
 */
export function splitProtected(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    if (m.index > last) parts.push({ skip: false, v: text.slice(last, m.index) });
    parts.push({ skip: true, v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ skip: false, v: text.slice(last) });
  return parts;
}

// ---------------------------------------------------------------------------
// Nukta spelling
// ---------------------------------------------------------------------------

/**
 * Precomposed nukta letter -> consonant + combining nukta.
 *
 * Sanscript emits ड़ as the single codepoint U+095C, and so does Google. The
 * font engine in fontMaps.js builds it as ड followed by the combining nukta
 * U+093C, because that is what the Kruti Dev key `M+` actually is - a consonant
 * and a mark.
 *
 * The two look identical and are not equal. Left alone, a word typed on the
 * transliteration page would not match the same word from the converter in a
 * search, a database key or a spell-check, and round-tripping it through Kruti
 * Dev would silently rewrite the bytes. Unicode also discourages these
 * precomposed forms, so the combining pair is the right target for all three.
 *
 * NFD would do this, but it would also split ो into ा + े, which is a change
 * nobody asked for. So the substitution is explicit and covers only the nukta
 * block.
 */
// Written as escapes rather than literals, and derived rather than listed as
// pairs. Both halves of a hand-written pair are sequences of combining marks
// that look identical in an editor, so a typo in one is invisible; and a
// literal `ड़` in a source file may itself already be decomposed depending on
// what wrote it, which quietly turns the character class below into a broken
// range. Escapes are the only spelling that cannot drift.
const NUKTA = '़'; // the combining nukta mark

/** Precomposed codepoint -> the base consonant it is built from. */
const NUKTA_BASE = {
  'ऩ': 'न', // ṉ  <- न
  'ऱ': 'र', // ṟ  <- र
  'ऴ': 'ळ', // ḻ  <- ळ
  'क़': 'क', // qa <- क
  'ख़': 'ख', // ḵẖ <- ख
  'ग़': 'ग', // ġ  <- ग
  'ज़': 'ज', // za <- ज
  'ड़': 'ड', // ṛa <- ड
  'ढ़': 'ढ', // ṛha<- ढ
  'फ़': 'फ', // fa <- फ
  'य़': 'य', // ẏa <- य
};

const NUKTA_RE = /[ऩऱऴक़-य़]/g;

/** @param {string} s */
export const decomposeNukta = (s) =>
  s.replace(NUKTA_RE, (c) => NUKTA_BASE[c] + NUKTA);

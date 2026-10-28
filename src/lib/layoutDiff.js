/**
 * How a legacy font's keyboard compares with the font it was cloned from.
 *
 * Many of the converters are for fonts that share a keyboard with a better known
 * one: Ajay, Arjun, Kundli, Aman and others are Kruti Dev with a few keys moved
 * and more added; Narad, Dina, Anjali and others are Preeti; Shivaji is Shusha.
 * A visitor with a document in one of them wants to know how far the family
 * resemblance goes, and that is a fact about the maps, so it is read from the
 * maps: nothing here is typed by hand, and it cannot disagree with the converter.
 *
 * `layoutDiffFor` returns null for any page that is not "Unicode <-> one of
 * these fonts", so the block appears only where it says something true.
 */
import { FONTS, convert } from './fontMaps.js';
import { isUnicodeKey } from './wordFonts.js';

/** font -> the font whose keyboard it is compared with. */
export const LAYOUT_REFERENCE = {
  // Kruti Dev keyboard
  'devlys-020': 'kruti-dev',
  arjun: 'kruti-dev',
  kundli: 'kruti-dev',
  krishna: 'kruti-dev',
  'new-delhi': 'kruti-dev',
  ruchi: 'kruti-dev',
  ajay: 'kruti-dev',
  aman: 'kruti-dev',
  agra: 'kruti-dev',
  // Preeti keyboard
  himalaya: 'preeti',
  akshar: 'preeti',
  dina: 'preeti',
  'devanagari-bold': 'preeti',
  narad: 'preeti',
  aakriti: 'preeti',
  anjali: 'preeti',
  // Shusha keyboard
  shivaji: 'shusha',
  shusha02: 'shusha',
  shivaji02: 'shusha',
};

/**
 * A result that is only a vowel sign or a mark (the i-matra, the visarga) has no
 * letter to sit on, and a browser draws it as a broken box. It is shown on the
 * dotted circle, as dictionaries do. The row's data keeps the bare result.
 */
export const display = (value) => (/^\p{M}/u.test(value) ? `\u25CC${value}` : value);

/** Rows shown in either list, a guard rather than a limit any font reaches today. */
const CAP = 60;

// A key a person cannot see or type on its own says nothing a visitor can use.
const typable = (key) => !/^[\s\p{C}]$/u.test(key);

// What the letter looks like in the result, not the map's raw value: the maps
// hold private-use placeholders for pieces the converter reorders later (a short
// i before its letter), which would show as an empty box on the page. Converting
// the key gives the letter the visitor gets. An output with a placeholder or the
// replacement character left in it is not a letter, so that key is not listed.
const shown = (key, fontKey) => {
  const r = convert(key, fontKey, 'unicode');
  const out = typeof r === 'string' ? r : r.text;
  return out && !/[\uE000-\uF8FF\uFFFD]/u.test(out) ? out : null;
};

/** key -> the Unicode it gives, for the keys of a font's map that can be shown. */
function entriesOf(fontKey) {
  const m = FONTS[fontKey].map;
  const keys = m instanceof Map ? [...m.keys()] : Object.keys(m);
  const out = new Map();
  for (const k of keys) {
    if (!typable(k)) continue;
    const v = shown(k, fontKey);
    if (v !== null) out.set(k, v);
  }
  return out;
}

/**
 * @param {string} from font key of the box on the left
 * @param {string} to   font key of the box on the right
 * @returns {null | {
 *   font: string, ref: string, total: number, same: number,
 *   diff: { key: string, ref: string, own: string }[],
 *   extra: { key: string, own: string }[],
 *   missing: number,
 * }}
 */
export function layoutDiffFor(from, to) {
  if (!FONTS[from] || !FONTS[to]) return null;
  const fonts = [from, to].filter((k) => !isUnicodeKey(k));
  if (fonts.length !== 1) return null;
  const font = fonts[0];
  const ref = LAYOUT_REFERENCE[font];
  if (!ref || !FONTS[ref]?.map || !FONTS[font].map) return null;

  const refMap = entriesOf(ref);
  const own = entriesOf(font);
  const byKey = (a, b) => a.key.codePointAt(0) - b.key.codePointAt(0);
  let same = 0;
  const diff = [];
  const extra = [];
  for (const [key, value] of own) {
    if (!refMap.has(key)) extra.push({ key, own: value });
    else if (refMap.get(key) === value) same++;
    else diff.push({ key, ref: refMap.get(key), own: value });
  }
  const missing = [...refMap.keys()].filter((k) => !own.has(k)).length;
  return {
    font,
    ref,
    total: refMap.size,
    same,
    diff: diff.sort(byKey).slice(0, CAP),
    extra: extra.sort(byKey).slice(0, CAP),
    missing,
  };
}

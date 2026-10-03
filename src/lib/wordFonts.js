/**
 * The legacy fonts as Word knows them, for the document converter.
 *
 * `name`   the font set on converted text, exactly as it appears in Word's
 *          font list.
 * `match`  which font names in an uploaded document are this font: only the
 *          styles whose keys were checked against the map, each drawn in its
 *          own file. A style with other keys is left out on purpose: Krishna
 *          Italic is another layout, Agra Bold/Wide/Thin type त्र on `=` as
 *          Kruti Dev does, DINA30 was not read, DV-TTGanesh is another layout.
 * `label`  the short name used in the result summary.
 *
 * Tiny on purpose: the page's own script imports it (docMessages.js), while
 * docConvert.js and fontMaps.js load only when a file is dropped.
 */
export const WORD_FONTS = {
  'kruti-dev': { name: 'Kruti Dev 010', label: 'Kruti Dev', match: /kruti\s*dev/i },
  devlys: { name: 'DevLys 010', label: 'DevLys', match: /^devlys\s*010/i },
  'abbasi-chanakya': { name: 'Abbasi Chanakya New', label: 'Abbasi Chanakya', match: /abbasi/i },
  preeti: { name: 'Preeti', label: 'Preeti', match: /^preeti\b/i },
  // Shusha05 and Shivaji05 are redrawn Shusha and Shivaji01 on the same keys.
  shusha: { name: 'Shusha', label: 'Shusha', match: /^shusha(05)?$/i },
  shivaji: { name: 'Shivaji01', label: 'Shivaji', match: /^shivaji0?[15]$/i },
  dvtt: { name: 'DV-TTSurekh', label: 'DV-TT', match: /^dv-?tt\s*(surekh|yogesh)/i },
  shusha02: { name: 'Shusha02', label: 'Shusha02', match: /^shusha02$/i },
  shivaji02: { name: 'Shivaji02', label: 'Shivaji02', match: /^shivaji02$/i },
  // On the Kruti Dev keyboard, each with keys of its own.
  'devlys-020': { name: 'DevLys 020', label: 'DevLys 020', match: /^devlys\s*020/i },
  arjun: { name: 'Arjun', label: 'Arjun', match: /^arjun$/i },
  kundli: { name: 'Kundli', label: 'Kundli', match: /^kundli/i },
  krishna: { name: 'Krishna', label: 'Krishna', match: /^krishna( condensed| wide)?$/i },
  'new-delhi': { name: 'NewDelhi', label: 'New Delhi', match: /^new\s*delhi$/i },
  ruchi: { name: 'Ruchi-Normal', label: 'Ruchi', match: /^ruchi(-normal)?$/i },
  ajay: { name: 'Ajay Normal', label: 'Ajay', match: /^ajay( normal)?$/i },
  aman: { name: 'Aman Condensed', label: 'Aman', match: /^aman( condensed| thin| wide)?$/i },
  agra: { name: 'Agra', label: 'Agra', match: /^agra$/i },
  // Nepali, on the Preeti keyboard.
  himalaya: { name: 'HIMALAYA TT FONT', label: 'Himalaya', match: /^himalaya/i },
  akshar: { name: 'Akshar', label: 'Akshar', match: /^akshar$/i },
  dina: { name: 'DINA-A', label: 'DINA', match: /^dina-?(a|27)$/i },
  'devanagari-bold': { name: 'DevanagariBold', label: 'Devanagari Bold', match: /^devanagari\s*bold$/i },
  narad: { name: 'Narad', label: 'Narad', match: /^narad$/i },
  aakriti: { name: 'Aakriti', label: 'Aakriti', match: /^aakriti$/i },
  anjali: { name: 'Anjali', label: 'Anjali', match: /^anjali$/i },
};

/** Unicode output fonts offered for converted Hindi. */
export const UNICODE_FONTS = ['Mangal', 'Nirmala UI'];

/** Mangal is Unicode drawn in Mangal: the same text as "unicode". */
export const isUnicodeKey = (key) => key === 'unicode' || key === 'mangal';

/**
 * A conversion as { from, to } font keys. The two original directions are
 * still accepted, so 'to-unicode' is Kruti Dev -> Unicode.
 *
 * @param {'to-unicode' | 'to-kruti' | { from: string, to: string }} d
 * @returns {{ from: string, to: string }}
 */
export function pairOf(d) {
  if (d === 'to-unicode') return { from: 'kruti-dev', to: 'unicode' };
  if (d === 'to-kruti') return { from: 'unicode', to: 'kruti-dev' };
  return d;
}

/**
 * The name of a font in the result summary. `L` is the page's `doc` strings;
 * without it, the English.
 */
export function docLabel(key, L) {
  if (isUnicodeKey(key)) return L?.fontUnicode ?? 'Unicode';
  if (key === 'kruti-dev') return L?.fontKruti ?? 'Kruti Dev';
  return WORD_FONTS[key]?.label ?? key;
}

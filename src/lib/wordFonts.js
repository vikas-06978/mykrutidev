/**
 * The legacy fonts as Word knows them, for the document converter.
 *
 * `name`   the font set on converted text, exactly as it appears in Word's
 *          font list.
 * `match`  which font names in an uploaded document are this font. Only the
 *          versions whose keys were checked against the map: Shusha02/05 and
 *          Shivaji02/05 change keys, DevLys 020 puts digits on the number
 *          keys, DV-TTGanesh is another layout - so none of them match.
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
  shusha: { name: 'Shusha', label: 'Shusha', match: /^shusha$/i },
  shivaji: { name: 'Shivaji01', label: 'Shivaji', match: /^shivaji0?1$/i },
  dvtt: { name: 'DV-TTSurekh', label: 'DV-TT', match: /^dv-?tt\s*(surekh|yogesh)/i },
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

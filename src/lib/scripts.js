/**
 * The scripts beyond Devanagari. A page is in a script when either of its
 * fonts is (`lang` in fontMaps.js), and its Unicode side then takes that
 * script's font, lang, example text and Word font: Gujarati text set in Mangal
 * or labelled "Unicode / Hindi" would be wrong.
 *
 * `suffix` picks the i18n strings: converter.unicode<suffix>,
 * converter.copyUnicode<suffix> and converter.preview<suffix>.
 */
import { FONTS } from './fontMaps.js';
import { UNICODE_FONTS, UNICODE_FONTS_GU, UNICODE_FONTS_TA } from './wordFonts.js';

export const SCRIPTS = {
  deva: { lang: 'hi', cls: 'deva', css: null, wordFont: 'Mangal', unicodeFonts: UNICODE_FONTS, suffix: '' },
  gu: {
    lang: 'gu',
    cls: 'guj',
    css: 'var(--font-guj)',
    wordFont: 'Shruti',
    unicodeFonts: UNICODE_FONTS_GU,
    sample: 'ગુજરાત સરકાર, શિક્ષણ વિભાગ, ગાંધીનગર.',
    placeholder: 'ગુજરાત  (example)',
    suffix: 'Gu',
  },
  ta: {
    lang: 'ta',
    cls: 'tam',
    css: 'var(--font-tam)',
    wordFont: 'Latha',
    unicodeFonts: UNICODE_FONTS_TA,
    sample: 'தமிழ்நாடு அரசு, கல்வித் துறை.',
    placeholder: 'தமிழ்  (example)',
    suffix: 'Ta',
  },
};

/** The script of a font: its own for Gujarati and Tamil, else Devanagari. */
export const scriptOfFont = (key) => (FONTS[key]?.lang in SCRIPTS && FONTS[key].lang !== 'hi' ? FONTS[key].lang : 'deva');

/** The script of a page converting `from` -> `to`. */
export function scriptOfPage(from, to) {
  const a = scriptOfFont(from);
  return a !== 'deva' ? a : scriptOfFont(to);
}

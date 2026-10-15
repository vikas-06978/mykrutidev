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
import { UNICODE_FONTS, UNICODE_FONTS_GU, UNICODE_FONTS_TA, UNICODE_FONTS_BN } from './wordFonts.js';

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
  bn: {
    lang: 'bn',
    cls: 'ben',
    css: 'var(--font-ben)',
    wordFont: 'Vrinda',
    unicodeFonts: UNICODE_FONTS_BN,
    sample: 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার, শিক্ষা মন্ত্রণালয়।',
    placeholder: 'বাংলা  (example)',
    suffix: 'Bn',
  },
};

/**
 * Marathi and Nepali are written in Devanagari, so their pages keep the
 * Devanagari fonts and tools, but the Unicode box says what the text is:
 * "Unicode / Marathi", not "Unicode / Hindi", with an example in that language.
 * `suffix` picks converter.unicode<suffix>, converter.copyUnicode<suffix> and
 * converter.preview<suffix>.
 */
export const DEVA_LANGS = {
  mr: { lang: 'mr', suffix: 'Mr', sample: 'महाराष्ट्र शासन, शिक्षण विभाग, मुंबई.', placeholder: 'येथे मराठी मजकूर टाइप करा' },
  ne: { lang: 'ne', suffix: 'Ne', sample: 'नेपाल सरकार, शिक्षा मन्त्रालय, काठमाडौं।', placeholder: 'यहाँ नेपाली पाठ टाइप गर्नुहोस्' },
};

/** Marathi or Nepali for a Devanagari page whose legacy font is one of theirs, else null. */
export function devaLangOfPage(from, to) {
  for (const k of [from, to]) {
    const lang = FONTS[k]?.lang;
    if (lang && lang in DEVA_LANGS) return DEVA_LANGS[lang];
  }
  return null;
}

/** The script of a font: its own for Gujarati, Tamil and Bengali, else Devanagari. */
export const scriptOfFont = (key) => (FONTS[key]?.lang in SCRIPTS && FONTS[key].lang !== 'hi' ? FONTS[key].lang : 'deva');

/** The script of a page converting `from` -> `to`. */
export function scriptOfPage(from, to) {
  const a = scriptOfFont(from);
  return a !== 'deva' ? a : scriptOfFont(to);
}

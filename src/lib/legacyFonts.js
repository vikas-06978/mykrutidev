// ============================================================================
// Legacy preview fonts - OUTPUT PREVIEW ONLY
// ============================================================================
//
// One preview font per legacy font, and no picker.
//
// There used to be a dropdown of Kruti Dev variants (010, 011, 012, ...). It is
// gone on purpose: they all share the same keyboard layout and differ only in
// letterforms, so switching one changed nothing a user could act on. It looked
// like a setting that mattered and was not. The other variant files are still in
// public/fonts/ if a reason to surface them ever appears; nothing references them.
//
// Nothing here may be consulted by convert() or by either copy button. The
// preview changes how the output LOOKS. The character maps in fontMaps.js decide
// what it SAYS. If a future edit lets a font affect the produced text, that is a
// bug.
//
// `family` is the @font-face name declared in ../styles/legacy-fonts.css.
// `file` is the exact, CASE-SENSITIVE name in public/fonts/ that the face points
// at, recorded so the test suite can prove the two files agree: a typo would
// otherwise surface only in production, where hosts serve case-sensitively and
// Windows does not.
// `label` is the real installed face name, which is also what gets written into
// the .docx. Word resolves "Kruti Dev 010", not "Kruti Dev".
// `format` must describe the file's actual container, not its extension. Two of
// these are named .woff but are raw TrueType inside.

/**
 * @typedef {{
 *   label: string, family: string, file: string,
 *   format: 'woff' | 'truetype', stack: string
 * }} PreviewFont
 */

const preview = (label, file, format = 'woff') => ({
  label,
  family: `MKD ${label}`,
  file,
  format,
  stack: `"MKD ${label}", "${label}", monospace`,
});

/**
 * Keyed by font key in FONTS. Legacy fonts only; Unicode fonts render natively.
 *
 * Preeti's character map was read off this same file (see the note above
 * PREETI in fontMaps.js), so the preview shows exactly what the map means.
 *
 * Chanakya (Walkman-Chanakya) deliberately has NO entry: its pages are "coming
 * soon" and must not load any preview font. The file that used to sit here
 * (chanakya.woff) did not match the Chanakya map, so it was removed - see the
 * note above CHANAKYA in fontMaps.js.
 *
 * @type {Record<string, PreviewFont>}
 */
export const PREVIEW_FONTS = {
  'kruti-dev': preview('Kruti Dev 010', 'KRDEV010.woff'),
  devlys: preview('DevLys 010', 'devlys-010.woff'),
  // TODO(chanakya): once the real Walkman-Chanakya 905 font is supplied and its
  // glyphs are checked against FONTS.chanakya.map, add it to public/fonts/, add
  // its @font-face in ../styles/legacy-fonts.css, and register it here, e.g.
  //   chanakya: preview('Walkman-Chanakya 905', 'walkman-chanakya-905.woff'),
  // Converted from vendor/fonts/Abbasi Chanakya New/Abbasi Chanakya New.ttf,
  // the exact file the mapping was built from. Unrelated to Walkman-Chanakya.
  'abbasi-chanakya': preview('Abbasi Chanakya New', 'abbasi-chanakya-new.woff'),
  preeti: preview('Preeti', 'preeti.woff', 'truetype'),
  // Converted from vendor/fonts/Shusha/Shusha.ttf and Shivaji/Shivaji01.ttf,
  // the files their maps were read from.
  shusha: preview('Shusha', 'shusha.woff'),
  shivaji: preview('Shivaji01', 'shivaji01.woff'),
  // Converted from vendor/fonts/DV-TTSurekh/DV-TTSurekh.ttf, the file the
  // DV-TT map was read from.
  dvtt: preview('DV-TTSurekh', 'dvtt-surekh.woff'),
  // Converted from the files in vendor/fonts/ their maps were read from.
  arjun: preview('Arjun', 'arjun.woff'),
  kundli: preview('Kundli', 'kundli.woff'),
  krishna: preview('Krishna', 'krishna.woff'),
  'new-delhi': preview('NewDelhi', 'new-delhi.woff'),
  ruchi: preview('Ruchi-Normal', 'ruchi.woff'),
  'devlys-020': preview('DevLys 020', 'devlys-020.woff'),
  ajay: preview('Ajay Normal', 'ajay.woff'),
  aman: preview('Aman Condensed', 'aman.woff'),
  agra: preview('Agra', 'agra.woff'),
  himalaya: preview('HIMALAYA TT FONT', 'himalaya.woff'),
  akshar: preview('Akshar', 'akshar.woff'),
  dina: preview('DINA-A', 'dina.woff'),
  'devanagari-bold': preview('DevanagariBold', 'devanagari-bold.woff'),
  narad: preview('Narad', 'narad.woff'),
  aakriti: preview('Aakriti', 'aakriti.woff'),
  anjali: preview('Anjali', 'anjali.woff'),
};

/** The preview font for a font key, or null when it needs none. */
export const previewFontFor = (fontKey) => PREVIEW_FONTS[fontKey] ?? null;

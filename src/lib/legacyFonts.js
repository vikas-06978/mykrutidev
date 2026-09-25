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
 * Chanakya and Preeti are here because the owner supplied their files, but
 * neither has a verified character map, so no page converts to them yet. These
 * entries do nothing until that changes.
 *
 * @type {Record<string, PreviewFont>}
 */
export const PREVIEW_FONTS = {
  'kruti-dev': preview('Kruti Dev 010', 'KRDEV010.woff'),
  devlys: preview('DevLys 010', 'devlys-010.woff'),
  // The file was renamed to Walkman-Chanakya.woff, but its `name` table still
  // says "Chanakya" and its glyphs are unchanged - see the note above CHANAKYA
  // in fontMaps.js. The label stays "Chanakya" because that is what the face
  // actually is; renaming a file does not make it a different font.
  chanakya: preview('Chanakya', 'Walkman-Chanakya.woff', 'truetype'),
  // Converted from vendor/fonts/Abbasi Chanakya New/Abbasi Chanakya New.ttf,
  // the exact file the mapping was built from. Unrelated to the file above.
  'abbasi-chanakya': preview('Abbasi Chanakya New', 'abbasi-chanakya-new.woff'),
  preeti: preview('Preeti', 'preeti.woff', 'truetype'),
};

/** The preview font for a font key, or null when it needs none. */
export const previewFontFor = (fontKey) => PREVIEW_FONTS[fontKey] ?? null;

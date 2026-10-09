/**
 * The printable charts and practice sheets: what each one contains.
 *
 * Build time only (imports the converter). Nothing here is typed by hand:
 *
 *   keyboard / finger chart   positions and fingers from layout() - the call
 *                             the tutor's keyboard makes - and every label
 *                             from the Kruti Dev 010 FONT: the converter's
 *                             reading of each key, "-" only where the font
 *                             file has no glyph (chartRows)
 *   practice sheets           LEVELS - the tutor's own lessons, with each
 *                             drill's keystrokes from wholeKeys(), the
 *                             function the tutor's targets are built with
 *   matra & conjunct chart    wholeKeys() for the sequence and locate() for
 *                             which key and whether Shift is held
 *
 * printables.test.js holds every one of these to its source, so a chart
 * cannot disagree with the tutor or the converter.
 */

import { join } from 'node:path';
import { FONTS, convert } from './fontMaps.js';
import { glyphChecker } from './fontGlyphs.js';
import { layout, locate, FINGERS } from './remington.js';
import { LEVELS } from './lessons.js';
import { wholeKeys, buildVerifiedUnits } from './tutor.build.js';
import { SITE } from './routes.js';

/**
 * The printables. `pdf` names the file under /downloads/ (one per
 * language, see pdfFile); `pages` is how many A4 pages it must print
 * to - the build and the tests both check it.
 */
export const PRINTABLES = [
  { path: '/kruti-dev-keyboard', kind: 'keyboard', pdf: 'kruti-dev-keyboard-chart', landscape: true, pages: 1 },
  { path: '/hindi-typing-finger-chart', kind: 'fingers', pdf: 'hindi-typing-finger-chart', landscape: false, pages: 1 },
  { path: '/hindi-typing-practice-sheets', kind: 'sheets', pdf: 'hindi-typing-practice-sheets', landscape: false, pages: LEVELS.length },
  { path: '/kruti-dev-matra-chart', kind: 'matras', pdf: 'kruti-dev-matra-conjunct-chart', landscape: false, pages: 1 },
  { path: '/hindi-typing-progress-log', kind: 'log', pdf: 'hindi-typing-progress-log', landscape: false, pages: 1 },
  { path: '/kruti-dev-alphabet-chart', kind: 'alphabet', pdf: 'kruti-dev-alphabet-chart', landscape: false, pages: 1 },
];

export const printableFor = (path) => PRINTABLES.find((p) => p.path === path) ?? null;

/**
 * The QR code printed on each sheet leads back to the typing tutor, at the
 * lesson that sheet is about. Each practice sheet opens its own lesson, and the
 * matra chart opens the matras lesson.
 * `utm_*` lets Analytics count the visits that came from a printed sheet.
 * The #lesson-<id> part is read by the tutor (TypingTutor.astro).
 */
export const QR_PAGE = '/hindi-typing-test';
const QR_LESSON = { keyboard: 'home', fingers: 'home', matras: 'matras', alphabet: 'home' };

/** The lesson a printable's QR opens, or null for the tutor as it starts. */
export const qrLesson = (p, sheetId = null) => sheetId ?? QR_LESSON[p.kind] ?? null;

/**
 * The address inside the QR code.
 * @param {string} localPath  the tutor's path in the sheet's language, e.g. /hi/hindi-typing-test/
 * @param {{ kind: string }} p
 * @param {string | null} [sheetId]  a practice sheet's level id
 */
export function qrUrl(localPath, p, sheetId = null) {
  const lesson = qrLesson(p, sheetId);
  return `${SITE}${localPath}?utm_source=pdf&utm_medium=qr&utm_campaign=${p.kind}${lesson ? `#lesson-${lesson}` : ''}`;
}

/**
 * The file a visitor downloads: mykrutidev-kruti-dev-keyboard-chart.pdf, and
 * ...-hindi.pdf for the Hindi edition. It lives in public/downloads/ (written
 * by `npm run pdfs`), so the same path works in dev and in production.
 */
export const pdfFile = (p, lang) => `mykrutidev-${p.pdf}${lang === 'hi' ? '-hindi' : ''}.pdf`;
export const pdfHref = (p, lang) => `/downloads/${pdfFile(p, lang)}`;

/** Rows of caps, exactly as the tutor draws them (positions, fingers, home row). */
export const keyboardRows = () => layout(FONTS['kruti-dev'].map);

/**
 * The Kruti Dev 010 font file the site ships, and whether it draws a key.
 * From the project root, not import.meta.url: the build bundles this module
 * into another folder, where a relative path would point nowhere.
 */
export const KRUTI_FONT = join(process.cwd(), 'public', 'fonts', 'KRDEV010.woff');
const hasGlyph = glyphChecker(KRUTI_FONT);

const kruti2unicode = (keys) => convert(keys, 'kruti-dev', 'unicode', { keepEnglish: false });

/**
 * What a key types, as Unicode: the converter's reading of that one keystroke.
 *
 * A mark that attaches to its neighbour converts to nothing on its own - the
 * reph (Z) is typed AFTER the syllable it sits on - so for those the key is
 * read after a consonant (dZ = र्क) and the consonant is taken away (र्).
 */
export function keyLabel(ch) {
  const alone = kruti2unicode(ch);
  if (alone) return alone;
  const withBase = kruti2unicode(`d${ch}`);
  return withBase.replace(kruti2unicode('d'), '');
}

/** A sign with no shape of its own (ि, ्र, ़) goes on a dotted circle. */
const RE_MARK = /^[ऀ-ःऺ-ॏ॑-ॗॢॣ]/;
const onCircle = (s) => (RE_MARK.test(s) ? `◌${s}` : s);

/**
 * The keyboard chart: every key, normal and Shift, from the FONT. A key is
 * shown as typing nothing ("-") only when KRDEV010.woff has no glyph for it;
 * otherwise its label is keyLabel() - Hindi, or the punctuation the font
 * draws there (@ is /, $ is +).
 */
export function chartRows() {
  const label = (ch) => (hasGlyph(ch) ? keyLabel(ch) : '');
  return keyboardRows().map((row) =>
    row.map((cap) => {
      const base = label(cap.base);
      const shift = label(cap.shift);
      return {
        base: cap.base,
        shift: cap.shift,
        baseText: base,
        shiftText: shift,
        baseLabel: onCircle(base),
        shiftLabel: onCircle(shift),
        finger: cap.finger,
        home: cap.home,
      };
    }),
  );
}

/** The eight fingers that own letter keys, in legend order (thumb has only Space). */
export const LEGEND_FINGERS = FINGERS.filter((f) => f.id !== 'thumb');

/** Short labels printed on each key, so the finger chart works in black and white. */
export const FINGER_TAG = {
  'l-pinky': 'L5',
  'l-ring': 'L4',
  'l-middle': 'L3',
  'l-index': 'L2',
  thumb: 'T',
  'r-index': 'R2',
  'r-middle': 'R3',
  'r-ring': 'R4',
  'r-pinky': 'R5',
};

/**
 * One sheet per tutor level: its drills in Hindi and the keys that type each.
 * buildVerifiedUnits() is run on the whole level first - the same check the
 * tutor page runs - so a sheet cannot print keys the tutor would not accept.
 */
export function practiceSheets() {
  return LEVELS.map((level, i) => {
    buildVerifiedUnits(level.drills.join(' '), `printable sheet ${level.id}`);
    return {
      id: level.id,
      n: i + 1,
      drills: level.drills.map((deva) => ({ deva, keys: wholeKeys(deva) })),
    };
  });
}

/**
 * The matra and conjunct reference: an example of each, and the keys.
 * `mark` is what is being taught; `example` is a real syllable or word that
 * uses it (a matra cannot be typed alone).
 */
export const MATRA_ITEMS = [
  { id: 'i', mark: 'ि', example: 'कि' },
  { id: 'ii', mark: 'ी', example: 'की' },
  { id: 'u', mark: 'ु', example: 'कु' },
  { id: 'uu', mark: 'ू', example: 'कू' },
  { id: 'e', mark: 'े', example: 'के' },
  { id: 'ai', mark: 'ै', example: 'कै' },
  { id: 'o', mark: 'ो', example: 'को' },
  { id: 'au', mark: 'ौ', example: 'कौ' },
  { id: 'anusvara', mark: 'ं', example: 'कं' },
  { id: 'visarga', mark: 'ः', example: 'कः' },
  { id: 'ri', mark: 'ृ', example: 'कृ' },
  { id: 'rakar', mark: '्र', example: 'प्र' },
  { id: 'reph', mark: 'र्', example: 'कर्म' },
  { id: 'halant', mark: '्', example: 'क्य' },
  { id: 'ksha', mark: 'क्ष', example: 'क्ष' },
  { id: 'tra', mark: 'त्र', example: 'त्र' },
  { id: 'gya', mark: 'ज्ञ', example: 'ज्ञ' },
  { id: 'shra', mark: 'श्र', example: 'श्र' },
  { id: 'nukta', mark: '़', example: 'ड़' },
  { id: 'nuktaZa', mark: '़', example: 'ज़' },
];

/**
 * Each item with its keystrokes and, per keystroke, the physical key:
 * `{ ch: 'S', cap: 's', shift: true }`.
 */
export function matraRows() {
  return MATRA_ITEMS.map((item) => {
    const keys = wholeKeys(item.example);
    const steps = [...keys].map((ch) => {
      const at = locate(ch);
      if (!at) throw new Error(`printables: ${item.example} needs "${ch}", which no key types`);
      return { ch, cap: at.cap, shift: at.shift };
    });
    return { ...item, keys, steps };
  });
}

/**
 * The alphabet chart (varnamala): every vowel, consonant, digit and danda
 * with the keys that type it, and each consonant's half form.
 *
 * ङ and ञ are left out on purpose: no key of Kruti Dev 010 types them (the
 * converter passes them through untouched), and Hindi usually writes them
 * as the anusvara (गंगा, चंचल). A letter that has no key but a character of
 * the font's own (ऊ is Å) is typed with its Alt code on the number pad.
 */
export const ALPHABET = {
  vowels: ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ', 'अं', 'अः'],
  consonants: [
    ...'क ख ग घ च छ ज झ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व श ष स ह'.split(' '),
    'ड़',
    'ढ़',
  ],
  digits: ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९', '।', '॥'],
};

/** The letters the alphabet chart leaves out, and why: see ALPHABET. */
export const ALPHABET_MISSING = ['ङ', 'ञ'];

/**
 * One keystroke as the visitor presses it: a key (with Shift or not), or,
 * for a character on no key, its Alt code: Å is Alt + 0197.
 */
function stepOf(ch, what) {
  const at = locate(ch);
  if (at) return { ch, cap: at.cap, shift: at.shift };
  const code = ch.codePointAt(0);
  if (code >= 0xa0 && code <= 0xff) return { ch, alt: `0${code}` };
  throw new Error(`printables: ${what} needs "${ch}", which no key types`);
}

/** Every key sequence on the alphabet chart, checked to type its letter. */
export function alphabetRows() {
  const item = (deva) => {
    const keys = wholeKeys(deva);
    if (kruti2unicode(keys) !== deva) throw new Error(`printables: ${keys} does not type ${deva}`);
    return { deva, keys, steps: [...keys].map((ch) => stepOf(ch, deva)) };
  };
  return {
    vowels: ALPHABET.vowels.map(item),
    // The half form of ड़ ढ़ is not written in Hindi, so they have none.
    consonants: ALPHABET.consonants.map((c) => ({ ...item(c), half: /़/.test(c) ? null : item(`${c}्`) })),
    digits: ALPHABET.digits.map(item),
  };
}

/** Rows on the progress log. */
export const LOG_ROWS = 30;

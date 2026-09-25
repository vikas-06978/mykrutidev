/**
 * The printable charts and practice sheets: what each one contains.
 *
 * Build time only (imports the converter). Nothing here is typed by hand:
 *
 *   keyboard / finger chart   layout(FONTS['kruti-dev'].map) - the very call
 *                             RemingtonKeyboard.astro makes for the tutor
 *   practice sheets           LEVELS - the tutor's own lessons, with each
 *                             drill's keystrokes from wholeKeys(), the
 *                             function the tutor's targets are built with
 *   matra & conjunct chart    wholeKeys() for the sequence and locate() for
 *                             which key and whether Shift is held
 *
 * printables.test.js holds every one of these to its source, so a chart
 * cannot disagree with the tutor or the converter.
 */

import { FONTS } from './fontMaps.js';
import { layout, locate, FINGERS } from './remington.js';
import { LEVELS } from './lessons.js';
import { wholeKeys, buildVerifiedUnits } from './tutor.build.js';

/**
 * The five printables. `pdf` is the file under /downloads/ (one per language:
 * <pdf>-en.pdf and <pdf>-hi.pdf); `pages` is how many A4 pages it must print
 * to - the build and the tests both check it.
 */
export const PRINTABLES = [
  { path: '/kruti-dev-keyboard', kind: 'keyboard', pdf: 'kruti-dev-keyboard-chart', landscape: true, pages: 1 },
  { path: '/hindi-typing-finger-chart', kind: 'fingers', pdf: 'hindi-typing-finger-chart', landscape: false, pages: 1 },
  { path: '/hindi-typing-practice-sheets', kind: 'sheets', pdf: 'hindi-typing-practice-sheets', landscape: false, pages: LEVELS.length },
  { path: '/kruti-dev-matra-chart', kind: 'matras', pdf: 'kruti-dev-matra-conjunct-chart', landscape: false, pages: 1 },
  { path: '/hindi-typing-progress-log', kind: 'log', pdf: 'hindi-typing-progress-log', landscape: false, pages: 1 },
];

export const printableFor = (path) => PRINTABLES.find((p) => p.path === path) ?? null;

/** The file a visitor downloads, e.g. /downloads/kruti-dev-keyboard-chart-hi.pdf */
export const pdfHref = (p, lang) => `/downloads/${p.pdf}-${lang}.pdf`;

/** Rows of caps, exactly as the tutor draws them. */
export const keyboardRows = () => layout(FONTS['kruti-dev'].map);

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

/** Rows on the progress log. */
export const LOG_ROWS = 30;

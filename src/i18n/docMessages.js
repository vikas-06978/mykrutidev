/**
 * The "Convert a document" messages, in the page's language.
 *
 * src/lib/docConvert.js is conversion code and stays exactly as it is,
 * English messages included. This module sits between it and the page:
 *
 *  - an error message it returns is RECOGNISED (compared with the constants it
 *    exports) and swapped for the translated one;
 *  - the summary is rebuilt from the same `stats` object that summarize() is
 *    given, with the same arithmetic, in the page's words.
 *
 * i18n.test.js runs this with the English strings and asserts the result is
 * character-for-character what docConvert.js itself says, for every message
 * and a spread of stats - so if docConvert.js changes a message or a rule, the
 * test fails rather than the Hindi page quietly drifting from the English one.
 *
 * No import of docConvert.js here: it is loaded lazily, only when a file is
 * dropped, and this module is in the page's initial bundle. The caller passes
 * the loaded module in.
 */

import { fill } from './fill.js';
import { pairOf, isUnicodeKey, docLabel } from '../lib/wordFonts.js';

// Two messages docConvert.js writes inline rather than exporting. Pinned here
// and checked against checkFile() in i18n.test.js.
export const TOO_LARGE_EN =
  'This file is larger than 20 MB. Please split it into smaller files and convert them one at a time.';
export const ONLY_TYPES_EN = 'Only Word (.docx), Excel (.xlsx), .csv and .txt files can be converted here.';

/**
 * @param {string} msg  what checkFile() / messageFor() returned
 * @param {{ SAVE_AS_MESSAGE: string, PDF_MESSAGE: string, DAMAGED_MESSAGE: string, GENERIC_MESSAGE: string }} m
 *   the loaded docConvert module, or null if it failed to load
 * @param {Record<string, string>} L  the page's `doc` strings
 */
export function localizeDocMessage(msg, m, L) {
  if (!m) return L.generic;
  if (msg === m.PDF_MESSAGE) return L.pdf;
  if (msg === m.SAVE_AS_MESSAGE) return L.saveAs;
  if (msg.startsWith(m.SAVE_AS_MESSAGE)) return `${L.saveAs} ${L.passwordHint}`;
  if (msg === m.DAMAGED_MESSAGE) return L.damaged;
  if (msg === m.SHEET_SAVE_AS_MESSAGE) return L.sheetSaveAs;
  if (m.SHEET_SAVE_AS_MESSAGE && msg.startsWith(m.SHEET_SAVE_AS_MESSAGE)) return `${L.sheetSaveAs} ${L.sheetPasswordHint}`;
  if (msg === m.SHEET_DAMAGED_MESSAGE) return L.sheetDamaged;
  if (msg === m.GENERIC_MESSAGE) return L.generic;
  if (msg === TOO_LARGE_EN) return L.tooLarge;
  if (msg === ONLY_TYPES_EN) return L.onlyTypes;
  // A message this file does not know yet: better the real reason in English
  // than a vague one in Hindi. The test above makes this path rare.
  return msg;
}

const fmt = (n) => n.toLocaleString('en-IN');

/**
 * Mirror of summarize() in docConvert.js, worded from `L`.
 *
 * @param {{ paragraphs: number, tables: number, convertedChars: number, alreadyChars: number }} stats
 * @param {'to-unicode' | 'to-kruti' | { from: string, to: string }} direction
 * @param {Record<string, string>} L
 * @returns {{ line: string, share: string | null, warning: string | null }}
 */
export function localizeSummary(stats, direction, L) {
  const pair = pairOf(direction);
  const count = (n, one, many) => fill(n === 1 ? one : many, { n: fmt(n) });
  // A spreadsheet counts cells and sheets (sheetConvert.js); a document, paragraphs and tables.
  const parts =
    'cells' in stats
      ? [fill(L.summaryLine, { paragraphs: count(stats.cells, L.cellOne, L.cellMany) }), count(stats.sheets, L.sheetOne, L.sheetMany)]
      : [fill(L.summaryLine, { paragraphs: count(stats.paragraphs, L.paragraphOne, L.paragraphMany) })];
  if (stats.tables) parts.push(count(stats.tables, L.tableOne, L.tableMany));
  const line = parts.join(' · ');

  const fromUnicode = isUnicodeKey(pair.from);
  const from = docLabel(pair.from, L);
  const to = fromUnicode ? docLabel(pair.to, L) : docLabel('unicode', L);
  const { convertedChars: c, alreadyChars: a } = stats;

  if (c === 0) {
    const base = fromUnicode ? fill(L.noUnicode, { font: docLabel(pair.to, L) }) : fill(L.noLegacy, { font: from });
    const fonts = stats.fonts?.length ? ` ${fill(L.fontsUsed, { fonts: stats.fonts.join(', ') })}` : '';
    return { line, share: null, warning: base + fonts };
  }
  if (a === 0) return { line, share: L.allConverted, warning: null };

  const pct = Math.max(1, Math.floor((100 * c) / (c + a)));
  return { line, share: fill(L.partial, { pct, rest: 100 - pct, from, to }), warning: null };
}

/**
 * Spreadsheet conversion for the converter pages: .xlsx and .csv in, the same
 * file converted out. Runs entirely in the browser; nothing is uploaded.
 *
 * ---------------------------------------------------------------------------
 * .XLSX - CHANGE THE HINDI, NOTHING ELSE
 *
 * An .xlsx is a zip of XML parts, like a .docx. Text lives in three places
 * this file opens:
 *
 *   xl/sharedStrings.xml   most cell text, each string stored once and
 *                          pointed at by number from the cells (t="s")
 *   xl/worksheets/*.xml    the cells, and any "inline" strings (t="inlineStr")
 *   xl/comments*.xml       notes, whose runs carry their own font
 *
 * and reads a fourth, xl/styles.xml, for fonts. A cell's font is its style's
 * (cellXfs -> fontId -> fonts), and a rich-text run inside the string may set
 * its own (rFont). Numbers, dates, formulas and every other part - charts,
 * images, column widths, colours, borders, filters - are copied as they are.
 *
 * LEGACY FONT -> UNICODE (or another legacy font)
 *
 *   which text   a string shown in a cell whose font is the legacy font, and a
 *                rich-text run whose own rFont is. A font on the same keyboard
 *                counts (DevLys on a Kruti Dev page), and so does any other
 *                verified legacy font, converted from its own keys.
 *   the font     every legacy <font> in styles.xml is renamed to the target
 *                font in place, so the converted cells - and anything typed in
 *                them later - show in Mangal (or the chosen font).
 *   one string,  a shared string pointed at by a Kruti Dev cell AND an Arial
 *   two cells    cell is two different texts on screen. The Kruti Dev cells
 *                get a converted copy of their own; the other cells keep theirs.
 *
 * UNICODE -> LEGACY FONT
 *
 *   A string with Devanagari is converted. If it is all Hindi the cell gets a
 *   copy of its style in the legacy font. If it mixes English and Hindi, the
 *   string becomes rich text: the English keeps the cell's font, the Hindi is
 *   set in the legacy font - the only way one cell can show both.
 *
 * The Hindi itself is converted by the same functions the Word converter uses
 * (docConvert.js), which call convert() from fontMaps.js like the text boxes.
 *
 * ---------------------------------------------------------------------------
 * .CSV
 *
 * A CSV has no fonts. Every field is converted with the same English-keeping
 * default as a .txt (numbers, dates, URLs stay), after the file is split into
 * fields properly - a Kruti Dev quote mark is a letter, so converting the raw
 * file would break its quoting. Along with the CSV comes an .xlsx built from
 * it with the font already set, because Kruti Dev text in a CSV opens in
 * Calibri and looks like gibberish until the font is changed.
 * ---------------------------------------------------------------------------
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { convert, FONTS, krutiWordRun } from './fontMaps.js';
import { WORD_FONTS, pairOf, isUnicodeKey } from './wordFonts.js';
import { parseXml, attrs, inner, outer, decodeText, encodeText, encodeAttr, applyEdits } from './xmlScan.js';
import { UserError, SHEET_DAMAGED_MESSAGE as DAMAGED_MESSAGE, splitScripts, splitsSyllable, fontIs } from './docConvert.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const xlsxBlob = (bytes) => new Blob([bytes], { type: XLSX_MIME });

const DEVA = /[ऀ-ॿ઀-૿஀-௿ঀ-৿]/;
const DEVA_G = /[ऀ-ॿ઀-૿஀-௿ঀ-৿]/g;
const countDeva = (s) => (s.match(DEVA_G) || []).length;

// ---------------------------------------------------------------------------
// Small XML helpers. Element names may carry a prefix (x:si from some tools),
// so children are found by their local name and new elements reuse the prefix.
// ---------------------------------------------------------------------------

const local = (name) => name.replace(/^.*:/, '');
const prefixOf = (name) => (name.includes(':') ? name.slice(0, name.indexOf(':') + 1) : '');
const kid = (node, name) => node?.children.find((c) => local(c.name) === name) ?? null;
const kids = (node, name) => node?.children.filter((c) => local(c.name) === name) ?? [];
function* all(node, name) {
  for (const c of node.children) {
    if (local(c.name) === name) yield c;
    yield* all(c, name);
  }
}
/** An attribute by local name: `s`, or `x:s` from a prefixed writer. */
const attr = (a, name) => a[name] ?? Object.entries(a).find(([k]) => local(k) === name)?.[1];

function parse(xml, what) {
  try {
    return parseXml(xml);
  } catch (err) {
    throw new UserError(DAMAGED_MESSAGE, { cause: new Error(`${what}: ${err.message}`) });
  }
}

/**
 * Excel's own escape inside text: _xHHHH_ is one character (a line break is
 * often _x000D_), and a literal "_x" before four hex digits is written _x005F_.
 */
const unescapeX = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const escapeX = (s) =>
  s
    .replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_')
    // A carriage return too: XML would turn a raw one into a plain line break.
    .replace(/[\x00-\x08\x0B-\x1F]/g, (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`);
const readT = (xml, node) => unescapeX(decodeText(inner(xml, node)));
/** A <t> element: xml:space="preserve" only when a space at either end needs it. */
const tEl = (p, s) => {
  const body = encodeText(escapeX(s));
  return /^\s|\s$/.test(s) ? `<${p}t xml:space="preserve">${body}</${p}t>` : `<${p}t>${body}</${p}t>`;
};

// ---------------------------------------------------------------------------
// Which font is which
// ---------------------------------------------------------------------------

/**
 * The legacy font a name belongs to, as a font key: the page's FROM font (or
 * one on its keyboard), else any verified legacy font other than the target.
 * Null for Arial, Mangal and the like.
 */
function legacyKeyOf(name, pair) {
  if (!name || isUnicodeKey(pair.from)) return null;
  if (fontIs(name, pair.from)) return pair.from;
  for (const [k, w] of Object.entries(WORD_FONTS)) {
    if (k !== pair.to && FONTS[k]?.accurate && w.match.test(name)) return k;
  }
  return null;
}

/**
 * styles.xml as the parts this file needs: each font's name and XML, and each
 * cell style's font.
 */
function readStyles(xml) {
  if (!xml) return { xml: '', fonts: [], xfFont: [], fontsNode: null, xfsNode: null, root: null };
  const root = parse(xml, 'styles');
  const sheet = root.children.find((c) => local(c.name) === 'styleSheet');
  const fontsNode = kid(sheet, 'fonts');
  const xfsNode = kid(sheet, 'cellXfs');
  const fonts = kids(fontsNode, 'font').map((f) => {
    const nameNode = kid(f, 'name');
    return { node: f, name: nameNode ? decodeText(attr(attrs(xml, nameNode), 'val') ?? '') : '' };
  });
  const xfFont = kids(xfsNode, 'xf').map((x) => Number(attr(attrs(xml, x), 'fontId') ?? 0));
  return { xml, root, sheet, fonts, xfFont, fontsNode, xfsNode };
}

/**
 * A <font> as run properties (<rPr>): the same children, but its <name> is
 * called <rFont> there. The theme scheme is dropped from a run given a font of
 * its own, or Excel would draw the theme font instead.
 */
function fontToRPr(styles, fontId, p, fontName) {
  const f = styles.fonts[fontId] ?? styles.fonts[0];
  let body = '';
  if (f) {
    for (const c of f.node.children) {
      const n = local(c.name);
      if (n === 'name') {
        if (!fontName) body += outer(styles.xml, c).replace(/<(\/?)([\w]+:)?name\b/g, `<$1${p}rFont`);
      } else if (!(fontName && (n === 'scheme' || n === 'charset'))) {
        body += outer(styles.xml, c);
      }
    }
  }
  if (fontName) body = `<${p}rFont val="${encodeAttr(fontName)}"/>` + body;
  return `<${p}rPr>${body}</${p}rPr>`;
}

/** Set a run's rFont, dropping the theme scheme and symbol charset. */
function withRFont(rPrXml, fontName, p) {
  const f = `<${p}rFont val="${encodeAttr(fontName)}"/>`;
  if (!rPrXml) return `<${p}rPr>${f}</${p}rPr>`;
  let out = rPrXml
    .replace(/<([\w]+:)?(scheme|charset)\b[^>]*\/>/g, '')
    .replace(/<([\w]+:)?rFont\b[^>]*\/>/g, '');
  out = out.replace(/^<([\w]+:)?rPr\s*\/>$/, `<${p}rPr></${p}rPr>`);
  return out.replace(/^(<([\w]+:)?rPr\b[^>]*>)/, `$1${f}`);
}

// ---------------------------------------------------------------------------
// One string (<si>, <is> or a comment's <text>)
// ---------------------------------------------------------------------------

/**
 * The runs of a string element: a plain string is one run with no properties.
 * @returns {{ rich: boolean, runs: { rPr: string, font: string | null, text: string }[], p: string, tail: string }}
 */
function readString(xml, node) {
  const p = prefixOf(node.name);
  const rs = kids(node, 'r');
  // Phonetic guides (rPh, phoneticPr) are kept after the text as they were.
  const tail = node.children
    .filter((c) => ['rPh', 'phoneticPr'].includes(local(c.name)))
    .map((c) => outer(xml, c))
    .join('');
  if (!rs.length) {
    const t = kid(node, 't');
    return { rich: false, runs: [{ rPr: '', font: null, text: t ? readT(xml, t) : '' }], p, tail };
  }
  const runs = rs.map((r) => {
    const rPr = kid(r, 'rPr');
    const rFont = rPr && kid(rPr, 'rFont');
    const t = kid(r, 't');
    return {
      rPr: rPr ? outer(xml, rPr) : '',
      font: rFont ? decodeText(attr(attrs(xml, rFont), 'val') ?? '') : null,
      text: t ? readT(xml, t) : '',
    };
  });
  return { rich: true, runs, p, tail };
}

const writeString = (str) =>
  str.rich
    ? str.runs.map((r) => `<${str.p}r>${r.rPr}${tEl(str.p, r.text)}</${str.p}r>`).join('') + str.tail
    : tEl(str.p, str.runs[0].text) + str.tail;

/** Legacy -> target for one piece of text in font `key` (named `name`). */
function legacyText(text, key, name, pair) {
  let s = text;
  // In a Kruti Dev font, curly quotes and dashes pasted from Word are letters.
  if (/kruti\s*dev/i.test(name ?? '')) s = krutiWordRun(s, name);
  const opts = { keepEnglish: false };
  const unicode = convert(s, key, 'unicode', opts);
  // Hindi already in Unicode in a legacy-font cell comes through as it is.
  const already = countDeva(s);
  return { out: isUnicodeKey(pair.to) ? unicode : convert(s, key, pair.to, opts), chars: countDeva(unicode) - already, already };
}

/**
 * Convert one string, legacy -> target.
 *
 * @param {string} cellFont  the font of the cell showing it ('' for a note)
 * @returns {{ inner: string, chars: number, already: number, changed: boolean }}
 */
function legacyString(xml, node, cellFont, pair, target) {
  const str = readString(xml, node);
  let chars = 0;
  let already = 0;
  let changed = false;
  const out = [];
  let group = null; // { key, name, runs: [] }
  const flush = () => {
    if (!group) return;
    const text = group.runs.map((r) => r.text).join('');
    const r = legacyText(text, group.key, group.name, pair);
    chars += r.chars;
    already += r.already;
    const first = group.runs[0];
    const rPr = first.font ? withRFont(first.rPr, target, str.p) : first.rPr;
    out.push({ rPr, font: first.font ? target : null, text: r.out });
    changed = true;
    group = null;
  };
  for (const run of str.runs) {
    const name = run.font ?? cellFont;
    const key = legacyKeyOf(name, pair);
    if (!key || !run.text) {
      flush();
      already += countDeva(run.text);
      out.push(run);
      continue;
    }
    if (group) {
      const last = group.runs[group.runs.length - 1];
      const same = group.key === key && group.name.toLowerCase() === name.toLowerCase();
      if (same && (last.rPr === run.rPr || splitsSyllable(last.text, run.text, key))) {
        group.runs.push(run);
        continue;
      }
      flush();
    }
    group = { key, name, runs: [run] };
  }
  flush();
  return { inner: writeString({ ...str, runs: out }), chars, already, changed };
}

/**
 * Convert one string, Unicode -> legacy font `target` (named `fontName`).
 * `cellRPr` is the cell's own font as run properties, for the English part
 * of a string that has to become rich text.
 *
 * @returns {{ inner: string, chars: number, changed: boolean, wholeCell: boolean }}
 *   wholeCell: every character is now in the legacy font, so the cell's
 *   STYLE should change (and the string stays plain).
 */
function unicodeString(xml, node, pair, fontName, cellRPr) {
  const str = readString(xml, node);
  if (!str.runs.some((r) => DEVA.test(r.text))) return { inner: '', chars: 0, changed: false, wholeCell: false };
  let chars = 0;
  const unicodeToLegacy = (s) => convert(s, 'unicode', pair.to, { keepEnglish: true });

  if (!str.rich) {
    const parts = splitScripts(str.runs[0].text);
    for (const part of parts) if (part.hindi) chars += countDeva(part.s);
    if (parts.length === 1 && parts[0].hindi) {
      return { inner: tEl(str.p, unicodeToLegacy(parts[0].s)) + str.tail, chars, changed: true, wholeCell: true };
    }
    const runs = parts.map((part) =>
      part.hindi
        ? { rPr: withRFont(cellRPr(str.p), fontName, str.p), text: unicodeToLegacy(part.s) }
        : { rPr: cellRPr(str.p), text: part.s },
    );
    return { inner: writeString({ ...str, rich: true, runs }), chars, changed: true, wholeCell: false };
  }

  const runs = [];
  for (const run of str.runs) {
    if (!DEVA.test(run.text)) {
      runs.push(run);
      continue;
    }
    for (const part of splitScripts(run.text)) {
      if (part.hindi) {
        chars += countDeva(part.s);
        runs.push({ rPr: withRFont(run.rPr || cellRPr(str.p), fontName, str.p), text: unicodeToLegacy(part.s) });
      } else {
        runs.push({ rPr: run.rPr, text: part.s });
      }
    }
  }
  return { inner: writeString({ ...str, runs }), chars, changed: true, wholeCell: false };
}

// ---------------------------------------------------------------------------
// The whole .xlsx
// ---------------------------------------------------------------------------

const SHEET_PART = /^xl\/worksheets\/[^/]+\.xml$/i;
const COMMENTS_PART = /^xl\/comments[^/]*\.xml$/i;

/**
 * @typedef {{ cells: number, sheets: number, convertedChars: number, alreadyChars: number }} SheetStats
 */

/**
 * @param {Uint8Array} bytes
 * @param {{
 *   direction: 'to-unicode' | 'to-kruti' | { from: string, to: string },
 *   unicodeFont?: string,
 *   onProgress?: (fraction: number) => void,
 * }} opts
 * @returns {Promise<{ bytes: Uint8Array, stats: SheetStats }>}
 */
export async function convertXlsx(bytes, { direction, unicodeFont = 'Mangal', onProgress }) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const report = async (f) => {
    onProgress?.(Math.min(1, f));
    await tick();
  };
  await report(0.02);

  let files;
  try {
    files = unzipSync(bytes);
  } catch (err) {
    throw new UserError(DAMAGED_MESSAGE, { cause: err });
  }
  const names = Object.keys(files);
  const sheets = names.filter((n) => SHEET_PART.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!files['xl/workbook.xml'] || !sheets.length) {
    throw new UserError(DAMAGED_MESSAGE, { cause: new Error('No xl/workbook.xml or worksheets') });
  }

  const pair = pairOf(direction);
  const toUnicode = isUnicodeKey(pair.to);
  const fromUnicode = isUnicodeKey(pair.from);
  const target = toUnicode ? unicodeFont : WORD_FONTS[pair.to].name;
  const read = (n) => (files[n] ? strFromU8(files[n]) : '');

  const styles = readStyles(read('xl/styles.xml'));
  const fontOfStyle = (s) => styles.fonts[styles.xfFont[s] ?? 0]?.name ?? styles.fonts[0]?.name ?? '';

  // Shared strings: parsed once, each <si> by number.
  const sstName = 'xl/sharedStrings.xml';
  const sstXml = read(sstName);
  const sstRoot = sstXml ? parse(sstXml, 'sharedStrings') : null;
  const sst = sstRoot ? sstRoot.children.find((c) => local(c.name) === 'sst') : null;
  const sis = sst ? kids(sst, 'si') : [];
  const sstEdits = [];
  /** Converted strings appended to the table: their XML, and number. */
  const appended = [];
  const byXml = new Map();
  /** For each shared string, the converted copy each kind of cell gets. */
  const variants = new Map(); // idx -> Map(variantKey -> { inner, chars, already, changed, wholeCell })
  const sp = sst ? prefixOf(sst.name) : '';

  const stats = { cells: 0, sheets: 0, convertedChars: 0, alreadyChars: 0, fonts: [] };
  // The fonts the text cells are set in, so that a file with nothing to convert can say what it does use.
  const fontsSeen = new Set();
  const noteFonts = (xml, node, s) => {
    const str = readString(xml, node);
    if (!str.runs.some((r) => /\S/.test(r.text))) return;
    const cellFont = fontOfStyle(s);
    for (const r of str.runs) if (/\S/.test(r.text)) fontsSeen.add((r.font || cellFont || '').trim());
  };

  // New cell styles for Unicode -> legacy cells: style number -> new number.
  const newXf = new Map();
  const fontEdits = [];
  const addedFonts = [];
  const addedXfs = [];
  const legacyStyle = (s) => {
    if (newXf.has(s)) return newXf.get(s);
    if (!styles.xfsNode || !styles.fontsNode) return s;
    const xfs = kids(styles.xfsNode, 'xf');
    const xf = xfs[s] ?? xfs[0];
    const fontId = styles.xfFont[s] ?? 0;
    const font = styles.fonts[fontId] ?? styles.fonts[0];
    const fp = prefixOf(font.node.name);
    let fontXml = outer(styles.xml, font.node)
      .replace(/<([\w]+:)?(scheme|charset)\b[^>]*\/>/g, '');
    fontXml = /<([\w]+:)?name\b/.test(fontXml)
      ? fontXml.replace(/(<([\w]+:)?name\b[^>]*\bval=")[^"]*(")/, `$1${encodeAttr(target)}$3`)
      : fontXml.replace(/^(<([\w]+:)?font\b[^>]*?)(\/?)>/, (m, open, _p, self) =>
          self ? `${open}><${fp}name val="${encodeAttr(target)}"/></${fp}font>` : `${m}<${fp}name val="${encodeAttr(target)}"/>`);
    const newFontId = styles.fonts.length + addedFonts.length;
    addedFonts.push(fontXml);
    let xfXml = outer(styles.xml, xf).replace(/\bfontId="\d+"/, `fontId="${newFontId}"`);
    if (!/\bfontId=/.test(xfXml)) xfXml = xfXml.replace(/^<([\w]+:)?xf\b/, (m) => `${m} fontId="${newFontId}"`);
    xfXml = /\bapplyFont="/.test(xfXml) ? xfXml.replace(/\bapplyFont="[^"]*"/, 'applyFont="1"') : xfXml.replace(/^<([\w]+:)?xf\b/, (m) => `${m} applyFont="1"`);
    const id = xfs.length + addedXfs.length;
    addedXfs.push(xfXml);
    newXf.set(s, id);
    return id;
  };

  // Legacy -> anything: rename every legacy font in styles.xml to the target.
  if (!fromUnicode && styles.root) {
    for (const f of all(styles.root, 'font')) {
      const nameNode = kid(f, 'name');
      if (!nameNode) continue;
      const name = decodeText(attr(attrs(styles.xml, nameNode), 'val') ?? '');
      if (!legacyKeyOf(name, pair)) continue;
      const fp = prefixOf(nameNode.name);
      fontEdits.push({ start: nameNode.start, end: nameNode.end, text: `<${fp}name val="${encodeAttr(target)}"/>` });
      for (const c of f.children) {
        if (local(c.name) === 'charset' || local(c.name) === 'scheme') fontEdits.push({ start: c.start, end: c.end, text: '' });
      }
    }
  }

  /** The converted string for one cell, legacy direction or Unicode direction. */
  const convertFor = (xml, node, s) => {
    if (fromUnicode) {
      const fontId = styles.xfFont[s] ?? 0;
      return unicodeString(xml, node, pair, target, (p) => fontToRPr(styles, fontId, p));
    }
    return legacyString(xml, node, fontOfStyle(s), pair, target);
  };
  /** Cells that show the same text the same way share a variant. */
  const variantKey = (s) => {
    if (fromUnicode) return `f${styles.xfFont[s] ?? 0}`;
    return legacyKeyOf(fontOfStyle(s), pair) ? `L${fontOfStyle(s).toLowerCase()}` : 'plain';
  };

  const total = sheets.reduce((n, name) => n + files[name].length, 0) || 1;
  let done = 0;
  await report(0.1);

  /** Pending cell edits per sheet, applied after the shared strings are settled. */
  const sheetWork = [];
  for (const name of sheets) {
    const xml = read(name);
    const root = parse(xml, name);
    const cells = [];
    for (const c of all(root, 'c')) {
      const a = attrs(xml, c);
      const t = attr(a, 't');
      const s = Number(attr(a, 's') ?? 0);
      if (t === 's') {
        const v = kid(c, 'v');
        const idx = v ? Number(inner(xml, v).trim()) : NaN;
        if (!Number.isInteger(idx) || !sis[idx]) continue;
        noteFonts(sstXml, sis[idx], s);
        const key = variantKey(s);
        let m = variants.get(idx);
        if (!m) variants.set(idx, (m = new Map()));
        if (!m.has(key)) m.set(key, convertFor(sstXml, sis[idx], s));
        cells.push({ c, a, s, idx, key, v });
      } else if (t === 'inlineStr') {
        const is = kid(c, 'is');
        if (!is) continue;
        noteFonts(xml, is, s);
        const r = convertFor(xml, is, s);
        cells.push({ c, a, s, inline: is, r });
      }
    }
    sheetWork.push({ name, xml, cells });
    done += files[name].length;
    await report(0.1 + 0.5 * (done / total));
  }

  // Settle the shared strings. A string whose every cell sees the same
  // conversion is rewritten in place; otherwise the first kind of cell keeps
  // the original slot and the others point at appended copies. A string with
  // nothing to convert for some cells keeps the original text there.
  const slot = new Map(); // `${idx}|${key}` -> index in the table
  for (const [idx, m] of variants) {
    const entries = [...m.entries()];
    const changedOnes = entries.filter(([, r]) => r.changed);
    if (!changedOnes.length) continue;
    const unchanged = entries.filter(([, r]) => !r.changed);
    const si = sis[idx];
    const open = sstXml.slice(si.start, si.openEnd).replace(/\/>$/, '>');
    const close = `</${si.name}>`;
    const distinct = [...new Set(changedOnes.map(([, r]) => r.inner))];
    let inPlace = null;
    if (!unchanged.length && distinct.length === 1) inPlace = distinct[0];
    if (inPlace !== null) {
      sstEdits.push({ start: si.start, end: si.end, text: open + inPlace + close });
      for (const [key] of changedOnes) slot.set(`${idx}|${key}`, idx);
    } else {
      for (const [key, r] of changedOnes) {
        const x = `<${sp}si>${r.inner}</${sp}si>`;
        if (!byXml.has(x)) {
          byXml.set(x, sis.length + appended.length);
          appended.push(x);
        }
        slot.set(`${idx}|${key}`, byXml.get(x));
      }
    }
  }

  // Cells: point shared-string cells at their slot, rewrite inline strings,
  // and give a cell that is now all legacy-font text the legacy style.
  for (const work of sheetWork) {
    const edits = [];
    let touched = false;
    for (const cell of work.cells) {
      const r = cell.inline ? cell.r : variants.get(cell.idx).get(cell.key);
      // Counted per cell: a string shown in ten cells is ten cells of Hindi.
      stats.alreadyChars += r.already ?? 0;
      if (r.changed) stats.convertedChars += r.chars;
      if (!r.changed) continue;
      stats.cells += 1;
      touched = true;
      const newS = fromUnicode && r.wholeCell ? legacyStyle(cell.s) : cell.s;
      const openTag = work.xml.slice(cell.c.start, cell.c.openEnd);
      let newOpen = openTag;
      if (newS !== cell.s) {
        newOpen = /\ss="\d+"/.test(openTag)
          ? openTag.replace(/(\ss=")\d+(")/, `$1${newS}$2`)
          : openTag.replace(/^<([\w]+:)?c\b/, (m) => `${m} s="${newS}"`);
      }
      if (cell.inline) {
        if (newOpen !== openTag) edits.push({ start: cell.c.start, end: cell.c.openEnd, text: newOpen });
        const is = cell.inline;
        const isOpen = work.xml.slice(is.start, is.openEnd).replace(/\/>$/, '>');
        edits.push({ start: is.start, end: is.end, text: `${isOpen}${r.inner}</${is.name}>` });
      } else {
        if (newOpen !== openTag) edits.push({ start: cell.c.start, end: cell.c.openEnd, text: newOpen });
        const to = slot.get(`${cell.idx}|${cell.key}`);
        if (to !== cell.idx) {
          const vOpen = work.xml.slice(cell.v.start, cell.v.openEnd);
          edits.push({ start: cell.v.start, end: cell.v.end, text: `${vOpen}${to}</${cell.v.name}>` });
        }
      }
    }
    if (touched) stats.sheets += 1;
    if (edits.length) files[work.name] = strToU8(applyEdits(work.xml, edits));
  }

  if (sst && (sstEdits.length || appended.length)) {
    if (appended.length) {
      sstEdits.push({ start: sst.closeStart, end: sst.closeStart, text: appended.join('') });
      const open = sstXml.slice(sst.start, sst.openEnd);
      const unique = sis.length + appended.length;
      const newOpen = /\buniqueCount="\d+"/.test(open) ? open.replace(/\buniqueCount="\d+"/, `uniqueCount="${unique}"`) : open;
      if (newOpen !== open) sstEdits.push({ start: sst.start, end: sst.openEnd, text: newOpen });
    }
    files[sstName] = strToU8(applyEdits(sstXml, sstEdits));
  }

  // Notes: their runs carry their own fonts; the default is the note's
  // font (Tahoma), never a legacy one, so only runs set in a legacy font change.
  for (const name of names.filter((n) => COMMENTS_PART.test(n))) {
    const xml = read(name);
    const root = parse(xml, name);
    const edits = [];
    for (const text of all(root, 'text')) {
      const r = fromUnicode
        ? unicodeString(xml, text, pair, target, (p) => `<${p}rPr></${p}rPr>`)
        : legacyString(xml, text, '', pair, target);
      if (!r.changed) continue;
      stats.convertedChars += r.chars;
      const open = xml.slice(text.start, text.openEnd).replace(/\/>$/, '>');
      // A note that is all Hindi still needs the font on its text: as a run.
      const body = r.wholeCell
        ? `<${prefixOf(text.name)}r>${withRFont('', target, prefixOf(text.name))}${r.inner}</${prefixOf(text.name)}r>`
        : r.inner;
      edits.push({ start: text.start, end: text.end, text: `${open}${body}</${text.name}>` });
    }
    if (edits.length) files[name] = strToU8(applyEdits(xml, edits));
  }

  // styles.xml: renamed fonts, and the fonts and cell styles added above
  // (inserted before </fonts> and </cellXfs>, with their counts updated).
  if (styles.root && (fontEdits.length || addedFonts.length)) {
    const sx = styles.xml;
    const edits = [...fontEdits];
    const grow = (node, added, total) => {
      if (!added.length || node.selfClosing) return;
      const open = sx.slice(node.start, node.openEnd);
      const newOpen = /\bcount="\d+"/.test(open)
        ? open.replace(/\bcount="\d+"/, `count="${total}"`)
        : open.replace(/>$/, ` count="${total}">`);
      edits.push({ start: node.start, end: node.openEnd, text: newOpen });
      edits.push({ start: node.closeStart, end: node.closeStart, text: added.join('') });
    };
    grow(styles.fontsNode, addedFonts, styles.fonts.length + addedFonts.length);
    grow(styles.xfsNode, addedXfs, styles.xfFont.length + addedXfs.length);
    files['xl/styles.xml'] = strToU8(applyEdits(sx, edits));
  }

  stats.fonts = [...fontsSeen].filter(Boolean).sort().slice(0, 8);

  // Excel keeps a cache of formula results; it is recalculated on open, and
  // nothing here changes a formula, so the cache stays valid.
  const out = zipSync(files, { level: 6 });
  await report(1);
  return { bytes: out, stats };
}

// ---------------------------------------------------------------------------
// .csv
// ---------------------------------------------------------------------------

/**
 * Which character separates the fields: the one that gives every line of the
 * first few the same number of fields (more than one). Excel writes `,` or,
 * in some regions, `;`, and says so with a first line "sep=;". A Kruti Dev
 * `;` is the letter य, so a plain count would be fooled; consistency is not.
 */
export function detectDelimiter(text) {
  const sep = text.match(/^sep=(.)\r?\n/);
  if (sep) return sep[1];
  const sample = text.slice(0, 20000);
  for (const d of [',', '\t', ';']) {
    const rows = parseCsv(sample, d).rows.slice(0, 20);
    // The last row may be cut short by the sample.
    const full = rows.length > 1 ? rows.slice(0, -1) : rows;
    const n = full[0]?.length ?? 0;
    if (n > 1 && full.every((r) => r.length === n)) return d;
  }
  return ',';
}

/**
 * Split CSV text into rows of fields (RFC 4180, as Excel writes it).
 * @returns {{ rows: string[][], sepLine: string }}
 */
export function parseCsv(text, delim = ',') {
  let i = 0;
  let sepLine = '';
  const m = text.match(/^sep=.\r?\n/);
  if (m) {
    sepLine = m[0];
    i = m[0].length;
  }
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let any = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      any = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = '';
      any = true;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      any = false;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    any = true;
    i += 1;
  }
  if (any || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, sepLine };
}

/** Rows back to CSV, quoting only where a field needs it. Lines end in CRLF, like Excel's. */
export function writeCsv(rows, delim = ',', sepLine = '') {
  const q = (f) => (/["\r\n]/.test(f) || f.includes(delim) || /^\s|\s$/.test(f) ? `"${f.replace(/"/g, '""')}"` : f);
  return sepLine.replace(/\r?\n$/, '\r\n') + rows.map((r) => r.map(q).join(delim)).join('\r\n') + (rows.length ? '\r\n' : '');
}

/** A field that is only a number, date, amount or the like: never converted. */
const NUMBERISH = /^[\s\d.,:/\\\-+%₹$()#]*$/;

/**
 * @param {string} text
 * @param {'to-unicode' | 'to-kruti' | { from: string, to: string }} direction
 * @returns {{ text: string, rows: string[][], delimiter: string, stats: SheetStats }}
 */
export function convertCsv(text, direction) {
  const pair = pairOf(direction);
  const delimiter = detectDelimiter(text);
  const { rows, sepLine } = parseCsv(text, delimiter);
  const stats = { cells: 0, sheets: 1, convertedChars: 0, alreadyChars: 0 };
  const fromUnicode = isUnicodeKey(pair.from);
  const out = rows.map((row) =>
    row.map((f) => {
      if (!f || NUMBERISH.test(f)) return f;
      if (fromUnicode) {
        if (!DEVA.test(f)) return f;
        stats.cells += 1;
        stats.convertedChars += countDeva(f);
        return splitScripts(f)
          .map((p) => (p.hindi ? convert(p.s, 'unicode', pair.to, { keepEnglish: true }) : p.s))
          .join('');
      }
      // No fonts: the same English-keeping default as the .txt converter.
      const already = countDeva(f);
      const unicode = convert(f, pair.from, 'unicode');
      const chars = countDeva(unicode) - already;
      if (chars <= 0) {
        stats.alreadyChars += already;
        return f;
      }
      stats.cells += 1;
      stats.convertedChars += chars;
      stats.alreadyChars += already;
      return isUnicodeKey(pair.to) ? unicode : convert(f, pair.from, pair.to);
    }),
  );
  if (!stats.cells) stats.sheets = 0;
  return { text: writeCsv(out, delimiter, sepLine), rows: out, delimiter, stats };
}

/** CSV for Excel: UTF-8 with a byte-order mark, or Excel reads Hindi as ANSI. */
export const csvBlob = (text) => new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });

// ---------------------------------------------------------------------------
// An .xlsx from rows, with the font set (for a converted CSV)
// ---------------------------------------------------------------------------

const colName = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
/** A plain number Excel would read as the same number: no leading zeros, not too long. */
const PLAIN_NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$/;

/**
 * A one-sheet workbook: text in `font` wherever it has Hindi (or, for a legacy
 * font, only the Hindi part of a mixed cell), everything else in Calibri.
 *
 * @param {string[][]} rows
 * @param {{ font: string, legacy: boolean, sheetName?: string }} opts
 *   legacy: the rows hold legacy-font code, so "Hindi" means what was Hindi
 *   before converting - `hindiMask` marks it
 * @param {(cell: string, r: number, c: number) => { hindi: boolean, s: string }[]} pieces
 *   how a cell splits into Hindi and other text
 */
export function buildXlsx(rows, { font, pieces, sheetName = 'Sheet1' }) {
  const f = encodeAttr(font);
  let sheetRows = '';
  rows.forEach((row, r) => {
    let cells = '';
    row.forEach((v, c) => {
      if (v === '') return;
      const ref = `${colName(c)}${r + 1}`;
      if (PLAIN_NUMBER.test(v)) {
        cells += `<c r="${ref}"><v>${v}</v></c>`;
        return;
      }
      const ps = pieces(v, r, c);
      const hindi = ps.filter((p) => p.hindi);
      if (!hindi.length) cells += `<c r="${ref}" t="inlineStr"><is>${tEl('', v)}</is></c>`;
      else if (hindi.length === ps.length) cells += `<c r="${ref}" s="1" t="inlineStr"><is>${tEl('', ps.map((p) => p.s).join(''))}</is></c>`;
      else {
        const runs = ps
          .map((p) =>
            p.hindi
              ? `<r><rPr><rFont val="${f}"/><sz val="12"/></rPr>${tEl('', p.s)}</r>`
              : `<r><rPr><rFont val="Calibri"/><family val="2"/><sz val="11"/></rPr>${tEl('', p.s)}</r>`,
          )
          .join('');
        cells += `<c r="${ref}" t="inlineStr"><is>${runs}</is></c>`;
      }
    });
    sheetRows += `<row r="${r + 1}">${cells}</row>`;
  });

  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const zip = {
    '[Content_Types].xml': strToU8(
      `${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `${decl}<Relationships xmlns="${PR}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `${decl}<workbook xmlns="${NS}" xmlns:r="${R}"><sheets>` +
        `<sheet name="${encodeAttr(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1')}" sheetId="1" r:id="rId1"/>` +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${decl}<Relationships xmlns="${PR}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      `${decl}<styleSheet xmlns="${NS}">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><sz val="12"/><name val="${f}"/></font></fonts>` +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${decl}<worksheet xmlns="${NS}" xmlns:r="${R}"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  return zipSync(zip, { level: 6 });
}

/**
 * The .xlsx offered with a converted CSV: the converted rows, with the target
 * font on the Hindi. For a legacy target the Hindi is found in the ORIGINAL
 * (Unicode) field, since the converted text is Latin code points.
 */
export function csvToXlsx(converted, original, direction, { unicodeFont = 'Mangal', sheetName } = {}) {
  const pair = pairOf(direction);
  const toUnicode = isUnicodeKey(pair.to);
  const font = toUnicode ? unicodeFont : WORD_FONTS[pair.to].name;
  const pieces = (v, r, c) => {
    if (toUnicode) {
      return splitScripts(v).map((p) => ({ hindi: p.hindi, s: p.s }));
    }
    // Unicode -> legacy: split the original, convert each Hindi piece.
    const src = original[r]?.[c] ?? '';
    if (isUnicodeKey(pair.from)) {
      if (!DEVA.test(src) || NUMBERISH.test(src)) return [{ hindi: false, s: v }];
      return splitScripts(src).map((p) =>
        p.hindi ? { hindi: true, s: convert(p.s, 'unicode', pair.to, { keepEnglish: true }) } : { hindi: false, s: p.s },
      );
    }
    // Legacy -> legacy: a field that changed is the target font's code.
    return [{ hindi: v !== src, s: v }];
  };
  return buildXlsx(converted, { font, pieces, sheetName });
}

/** original.csv -> original-unicode.xlsx */
export const xlsxName = (csvOutputName) => csvOutputName.replace(/\.[^.]+$/, '.xlsx');

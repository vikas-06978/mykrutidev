/**
 * Whole-document conversion for the Kruti Dev pages: .docx and .txt in, the
 * same file converted out. Runs entirely in the browser; nothing is uploaded.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE: CHANGE THE HINDI, NOTHING ELSE
 *
 * A .docx is a zip of XML parts. Only the parts that hold text are opened -
 * the main document, headers, footers, footnotes, endnotes - and inside them
 * only the RUNS (w:r) that carry the Hindi are rewritten. Everything else in
 * those parts is spliced through untouched (see xmlScan.js), and every other
 * part of the zip - styles, images, numbering, settings - is copied as is.
 *
 * The Hindi itself is converted by convert() from fontMaps.js, the same
 * function the text boxes use. There is no second converter here.
 *
 * ---------------------------------------------------------------------------
 * KRUTI DEV -> UNICODE
 *
 *   which runs   those whose EFFECTIVE font is a Kruti Dev face - the run's own
 *                w:rFonts, else its character style, else its paragraph style
 *                (or the default paragraph style), else docDefaults.
 *   merging      Word splits text into runs for invisible reasons (spell-check,
 *                edit history), and a split can fall inside a syllable: `f` in
 *                one run and `d` in the next is still कि. So adjacent Kruti runs
 *                with the SAME formatting are merged before converting. Runs
 *                with DIFFERENT formatting (a bold word) stay separate - unless
 *                the boundary splits a syllable, in which case they merge and
 *                take the first run's formatting, because correct Hindi beats
 *                a half-bold syllable.
 *   after        the run's fonts (ascii, hAnsi, cs) become Mangal or Nirmala
 *                UI, and bold/italic/size are mirrored onto their complex-
 *                script twins (bCs, iCs, szCs), which is what Word uses to draw
 *                Devanagari.
 *
 * UNICODE -> KRUTI DEV
 *
 *   which runs   those containing Devanagari (U+0900-U+097F). A run mixing
 *                English and Hindi is split: the English keeps its font, the
 *                Hindi becomes Kruti Dev code in "Kruti Dev 010".
 *
 * EVERY OTHER FONT
 *
 *   The same two paths, for any { from, to } pair of fonts the site converts
 *   (wordFonts.js): a run in the FROM font (or a font on the same keyboard
 *   layout, so a DevLys run converts on a Kruti Dev page) is converted and set
 *   in the TO font. Legacy -> legacy goes through convert() like the text
 *   boxes do. 'to-unicode' and 'to-kruti' still mean Kruti Dev <-> Unicode.
 * ---------------------------------------------------------------------------
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { convert, FONTS } from './fontMaps.js';
import { WORD_FONTS, pairOf, isUnicodeKey, docLabel } from './wordFonts.js';
import {
  parseXml, attrs, inner, outer, child, descendants, ancestor,
  decodeText, encodeText, encodeAttr, applyEdits,
} from './xmlScan.js';

export const MAX_BYTES = 20 * 1024 * 1024;
export const KRUTI_FONT = WORD_FONTS['kruti-dev'].name;
export { UNICODE_FONTS } from './wordFonts.js';

// Only for files that are NOT .docx - a .docx user is never told to save as .docx.
export const SAVE_AS_MESSAGE = 'Please open it in Word and Save As → Word Document (.docx).';
// A PDF has no paragraphs or fonts to convert in place, but Word (2013 and
// later) opens one as an editable document, which then converts here.
export const PDF_MESSAGE =
  'PDFs cannot be converted directly. Open the PDF in Word (File → Open) and Word turns it into a document. Then choose Save As → Word Document (.docx) and upload that file here.';
export const DAMAGED_MESSAGE = 'This file seems damaged. Open it in Word and save it again.';
export const GENERIC_MESSAGE = 'Something went wrong converting this file.';

/** An error whose message is written for the person, and is safe to show. */
export class UserError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'UserError';
  }
}

/** The message to show for anything thrown while converting. */
export const messageFor = (err) => (err instanceof UserError ? err.message : GENERIC_MESSAGE);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// Checking the file before touching it
// ---------------------------------------------------------------------------

/**
 * @param {{ name: string, size: number, head?: Uint8Array }} file
 *   `head` is the first few bytes, to catch a .doc or .pdf renamed to .docx.
 * @returns {{ kind: 'docx' | 'txt' } | { error: string }}
 */
export function checkFile({ name, size, head }) {
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
  const b = head ?? new Uint8Array();
  const isZip = b[0] === 0x50 && b[1] === 0x4b; // PK
  const isOle = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

  if (ext === 'pdf' || isPdf) return { error: PDF_MESSAGE };
  if (['doc', 'rtf', 'odt', 'wps'].includes(ext)) {
    return { error: SAVE_AS_MESSAGE };
  }
  if (size > MAX_BYTES) {
    return { error: 'This file is larger than 20 MB. Please split it into smaller files and convert them one at a time.' };
  }
  if (ext === 'docx') {
    if (isOle) {
      // An old .doc renamed to .docx - or a password-protected .docx, which
      // Word also stores in this container.
      return {
        error: `${SAVE_AS_MESSAGE} If the document is password-protected, remove the password first.`,
      };
    }
    if (head && !isZip) return { error: DAMAGED_MESSAGE };
    return { kind: 'docx' };
  }
  if (ext === 'txt') return { kind: 'txt' };
  return { error: 'Only .docx (Word) and .txt files can be converted here.' };
}

/** original.docx -> original-unicode.docx, original-krutidev.docx ... */
export function outputName(name, direction, ext) {
  const base = name.replace(/\.[^.]+$/, '') || 'document';
  const { to } = pairOf(direction);
  return `${base}-${isUnicodeKey(to) ? 'unicode' : to.replace(/-/g, '')}.${ext}`;
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_G = /[ऀ-ॿ]/g;
const countDeva = (s) => (s.match(DEVANAGARI_G) || []).length;

/**
 * Split text into Hindi and non-Hindi pieces for Unicode -> Kruti.
 *
 * Devanagari is Hindi; Latin letters are English; everything else (spaces,
 * digits, punctuation) joins the piece before it - or the one after, at the
 * start - so "Hello हिन्दी" is "Hello " + "हिन्दी" and "हिन्दी, PAN" is
 * "हिन्दी, " + "PAN".
 *
 * @param {string} text
 * @returns {{ hindi: boolean, s: string }[]}
 */
export function splitScripts(text) {
  const cls = (ch) => (/[ऀ-ॿ‌‍]/.test(ch) ? 'D' : /[A-Za-z]/.test(ch) ? 'L' : 'N');
  const tokens = [];
  for (const ch of text) {
    const c = cls(ch);
    const last = tokens[tokens.length - 1];
    if (last && last.c === c) last.s += ch;
    else tokens.push({ c, s: ch });
  }
  // Neutral tokens take the class of their neighbour.
  let prev = null;
  for (const t of tokens) {
    if (t.c === 'N') t.c = prev ?? 'N';
    else prev = t.c;
  }
  let next = null;
  for (let k = tokens.length - 1; k >= 0; k -= 1) {
    if (tokens[k].c === 'N') tokens[k].c = next ?? 'L';
    else next = tokens[k].c;
  }
  const out = [];
  for (const t of tokens) {
    const hindi = t.c === 'D';
    const last = out[out.length - 1];
    if (last && last.hindi === hindi) last.s += t.s;
    else out.push({ hindi, s: t.s });
  }
  return out;
}

// The existing converters, called exactly as the text boxes call them. In a
// document the FONT already says a run is legacy, so English-guessing is
// turned off for that direction; URLs and emails are still protected.
const legacyToUnicode = (s, from) => convert(s, from, 'unicode', { keepEnglish: false });
const legacyToTarget = (s, from, to) =>
  isUnicodeKey(to) ? legacyToUnicode(s, from) : convert(s, from, to, { keepEnglish: false });
const unicodeToLegacy = (s, to) => convert(s, 'unicode', to, { keepEnglish: true });

/** Unicode -> a legacy font for mixed text: only the Hindi pieces change. */
export const unicodeTextTo = (text, to) =>
  splitScripts(text).map((p) => (p.hindi ? unicodeToLegacy(p.s, to) : p.s)).join('');
export const unicodeTextToKruti = (text) => unicodeTextTo(text, 'kruti-dev');

/**
 * Does a font name in the document belong to `key`? A font on the same
 * keyboard layout counts too: DevLys 010 text converts on a Kruti Dev page.
 */
function fontIs(name, key) {
  if (!name) return false;
  if (WORD_FONTS[key]?.match.test(name)) return true;
  const layout = FONTS[key]?.layout;
  return !!layout && Object.entries(WORD_FONTS).some(
    ([k, w]) => k !== key && FONTS[k]?.layout === layout && w.match.test(name),
  );
}

// ---------------------------------------------------------------------------
// Styles: what font does a run REALLY have?
// ---------------------------------------------------------------------------

/** @param {Record<string,string>} a w:rFonts attributes */
const slotFont = (a, slot, theme) =>
  a[`w:${slot}Theme`] ? theme[a[`w:${slot}Theme`]] ?? a[`w:${slot}Theme`] : a[`w:${slot}`];

const NS_DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';

/**
 * Parse a part that is only READ (theme, content types) with a real XML
 * parser: DOMParser in the browser, @xmldom/xmldom in the tests. Parts that
 * are rewritten go through xmlScan.js instead, which splices edits into the
 * original text so namespaces and everything else stay byte for byte.
 *
 * @returns {Document}
 */
function parseDom(xml, what) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (err) {
    throw new UserError(DAMAGED_MESSAGE, { cause: err });
  }
  if (!doc?.documentElement || doc.getElementsByTagName('parsererror').length) {
    throw new UserError(DAMAGED_MESSAGE, { cause: new Error(`Malformed XML in ${what}`) });
  }
  return doc;
}

const firstNS = (el, ns, name) => el?.getElementsByTagNameNS(ns, name)[0] ?? null;

function readTheme(xml) {
  const theme = {};
  if (!xml) return theme;
  const doc = parseDom(xml, 'theme');
  const face = (which, script) =>
    firstNS(firstNS(doc, NS_DRAWING, `${which}Font`), NS_DRAWING, script)?.getAttribute('typeface') || undefined;
  theme.minorHAnsi = theme.minorAscii = face('minor', 'latin');
  theme.majorHAnsi = theme.majorAscii = face('major', 'latin');
  theme.minorBidi = face('minor', 'cs');
  theme.majorBidi = face('major', 'cs');
  return theme;
}

/**
 * @param {string | undefined} stylesXml
 * @param {string | undefined} themeXml
 */
export function makeFontResolver(stylesXml, themeXml) {
  const theme = readTheme(themeXml);
  const styles = new Map();
  let defaults = {};
  let defaultPara = null;

  if (stylesXml) {
    const root = parseXml(stylesXml);
    for (const node of descendants(root)) {
      if (node.name === 'w:rPrDefault') {
        const f = [...descendants(node, 'w:rFonts')][0];
        if (f) defaults = attrs(stylesXml, f);
      }
      if (node.name === 'w:style') {
        const a = attrs(stylesXml, node);
        const rPr = child(node, 'w:rPr');
        const rFonts = rPr && child(rPr, 'w:rFonts');
        const basedOn = child(node, 'w:basedOn');
        const style = {
          type: a['w:type'],
          basedOn: basedOn ? attrs(stylesXml, basedOn)['w:val'] : null,
          fonts: rFonts ? attrs(stylesXml, rFonts) : null,
        };
        styles.set(a['w:styleId'], style);
        if (a['w:type'] === 'paragraph' && (a['w:default'] === '1' || a['w:default'] === 'true')) {
          defaultPara = a['w:styleId'];
        }
      }
    }
  }

  const chain = (id) => {
    const out = [];
    const seen = new Set();
    for (let s = id; s && !seen.has(s) && styles.has(s); s = styles.get(s).basedOn) {
      seen.add(s);
      if (styles.get(s).fonts) out.push(styles.get(s).fonts);
    }
    return out;
  };

  /**
   * @param {Record<string,string> | null} runFonts the run's own w:rFonts
   * @param {string | null} rStyle
   * @param {string | null} pStyle
   * @returns {{ ascii?: string, hAnsi?: string }}
   */
  return function resolve(runFonts, rStyle, pStyle) {
    const levels = [
      ...(runFonts ? [runFonts] : []),
      ...chain(rStyle),
      ...chain(pStyle || defaultPara),
      defaults,
    ];
    const pick = (slot) => {
      for (const a of levels) {
        const f = slotFont(a, slot, theme);
        if (f) return f;
      }
      return undefined;
    };
    return { ascii: pick('ascii'), hAnsi: pick('hAnsi') };
  };
}

// ---------------------------------------------------------------------------
// Run properties
// ---------------------------------------------------------------------------

/** CT_RPr child order. Word rejects a run whose properties are out of order. */
const RPR_ORDER = [
  'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps',
  'w:strike', 'w:dstrike', 'w:outline', 'w:shadow', 'w:emboss', 'w:imprint',
  'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing',
  'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect',
  'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang',
  'w:eastAsianLayout', 'w:specVanish', 'w:oMath',
];
const rank = (name) => {
  const r = RPR_ORDER.indexOf(name);
  // Extensions (w14:...) go after the known ones; rPrChange always last.
  return name === 'w:rPrChange' ? 10_000 : r === -1 ? 1_000 : r;
};

/**
 * Rewrite a run's w:rPr for its new font.
 *
 * @param {string} rPrXml the original `<w:rPr>...</w:rPr>`, or '' if none
 * @param {string} font
 * @param {'to-unicode' | 'to-kruti'} direction
 */
export function rewriteRPr(rPrXml, font, direction) {
  const kids = [];
  let open = '<w:rPr>';
  if (rPrXml) {
    const root = parseXml(rPrXml);
    const rPr = root.children[0];
    open = rPrXml.slice(rPr.start, rPr.openEnd).replace(/\/>$/, '>');
    for (const c of rPr.children) kids.push({ name: c.name, xml: outer(rPrXml, c), a: attrs(rPrXml, c) });
  }
  const has = (n) => kids.some((k) => k.name === n);
  const get = (n) => kids.find((k) => k.name === n);

  // Fonts: all three script slots, no theme or hint left to override them.
  const old = get('w:rFonts')?.a ?? {};
  const keep = Object.entries(old).filter(
    ([k]) => !/^w:(ascii|hAnsi|cs)(Theme)?$|^w:cstheme$|^w:hint$/.test(k),
  );
  const f = encodeAttr(font);
  const rFonts =
    `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"` +
    keep.map(([k, v]) => ` ${k}="${v}"`).join('') +
    '/>';
  const withoutFonts = kids.filter((k) => k.name !== 'w:rFonts');
  withoutFonts.push({ name: 'w:rFonts', xml: rFonts });

  // Mirror bold/italic/size onto the slot Word will actually use for the new
  // text: complex script for Devanagari, the ordinary slot for Kruti ASCII.
  const pairs = direction === 'to-unicode'
    ? [['w:b', 'w:bCs'], ['w:i', 'w:iCs'], ['w:sz', 'w:szCs']]
    : [['w:bCs', 'w:b'], ['w:iCs', 'w:i'], ['w:szCs', 'w:sz']];
  for (const [from, to] of pairs) {
    if (has(from) && !has(to)) {
      withoutFonts.push({ name: to, xml: get(from).xml.replace(`<${from}`, `<${to}`) });
    }
  }

  const sorted = withoutFonts
    .map((k, idx) => ({ ...k, idx }))
    .sort((x, y) => rank(x.name) - rank(y.name) || x.idx - y.idx);
  return `${open}${sorted.map((k) => k.xml).join('')}</w:rPr>`;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/** Siblings that may sit between two runs without stopping them merging. */
const TRANSPARENT = new Set([
  'w:proofErr', 'w:bookmarkStart', 'w:bookmarkEnd', 'w:permStart', 'w:permEnd',
  'w:commentRangeStart', 'w:commentRangeEnd',
]);

/**
 * @typedef {{
 *   node: import('./xmlScan.js').XmlNode,
 *   rPr: string,
 *   items: ({ text: string } | { raw: string })[],
 *   text: string,
 *   opaque: boolean,
 *   font: { ascii?: string, hAnsi?: string },
 * }} Run
 */

/** @returns {Run} */
function readRun(xml, node, resolve) {
  const rPrNode = child(node, 'w:rPr');
  const items = [];
  for (const c of node.children) {
    if (c.name === 'w:rPr') continue;
    if (c.name === 'w:t') items.push({ text: decodeText(inner(xml, c)) });
    else items.push({ raw: outer(xml, c) });
  }
  // A run holding a text box has paragraphs inside it. It is never rewritten;
  // its inner paragraphs are converted on their own.
  let opaque = false;
  for (const d of descendants(node)) {
    if (d.name === 'w:p' || d.name === 'w:txbxContent') { opaque = true; break; }
  }
  const rFonts = rPrNode && child(rPrNode, 'w:rFonts');
  const rStyle = rPrNode && child(rPrNode, 'w:rStyle');
  const p = ancestor(node, 'w:p');
  const pPr = p && child(p, 'w:pPr');
  const pStyle = pPr && child(pPr, 'w:pStyle');
  return {
    node,
    rPr: rPrNode ? outer(xml, rPrNode) : '',
    items,
    text: items.map((it) => it.text ?? '').join(''),
    opaque,
    font: resolve(
      rFonts ? attrs(xml, rFonts) : null,
      rStyle ? attrs(xml, rStyle)['w:val'] : null,
      pStyle ? attrs(xml, pStyle)['w:val'] : null,
    ),
  };
}

/** The run's font name if it is in `key` (see fontIs), else null. */
const legacyFontOf = (run, key) =>
  fontIs(run.font.ascii, key) ? run.font.ascii : fontIs(run.font.hAnsi, key) ? run.font.hAnsi : null;

/** Formatting that matters to a reader - spell-check language and noProof do not. */
const formatKey = (rPr) =>
  rPr
    .replace(/<w:lang\b[^>]*\/>/g, '')
    .replace(/<w:noProof\b[^>]*\/>/g, '')
    .replace(/\s+/g, '');

/** Combining marks: a run starting with one belongs to the syllable before. */
const MARK = /^[ऀ-ःऺ-ॏ॑-ॗॢॣ]/;

/**
 * Does the boundary between two runs in a legacy font fall inside a syllable?
 * The first run ending in a half letter or a ि (typed BEFORE its consonant -
 * Kruti Dev's `f`), or the second starting with a matra, a halant or a reph
 * (typed after its syllable - Kruti Dev's `Z`, which converts to nothing on
 * its own).
 */
export function splitsSyllable(a, b, from = 'kruti-dev') {
  const last = a.slice(-1);
  if (last) {
    const u = legacyToUnicode(last, from);
    if (u.startsWith('ि') || u.endsWith('्')) return true;
  }
  const first = b[0];
  if (!first) return false;
  const u = legacyToUnicode(first, from);
  return u === '' || MARK.test(u);
}

const openTag = (xml, node) => {
  const t = xml.slice(node.start, node.openEnd);
  return node.selfClosing ? t.replace(/\/>$/, '>') : t;
};

// ---------------------------------------------------------------------------
// One XML part
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   paragraphs: number, tables: number,
 *   convertedChars: number, alreadyChars: number,
 * }} Stats
 */

/**
 * Convert one XML part (document, header, footer, notes).
 *
 * @param {string} xml
 * @param {{ direction: 'to-unicode' | 'to-kruti' | { from: string, to: string },
 *           font: string, resolve: Function, onBatch?: () => Promise<void> }} opts
 * @returns {Promise<{ xml: string, stats: Stats }>}
 */
export async function convertPart(xml, { direction, font, resolve, onBatch }) {
  const pair = pairOf(direction);
  const root = parseXml(xml);
  const edits = [];
  const paragraphs = new Set();
  const stats = { paragraphs: 0, tables: 0, convertedChars: 0, alreadyChars: 0 };

  const containers = [];
  for (const node of descendants(root)) {
    if (node.name === 'w:tbl') stats.tables += 1;
    if (node.children.some((c) => c.name === 'w:r')) containers.push(node);
  }

  let done = 0;
  for (const container of containers) {
    if (isUnicodeKey(pair.from)) unicodeContainer(xml, container, pair, font, resolve, edits, paragraphs, stats);
    else legacyContainer(xml, container, pair, font, resolve, edits, paragraphs, stats);
    done += 1;
    if (onBatch && done % 400 === 0) await onBatch();
  }

  stats.paragraphs = paragraphs.size;
  return { xml: applyEdits(xml, edits), stats };
}

function legacyContainer(xml, container, pair, font, resolve, edits, paragraphs, stats) {
  /** @type {{ runs: Run[], between: import('./xmlScan.js').XmlNode[], pending: import('./xmlScan.js').XmlNode[] } | null} */
  let group = null;

  const close = () => {
    if (group) emitLegacyGroup(xml, group, pair, font, edits, paragraphs, stats);
    group = null;
  };

  for (const c of container.children) {
    if (c.name === 'w:r') {
      const run = readRun(xml, c, resolve);
      const legacy = legacyFontOf(run, pair.from);
      if (!legacy) {
        stats.alreadyChars += countDeva(run.text);
        close();
        continue;
      }
      if (run.opaque || !run.items.some((it) => it.text !== undefined)) {
        close();
        continue;
      }
      if (group) {
        const last = group.runs[group.runs.length - 1];
        const sameFont = legacyFontOf(last, pair.from).toLowerCase() === legacy.toLowerCase();
        const sameFormat = formatKey(last.rPr) === formatKey(run.rPr);
        if (sameFont && (sameFormat || splitsSyllable(last.text, run.text, pair.from))) {
          group.between.push(...group.pending);
          group.pending = [];
          group.runs.push(run);
          continue;
        }
      }
      close();
      group = { runs: [run], between: [], pending: [] };
    } else if (TRANSPARENT.has(c.name) && group) {
      group.pending.push(c);
    } else {
      close();
    }
  }
  close();
}

function emitLegacyGroup(xml, group, pair, font, edits, paragraphs, stats) {
  const first = group.runs[0];
  const last = group.runs[group.runs.length - 1];

  // Items from every run in order; neighbouring text is converted together,
  // which is the whole point of merging.
  let body = '';
  let pendingText = '';
  const flush = () => {
    if (!pendingText) return;
    const u = legacyToUnicode(pendingText, pair.from);
    stats.convertedChars += countDeva(u);
    const out = isUnicodeKey(pair.to) ? u : legacyToTarget(pendingText, pair.from, pair.to);
    body += `<w:t xml:space="preserve">${encodeText(out)}</w:t>`;
    pendingText = '';
  };
  for (const run of group.runs) {
    for (const it of run.items) {
      if (it.text !== undefined) pendingText += it.text;
      else {
        flush();
        body += it.raw;
      }
    }
  }
  flush();

  const merged =
    openTag(xml, first.node) +
    rewriteRPr(first.rPr, font, isUnicodeKey(pair.to) ? 'to-unicode' : 'to-kruti') +
    body +
    '</w:r>' +
    group.between.map((n) => outer(xml, n)).join('');

  edits.push({ start: first.node.start, end: last.node.end, text: merged });
  const p = ancestor(first.node, 'w:p');
  if (p) paragraphs.add(p);
}

function unicodeContainer(xml, container, pair, font, resolve, edits, paragraphs, stats) {
  for (const c of container.children) {
    if (c.name !== 'w:r') continue;
    const run = readRun(xml, c, resolve);
    if (run.opaque || !DEVANAGARI.test(run.text)) {
      if (legacyFontOf(run, pair.to)) stats.alreadyChars += run.text.length;
      continue;
    }

    // Pieces in order, each Hindi or not. A tab or break takes the kind of the
    // piece before it, so it never forces an extra split.
    const pieces = [];
    const push = (hindi, xmlPart) => {
      const lastPiece = pieces[pieces.length - 1];
      if (lastPiece && lastPiece.hindi === hindi) lastPiece.xml += xmlPart;
      else pieces.push({ hindi, xml: xmlPart });
    };
    for (const it of run.items) {
      if (it.text === undefined) {
        push(pieces.length ? pieces[pieces.length - 1].hindi : false, it.raw);
        continue;
      }
      for (const part of splitScripts(it.text)) {
        let s = part.s;
        if (part.hindi) {
          stats.convertedChars += countDeva(s);
          s = unicodeToLegacy(s, pair.to);
        }
        push(part.hindi, `<w:t xml:space="preserve">${encodeText(s)}</w:t>`);
      }
    }

    const open = openTag(xml, c);
    const legacyRPr = rewriteRPr(run.rPr, font, 'to-kruti');
    const out = pieces
      .map((p) => `${open}${p.hindi ? legacyRPr : run.rPr}${p.xml}</w:r>`)
      .join('');
    edits.push({ start: c.start, end: c.end, text: out });
    const p = ancestor(c, 'w:p');
    if (p) paragraphs.add(p);
  }
}

// ---------------------------------------------------------------------------
// The whole .docx
// ---------------------------------------------------------------------------

const TEXT_PART_TYPES = [
  'wordprocessingml.document.main+xml',
  'wordprocessingml.template.main+xml',
  'wordprocessingml.document.macroEnabled.main+xml',
  'wordprocessingml.header+xml',
  'wordprocessingml.footer+xml',
  'wordprocessingml.footnotes+xml',
  'wordprocessingml.endnotes+xml',
];

/** Which parts hold text, read from [Content_Types].xml. */
function textParts(files) {
  const parts = [];
  if (files['[Content_Types].xml']) {
    const doc = parseDom(strFromU8(files['[Content_Types].xml']), '[Content_Types].xml');
    for (const o of Array.from(doc.getElementsByTagNameNS(NS_CONTENT_TYPES, 'Override'))) {
      const name = (o.getAttribute('PartName') ?? '').replace(/^\//, '');
      const type = o.getAttribute('ContentType') ?? '';
      if (name && TEXT_PART_TYPES.some((t) => type.endsWith(t)) && files[name]) parts.push(name);
    }
  }
  if (!parts.length && files['word/document.xml']) parts.push('word/document.xml');
  return parts;
}

/**
 * @param {Uint8Array} bytes
 * @param {{
 *   direction: 'to-unicode' | 'to-kruti' | { from: string, to: string },
 *   unicodeFont?: string,
 *   onProgress?: (fraction: number) => void,
 * }} opts
 * @returns {Promise<{ bytes: Uint8Array, stats: Stats }>}
 */
export async function convertDocx(bytes, { direction, unicodeFont = 'Mangal', onProgress }) {
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
  const parts = textParts(files);
  if (!parts.length) throw new UserError(DAMAGED_MESSAGE, { cause: new Error('No word/document.xml') });

  const read = (name) => (files[name] ? strFromU8(files[name]) : undefined);
  let resolve;
  try {
    resolve = makeFontResolver(read('word/styles.xml'), read('word/theme/theme1.xml'));
  } catch (err) {
    if (/^Malformed XML/.test(err?.message)) throw new UserError(DAMAGED_MESSAGE, { cause: err });
    throw err;
  }
  const { to } = pairOf(direction);
  const font = isUnicodeKey(to) ? unicodeFont : WORD_FONTS[to].name;

  const total = parts.reduce((n, p) => n + files[p].length, 0);
  let doneBytes = 0;
  const stats = { paragraphs: 0, tables: 0, convertedChars: 0, alreadyChars: 0 };

  await report(0.1);
  for (const name of parts) {
    const size = files[name].length;
    let converted;
    try {
      converted = await convertPart(strFromU8(files[name]), {
        direction,
        font,
        resolve,
        onBatch: () => report(0.1 + 0.8 * (doneBytes + size / 2) / total),
      });
    } catch (err) {
      // xmlScan.js throws "Malformed XML" for a part that is not well formed.
      if (/^Malformed XML/.test(err?.message)) {
        throw new UserError(DAMAGED_MESSAGE, { cause: new Error(`${name}: ${err.message}`) });
      }
      throw err;
    }
    const { xml, stats: s } = converted;
    files[name] = strToU8(xml);
    for (const k of Object.keys(stats)) stats[k] += s[k];
    doneBytes += size;
    await report(0.1 + 0.8 * doneBytes / total);
  }

  // Same entries, same order, same bytes for every part not converted.
  const out = zipSync(files, { level: 6 });
  await report(1);
  return { bytes: out, stats };
}

export const docxBlob = (bytes) => new Blob([bytes], { type: DOCX_MIME });

// ---------------------------------------------------------------------------
// .txt
// ---------------------------------------------------------------------------

/**
 * Read a text file. Kruti Dev .txt files are usually saved from Notepad as
 * "ANSI" (Windows-1252), where `ª` and friends are single bytes that are not
 * valid UTF-8 - so UTF-8 is tried strictly first and 1252 is the fallback.
 *
 * @param {Uint8Array} bytes
 * @returns {{ text: string, encoding: string }}
 */
export function decodeTextFile(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' };
  }
}

/**
 * @param {string} text
 * @param {'to-unicode' | 'to-kruti' | { from: string, to: string }} direction
 * @returns {{ text: string, stats: Stats }}
 */
export function convertTxt(text, direction) {
  const { from, to } = pairOf(direction);
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim()).length;
  if (!isUnicodeKey(from)) {
    // No fonts in a .txt, so the whole text is in the FROM font - with the
    // same English-keeping default as the text box.
    const alreadyChars = countDeva(text);
    const unicode = convert(text, from, 'unicode');
    return {
      text: isUnicodeKey(to) ? unicode : convert(text, from, to),
      stats: { paragraphs: lines, tables: 0, convertedChars: countDeva(unicode) - alreadyChars, alreadyChars },
    };
  }
  return {
    text: unicodeTextTo(text, to),
    stats: { paragraphs: lines, tables: 0, convertedChars: countDeva(text), alreadyChars: 0 },
  };
}

// ---------------------------------------------------------------------------
// The summary shown after converting
// ---------------------------------------------------------------------------

const fmt = (n) => n.toLocaleString('en-IN');
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * @param {Stats} stats
 * @param {'to-unicode' | 'to-kruti' | { from: string, to: string }} direction
 * @returns {{ line: string, share: string | null, warning: string | null }}
 */
export function summarize(stats, direction) {
  const pair = pairOf(direction);
  const parts = [`Converted ${plural(stats.paragraphs, 'paragraph', 'paragraphs')}`];
  if (stats.tables) parts.push(plural(stats.tables, 'table', 'tables'));
  const line = parts.join(' · ');

  // What the rest of the Hindi already was: Unicode when converting FROM a
  // legacy font, the target font when converting from Unicode.
  const from = docLabel(pair.from);
  const to = isUnicodeKey(pair.from) ? docLabel(pair.to) : docLabel('unicode');
  const { convertedChars: c, alreadyChars: a } = stats;

  if (c === 0) {
    return {
      line,
      share: null,
      warning: isUnicodeKey(pair.from)
        ? `No Unicode Hindi text found in this document. Is it already in ${docLabel(pair.to)}?`
        : `No ${from} text found in this document. Is it already Unicode?`,
    };
  }
  if (a === 0) return { line, share: 'All Hindi text converted.', warning: null };

  // Rounded down, so a document that is 99.7% Kruti never claims "100%" while
  // still reporting some text as left alone.
  const pct = Math.max(1, Math.floor((100 * c) / (c + a)));
  return {
    line,
    share:
      `${pct}% of the Hindi text was in ${from} and has been converted. ` +
      `${100 - pct}% was already ${to} and was left as it is.`,
    warning: null,
  };
}

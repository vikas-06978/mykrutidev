// Reading, checking and repairing the webfonts in public/fonts/.
//
//   node scripts/webfont.mjs check [file ...]   list what Chrome's font sanitizer would reject
//   node scripts/webfont.mjs fix   [file ...]   repair it in place, changing only those bytes
//
// Why this exists: Chrome runs every downloaded font through OTS, which refuses
// the whole font (the text then falls back to a Latin font and shows the legacy
// keys instead of Hindi) for tiny header mistakes that Word and Windows ignore.
// Ajay, Aman and Ruchi shipped with two of them:
//   - a cmap subtable whose `language` field is 1, not 0
//     ("cmap: language id should be zero");
//   - Ruchi's kern table with searchRange/entrySelector/rangeShift that do not
//     match its pair count ("kern: bad search range").
// The repair rewrites exactly those header fields (and the checksums that cover
// them). Glyph outlines, metrics, names and every other table keep their bytes.
// src/lib/fontFiles.test.js runs `problems()` on every font, so a new font with
// the same mistake fails `npm test` instead of silently breaking a page.
//
// Two containers occur in public/fonts/: WOFF 1.0, and raw TrueType under a
// .woff name (preeti.woff, see docs/FONTS.md). Both are checked; only WOFF is
// rewritten.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const WOFF_HEADER = 44;
const WOFF_ENTRY = 20;

/** The sum of a table's big-endian 32-bit words, zero padded: what sfnt calls a checksum. */
export function checksum(buf) {
  let sum = 0;
  const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/**
 * The tables of a font file, whichever container holds them.
 * @param {Buffer} buf
 * @returns {{ kind: 'woff' | 'sfnt', flavor: number, version: [number, number], tables: { tag: string, origChecksum: number, data: Buffer }[], tail: Buffer, hasExtras: boolean }}
 */
export function readFont(buf) {
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOFF') {
    const numTables = buf.readUInt16BE(12);
    const tables = [];
    let end = WOFF_HEADER + numTables * WOFF_ENTRY;
    for (let i = 0; i < numTables; i++) {
      const at = WOFF_HEADER + i * WOFF_ENTRY;
      const offset = buf.readUInt32BE(at + 4);
      const compLength = buf.readUInt32BE(at + 8);
      const origLength = buf.readUInt32BE(at + 12);
      const raw = buf.subarray(offset, offset + compLength);
      const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
      if (data.length !== origLength) throw new Error(`${buf.toString('latin1', at, at + 4)}: length ${data.length}, expected ${origLength}`);
      tables.push({ tag: buf.toString('latin1', at, at + 4), origChecksum: buf.readUInt32BE(at + 16), data });
      end = Math.max(end, offset + compLength);
    }
    return {
      kind: 'woff',
      flavor: buf.readUInt32BE(4),
      version: [buf.readUInt16BE(20), buf.readUInt16BE(22)],
      tables,
      tail: buf.subarray(Math.ceil(end / 4) * 4),
      // WOFF metadata (24..35) and private data (36..43) blocks, which the writer below does not carry over
      hasExtras: buf.readUInt32BE(28) !== 0 || buf.readUInt32BE(40) !== 0,
    };
  }
  const flavor = buf.readUInt32BE(0);
  if (flavor !== 0x00010000 && sig !== 'OTTO' && sig !== 'true') throw new Error('not a WOFF 1.0 or TrueType/OpenType file');
  const n = buf.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    const offset = buf.readUInt32BE(at + 8);
    const length = buf.readUInt32BE(at + 12);
    tables.push({ tag: buf.toString('latin1', at, at + 4), origChecksum: buf.readUInt32BE(at + 4), data: Buffer.from(buf.subarray(offset, offset + length)) });
  }
  return { kind: 'sfnt', flavor, version: [0, 0], tables, tail: Buffer.alloc(0), hasExtras: false };
}

/** @returns {Buffer} a WOFF 1.0 file, each table compressed when that makes it smaller */
export function writeWoff(font) {
  const tables = [...font.tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const blobs = tables.map((t) => {
    const z = deflateSync(t.data, { level: 9 });
    return z.length < t.data.length ? z : t.data;
  });
  let offset = WOFF_HEADER + tables.length * WOFF_ENTRY;
  const dir = [];
  const parts = [];
  tables.forEach((t, i) => {
    dir.push({ tag: t.tag, offset, comp: blobs[i].length, orig: t.data.length, sum: t.origChecksum });
    parts.push(blobs[i], Buffer.alloc((4 - (blobs[i].length % 4)) % 4));
    offset += Math.ceil(blobs[i].length / 4) * 4;
  });
  const head = Buffer.alloc(WOFF_HEADER);
  head.write('wOFF', 0, 'latin1');
  head.writeUInt32BE(font.flavor, 4);
  head.writeUInt16BE(tables.length, 12);
  head.writeUInt32BE(12 + 16 * tables.length + tables.reduce((n, t) => n + Math.ceil(t.data.length / 4) * 4, 0), 16);
  head.writeUInt16BE(font.version[0], 20);
  head.writeUInt16BE(font.version[1], 22);
  const entries = dir.map((d) => {
    const e = Buffer.alloc(WOFF_ENTRY);
    e.write(d.tag, 0, 'latin1');
    e.writeUInt32BE(d.offset, 4);
    e.writeUInt32BE(d.comp, 8);
    e.writeUInt32BE(d.orig, 12);
    e.writeUInt32BE(d.sum, 16);
    return e;
  });
  const out = Buffer.concat([head, ...entries, ...parts, font.tail]);
  out.writeUInt32BE(out.length, 8);
  return out;
}

// -- cmap ---------------------------------------------------------------------

/** Every subtable's language field. */
function cmapSubtables(cmap) {
  const n = cmap.readUInt16BE(2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const at = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(at);
    // formats 0, 2, 4, 6 keep a 16-bit language at +4; 8, 10, 12, 13 a 32-bit one at +8
    const wide = format >= 8;
    out.push({ at, platform, format, wide, language: wide ? cmap.readUInt32BE(at + 8) : cmap.readUInt16BE(at + 4) });
  }
  return out;
}

// -- kern ---------------------------------------------------------------------

/** Format 0 subtables of a kern table (Microsoft layout): where the header sits and what it should say. */
function kernSubtables(kern) {
  const out = [];
  if (kern.readUInt16BE(0) !== 0) return out;
  let at = 4;
  for (let i = 0; i < kern.readUInt16BE(2); i++) {
    const length = kern.readUInt16BE(at + 2);
    // coverage is a 16-bit field with the subtable format in its high byte
    if (kern.readUInt8(at + 4) === 0) {
      const pairs = kern.readUInt16BE(at + 6);
      const entrySelector = pairs ? Math.floor(Math.log2(pairs)) : 0;
      const searchRange = pairs ? 6 * 2 ** entrySelector : 0;
      out.push({
        at,
        pairs,
        want: { searchRange, entrySelector, rangeShift: 6 * pairs - searchRange },
        have: { searchRange: kern.readUInt16BE(at + 8), entrySelector: kern.readUInt16BE(at + 10), rangeShift: kern.readUInt16BE(at + 12) },
      });
    }
    at += length || kern.length;
  }
  return out;
}

const headForSum = (t) => (t.tag === 'head' ? Buffer.concat([t.data.subarray(0, 8), Buffer.alloc(4), t.data.subarray(12)]) : t.data);

/**
 * What Chrome's sanitizer would refuse in this font, as readable lines. Empty: fine.
 * (Stored table checksums are not checked: several of the older fonts here carry
 * stale ones and Chrome loads them, so reporting them would only be noise.)
 */
export function problems(buf) {
  const font = readFont(buf);
  const by = Object.fromEntries(font.tables.map((t) => [t.tag, t]));
  const out = [];
  for (const need of ['cmap', 'head', 'hhea', 'hmtx', 'maxp']) if (!by[need]) out.push(`missing ${need} table`);
  if (!by.glyf && !by['CFF ']) out.push('no glyph outlines (glyf or CFF)');
  if (by.cmap) for (const s of cmapSubtables(by.cmap.data)) if (s.language !== 0) out.push(`cmap: platform ${s.platform} format ${s.format} subtable has language ${s.language}, not 0`);
  // OTS quietly corrects a wrong searchRange or rangeShift (dvtt-surekh and narad have
  // them and load fine); a wrong entrySelector is the one it refuses the font for.
  if (by.kern) for (const s of kernSubtables(by.kern.data)) {
    if (s.have.entrySelector !== s.want.entrySelector) out.push(`kern: entry selector is ${s.have.entrySelector} but ${s.pairs} pairs need ${s.want.entrySelector}`);
  }
  return out;
}

/** The same WOFF with the header fields above corrected. Returns the new bytes. */
export function repair(buf) {
  const font = readFont(buf);
  if (font.kind !== 'woff') throw new Error('only WOFF files are rewritten');
  if (font.hasExtras) throw new Error('this WOFF carries a metadata or private block, which the repair would drop');
  const by = Object.fromEntries(font.tables.map((t) => [t.tag, t]));
  if (by.cmap) for (const s of cmapSubtables(by.cmap.data)) {
    if (s.language === 0) continue;
    if (s.wide) by.cmap.data.writeUInt32BE(0, s.at + 8);
    else by.cmap.data.writeUInt16BE(0, s.at + 4);
  }
  if (by.kern) for (const s of kernSubtables(by.kern.data)) {
    by.kern.data.writeUInt16BE(s.want.searchRange, s.at + 8);
    by.kern.data.writeUInt16BE(s.want.entrySelector, s.at + 10);
    by.kern.data.writeUInt16BE(s.want.rangeShift, s.at + 12);
  }
  for (const t of font.tables) t.origChecksum = checksum(headForSum(t));
  // head.checkSumAdjustment = 0xB1B0AFBA minus the checksum of the whole font in sfnt layout.
  const sorted = [...font.tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = sorted.length;
  const log = Math.floor(Math.log2(n));
  const hdr = Buffer.alloc(12);
  hdr.writeUInt32BE(font.flavor, 0);
  hdr.writeUInt16BE(n, 4);
  hdr.writeUInt16BE(16 * 2 ** log, 6);
  hdr.writeUInt16BE(log, 8);
  hdr.writeUInt16BE(n * 16 - 16 * 2 ** log, 10);
  let off = 12 + 16 * n;
  let whole = checksum(hdr);
  for (const t of sorted) {
    const e = Buffer.alloc(16);
    e.write(t.tag, 0, 'latin1');
    e.writeUInt32BE(t.origChecksum, 4);
    e.writeUInt32BE(off, 8);
    e.writeUInt32BE(t.data.length, 12);
    off += Math.ceil(t.data.length / 4) * 4;
    whole = (whole + checksum(e) + t.origChecksum) >>> 0;
  }
  if (by.head) by.head.data.writeUInt32BE((0xb1b0afba - whole) >>> 0, 8);
  return writeWoff(font);
}

// -- command line ---------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...given] = process.argv.slice(2);
  const dir = fileURLToPath(new URL('../public/fonts/', import.meta.url));
  const files = given.length ? given : readdirSync(dir).filter((f) => f.endsWith('.woff')).map((f) => dir + f);
  if (cmd !== 'check' && cmd !== 'fix') {
    console.error('usage: node scripts/webfont.mjs check|fix [file.woff ...]');
    process.exit(2);
  }
  let bad = 0;
  for (const f of files) {
    const before = readFileSync(f);
    const issues = problems(before);
    if (!issues.length) continue;
    bad++;
    console.log(`${f.split('/').pop()}:`);
    for (const i of issues) console.log(`  - ${i}`);
    if (cmd === 'fix') {
      const fixed = repair(before);
      const left = problems(fixed);
      if (left.length) throw new Error(`${f}: still has problems after the repair: ${left.join('; ')}`);
      writeFileSync(f, fixed);
      console.log(`  repaired (${before.length} -> ${fixed.length} bytes)`);
    }
  }
  console.log(bad ? `${bad} font(s) ${cmd === 'fix' ? 'repaired' : 'with problems'}` : `all ${files.length} fonts are clean`);
  if (cmd === 'check' && bad) process.exit(1);
}

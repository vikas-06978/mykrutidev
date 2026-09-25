/**
 * Does a font file draw anything for a character? Build and test time only.
 *
 * Reads a WOFF (or raw TrueType) file's cmap and glyf tables: a character
 * "has a glyph" when the cmap maps it to a glyph whose outline is not empty.
 * Legacy symbol fonts sometimes put ASCII at U+F000+, so that is checked too.
 *
 * Used by the printable keyboard chart, so it never shows a key as typing
 * nothing when the font does draw something for it.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function tablesOf(buf) {
  const tables = {};
  if (buf.toString('latin1', 0, 4) === 'wOFF') {
    for (let i = 0; i < buf.readUInt16BE(12); i++) {
      const o = 44 + i * 20;
      const tag = buf.toString('latin1', o, o + 4);
      const off = buf.readUInt32BE(o + 4);
      const comp = buf.readUInt32BE(o + 8);
      const orig = buf.readUInt32BE(o + 12);
      const raw = buf.subarray(off, off + comp);
      tables[tag] = comp === orig ? Buffer.from(raw) : inflateSync(raw);
    }
  } else {
    for (let i = 0; i < buf.readUInt16BE(4); i++) {
      const o = 12 + i * 16;
      const off = buf.readUInt32BE(o + 8);
      tables[buf.toString('latin1', o, o + 4)] = buf.subarray(off, off + buf.readUInt32BE(o + 12));
    }
  }
  return tables;
}

/**
 * @param {string | URL} file
 * @returns {(ch: string) => boolean} whether the font draws a non-empty glyph for ch
 */
export function glyphChecker(file) {
  const t = tablesOf(readFileSync(file));
  const cm = t.cmap;
  let sub = 0;
  for (let i = 0; i < cm.readUInt16BE(2); i++) {
    const r = 4 + i * 8;
    const s = cm.readUInt32BE(r + 4);
    if (cm.readUInt16BE(s) === 4) {
      sub = s;
      if (cm.readUInt16BE(r) === 3) break; // prefer the Windows table
    }
  }
  if (!sub) throw new Error(`${file}: no format-4 cmap`);
  const segX2 = cm.readUInt16BE(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  const gid = (cp) => {
    for (let s = 0; s < segX2 / 2; s++) {
      if (cp > cm.readUInt16BE(ends + s * 2)) continue;
      const st = cm.readUInt16BE(starts + s * 2);
      if (cp < st) return 0;
      const ro = cm.readUInt16BE(ranges + s * 2);
      if (ro === 0) return (cp + cm.readInt16BE(deltas + s * 2)) & 0xffff;
      const g = cm.readUInt16BE(ranges + s * 2 + ro + (cp - st) * 2);
      return g === 0 ? 0 : (g + cm.readInt16BE(deltas + s * 2)) & 0xffff;
    }
    return 0;
  };
  const longLoca = t.head.readInt16BE(50) === 1;
  const at = (g) => (longLoca ? t.loca.readUInt32BE(g * 4) : t.loca.readUInt16BE(g * 2) * 2);
  return (ch) => {
    const cp = ch.codePointAt(0);
    for (const c of [cp, 0xf000 + cp]) {
      const g = gid(c);
      if (g) return at(g + 1) > at(g);
    }
    return false;
  };
}

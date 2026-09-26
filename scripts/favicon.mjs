/**
 * The browser-tab icon: public/favicon.svg and public/favicon.ico.
 *
 * The same mark as the installed app's icons (scripts/og-images.mjs): a bold
 * क in the site's paper colour on the terracotta accent. The letter is taken
 * from the font as an outline, so the SVG needs no font on the visitor's
 * device. The .ico (16, 32 and 48 px) is for browsers and tools that do not
 * read SVG icons.
 *
 * Run `npm run favicon` after changing the mark, and commit both files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { create } from 'fontkitten';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FONT = `${ROOT}node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff`;

export const ACCENT = '#a8442a';
export const PAPER = '#faf7f2';

/** The icon as SVG: a rounded square, and क filling about 70% of its width. */
export function faviconSvg() {
  const glyph = create(readFileSync(FONT)).glyphForCodePoint(0x0915);
  const { minX, minY, maxX, maxY } = glyph.bbox;
  const SIZE = 64;
  const s = (SIZE * 0.7) / (maxX - minX);
  // Font units point up; SVG units point down. Centre the letter's box.
  const tx = (SIZE - (maxX - minX) * s) / 2 - minX * s;
  const ty = SIZE / 2 + ((maxY + minY) / 2) * s;
  const r = (n) => Math.round(n * 1000) / 1000;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="14" fill="${ACCENT}"/>
  <path fill="${PAPER}" transform="matrix(${r(s)} 0 0 ${r(-s)} ${r(tx)} ${r(ty)})" d="${glyph.path.toSVG()}"/>
</svg>
`;
}

/** An .ico holding PNG images, which every browser since IE 11 reads. */
function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const svg = faviconSvg();
  writeFileSync(`${ROOT}public/favicon.svg`, svg);
  const pngs = [];
  for (const size of [16, 32, 48]) {
    pngs.push({ size, data: await sharp(Buffer.from(svg), { density: 72 * (size / 64) * 4 }).resize(size, size).png().toBuffer() });
  }
  writeFileSync(`${ROOT}public/favicon.ico`, ico(pngs));
  console.log('favicon: wrote public/favicon.svg and public/favicon.ico (16, 32, 48 px)');
}

// The printable PDFs, printed from built HTML pages. Printing the pages
// themselves is what keeps the PDFs in sync with the data: there is no second
// layout to drift. Run through `npm run pdfs` (scripts/pdfs.mjs), which also
// runs before every `npm run build`; the PDFs are committed under
// public/downloads/, so they exist in dev, in production and in git.
//
// Each PDF: A4 (landscape for the keyboard chart), the print stylesheet in
// printables.css, Noto fonts only, a footer with the page number on every
// page. It FAILS if a PDF has the wrong page count, is not A4, is 500 KB or
// more, or embeds any other font.
//
// Needs Playwright's Chromium (`npx playwright install chromium`).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';

import { PRINTABLES, pdfFile } from '../src/lib/printables.js';
import { serveDist } from './serve-dist.mjs';

export const MAX_BYTES = 500 * 1024;
const A4 = { w: 595.28, h: 841.89 }; // points
const LANGS = ['en', 'hi'];
const PORT = 4431;
// Chrome stamps the current time into every PDF. A fixed date keeps an
// unchanged PDF byte-identical, so rebuilding does not rewrite committed files.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

/** Noto Sans Devanagari and Noto Sans: both SIL Open Font License. */
export const OPEN_FONTS = /^NotoSans(Devanagari)?-/;

/** The font names a PDF embeds, without the six-letter subset prefix. */
export const embeddedFonts = (bytes) => [
  ...new Set(
    [...Buffer.from(bytes).toString('latin1').matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)].map((m) =>
      m[1].replace(/^[A-Z]{6}\+/, ''),
    ),
  ),
];

/**
 * Chrome tags table cells with its internal layout ids ("node00008552", used
 * by /ID and /Headers in the structure tree), which change on every run.
 * Renumber them in order of appearance, so an unchanged page stays the same
 * bytes and rebuilding does not rewrite the committed PDF.
 */
function stableNodeIds(doc) {
  const ids = new Map();
  const fix = (obj) => {
    if (obj instanceof PDFDict) {
      for (const [key, value] of obj.entries()) {
        const next = fix(value);
        if (next) obj.set(key, next);
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const next = fix(obj.get(i));
        if (next) obj.set(i, next);
      }
    } else if (obj instanceof PDFString || obj instanceof PDFHexString) {
      const s = obj.decodeText();
      if (/^node\d+$/.test(s)) {
        if (!ids.has(s)) ids.set(s, `node${String(ids.size + 1).padStart(8, '0')}`);
        return PDFString.of(ids.get(s));
      }
    }
    return null;
  };
  const objects = doc.context.enumerateIndirectObjects().sort(([a], [b]) => a.objectNumber - b.objectNumber);
  for (const [, obj] of objects) fix(obj);

  // The ID name tree lists [id, element] pairs sorted by the OLD ids, whose
  // order varies from run to run: sort by the new ones and reset /Limits.
  const NAMES = PDFName.of('Names');
  const LIMITS = PDFName.of('Limits');
  for (const [, obj] of objects) {
    const names = obj instanceof PDFDict ? obj.get(NAMES) : null;
    if (!(names instanceof PDFArray) || names.size() === 0) continue;
    const pairs = [];
    for (let i = 0; i + 1 < names.size(); i += 2) pairs.push([names.get(i), names.get(i + 1)]);
    if (!pairs.every(([k]) => k instanceof PDFString && /^node\d+$/.test(k.decodeText()))) continue;
    pairs.sort(([a], [b]) => (a.decodeText() < b.decodeText() ? -1 : 1));
    obj.set(NAMES, doc.context.obj(pairs.flat()));
    obj.set(LIMITS, doc.context.obj([pairs[0][0], pairs.at(-1)[0]]));
  }
}

/** The URL path of a printable in a language. */
const urlOf = (path, lang) => (lang === 'en' ? path : `/hi${path}`);

/**
 * @param {string} site absolute path of a built site, ending in a separator
 * @param {string} out  folder to write the PDFs into
 * @param {{ info: (m: string) => void }} [log]
 */
export async function buildPdfs(site, out, log = console) {
  mkdirSync(out, { recursive: true });
  const server = await serveDist(site, PORT);
  const browser = await chromium.launch();
  const made = [];
  try {
    const page = await browser.newPage();
    for (const p of PRINTABLES) {
      for (const lang of LANGS) {
        const name = pdfFile(p, lang);
        await page.goto(`http://localhost:${PORT}${urlOf(p.path, lang)}`, { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });
        // The print fonts, both weights, loaded before anything is laid out.
        await page.evaluate(async () => {
          await Promise.all(
            ['400', '600'].flatMap((w) => [
              document.fonts.load(`${w} 16px "MKD Print"`, 'कA1'),
              document.fonts.load(`${w} 16px "MKD Print Latin"`, '`A1'),
            ]),
          );
          await document.fonts.ready;
        });
        const printed = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });

        const doc = await PDFDocument.load(printed, { updateMetadata: false });
        doc.setTitle(await page.evaluate(() => document.querySelector('.pr-title')?.textContent?.trim() ?? document.title));
        doc.setAuthor('MyKrutiDev.com');
        doc.setCreator('MyKrutiDev.com');
        doc.setProducer('MyKrutiDev.com');
        doc.setCreationDate(FIXED_DATE);
        doc.setModificationDate(FIXED_DATE);
        stableNodeIds(doc);
        // No object streams: they compress the font dictionaries out of sight, and
        // the Noto-only check below (and in tests/dist.test.js) must see them.
        const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));

        // Check it, and fail if it is wrong.
        const pages = doc.getPageCount();
        const { width, height } = doc.getPage(0).getSize();
        const [w, h] = p.landscape ? [A4.h, A4.w] : [A4.w, A4.h];
        const problems = [];
        if (pages !== p.pages) problems.push(`${pages} pages, expected ${p.pages}`);
        if (Math.abs(width - w) > 1 || Math.abs(height - h) > 1) problems.push(`page is ${width}x${height}pt, not A4`);
        if (bytes.length >= MAX_BYTES) problems.push(`${Math.round(bytes.length / 1024)} KB, the limit is ${MAX_BYTES / 1024} KB`);
        const fonts = embeddedFonts(bytes);
        if (!fonts.length) problems.push('no embedded font found');
        const other = fonts.filter((f) => !OPEN_FONTS.test(f));
        if (other.length) problems.push(`embeds ${other.join(', ')} (only Noto Sans / Noto Sans Devanagari allowed)`);
        if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);

        const file = join(out, name);
        const same = existsSync(file) && readFileSync(file).equals(bytes);
        if (!same) writeFileSync(file, bytes);
        made.push(`${name} (${pages} p, ${Math.round(bytes.length / 1024)} KB)${same ? '' : ' - updated'}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  log.info(`printable PDFs in ${out}:\n  ${made.join('\n  ')}`);
  return made;
}

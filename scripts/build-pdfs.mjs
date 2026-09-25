// The printable PDFs, printed from the built HTML pages at the end of every
// `astro build` (the integration in astro.config.mjs calls buildPdfs()).
// Printing the pages themselves is what keeps the PDFs in sync with the data:
// there is no second layout to drift.
//
// Each PDF: A4 (landscape for the keyboard chart), the print stylesheet in
// printables.css, Noto Sans Devanagari as the only font, a footer with the
// page number on every page. The build FAILS if a PDF has the wrong page
// count, is not A4, or is 500 KB or more.
//
// Needs Playwright's Chromium (`npx playwright install chromium`).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

import { PRINTABLES } from '../src/lib/printables.js';
import { serveDist } from './serve-dist.mjs';

export const MAX_BYTES = 500 * 1024;
const A4 = { w: 595.28, h: 841.89 }; // points
const LANGS = ['en', 'hi'];
const PORT = 4431;

/** Noto Sans Devanagari and Noto Sans: both SIL Open Font License. */
export const OPEN_FONTS = /^NotoSans(Devanagari)?-/;

/** The font names a PDF embeds, without the six-letter subset prefix. */
export const embeddedFonts = (bytes) => [
  ...new Set(
    [...bytes.toString('latin1').matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, '')),
  ),
];

/** The URL path of a printable in a language. */
const urlOf = (path, lang) => (lang === 'en' ? path : `/hi${path}`);

/**
 * @param {string} dist absolute path of the built site, ending in a separator
 * @param {{ info: (m: string) => void }} [log]
 */
export async function buildPdfs(dist, log = console) {
  const out = join(dist, 'downloads');
  mkdirSync(out, { recursive: true });
  const server = await serveDist(dist, PORT);
  const browser = await chromium.launch();
  const made = [];
  try {
    const page = await browser.newPage();
    for (const p of PRINTABLES) {
      for (const lang of LANGS) {
        await page.goto(`http://localhost:${PORT}${urlOf(p.path, lang)}`, { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });
        // The print font, both weights, loaded before anything is laid out.
        await page.evaluate(async () => {
          await Promise.all(
            ['400', '600'].flatMap((w) => [
              document.fonts.load(`${w} 16px "MKD Print"`, 'कA1'),
              document.fonts.load(`${w} 16px "MKD Print Latin"`, '`A1'),
            ]),
          );
          await document.fonts.ready;
        });
        const file = join(out, `${p.pdf}-${lang}.pdf`);
        await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });

        // Check what was written, and fail the build if it is wrong.
        const bytes = statSync(file).size;
        const doc = await PDFDocument.load(readFileSync(file));
        const pages = doc.getPageCount();
        const { width, height } = doc.getPage(0).getSize();
        const [w, h] = p.landscape ? [A4.h, A4.w] : [A4.w, A4.h];
        const problems = [];
        if (pages !== p.pages) problems.push(`${pages} pages, expected ${p.pages}`);
        if (Math.abs(width - w) > 1 || Math.abs(height - h) > 1) problems.push(`page is ${width}x${height}pt, not A4`);
        if (bytes >= MAX_BYTES) problems.push(`${Math.round(bytes / 1024)} KB, the limit is ${MAX_BYTES / 1024} KB`);
        // Only the two open (SIL OFL) Noto fonts may be embedded: a system
        // font here means a glyph fell through the print stack.
        const other = embeddedFonts(readFileSync(file)).filter((f) => !OPEN_FONTS.test(f));
        if (other.length) problems.push(`embeds ${other.join(', ')} (only Noto Sans / Noto Sans Devanagari allowed)`);
        if (problems.length) throw new Error(`${p.pdf}-${lang}.pdf: ${problems.join('; ')}`);
        made.push(`${p.pdf}-${lang}.pdf (${pages} p, ${Math.round(bytes / 1024)} KB)`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  log.info(`printable PDFs: ${made.length} written to /downloads/\n  ${made.join('\n  ')}`);
  return made;
}

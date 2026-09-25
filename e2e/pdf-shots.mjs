// Renders page 1 of every committed PDF (public/downloads) to a PNG with pdf.js, the real PDF - not
// the HTML it was printed from. `node e2e/pdf-shots.mjs [outDir]` after `npm run pdfs`.
// Output: screenshots/pdf/<name>.png (gitignored).
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../public/downloads/', import.meta.url));
const PDFJS = fileURLToPath(new URL('../node_modules/pdfjs-dist/build/', import.meta.url));
const OUT = process.argv[2] ?? 'screenshots/pdf';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
// One made-up origin serves the page, pdf.js and the PDFs, so imports are same-origin.
await page.route('http://pdf.local/**', (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/') return route.fulfill({ body: '<canvas id="c"></canvas>', contentType: 'text/html' });
  const [dir, type] = path.startsWith('/pdfjs/') ? [PDFJS, 'text/javascript'] : [DIST, 'application/pdf'];
  return route.fulfill({ body: readFileSync(dir + path.split('/').pop()), contentType: type });
});
await page.goto('http://pdf.local/');

for (const name of readdirSync(DIST).filter((f) => f.endsWith('.pdf')).sort()) {
  const info = await page.evaluate(async (url) => {
    const pdfjs = await import('http://pdf.local/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'http://pdf.local/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url }).promise;
    const p = await doc.getPage(1);
    const viewport = p.getViewport({ scale: 1.6 });
    const canvas = document.getElementById('c');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { pages: doc.numPages, w: Math.round(p.view[2]), h: Math.round(p.view[3]) };
  }, `http://pdf.local/downloads/${name}`);
  await page.locator('#c').screenshot({ path: `${OUT}/${name.replace('.pdf', '')}.png` });
  console.log(`${name}: ${info.pages} page(s), ${info.w}x${info.h} pt`);
}
await browser.close();

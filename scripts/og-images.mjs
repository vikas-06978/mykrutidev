// `npm run og` (and before every `npm run build`): draws the Open Graph image
// for every indexable page in both languages - the page's heading on the
// site's background - into public/og/<lang>/<slug>.png, plus public/og/logo.png
// for the Organization data. Chrome draws them, so Devanagari is shaped
// exactly as on the site (an SVG renderer would break the conjuncts).
//
// The file list comes from ogEntries() in src/lib/og.js, the same function
// Base.astro uses to point each page at its image. A file is rewritten only
// when its pixels change, so an unchanged page never shows up in git.
//
// Needs Playwright's Chromium (`npx playwright install chromium`).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ogEntries, OG_SIZE } from '../src/lib/og.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(root, 'public', 'og');
const FONT = (pkg, file) => join(root, 'node_modules', '@fontsource', pkg, 'files', file);
const FONTS = {
  '/deva-700.woff2': FONT('noto-sans-devanagari', 'noto-sans-devanagari-devanagari-700-normal.woff2'),
  '/deva-latin-700.woff2': FONT('noto-sans-devanagari', 'noto-sans-devanagari-latin-700-normal.woff2'),
  '/latin-600.woff2': FONT('noto-sans', 'noto-sans-latin-600-normal.woff2'),
  '/latin-700.woff2': FONT('noto-sans', 'noto-sans-latin-700-normal.woff2'),
};
for (const f of Object.values(FONTS)) if (!existsSync(f)) throw new Error(`og-images: missing font ${f}`);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STYLE = `
@font-face { font-family: Deva; font-weight: 700; src: url(/deva-700.woff2) format('woff2'); unicode-range: U+0900-097F, U+1CD0-1CFF, U+200C-200D, U+25CC, U+A830-A83F, U+A8E0-A8FF; }
@font-face { font-family: Deva; font-weight: 700; src: url(/deva-latin-700.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2013-2014, U+2018-201F, U+2192; }
@font-face { font-family: Latin; font-weight: 600; src: url(/latin-600.woff2) format('woff2'); }
@font-face { font-family: Latin; font-weight: 700; src: url(/latin-700.woff2) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${OG_SIZE.width}px; height: ${OG_SIZE.height}px; }
body { background: #faf7f2; color: #1a2744; font-family: Latin, Deva, sans-serif; position: relative; overflow: hidden; }
.bar { position: absolute; left: 0; top: 0; bottom: 0; width: 22px; background: #a8442a; }
.glyph { position: absolute; right: -40px; bottom: -150px; font: 700 560px/1 Deva; color: #a8442a; opacity: 0.08; }
.card { position: absolute; left: 90px; right: 110px; top: 70px; bottom: 70px; display: flex; flex-direction: column; }
.kicker { font: 600 30px/1.2 Latin, Deva; letter-spacing: 0.02em; color: #a8442a; text-transform: uppercase; }
.kicker[lang=hi] { text-transform: none; font-family: Deva; font-weight: 700; }
.title { margin-top: 26px; font-weight: 700; color: #1a2744; line-height: 1.18; }
.title[lang=hi] { font-family: Deva; line-height: 1.42; }
.foot { margin-top: auto; display: flex; align-items: baseline; justify-content: space-between; font: 600 32px/1 Latin; color: #46536b; }
.brand { font: 700 44px/1 Latin; color: #1a2744; }
.brand b { color: #a8442a; font-weight: 700; }
.rule { position: absolute; left: 90px; right: 110px; bottom: 138px; height: 2px; background: #e5ded3; }
`;

function page({ title, kicker, lang }) {
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>${STYLE}</style>
<body><div class="bar"></div><div class="glyph" aria-hidden="true">क</div><div class="rule"></div>
<div class="card"><p class="kicker" lang="${lang}">${esc(kicker)}</p><h1 class="title" lang="${lang}" id="t">${esc(title)}</h1>
<div class="foot"><span class="brand">My<b>Kruti</b>Dev</span><span>mykrutidev.com</span></div></div></body></html>`;
}

const LOGO = `<!doctype html><meta charset="utf-8"><style>${STYLE}
html, body { width: 512px; height: 512px; background: #a8442a; }
.l { position: absolute; inset: 0; display: grid; place-items: center; font: 700 330px/1 Deva; color: #faf7f2; padding-bottom: 40px; }
.w { position: absolute; left: 0; right: 0; bottom: 46px; text-align: center; font: 700 50px/1 Latin; color: #faf7f2; }
</style><body><div class="l">क</div><div class="w">MyKrutiDev</div></body>`;

const browser = await chromium.launch();
const written = [];
let same = 0;
try {
  const ctx = await browser.newContext({ viewport: OG_SIZE, deviceScaleFactor: 1 });
  const tab = await ctx.newPage();
  let html = '';
  await tab.route('http://og.local/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (FONTS[path]) return route.fulfill({ body: readFileSync(FONTS[path]), contentType: 'font/woff2' });
    return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
  });

  const save = (file, bytes) => {
    const target = join(OUT, file);
    if (existsSync(target) && readFileSync(target).equals(bytes)) return same++;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    written.push(file);
  };

  const entries = ogEntries();
  for (const e of entries) {
    html = page(e);
    await tab.goto('http://og.local/');
    await tab.evaluate(() => document.fonts.ready);
    // The largest size at which the heading fits in four lines.
    await tab.evaluate(() => {
      const t = document.getElementById('t');
      const max = t.getBoundingClientRect().top;
      for (let size = 76; size >= 40; size -= 2) {
        t.style.fontSize = `${size}px`;
        const lh = parseFloat(getComputedStyle(t).lineHeight);
        if (t.scrollHeight <= lh * 4 + 2 && t.getBoundingClientRect().bottom < 630 - 170) break;
      }
      return max;
    });
    save(e.file, await tab.screenshot({ type: 'png' }));
  }

  await tab.setViewportSize({ width: 512, height: 512 });
  html = LOGO;
  await tab.goto('http://og.local/');
  await tab.evaluate(() => document.fonts.ready);
  save('logo.png', await tab.screenshot({ type: 'png' }));

  // Images for pages that no longer exist.
  const want = new Set([...entries.map((e) => e.file.replace(/\\/g, '/')), 'logo.png']);
  for (const lang of ['en', 'hi']) {
    const dir = join(OUT, lang);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!want.has(`${lang}/${f}`)) {
        rmSync(join(dir, f));
        written.push(`${lang}/${f} (removed)`);
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`og images in ${OUT}: ${written.length} written, ${same} unchanged`);
for (const f of written) console.log(`  ${f}`);

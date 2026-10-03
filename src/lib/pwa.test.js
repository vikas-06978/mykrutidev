import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { precachePlan, urlOf } from '../pwa/integration.mjs';
import { LOCALES } from '../i18n/locales.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// A miniature build: two converter pages (en + hi), the home page, the tutor
// and a guide, with the chunks and fonts they reference.
const FACES =
  '@font-face{font-family:Noto Sans Devanagari;src:url(/_astro/deva.woff2)format("woff2"),url(/_astro/deva.woff)format("woff")}' +
  '@font-face{font-family:"MKD Kruti Dev 010";src:local("Kruti Dev 010"),url(/fonts/KRDEV010.woff)format("woff")}' +
  '@font-face{font-family:"MKD DevLys 010";src:url(/fonts/devlys-010.woff)format("woff")}';
const page = (body, scripts = []) =>
  `<html><head><style>${FACES}</style>${scripts.map((s) => `<script type="module" src="/_astro/${s}"></script>`).join('')}</head><body>${body}</body></html>`;
const CONVERTER = page('<div data-converter style="--cv-preview:&quot;MKD Kruti Dev 010&quot;, monospace"></div>', ['Header.js', 'Converter.js']);
const PAIRING = page('<div data-converter data-offline="visit" style="--cv-preview:&quot;MKD DevLys 010&quot;, monospace"></div>', ['Header.js', 'Converter.js']);
const BUILD = {
  'kruti-dev-to-devlys/index.html': PAIRING,
  'index.html': CONVERTER,
  'hi/index.html': CONVERTER,
  '404.html': page('', ['Header.js']),
  'unicode-to-kruti-dev/index.html': CONVERTER,
  'hi/unicode-to-kruti-dev/index.html': CONVERTER,
  'hi/english-to-hindi-typing/index.html': page('<div data-translit></div>', ['Header.js', 'Transliterator.js']),
  'hindi-typing-test/index.html': page('<div data-tutor></div>', ['Header.js', 'TypingTutor.js']),
  'guides/x/index.html': page('<article></article>', ['Header.js']),
  '_astro/Header.js': 'import"./app.js";',
  '_astro/app.js': '',
  '_astro/Converter.js': 'import{a}from"./fontMaps.js";const d=()=>import("./docx.js");',
  '_astro/fontMaps.js': '',
  '_astro/docx.js': '',
  '_astro/Transliterator.js': 'const m=["_astro/translit.js"];',
  '_astro/translit.js': '',
  '_astro/TypingTutor.js': '',
  '_astro/deva.woff2': 'x',
  '_astro/deva.woff': 'x',
  'fonts/KRDEV010.woff': 'x',
  'fonts/devlys-010.woff': 'x',
  'data/english-words.json': '[]',
  'downloads/chart.pdf': 'x',
  'og/en/home.png': 'x',
  'manifest.json': '{}',
  'hi/manifest.json': '{}',
  'icons/icon-192.png': 'x',
  'favicon.svg': 'x',
};
const plan = precachePlan(Object.keys(BUILD), (p) => BUILD[p] ?? null);

describe('what the first visit downloads', () => {
  test('the shell and every converter page, in both languages', () => {
    for (const p of ['index.html', 'hi/index.html', '404.html', 'unicode-to-kruti-dev/index.html', 'hi/unicode-to-kruti-dev/index.html', 'hi/english-to-hindi-typing/index.html', 'manifest.json', 'hi/manifest.json', 'icons/icon-192.png', 'favicon.svg']) {
      assert.ok(plan.includes(p), p);
    }
  });

  test('their scripts, followed through static, dynamic and preloaded imports', () => {
    for (const p of ['_astro/Header.js', '_astro/app.js', '_astro/Converter.js', '_astro/fontMaps.js', '_astro/docx.js', '_astro/Transliterator.js', '_astro/translit.js']) {
      assert.ok(plan.includes(p), p);
    }
  });

  test('only the fonts those pages use, as woff2 where there is one', () => {
    assert.ok(plan.includes('_astro/deva.woff2'));
    assert.ok(plan.includes('fonts/KRDEV010.woff'));
    assert.ok(!plan.includes('_astro/deva.woff'));
    assert.ok(!plan.includes('fonts/devlys-010.woff'), 'no page here previews DevLys');
  });

  test('everything else waits for a visit: tutor, guides, PDFs, images, word list', () => {
    for (const p of ['kruti-dev-to-devlys/index.html', 'hindi-typing-test/index.html', '_astro/TypingTutor.js', 'guides/x/index.html', 'downloads/chart.pdf', 'og/en/home.png', 'data/english-words.json']) {
      assert.ok(!plan.includes(p), p);
    }
  });

  test('file paths become the URLs the site links to', () => {
    assert.equal(urlOf('index.html'), '/');
    assert.equal(urlOf('hi/index.html'), '/hi');
    assert.equal(urlOf('hindi-keyboard/index.html'), '/hindi-keyboard');
    assert.equal(urlOf('404.html'), '/404.html');
    assert.equal(urlOf('_astro/a.js'), '/_astro/a.js');
  });
});

describe('manifests', () => {
  // One per language: Base.astro links /<lang>/manifest.json on its pages.
  for (const [file, lang, start] of LOCALES.map((l) =>
    l === 'en' ? ['../../public/manifest.json', 'en', '/'] : [`../../public/${l}/manifest.json`, l, `/${l}`],
  )) {
    test(`${lang}: installable, with a short name in an Indian script and 192/512 icons`, () => {
      const m = JSON.parse(read(file));
      assert.equal(m.name, 'MyKrutiDev');
      assert.match(m.short_name, /[\u0900-\u0BFF]/);
      assert.equal(m.lang, lang);
      assert.equal(m.start_url, start);
      assert.equal(m.display, 'standalone');
      // The Light theme's paper, as Base.astro's browser-bar colour.
      assert.equal(m.theme_color, '#faf7f2');
      const sizes = m.icons.map((i) => i.sizes);
      assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
      assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
      for (const i of m.icons) assert.ok(readFileSync(new URL(`../../public${i.src}`, import.meta.url)).length > 0);
    });
  }
});

describe('first-visit download and the other languages', () => {
  test('English and Hindi converter pages are kept up front; other languages only when opened', () => {
    const files = {
      'index.html': CONVERTER,
      'hi/index.html': CONVERTER,
      'bn/index.html': CONVERTER,
      'bn/unicode-to-kruti-dev/index.html': CONVERTER,
      'ta/index.html': CONVERTER,
    };
    const plan = precachePlan(Object.keys(files), (p) => files[p] ?? null);
    assert.ok(plan.includes('index.html') && plan.includes('hi/index.html'));
    // Only languages in LOCALES are "other languages"; until Bengali or Tamil
    // is published, bn/ and ta/ are just folders and the rule must not care.
    for (const l of ['bn', 'ta']) {
      const kept = plan.some((p) => p.startsWith(`${l}/`));
      assert.equal(kept, !LOCALES.includes(l), `${l}: ${plan}`);
    }
  });
});

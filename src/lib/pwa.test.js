import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { precached, urlOf } from '../pwa/integration.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('what the service worker keeps offline', () => {
  test('pages in both languages, scripts, fonts, the word list, manifests and icons', () => {
    for (const p of [
      'index.html',
      'unicode-to-kruti-dev/index.html',
      'hi/hindi-typing-test/index.html',
      '404.html',
      '_astro/Converter.astro_astro_type_script_index_0_lang.7VDaagLt.js',
      '_astro/noto-sans-devanagari-devanagari-400-normal.BlDd6KY1.woff2',
      'fonts/KRDEV010.woff',
      'data/english-words.json',
      'manifest.json',
      'hi/manifest.json',
      'icons/icon-192.png',
      'favicon.svg',
    ]) {
      assert.ok(precached(p), p);
    }
  });

  test('not social images, PDFs, sitemaps, notes or duplicate .woff web fonts', () => {
    for (const p of [
      'og/en/home.png',
      'downloads/mykrutidev-hindi-typing-finger-chart.pdf',
      'sitemap-0.xml',
      'robots.txt',
      'fonts/README.md',
      'sw.js',
      '_astro/noto-sans-devanagari-devanagari-400-normal.CdOJmQ4E.woff',
    ]) {
      assert.ok(!precached(p), p);
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
  for (const [file, lang, start] of [
    ['../../public/manifest.json', 'en', '/'],
    ['../../public/hi/manifest.json', 'hi', '/hi'],
  ]) {
    test(`${lang}: installable, with the Hindi short name and 192/512 icons`, () => {
      const m = JSON.parse(read(file));
      assert.equal(m.name, 'MyKrutiDev');
      assert.match(m.short_name, /[ऀ-ॿ]/);
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

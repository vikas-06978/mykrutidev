// Preeti (Nepali). The map was read off the font file glyph by glyph - see the
// note above PREETI in fontMaps.js - and these pin it down.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, isPairAccurate, unmappedChars } from './fontMaps.js';
import { getPage, isLive } from './routes.js';
import { previewFontFor } from './legacyFonts.js';
import fixture from './__fixtures__/preeti.json' with { type: 'json' };

const CASES = Object.entries(fixture)
  .filter(([k]) => !k.startsWith('_'))
  .flatMap(([, list]) => list);

describe('Preeti', () => {
  test('Preeti -> Unicode matches the ground truth', () => {
    for (const { p, u, why } of CASES) assert.equal(convert(p, 'preeti', 'unicode'), u, why);
  });

  test('Unicode -> Preeti gives the same keys back', () => {
    for (const { p, u, why } of CASES) assert.equal(convert(u, 'unicode', 'preeti'), p, why);
  });

  test('the number keys are letters, whatever the "keep numbers" box says', () => {
    for (const keepEnglish of [true, false]) {
      assert.equal(convert('3/', 'preeti', 'unicode', { keepEnglish }), 'घर');
      assert.equal(convert('6\'gf', 'preeti', 'unicode', { keepEnglish }), 'टुना');
    }
  });

  test('no English-word guessing: of is या, an is बल', () => {
    assert.equal(convert('of', 'preeti', 'unicode'), 'या');
    assert.equal(convert('an', 'preeti', 'unicode'), 'बल');
  });

  test('web and email addresses are still kept', () => {
    assert.equal(convert("x]g'{xf];\\ www.example.com", 'preeti', 'unicode'), 'हेर्नुहोस् www.example.com');
  });

  test('Latin digits in Unicode text become Preeti digit keys', () => {
    // 0-9 are letters in Preeti, so 2024 has to be written with ! @ # ...
    assert.equal(convert('2024', 'unicode', 'preeti'), '@)@$');
    assert.equal(convert('2024', 'unicode', 'preeti', { keepEnglish: true }), '@)@$');
  });

  test('ASCII quotes become the curly quotes the font has, not ु and ू', () => {
    assert.equal(convert("'", 'unicode', 'preeti'), 'Ú');
    assert.equal(convert('"', 'unicode', 'preeti'), 'Æ');
  });

  test('Preeti -> Kruti Dev goes through Unicode and keeps every letter', () => {
    for (const { p, u, why } of CASES) {
      const kruti = convert(p, 'preeti', 'kruti-dev');
      assert.equal(convert(kruti, 'kruti-dev', 'unicode', { keepEnglish: false }), u, why);
    }
  });

  test('a character Preeti has no key for is reported', () => {
    assert.deepEqual(unmappedChars('ळ', 'preeti'), ['ळ']);
    assert.deepEqual(unmappedChars('नेपाल', 'preeti'), []);
  });

  test('registry: verified, Beta, previewed in the Preeti file', () => {
    assert.equal(isPairAccurate('preeti', 'unicode'), true);
    assert.equal(FONTS.preeti.beta, true);
    assert.equal(previewFontFor('preeti').file, 'preeti.woff');
    for (const path of ['/preeti-to-unicode', '/unicode-to-preeti', '/preeti-to-kruti-dev', '/kruti-dev-to-preeti']) {
      const page = getPage(path);
      assert.ok(isLive(page), path);
      assert.equal(page.beta, true, path);
    }
  });
});

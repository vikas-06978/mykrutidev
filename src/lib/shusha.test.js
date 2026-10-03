// Shusha and Shivaji. The map was read off the font files key by key, and the
// fixture's words were drawn in the Shusha font itself and read back.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars } from './fontMaps.js';
import { getPage, isLive } from './routes.js';
import { previewFontFor } from './legacyFonts.js';
import fixture from './__fixtures__/shusha.json' with { type: 'json' };

describe('Shusha', () => {
  test('Unicode -> Shusha gives the keys that were checked in the font', () => {
    for (const { s, u } of fixture.words) assert.equal(convert(u, 'unicode', 'shusha', { keepEnglish: false }), s, u);
  });

  test('Shusha -> Unicode reads them back', () => {
    for (const { s, u } of fixture.words) assert.equal(convert(s, 'shusha', 'unicode', { keepEnglish: false }), u, s);
  });

  test('the bar completes a half letter, and alone it is the aa-matra', () => {
    assert.equal(convert('ba', 'shusha', 'unicode'), 'ब');
    assert.equal(convert('baa', 'shusha', 'unicode'), 'बा');
    assert.equal(convert('b', 'shusha', 'unicode', { keepEnglish: false }), 'ब्');
  });

  test('the comma key is the nukta, and the comma itself sits on ¸', () => {
    assert.equal(convert('k,', 'shusha', 'unicode', { keepEnglish: false }), 'क़');
    assert.equal(convert('राम, श्याम', 'unicode', 'shusha'), 'rama¸ Syaama');
  });

  test('rakar takes the caret form under ट ठ ड ढ and the stroke elsewhere', () => {
    assert.equal(convert('ट्र', 'unicode', 'shusha'), 'T/');
    assert.equal(convert('प्र', 'unicode', 'shusha'), 'p`');
  });

  test('numbers are kept: Shusha draws Latin digits', () => {
    assert.equal(convert('dInaaMk 15/08/1947', 'shusha', 'unicode'), 'दीनांक 15/08/1947');
  });

  test('a character Shusha has no key for is reported', () => {
    assert.deepEqual(unmappedChars('१', 'shusha'), ['१']);
  });
});

describe('Shivaji', () => {
  test('the same words, with a full stop where Shusha has the danda', () => {
    for (const { s, u } of fixture.words) {
      if (/[।.]/.test(u)) continue;
      assert.equal(convert(s, 'shivaji', 'unicode', { keepEnglish: false }), u, s);
    }
    assert.equal(convert('maraazI.', 'shivaji', 'unicode', { keepEnglish: false }), 'मरााठी.');
    assert.equal(convert('marazI.', 'shivaji', 'unicode', { keepEnglish: false }), 'मराठी.');
    assert.equal(convert('marazI.', 'shusha', 'unicode', { keepEnglish: false }), 'मराठी।');
  });

  test('ळ and the reph, Marathi style', () => {
    assert.equal(convert('kLvaavao', 'shivaji', 'unicode'), 'कळवावे');
    assert.equal(convert('महाराष्ट्र शासन.', 'unicode', 'shivaji'), 'maharaYT/ Saasana.');
  });

  test('the danda has no Shivaji key and is reported', () => {
    assert.deepEqual(unmappedChars('।', 'shivaji'), ['।']);
  });
});

describe('registry and pages', () => {
  test('both fonts verified, Beta, previewed in their own files', () => {
    for (const key of ['shusha', 'shivaji']) {
      assert.equal(FONTS[key].accurate, true, key);
      assert.equal(FONTS[key].beta, true, key);
    }
    assert.equal(previewFontFor('shusha').file, 'shusha.woff');
    assert.equal(previewFontFor('shivaji').file, 'shivaji01.woff');
    for (const path of ['/shusha-to-unicode', '/unicode-to-shusha', '/shivaji-to-unicode', '/unicode-to-shivaji']) {
      assert.ok(isLive(getPage(path)), path);
      assert.equal(getPage(path).beta, true, path);
    }
  });
});

describe('Shusha02 and Shivaji02', () => {
  const toU = (s, f) => convert(s, f, 'unicode', { keepEnglish: false });

  test('the four keys that differ from Shusha, as drawn in Shusha02.ttf', () => {
    assert.equal(toU('pa~a', 'shusha02'), 'पात्र');
    assert.equal(toU('(dya', 'shusha02'), 'हृदय');
    assert.equal(toU(')a', 'shusha02'), 'थ');
    assert.equal(toU('Ùa', 'shusha02'), 'न्न');
    assert.equal(toU('pa~a', 'shusha'), 'पात्रा');
  });

  test('every other word reads as in Shusha', () => {
    for (const { s, u } of fixture.words) {
      if (/[~()Ùœ]/.test(s)) continue;
      assert.equal(toU(s, 'shusha02'), u, s);
    }
  });

  test('writing Shusha02 uses its own keys', () => {
    assert.equal(convert('पात्र', 'unicode', 'shusha02'), 'pa~a');
    assert.equal(convert('हृदय', 'unicode', 'shusha02'), '(dya');
  });

  test('Shivaji02 has the full stop on `.`', () => {
    assert.equal(toU('marazI.', 'shivaji02'), 'मराठी.');
    assert.equal(toU('pa~a', 'shivaji02'), 'पात्र');
    assert.equal(previewFontFor('shusha02').file, 'shusha02.woff');
    assert.equal(previewFontFor('shivaji02').file, 'shivaji02.woff');
  });
});

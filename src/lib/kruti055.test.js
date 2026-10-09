// Kruti Dev 055: its number keys and its own Alt codes, each read off
// public/fonts/KRDEV055.woff beside KRDEV010.woff (docs/FONTS.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convert, englishReport, kruti055Keys } from './fontMaps.js';

const from055 = (s, to = 'unicode', opts = {}) => convert(s, 'kruti-dev', to, { ...opts, cut055: true });

describe('Kruti Dev 055 text', () => {
  test('the number keys are Hindi digits', () => {
    assert.equal(from055('lu~ 1947 vkSj 2024'), 'सन् १९४७ और २०२४');
    // Without the tick they stay English digits, as 010 draws them.
    assert.equal(convert('lu~ 1947', 'kruti-dev', 'unicode'), 'सन् 1947');
  });

  test('its Alt codes read as the 010 keys that draw the same glyph', () => {
    assert.equal(kruti055Keys('ƒ„‡‰‹…\u0090'), 'ÄãàäÜÉÒ');
    assert.equal(from055('ƒj'), 'घर');
    assert.equal(from055('Hk‰'), 'भक्त');
    assert.equal(from055('cz„k'), 'ब्रह्मा');
    // Not 010's Alt-code digits.
    assert.equal(convert('ƒj', 'kruti-dev', 'unicode'), '१र');
  });

  test('codes that draw nothing, a star or a stroke are never read as digits', () => {
    assert.equal(kruti055Keys('†ˆ'), '');
    assert.equal(from055('Š'), '∗');
    // å is ० in 010; in 055 it is a stroke, not a letter, and is left unread.
    assert.ok(!from055('å').includes('०'));
  });

  test('web and email addresses keep their digits', () => {
    assert.equal(from055('www.a1.in x@y2.com 12'), 'www.a1.in x@y2.com १२');
  });

  test('English words are still kept', () => {
    assert.equal(from055('jke us Office esa 5 Qkby'), 'राम ने Office में ५ फाइल');
  });

  test('to another font on the Kruti keyboard, it goes through Unicode', () => {
    // A straight copy would hand DevLys 010 a 055 key (ƒ) it reads as १.
    assert.equal(from055('ƒj', 'devlys'), '?kj');
    assert.equal(from055('ƒj 12', 'abbasi-chanakya'), convert('घर १२', 'unicode', 'abbasi-chanakya'));
  });

  test('the English word list reads the same text', () => {
    const r = englishReport('Office ƒj', 'kruti-dev', { cut055: true });
    assert.deepEqual(r.map((x) => x.token), ['Office']);
  });
});

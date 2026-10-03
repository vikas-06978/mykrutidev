// Kruti Dev 010's upper range: keys read off public/fonts/KRDEV010.woff, each
// drawn before the bar `k` to tell a half letter from a full one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert } from './fontMaps.js';

const toU = (s, font = 'kruti-dev') => convert(s, font, 'unicode', { keepEnglish: false });

describe('Kruti Dev upper-range keys', () => {
  test('ready-made conjuncts', () => {
    const pairs = {
      'Ì': 'द्द', 'Í': 'ट्ट', 'Î': 'ट्ठ', 'Ï': 'ड्ड', 'Ô': 'ड्ढ', 'ð': 'ठ्ठ', 'Ý': 'फ्र',
      'à': 'ह्न', 'á': 'ह्य', 'â': 'हृ', 'ã': 'ह्म', 'ä': 'क्त', 'æ': 'द्र', 'é': 'न्न',
      'ó': 'स्त्र', 'ô': 'क्क', 'ù': 'द्म',
    };
    for (const [k, u] of Object.entries(pairs)) assert.equal(toU(k), u, k);
  });

  test('half letters are completed by the bar', () => {
    assert.equal(toU('Ùk'), 'त्त');
    assert.equal(toU('Ù'), 'त्त्');
    assert.equal(toU('«k'), 'त्र');
    assert.equal(toU('Ük'), 'श');
    assert.equal(toU('Ök'), 'झ');
    assert.equal(toU('Ëk'), 'ध');
  });

  test('full letters', () => {
    assert.equal(toU('Ãk'), 'ईा'.normalize()); // ई, then the bar as ा, as the font draws it
    assert.equal(toU('Ò'), 'भ');
    assert.equal(toU('Ä'), 'घ');
    assert.equal(toU('³'), 'ङ');
  });

  test('ya-phala joins the letter before it', () => {
    assert.equal(toU('dÓk'), 'क्या');
    assert.equal(toU('nî'), 'द्य');
  });

  test('signs typed before their cluster land after it, with their reph', () => {
    assert.equal(toU('Æd'), 'र्कि');
    assert.equal(toU('Çd'), 'किं');
    assert.equal(toU('Éd'), 'र्किं');
    assert.equal(toU('dÊ'), 'र्की');
    assert.equal(toU('dÈ'), 'कीं');
    assert.equal(toU('d±'), 'र्कं');
  });

  test('Hindi digits', () => {
    assert.equal(toU('å ƒ „ † ‡ ˆ ‰ Š ‹'), '० १ २ ४ ५ ६ ७ ८ ९');
  });

  test('DevLys 010 reads them the same way', () => {
    for (const s of ['Ìk', 'dÓk', 'Æd', 'ƒ„']) assert.equal(toU(s, 'devlys'), toU(s), s);
  });

  test('writing Kruti Dev keeps the taught keys: the upper range is for reading', () => {
    assert.equal(convert('द्द', 'unicode', 'kruti-dev'), 'n~n');
    assert.ok(!('Ì' in FONTS['kruti-dev'].map));
    assert.ok('Ì' in FONTS['kruti-dev'].readMap);
  });

  test('curly quotes and the ellipsis stay punctuation', () => {
    for (const c of ['‘', '’', '“', '”', '–', '—', '…']) assert.equal(toU(`d${c}`), `क${c}`, c);
  });
});

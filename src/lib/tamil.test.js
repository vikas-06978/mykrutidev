// Tamil: Bamini. The keys were read off Bamini PB Regular.ttf, and every
// sentence below was converted, drawn in that font and read back by eye.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars } from './fontMaps.js';
import { previewFontFor } from './legacyFonts.js';
import { WORD_FONTS } from './wordFonts.js';
import { getPage, isLive, reversePage, docPairFor } from './routes.js';

const toU = (s) => convert(s, 'bamini', 'unicode');
const toB = (u) => convert(u, 'unicode', 'bamini');

const CHECKED = [
  'தமிழ்நாடு அரசு, கல்வித் துறை. கொழும்பு, கோவில், வெள்ளை, கௌரவம்',
  'ஸ்ரீலங்கா, சென்னை, பூமி, முதலமைச்சர், தேர்தல் ஆணையம், ஊராட்சி, ஈரோடு',
  'ஐந்து, ஒன்று, ஓட்டு, எட்டு, ஏழு, ஜனவரி, ஷாப், ஹோட்டல், டீ, பைசா',
];

describe('Bamini', () => {
  test('every checked sentence goes there and back', () => {
    for (const u of CHECKED) assert.equal(toU(toB(u)), u.normalize('NFC'), u);
  });

  test('the keys as the font draws them', () => {
    assert.equal(toU('jkpo;ehL'), 'தமிழ்நாடு');
    assert.equal(toU('=yq;fh'), 'ஸ்ரீலங்கா');
    assert.equal(toU('Kjyikr;rH'), 'முதலமைச்சர்');
  });

  test('ெ ே ை are typed before their consonant', () => {
    assert.equal(toU('nrd;id'), 'சென்னை');
    assert.equal(toB('சென்னை'), 'nrd;id');
    assert.equal(toU('Nj'), 'தே');
    assert.equal(toU('ij'), 'தை');
  });

  test('ொ ோ ௌ are the sign before and ா or ௗ after, joined into one', () => {
    assert.equal(toU('nfhOk;G'), 'கொழும்பு');
    assert.equal(toU('Nfhtpy;'), 'கோவில்');
    assert.equal(toU('nf_utk;'), 'கௌரவம்');
    assert.equal(toB('கொ'), 'nfh');
    // ெ + ள is a real spelling (வெள்ளை), not ௌ.
    assert.equal(toU('nts;is'), 'வெள்ளை');
  });

  test('joined u and uu have keys of their own, and + is the ூ of the rest', () => {
    assert.equal(toU('F'), 'கு');
    assert.equal(toU('$'), 'கூ');
    assert.equal(toU('g+kp'), 'பூமி');
  });

  test('digits are kept, and punctuation comes from its own keys', () => {
    assert.equal(toU('2024 Mk; Mz;L'), '2024 ஆம் ஆண்டு');
    assert.equal(toB('அரசு, கல்வி'), 'muR> fy;tp');
  });

  test('Hindi left in the text is not touched', () => {
    assert.equal(toB('भारत தமிழ்'), 'भारत jkpo;');
  });

  test('a character Bamini has no key for is reported', () => {
    assert.deepEqual(unmappedChars('௧', 'bamini'), ['௧']);
    assert.deepEqual(unmappedChars('தமிழ்நாடு அரசு, கல்வித் துறை. (1/2) - சரி? ஆம்!', 'bamini'), []);
  });

  test('verified, Beta, Tamil, with its preview font and Word names', () => {
    assert.equal(FONTS.bamini.accurate, true);
    assert.equal(FONTS.bamini.beta, true);
    assert.equal(FONTS.bamini.lang, 'ta');
    assert.equal(previewFontFor('bamini').file, 'bamini.woff');
    for (const n of ['Bamini', 'Ë ghkpdp jkpo;']) assert.ok(WORD_FONTS.bamini.match.test(n), n);
  });

  test('both pages are live, each other\'s reverse, with Word upload', () => {
    const to = getPage('/tamil-font-converter');
    const from = getPage('/unicode-to-bamini');
    assert.ok(isLive(to) && isLive(from));
    assert.equal(reversePage(to), from);
    assert.deepEqual(docPairFor(to), { from: 'bamini', to: 'unicode' });
  });
});

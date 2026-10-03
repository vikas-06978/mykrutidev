// Bengali: SutonnyMJ (Bijoy). The keys were read off SutonnyMJ Regular.ttf,
// and every sentence below was converted, drawn in that font and read back by
// eye.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars } from './fontMaps.js';
import { previewFontFor } from './legacyFonts.js';
import { WORD_FONTS } from './wordFonts.js';
import { getPage, isLive, reversePage, docPairFor } from './routes.js';
import { splitsSyllable } from './docConvert.js';

const toU = (s) => convert(s, 'sutonny', 'unicode');
const toS = (u) => convert(u, 'unicode', 'sutonny');

const CHECKED = [
  'আমার সোনার বাংলা। গণপ্রজাতন্ত্রী বাংলাদেশ সরকার, শিক্ষা মন্ত্রণালয়',
  'ব্যবস্থাপনা স্থানীয় অন্তর্ভুক্ত সম্পর্ক স্কুল স্ত্রী মন্ত্রী সম্মান কষ্ট পুষ্প স্বাস্থ্য',
  'কর্মকর্তা পূর্ব মূল্য কৌশল বোর্ড রাষ্ট্রপতি বিদ্যালয় উৎসব কৃষি, ২৫/০৮/২০২৪',
];

describe('SutonnyMJ', () => {
  test('every checked sentence goes there and back', () => {
    for (const u of CHECKED) assert.equal(toU(toS(u)), u.normalize('NFC'), u);
  });

  test('the keys as the font draws them', () => {
    assert.equal(toU('evsjv‡`k'), 'বাংলাদেশ');
    assert.equal(toU('Avgvi †mvbvi evsjv'), 'আমার সোনার বাংলা');
    assert.equal(toU('cÖavbgš¿x'), 'প্রধানমন্ত্রী');
    assert.equal(toU('MÖvg'), 'গ্রাম');
  });

  test('ি ে ৈ are typed before their consonant or conjunct', () => {
    assert.equal(toU('wk¶v'), 'শিক্ষা');
    assert.equal(toS('শিক্ষা'), 'wk¶v');
    assert.equal(toU('†cÖm'), 'প্রেস');
    assert.equal(toU('ˆZj'), 'তৈল');
  });

  test('ো ৌ are ে before and া or ৗ after, joined into one', () => {
    assert.equal(toU('†mvbvi'), 'সোনার');
    assert.equal(toU('†KŠkj'), 'কৌশল');
    assert.equal(toS('কোন'), '†Kvb');
  });

  test('the reph is typed after its syllable', () => {
    assert.equal(toU('Kg©KZv©'), 'কর্মকর্তা');
    assert.equal(toS('পূর্ব'), 'c~e©');
  });

  test('a half letter over a lower part makes one conjunct', () => {
    assert.equal(toU('¯’vbxq'), 'স্থানীয়');
    assert.equal(toU('gš¿Yvjq'), 'মন্ত্রণালয়');
    assert.equal(toU('m¤§vb'), 'সম্মান');
    assert.equal(toS('স্কুল'), '¯‹yj');
  });

  test('আ is অ and া, and the number keys draw Bengali digits', () => {
    assert.equal(toU('Av'), 'আ');
    assert.equal(toS('আ'), 'Av');
    assert.equal(toU('25/08/2024'), '২৫/০৮/২০২৪');
  });

  test('Hindi left in the text is not touched', () => {
    assert.equal(toS('भारत বাংলা'), 'भारत evsjv');
  });

  test('a character SutonnyMJ has no key for is reported', () => {
    assert.deepEqual(unmappedChars('ঌ', 'sutonny'), ['ঌ']);
    assert.deepEqual(unmappedChars(CHECKED.join(' '), 'sutonny'), []);
  });

  test('a Word run ending in a sign typed before its letter splits a syllable', () => {
    assert.equal(splitsSyllable('†', 'mvbvi', 'sutonny'), true);
    assert.equal(splitsSyllable('w', 'k¶v', 'sutonny'), true);
    assert.equal(splitsSyllable('evsjv', ' ', 'sutonny'), false);
  });

  test('verified, Beta, Bengali, with its preview font and Word names', () => {
    assert.equal(FONTS.sutonny.accurate, true);
    assert.equal(FONTS.sutonny.beta, true);
    assert.equal(FONTS.sutonny.lang, 'bn');
    assert.equal(previewFontFor('sutonny').file, 'sutonnymj.woff');
    for (const n of ['SutonnyMJ', 'SutonnyOMJ', 'Sutonny MJ']) assert.ok(WORD_FONTS.sutonny.match.test(n), n);
  });

  test("both pages are live, each other's reverse, with Word upload", () => {
    const to = getPage('/bengali-font-converter');
    const from = getPage('/unicode-to-sutonnymj');
    assert.ok(isLive(to) && isLive(from));
    assert.equal(reversePage(to), from);
    assert.deepEqual(docPairFor(to), { from: 'sutonny', to: 'unicode' });
  });
});

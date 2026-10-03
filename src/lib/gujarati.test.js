// Gujarati: LMG Arun and Terafont. The keys were read off LMG-Arun.ttf, and
// every sentence below was converted, drawn in LMG Arun, LMG Laxmi, Terafont
// Varun, Kinnari, Indra and Ganesh, and read back by eye.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars } from './fontMaps.js';
import { previewFontFor } from './legacyFonts.js';

const toU = (s, f = 'lmg-arun') => convert(s, f, 'unicode');
const toL = (u, f = 'lmg-arun') => convert(u, 'unicode', f);

const CHECKED = [
  'ગુજરાત સરકાર, શિક્ષણ વિભાગ, ગાંધીનગર. તારીખ ૨૫/૦૮/૨૦૨૪',
  'પ્રધાનમંત્રી શ્રી, કર્મચારીઓ, કીર્તિ, નિર્ણય, હૃદય, વિદ્યાર્થી, ઉદ્યોગ',
  'ક્ષેત્ર, જ્ઞાન, આત્મા, સ્ત્રી, મહત્ત્વ, ઊંચું, ઈશ્વર, ઇચ્છા, કૉલેજ, ખુશી',
  'આત્મા, કર્મચારીઓ, એક, ઐતિહાસિક, ઔષધ, ઑફિસ, આંગણવાડી, અમદાવાદ, ઉપર, ઋષિ',
];

describe('LMG Arun and Terafont', () => {
  test('every checked sentence goes there and back', () => {
    for (const f of ['lmg-arun', 'terafont']) {
      for (const u of CHECKED) assert.equal(toU(toL(u, f), f), u, `${f}: ${u}`);
    }
  });

  test('the keys as the font draws them', () => {
    assert.equal(toU('U]HZFT'), 'ગુજરાત');
    assert.equal(toU('EFZT'), 'ભારત');
    assert.equal(toU('DCFZFQ8='), 'મહારાષ્ટ્ર');
    assert.equal(toU('7FG'), 'જ્ઞાન');
  });

  test('ि is typed before its letter and the reph after its syllable', () => {
    assert.equal(toU('lCgN]:TFG'), 'હિન્દુસ્તાન');
    assert.equal(toU('SD"RFZL'), 'કર્મચારી');
    assert.equal(toU('SLlT"'), 'કીર્તિ');
    assert.equal(toL('કીર્તિ'), 'SLlT"');
  });

  test('a half letter and the bar are the full letter, a full letter and the bar take ા', () => {
    assert.equal(toU('%'), 'પ્');
    assert.equal(toU('%F'), 'પ');
    assert.equal(toU('5F'), 'પા');
    assert.equal(toU('1F'), 'ક્ષ');
    assert.equal(toU('ÙF'), 'ક્ષા');
  });

  test('rakar is drawn under its letter', () => {
    assert.equal(toU('5='), 'પ્ર');
    assert.equal(toL('પ્રમાણપત્ર'), '5=DF65+');
    assert.equal(toL('ગ્રામ'), 'U=FD');
  });

  test('આ એ ઐ ઓ ઔ are અ and the sign', () => {
    assert.equal(toU('VF'), 'આ');
    assert.equal(toU('V[S'), 'એક');
    assert.equal(toU('SD"RFZLVM'), 'કર્મચારીઓ');
    assert.equal(toL('ઔષધ'), 'VÁØW');
  });

  test('ર and પ are ૨ and ૫ among digits, and letters elsewhere', () => {
    assert.equal(toU('Z_Z$'), '૨૦૨૪');
    assert.equal(toU('Z5q_(qZ_Z$'), '૨૫/૦૮/૨૦૨૪');
    assert.equal(toU('5Z'), 'પર');
    assert.equal(toU('SFD 5Z'), 'કામ પર');
    assert.equal(toL('૨૦૨૫'), 'Z_Z5');
  });

  test('the number keys are letters: nothing is kept as English', () => {
    assert.equal(FONTS['lmg-arun'].asciiIsScript, true);
    assert.equal(toU('0'), 'ડ');
  });

  test('Terafont leaves out the three keys it draws differently', () => {
    assert.equal(toU('À', 'lmg-arun'), 'ત્ય');
    assert.equal(toU('À', 'terafont'), 'À');
    assert.equal(toL('ઉત્તર', 'terafont'), toL('ઉત્તર', 'lmg-arun'));
  });

  test('a character the font has no key for is reported', () => {
    assert.deepEqual(unmappedChars('ૠ', 'lmg-arun'), ['ૠ']);
    assert.deepEqual(unmappedChars('ગુજરાત સરકાર', 'lmg-arun'), []);
  });

  test('Hindi left in the text is not turned into Gujarati', () => {
    assert.equal(toL('भारत ગુજરાત'), 'भारत U]HZFT');
  });

  test('both are verified, Beta, Gujarati, with their own preview fonts', () => {
    for (const f of ['lmg-arun', 'terafont']) {
      assert.equal(FONTS[f].accurate, true);
      assert.equal(FONTS[f].beta, true);
      assert.equal(FONTS[f].lang, 'gu');
    }
    assert.equal(previewFontFor('lmg-arun').file, 'lmg-arun.woff');
    assert.equal(previewFontFor('terafont').file, 'terafont-varun.woff');
  });
});

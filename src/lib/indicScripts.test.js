import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { toScript, SCRIPTS, TABLES } from './indicScripts.js';

const W = 'भारत सरकार, प्रधानमंत्री कार्यालय। श्री कृष्ण १२३';

describe('Hindi to other Indian scripts', () => {
  test('the six scripts', () => {
    assert.deepEqual(SCRIPTS.sort(), ['bengali', 'gujarati', 'kannada', 'malayalam', 'oriya', 'telugu']);
  });

  test('a sentence in each', () => {
    const want = {
      bengali: 'ভারত সরকার, প্রধানমংত্রী কার্যালয। শ্রী কৃষ্ণ ১২৩',
      gujarati: 'ભારત સરકાર, પ્રધાનમંત્રી કાર્યાલય। શ્રી કૃષ્ણ ૧૨૩',
      oriya: 'ଭାରତ ସରକାର, ପ୍ରଧାନମଂତ୍ରୀ କାର୍ଯାଲଯ। ଶ୍ରୀ କୃଷ୍ଣ ୧୨୩',
      telugu: 'భారత సరకార, ప్రధానమంత్రీ కార్యాలయ। శ్రీ కృష్ణ ౧౨౩',
      kannada: 'ಭಾರತ ಸರಕಾರ, ಪ್ರಧಾನಮಂತ್ರೀ ಕಾರ್ಯಾಲಯ। ಶ್ರೀ ಕೃಷ್ಣ ೧೨೩',
      malayalam: 'ഭാരത സരകാര, പ്രധാനമംത്രീ കാര്യാലയ। ശ്രീ കൃഷ്ണ ൧൨൩',
    };
    for (const s of SCRIPTS) assert.deepEqual(toScript(W, s), { text: want[s], missed: [] }, s);
  });

  test('every mapped letter lands in its own script block', () => {
    const BLOCK = { bengali: 0x980, gujarati: 0xa80, oriya: 0xb00, telugu: 0xc00, kannada: 0xc80, malayalam: 0xd00 };
    for (const s of SCRIPTS) {
      for (const [from, to] of Object.entries(TABLES[s])) {
        if (to === '') continue;
        const cp = to.codePointAt(0);
        assert.ok(cp >= BLOCK[s] && cp < BLOCK[s] + 0x80, `${s}: ${from} -> U+${cp.toString(16)}`);
      }
    }
  });

  test('ए and ओ are the LONG vowels in Telugu, Kannada and Malayalam', () => {
    assert.equal(toScript('एक ओर', 'telugu').text, 'ఏక ఓర');
    assert.equal(toScript('एक ओर', 'kannada').text, 'ಏಕ ಓರ');
    assert.equal(toScript('एक ओर', 'malayalam').text, 'ഏക ഓര');
  });

  test('व is written with ba in Bengali and Odia', () => {
    assert.equal(toScript('विद्या', 'bengali').text, 'বিদ্যা');
    assert.equal(toScript('विद्या', 'oriya').text, 'ବିଦ୍ଯା');
  });

  test('nukta letters keep their dot where the script has one, and drop it in Telugu and Malayalam', () => {
    assert.equal(toScript('ज़मीन', 'gujarati').text, 'જ઼મીન');
    assert.equal(toScript('ज़', 'gujarati').text, 'જ઼', 'precomposed ज़ too');
    assert.equal(toScript('ज़मीन', 'telugu').text, 'జమీన');
    assert.equal(toScript('ज़मीन', 'malayalam').text, 'ജമീന');
  });

  test('a letter the script lacks is left as it was, and reported', () => {
    assert.deepEqual(toScript('डॉक्टर', 'bengali'), { text: 'ডॉক্টর', missed: ['ॉ'] });
  });

  test('English, ASCII digits and the danda pass through', () => {
    assert.deepEqual(toScript('PAN 123। ॥', 'gujarati'), { text: 'PAN 123। ॥', missed: [] });
  });
});

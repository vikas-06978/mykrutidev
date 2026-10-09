// Chanakya, the newspaper font (vendor/fonts/Chanakya/Chanakya.ttf), and
// Patrika on the same keys: each key as it was read off the font file.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars, describeMismatch } from './fontMaps.js';
import { getPage, isLive } from './routes.js';
import { previewFontFor } from './legacyFonts.js';
import { WORD_FONTS } from './wordFonts.js';

const read = (s, key = 'chanakya-news') => convert(s, key, 'unicode');
const write = (s, key = 'chanakya-news') => convert(s, 'unicode', key);

describe('Chanakya keys, as the font draws them', () => {
  test('whole letters in the upper range', () => {
    assert.equal(read('· ¹ » ¾ ¿ À Á Û Å Æ Ç É Ì Í Î Ï Ù Â È Õ Ö × Ø Ú Ü ß à á â ã Ý'),
      'क ख ग ङ च छ ज झ ट ठ ड ढ त थ द ध न प फ ब भ म य र ल व श ष स ह ळ');
  });

  test('a half letter and the bar are the whole letter (ƒ + æ draws घ)', () => {
    assert.equal(read('ƒæ †æ ‡æ ˜æ ™æ Ÿæ ÿæ “æ'), 'घ ञ ण त्र ज्ञ श्र क्ष च्च');
    assert.equal(read('vØæ'), 'क्या');
    assert.equal(read('ƒè ƒô'), 'घी घो');
  });

  test('ि before its letter, the reph after its syllable, िं and the nukta', () => {
    assert.equal(read('çã¢Îè'), 'हिंदी');
    assert.equal(read('·¤æØæîÜØ'), 'कार्यालय');
    assert.equal(read('·×ü¿æÚè'), 'कर्मचारी');
    assert.equal(read('ìÂ'), 'पिं');
    assert.equal(read('ÂÉ¸æ§:'), 'पढ़ाई');
    assert.equal(read('Ï×æðZ'), 'धर्मों');
  });

  test('independent vowels are अ, इ and ए with their signs', () => {
    assert.equal(read('¥ ¥æ ¥ô ¥õ ¥æò § §: © ª « ° °ð'), 'अ आ ओ औ ऑ इ ई उ ऊ ऋ ए ऐ');
  });

  test('`¤` is the space after क and draws nothing', () => {
    assert.equal(read('·¤æ'), read('·æ'));
    assert.equal(read('·¤æ'), 'का');
  });

  test('keys not read with certainty are left as they are', () => {
    for (const k of ['h', 'J', '²', 'œ']) assert.equal(read(k), k, k);
  });
});

describe('Unicode to Chanakya', () => {
  const words = [
    'प्रधानमंत्री', 'कार्यालय', 'विद्यार्थी', 'स्वतंत्रता', 'उत्तर प्रदेश', 'राष्ट्रपति', 'धन्यवाद', 'ज़रूरी',
    'आँख', 'ऊँट', 'ऋषि', 'ऐसा', 'औरत', 'क्षेत्र', 'ज्ञान', 'संख्या', 'शुद्ध', 'बुद्धि', 'पद्म', 'हृदय',
    'ब्राह्मण', 'चिह्न', 'सत्य', 'महत्त्व', 'कॉलेज', 'स्थिति', 'क्लिक', 'प्रिय', 'शक्ति', 'कीर्ति',
    'मूर्ति', 'गर्मी', 'धर्मों', 'सिंह', 'चिंता', 'पंक्ति', 'ज़िला', 'दृष्टि', 'स्त्री', 'न्यायालय', 'उन्नति',
    'त्रिपाठी', 'श्रीमती', 'रुपया', 'रूप', 'डॉक्टर', 'पूर्व', 'दर्शन', 'घर', 'घी', 'ईश्वर', 'आओ',
    'पढ़ाई', 'अड्डा', 'बच्चा', 'अंग्रेज़ी', 'कौन', 'कुछ', 'फूल', 'फ़ाइल', 'अर्ध-सरकारी',
  ];

  test('every word reads back exactly', () => {
    for (const w of words) assert.equal(read(write(w)), w, `${w} -> ${write(w)}`);
  });

  test('written as the font draws it', () => {
    // प्र is प and the stroke, never the half प and र (which draws पर).
    assert.equal(write('प्रकाश'), 'ÂA·¤æà');
    // क takes its space.
    assert.equal(write('कुछ'), '·¤éÀ');
    // ि goes before the whole cluster, the reph after the syllable.
    assert.equal(write('स्थिति'), 'çSÍçÌ');
    assert.equal(write('कर्म'), '·¤×î');
    assert.equal(write('ज्ञान'), '™ææÙ');
  });

  test('Hindi digits have no key: they are flagged, not changed', () => {
    assert.equal(write('२०२४'), '२०२४');
    assert.deepEqual(unmappedChars('२०२४', 'chanakya-news').sort(), ['०', '२', '४']);
  });
});

describe('Patrika: Chanakya\'s keys, with digits on v-~', () => {
  test('the digit keys', () => {
    assert.equal(read('vwxyz{|}~®', 'patrika'), '1234567890');
    // In Chanakya the same keys are half letters.
    assert.equal(read('v', 'chanakya-news'), 'क्');
  });

  test('everything else as in Chanakya', () => {
    assert.equal(read('ÚæÁSÍæÙ ÂçÌý·¤æ', 'patrika'), 'राजस्थान पत्रिका');
    for (const w of ['कार्यालय', 'क्या', 'ब्याज', 'भ्रम', 'स्त्री', 'उत्तर प्रदेश', 'म्यूज़िक']) {
      const k = write(w, 'patrika');
      assert.ok(![...k].some((c) => 'vwxyz{|}~'.includes(c)), `${w} -> ${k}`);
      assert.equal(read(k, 'patrika'), w);
    }
  });
});

describe('pages, preview and Word', () => {
  test('the four pages are live and Beta', () => {
    for (const p of ['/chanakya-to-unicode', '/unicode-to-chanakya', '/patrika-to-unicode', '/unicode-to-patrika']) {
      assert.ok(isLive(getPage(p)), p);
      assert.equal(getPage(p).beta, true, p);
    }
  });

  test('previewed in the files the maps were read from', () => {
    assert.equal(previewFontFor('chanakya-news').file, 'chanakya.woff');
    assert.equal(previewFontFor('patrika').file, 'patrika.woff');
  });

  test('a Word run in "Chanakya" is this font, not Walkman-Chanakya 905', () => {
    assert.ok(WORD_FONTS['chanakya-news'].match.test('Chanakya'));
    assert.ok(!WORD_FONTS['chanakya-news'].match.test('Walkman-Chanakya905'));
    assert.ok(WORD_FONTS.patrika.match.test('Patrika'));
    assert.equal(FONTS['chanakya-news'].asciiIsScript, true);
  });
});

describe('the wrong-page hint', () => {
  test('Kruti Dev or Walkman-Chanakya text on a Chanakya page is flagged', () => {
    assert.equal(describeMismatch('fgUnh esa i<+kbZ', 'chanakya-news'), 'expected-legacy-got-english');
    assert.equal(describeMismatch('Hkkjr ljdkj', 'patrika'), 'expected-legacy-got-english');
  });

  test('real Chanakya and Patrika text is not, even with conjuncts on ASCII keys', () => {
    assert.equal(describeMismatch(FONTS['chanakya-news'].sample, 'chanakya-news'), null);
    assert.equal(describeMismatch('çã¢Îè d Q', 'chanakya-news'), null);
    assert.equal(describeMismatch('ÚæÁSÍæÙ ÂçÌý·¤æ 2024', 'patrika'), null);
  });
});

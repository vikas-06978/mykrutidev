import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HINDI_0_99,
  hindiWords,
  englishWords,
  amountInHindi,
  amountInEnglish,
  parseAmount,
  toHindiDigits,
  toEnglishDigits,
  parseDate,
  hindiDate,
  hindiYear,
  countText,
  MAX_WHOLE,
} from './hindiTools.js';

describe('Hindi number words', () => {
  test('a hundred distinct words for 0-99', () => {
    assert.equal(HINDI_0_99.length, 100);
    assert.equal(new Set(HINDI_0_99).size, 100);
  });

  test('the irregular ones', () => {
    const want = {
      0: 'शून्य', 5: 'पाँच', 6: 'छह', 9: 'नौ', 11: 'ग्यारह', 15: 'पंद्रह', 18: 'अठारह',
      19: 'उन्नीस', 21: 'इक्कीस', 25: 'पच्चीस', 29: 'उनतीस', 33: 'तैंतीस', 38: 'अड़तीस',
      39: 'उनतालीस', 42: 'बयालीस', 44: 'चौवालीस', 49: 'उनचास', 51: 'इक्यावन', 53: 'तिरपन',
      59: 'उनसठ', 64: 'चौंसठ', 67: 'सड़सठ', 69: 'उनहत्तर', 72: 'बहत्तर', 79: 'उनासी',
      82: 'बयासी', 89: 'नवासी', 90: 'नब्बे', 95: 'पचानवे', 99: 'निन्यानवे',
    };
    for (const [n, w] of Object.entries(want)) assert.equal(HINDI_0_99[n], w, n);
  });

  test('every x9 from 19 to 79 starts with उन', () => {
    for (const n of [19, 29, 39, 49, 59, 69, 79]) assert.match(HINDI_0_99[n], /^उन/, String(n));
  });

  test('place values in the Indian system', () => {
    assert.equal(hindiWords(100n), 'एक सौ');
    assert.equal(hindiWords(1000n), 'एक हज़ार');
    assert.equal(hindiWords(100000n), 'एक लाख');
    assert.equal(hindiWords(10000000n), 'एक करोड़');
    assert.equal(hindiWords(1000000000n), 'एक अरब');
    assert.equal(hindiWords(100000000000n), 'एक खरब');
    assert.equal(hindiWords(987654321n), 'अट्ठानवे करोड़ छिहत्तर लाख चौवन हज़ार तीन सौ इक्कीस');
    assert.equal(hindiWords(MAX_WHOLE), 'निन्यानवे खरब निन्यानवे अरब निन्यानवे करोड़ निन्यानवे लाख निन्यानवे हज़ार नौ सौ निन्यानवे');
  });
});

describe('English words, lakh and crore', () => {
  test('place values', () => {
    assert.equal(englishWords(0n), 'Zero');
    assert.equal(englishWords(45n), 'Forty-Five');
    assert.equal(englishWords(101n), 'One Hundred One');
    assert.equal(englishWords(125000n), 'One Lakh Twenty-Five Thousand');
    assert.equal(englishWords(10000000n), 'One Crore');
    assert.equal(englishWords(1250000000n), 'One Hundred Twenty-Five Crore');
  });
});

describe('amounts', () => {
  test('reads amounts the way people type them', () => {
    for (const s of ['125000', '1,25,000', '1 25 000', '₹1,25,000', 'Rs. 125000', '१२५०००', '125000/-']) {
      assert.deepEqual(parseAmount(s), { ok: true, whole: 125000n, fraction: '' }, s);
    }
    assert.deepEqual(parseAmount(''), { ok: false, error: 'empty' });
    assert.deepEqual(parseAmount('12a'), { ok: false, error: 'invalid' });
    assert.deepEqual(parseAmount('100000000000000'), { ok: false, error: 'too-large' });
  });

  test('cheque wording, Hindi', () => {
    assert.equal(amountInHindi('125000').text, 'एक लाख पच्चीस हज़ार रुपये मात्र');
    assert.equal(amountInHindi('1').text, 'एक रुपया मात्र');
    assert.equal(amountInHindi('1250.50').text, 'एक हज़ार दो सौ पचास रुपये और पचास पैसे मात्र');
    assert.equal(amountInHindi('0.01').text, 'एक पैसा मात्र');
    assert.equal(amountInHindi('10.5').text, 'दस रुपये और पचास पैसे मात्र');
    assert.deepEqual(amountInHindi('1.234'), { ok: false, error: 'paise' });
  });

  test('cheque wording, English', () => {
    assert.equal(amountInEnglish('125000').text, 'Rupees One Lakh Twenty-Five Thousand Only');
    assert.equal(amountInEnglish('1').text, 'Rupees One Only');
    assert.equal(amountInEnglish('1250.50').text, 'Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
    assert.equal(amountInEnglish('0.01').text, 'One Paisa Only');
  });

  test('plain numbers, with decimals read digit by digit', () => {
    assert.equal(amountInHindi('12.05', { rupees: false }).text, 'बारह दशमलव शून्य पाँच');
    assert.equal(amountInEnglish('3.14', { rupees: false }).text, 'Three Point One Four');
  });
});

describe('digits', () => {
  test('both ways, nothing else touched', () => {
    assert.equal(toHindiDigits('Room 101, 15/08/1947'), 'Room १०१, १५/०८/१९४७');
    assert.equal(toEnglishDigits('कक्ष १०१, १५/०८/१९४७'), 'कक्ष 101, 15/08/1947');
  });
});

describe('dates', () => {
  test('reads a date picker and day-first dates, rejects impossible ones', () => {
    assert.deepEqual(parseDate('2026-10-02'), { y: 2026, m: 10, d: 2 });
    assert.deepEqual(parseDate('2/10/2026'), { y: 2026, m: 10, d: 2 });
    assert.deepEqual(parseDate('०२.१०.२०२६'), { y: 2026, m: 10, d: 2 });
    assert.equal(parseDate('29/02/2023'), null);
    assert.deepEqual(parseDate('29/02/2024'), { y: 2024, m: 2, d: 29 });
    assert.equal(parseDate('31/04/2026'), null);
  });

  test('weekdays for dates everyone knows', () => {
    const weekday = (s) => hindiDate(s).find((x) => x.key === 'weekday').text;
    assert.equal(weekday('15/08/1947'), 'शुक्रवार, 15 अगस्त 1947');
    assert.equal(weekday('26/01/1950'), 'गुरुवार, 26 जनवरी 1950');
    assert.equal(weekday('2026-10-02'), 'शुक्रवार, 2 अक्टूबर 2026');
  });

  test('every format', () => {
    assert.deepEqual(hindiDate('15/08/1947').map((x) => x.text), [
      '15 अगस्त 1947',
      '१५ अगस्त १९४७',
      'शुक्रवार, 15 अगस्त 1947',
      '15/08/1947',
      '१५/०८/१९४७',
      'पंद्रह अगस्त उन्नीस सौ सैंतालीस',
    ]);
  });

  test('years in words', () => {
    assert.equal(hindiYear(1947), 'उन्नीस सौ सैंतालीस');
    assert.equal(hindiYear(1900), 'उन्नीस सौ');
    assert.equal(hindiYear(2026), 'दो हज़ार छब्बीस');
  });
});

describe('counting', () => {
  test('words, characters, akshar, sentences, paragraphs', () => {
    assert.deepEqual(countText('भारत की राजधानी नई दिल्ली है। क्षेत्र में श्री कृष्ण!\n\nदूसरा अनुच्छेद'), {
      words: 12,
      characters: 69,
      charactersNoSpaces: 57,
      akshar: 26,
      sentences: 3,
      paragraphs: 2,
    });
  });

  test('a conjunct is one akshar, and a final half letter is its own', () => {
    assert.equal(countText('क्ष').akshar, 1);
    assert.equal(countText('स्त्री').akshar, 1);
    assert.equal(countText('जगत्').akshar, 3); // ज ग त्
    assert.equal(countText('').words, 0);
    assert.equal(countText('   ').sentences, 0);
  });
});

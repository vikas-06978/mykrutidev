// The fonts that share a keyboard with Kruti Dev, Preeti or Shusha: Arjun,
// Kundli, Krishna, New Delhi, Ruchi, DevLys 020, Ajay, Aman and Agra on Kruti
// Dev's, the Nepali fonts on Preeti's, Shusha02 and Shivaji02 on Shusha's.
// Each sentence below was converted to the font, drawn in the font file
// itself and read back by eye before it went in here (see docs/FONTS.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert } from './fontMaps.js';
import { previewFontFor } from './legacyFonts.js';

const toU = (s, f) => convert(s, f, 'unicode', { keepEnglish: false });
const toF = (u, f) => convert(u, 'unicode', f);

const HINDI = 'भारत सरकार, राष्ट्रीय शिक्षा नीति। कर्मचारी प्रमाण पत्र, क्षेत्र, श्रीमती';
const NEPALI = 'नेपाल सरकार, शिक्षा मन्त्रालय। कर्मचारी प्रमाणपत्र, क्षेत्र, श्रीमती २०८१';
const MARATHI = 'महाराष्ट्र शासन, मराठी भाषा विभाग. कर्मचारी पात्र, हृदय, अन्न, कळवावे';

const KRUTI_FAMILY = ['arjun', 'kundli', 'krishna', 'new-delhi', 'ruchi', 'devlys-020', 'ajay', 'aman', 'agra'];
const PREETI_FAMILY = ['himalaya', 'akshar', 'dina', 'devanagari-bold', 'narad', 'aakriti', 'anjali'];
const SHUSHA_FAMILY = ['shusha02', 'shivaji02'];

describe('every font: the checked sentence goes there and back', () => {
  for (const f of KRUTI_FAMILY) test(f, () => assert.equal(toU(toF(HINDI, f), f), HINDI));
  for (const f of PREETI_FAMILY) test(f, () => assert.equal(toU(toF(NEPALI, f), f), NEPALI));
  for (const f of SHUSHA_FAMILY) test(f, () => assert.equal(toU(toF(MARATHI, f), f), MARATHI));
});

describe('the keys that differ from Kruti Dev', () => {
  test('= is half त्र in Arjun, New Delhi, Ajay and Agra, and त्र in Kruti Dev', () => {
    for (const f of ['arjun', 'new-delhi', 'ajay', 'agra']) {
      assert.equal(toU('i=k', f), 'पत्र', f);
      assert.equal(toF('पत्र', f), 'i=k', f);
    }
    assert.equal(toU('i=', 'kruti-dev'), 'पत्र');
  });

  test('New Delhi has half श on ’ (what Word types for the apostrophe)', () => {
    assert.equal(toU('’kfDr', 'new-delhi'), 'शक्ति');
    assert.equal(toF('शक्ति', 'new-delhi'), '’kfDr');
  });

  test('Ruchi draws ष्ट on þ, and its number keys are Hindi digits', () => {
    assert.equal(toU('jkþªh;', 'ruchi'), 'राष्ट्रीय');
    assert.equal(FONTS.ruchi.asciiIsScript, true);
    assert.equal(convert('Hkkjr 2024', 'ruchi', 'unicode'), 'भारत २०२४');
  });

  test('DevLys 020: 0-9 are Hindi digits, and ध is on Ä', () => {
    assert.equal(convert('2024', 'devlys-020', 'unicode'), '२०२४');
    assert.equal(toU('Äku', 'devlys-020'), 'धान');
    assert.equal(convert('2024', 'devlys', 'unicode'), '2024');
  });

  test('Kundli: औ on Ñ (Kruti Dev\'s कृ), full letters on its upper range', () => {
    assert.equal(toU('Ñ', 'kundli'), 'औ');
    assert.equal(toU('Ñ', 'kruti-dev'), 'कृ');
    assert.equal(toU('Ó', 'kundli'), 'श');
  });

  test('Arjun, Krishna and Agra: Hindi digits on the upper range', () => {
    for (const f of ['arjun', 'krishna', 'agra']) assert.equal(toU('\u008dŒ', f), '१०', f);
    // Aman has no १-४ there.
    assert.equal(toU('‘', 'aman'), '५');
    assert.ok(!('\u008d' in FONTS.aman.readMap));
  });

  test('the shared Kruti Dev keys read the same in every one', () => {
    for (const f of KRUTI_FAMILY) assert.equal(toU('Hkkjr ljdkj', f), 'भारत सरकार', f);
  });
});

describe('the keys that differ from Preeti', () => {
  test('Himalaya and Akshar: 0-9 are the digits, the letters moved to the shifted row', () => {
    for (const f of ['himalaya', 'akshar']) {
      assert.equal(toU('2081', f), '२०८१', f);
      assert.equal(toU('!', f), 'ज्ञ', f);
    }
    assert.equal(toU('!', 'preeti'), '१');
  });

  test('Himalaya swaps ु and ू on the quote keys', () => {
    assert.equal(toU("s'", 'himalaya'), toU('s"', 'preeti'));
    assert.equal(toU('s"', 'himalaya'), toU("s'", 'preeti'));
  });

  test('Akshar draws फ on F, where Himalaya has ा', () => {
    assert.equal(toU('F', 'akshar'), 'फ');
    assert.equal(toU('F', 'himalaya'), 'ा');
  });

  test('DINA: ्र on `, च on ˜', () => {
    assert.equal(toU('k`', 'dina'), 'प्र');
    assert.equal(toU('˜', 'dina'), 'च');
  });

  test('Anjali: ा on F, य on Ø', () => {
    assert.equal(toU('F', 'anjali'), 'ा');
    assert.equal(toU('Ø', 'anjali'), 'य');
  });

  test('the Nepali fonts are Nepali, with no "numbers" to keep', () => {
    for (const f of PREETI_FAMILY) {
      assert.equal(FONTS[f].lang, 'ne', f);
      assert.equal(FONTS[f].asciiIsScript, true, f);
    }
  });
});

describe('registry', () => {
  test('every font is verified, Beta, warns on what it cannot write, and has its preview', () => {
    for (const f of [...KRUTI_FAMILY, ...PREETI_FAMILY, ...SHUSHA_FAMILY]) {
      assert.equal(FONTS[f].accurate, true, f);
      assert.equal(FONTS[f].beta, true, f);
      assert.equal(FONTS[f].warnUnmapped, true, f);
      assert.ok(previewFontFor(f), f);
    }
  });

  test('Shivaji02 writes the full stop as Shivaji01 does', () => {
    assert.equal(toF('विभाग.', 'shivaji02'), toF('विभाग.', 'shivaji'));
  });
});

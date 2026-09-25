import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { COMMON_WORDS, applyCommonWords } from './corrections.js';
import { romanToUnicode } from './translit.js';
import { convert } from './fontMaps.js';

/** What the page actually runs in Hinglish mode when Google is unreachable. */
const h = (s) => romanToUnicode(s, { mode: 'hinglish' });

// ---------------------------------------------------------------------------

describe('every word on the list comes out nasalised', () => {
  // The exact table the request asked for, written out again here rather than
  // read from the module. A test that imported the answer would pass however
  // wrong the answer was.
  const asked = [
    [['hu', 'hoon'], 'हूँ'],
    [['mai', 'main'], 'मैं'],
    [['hai', 'he'], 'है'],
    [['nahi', 'nhi'], 'नहीं'],
    [['mei', 'mein', 'me'], 'में'],
    [['hum'], 'हम'],
    [['tum'], 'तुम'],
    [['kyu', 'kyun'], 'क्यों'],
    [['yahi'], 'यही'],
    [['wahi'], 'वही'],
    [['kahi', 'kahin'], 'कहीं'],
    [['yaha', 'yahan'], 'यहाँ'],
    [['waha', 'wahan'], 'वहाँ'],
    [['jaha', 'jahan'], 'जहाँ'],
    [['maa'], 'माँ'],
    [['haan', 'han'], 'हाँ'],
  ];

  for (const [spellings, hindi] of asked) {
    for (const s of spellings) {
      test(`${s} -> ${hindi}`, () => {
        assert.equal(h(s), hindi);
      });
    }
  }
});

describe('the nasal mark is the right one', () => {
  // ँ U+0901 chandrabindu and ं U+0902 anusvara are different marks that look
  // alike at a glance. Google returns वहां for `wahan` and the rules returned
  // मां for `maa`; both are the anusvara where the chandrabindu belongs. An
  // eyeball comparison would never catch it, so the codepoints are asserted.
  const CHANDRABINDU = 'ँ';
  const ANUSVARA = 'ं';

  for (const w of ['hu', 'yaha', 'yahan', 'waha', 'wahan', 'jaha', 'jahan', 'maa', 'haan']) {
    test(`${w} takes the chandrabindu`, () => {
      assert.ok(h(w).includes(CHANDRABINDU), `${h(w)} should carry U+0901`);
      assert.ok(!h(w).includes(ANUSVARA));
    });
  }

  for (const w of ['main', 'mein', 'nahi', 'kahi', 'kyu']) {
    test(`${w} takes the anusvara`, () => {
      assert.ok(h(w).includes(ANUSVARA), `${h(w)} should carry U+0902`);
      assert.ok(!h(w).includes(CHANDRABINDU));
    });
  }
});

// ---------------------------------------------------------------------------

describe('in a sentence, which is where they are actually typed', () => {
  // Every other word in these is one the fallback dictionary already knows, so
  // a failure here is about the correction pass and not about the rule engine's
  // unrelated rough edges.
  const cases = [
    ['main ghar ja raha hu', 'मैं घर जा रहा हूँ'],
    ['mai ghar par hu', 'मैं घर पर हूँ'],
    ['hum ghar me hai', 'हम घर में है'],
    ['hum sab waha hai', 'हम सब वहाँ है'],
    ['tum kaha ho', 'तुम कहा हो'],
    ['wo kahi nahi gaya', 'वो कहीं नहीं गया'],
    ['han main aa raha hu', 'हाँ मैं आ रहा हूँ'],
    ['maa ghar par hai', 'माँ घर पर है'],
    ['jaha tum ho waha me hu', 'जहाँ तुम हो वहाँ में हूँ'],
    ['aap kaise he', 'आप कैसे है'],
    ['yaha aao wahan mat jao', 'यहाँ आओ वहाँ मत जाओ'],
    ['kyu nahi aaye', 'क्यों नहीं आये'],
  ];

  for (const [roman, hindi] of cases) {
    test(roman, () => {
      const got = h(roman);
      // Only the listed words are asserted; the rest of the sentence is the
      // engine's business and is covered by translit.test.js.
      for (const [i, w] of roman.split(' ').entries()) {
        const fix = COMMON_WORDS[w.toLowerCase()];
        if (fix) assert.equal(got.split(' ')[i], fix, `word ${i} of "${roman}"`);
      }
      assert.equal(got, hindi);
    });
  }
});

describe('punctuation stuck to the word survives', () => {
  const cases = [
    ['main theek hu!', 'हूँ!'],
    ['main theek hu.', 'हूँ.'],
    ['kaise ho, tum?', 'तुम?'],
    ['(waha)', '(वहाँ)'],
    ['"hu"', '"हूँ"'],
    ['hu,', 'हूँ,'],
  ];

  for (const [roman, fragment] of cases) {
    test(JSON.stringify(roman), () => {
      assert.ok(h(roman).includes(fragment), `${h(roman)} should contain ${fragment}`);
    });
  }

  test('a danda is a full stop, not part of the word', () => {
    // The danda sits inside the Devanagari block, so a range that treated it as
    // a letter would eat it.
    assert.equal(applyCommonWords('hu', 'हु।'), 'हूँ।');
  });
});

describe('spacing and structure are never disturbed', () => {
  test('newlines and runs of spaces are kept exactly', () => {
    const roman = 'main  hu\n\nwaha   hai';
    const got = h(roman);
    assert.equal(got, 'मैं  हूँ\n\nवहाँ   है');
  });

  test('a URL beside a listed word is untouched', () => {
    const got = h('waha https://google.com hai');
    assert.ok(got.includes('https://google.com'));
    assert.ok(got.startsWith('वहाँ'));
  });

  test('digits are still digits', () => {
    assert.equal(h('waha 25 hai'), 'वहाँ 25 है');
  });
});

// ---------------------------------------------------------------------------

describe('words that are NOT on the list are left alone', () => {
  // The risk of a table like this is that it reaches words it was never meant
  // to. Each of these shares a prefix, a suffix or a shape with an entry.
  const untouched = [
    ['mehnat', 'मेहनत'],
    ['heera', 'हीरा'],
    ['kaha', 'कहा'],
    ['maan', 'मान'],
    ['haath', 'हाथ'],
    ['kyunki', 'क्योंकि'],
  ];

  for (const [roman, hindi] of untouched) {
    test(`${roman} stays ${hindi}`, () => {
      assert.equal(h(roman), hindi);
    });
  }

  // These land on rough edges of the rule engine that have nothing to do with
  // this table - `hua` has been हुअ since long before it existed. Asserting the
  // ideal spelling would be testing the wrong module, so what is asserted is
  // the only thing this pass is answerable for: that it did not fire.
  for (const [roman, mustNotContain] of [
    ['humara', 'हूँ'],
    ['human', 'हूँ'],
    ['hui', 'हूँ'],
    ['hua', 'हूँ'],
    ['tumhara', 'तुम'],
    ['heena', 'है'],
  ]) {
    test(`${roman} is not rewritten as if it were a listed word`, () => {
      assert.ok(
        !h(roman).includes(mustNotContain),
        `${roman} gave ${h(roman)}, which contains ${mustNotContain}`,
      );
    });
  }

  // These go straight to the pass rather than through the engine. The rule
  // dictionary independently spells `hu` as हूँ and turns the `n` of `mainly`
  // into an anusvara, so asking the engine would return the right answer for
  // the wrong reason and the test would prove nothing.
  test('punctuation INSIDE a token disqualifies it', () => {
    assert.equal(applyCommonWords('hu-hu', 'क-ख'), 'क-ख');
    assert.equal(applyCommonWords("hu's", 'कस'), 'कस');
  });

  test('a digit beside the word disqualifies it', () => {
    // A digit is part of the token, not punctuation around it.
    assert.equal(applyCommonWords('hu2', 'क2'), 'क2');
    assert.equal(applyCommonWords('2hu', '2क'), '2क');
  });

  test('a longer word that merely starts with a listed one is not replaced', () => {
    assert.equal(applyCommonWords('mainly', 'क'), 'क');
    assert.equal(applyCommonWords('humara', 'क'), 'क');
  });
});

// ---------------------------------------------------------------------------

describe('Exact (ITRANS) mode is not corrected, which is its whole promise', () => {
  const itrans = (s) => romanToUnicode(s, { mode: 'itrans' });

  test('main stays what the notation says, not what the table wants', () => {
    // A bare final consonant carries a halant in ITRANS, which is exactly the
    // literalness the mode is for.
    assert.equal(itrans('main'), 'मैन्');
    assert.notEqual(itrans('main'), 'मैं');
  });

  test('mai.n is how you ask for मैं there', () => {
    assert.equal(itrans('mai.n'), 'मैं');
  });

  for (const w of ['hu', 'he', 'waha', 'maa']) {
    test(`${w} is untouched in itrans`, () => {
      assert.notEqual(itrans(w), COMMON_WORDS[w]);
    });
  }
});

// ---------------------------------------------------------------------------

describe('applyCommonWords refuses a bad alignment rather than guessing', () => {
  test('mismatched word counts leave the Hindi alone', () => {
    // Two Roman words, three Hindi: nothing here can be trusted to line up.
    assert.equal(applyCommonWords('hu waha', 'क ख ग'), 'क ख ग');
  });

  test('a Hindi token with no Devanagari is skipped', () => {
    assert.equal(applyCommonWords('hu', '123'), '123');
  });

  test('empty input is returned unchanged', () => {
    assert.equal(applyCommonWords('', 'क'), 'क');
    assert.equal(applyCommonWords('hu', ''), '');
  });

  test('a string with nothing to fix is returned identically', () => {
    const hindi = 'घर जा रहा';
    assert.equal(applyCommonWords('ghar ja raha', hindi), hindi);
  });

  test('it corrects whatever it is given, whichever engine made it', () => {
    // Google's actual wrong answers, fed in as if they had just arrived.
    assert.equal(applyCommonWords('main ghar hu', 'मैं घर हु'), 'मैं घर हूँ');
    assert.equal(applyCommonWords('aap kaise he', 'आप कैसे हे'), 'आप कैसे है');
    assert.equal(applyCommonWords('wahan mat jao', 'वहां मत जाओ'), 'वहाँ मत जाओ');
    assert.equal(applyCommonWords('waha kya hai', 'वह क्या है'), 'वहाँ क्या है');
    assert.equal(applyCommonWords('wo kahi nahi', 'वो कही नहीं'), 'वो कहीं नहीं');
  });

  test('case does not matter', () => {
    assert.equal(applyCommonWords('Hu', 'हु'), 'हूँ');
    assert.equal(applyCommonWords('MAIN', 'मेन'), 'मैं');
  });
});

// ---------------------------------------------------------------------------

describe('the corrected words still reach Kruti Dev', () => {
  // The legacy output is derived from the Unicode, so a correction that did not
  // survive the font conversion would be invisible on the page's other setting.
  for (const roman of ['hu', 'waha', 'maa', 'kahi']) {
    test(roman, () => {
      const unicode = h(roman);
      const kruti = convert(unicode, 'unicode', 'kruti-dev');
      assert.ok(kruti.length > 0);
      assert.equal(convert(kruti, 'kruti-dev', 'unicode'), unicode, 'round trip');
    });
  }
});

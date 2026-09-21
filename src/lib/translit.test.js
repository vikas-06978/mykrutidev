import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { romanToUnicode, toItrans, MODES, TIP_KEYS, tipsFor } from './translit.js';
import { convert } from './fontMaps.js';

const h = (s) => romanToUnicode(s);
const i = (s) => romanToUnicode(s, { mode: 'itrans' });

describe('hinglish: the words the page promises', () => {
  const CASES = [
    ['namaste', 'नमस्ते'],
    ['bharat', 'भारत'],
    ['namaste bharat', 'नमस्ते भारत'],
    ['main ghar ja raha hu', 'मैं घर जा रहा हूँ'],
    ['hindi', 'हिंदी'],
    ['mera naam ram hai', 'मेरा नाम राम है'],
    ['kya aap theek hain', 'क्या आप ठीक हैं'],
    ['dhanyavaad', 'धन्यवाद'],
    ['shiksha', 'शिक्षा'],
    ['rashtriya', 'राष्ट्रीय'],
    ['vidyalay', 'विद्यालय'],
    ['pradhanmantri ka karyalay', 'प्रधानमंत्री का कार्यालय'],
  ];
  for (const [roman, want] of CASES) {
    test(`${roman} -> ${want}`, () => assert.equal(h(roman), want));
  }
});

describe('hinglish: the four rules, each on its own', () => {
  test('rule 1 — a final i or u is the long vowel', () => {
    assert.equal(h('dilli'), 'दिल्ली');
    assert.equal(toItrans('dilli'), 'dillii');
  });

  test('rule 2 — a written final a is aa, because nobody types a schwa', () => {
    assert.equal(h('ganga'), 'गंगा');
    assert.equal(h('paudha'), 'पौधा');
    assert.equal(h('chinta'), 'चिंता');
  });

  test('rule 3 — a nasal before a consonant is an anusvara', () => {
    assert.equal(h('mandir'), 'मंदिर');
    assert.equal(h('pankha'), 'पंखा');
    assert.equal(toItrans('hindi'), 'hi.ndii');
  });

  test('rule 4 — a final consonant keeps its inherent vowel, no halant', () => {
    assert.equal(h('ghar'), 'घर');
    assert.doesNotMatch(h('ghar'), /्$/);
    assert.equal(h('suraj'), 'सूरज');
  });

  test('rules 2 and 4 are the same fact and never both fire', () => {
    // `ghar` has no written final a, so rule 4 supplies the schwa; `ganga` has
    // one, so rule 2 lengthens it. A word cannot be in both states.
    assert.equal(toItrans('ghar'), 'ghara');
    assert.equal(toItrans('ganga'), 'ga.ngaa');
  });

  test('doubled cc is the conjunct, not a k', () => {
    // Without the cc rule the table's `c` -> `k` catches the first one and
    // बच्चा comes out बक्चा.
    assert.equal(h('bacche'), 'बच्चे');
    assert.doesNotMatch(h('baccha'), /क/);
  });
});

describe('hinglish: the dictionary carries what the rules cannot know', () => {
  test('nukta letters, which nobody types as such', () => {
    // Spelled out rather than pasted, because ड़ has two encodings that look
    // identical: the precomposed U+095C, and ड + the combining nukta. Unicode
    // discourages the precomposed one and the font engine emits the combining
    // form, so this is the form the two engines have to agree on — otherwise
    // text from this page would not match text from the converter in a search.
    const DDDHA = 'ड़'; // ड + ़
    assert.equal(h('ladka'), `ल${DDDHA}का`);
    assert.equal(h('sadak'), `स${DDDHA}क`);
    assert.equal(h('bada'), `ब${DDDHA}ा`);
  });

  test('nukta is encoded the same way the font engine encodes it', () => {
    // If these ever diverge, round-tripping through Kruti Dev silently changes
    // the bytes of every ड़ and ज़ on the page.
    assert.equal(
      h('ladka'),
      convert(convert(h('ladka'), 'unicode', 'kruti-dev'), 'kruti-dev', 'unicode'),
    );
    assert.doesNotMatch(h('ladka'), /[क़-य़]/);
  });

  test('chandrabindu rather than anusvara where the word wants it', () => {
    assert.equal(h('haan'), 'हाँ');
    assert.equal(h('panch'), 'पाँच');
    assert.equal(h('hu'), 'हूँ');
  });

  test('irregular vowel lengths', () => {
    assert.equal(h('bharat'), 'भारत');
    assert.equal(h('kitab'), 'किताब');
    assert.equal(h('aap'), 'आप');
  });

  test('a dictionary word beats the rules', () => {
    assert.equal(toItrans('bharat'), 'bhaarata');
    assert.notEqual(toItrans('bharat'), toItrans('bharatx').slice(0, -1));
  });

  test('case does not matter in hinglish mode', () => {
    assert.equal(h('Bharat'), h('bharat'));
    assert.equal(h('NAMASTE'), h('namaste'));
  });
});

describe('itrans mode stays exact', () => {
  test('the notation survives tokenising', () => {
    // The bug this pins: splitting on letters alone turns `hi.ndii` into `hi`
    // and `ndii`, and the anusvara is silently dropped.
    assert.equal(i('hi.ndii'), 'हिंदी');
    assert.equal(i('mai.n'), 'मैं');
    assert.equal(i('huu.N'), 'हूँ');
    assert.equal(i('raaShTriiya'), 'राष्ट्रीय');
    assert.equal(i('kR^ipayaa'), 'कृपया');
  });

  test('a sentence-ending full stop is punctuation, not notation', () => {
    assert.equal(i('namaste.'), 'नमस्ते.');
  });

  test('exact mode does NOT apply the hinglish guesses', () => {
    assert.equal(i('bhaarata'), 'भारत');
    assert.equal(i('ghara'), 'घर');
    // No final-vowel lengthening: what you write is what you get.
    assert.equal(i('dilli'), 'दिल्लि');
  });

  test('both modes are offered by name', () => {
    assert.deepEqual(Object.keys(MODES), ['hinglish', 'itrans']);
    for (const m of Object.values(MODES)) {
      for (const f of ['key', 'label', 'hint']) assert.ok(m[f], `${m.key} missing ${f}`);
    }
  });

  test('an unknown mode throws rather than silently guessing', () => {
    assert.throws(() => romanToUnicode('x', { mode: 'nope' }), /Unknown transliteration mode/);
  });
});

/**
 * The page prints these under the boxes as a promise about what the engine does.
 * They used to be a hand-written table, and it drifted: the page said `ri` = ऋ
 * while the engine produced री, with nothing anywhere to catch it.
 *
 * Now the Devanagari side is generated by running the engine, so a tip cannot
 * disagree with it by construction. These tests cover what construction alone
 * cannot: that the Roman side is a sensible thing to advertise, and that the
 * specific claims the page makes are the ones we meant to make.
 */
describe('spelling tips say what the engine actually does', () => {
  for (const mode of Object.keys(TIP_KEYS)) {
    test(`${mode}: every tip round-trips through the engine`, () => {
      for (const { roman, deva } of tipsFor(mode)) {
        assert.equal(romanToUnicode(roman, { mode }), deva, `tip "${roman}"`);
      }
    });

    test(`${mode}: every tip produces Devanagari and nothing else`, () => {
      for (const { roman, deva } of tipsFor(mode)) {
        assert.ok(deva.length > 0, `tip "${roman}" produces nothing`);
        assert.match(deva, /^[ऀ-ॿ]+$/, `tip "${roman}" -> ${JSON.stringify(deva)}`);
      }
    });

    test(`${mode}: no tip leaves a stray halant`, () => {
      // A bare consonant in ITRANS carries one, which is exactly why the two
      // modes cannot share a tip list. Every tip must show a finished letter.
      for (const { roman, deva } of tipsFor(mode)) {
        assert.doesNotMatch(deva, /्$/, `tip "${roman}" -> ${deva} ends in a halant`);
      }
    });

    test(`${mode}: tips are unique`, () => {
      const keys = TIP_KEYS[mode];
      assert.equal(new Set(keys).size, keys.length);
    });
  }

  test('the modes offering tips are exactly the modes the UI offers', () => {
    assert.deepEqual(Object.keys(TIP_KEYS).sort(), Object.keys(MODES).sort());
  });

  test('an unknown mode has no tips rather than silently empty ones', () => {
    assert.throws(() => tipsFor('nope'), /No tips for mode/);
  });

  test('the claims the page makes are the intended ones', () => {
    const h = Object.fromEntries(tipsFor('hinglish').map((t) => [t.roman, t.deva]));
    assert.deepEqual(h, {
      kh: 'ख', chh: 'छ', sh: 'श',
      aa: 'आ', ee: 'ई', oo: 'ऊ',
      ri: 'री', rri: 'ऋ', ksh: 'क्ष',
    });

    const i = Object.fromEntries(tipsFor('itrans').map((t) => [t.roman, t.deva]));
    assert.deepEqual(i, {
      kha: 'ख', chha: 'छ', sha: 'श', Sha: 'ष',
      aa: 'आ', ii: 'ई', uu: 'ऊ',
      'R^i': 'ऋ', kSha: 'क्ष',
    });
  });

  test('the two modes really do need separate tips', () => {
    // If this ever stops being true the split is dead weight — but it is the
    // reason the original single list could not be correct for both.
    assert.notEqual(romanToUnicode('kh', { mode: 'hinglish' }), romanToUnicode('kh', { mode: 'itrans' }));
  });
});

describe('the vocalic r, which is what the tip got wrong', () => {
  test('ri stays री, because that is what it usually is', () => {
    assert.equal(romanToUnicode('ri'), 'री');
    assert.equal(romanToUnicode('rishta'), 'रिश्ता');
  });

  test('rri is the way to ask for ऋ', () => {
    assert.equal(romanToUnicode('rri'), 'ऋ');
    assert.equal(romanToUnicode('RRi'), 'ऋ', 'the ITRANS spelling should work too');
  });

  test('the everyday ऋ words are named rather than guessed', () => {
    assert.equal(romanToUnicode('rishi'), 'ऋषि');
    assert.equal(romanToUnicode('ritu'), 'ऋतु');
    assert.equal(romanToUnicode('rin'), 'ऋण');
  });

  test('adding rri did not disturb ordinary doubled r', () => {
    assert.equal(romanToUnicode('arre'), 'अर्रे');
  });

  test('the kri ligature still works, in both spellings', () => {
    assert.equal(romanToUnicode('krishna'), 'कृष्ण');
    assert.equal(romanToUnicode('kripya'), 'कृपया');
  });
});

describe('structure is never touched', () => {
  test('whitespace and line breaks survive exactly', () => {
    for (const ws of ['\n', '\r\n', '\n\n', '\t', '   ', '\n \n']) {
      assert.equal(h(`ghar${ws}se`), `घर${ws}से`);
    }
  });

  test('digits, dates and punctuation pass through', () => {
    assert.equal(h('dinank 15/08/1947'), 'दिनांक 15/08/1947');
    assert.equal(h('bharat 2024'), 'भारत 2024');
    assert.equal(h('namaste!'), 'नमस्ते!');
  });

  test('URLs and emails are protected', () => {
    assert.match(h('dekhen https://mykrutidev.com/help'), /https:\/\/mykrutidev\.com\/help/);
    assert.match(h('mail info@mykrutidev.com'), /info@mykrutidev\.com/);
  });

  test('text already in Devanagari is left alone', () => {
    assert.equal(h('भारत'), 'भारत');
  });

  test('empty input is empty output', () => {
    assert.equal(h(''), '');
    assert.equal(i(''), '');
  });

  test('a large input does not blow up', () => {
    const big = 'namaste '.repeat(5000);
    assert.equal(h(big).trim().split(/\s+/).length, 5000);
  });
});

/**
 * The page offers a Kruti Dev output option. It is this composition and nothing
 * more — transliterate to Unicode, then hand the Unicode to the font engine —
 * so the two engines stay separate and neither learns about the other.
 */
describe('composing with the font converter', () => {
  const pipeline = (roman) => convert(romanToUnicode(roman), 'unicode', 'kruti-dev');

  test('roman -> unicode -> kruti dev', () => {
    assert.equal(pipeline('bharat'), 'Hkkjr');
    assert.equal(pipeline('namaste'), 'ueLrs');
    assert.equal(pipeline('hindi'), 'fganh');
  });

  test('the legacy output decodes back to what was typed', () => {
    for (const roman of ['namaste bharat', 'mera naam ram hai', 'shiksha']) {
      const unicode = romanToUnicode(roman);
      const legacy = convert(unicode, 'unicode', 'kruti-dev');
      assert.equal(convert(legacy, 'kruti-dev', 'unicode'), unicode, `on "${roman}"`);
    }
  });

  test('line breaks survive the whole pipeline', () => {
    const out = pipeline('namaste\n\nbharat');
    assert.match(out, /\n\n/);
    assert.equal(convert(out, 'kruti-dev', 'unicode'), 'नमस्ते\n\nभारत');
  });
});

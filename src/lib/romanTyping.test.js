import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  tokenize,
  typeHindi,
  typeHindiLocal,
  typeItrans,
  replaceWord,
  wordAt,
  pickKey,
  MAX_SUGGESTIONS,
} from './romanTyping.js';
import {
  googleSuggestions,
  parseCandidates,
  _resetCache,
  _resetBreaker,
} from './googleTranslit.js';
import { romanToUnicode } from './translit.js';
import { FONTS } from './fontMaps.js';
import { makeEnglish, HINGLISH_ALWAYS, LOANWORDS } from './englishWords.js';
import { arpabetToDevanagari, englishToDevanagari, OVERRIDES } from './arpabet.js';

// ---------------------------------------------------------------------------
// A mock Google Input Tools
// ---------------------------------------------------------------------------

/**
 * What the mock endpoint answers, per word, best first. Deliberately NOT what
 * the local dictionary would say for every word (`haal` has a second-ranked
 * candidate, `ruko` has four), so a test can tell which engine answered.
 */
const GOOGLE = {
  kya: ['क्या', 'कया', 'क्य'],
  haal: ['हाल', 'हल'],
  hai: ['हैं', 'है', 'हे'], // first candidate deliberately NOT है: the pin must win
  chal: ['चल', 'चाल', 'छल'],
  bhai: ['भाई', 'भई'],
  ruko: ['रुको', 'रूको', 'रुकों', 'रोको', 'रक्खो', 'रुकोँ'],
  baje: ['बजे', 'बाजे'],
  subah: ['सुबह', 'सुबाह'],
  ghar: ['घर', 'घार'],
  chalo: ['चलो', 'छलो'],
  kal: ['कल', 'काल'],
  milte: ['मिलते', 'मिल्ते'],
  hain: ['हैं', 'हैन'],
  namaste: ['नमस्ते', 'नमस्ती'],
  bharat: ['भारत', 'भरत'],
  thela: ['ठेला', 'थेला'],
  // For the English-word tests. What Google plausibly says; the English words
  // among them must NOT take Google's answer.
  mera: ['मेरा', 'मीरा'],
  kaha: ['कहा', 'कहाँ'],
  kahan: ['कहाँ', 'कहां'],
  jana: ['जाना', 'जन'],
  to: ['तो', 'टो'],
  nice: ['निसे', 'नाइस'],
  have: ['हवे', 'हैव'],
  phone: ['फोन', 'फ़ोन'],
  school: ['स्कूल'],
  thank: ['थंक', 'थैंक'],
  you: ['यौ', 'यू'],
  mobile: ['मोबिले', 'मोबाइल'],
};

/** Every URL the mock was asked for. */
let requests = [];

function mockFetch(url) {
  requests.push(url);
  const u = new URL(url);
  const word = u.searchParams.get('text');
  const cands = GOOGLE[word];
  const body = cands
    ? ['SUCCESS', [[word, cands.slice(0, Number(u.searchParams.get('num'))), [], {}]]]
    : ['SUCCESS', [[word, [`?${word}`], [], {}]]];
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

const offlineFetch = () => Promise.reject(new TypeError('Failed to fetch'));

const fallback = (w) => romanToUnicode(w, { mode: 'hinglish' });

/** The page's pipeline, with Google mocked. */
const type = (text, { fetchImpl = mockFetch, picks } = {}) =>
  typeHindi(text, {
    lookup: (w) => googleSuggestions(w, { fetchImpl }),
    fallback,
    picks,
  });

beforeEach(() => {
  requests = [];
  _resetCache();
  _resetBreaker();
});

// ---------------------------------------------------------------------------
// The spec's cases
// ---------------------------------------------------------------------------

describe('the required outputs', () => {
  const CASES = [
    ['kya haal hai?', 'क्या हाल है?'],
    ['chal?', 'चल?'],
    ['bhai, ruko!', 'भाई, रुको!'],
    ['10 baje (subah)', '10 बजे (सुबह)'],
    ['email@test.com', 'email@test.com'],
    ['ghar chalo | kal milte hain ||', 'घर चलो । कल मिलते हैं ॥'],
  ];
  for (const [roman, hindi] of CASES) {
    test(`${roman} -> ${hindi}`, async () => {
      assert.equal((await type(roman)).text, hindi);
    });
  }

  test('newlines, tabs and multiple spaces are preserved exactly', async () => {
    assert.equal((await type('ghar   chalo\n\nkal\tmilte\r\n  hain  ')).text, 'घर   चलो\n\nकल\tमिलते\r\n  हैं  ');
  });

  test('an email is never sent to Google', async () => {
    await type('email@test.com');
    assert.deepEqual(requests, []);
  });
});

// ---------------------------------------------------------------------------
// Punctuation: only letters are transliterated
// ---------------------------------------------------------------------------

describe('punctuation, numbers and symbols stay exactly as typed', () => {
  const SYMBOLS = '? ! , . : ; \' " ( ) [ ] { } - _ / \\ @ # $ % & * + = < > ~ ` 0 1 2 3 4 5 6 7 8 9';

  test('each one alone', async () => {
    assert.equal((await type(SYMBOLS)).text, SYMBOLS);
    assert.deepEqual(requests, [], 'nothing without letters goes to Google');
  });

  test('each one attached to a word, before and after', async () => {
    for (const s of SYMBOLS.split(' ')) {
      // A backtick on both sides is the "keep this English" marker, tested below.
      if (s === '`') continue;
      assert.equal((await type(`${s}chal${s}`)).text, `${s}चल${s}`, JSON.stringify(s));
    }
    assert.equal((await type('`chal')).text, '`चल');
    assert.equal((await type('chal`')).text, 'चल`');
  });

  test('punctuation around a word stays in place', async () => {
    assert.equal((await type('(kya)')).text, '(क्या)');
    assert.equal((await type('"bhai",')).text, '"भाई",');
  });

  test('only letters reach Google, one request per distinct word', async () => {
    await type('chal? chal! bhai, (bhai)');
    const sent = requests.map((u) => new URL(u).searchParams.get('text')).sort();
    assert.deepEqual(sent, ['bhai', 'chal']);
  });

  test('| is । and || is ॥, attached or not', async () => {
    assert.equal((await type('ghar|')).text, 'घर।');
    assert.equal((await type('ghar||')).text, 'घर॥');
    assert.equal((await type('|||')).text, '॥।');
  });

  test('`backticked` English stays English, without the backticks', async () => {
    assert.equal((await type('`Google` kya')).text, 'Google क्या');
    assert.ok(!requests.some((u) => u.includes('Google')), 'backticked word was sent');
    assert.equal((await type('a lone ` stays')).text.includes('`'), true);
  });

  test('the offline engine keeps punctuation exactly too', () => {
    assert.equal(typeHindiLocal('chal? bhai, ruko! 10 (subah) |', { fallback }).text.replace(/[ऀ-ॣ०-ॿ]+/g, 'H'), 'H? H, H! 10 (H) ।');
  });
});

// ---------------------------------------------------------------------------
// Word quality: Google's FIRST suggestion, dictionary only on failure
// ---------------------------------------------------------------------------

describe('where each word comes from', () => {
  test('Google is called for every word, with num=5, and its first candidate is used', async () => {
    const r = await type('thela bharat');
    assert.equal(r.text, 'ठेला भारत');
    assert.equal(r.fellBack, false);
    assert.equal(requests.length, 2);
    for (const u of requests) assert.equal(new URL(u).searchParams.get('num'), '5');
  });

  test('a word Google has never seen is still Google\'s answer, not the dictionary', async () => {
    assert.equal((await type('zzq')).text, '?zzq');
  });

  test('the dictionary is used only when the request fails', async () => {
    const r = await type('thela bharat', { fetchImpl: offlineFetch });
    assert.equal(r.fellBack, true);
    assert.equal(r.text, `${fallback('thela')} ${fallback('bharat')}`);
  });

  test('a failure for one word falls back for that word only', async () => {
    const flaky = (url) =>
      new URL(url).searchParams.get('text') === 'thela' ? offlineFetch() : mockFetch(url);
    const r = await type('thela bharat', { fetchImpl: flaky });
    assert.equal(r.fellBack, true);
    assert.equal(r.text, `${fallback('thela')} भारत`);
  });

  test('an HTTP error or a bad response also falls back', async () => {
    const http500 = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) });
    assert.equal((await type('bharat', { fetchImpl: http500 })).fellBack, true);
    _resetBreaker();
    const junk = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(['FAILED']) });
    assert.equal((await type('bharat', { fetchImpl: junk })).fellBack, true);
  });

  test('the pinned common words beat Google\'s first candidate', async () => {
    // The mock ranks हैं first for `hai`; corrections.js pins है.
    const r = await type('hai');
    assert.equal(r.text, 'है');
    assert.deepEqual(r.words[0].suggestions, ['है', 'हैं', 'हे']);
  });

  test('the list offers at most 5 suggestions, best first', async () => {
    const r = await type('ruko');
    assert.equal(r.words[0].suggestions.length, MAX_SUGGESTIONS);
    assert.deepEqual(r.words[0].suggestions, GOOGLE.ruko.slice(0, 5));
  });

  test('parseCandidates keeps Google\'s order and rejects a malformed reply', () => {
    assert.deepEqual(parseCandidates(['SUCCESS', [['kal', ['कल', 'काल'], [], {}]]]), ['कल', 'काल']);
    assert.throws(() => parseCandidates(['SUCCESS', []]));
    assert.throws(() => parseCandidates(['SUCCESS', [['kal', [], [], {}]]]));
  });
});

// ---------------------------------------------------------------------------
// Tap a word, pick another suggestion
// ---------------------------------------------------------------------------

describe('picking a suggestion', () => {
  test('replaces that word only, and shifts the words after it', async () => {
    const r = await type('kal kal ghar');
    const k = wordAt(r, 0);
    assert.equal(k, 0);
    const next = replaceWord(r, k, 'काल');
    assert.equal(next.text, 'काल कल घर');
    assert.equal(next.text.slice(next.words[2].start, next.words[2].end), 'घर');
  });

  test('a pick survives the next render of the same text and more typing', async () => {
    const picks = new Map([[pickKey(0, 'kal'), 'काल']]);
    assert.equal((await type('kal kal', { picks })).text, 'काल कल');
    assert.equal((await type('kal kal ghar', { picks })).text, 'काल कल घर');
  });

  test('a pick is dropped once its word changes', async () => {
    const picks = new Map([[pickKey(0, 'kal'), 'काल']]);
    assert.equal((await type('ghar kal', { picks })).text, 'घर कल');
  });

  test('wordAt finds the word under a caret, including just after it', async () => {
    const r = await type('chal? bhai');
    assert.equal(wordAt(r, 0), 0);
    assert.equal(wordAt(r, 2), 0);
    assert.equal(wordAt(r, 3), -1); // after the "?", before the space
    assert.equal(wordAt(r, r.text.length), 1);
  });
});

// ---------------------------------------------------------------------------
// Tokenising and ITRANS
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  test('rebuilds the input apart from the documented rewrites', () => {
    const s = 'chal? `Google` https://a.com/x?y=1 a@b.co 10 | ||\n';
    const joined = tokenize(s).map((t) => t.v).join('');
    assert.equal(joined, 'chal? Google https://a.com/x?y=1 a@b.co 10 । ॥\n');
  });

  test('the letters inside a URL or email are not words', () => {
    assert.deepEqual(
      tokenize('https://kya.com kya a@kya.in').filter((t) => t.kind === 'word').map((t) => t.v),
      ['kya'],
    );
  });
});

describe('ITRANS mode', () => {
  const itrans = (s) => typeItrans(s, (x) => romanToUnicode(x, { mode: 'itrans' })).text;

  test('is unchanged: runs go to the ITRANS engine whole', () => {
    assert.equal(itrans('hi.ndii'), romanToUnicode('hi.ndii', { mode: 'itrans' }));
  });

  test('keeps URLs and `English`', () => {
    assert.equal(itrans('`PAN` https://a.com'), 'PAN https://a.com');
  });
});

// ---------------------------------------------------------------------------
// English words
// ---------------------------------------------------------------------------

// Compare nukta letters in one spelling: the site writes फ़ as फ + ़, and a
// literal typed in this file may be either.
const nfd = (s) => s.normalize('NFD');

describe('English words', () => {
  const { words: ENGLISH_WORDS } = JSON.parse(
    readFileSync(new URL('../../public/data/english-words.json', import.meta.url), 'utf8'),
  );
  const english = makeEnglish(ENGLISH_WORDS);
  const typeEn = (text, keepEnglish = false, fetchImpl = mockFetch) =>
    typeHindi(text, {
      lookup: (w) => googleSuggestions(w, { fetchImpl }),
      fallback,
      english,
      keepEnglish,
    });
  const CASES = [
    ['nice to have', 'नाइस तो हैव'],
    ['mera phone kaha hai?', 'मेरा फ़ोन कहा है?'],
    ['school jana hai', 'स्कूल जाना है'],
    ['thank you bhai!', 'थैंक यू भाई!'],
    ['mera mobile kahan hai?', 'मेरा मोबाइल कहाँ है?'],
  ];
  for (const [roman, hindi] of CASES) {
    test(`${roman} -> ${hindi}`, async () => {
      assert.equal(nfd((await typeEn(roman)).text), nfd(hindi));
    });
  }

  test('Keep English: English words stay as typed, Hindi words are still Hindi', async () => {
    assert.equal((await typeEn('mera phone kaha hai', true)).text, 'मेरा phone कहा है');
    assert.equal((await typeEn('Nice to have', true)).text, 'Nice तो have');
  });

  test('English words are spelled offline too', async () => {
    const r = await typeEn('thank you bhai', false, offlineFetch);
    assert.equal(r.text.split(' ').slice(0, 2).join(' '), 'थैंक यू');
    assert.equal(
      typeHindiLocal('nice school', { fallback, english }).text,
      'नाइस स्कूल',
    );
  });

  test('a failed Google request for an English word raises no offline note', async () => {
    const flaky = (url) =>
      new URL(url).searchParams.get('text') === 'school' ? offlineFetch() : mockFetch(url);
    assert.equal((await typeEn('school jana', false, flaky)).fellBack, false);
  });

  describe('the spelling of each example word', () => {
    const WANT = {
      nice: 'नाइस', have: 'हैव', guitar: 'गिटार', computer: 'कंप्यूटर', phone: 'फ़ोन',
      school: 'स्कूल', office: 'ऑफ़िस', mobile: 'मोबाइल', thank: 'थैंक', you: 'यू',
      please: 'प्लीज़', doctor: 'डॉक्टर',
    };
    for (const [w, d] of Object.entries(WANT)) {
      test(`${w} -> ${d}`, () => {
        assert.equal(english.isEnglish(w), true);
        assert.equal(nfd(english.pronounce(w)), nfd(d));
      });
    }

    test('nukta letters are stored decomposed, like the rest of the site', () => {
      assert.equal(english.pronounce('phone'), 'फ़ोन');
      assert.equal(english.pronounce('office'), 'ऑफ़िस');
    });
  });

  test('Hinglish words that are also English stay Hinglish', () => {
    for (const w of [...HINGLISH_ALWAYS, 'jana', 'mere', 'log', 'din', 'ye', 'ka', 'ki', 'hu']) {
      assert.equal(english.isEnglish(w), false, w);
    }
  });

  test('the loanwords are English again, even though the dictionary lists them', () => {
    for (const w of LOANWORDS) {
      if (w in ENGLISH_WORDS) assert.equal(english.isEnglish(w), true, w);
    }
  });

  test('tapping shows both readings: to -> तो and टू', async () => {
    const [to] = (await typeEn('to')).words;
    assert.equal(to.suggestions[0], 'तो');
    assert.ok(to.suggestions.includes('टू'));
    const [nice] = (await typeEn('nice')).words;
    assert.equal(nice.suggestions[0], 'नाइस');
    assert.ok(nice.suggestions.includes('निसे'), 'Google\'s candidates are still offered');
    const [kept] = (await typeEn('nice', true)).words;
    assert.deepEqual(kept.suggestions.slice(0, 2), ['nice', 'नाइस']);
  });

  test('picking the other reading replaces that word only', async () => {
    const r = await typeEn('nice to have');
    const k = r.words.findIndex((w) => w.roman === 'to');
    assert.equal(replaceWord(r, k, 'टू').text, 'नाइस टू हैव');
  });

  test('punctuation, digits, backticks and whitespace are unchanged', async () => {
    assert.equal(nfd((await typeEn('nice,  10 `phone`\n(school)?')).text), nfd('नाइस,  10 phone\n(स्कूल)?'));
  });

  test('the word list is lowercase letters with an ARPAbet pronunciation', () => {
    const entries = Object.entries(ENGLISH_WORDS);
    assert.ok(entries.length >= 19_000 && entries.length <= 20_000, `${entries.length} words`);
    for (const [w, p] of entries) {
      assert.match(w, /^[a-z]{2,}$/);
      assert.match(p, /^[A-Z]+( [A-Z]+)*$/, w);
    }
  });

  test('every word in the list converts without throwing', () => {
    for (const w of Object.keys(ENGLISH_WORDS)) assert.ok(english.pronounce(w), w);
  });
});

describe('ARPAbet rules', () => {
  const R = (p, w) => arpabetToDevanagari(p, w);
  test('clusters take a halant, final consonants do not', () => {
    assert.equal(R('S K UW L', 'school'), 'स्कूल');
    assert.equal(R('HH AE V', 'have'), 'हैव');
  });
  test('a nasal before a stop is an anusvara; NG is ंग elsewhere', () => {
    assert.equal(R('N AH M B ER', 'number'), 'नंबर');
    assert.equal(R('S IH NG', 'sing'), 'सिंग');
    assert.equal(R('S IH NG ER', 'singer'), 'सिंगर');
  });
  test('AA is ऑ when spelled with o, आ otherwise; AO is ऑ', () => {
    assert.equal(R('P R AA B L AH M', 'problem'), 'प्रॉब्लम');
    assert.equal(R('K AA R', 'car'), 'कार');
    assert.equal(R('AO F IH S', 'office'), 'ऑफ़िस');
  });
  test('a final AH is आ, as English spells it with a', () => {
    assert.equal(R('K AE M ER AH', 'camera'), 'कैमरा');
  });
  test('the Indian-English overrides win over CMU', () => {
    assert.equal(englishToDevanagari('mobile', 'M OW B AH L'), 'मोबाइल');
    assert.equal(nfd(englishToDevanagari('coffee', 'K AA F IY')), nfd('कॉफ़ी'));
    assert.equal(Object.keys(OVERRIDES).length, 20);
  });
});

// ---------------------------------------------------------------------------
// The output box's font
// ---------------------------------------------------------------------------

describe('the output box font', () => {
  const src = readFileSync(new URL('../components/Transliterator.astro', import.meta.url), 'utf8');
  const LEGACY = /kruti|devlys|chanakya|walkman|preeti|shusha/i;

  test('is the Unicode stack, with no legacy font in it', () => {
    assert.doesNotMatch(FONTS.unicode.css, LEGACY);
    assert.match(src, /const OUTPUT_FONT = FONTS\.unicode\.css;/);
    assert.match(src, /--cv-preview:\$\{OUTPUT_FONT\}/);
  });

  test('the component no longer reaches for a legacy preview font', () => {
    assert.doesNotMatch(src, /previewFontFor|legacyFonts|codeLabel/);
    assert.doesNotMatch(src, /FONTS\[['"](kruti-dev|devlys|chanakya)/);
    assert.doesNotMatch(src, /Copy Kruti|data-format/);
  });

  test('links to the Unicode to Kruti Dev converter instead', () => {
    assert.match(src, /href="\/unicode-to-kruti-dev"/);
    assert.match(src, /Copy Hindi/);
  });
});

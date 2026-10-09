// The English guard on the Kruti Dev keyboard, held to real Hindi.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { convert, englishReport, AMBIGUOUS_ENGLISH } from './fontMaps.js';
import { krutiHindiTokens } from './krutiEnglish.build.js';

const toU = (s, opts = {}) => convert(s, 'kruti-dev', 'unicode', opts);
const hindi = await krutiHindiTokens();

describe('no Hindi word is kept as English', () => {
  test('every Hindi word on the site, typed in Kruti Dev, converts with the box ticked', () => {
    const wrong = [];
    const text = JSON.parse(readFileSync(new URL('../i18n/hi.json', import.meta.url), 'utf8'));
    const words = new Set(JSON.stringify(text).match(/[ऀ-ॿ]+/g));
    for (const w of words) {
      const keys = convert(w, 'unicode', 'kruti-dev', { keepEnglish: false });
      if (toU(keys) !== toU(keys, { keepEnglish: false })) wrong.push(`${keys} (${w})`);
    }
    assert.deepEqual(wrong, []);
  });

  test('the ones that used to slip through', () => {
    assert.equal(toU('jke us dgk'), 'राम ने कहा');
    assert.equal(toU('nqdku can gS'), 'दुकान बंद है');
    assert.equal(toU('i<+s fy[ks'), 'पढ़े लिखे');
    assert.equal(toU('u;s ?kj'), 'नये घर');
    assert.equal(toU('ty GA'), 'जल ळ।');
    assert.equal(toU('AA'), '॥');
  });
});

describe('English is still kept', () => {
  test('words, acronyms, and an ambiguous word between English words', () => {
    assert.equal(toU('esjk PAN uEcj'), 'मेरा PAN नम्बर');
    assert.equal(toU('Office in India gS'), 'Office in India है');
    assert.equal(toU('US dh ;k=k'), 'US की यात्रा');
  });

  test('the visitor’s ticks win, and an ambiguous word follows its neighbours', () => {
    const keepWords = new Set(['Delhi']);
    const convertWords = new Set(['Office']);
    assert.equal(toU('Office in India', { keepWords, convertWords }), 'व्िपिबम पद India');
    assert.equal(toU('Delhi esa', { keepWords }), 'Delhi में');
    assert.equal(toU('jke us', { keepWords: new Set(['us']) }), 'राम us');
  });

  test('only on the Kruti Dev keyboard is `us` Hindi', () => {
    assert.ok(AMBIGUOUS_ENGLISH.has('us'));
    assert.equal(convert('us', 'shusha', 'unicode'), 'us');
  });
});

describe('the word list behind the panel', () => {
  test('englishReport: kept words ticked, possible English unticked, each with its Hindi', () => {
    const r = englishReport('jke us Office esa Delhi', 'kruti-dev', { candidates: new Set(['delhi']) });
    assert.deepEqual(r, [
      { token: 'us', hindi: 'ने', english: false },
      { token: 'Office', hindi: 'व्िपिबम', english: true },
      { token: 'Delhi', hindi: 'क्मसीप', english: false },
    ]);
    assert.deepEqual(englishReport('Hkkjr', 'kruti-dev'), []);
    assert.deepEqual(englishReport('anything', 'preeti'), []);
  });

  test('public/data/kruti-english.json suggests no Hindi word and matches its build', () => {
    const { words } = JSON.parse(readFileSync(new URL('../../public/data/kruti-english.json', import.meta.url), 'utf8'));
    const all = Object.keys(JSON.parse(readFileSync(new URL('../../public/data/english-words.json', import.meta.url), 'utf8')).words);
    assert.deepEqual(words, all.filter((w) => /^[a-z]{2,}$/.test(w) && !hindi.has(w)), 'run node scripts/build-kruti-english.mjs');
    for (const w of ['ls', 'dj', 'can', 'thou']) assert.ok(!words.includes(w), w);
    for (const w of ['delhi', 'office', 'school']) assert.ok(words.includes(w), w);
  });
});

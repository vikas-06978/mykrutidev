import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { PRACTICE_PASSAGES } from './practicePassages.js';
import { practiceList, keysFor, trickyWords } from './practicePassages.build.js';
import { convert, isWellFormedDevanagari } from './fontMaps.js';
import { isTypeable } from './remington.js';

const both = { keepEnglish: false };

describe('the 30 free practice passages', () => {
  test('there are thirty, ten to a level, with unique titles', () => {
    assert.equal(PRACTICE_PASSAGES.length, 30);
    for (const l of [1, 2, 3]) assert.equal(PRACTICE_PASSAGES.filter((p) => p.level === l).length, 10);
    assert.equal(new Set(PRACTICE_PASSAGES.map((p) => p.title)).size, 30);
  });

  for (const p of PRACTICE_PASSAGES) {
    test(`${p.title}: round-trips, every key is on the keyboard, plain Devanagari`, () => {
      const keys = convert(p.text, 'unicode', 'kruti-dev', both);
      assert.equal(convert(keys, 'kruti-dev', 'unicode', both), p.text);
      assert.ok(isWellFormedDevanagari(p.text));
      assert.ok(isTypeable(keysFor(p.text)), 'a key not on the keyboard');
      assert.doesNotMatch(p.text, /[A-Za-z]/);
      // No ँ ऊ ऑ ॉ, and no nukta except under ड and ढ (the same rule as passages.js).
      assert.doesNotMatch(p.text, /[ँऊऑॉ]|[^डढ]़/);
      assert.equal(p.text, p.text.trim());
      assert.doesNotMatch(p.text, /\s\s/);
      assert.match(p.text, /।$/);
    });
  }

  test('levels get longer: 98-117, 134-154 and 202-216 words', () => {
    const w = (l) => practiceList().filter((p) => p.level === l).map((p) => p.words);
    assert.ok(Math.max(...w(1)) < Math.min(...w(2)));
    assert.ok(Math.max(...w(2)) < Math.min(...w(3)));
  });

  test('every passage has eight tricky words, each with keys that give the word back', () => {
    for (const p of practiceList()) {
      assert.equal(p.tricky.length, 8, p.title);
      for (const t of p.tricky) assert.equal(convert(t.keys, 'kruti-dev', 'unicode', both), t.word, t.word);
    }
  });

  test('the keys of well-known words', () => {
    assert.equal(keysFor('कर्म'), 'deZ');
    assert.equal(keysFor('कि'), 'fd');
    assert.deepEqual(trickyWords('कर्म सिर घर', 2).map((t) => t.word), ['कर्म', 'सिर']);
  });
});

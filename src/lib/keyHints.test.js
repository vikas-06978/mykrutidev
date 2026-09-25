import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { keyHints } from './keyHints.js';
import { FONTS, convert } from './fontMaps.js';
import { clusters } from './typing.js';

const KRUTI = FONTS['kruti-dev'].map;
const hints = keyHints(KRUTI);
const DOTTED = '◌';

/**
 * The whole reason this is derived rather than written: a chart that disagrees
 * with the engine teaches the wrong keyboard. Every row is checked by actually
 * running the conversion it claims.
 */
describe('every hint is what the converter really does', () => {
  test('each single key converts to exactly the letter shown', () => {
    for (const h of hints.singles) {
      const out = convert(h.key, 'kruti-dev', 'unicode', { keepEnglish: false });
      assert.equal(out, h.deva, `key "${h.key}" is charted as ${h.deva} but converts to ${out}`);
    }
  });

  test('each combo converts to exactly the letter shown', () => {
    for (const h of hints.combos) {
      const out = convert(h.key, 'kruti-dev', 'unicode', { keepEnglish: false });
      assert.equal(out, h.deva, `keys "${h.key}" are charted as ${h.deva} but convert to ${out}`);
    }
  });
});

describe('the chart covers what a learner needs', () => {
  const single = (k) => hints.singles.find((h) => h.key === k);
  const combo = (k) => hints.combos.find((h) => h.key === k);

  test('the everyday consonants are on it', () => {
    assert.equal(single('d').deva, 'क');
    assert.equal(single('r').deva, 'त');
    assert.equal(single('u').deva, 'न');
    assert.equal(single('i').deva, 'प');
    assert.equal(single('e').deva, 'म');
    assert.equal(single('j').deva, 'र');
  });

  /**
   * The "half consonant plus vertical bar" rule. There is no key for भ, थ, ध,
   * श, ष or ण, and nothing on the keyboard hints at that, so these are the rows
   * the chart exists for.
   */
  test('the two-key consonants are on it', () => {
    assert.equal(combo('Hk').deva, 'भ');
    assert.equal(combo('Fk').deva, 'थ');
    assert.equal(combo('/k').deva, 'ध');
    assert.equal(combo("'k").deva, 'श');
    assert.equal(combo('"k').deva, 'ष');
    assert.equal(combo('.k').deva, 'ण');
    assert.equal(combo('[k').deva, 'ख');
    assert.equal(combo('?k').deva, 'घ');
    assert.equal(combo('{k').deva, 'क्ष');
  });

  test('there are enough rows to be a chart rather than a sample', () => {
    assert.ok(hints.singles.length >= 80, `only ${hints.singles.length} single keys`);
    assert.ok(hints.combos.length >= 20, `only ${hints.combos.length} combos`);
  });

  test('nothing longer than two keys sneaks in', () => {
    for (const h of [...hints.singles, ...hints.combos]) {
      assert.ok(h.key.length <= 2, `"${h.key}" is too long for the chart`);
    }
  });
});

describe('the labels render', () => {
  test('a bare vowel sign is drawn on a dotted circle', () => {
    // `k` is the aa-matra. On its own it has no shape and would render as a
    // stray mark floating on the key cap.
    const aa = hints.singles.find((h) => h.key === 'k');
    assert.equal(aa.deva, 'ा');
    assert.equal(aa.label, DOTTED + 'ा');
  });

  test('a full letter is drawn as itself, with no circle', () => {
    assert.equal(hints.singles.find((h) => h.key === 'd').label, 'क');
  });

  test('every label shapes as a single cluster', () => {
    for (const h of [...hints.singles, ...hints.combos]) {
      assert.deepEqual(clusters(h.label), [h.label], `"${h.label}" would be split when rendered`);
    }
  });

  test('the dotted circle is only ever a label, never the letter', () => {
    for (const h of [...hints.singles, ...hints.combos]) {
      assert.ok(!h.deva.includes(DOTTED));
    }
  });
});

describe('the ordering follows the hand, not the alphabet', () => {
  test('lowercase first, then uppercase, then the symbols', () => {
    const rank = (k) => {
      const c = k[0];
      if (c >= 'a' && c <= 'z') return 0;
      if (c >= 'A' && c <= 'Z') return 1;
      if (c >= '0' && c <= '9') return 2;
      return 3;
    };
    const ranks = hints.singles.map((h) => rank(h.key));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'the groups are interleaved');
  });

  test('no key is charted twice', () => {
    const keys = hints.singles.map((h) => h.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('it works for any legacy map, not just Kruti Dev', () => {
  test('DevLys produces a chart of the same shape', () => {
    const dev = keyHints(FONTS.devlys.map);
    assert.equal(dev.singles.length, hints.singles.length);
    assert.equal(dev.combos.length, hints.combos.length);
  });

  test('an empty map produces an empty chart rather than throwing', () => {
    assert.deepEqual(keyHints({}), { singles: [], combos: [] });
  });
});

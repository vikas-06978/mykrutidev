import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_ROWS,
  EXTRA_ROWS,
  BOTTOM_KEYS,
  allKeys,
  NO_KRUTI_EQUIVALENT,
  VOWEL_MATRA,
  consonantBefore,
  pressKey,
  vowelLabel,
  vowelName,
} from './keyboard.js';
import { convert, isWellFormedDevanagari } from './fontMaps.js';
import { clusters } from './typing.js';

const ROWS = [...BASE_ROWS, ...EXTRA_ROWS];
const DOTTED = '◌';

describe('the layout is well formed', () => {
  test('every row has a label and keys', () => {
    for (const row of ROWS) {
      assert.ok(row.label, 'a row has no label');
      assert.ok(row.keys.length > 0, `${row.label} has no keys`);
    }
  });

  test('every key inserts something', () => {
    for (const k of allKeys()) {
      assert.ok(k.ins.length > 0, `${k.key} inserts nothing`);
      assert.ok(k.key.length > 0, 'a key has no label');
    }
  });

  /**
   * A duplicate is not a crash, it is a layout bug: the same letter printed on
   * two caps means one of them is in the wrong group, and the user who cannot
   * find ज़ looks in both places.
   */
  test('no character appears on two keys', () => {
    const seen = new Map();
    for (const k of allKeys()) {
      assert.ok(!seen.has(k.ins), `"${k.ins}" is on two keys`);
      seen.set(k.ins, k);
    }
  });
});

describe('combining marks are drawn on a dotted circle, inserted bare', () => {
  const marks = allKeys().filter((k) => k.key.startsWith(DOTTED));

  test('there are some', () => {
    // The everyday matras come from the smart vowel keys now; what is left as
    // a mark key is halant, anusvara, chandrabindu, visarga and the rare signs.
    assert.ok(marks.length >= 12, 'the sign keys went missing');
  });

  test('the dotted circle is never inserted into the text', () => {
    for (const k of allKeys()) {
      assert.ok(!k.ins.includes(DOTTED), `${k.name ?? k.key} would insert a dotted circle`);
    }
  });

  test('a mark key inserts exactly the mark from its own label', () => {
    for (const k of marks) {
      assert.equal(k.key, DOTTED + k.ins);
    }
  });

  test('every mark carries a name, since its cap is not readable aloud', () => {
    for (const k of marks) {
      assert.ok(k.name, `the mark "${k.ins}" has no accessible name`);
    }
  });

  /**
   * The reason the dotted circle exists at all: a bare matra has no shape of
   * its own, so clusters() sees the label as one unit and the browser draws the
   * mark attached to the circle instead of floating over the cap border.
   */
  test('a mark label is a single cluster, so it renders attached', () => {
    for (const k of marks) {
      assert.deepEqual(clusters(k.key), [k.key], `${k.name} does not shape as one cluster`);
    }
  });
});

describe('the letters are real, usable Devanagari', () => {
  /**
   * Consonants and independent vowels only. isWellFormedDevanagari() answers
   * "is this a sequence Devanagari permits", and it requires an actual letter
   * to be present - a lone digit or danda is not malformed, it simply is not a
   * letter, so feeding it in would assert something the function never claimed.
   */
  const letters = allKeys().filter(
    (k) => !k.key.startsWith(DOTTED) && /[ऄ-हक़-य़]/.test(k.ins),
  );

  test('there are some, and the conjunct caps are among them', () => {
    assert.ok(letters.length >= 40);
    assert.ok(letters.some((k) => k.ins === 'क्ष'));
  });

  test('each letter key is well formed on its own', () => {
    for (const k of letters) {
      assert.ok(isWellFormedDevanagari(k.ins), `"${k.ins}" is not well-formed Devanagari`);
    }
  });

  test('the vowel and consonant rows cover the varnamala', () => {
    const base = BASE_ROWS.flatMap((r) => r.keys.map((k) => k.ins)).join('');
    // The letters a school chart has, in the order it has them. If a row is
    // reordered or trimmed by accident, one of these goes missing.
    for (const ch of 'अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह') {
      assert.ok(base.includes(ch), `the layout is missing ${ch}`);
    }
  });

  test('the four everyday conjuncts have their own caps', () => {
    const base = BASE_ROWS.flatMap((r) => r.keys.map((k) => k.ins));
    for (const c of ['क्ष', 'त्र', 'ज्ञ', 'श्र']) {
      assert.ok(base.includes(c), `the layout is missing ${c}`);
    }
  });

  test('Devanagari digits are all present', () => {
    const base = BASE_ROWS.flatMap((r) => r.keys.map((k) => k.ins));
    for (const d of '०१२३४५६७८९') {
      assert.ok(base.includes(d), `the layout is missing digit ${d}`);
    }
  });
});

/**
 * The keyboard offers a Kruti Dev output, and the Kruti Dev map does not cover
 * every character the keyboard can type. That is a fact about the map, not a
 * bug in either - but it must never be a SILENT fact, because the failure mode
 * is someone pasting Devanagari into Word under a legacy font and getting a
 * blank. So the gap is written down, pinned here, and surfaced on the page.
 */
describe('the Kruti Dev gap is known, exact, and nothing more', () => {
  const toKruti = (s) => convert(s, 'unicode', 'kruti-dev', { keepEnglish: false });
  const untranslated = (s) => /[ऀ-ॿ]/.test(toKruti(s)) || toKruti(s).length === 0;

  test('every key that does not convert is on the list', () => {
    const missing = allKeys()
      .filter((k) => untranslated(k.ins))
      .map((k) => k.ins)
      .filter((ins) => !NO_KRUTI_EQUIVALENT.includes(ins));
    assert.deepEqual(
      missing,
      [],
      `these keys do not convert to Kruti Dev and are not declared: ${missing.join(' ')}`,
    );
  });

  test('every character on the list really is still missing from the map', () => {
    // Fails when someone fills a gap in fontMaps.js - the fix is to delete the
    // character from NO_KRUTI_EQUIVALENT, not to loosen this test.
    const fixed = NO_KRUTI_EQUIVALENT.filter((ch) => !untranslated(ch));
    assert.deepEqual(
      fixed,
      [],
      `the map now covers these - remove them from NO_KRUTI_EQUIVALENT: ${fixed.join(' ')}`,
    );
  });

  test('every declared character is actually on the keyboard', () => {
    const typable = new Set(allKeys().map((k) => k.ins));
    for (const ch of NO_KRUTI_EQUIVALENT) {
      assert.ok(typable.has(ch), `${JSON.stringify(ch)} is declared but is not a key`);
    }
  });

  /**
   * The gap has to stay out of the way of ordinary Hindi: every key on the
   * default layer, ङ and ञ included (Alt-code keys in Kruti Dev 010), converts.
   */
  test('nothing on the default layer is missing', () => {
    const onBase = BASE_ROWS.flatMap((r) => r.keys)
      .filter((k) => untranslated(k.ins))
      .map((k) => k.ins);
    assert.deepEqual(onBase, []);
  });

  /**
   * Why the gap is survivable: modern Hindi writes these sounds with an
   * anusvara, and those spellings convert. The Sanskrit conjunct spellings do
   * not - pinned here so the claim in keyboard.js stays true.
   */
  test('the anusvara spellings Hindi actually uses convert cleanly', () => {
    for (const word of ['अंक', 'पंच', 'संगीत']) {
      assert.doesNotMatch(toKruti(word), /[ऀ-ॿ]/, `${word} did not convert`);
    }
  });

  test('the conjunct spellings with ङ and ञ convert too, and read back', () => {
    for (const word of ['अङ्क', 'पञ्च']) {
      assert.doesNotMatch(toKruti(word), /[ऀ-ॿ]/, `${word} did not convert`);
      assert.equal(convert(toKruti(word), 'kruti-dev', 'unicode', { keepEnglish: false }), word);
    }
  });
});

describe('the default layer stands on its own', () => {
  /**
   * The extra layer is opt-in, so anything needed to write an ordinary Hindi
   * sentence has to be reachable without ever opening it - with matras typed
   * the way the page types them: through the smart vowel keys.
   */
  test('a plain sentence can be typed from the base rows and bottom row alone', () => {
    const onKeys = new Set([...BASE_ROWS.flatMap((r) => r.keys), ...BOTTOM_KEYS].map((k) => k.ins));
    onKeys.add(' ');
    const matraKey = Object.fromEntries(Object.entries(VOWEL_MATRA).map(([v, m]) => [m, v]));
    const sentence = 'हिंदी भारत की राजधानी भाषा है।';

    let text = '';
    for (const ch of sentence) {
      // A matra is typed with its vowel key; everything else with its own key.
      const key = onKeys.has(ch) ? ch : matraKey[ch];
      assert.ok(key && onKeys.has(key), `"${ch}" cannot be typed from the default layer`);
      text = pressKey(text, text.length, text.length, key).text;
    }
    assert.equal(text, sentence);
  });

  test('the danda is on the bottom row, since every sentence ends in one', () => {
    assert.ok(BOTTOM_KEYS.some((k) => k.ins === '।'));
  });

  test('halant, anusvara, chandrabindu and visarga sit with the consonants', () => {
    const consonants = BASE_ROWS.find((r) => r.label === 'व्यंजन').keys.map((k) => k.ins);
    for (const m of ['्', 'ं', 'ँ', 'ः']) assert.ok(consonants.includes(m), m);
  });

  test('there is one vowel row and no separate matra row', () => {
    const everyday = ['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ'];
    const base = BASE_ROWS.flatMap((r) => r.keys.map((k) => k.ins));
    for (const m of everyday) assert.ok(!base.includes(m), `${m} has its own key again`);
  });
});

// ---------------------------------------------------------------------------
// Smart vowels
// ---------------------------------------------------------------------------

describe('smart vowels', () => {
  /** Type `keys` one tap at a time into `start`, caret at the end. */
  const tap = (start, ...keys) =>
    keys.reduce((t, k) => pressKey(t, t.length, t.length, k).text, start);

  test('क + इ = कि', () => assert.equal(tap('', 'क', 'इ'), 'कि'));
  test('क + आ = का', () => assert.equal(tap('', 'क', 'आ'), 'का'));
  test('क + अ = क (the consonant already carries अ)', () => assert.equal(tap('', 'क', 'अ'), 'क'));
  test('space + इ = इ', () => assert.equal(tap('क ', 'इ'), 'क इ'));
  test('at the very start, a vowel is the full vowel', () => assert.equal(tap('', 'इ'), 'इ'));

  test('क़ + ई = क़ी, whether क़ is precomposed or क + nukta', () => {
    assert.equal(tap('क़', 'ई'), 'क़ी');
    assert.equal(tap('क़', 'ई'), 'क़ी');
    // The nukta key itself, on the second layer, then a vowel.
    assert.equal(tap('', 'क', '़', 'ई'), 'क़ी');
  });

  test('after a vowel, a matra, a halant or punctuation, a vowel is full', () => {
    assert.equal(tap('आ', 'इ'), 'आइ');
    assert.equal(tap('का', 'इ'), 'काइ');
    assert.equal(tap('क्', 'इ'), 'क्इ');
    assert.equal(tap('क।', 'इ'), 'क।इ');
  });

  test('a conjunct key counts as a consonant: क्ष + इ = क्षि', () => {
    assert.equal(tap('', 'क्ष', 'इ'), 'क्षि');
  });

  test('consonants and other keys are never changed', () => {
    assert.equal(tap('क', 'ख'), 'कख');
    assert.equal(tap('क', '्'), 'क्');
  });

  test('inserts at the cursor, in the middle of the text', () => {
    // कल with the caret after क: आ joins क, and ल stays after it.
    assert.deepEqual(pressKey('कल', 1, 1, 'आ'), { text: 'काल', caret: 2 });
    // At the start of the same word it is a full vowel.
    assert.deepEqual(pressKey('कल', 0, 0, 'आ'), { text: 'आकल', caret: 1 });
    // A consonant in the middle.
    assert.deepEqual(pressKey('कल', 1, 1, 'म'), { text: 'कमल', caret: 2 });
  });

  test('typing over a selection replaces it, and joins what is before it', () => {
    assert.deepEqual(pressKey('कखग', 1, 3, 'इ'), { text: 'कि', caret: 2 });
  });

  test('अ after a consonant leaves the caret where it was', () => {
    assert.deepEqual(pressKey('कल', 1, 1, 'अ'), { text: 'कल', caret: 1 });
  });

  test('consonantBefore', () => {
    assert.equal(consonantBefore('क', 1), true);
    assert.equal(consonantBefore('क़', 2), true);
    assert.equal(consonantBefore('कि', 2), false);
    assert.equal(consonantBefore('', 0), false);
    assert.equal(consonantBefore('a', 1), false);
  });

  test('the caps show what a tap will insert', () => {
    assert.equal(vowelLabel('इ', false), 'इ');
    assert.equal(vowelLabel('इ', true), '◌ि');
    assert.equal(vowelLabel('अ', true), 'अ');
    assert.equal(vowelName('इ', true), 'matra ि');
    assert.equal(vowelName('इ', false), 'इ');
  });

  test('every vowel on the vowel row has a matra rule', () => {
    const vowels = BASE_ROWS.find((r) => r.label === 'स्वर').keys.map((k) => k.ins);
    assert.equal(vowels.length, 11);
    for (const v of vowels) assert.ok(v in VOWEL_MATRA, v);
  });

  test('each matra composes with a consonant into one cluster', () => {
    for (const [v, m] of Object.entries(VOWEL_MATRA)) {
      if (!m) continue;
      assert.deepEqual(clusters(tap('', 'क', v)), [`क${m}`], v);
    }
  });
});

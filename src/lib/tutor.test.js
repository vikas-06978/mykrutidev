import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  unitsToKeys,
  unitsToText,
  unitKeyRuns,
  nextKey,
  unitAt,
  missedKeys,
  passed,
  summarise,
} from './tutor.js';
import {
  buildUnits,
  buildVerifiedUnits,
  wholeKeys,
  assertAligned,
  typeable,
} from './tutor.build.js';
import { NO_CAP } from './remington.js';
import { graphemes, clusters, clusterStates } from './typing.js';
import { PASSAGES } from './passages.js';

// ============================================================================
// Segmentation
// ============================================================================

describe('graphemes - Intl.Segmenter, corrected and pinned', () => {
  test('it is actually using Intl.Segmenter here', () => {
    // If this ever fails the rest of this block is testing the fallback twice.
    assert.equal(typeof Intl.Segmenter, 'function');
  });

  /**
   * The whole reason graphemes() post-processes the platform's answer. Before
   * Unicode 15.1 the standard did not join Indic conjuncts, so which result you
   * get depends on the ICU build inside the browser.
   */
  test('a conjunct is one grapheme, whatever this engine would say alone', () => {
    assert.deepEqual(graphemes('क्ष'), ['क्ष']);
    assert.deepEqual(graphemes('राष्ट्र'), ['रा', 'ष्ट्र']);
    assert.deepEqual(graphemes('प्रश्न'), ['प्र', 'श्न']);
  });

  test('the platform and the fallback agree, character for character', () => {
    for (const p of PASSAGES) {
      assert.deepEqual(
        graphemes(p.text),
        clusters(p.text),
        `${p.id}: Intl.Segmenter and the regex fallback disagree`,
      );
    }
  });

  test('matras stay attached', () => {
    assert.deepEqual(graphemes('हिंदी'), ['हिं', 'दी']);
    assert.deepEqual(graphemes('कौ'), ['कौ']);
  });

  test('rejoining reproduces the input', () => {
    for (const p of PASSAGES) {
      assert.equal(graphemes(p.text).join(''), p.text);
    }
  });

  test('empty input is empty output, not a crash', () => {
    assert.deepEqual(graphemes(''), []);
  });

  test('a trailing half letter keeps its halant and does not eat the void', () => {
    assert.deepEqual(graphemes('सत्'), ['स', 'त्']);
  });
});

// ============================================================================
// The alignment - the load-bearing claim of the whole tutor
// ============================================================================

describe('units align Devanagari with the keystrokes that type it', () => {
  /**
   * If this fails, the passage on screen and the keys the tutor is asking for
   * are two different sentences, and every green tick is a lie. It is checked
   * at build time too - buildVerifiedUnits() throws - but a failure here names
   * the passage rather than breaking a page.
   */
  test('per-akshara conversion equals converting the whole passage', () => {
    for (const p of PASSAGES) {
      const units = buildUnits(p.text);
      assert.equal(
        unitsToKeys(units),
        wholeKeys(p.text),
        `${p.id}: the pieces do not add up to the whole`,
      );
    }
  });

  test('the aksharas put the passage back together', () => {
    for (const p of PASSAGES) {
      assert.equal(unitsToText(buildUnits(p.text)), p.text);
    }
  });

  test('every unit types something', () => {
    for (const p of PASSAGES) {
      for (const u of buildUnits(p.text)) {
        assert.ok(u.keys.length > 0, `${p.id}: "${u.deva}" has no keystrokes`);
        assert.doesNotMatch(
          u.keys,
          /[ऀ-ॿ]/,
          `${p.id}: "${u.deva}" did not convert - it has no Kruti Dev keys`,
        );
      }
    }
  });

  test('the known pairs come out right', () => {
    const units = buildUnits('हिंदी भारत');
    assert.deepEqual(units.map((u) => u.deva), ['हिं', 'दी', ' ', 'भा', 'र', 'त']);
    assert.deepEqual(units.map((u) => u.keys), ['fga', 'nh', ' ', 'Hkk', 'j', 'r']);
  });

  test('a space is its own unit, typed with one keystroke', () => {
    const units = buildUnits('क ख');
    assert.equal(units[1].deva, ' ');
    assert.equal(units[1].keys, ' ');
  });

  test('buildVerifiedUnits passes real passages through', () => {
    for (const p of PASSAGES) {
      assert.doesNotThrow(() => buildVerifiedUnits(p.text, p.id));
    }
  });

  /**
   * Strings picked to break the alignment if anything could: conjuncts, the
   * reordered i-matra and reph, dedicated ligatures, nukta letters, the
   * characters with no Kruti key at all, and the longest real words on the
   * site. None of them misalign, which is the evidence behind the argument in
   * buildUnits() - and if a change to the engine ever breaks one, this says
   * which.
   */
  test('the awkward cases align too', () => {
    const awkward = [
      'कि', 'की', 'कर्म', 'क्ष', 'त्र', 'ज्ञ', 'श्र', 'कृ', 'क्र', 'प्र',
      'द्य', 'द्ध', 'ई', 'ऐ', 'आ', 'ओ', 'औ', 'अं', 'अँ', 'हूँ', 'कॉ',
      'ड़', 'ढ़', 'ज़', 'फ़', 'क़', 'ङ', 'ञ', 'अङ्क', 'पञ्च', 'ॐ', 'ऽ', '॰',
      'क्ष्म', 'त्त्व', 'द्व', 'ह्म', 'भ्र', 'ट्र', 'ड्र', 'ढ्र', 'ठ्र',
      '१२३', 'क।', 'क॥', 'नमस्ते', 'विद्यार्थी', 'राष्ट्रीय', 'कार्यालय',
      'परीक्षा', 'संस्कृत', 'कृपया', 'क्षेत्रीय', 'प्रश्न',
    ];
    for (const s of awkward) {
      assert.equal(unitsToKeys(buildUnits(s)), wholeKeys(s), `${s} does not align`);
    }
  });
});

describe('assertAligned - the build-time guard', () => {
  test('says nothing when the two agree', () => {
    assert.doesNotThrow(() => assertAligned('Hkkj', 'Hkkj', 'x'));
  });

  test('names the content that broke', () => {
    assert.throws(() => assertAligned('Hkkj', 'Hkkd', 'lesson-3'), /lesson-3/);
  });

  test('points at the keystroke where they diverge', () => {
    assert.throws(() => assertAligned('Hkkj', 'Hkkd', 'x'), /keystroke 3/);
  });

  test('a length difference is a divergence too', () => {
    assert.throws(() => assertAligned('Hkk', 'Hkkj', 'x'), /keystroke 3/);
  });

  test('the message shows both sides', () => {
    assert.throws(() => assertAligned('abX', 'abY', 'x'), /"X".*"Y"/);
  });
});

/**
 * The second guard inside buildVerifiedUnits, for the same reason the first one
 * is tested: every string the site uses is typeable, so nothing on the site ever
 * fires this. A guard that has never run is a guard that might throw a
 * TypeError instead of the sentence it promises, on the one day somebody needs
 * to read it - and this one is the difference between a build that says "rewrite
 * गाँव" and a tutor that highlights a key which is not on the keyboard.
 */
describe('buildVerifiedUnits rejects content it cannot point at', () => {
  // ऊ and ँ are the two NO_CAP characters: real Hindi, no US QWERTY cap.
  test('a passage needing a capless key does not build', () => {
    assert.throws(() => buildVerifiedUnits('गाँव', 'village'), /not on the keyboard/);
  });

  test('it names the content, so the build says which one to fix', () => {
    assert.throws(() => buildVerifiedUnits('गाँव', 'lesson-7'), /lesson-7/);
  });

  test('it names the offending key, not just the fact of one', () => {
    // The chandrabindu. Quoted, because the character is invisible in a
    // terminal and unquoted it would read as a blank space in the message.
    assert.throws(() => buildVerifiedUnits('गाँव', 'x'), /"¡"/);
  });

  test('it points at the fix rather than just refusing', () => {
    assert.throws(() => buildVerifiedUnits('गाँव', 'x'), /NO_CAP in remington\.js/);
  });

  test('ऊ is caught as well as the chandrabindu', () => {
    assert.throws(() => buildVerifiedUnits('ऊन', 'x'), /"Å"/);
  });

  test('both NO_CAP characters really are what makes it throw', () => {
    // Ties this test to remington.js: if a cap is ever found for one of them,
    // NO_CAP shrinks and this says so rather than passing on a stale list.
    const hindiNeeding = { '¡': 'हूँ', 'Å': 'ऊन' };
    assert.deepEqual(
      Object.keys(hindiNeeding),
      NO_CAP,
      'NO_CAP changed - this test has a case for each character in it',
    );
    for (const [ch, text] of Object.entries(hindiNeeding)) {
      assert.throws(
        () => buildVerifiedUnits(text, 'x'),
        new RegExp(`"\\${ch}"`),
        `${text} no longer blocks a build on ${ch}`,
      );
    }
  });

  test('ordinary Hindi is unaffected', () => {
    // गांव with the anusvara - the spelling the passages actually use, and the
    // reason refusing गाँव costs nothing.
    assert.doesNotThrow(() => buildVerifiedUnits('गांव भारत', 'x'));
  });
});

/**
 * The substitution itself. What it produces is checked against the converter in
 * remington.test.js; what is checked here is that it substitutes at all, only
 * where it should, and leaves everything else exactly as it found it.
 */
describe('typeable - rewriting off-keyboard spellings', () => {
  test('it leaves an already-typeable sequence untouched', () => {
    assert.equal(typeable('Hkkjr'), 'Hkkjr');
  });

  test('empty in, empty out', () => {
    assert.equal(typeable(''), '');
  });

  test('every occurrence is replaced, not just the first', () => {
    assert.equal(typeable('çç'), 'iziz');
  });

  test('running it twice changes nothing the second time', () => {
    // The replacements must not themselves contain a key that needs replacing,
    // or the substitution would depend on how many times it happened to run.
    const once = typeable('çÑØª');
    assert.equal(typeable(once), once);
  });

  test('it only touches the off-keyboard characters', () => {
    assert.equal(typeable('a ç b'), 'a iz b');
  });
});

// ============================================================================
// Stage 1 behaviour: what is wrong, what is merely unfinished
// ============================================================================

describe('a half-formed akshara is neutral until it is passed', () => {
  const units = buildUnits('भारत');
  const runs = unitKeyRuns(units);
  const expected = unitsToKeys(units);

  test('भारत is three aksharas, not four characters', () => {
    // भा र त - the unit is the akshara, which is why the display and the
    // keystrokes can be different lengths without anything drifting.
    assert.deepEqual(units.map((u) => u.deva), ['भा', 'र', 'त']);
  });

  test('the fixture is the awkward case', () => {
    // भा takes three keystrokes. The first two must not read as an error.
    assert.equal(runs[0], 'Hkk');
  });

  test('one keystroke in, the akshara is current and not wrong', () => {
    assert.equal(clusterStates(expected, 'H', runs)[0], 'current');
  });

  test('two keystrokes in, still current', () => {
    assert.equal(clusterStates(expected, 'Hk', runs)[0], 'current');
  });

  test('completed, it goes green', () => {
    assert.equal(clusterStates(expected, 'Hkk', runs)[0], 'correct');
  });

  test('a genuinely wrong key marks it immediately', () => {
    assert.equal(clusterStates(expected, 'd', runs)[0], 'wrong');
  });

  test('only the akshara at fault turns red', () => {
    assert.deepEqual(clusterStates(expected, 'Hkkd', runs), [
      'correct',
      'wrong',
      'current',
    ]);
  });

  test('backing out of a mistake clears it', () => {
    assert.deepEqual(clusterStates(expected, 'Hkk', runs), [
      'correct',
      'current',
      'pending',
    ]);
  });
});

describe('nextKey - what to light up', () => {
  const expected = unitsToKeys(buildUnits('भारत'));

  test('at the start it is the first keystroke', () => {
    assert.equal(nextKey(expected, ''), 'H');
  });

  test('it advances one keystroke at a time, inside an akshara', () => {
    assert.equal(nextKey(expected, 'H'), 'k');
    assert.equal(nextKey(expected, 'Hk'), 'k');
    assert.equal(nextKey(expected, 'Hkk'), 'j');
  });

  /**
   * After a mistake the tutor keeps pointing at the key it wanted. Re-planning
   * around the error would move the finger guide onto whatever came next in a
   * sentence the user is no longer typing.
   */
  test('a wrong keystroke does not move the target', () => {
    assert.equal(nextKey(expected, 'd'), 'k');
    assert.equal(nextKey(expected, 'H'), 'k');
  });

  test('at the end there is nothing to press', () => {
    assert.equal(nextKey(expected, expected), '');
    assert.equal(nextKey(expected, expected + 'xx'), '');
  });
});

describe('unitAt - which akshara the caret is in', () => {
  const runs = ['Hkk', 'j', 'r'];

  test('starts on the first', () => {
    assert.equal(unitAt(runs, 0), 0);
  });

  test('stays put while an akshara is unfinished', () => {
    assert.equal(unitAt(runs, 1), 0);
    assert.equal(unitAt(runs, 2), 0);
  });

  test('moves on when it is complete', () => {
    assert.equal(unitAt(runs, 3), 1);
    assert.equal(unitAt(runs, 4), 2);
  });

  test('past the end it reports done', () => {
    assert.equal(unitAt(runs, 5), 3);
    assert.equal(unitAt(runs, 99), 3);
  });
});

// ============================================================================
// Result card
// ============================================================================

describe('missedKeys - what to practise next', () => {
  test('counts the key that was wanted, not the one that was hit', () => {
    // Wanted `abc`, typed `axc`: the miss is on `b`.
    assert.deepEqual(missedKeys('abc', 'axc'), [{ key: 'b', count: 1 }]);
  });

  test('most-missed first', () => {
    assert.deepEqual(missedKeys('aaabb', 'xxxyb'), [
      { key: 'a', count: 3 },
      { key: 'b', count: 1 },
    ]);
  });

  test('a clean run has nothing to report', () => {
    assert.deepEqual(missedKeys('abc', 'abc'), []);
  });

  test('untyped keys are not misses', () => {
    assert.deepEqual(missedKeys('abcdef', 'abc'), []);
  });

  test('ties break predictably rather than by insertion order', () => {
    assert.deepEqual(missedKeys('ab', 'xy'), [
      { key: 'a', count: 1 },
      { key: 'b', count: 1 },
    ]);
  });
});

describe('summarise', () => {
  test('a perfect minute', () => {
    const s = summarise('x'.repeat(250), 'x'.repeat(250), 60_000);
    assert.equal(s.net, 50);
    assert.equal(s.gross, 50);
    assert.equal(s.accuracy, 100);
    assert.equal(s.complete, true);
    assert.equal(s.wrong, 0);
  });

  test('gross outruns net when the typing is dirty', () => {
    const s = summarise('abcd'.repeat(50), 'abxd'.repeat(50), 60_000);
    assert.ok(s.gross > s.net);
    assert.equal(s.wrong, 50);
    assert.equal(Math.round(s.accuracy), 75);
  });

  test('overrun counts against you', () => {
    assert.equal(summarise('ab', 'abcd', 60_000).wrong, 2);
  });

  test('an untouched attempt reads 100%, not 0%', () => {
    const s = summarise('abc', '', 0);
    assert.equal(s.accuracy, 100);
    assert.equal(s.net, 0);
    assert.equal(s.complete, false);
  });

  test('it agrees with a direct count on the same strings', () => {
    // summarise() and score() are two code paths over the same question, and
    // the result card must not disagree with the number that was on screen a
    // second earlier.
    const expected = unitsToKeys(buildUnits(PASSAGES[0].text));
    const typed = expected.slice(0, 200).replace(/k/g, 'x');
    const s = summarise(expected, typed, 30_000);
    let correct = 0;
    for (let i = 0; i < typed.length; i++) if (expected[i] === typed[i]) correct++;
    assert.equal(s.correct, correct);
  });
});

describe('passed - accuracy is the gate, never speed', () => {
  test('clean enough unlocks', () => {
    assert.equal(passed({ typed: 100, accuracy: 96 }, 95), true);
    assert.equal(passed({ typed: 100, accuracy: 95 }, 95), true);
  });

  test('sloppy does not', () => {
    assert.equal(passed({ typed: 100, accuracy: 94.9 }, 95), false);
  });

  test('typing nothing is not a pass, however good the ratio looks', () => {
    // An untouched attempt reports 100% accuracy, so the guard matters.
    assert.equal(passed({ typed: 0, accuracy: 100 }, 95), false);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  clusters,
  clusterStates,
  graphemes,
  score,
  netWpm,
  grossWpm,
  accuracy,
  formatClock,
} from './typing.js';

// ============================================================================
// Segmentation
// ============================================================================
//
// The rule these tests exist to protect: a cluster is the unit the highlighter
// wraps in a <span>, so anything that must be SHAPED together must come back
// together. Split क and ि apart and the browser draws ◌ि beside the letter.

describe('clusters - the unit the highlighter may safely wrap', () => {
  test('rejoining always reproduces the input exactly', () => {
    const samples = [
      'हिंदी भारत की राजधानी है।',
      'परीक्षा का परिणाम',
      'राष्ट्रीय शिक्षा नीति',
      'कृपया प्रश्न पत्र देखें।',
      'fgUnh Hkkjr dh jkt/kkuh gSA',
      'mixed हिंदी and English 123',
      '',
      ' ',
    ];
    for (const s of samples) {
      assert.equal(clusters(s).join(''), s, `did not rejoin: ${s}`);
    }
  });

  test('a matra never leaves its consonant', () => {
    assert.deepEqual(clusters('कि'), ['कि']);
    assert.deepEqual(clusters('की'), ['की']);
    assert.deepEqual(clusters('कौ'), ['कौ']);
    assert.deepEqual(clusters('हिंदी'), ['हिं', 'दी']);
  });

  test('a conjunct is one cluster, not its pieces', () => {
    // क् + ष is drawn as a single ligature. Two spans would split the ligature.
    assert.deepEqual(clusters('क्ष'), ['क्ष']);
    assert.deepEqual(clusters('त्र'), ['त्र']);
    assert.deepEqual(clusters('राष्ट्र'), ['रा', 'ष्ट्र']);
    assert.deepEqual(clusters('प्रश्न'), ['प्र', 'श्न']);
  });

  test('a half letter at the end keeps its halant', () => {
    assert.deepEqual(clusters('क्'), ['क्']);
    assert.deepEqual(clusters('सत्'), ['स', 'त्']);
  });

  test('the reph rides on the cluster it belongs to', () => {
    assert.deepEqual(clusters('कर्म'), ['क', 'र्म']);
  });

  test('anusvara, visarga and chandrabindu attach', () => {
    assert.deepEqual(clusters('अं'), ['अं']);
    assert.deepEqual(clusters('अः'), ['अः']);
    assert.deepEqual(clusters('हूँ'), ['हूँ']);
  });

  test('a nukta letter stays whole', () => {
    // ड़ typed as ड + nukta is two codepoints and one letter.
    assert.deepEqual(clusters('ड़'), ['ड़']);
  });

  test('ASCII is one cluster per character - which is Kruti Dev mode', () => {
    assert.deepEqual(clusters('Hkkjr'), ['H', 'k', 'k', 'j', 'r']);
    assert.deepEqual(clusters('a b'), ['a', ' ', 'b']);
  });

  test('spaces and punctuation stand alone', () => {
    assert.deepEqual(clusters('क ख।'), ['क', ' ', 'ख', '।']);
  });
});

/**
 * graphemes() prefers Intl.Segmenter and falls back to clusters() when it is
 * missing or misbehaves. Node and every browser the site supports have it, so
 * the fallback never runs here - which is exactly the problem: it is the path
 * that runs on the one old device that cannot do better, and nothing else in
 * the suite has ever executed it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS USES A CHILD PROCESS
 *
 * The Segmenter is built once into a module-level variable, so stubbing
 * Intl.Segmenter after typing.js has loaded changes nothing, and stubbing it
 * before would leave every other test in this file testing the fallback by
 * accident.
 *
 * The obvious way round that is to re-import under a fresh URL
 * (`./typing.js?absent`) to defeat the module cache. Do not: node's coverage
 * reporter keys on the URL but collapses the rows by path, so the extra
 * instances displace the real one and typing.js drops from 98% to 66% -
 * reporting five unrelated regions as uncovered. Losing the coverage report is
 * a worse trade than the four lines it would light up.
 *
 * A child process has its own module registry and its own globals, and is not
 * measured, so it can stub freely. The assertions live in the child; a failed
 * assert exits non-zero and execFileSync turns that into a failed test here.
 *
 * The cost of the child is that lines 135-136 and 155-156 still READ as
 * uncovered. They are tested - just not in this process.
 * ---------------------------------------------------------------------------
 */
describe('graphemes falls back when Intl.Segmenter cannot be used', () => {
  const MODULE = new URL('./typing.js', import.meta.url).href;
  const SAMPLES = ['राष्ट्र', 'हिंदी भारत', 'क्षत्रिय', 'प्रश्न पत्र', 'सत्', ''];

  /**
   * Run `stub` (a line of JS that breaks Intl.Segmenter) in a fresh node, then
   * assert graphemes() still matches clusters() on every sample.
   */
  const inChildWith = (stub) => {
    const src = `
      import assert from 'node:assert/strict';
      ${stub}
      const { graphemes, clusters } = await import(${JSON.stringify(MODULE)});
      for (const s of ${JSON.stringify(SAMPLES)}) {
        assert.deepEqual(graphemes(s), clusters(s), 'fallback differs on ' + s);
      }
      // And it is really the fallback that ran, not a Segmenter that survived.
      assert.deepEqual(graphemes('राष्ट्र'), ['रा', 'ष्ट्र']);
    `;
    return execFileSync(process.execPath, ['--input-type=module', '-e', src], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };

  test('with no Intl.Segmenter at all, it uses the regex', () => {
    assert.doesNotThrow(() => inChildWith('delete Intl.Segmenter;'));
  });

  test('a Segmenter whose constructor throws is survived, not propagated', () => {
    // Some older engines expose the name and then reject the 'hi' locale.
    assert.doesNotThrow(() =>
      inChildWith(`Intl.Segmenter = function () { throw new Error('locale'); };`),
    );
  });

  test('a Segmenter that throws mid-segmentation is survived too', () => {
    assert.doesNotThrow(() =>
      inChildWith(`Intl.Segmenter = class { segment() { throw new Error('boom'); } };`),
    );
  });

  test('the child would actually fail if the fallback were broken', () => {
    // Guards the harness itself: without this, a child that silently did
    // nothing would make all three tests above pass forever.
    assert.throws(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        assert.equal(1, 2);
      `], { stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  test('this process still has a working Segmenter', () => {
    // If a stub ever leaks out of the child and into here, every other test in
    // the file quietly becomes a test of the fallback.
    assert.equal(typeof Intl.Segmenter, 'function');
    assert.deepEqual(graphemes('राष्ट्र'), ['रा', 'ष्ट्र']);
  });
});

// ============================================================================
// Scoring
// ============================================================================

describe('score - positional, the way a typing test has to be', () => {
  test('a perfect run', () => {
    const s = score('भारत', 'भारत');
    assert.equal(s.wrong, 0);
    assert.equal(s.correct, 'भारत'.length);
    assert.equal(s.finished, true);
  });

  test('nothing typed yet', () => {
    const s = score('भारत', '');
    assert.deepEqual(s, { correct: 0, wrong: 0, typed: 0, finished: false });
  });

  test('a partial run is not finished', () => {
    const s = score('भारत', 'भा');
    assert.equal(s.wrong, 0);
    assert.equal(s.finished, false);
  });

  test('one wrong character counts once', () => {
    const s = score('कमल', 'कपल');
    assert.equal(s.wrong, 1);
    assert.equal(s.correct, 2);
    assert.equal(s.finished, false);
  });

  /**
   * The consequence of refusing to realign: an inserted character throws off
   * everything after it. This is deliberate - see the note on score(). It is
   * what every typing test does and what the user can predict.
   */
  test('an inserted character misaligns the rest, and that is intended', () => {
    const s = score('abcd', 'axbcd');
    assert.equal(s.correct, 1);
    assert.ok(s.wrong >= 3);
  });

  test('typing past the end is counted as error, not ignored', () => {
    const s = score('ab', 'abcd');
    assert.equal(s.correct, 2);
    assert.equal(s.wrong, 2);
    assert.equal(s.finished, false);
  });

  test('backspacing out of a mistake restores a clean run', () => {
    assert.equal(score('भारत', 'भाx').wrong, 1);
    assert.equal(score('भारत', 'भा').wrong, 0);
  });
});

describe('the numbers on the stat row', () => {
  test('WPM is five keystrokes to the word', () => {
    // 250 correct characters in one minute = 50 words.
    assert.equal(netWpm(250, 60_000), 50);
    assert.equal(grossWpm(250, 60_000), 50);
  });

  test('net WPM counts only what was typed correctly', () => {
    assert.equal(netWpm(200, 60_000), 40);
    assert.equal(grossWpm(250, 60_000), 50);
  });

  test('half a minute doubles the rate', () => {
    assert.equal(netWpm(125, 30_000), 50);
  });

  test('no elapsed time cannot divide by zero', () => {
    assert.equal(netWpm(10, 0), 0);
    assert.equal(grossWpm(10, 0), 0);
  });

  test('accuracy is correct over typed', () => {
    assert.equal(accuracy(90, 100), 90);
    assert.equal(accuracy(0, 10), 0);
  });

  test('an untouched test reads 100%, not 0%', () => {
    // Opening the page must not greet the user with "Accuracy 0%".
    assert.equal(accuracy(0, 0), 100);
  });

  test('the clock pads seconds', () => {
    assert.equal(formatClock(60_000), '1:00');
    assert.equal(formatClock(9_000), '0:09');
    assert.equal(formatClock(305_000), '5:05');
    assert.equal(formatClock(-100), '0:00');
  });
});

// ============================================================================
// Highlighting
// ============================================================================

describe('clusterStates - what each span is coloured', () => {
  const target = 'कमल';

  test('nothing typed: the first cluster is where the caret is', () => {
    assert.deepEqual(clusterStates(target, ''), ['current', 'pending', 'pending']);
  });

  test('correct so far', () => {
    assert.deepEqual(clusterStates(target, 'क'), ['correct', 'current', 'pending']);
  });

  test('a wrong character marks exactly its own cluster', () => {
    assert.deepEqual(clusterStates(target, 'ख'), ['wrong', 'current', 'pending']);
  });

  test('completed', () => {
    assert.deepEqual(clusterStates(target, 'कमल'), ['correct', 'correct', 'correct']);
  });

  /**
   * The case the whole cluster design exists for. कि is क + ि: after typing
   * only क the cluster is half done and still correct, and it must not flash
   * red for the moment before the matra arrives.
   */
  test('a half-typed cluster is current, not wrong', () => {
    const states = clusterStates('किताब', 'क');
    assert.equal(states[0], 'current');
  });

  test('a half-typed cluster goes wrong as soon as it is wrong', () => {
    const states = clusterStates('किताब', 'ख');
    assert.equal(states[0], 'wrong');
  });

  test('exactly one cluster is ever current', () => {
    for (const typed of ['', 'क', 'कि', 'किता', 'किताब']) {
      const n = clusterStates('किताब', typed).filter((s) => s === 'current').length;
      assert.ok(n <= 1, `${n} current clusters for "${typed}"`);
    }
  });

  test('there is one state per cluster, always', () => {
    const t = 'राष्ट्रीय शिक्षा नीति';
    assert.equal(clusterStates(t, 'राष्ट्री').length, clusters(t).length);
  });
});

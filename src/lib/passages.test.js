import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { PASSAGES, DURATIONS, JOINER, planPassages } from './passages.js';
import { convert, isWellFormedDevanagari } from './fontMaps.js';

/**
 * The gate on new passages.
 *
 * Kruti Dev mode shows the passage as legacy keystrokes rendered in the Kruti
 * Dev font, and that text is produced by convert() at build time. If a passage
 * contains a character the map does not cover, the conversion silently drops or
 * mangles it and the user practises against text that is not the paragraph they
 * are reading. So every passage has to survive the full round trip before it
 * can ship.
 *
 * `keepEnglish: false` on both legs, because this is a test of the MAP and not
 * of the English-word heuristic. Hindi ने converts to the keys `us`, which is
 * an English word, so the return leg would otherwise protect it and the
 * round trip would fail on a passage that is perfectly fine. The forward
 * direction - the only one the page actually runs - is unaffected either way,
 * since a passage contains no Latin at all (asserted below).
 */
const both = { keepEnglish: false };

describe('every passage survives Unicode -> Kruti Dev -> Unicode', () => {
  for (const p of PASSAGES) {
    test(`${p.id} round-trips unchanged`, () => {
      const kruti = convert(p.text, 'unicode', 'kruti-dev', both);
      const back = convert(kruti, 'kruti-dev', 'unicode', both);
      assert.equal(back, p.text);
    });
  }

  test('no passage converts to something empty', () => {
    for (const p of PASSAGES) {
      const kruti = convert(p.text, 'unicode', 'kruti-dev', both);
      assert.ok(kruti.length > 0, `${p.id} converted to nothing`);
      // Legacy output is ASCII by definition; a stray Devanagari character
      // means a letter fell through the map untranslated.
      assert.doesNotMatch(kruti, /[ऀ-ॿ]/, `${p.id} left Devanagari in the Kruti output`);
    }
  });
});

describe('the passages themselves', () => {
  test('ids and titles are unique', () => {
    assert.equal(new Set(PASSAGES.map((p) => p.id)).size, PASSAGES.length);
    assert.equal(new Set(PASSAGES.map((p) => p.title)).size, PASSAGES.length);
  });

  test('each is real Devanagari, well formed', () => {
    for (const p of PASSAGES) {
      assert.match(p.text, /[ऀ-ॿ]/, `${p.id} has no Devanagari`);
      assert.ok(
        isWellFormedDevanagari(p.text),
        `${p.id} is not well-formed Devanagari - check matras and halants`,
      );
    }
  });

  test('none is long enough to be a wall of text, none too short to be useful', () => {
    for (const p of PASSAGES) {
      assert.ok(p.text.length >= 300, `${p.id} is only ${p.text.length} chars`);
      assert.ok(p.text.length <= 1200, `${p.id} is ${p.text.length} chars, too long to read`);
    }
  });

  test('no leading, trailing or doubled whitespace', () => {
    for (const p of PASSAGES) {
      assert.equal(p.text, p.text.trim(), `${p.id} has edge whitespace`);
      assert.doesNotMatch(p.text, /\s\s|\n|\t/, `${p.id} has doubled or vertical whitespace`);
    }
  });

  test('each ends on a full stop', () => {
    for (const p of PASSAGES) {
      assert.match(p.text, /।$/, `${p.id} does not end with a danda`);
    }
  });

  /**
   * Keeps the keepEnglish question above moot, and keeps the test honest: a
   * passage with an English word in it would be practising two keyboards at
   * once, which is not what either mode is for.
   */
  test('no Latin letters - this is a Hindi typing test', () => {
    for (const p of PASSAGES) {
      assert.doesNotMatch(p.text, /[A-Za-z]/, `${p.id} contains Latin letters`);
    }
  });
});

/**
 * Kruti Dev targets are assembled by joining the per-passage conversions, not
 * by converting the joined text - the build does not know which passages a
 * given visitor will be given. That is only safe if the two are the same
 * string, which is what this checks. If it ever fails, the page has to convert
 * the whole queued target at runtime instead.
 */
describe('joining converted passages equals converting the joined passages', () => {
  test('for every adjacent pair', () => {
    for (const a of PASSAGES) {
      for (const b of PASSAGES) {
        if (a === b) continue;
        const joinedThenConverted = convert(a.text + JOINER + b.text, 'unicode', 'kruti-dev');
        const convertedThenJoined =
          convert(a.text, 'unicode', 'kruti-dev') +
          JOINER +
          convert(b.text, 'unicode', 'kruti-dev');
        assert.equal(joinedThenConverted, convertedThenJoined, `${a.id} + ${b.id}`);
      }
    }
  });
});

describe('planPassages - queueing enough text for the clock', () => {
  const pool = Array.from({ length: 4 }, () => 500);
  // Deterministic "shuffle": always picks the last remaining index.
  const norandom = () => 0;

  test('a 1-minute test still gets a paragraph', () => {
    assert.ok(planPassages(60, pool, norandom).length >= 1);
  });

  test('a longer test queues more text', () => {
    const short = planPassages(60, pool, norandom);
    const long = planPassages(300, pool, norandom);
    assert.ok(long.length > short.length, 'a 5-minute test queued no more than a 1-minute one');
  });

  test('every index is a real passage', () => {
    const lengths = PASSAGES.map((p) => p.text.length);
    for (const i of planPassages(300, lengths)) {
      assert.ok(PASSAGES[i], `index ${i} is not a passage`);
    }
  });

  /**
   * Guards the bundling note on planPassages: if `lengths` ever regains a
   * default that reads PASSAGES, the passage text is pinned into the typing
   * test's client bundle alongside the copy it already gets as JSON.
   */
  test('it does not reach for the passages itself', () => {
    assert.equal(planPassages.length, 2, 'planPassages grew or lost a required parameter');
    assert.doesNotMatch(
      planPassages.toString(),
      /PASSAGES/,
      'planPassages references PASSAGES - that ships every passage twice',
    );
  });

  test('no passage repeats until the pool has been used up', () => {
    const order = planPassages(300, pool, norandom);
    const firstPass = order.slice(0, Math.min(order.length, pool.length));
    assert.equal(new Set(firstPass).size, firstPass.length, 'a passage repeated early');
  });

  test('an empty pool returns nothing rather than looping forever', () => {
    assert.deepEqual(planPassages(300, [], norandom), []);
  });

  /**
   * The queue must be at least as long as it promised, exactly - not one
   * character less.
   *
   * The planner counted a joiner for every passage including the first, so the
   * length it measured was one more than the string the caller could actually
   * build. A queue that stopped precisely on the target therefore came back a
   * character short. It only showed up when a pool happened to land on the
   * boundary, which is the kind of bug that waits for a content change.
   */
  test('what the planner counts is what the caller can build', () => {
    const lengths = [10, 20, 30, 40];
    for (let seconds = 60; seconds <= 1800; seconds += 60) {
      const order = planPassages(seconds, lengths, norandom);
      const built =
        order.reduce((n, i) => n + lengths[i], 0) + (order.length - 1) * JOINER.length;
      const needed = Math.ceil((seconds / 60) * 300);
      assert.ok(
        built >= needed,
        `a ${seconds / 60}-minute queue builds ${built} characters but promised ${needed}`,
      );
    }
  });

  test('it does not queue a whole extra passage to cover the joiner', () => {
    // The fix must not overshoot either: dropping one passage has to leave the
    // queue genuinely too short.
    const lengths = [300];
    const order = planPassages(300, lengths, norandom);
    const oneFewer = (order.length - 1) * 300 + (order.length - 2) * JOINER.length;
    assert.ok(oneFewer < 1500, 'the queue carries a passage it does not need');
  });

  /**
   * The real thing, in both scripts, the way a caller must build it: the
   * planner is given the lengths of the text ABOUT TO BE TYPED, so a queue is
   * sized against Kruti Dev keystrokes when that is what the user will type.
   */
  describe('sized for a fast typist, in whichever mode is being typed', () => {
    const forms = {
      unicode: PASSAGES.map((p) => p.text),
      'kruti-dev': PASSAGES.map((p) => convert(p.text, 'unicode', 'kruti-dev')),
    };

    for (const [mode, texts] of Object.entries(forms)) {
      for (const { value, label } of DURATIONS) {
        test(`${label} in ${mode} mode queues enough text`, () => {
          const order = planPassages(value, texts.map((t) => t.length));
          const target = order.map((i) => texts[i]).join(JOINER);
          // 60 WPM * 5 chars * minutes - the speed the planner sizes for, well
          // above any exam requirement, so nobody can type past the end.
          assert.ok(
            target.length >= (value / 60) * 300,
            `${target.length} characters for a ${value}s test`,
          );
        });
      }
    }

    test('the two modes really are different lengths', () => {
      // Which is why the planner takes lengths rather than reaching into a
      // passage object for "the" text.
      const a = forms.unicode.map((t) => t.length);
      const b = forms['kruti-dev'].map((t) => t.length);
      assert.notDeepEqual(a, b);
    });
  });
});

describe('the duration choices', () => {
  test('are the ones the page offers, shortest first', () => {
    assert.deepEqual(
      DURATIONS.map((d) => d.value),
      [60, 120, 180, 300, 600, 900, 1800, 3600, 7200],
    );
  });

  test('every one is a whole number of minutes, and says so', () => {
    // Minutes below an hour, hours above it: "2 hr" is the number printed on
    // an exam notification, where "120 min" is arithmetic the candidate has to
    // do before they can tell whether this is the length they came to sit.
    for (const d of DURATIONS) {
      assert.equal(d.value % 60, 0, `${d.label} is not a whole number of minutes`);
      const expected =
        d.value < 3600 ? `${d.value / 60} min` : `${d.value / 3600} hr`;
      assert.equal(d.label, expected, `${d.label} does not match its own length`);
    }
  });

  test('the hour-long options really are whole hours', () => {
    for (const d of DURATIONS.filter((x) => x.label.endsWith('hr'))) {
      assert.equal(d.value % 3600, 0, `${d.label} is not a whole number of hours`);
    }
  });

  test('the labels stay short enough for one row of chips', () => {
    for (const d of DURATIONS) {
      assert.ok(d.label.length <= 7, `"${d.label}" is too long for a chip`);
    }
  });

  /**
   * The planner reshuffles and repeats once the pool runs dry. Past a certain
   * length that is unavoidable - a 2-hour test needs ~36,000 keystrokes and
   * the whole pool is a fraction of that - so the rule cannot be a fixed count
   * any more. What it can be is OPTIMAL: given a pool this size, a test this
   * long must repeat as few times as arithmetic allows, plus one for the
   * shuffle landing badly.
   *
   * That still catches the failure this test was written for. A planner that
   * cycled instead of shuffling, or one that forgot to exhaust the bag before
   * repeating, would show one paragraph far more often than the floor.
   */
  test('no test repeats a passage more than the pool forces it to', () => {
    const lengths = PASSAGES.map(
      (p) => convert(p.text, 'unicode', 'kruti-dev').length,
    );
    const pool = lengths.reduce((a, b) => a + b, 0);

    for (const { value, label } of DURATIONS) {
      const order = planPassages(value, lengths);
      const counts = new Map();
      for (const i of order) counts.set(i, (counts.get(i) ?? 0) + 1);
      const worst = Math.max(...counts.values());

      // The fewest passes over the pool that could possibly cover the test.
      const floor = Math.max(1, Math.ceil(((value / 60) * 300) / pool));
      assert.ok(
        worst <= floor + 1,
        `a ${label} test shows one passage ${worst} times; ${floor} is the floor`,
      );
    }
  });

  /**
   * The short tests are the ones nearly everybody sits, and for those the pool
   * is big enough that no repetition should happen at all.
   */
  test('nothing up to fifteen minutes repeats a passage', () => {
    const lengths = PASSAGES.map(
      (p) => convert(p.text, 'unicode', 'kruti-dev').length,
    );
    for (const { value, label } of DURATIONS.filter((d) => d.value <= 900)) {
      const order = planPassages(value, lengths);
      assert.equal(
        new Set(order).size,
        order.length,
        `a ${label} test repeats a passage`,
      );
    }
  });
});

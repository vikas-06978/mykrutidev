import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVELS,
  DRILL_JOINER,
  levelText,
  levelById,
  levelIndex,
  isUnlocked,
  nextLevel,
} from './lessons.js';
import { wholeKeys, buildUnits, buildVerifiedUnits } from './tutor.build.js';
import { unitsToKeys } from './tutor.js';
import { locate, untypeable } from './remington.js';

/**
 * The load-bearing test of the whole ladder.
 *
 * A level means "these keys". A drill that reaches past them is not a harder
 * drill, it is a broken lesson: the tutor would point at a key the learner has
 * never been shown, on the level whose entire purpose is to introduce keys one
 * row at a time.
 *
 * The failure message names the level, the word and the key, because that is
 * what you need in order to swap the word - which is the fix. Widening `keys`
 * to admit the word is not the fix; `keys` is what the level means.
 */
describe('every drill stays inside the keys its level has taught', () => {
  for (const level of LEVELS) {
    const allowed = new Set([...level.keys]);

    test(`${level.id}`, () => {
      for (const drill of level.drills) {
        const keys = wholeKeys(drill);
        const over = [...new Set([...keys])].filter((ch) => !allowed.has(ch));
        if (over.length === 0) continue;

        // Name the word, not just the character.
        const words = drill
          .split(' ')
          .filter((w) => [...wholeKeys(w)].some((c) => over.includes(c)));

        assert.fail(
          `${level.id}: "${words.join(' ')}" needs ${over
            .map((c) => JSON.stringify(c))
            .join(' ')}, which this level has not taught`,
        );
      }
    });
  }
});

describe('every drill can actually be typed and shown', () => {
  test('every keystroke is on the keyboard', () => {
    for (const level of LEVELS) {
      for (const drill of level.drills) {
        assert.deepEqual(
          untypeable(wholeKeys(drill)),
          [],
          `${level.id}: "${drill}" needs a key with no cap`,
        );
      }
    }
  });

  test('every keystroke has a finger', () => {
    for (const level of LEVELS) {
      for (const ch of new Set([...wholeKeys(levelText(level))])) {
        assert.ok(locate(ch)?.finger, `${level.id}: ${JSON.stringify(ch)} has no finger`);
      }
    }
  });

  /**
   * The same alignment the passages need: what is drawn on screen and what the
   * tutor asks for must be the same sentence.
   */
  test('aksharas and keystrokes align', () => {
    for (const level of LEVELS) {
      for (const drill of level.drills) {
        assert.equal(
          unitsToKeys(buildUnits(drill)),
          wholeKeys(drill),
          `${level.id}: "${drill}" does not align`,
        );
      }
    }
  });

  test('the whole level builds through the verified path', () => {
    for (const level of LEVELS) {
      assert.doesNotThrow(
        () => buildVerifiedUnits(levelText(level), level.id),
        `${level.id} does not build`,
      );
    }
  });

  test('every drill converts to something, and to no Devanagari', () => {
    for (const level of LEVELS) {
      for (const drill of level.drills) {
        const keys = wholeKeys(drill);
        assert.ok(keys.length > 0, `${level.id}: "${drill}" converts to nothing`);
        assert.doesNotMatch(
          keys,
          /[ऀ-ॿ]/,
          `${level.id}: "${drill}" has a letter the map does not cover`,
        );
      }
    }
  });
});

describe('the ladder is a ladder', () => {
  test('ids are unique', () => {
    assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  });

  test('there are enough levels to be a course', () => {
    assert.ok(LEVELS.length >= 6, `only ${LEVELS.length} levels`);
  });

  /**
   * Cumulative: a level may never take away a key an earlier one taught, or a
   * learner would reach level 5 and find level 2's letters rejected.
   */
  test('each level keeps every key the one before it had', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const before = new Set([...LEVELS[i - 1].keys]);
      const now = new Set([...LEVELS[i].keys]);
      for (const ch of before) {
        assert.ok(
          now.has(ch),
          `${LEVELS[i].id} dropped ${JSON.stringify(ch)}, which ${LEVELS[i - 1].id} taught`,
        );
      }
    }
  });

  test('the first level is the home row and nothing else', () => {
    assert.equal(LEVELS[0].id, 'home');
    for (const ch of LEVELS[0].keys) {
      assert.ok(
        "asdfghjkl;' ".includes(ch),
        `level 1 includes ${JSON.stringify(ch)}, which is not on the home row`,
      );
    }
  });

  test('every level has drills, a name, a title, a focus and a threshold', () => {
    for (const l of LEVELS) {
      assert.ok(l.drills.length >= 4, `${l.id} has only ${l.drills.length} drills`);
      assert.ok(l.name, `${l.id} has no short name`);
      assert.ok(l.title, `${l.id} has no title`);
      assert.ok(l.focus, `${l.id} has no focus line`);
      assert.ok(l.threshold >= 80 && l.threshold <= 100, `${l.id} threshold ${l.threshold}`);
    }
  });

  test('the short name is short enough for a chip, and unique', () => {
    const names = LEVELS.map((l) => l.name);
    assert.equal(new Set(names).size, names.length, 'two levels share a name');
    for (const n of names) {
      assert.ok(n.length <= 18, `"${n}" is too long for a level chip`);
    }
  });

  test('the title carries the level number, in order', () => {
    LEVELS.forEach((l, i) => {
      assert.match(l.title, new RegExp(`^Level ${i + 1}\\b`), `${l.id} is numbered wrong`);
      assert.ok(l.title.includes(l.name), `${l.id}'s title and name disagree`);
    });
  });

  test('a level is long enough to be practice and short enough to finish', () => {
    for (const l of LEVELS) {
      const n = wholeKeys(levelText(l)).length;
      assert.ok(n >= 100, `${l.id} is only ${n} keystrokes`);
      assert.ok(n <= 600, `${l.id} is ${n} keystrokes, too long for one sitting`);
    }
  });

  test('drills join with a single space and no stray whitespace', () => {
    assert.equal(DRILL_JOINER, ' ');
    for (const l of LEVELS) {
      for (const d of l.drills) {
        assert.equal(d, d.trim(), `${l.id}: "${d}" has edge whitespace`);
        assert.doesNotMatch(d, /\s\s|\n|\t/, `${l.id}: "${d}" has doubled whitespace`);
      }
    }
  });

  test('accuracy thresholds do not go backwards', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      assert.ok(
        LEVELS[i].threshold >= LEVELS[i - 1].threshold,
        `${LEVELS[i].id} asks for less accuracy than the level before it`,
      );
    }
  });
});

describe('unlocking', () => {
  const ids = LEVELS.map((l) => l.id);

  test('the first level is always open', () => {
    assert.equal(isUnlocked(ids[0], []), true);
  });

  test('the second is not, until the first is done', () => {
    assert.equal(isUnlocked(ids[1], []), false);
    assert.equal(isUnlocked(ids[1], [ids[0]]), true);
  });

  test('completing a later level does not unlock an earlier gap', () => {
    // Finishing level 4 out of order must not open level 6.
    assert.equal(isUnlocked(ids[5], [ids[3]]), false);
    assert.equal(isUnlocked(ids[5], [ids[4]]), true);
  });

  test('an unknown id is not unlocked', () => {
    assert.equal(isUnlocked('not-a-level', ids), false);
  });

  test('completing everything opens everything', () => {
    for (const id of ids) assert.equal(isUnlocked(id, ids), true);
  });

  test('nextLevel walks the ladder and stops at the top', () => {
    for (let i = 0; i < LEVELS.length - 1; i++) {
      assert.equal(nextLevel(ids[i]).id, ids[i + 1]);
    }
    assert.equal(nextLevel(ids.at(-1)), null);
    assert.equal(nextLevel('not-a-level'), null);
  });

  test('lookups behave', () => {
    assert.equal(levelById(ids[2]).id, ids[2]);
    assert.equal(levelById('nope'), null);
    assert.equal(levelIndex(ids[2]), 2);
    assert.equal(levelIndex('nope'), -1);
  });
});

describe('the drills teach what the level claims', () => {
  /**
   * A level that opens a new row but never makes you type from it is a level
   * you pass without learning anything.
   *
   * Only applies to the levels that WIDEN the key set. The last three share
   * the whole keyboard and differ by what they ask you to type - two-key
   * letters, then words, then prose - so "uses a new key" is not a thing they
   * can be asked to do. What they teach instead is pinned by the tests below.
   */
  test('a level that opens a new row makes you type from it', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const before = new Set([...LEVELS[i - 1].keys]);
      const added = [...LEVELS[i].keys].filter((ch) => !before.has(ch));
      if (added.length === 0) continue;

      const used = new Set([...wholeKeys(levelText(LEVELS[i]))]);
      assert.ok(
        added.some((ch) => used.has(ch)),
        `${LEVELS[i].id} adds ${added.length} keys and drills none of them`,
      );
    }
  });

  /** The shape of the ladder, pinned: four rows, then three content levels. */
  test('the rows are opened in order, then the keyboard stops growing', () => {
    const widening = LEVELS.filter((l, i) => {
      if (i === 0) return false;
      const before = new Set([...LEVELS[i - 1].keys]);
      return [...l.keys].some((ch) => !before.has(ch));
    }).map((l) => l.id);

    assert.deepEqual(widening, ['top', 'bottom', 'numbers', 'shift']);
  });

  test('the levels after the last row all have the full keyboard', () => {
    const full = LEVELS.at(-1).keys;
    const after = ['shift', 'matras', 'conjuncts', 'ligatures', 'words', 'sentences', 'paragraphs'];
    // Named rather than derived, so adding a level that quietly narrows the
    // keyboard is a failure here rather than a level nobody can type.
    assert.deepEqual(
      LEVELS.map((l) => l.id).slice(LEVELS.findIndex((l) => l.id === 'shift')),
      after,
      'the tail of the ladder changed - check this list is still the whole of it',
    );
    for (const id of after) {
      assert.equal(levelById(id).keys, full, `${id} does not have the full keyboard`);
    }
  });

  test('level 1 really is typeable without leaving the home row', () => {
    const keys = wholeKeys(levelText(LEVELS[0]));
    for (const ch of keys) {
      assert.ok(
        "asdfghjkl;' ".includes(ch),
        `level 1 needs ${JSON.stringify(ch)}, off the home row`,
      );
    }
  });

  test('the two-key letters level actually drills two-key letters', () => {
    const level = levelById('conjuncts');
    const keys = wholeKeys(levelText(level));
    // Hk भ, 'k श, .k ण, /k ध, [k ख, ?k घ, >k झ, Fk थ - the ones with no key.
    for (const combo of ['Hk', "'k", '.k', '/k', '[k', '?k', '>k', 'Fk']) {
      assert.ok(keys.includes(combo), `the conjuncts level never types ${combo}`);
    }
  });

  test('the shift level actually needs Shift', () => {
    const keys = wholeKeys(levelText(levelById('shift')));
    const shifted = [...keys].filter((ch) => locate(ch)?.shift);
    assert.ok(shifted.length >= 10, `only ${shifted.length} shifted keystrokes`);
  });

  test('the numbers level actually types numbers', () => {
    const keys = wholeKeys(levelText(levelById('numbers')));
    assert.ok(/[0-9]/.test(keys), 'the numbers level types no digits');
  });
});

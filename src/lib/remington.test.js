import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  layout,
  locate,
  FINGERS,
  HOME_KEYS,
  allCaps,
  untypeable,
  NO_CAP,
} from './remington.js';
import { FONTS, convert } from './fontMaps.js';
import { PASSAGES } from './passages.js';
import { wholeKeys, rawKeys, toUnicode, TYPEABLE_SPELLING } from './tutor.build.js';

const MAP = FONTS['kruti-dev'].map;
const ROWS = layout(MAP);
const CAPS = ROWS.flat();
const capFor = (base) => CAPS.find((c) => c.base === base);

describe('the grid is a keyboard', () => {
  test('four rows, in the usual shape', () => {
    assert.equal(ROWS.length, 4);
    assert.deepEqual(ROWS.map((r) => r.length), [13, 13, 11, 10]);
  });

  test('every cap on a US QWERTY board is present exactly once', () => {
    const bases = CAPS.map((c) => c.base);
    assert.equal(new Set(bases).size, bases.length, 'a key is on the board twice');
    for (const ch of "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./") {
      assert.ok(bases.includes(ch), `no cap for ${JSON.stringify(ch)}`);
    }
  });

  test('every cap has a finger and a hand', () => {
    for (const c of CAPS) {
      assert.ok(c.finger, `${c.base} has no finger`);
      assert.ok(c.hand === 'left' || c.hand === 'right', `${c.base} has no hand`);
    }
  });

  test('the eight home keys are marked, and only those', () => {
    const marked = CAPS.filter((c) => c.home).map((c) => c.base);
    assert.deepEqual(marked.sort(), [...HOME_KEYS].sort());
  });
});

/**
 * The cap labels are the tutor's promise to the learner: press this, get that.
 * They are looked up from the character map rather than typed out, and checked
 * here by actually running the conversion.
 */
describe('every cap prints the letter it really types', () => {
  test('the unshifted letters are what the converter produces', () => {
    for (const c of CAPS) {
      if (!c.baseDeva) continue;
      assert.equal(
        convert(c.base, 'kruti-dev', 'unicode', { keepEnglish: false }),
        c.baseDeva,
        `cap ${c.base} claims ${c.baseDeva}`,
      );
    }
  });

  test('the shifted letters are too', () => {
    for (const c of CAPS) {
      if (!c.shiftDeva) continue;
      assert.equal(
        convert(c.shift, 'kruti-dev', 'unicode', { keepEnglish: false }),
        c.shiftDeva,
        `cap ${c.shift} claims ${c.shiftDeva}`,
      );
    }
  });

  test('a key with no Hindi letter says nothing rather than guessing', () => {
    // `]` and `\` produce nothing in Kruti Dev. An empty label is honest; a
    // borrowed one would teach a keystroke that does not work.
    assert.equal(capFor(']').baseDeva, '');
    assert.equal(capFor('\\').baseDeva, '');
  });

  test('the home row is the one a learner starts on', () => {
    // Pinned because Lesson 1 is built from exactly these.
    assert.equal(capFor('d').baseDeva, 'क');
    assert.equal(capFor('j').baseDeva, 'र');
    assert.equal(capFor('l').baseDeva, 'स');
    assert.equal(capFor('g').baseDeva, 'ह');
    assert.equal(capFor(';').baseDeva, 'य');
    assert.equal(capFor('k').baseDeva, 'ा');
    assert.equal(capFor('f').baseDeva, 'ि');
    assert.equal(capFor('h').baseDeva, 'ी');
    assert.equal(capFor('a').baseDeva, 'ं');
    assert.equal(capFor('s').baseDeva, 'े');
  });

  test('a bare vowel sign is drawn on a dotted circle', () => {
    // It has no shape of its own and would otherwise float on the cap border.
    assert.equal(capFor('k').baseLabel, '◌ा');
    assert.equal(capFor('f').baseLabel, '◌ि');
  });

  test('a full letter is drawn as itself', () => {
    assert.equal(capFor('d').baseLabel, 'क');
  });

  test('the dotted circle is never the letter, only the label', () => {
    for (const c of CAPS) {
      assert.ok(!c.baseDeva.includes('◌'));
      assert.ok(!c.shiftDeva.includes('◌'));
    }
  });
});

describe('fingers', () => {
  test('there are ten positions, counting the shared thumb', () => {
    assert.equal(FINGERS.length, 9); // four, four, and one thumb entry
    assert.equal(FINGERS.filter((f) => f.hand === 'left').length, 4);
    assert.equal(FINGERS.filter((f) => f.hand === 'right').length, 4);
    assert.equal(FINGERS.filter((f) => f.hand === 'both').length, 1);
  });

  test('each finger rests on its own home key', () => {
    const homes = FINGERS.filter((f) => f.id !== 'thumb').map((f) => f.home);
    assert.deepEqual(homes.sort(), [...HOME_KEYS].sort());
  });

  test('the home keys are assigned to the finger that rests there', () => {
    for (const f of FINGERS) {
      if (f.id === 'thumb') continue;
      assert.equal(capFor(f.home).finger, f.id, `${f.home} is not ${f.id}'s`);
    }
  });

  /**
   * The index fingers reach one column inward, which is why they own eight
   * keys each and everyone else owns four or five.
   */
  test('the index fingers carry two columns', () => {
    for (const k of ['r', 't', 'f', 'g', 'v', 'b', '4', '5']) {
      assert.equal(capFor(k).finger, 'l-index', `${k} should be left index`);
    }
    for (const k of ['y', 'u', 'h', 'j', 'n', 'm', '6', '7']) {
      assert.equal(capFor(k).finger, 'r-index', `${k} should be right index`);
    }
  });

  test('no finger is asked to cover both hands', () => {
    for (const c of CAPS) {
      const f = FINGERS.find((x) => x.id === c.finger);
      assert.equal(f.hand, c.hand);
    }
  });
});

describe('locate - what to press, and with what', () => {
  test('an unshifted letter is its own cap', () => {
    assert.deepEqual(locate('d'), {
      cap: 'd',
      shift: false,
      finger: 'l-middle',
      shiftFinger: '',
    });
  });

  test('a shifted letter lights the cap it lives on, not a key of its own', () => {
    // There is no `H` key. `H` is Shift plus the `h` cap.
    const h = locate('H');
    assert.equal(h.cap, 'h');
    assert.equal(h.shift, true);
    assert.equal(h.finger, 'r-index');
  });

  /**
   * The part everyone gets wrong, and the reason their little finger aches:
   * Shift is held by the hand that is NOT typing the letter.
   */
  test('shift is held by the opposite hand', () => {
    assert.equal(locate('H').shiftFinger, 'l-pinky'); // h is right-handed
    assert.equal(locate('D').shiftFinger, 'r-pinky'); // d is left-handed
  });

  test('an unshifted key needs no shift finger', () => {
    assert.equal(locate('d').shiftFinger, '');
  });

  test('space is the thumb', () => {
    assert.deepEqual(locate(' '), {
      cap: ' ',
      shift: false,
      finger: 'thumb',
      shiftFinger: '',
    });
  });

  test('a character that is not on the keyboard is not invented', () => {
    assert.equal(locate('é'), null);
    assert.equal(locate(''), null);
    assert.equal(locate(undefined), null);
  });

  test('every character the caps can produce can be located', () => {
    for (const [base, shift] of allCaps()) {
      assert.ok(locate(base), `cannot locate ${JSON.stringify(base)}`);
      assert.ok(locate(shift), `cannot locate ${JSON.stringify(shift)}`);
    }
  });
});

/**
 * The tutor asks locate() for every keystroke of every lesson. A keystroke it
 * cannot place is a keystroke with no highlight and no finger - the tutor would
 * simply stop guiding, silently, in the middle of a drill.
 */
describe('everything the tutor will ask for is on this keyboard', () => {
  test('every keystroke of every passage can be located', () => {
    for (const p of PASSAGES) {
      assert.deepEqual(
        untypeable(wholeKeys(p.text)),
        [],
        `${p.id} needs keys that are not on the keyboard - see NO_CAP`,
      );
    }
  });

  test('and every one of them has a finger', () => {
    for (const p of PASSAGES) {
      for (const ch of new Set([...wholeKeys(p.text)])) {
        assert.ok(locate(ch).finger, `${JSON.stringify(ch)} has no finger`);
      }
    }
  });

  /**
   * Catches the specific slip this constraint exists for: writing the nasal as
   * ँ instead of ं. It is the natural spelling, it is what a writer reaches
   * for, and it is the one character that quietly makes a passage untypeable.
   */
  test('no passage uses a character with no cap', () => {
    for (const p of PASSAGES) {
      for (const ch of NO_CAP) {
        const deva = toUnicode(ch);
        assert.ok(
          !p.text.includes(deva),
          `${p.id} contains ${deva}, which has no key on the keyboard - use ` +
            `the ं spelling instead`,
        );
      }
    }
  });
});

/**
 * The substitution table that makes four more conjuncts typeable. Each entry
 * is a claim that two different keystroke sequences produce the same letter,
 * and each claim is checked by running the converter both ways.
 */
describe('the typeable spellings really are the same letter', () => {
  test('each substitution produces identical Unicode', () => {
    for (const [off, spelled] of Object.entries(TYPEABLE_SPELLING)) {
      assert.equal(
        toUnicode(spelled),
        toUnicode(off),
        `${JSON.stringify(spelled)} is not the same letter as ${JSON.stringify(off)}`,
      );
    }
  });

  test('every replacement is typeable', () => {
    for (const spelled of Object.values(TYPEABLE_SPELLING)) {
      assert.deepEqual(untypeable(spelled), [], `${spelled} is still not typeable`);
    }
  });

  test('every character it replaces genuinely has no cap', () => {
    // If one of these ever gains a cap, the substitution is pointless work.
    for (const off of Object.keys(TYPEABLE_SPELLING)) {
      assert.equal(locate(off), null, `${JSON.stringify(off)} is on the keyboard now`);
    }
  });

  test('substituting does not change what the passage says', () => {
    for (const p of PASSAGES) {
      assert.equal(
        toUnicode(wholeKeys(p.text)),
        toUnicode(rawKeys(p.text)),
        `${p.id}: the typeable spelling says something different`,
      );
    }
  });

  test('and the passage still converts back to itself', () => {
    for (const p of PASSAGES) {
      assert.equal(toUnicode(wholeKeys(p.text)), p.text, `${p.id} does not round-trip`);
    }
  });

  /**
   * Otherwise the mechanism is a no-op and everything above proves nothing.
   * These are the three that genuinely fire: the converter reaches for a
   * dedicated ligature glyph and the tutor spells the letter out instead.
   */
  test('the two spellings really are different keystrokes', () => {
    for (const [word, raw, typed] of [
      ['कृपया', 'Ñi;k', 'd`i;k'],
      ['क्रम', 'Øe', 'dze'],
      ['ट्रेन', 'Vªsu', 'Vzsu'],
    ]) {
      assert.equal(rawKeys(word), raw, `${word}: the converter changed its spelling`);
      assert.equal(wholeKeys(word), typed, `${word}: wrong typeable spelling`);
      assert.notEqual(rawKeys(word), wholeKeys(word));
    }
  });

  /**
   * The fourth entry, ç for प्र, never fires: the reverse map already prefers
   * `iz` because that entry comes first in fontMaps.js. It stays in the table
   * as a guard, since the preference is a consequence of declaration order and
   * nothing enforces that order.
   */
  test('प्र already uses the typeable spelling without help', () => {
    assert.equal(rawKeys('प्रश्न'), wholeKeys('प्रश्न'));
    assert.match(wholeKeys('प्रश्न'), /^iz/);
  });
});

describe('the number row', () => {
  test('Kruti Dev 010 number keys are labelled with the English digit they type', () => {
    const caps = layout(FONTS['kruti-dev'].map).flat();
    for (const d of '1234567890') {
      const cap = caps.find((c) => c.base === d);
      assert.equal(cap.baseDeva, '', d);
      assert.equal(cap.baseLabel, d, d);
    }
  });
});

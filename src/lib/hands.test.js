import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  VIEWBOX,
  PALM,
  FINGER_SHAPES,
  THUMB,
  fingerIds,
  HANDS,
} from './hands.js';
import { FINGERS, locate, allCaps } from './remington.js';

/**
 * The guide and the keyboard have to name the same fingers. If they drift, the
 * tutor highlights a key and then highlights nothing on the hand - silently,
 * for one column of the keyboard, which is exactly the kind of gap nobody
 * notices until a learner asks why their ring finger never lights up.
 */
describe('the drawing covers every finger the keyboard names', () => {
  const drawn = new Set([...fingerIds('left'), ...fingerIds('right'), 'thumb']);

  test('every finger in the table can be drawn', () => {
    for (const f of FINGERS) {
      assert.ok(drawn.has(f.id), `${f.id} has no shape on the hand guide`);
    }
  });

  test('and the drawing invents none', () => {
    const named = new Set(FINGERS.map((f) => f.id));
    for (const id of drawn) {
      assert.ok(named.has(id), `the hand guide draws ${id}, which is not a finger`);
    }
  });

  test('every key on the keyboard lands on a drawable finger', () => {
    for (const [base, shift] of allCaps()) {
      for (const ch of [base, shift]) {
        const at = locate(ch);
        assert.ok(
          drawn.has(at.finger),
          `${JSON.stringify(ch)} wants ${at.finger}, which is not drawn`,
        );
      }
    }
  });

  test('space lands on the thumb, which both hands share', () => {
    assert.equal(locate(' ').finger, 'thumb');
    assert.ok(drawn.has('thumb'));
  });

  test('a shift-held key names a pinky that is drawn', () => {
    for (const ch of ['H', 'D', 'K', 'Q']) {
      const at = locate(ch);
      assert.ok(at.shift, `${ch} should need shift`);
      assert.ok(drawn.has(at.shiftFinger), `${at.shiftFinger} is not drawn`);
    }
  });
});

describe('the geometry is a hand', () => {
  test('two hands, left then right', () => {
    assert.deepEqual(HANDS.map((h) => h.id), ['left', 'right']);
  });

  test('four fingers and a thumb', () => {
    assert.equal(FINGER_SHAPES.length, 4);
    assert.deepEqual(
      FINGER_SHAPES.map((f) => f.name),
      ['pinky', 'ring', 'middle', 'index'],
    );
  });

  test('the fingers run left to right without overlapping', () => {
    for (let i = 1; i < FINGER_SHAPES.length; i++) {
      const prev = FINGER_SHAPES[i - 1];
      const cur = FINGER_SHAPES[i];
      assert.ok(
        cur.x >= prev.x + prev.width,
        `${cur.name} overlaps ${prev.name}`,
      );
    }
  });

  /**
   * What makes the picture read as a hand rather than a comb, and therefore
   * what makes it glanceable while typing.
   */
  test('the middle finger is the tallest and the pinky the shortest', () => {
    const byName = Object.fromEntries(FINGER_SHAPES.map((f) => [f.name, f]));
    const heights = FINGER_SHAPES.map((f) => f.height);
    assert.equal(byName.middle.height, Math.max(...heights));
    assert.equal(byName.pinky.height, Math.min(...heights));
  });

  test('every finger reaches down into the palm', () => {
    // Otherwise it floats above the hand with a gap under it.
    for (const f of FINGER_SHAPES) {
      assert.ok(
        f.y + f.height > PALM.y,
        `${f.name} does not meet the palm`,
      );
    }
  });

  test('everything fits inside the viewBox', () => {
    const shapes = [PALM, ...FINGER_SHAPES];
    for (const s of shapes) {
      assert.ok(s.x >= 0 && s.y >= 0, 'a shape starts off-canvas');
      assert.ok(s.x + s.width <= VIEWBOX.width, 'a shape runs off the right');
      assert.ok(s.y + s.height <= VIEWBOX.height, 'a shape runs off the bottom');
    }
  });

  /**
   * The thumb is the one rotated shape, so its corners have to be checked
   * after the rotation rather than from x/y/width/height.
   */
  test('the rotated thumb stays on canvas', () => {
    const rad = (THUMB.rotate * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
      [THUMB.x, THUMB.y],
      [THUMB.x + THUMB.width, THUMB.y],
      [THUMB.x, THUMB.y + THUMB.height],
      [THUMB.x + THUMB.width, THUMB.y + THUMB.height],
    ];
    for (const [px, py] of corners) {
      const dx = px - THUMB.originX;
      const dy = py - THUMB.originY;
      const x = THUMB.originX + dx * cos - dy * sin;
      const y = THUMB.originY + dx * sin + dy * cos;
      assert.ok(x >= 0 && x <= VIEWBOX.width, `thumb corner off canvas at x=${x.toFixed(1)}`);
      assert.ok(y >= 0 && y <= VIEWBOX.height, `thumb corner off canvas at y=${y.toFixed(1)}`);
    }
  });

  test('the thumb swings outward, away from the fingers', () => {
    // On a left hand the thumb is to the right of the index finger.
    const index = FINGER_SHAPES.at(-1);
    assert.ok(THUMB.x >= index.x + index.width, 'the thumb is under the fingers');
    assert.ok(THUMB.rotate < 0, 'the thumb rotates the wrong way');
  });

  test('finger ids are built per hand and do not collide', () => {
    const left = fingerIds('left');
    const right = fingerIds('right');
    assert.equal(new Set([...left, ...right]).size, 8);
    assert.ok(left.every((id) => id.startsWith('l-')));
    assert.ok(right.every((id) => id.startsWith('r-')));
  });
});

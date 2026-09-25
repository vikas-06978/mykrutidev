/**
 * The two-hands drawing, as geometry.
 *
 * Kept out of the component so the shapes can be checked against the finger
 * table: a hand missing a finger, or drawing one the keyboard never names, is
 * a guide that silently stops guiding for one column of keys. hands.test.js
 * asserts the two agree.
 *
 * DESIGN.md has no illustration system and wants flat shapes defined by a
 * hairline, so the hand is exactly that - a palm and five rounded bars. It is
 * not anatomy. It only has to answer "which one of these do I move", and a
 * recognisable diagram does that better than a drawing with knuckles in it.
 */

/**
 * One hand, fingers pointing up, drawn as a LEFT hand: pinky at the left edge,
 * thumb swinging out to the right. The right hand is the same geometry
 * mirrored, which is also true of hands.
 *
 * viewBox is 0 0 140 150.
 */
export const VIEWBOX = { width: 144, height: 150 };

/** The palm. Not a finger - never highlighted, just there to hang them on. */
export const PALM = { x: 22, y: 72, width: 86, height: 62, rx: 18 };

/**
 * The four fingers, in the order they sit on the hand.
 *
 * Heights differ because the tutor is read at a glance and a row of identical
 * bars is a comb: the middle finger being tallest is most of what makes the
 * picture read as a hand at all.
 */
export const FINGER_SHAPES = [
  { name: 'pinky', x: 24, y: 46, width: 17, height: 42, rx: 8.5 },
  { name: 'ring', x: 45, y: 28, width: 18, height: 60, rx: 9 },
  { name: 'middle', x: 66, y: 22, width: 18, height: 66, rx: 9 },
  { name: 'index', x: 87, y: 34, width: 17, height: 54, rx: 8.5 },
];

/**
 * The thumb, angled out and down from where it meets the palm.
 *
 * Rotated about the joint rather than drawn as a slanted path, so the shape
 * stays a plain rect and the mirror transform on the right hand keeps working.
 */
export const THUMB = {
  x: 104,
  y: 86,
  width: 16,
  height: 40,
  rx: 8,
  rotate: -38,
  originX: 110,
  originY: 92,
};

/** Finger ids for a hand, matching the ids in remington.js. */
export const fingerIds = (hand) =>
  FINGER_SHAPES.map((f) => `${hand === 'left' ? 'l' : 'r'}-${f.name}`);

/** Both hands, in reading order. */
export const HANDS = [
  { id: 'left', label: 'Left hand' },
  { id: 'right', label: 'Right hand' },
];

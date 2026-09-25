/**
 * The typing tutor's runtime logic.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IN THIS FILE MAY IMPORT fontMaps.js.
 *
 * The tutor's client script imports this module. fontMaps.js carries every
 * character map on the site, and pulling it into the browser bundle would put
 * the whole conversion engine on the one page where the time to the first
 * keystroke is the product. The conversion happens at BUILD time - see
 * buildUnits() in tutor.build.js - and the browser receives finished pairs of
 * (akshara, keystrokes) as data.
 * ---------------------------------------------------------------------------
 *
 * THE MODEL
 *
 * The passage is shown as Unicode Devanagari, because that renders on any
 * machine with no font to install. The user types Remington: English keys that
 * a legacy font would draw as Hindi. Those are two different strings of two
 * different lengths, and the tutor has to hold them together.
 *
 * A UNIT is one akshara plus the exact keystrokes that produce it:
 *
 *     { deva: 'भा', keys: 'Hkk' }
 *     { deva: 'र',  keys: 'j'   }
 *
 * Scoring runs on the keystrokes, because that is what the user pressed and
 * what an exam counts. Display runs on the aksharas, because that is what the
 * user reads. Units are the join, and they are what makes "a half-formed
 * akshara is neutral until you pass it" expressible at all: भा is not wrong
 * after `H`, it is unfinished.
 */

/** @typedef {{ deva: string, keys: string }} Unit */

/** The keystrokes for a whole lesson, in order. What the user must press. */
export const unitsToKeys = (units) => units.map((u) => u.keys).join('');

/** The Devanagari for a whole lesson. What the user reads. */
export const unitsToText = (units) => units.map((u) => u.deva).join('');

/** Just the key runs, in unit order - the shape clusterStates() wants. */
export const unitKeyRuns = (units) => units.map((u) => u.keys);

/**
 * The single key the user must press next, or '' when the lesson is finished.
 *
 * Deliberately the next key of the TARGET, not of whatever the user has typed.
 * After a wrong keystroke the tutor keeps pointing at the key that was wanted
 * rather than re-planning around the mistake, so the finger guide and the
 * keyboard highlight stay on the thing being taught.
 */
export function nextKey(expected, typed) {
  return typed.length < expected.length ? expected[typed.length] : '';
}

/**
 * How far through the units the caret is - the index of the unit being typed.
 *
 * Returns units.length once everything is typed, which callers read as "done".
 */
export function unitAt(runs, typedLength) {
  let at = 0;
  for (let i = 0; i < runs.length; i++) {
    const end = at + runs[i].length;
    if (typedLength < end) return i;
    at = end;
  }
  return runs.length;
}

/**
 * Which keys the user actually got wrong, most-missed first.
 *
 * Keyed by the character that SHOULD have been pressed, not by what was
 * pressed instead: "you keep missing `Hk`" is a lesson, "you keep pressing `j`"
 * is a symptom. Positional, like score() - see the note there.
 *
 * @returns {{ key: string, count: number }[]}
 */
export function missedKeys(expected, typed) {
  const tally = new Map();
  const shared = Math.min(expected.length, typed.length);

  for (let i = 0; i < shared; i++) {
    if (expected[i] === typed[i]) continue;
    const k = expected[i];
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }

  return [...tally]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
}

/**
 * Has this attempt earned the next level?
 *
 * Accuracy only, and on purpose. A tutor that gates on speed teaches people to
 * rush a drill they have not learned, which is the single most common way
 * typists build a plateau they then cannot get out of. Speed is reported,
 * celebrated and recorded - it is just never the door.
 */
export function passed(stats, threshold) {
  return stats.typed > 0 && stats.accuracy >= threshold;
}

/**
 * Everything the result card and the progress store need, from two strings.
 *
 * One function rather than five call sites each doing their own arithmetic, so
 * the number on the live stat row and the number in the saved record cannot
 * drift apart.
 *
 * @param {string} expected
 * @param {string} typed
 * @param {number} elapsedMs
 */
export function summarise(expected, typed, elapsedMs) {
  const shared = Math.min(expected.length, typed.length);
  let correct = 0;
  for (let i = 0; i < shared; i++) if (expected[i] === typed[i]) correct++;

  const wrong = shared - correct + Math.max(0, typed.length - expected.length);
  const minutes = elapsedMs > 0 ? elapsedMs / 60000 : 0;

  return {
    correct,
    wrong,
    typed: typed.length,
    /** Net WPM: correct keystrokes only, five to a word. */
    net: minutes > 0 ? correct / 5 / minutes : 0,
    /** Gross WPM: every keystroke, right or wrong. */
    gross: minutes > 0 ? typed.length / 5 / minutes : 0,
    accuracy: typed.length > 0 ? (correct / typed.length) * 100 : 100,
    complete: typed.length >= expected.length,
  };
}

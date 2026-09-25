/**
 * Build-time half of the tutor: turning Hindi into (akshara, keystrokes) pairs.
 *
 * Split from tutor.js because this file imports the conversion engine and
 * tutor.js must not - see the note at the top of tutor.js. Everything here runs
 * in the Astro frontmatter, never in the browser.
 */

import { convert } from './fontMaps.js';
import { graphemes } from './typing.js';
import { isTypeable, untypeable } from './remington.js';

const LEGACY = 'kruti-dev';

/**
 * Off-keyboard Kruti Dev characters, and an ordinary spelling for each.
 *
 * ---------------------------------------------------------------------------
 * The converter picks whichever spelling comes first in the character map,
 * which for four conjuncts is a dedicated 8-bit glyph slot - `ç` for प्र, `Ñ`
 * for कृ. Those are perfectly valid Kruti Dev and they round-trip correctly,
 * but no US QWERTY cap produces them, so a tutor that asked for `ç` would be
 * asking for a key that is not on the keyboard it is drawing.
 *
 * Each replacement below produces the IDENTICAL Unicode - that is not an
 * assumption, tutor.test.js converts both spellings and compares. They are
 * also the spellings a Kruti Dev typist actually uses: प्र is प + ्र, which is
 * `i` then `z`, exactly as the letter is built.
 *
 * This table is only correct because every value is typeable and every key is
 * not; both halves are asserted in the tests.
 * ---------------------------------------------------------------------------
 */
export const TYPEABLE_SPELLING = {
  'ç': 'iz', // प्र  = प + ्र
  'Ñ': 'd`', // कृ   = क + ृ
  'Ø': 'dz', // क्र  = क + ्र
  'ª': 'z', //  ्र   the ra-kara used under ट ठ ड ढ
};

const RE_OFF_KEYBOARD = new RegExp(`[${Object.keys(TYPEABLE_SPELLING).join('')}]`, 'g');

/**
 * Rewrite a keystroke sequence into one a human can actually press.
 *
 * Leaves anything already typeable alone, so it is safe to call on everything.
 */
export const typeable = (keys) =>
  keys.replace(RE_OFF_KEYBOARD, (ch) => TYPEABLE_SPELLING[ch]);

/**
 * The passages and drills are pure Devanagari, so the English-word heuristic
 * has nothing to act on - but it is turned off explicitly rather than left to
 * chance. A drill is a fixed string of letters, and a heuristic that decides
 * some of them are an English word would quietly change what the lesson
 * teaches.
 */
const OPTS = { keepEnglish: false };

/** @typedef {import('./tutor.js').Unit} Unit */

/**
 * Split Hindi into units of one akshara and the keystrokes that type it.
 *
 * ---------------------------------------------------------------------------
 * WHY PER-AKSHARA CONVERSION IS SAFE
 *
 * The obvious worry: convert() reorders. The i-matra is typed before its
 * consonant and the reph after its cluster, so converting a passage in pieces
 * could easily produce something different from converting it whole.
 *
 * It does not, because the unit being converted is exactly the span the
 * reordering happens inside. कि is one akshara and converts to `fd` whether it
 * arrives alone or in a sentence; र्म is one akshara and converts to `eZ` the
 * same way. Splitting anywhere FINER would break this - which is why the unit
 * is an akshara and not a character.
 *
 * That is an argument, not a proof, so tutor.test.js checks the equality
 * directly on every passage and every drill: the joined per-akshara conversion
 * must equal the conversion of the whole string, character for character. If a
 * future passage ever breaks it, the build fails with the passage named.
 * ---------------------------------------------------------------------------
 *
 * @param {string} text Unicode Devanagari
 * @returns {Unit[]}
 */
export function buildUnits(text) {
  return graphemes(text).map((deva) => ({
    deva,
    keys: typeable(convert(deva, 'unicode', LEGACY, OPTS)),
  }));
}

/** The keystrokes for a whole string, converted in one go - the check value. */
export const wholeKeys = (text) => typeable(convert(text, 'unicode', LEGACY, OPTS));

/** The converter's own spelling, before any substitution. For the tests. */
export const rawKeys = (text) => convert(text, 'unicode', LEGACY, OPTS);

/** Back the other way, for checking that a substitution changed nothing. */
export const toUnicode = (keys) => convert(keys, LEGACY, 'unicode', OPTS);

/**
 * Units, with the alignment verified on the spot.
 *
 * Used by the page rather than buildUnits() directly, so a passage that does
 * not align cannot be served at all. The check is a string comparison over a
 * few thousand characters at build time and costs nothing worth measuring.
 *
 * @param {string} text
 * @param {string} [label] named in the error, so the failure says which one
 */
export function buildVerifiedUnits(text, label = 'text') {
  const units = buildUnits(text);
  const keys = unitsKeys(units);

  assertAligned(keys, wholeKeys(text), label);

  // The tutor draws a keyboard and points at it. Content needing a key that is
  // not on that keyboard would leave the learner with a highlight on nothing.
  if (!isTypeable(keys)) {
    const lost = untypeable(keys).map((c) => JSON.stringify(c)).join(' ');
    throw new Error(
      `tutor: ${label} needs keys that are not on the keyboard: ${lost}. ` +
        `See NO_CAP in remington.js - rewrite the text to avoid them.`,
    );
  }

  return units;
}

/**
 * The guard itself, separated so it can be tested.
 *
 * Every string the site actually uses aligns - that is the point - which left
 * the throw path with nothing to exercise it. A guard nobody has ever seen fire
 * is a guard that might throw a TypeError instead of the message it promises,
 * on the one day somebody needs to read it.
 *
 * @param {string} joined per-akshara conversion, concatenated
 * @param {string} whole  the same text converted in one call
 * @param {string} label  named in the message
 */
export function assertAligned(joined, whole, label = 'text') {
  if (joined === whole) return;

  const at = firstDifference(joined, whole);
  throw new Error(
    `tutor: ${label} does not align at keystroke ${at} - per-akshara ` +
      `conversion gives ${JSON.stringify(joined.slice(at, at + 24))} where ` +
      `converting the whole string gives ${JSON.stringify(whole.slice(at, at + 24))}`,
  );
}

function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
}

const unitsKeys = (units) => units.map((u) => u.keys).join('');

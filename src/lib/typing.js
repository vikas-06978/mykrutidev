/**
 * Typing-test scoring, and the text segmentation the highlighting depends on.
 *
 * Pure functions, no DOM. TypingTutor.astro owns the timer, the element updates
 * and localStorage; everything that can be decided from two strings lives here
 * so it can be tested without a browser.
 *
 * ---------------------------------------------------------------------------
 * WHY SEGMENTATION IS NOT OPTIONAL
 *
 * Highlighting means wrapping each unit of the target in its own <span> and
 * colouring it. If those units are UTF-16 code units, Devanagari breaks: the
 * matra in कि is a separate codepoint from क, and a <span> boundary between
 * them stops the browser shaping them together. The matra detaches and is drawn
 * on a dotted circle - ◌ि - beside the consonant it belongs to.
 *
 * So the target is split into CLUSTERS (a base letter plus everything that
 * hangs off it, including conjuncts joined by a virama) and each cluster gets
 * one span. Comparison still happens codepoint by codepoint, because that is
 * what the user actually types; a cluster is simply the unit we colour.
 *
 * ASCII falls out of the same function as one character per cluster, which is
 * what Kruti Dev mode needs: legacy text is plain ASCII with no shaping, so
 * every key is its own unit there.
 * ---------------------------------------------------------------------------
 */

// --- Devanagari character classes -------------------------------------------
// Deliberately narrower than "anything in the block": a cluster may only absorb
// characters that genuinely attach to the letter before them.

/** Anusvara, visarga, chandrabindu, nukta, all vowel signs, vedic accents. */
const RE_MARK =
  /[ऀ-ःऺऻ़ा-ौॎॏ॑-ॗॢॣ]/;

/** Independent letters - consonants, vowels, om, avagraha. */
const RE_LETTER = /[ऄ-हऽॐक़-ॡ॰-ॿ]/;

const VIRAMA = '्';
const ZWJ = '‍';
const ZWNJ = '‌';

const isMark = (ch) => RE_MARK.test(ch);
const isLetter = (ch) => RE_LETTER.test(ch);
const isJoiner = (ch) => ch === ZWJ || ch === ZWNJ;

/**
 * Split text into rendering clusters.
 *
 * A cluster is one base character, then any marks and joiners, then - as long
 * as a virama is followed by another letter - that letter and its marks too.
 * क्ष comes back as one cluster, not three, because splitting it would draw
 * क् ष instead of the conjunct.
 *
 * A trailing virama with nothing after it (a half letter at the end of a line)
 * stays attached to the letter it silences.
 *
 * @param {string} text
 * @returns {string[]} clusters, which always join back to exactly `text`
 */
export function clusters(text) {
  const out = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const start = i;
    // The base. Whatever it is - a letter, a space, an ASCII key, a digit.
    i += codeUnitsAt(text, i);

    for (;;) {
      while (i < n && (isMark(text[i]) || isJoiner(text[i]))) i++;

      if (i < n && text[i] === VIRAMA) {
        i++;
        while (i < n && isJoiner(text[i])) i++;
        // A virama between two letters makes a conjunct, so keep going. A
        // virama with nothing after it ends the cluster right here.
        if (i < n && isLetter(text[i])) {
          i += codeUnitsAt(text, i);
          continue;
        }
      }
      break;
    }

    out.push(text.slice(start, i));
  }

  return out;
}

/** Surrogate-pair aware step, so an astral character is never cut in half. */
function codeUnitsAt(text, i) {
  const code = text.charCodeAt(i);
  return code >= 0xd800 && code <= 0xdbff && i + 1 < text.length ? 2 : 1;
}

/**
 * Split into graphemes - the same job as clusters(), asked of the platform.
 *
 * Intl.Segmenter is the right primary: it implements UAX #29 and is maintained
 * by people who track the Unicode version, which a regex in this file is not.
 * It needs one correction, though. Before Unicode 15.1 added rule GB9c, the
 * standard did NOT join Indic conjuncts, so क्ष segments as क् + ष - and which
 * behaviour you get depends on the ICU build inside the browser. That is
 * exactly the kind of thing that works on the machine it was written on and
 * splits a ligature on somebody's phone.
 *
 * So the segments are merged back across a virama, which makes the result
 * identical on every engine and identical to clusters(). typing.test.js asserts
 * that equality over every passage and drill on the site, so the fallback is a
 * fallback and not a second, subtly different implementation.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function graphemes(text) {
  if (!text) return [];

  const seg = segmenter();
  if (!seg) return clusters(text);

  try {
    const out = [];
    for (const { segment } of seg.segment(text)) {
      // A piece that ends in a virama is a half letter waiting for the
      // consonant that completes the conjunct.
      const prev = out.length > 0 ? out[out.length - 1] : '';
      if (prev && endsOpen(prev)) out[out.length - 1] = prev + segment;
      else out.push(segment);
    }
    return out;
  } catch {
    return clusters(text);
  }
}

/** Ends on a virama, optionally followed by a joiner - so it wants a letter. */
function endsOpen(s) {
  const bare = s.replace(/[‌‍]+$/, '');
  return bare.endsWith(VIRAMA);
}

/** Built once. Constructing a Segmenter per call is the expensive part. */
let cachedSegmenter;
function segmenter() {
  if (cachedSegmenter !== undefined) return cachedSegmenter;
  try {
    cachedSegmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter('hi', { granularity: 'grapheme' })
        : null;
  } catch {
    cachedSegmenter = null;
  }
  return cachedSegmenter;
}

// ============================================================================
// Scoring
// ============================================================================

/**
 * Five keystrokes to a word. That is the convention every typing test uses,
 * including the Hindi ones the CPCT and SSC exams are scored against, and it is
 * the only way to compare a Devanagari passage with a Latin one at all: Hindi
 * words are shorter in characters but carry more matras per letter.
 */
const CHARS_PER_WORD = 5;

/**
 * Compare what was typed against the target, position by position.
 *
 * No realignment. Index 12 of the input is judged against index 12 of the
 * target, so an inserted character makes everything after it wrong until the
 * user backspaces - which is exactly how every typing test behaves, and the
 * only rule a typist can predict. Anything cleverer would quietly forgive
 * mistakes the exam will not.
 *
 * @param {string} target
 * @param {string} typed
 */
export function score(target, typed) {
  const shared = Math.min(target.length, typed.length);

  let correct = 0;
  let wrong = 0;
  for (let i = 0; i < shared; i++) {
    if (target[i] === typed[i]) correct++;
    else wrong++;
  }

  // Typing past the end of the passage is not free either.
  const overrun = Math.max(0, typed.length - target.length);

  return {
    correct,
    wrong: wrong + overrun,
    typed: typed.length,
    /** True once the whole passage has been typed correctly. */
    finished: typed.length >= target.length && wrong === 0 && overrun === 0,
  };
}

/**
 * Net words per minute - correct keystrokes only.
 *
 * The headline number. Gross WPM (below) flatters a typist who is fast and
 * inaccurate, and an exam scores neither of them that way.
 */
export const netWpm = (correct, elapsedMs) =>
  elapsedMs <= 0 ? 0 : correct / CHARS_PER_WORD / (elapsedMs / 60000);

/** Gross WPM - every keystroke counts, right or wrong. Shown beside accuracy. */
export const grossWpm = (typed, elapsedMs) =>
  elapsedMs <= 0 ? 0 : typed / CHARS_PER_WORD / (elapsedMs / 60000);

/** Percentage of keystrokes that landed on the right character. */
export const accuracy = (correct, typed) =>
  typed <= 0 ? 100 : (correct / typed) * 100;

/** m:ss, for the countdown and the result card. */
export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ============================================================================
// Per-cluster state, for the highlighting
// ============================================================================

/**
 * @typedef {'correct'|'wrong'|'current'|'pending'} ClusterState
 */

/**
 * Label every cluster of the target with how the typist is doing on it.
 *
 * `current` is the cluster the caret sits in - either untouched and next up, or
 * half-typed and correct so far. A cluster only goes `wrong` once a character
 * inside it has actually been typed wrong, so a half-finished क does not flash
 * red while the matra is still on its way.
 *
 * @param {string} target
 * @param {string} typed
 * @param {string[]} [parts] pre-computed clusters(target), to avoid re-splitting
 * @returns {ClusterState[]} one state per cluster
 */
export function clusterStates(target, typed, parts = clusters(target)) {
  const states = [];
  const end = typed.length;
  let at = 0;
  let currentTaken = false;

  for (const part of parts) {
    const from = at;
    const to = at + part.length;
    at = to;

    if (end <= from) {
      // Nothing typed here yet. The first such cluster is where the caret is.
      states.push(currentTaken ? 'pending' : 'current');
      currentTaken = true;
      continue;
    }

    const upto = Math.min(to, end);
    const ok = target.slice(from, upto) === typed.slice(from, upto);

    if (!ok) {
      states.push('wrong');
    } else if (end >= to) {
      states.push('correct');
    } else {
      // Partly typed and right so far.
      states.push('current');
      currentTaken = true;
    }
  }

  return states;
}

/**
 * The English to Hindi Typing page's pipeline: Roman text in, Unicode Hindi
 * out, one word at a time.
 *
 * ---------------------------------------------------------------------------
 * WHAT GETS TRANSLITERATED - ONLY LETTERS
 *
 * The text is cut into spans before any engine sees it:
 *
 *   URLs and emails        kept exactly                (deva.js PROTECTED)
 *   `backticked` English   kept, backticks removed     `Google` -> Google
 *   || and |               ॥ and ।                     the only symbol rewritten
 *   a run of A-Z a-z       ONE WORD, transliterated
 *   everything else        kept exactly - digits, whitespace, and all of
 *                          ? ! , . : ; ' " ( ) [ ] { } - _ / \ @ # $ % & * + = < > ~ `
 *
 * So `chal?` is the word `chal` then a `?`, and the `?` never reaches Google or
 * the rules. That is the fix for punctuation being eaten or rewritten: nothing
 * but letters is ever handed to an engine.
 *
 * ---------------------------------------------------------------------------
 * WHERE EACH WORD'S HINDI COMES FROM
 *
 *   1. Google Input Tools, one request per distinct word, FIRST candidate
 *      shown and the rest (up to 5 in all) kept for the tap-to-pick list.
 *   2. The built-in dictionary + rules (translit.js), ONLY for a word whose
 *      Google request failed - offline, blocked, timed out.
 *   3. The ~40 common words in corrections.js are pinned on top of either
 *      (हूँ, है, नहीं, वहाँ ...). Google's other candidates stay on offer.
 *   4. An ENGLISH word (englishWords.js: in the English list, not Hinglish)
 *      is spelled by its English pronunciation instead - nice -> नाइस - or
 *      kept exactly as typed in "Keep English" mode. A word that is both
 *      (is, to, he) follows its neighbours - see readsEnglish(). Tapping any
 *      of them offers both readings: Google's candidates / the Hindi, and the
 *      English (टू for `to`).
 *   5. A word the user picked from the list wins over all of it.
 *
 * This module does no I/O itself. The Google lookup and the fallback are passed
 * in, which is what lets the tests mock Google without a network.
 */

import { PROTECTED } from './deva.js';
import { COMMON_WORDS } from './corrections.js';

export const MAX_SUGGESTIONS = 5;

/** Requests in flight at once, so a pasted paragraph does not open 200. */
const CONCURRENCY = 6;

// One alternation, tried in order at each position: structure first, so the
// letters inside an email or a URL are never read as words.
const TOKEN = new RegExp(
  [
    `(${PROTECTED.source})`, // 1: URL or email, kept
    '`([^`\\n]+)`', // 2: `English`, kept without its backticks
    '([A-Za-z]+)', // 3: a word
    '(\\|\\||\\|)', // 4: danda / double danda
  ].join('|'),
  'g',
);

/**
 * @typedef {{ kind: 'keep', v: string } | { kind: 'word', v: string, index: number }} Segment
 */

/**
 * Cut text into kept spans and words. Joining every `v` in order gives back the
 * input with only the documented rewrites (backticks gone, | as ।).
 *
 * @param {string} text
 * @returns {Segment[]}
 */
export function tokenize(text) {
  /** @type {Segment[]} */
  const out = [];
  let last = 0;
  let index = 0;
  const keep = (v) => {
    if (v) out.push({ kind: 'keep', v });
  };
  for (const m of text.matchAll(TOKEN)) {
    keep(text.slice(last, m.index));
    if (m[1] !== undefined) keep(m[1]);
    else if (m[2] !== undefined) keep(m[2]);
    else if (m[3] !== undefined) out.push({ kind: 'word', v: m[3], index: index++ });
    else keep(m[4] === '||' ? '॥' : '।');
    last = m.index + m[0].length;
  }
  keep(text.slice(last));
  return out;
}

/** Key for a user's pick: the word's position and its spelling, so an edit
 *  that shifts or changes the word quietly drops a pick that no longer fits. */
export const pickKey = (index, roman) => `${index}|${roman.toLowerCase()}`;

/**
 * @typedef {{ start: number, end: number, index: number, roman: string,
 *             suggestions: string[] }} WordSpan
 * @typedef {{ text: string, words: WordSpan[], fellBack: boolean }} Typed
 */

/**
 * @typedef {{
 *   isEnglish: (word: string) => boolean,
 *   isAmbiguous?: (word: string) => boolean,
 *   pronounce: (word: string) => string | null,
 * }} English  see englishWords.js
 * @typedef {{ english?: English | null, keepEnglish?: boolean }} EnglishOpts
 */

const dedupe = (list) => [...new Set(list.filter(Boolean))];

/**
 * Which words read as English, by `index`.
 *
 * A plain English word always does. An AMBIGUOUS word - English and Hinglish
 * at once: is, to, he, main, mere - is decided by its neighbours, skipping
 * punctuation:
 *
 *   1. the NEXT word: English -> English, Hindi/Hinglish -> Hindi;
 *   2. if there is none, or it is ambiguous and still undecided, the PREVIOUS
 *      word, the same way;
 *   3. otherwise Hindi, which is what every ambiguous word used to be.
 *
 * An ambiguous neighbour counts once it has been decided, so "he is good"
 * reads English all the way back from `good`. `a` and `I` are ambiguous words
 * too (englishWords.js SINGLE_LETTER_WORDS): "this is a book" stays English.
 * Any other single letter says nothing either way and is skipped like
 * punctuation; it is never changed itself.
 *
 *   bhai is everything good   is -> next is English          -> is
 *   is ghar mein              is -> next is Hindi            -> इस
 *   wo mere ghar he           he -> no next, previous Hindi  -> है
 *
 * @param {Segment[]} segments
 * @param {English | null | undefined} english
 * @returns {Set<number>}
 */
export function readsEnglish(segments, english) {
  const out = new Set();
  if (!english) return out;
  const words = segments.filter(
    (s) => s.kind === 'word' && (s.v.length > 1 || english.isAmbiguous?.(s.v)),
  );
  /** 'en' | 'hi' | null (ambiguous, undecided) */
  const read = words.map((s) =>
    english.isEnglish(s.v) ? 'en' : english.isAmbiguous?.(s.v) ? null : 'hi',
  );
  const open = read.map((r) => r === null);
  for (let i = words.length - 1; i >= 0; i--) {
    if (open[i] && i + 1 < words.length && read[i + 1]) read[i] = read[i + 1];
  }
  for (let i = 0; i < words.length; i++) {
    if (open[i] && read[i] === null && i > 0 && read[i - 1]) read[i] = read[i - 1];
  }
  words.forEach((s, i) => read[i] === 'en' && out.add(s.index));
  return out;
}

/**
 * The candidates for one word, best first: what is shown is index 0.
 *
 * @param {string} roman as typed
 * @param {string[]} found Google's candidates, or the fallback's one
 * @param {EnglishOpts} opts
 * @param {boolean} asEnglish from readsEnglish()
 */
function suggestionsFor(roman, found, { english, keepEnglish }, asEnglish) {
  const lower = roman.toLowerCase();
  const spoken = english?.pronounce(lower) ?? null;
  const pinned = COMMON_WORDS[lower];

  if (asEnglish) {
    const first = keepEnglish ? [roman, spoken] : [spoken];
    // An ambiguous word read as English still offers its Hindi (to -> तो).
    return dedupe([...first, pinned, ...found]).slice(0, MAX_SUGGESTIONS);
  }

  const hindi = dedupe(pinned ? [pinned, ...found] : found);
  // Keep a slot for the English reading, so `to` always offers टू.
  if (spoken && !hindi.includes(spoken)) {
    return [...hindi.slice(0, MAX_SUGGESTIONS - 1), spoken];
  }
  return hindi.slice(0, MAX_SUGGESTIONS);
}

/**
 * Put the segments back together with each word's Hindi.
 *
 * @param {Segment[]} segments
 * @param {Map<string, string[]>} candidates lowercase roman -> candidates
 * @param {Map<string, string> | undefined} picks
 * @param {EnglishOpts} englishOpts
 * @returns {Omit<Typed, 'fellBack'>}
 */
function assemble(segments, candidates, picks, englishOpts) {
  let text = '';
  /** @type {WordSpan[]} */
  const words = [];
  const english = readsEnglish(segments, englishOpts.english);
  for (const seg of segments) {
    if (seg.kind === 'keep') {
      text += seg.v;
      continue;
    }
    const lower = seg.v.toLowerCase();
    const found = candidates.get(lower) ?? [seg.v];
    const suggestions = suggestionsFor(seg.v, found, englishOpts, english.has(seg.index));
    const chosen = picks?.get(pickKey(seg.index, seg.v)) ?? suggestions[0];
    words.push({
      start: text.length,
      end: text.length + chosen.length,
      index: seg.index,
      roman: seg.v,
      suggestions,
    });
    text += chosen;
  }
  return { text, words };
}

const distinctWords = (segments) => [
  ...new Set(segments.filter((s) => s.kind === 'word').map((s) => s.v.toLowerCase())),
];

/**
 * Synchronous, offline: every word from the fallback. What the page shows
 * instantly while Google is still being asked.
 *
 * @param {string} text
 * @param {{ fallback: (word: string) => string, picks?: Map<string, string> } & EnglishOpts} opts
 * @returns {Typed}
 */
export function typeHindiLocal(text, { fallback, picks, english = null, keepEnglish = false }) {
  const segments = tokenize(text);
  const candidates = new Map(distinctWords(segments).map((w) => [w, [fallback(w)]]));
  return { ...assemble(segments, candidates, picks, { english, keepEnglish }), fellBack: false };
}

/**
 * Google for every word, the fallback for any word Google could not answer.
 *
 * An AbortError from `lookup` means the caller superseded this run, and is
 * rethrown rather than treated as a failure.
 *
 * @param {string} text
 * @param {{
 *   lookup: (word: string) => Promise<string[]>,
 *   fallback: (word: string) => string,
 *   picks?: Map<string, string>,
 * } & EnglishOpts} opts
 * @returns {Promise<Typed>}
 */
export async function typeHindi(
  text,
  { lookup, fallback, picks, english = null, keepEnglish = false },
) {
  const segments = tokenize(text);
  const queue = distinctWords(segments);
  const candidates = new Map();
  let fellBack = false;

  async function worker() {
    while (queue.length) {
      const w = queue.shift();
      try {
        const found = await lookup(w);
        if (!found?.length) throw new Error('no candidates');
        candidates.set(w, found);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        // An English word is spelled from its pronunciation, not by Google, so
        // Google failing on it changes nothing on screen worth a note.
        if (!english?.isEnglish(w)) fellBack = true;
        candidates.set(w, [fallback(w)]);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  return { ...assemble(segments, candidates, picks, { english, keepEnglish }), fellBack };
}

/**
 * ITRANS mode: no Google, no word splitting - the notation spends `.` `~` `^`
 * on meaning, so its runs are handed to the ITRANS engine whole. URLs, emails
 * and `backticked` English are still kept.
 *
 * @param {string} text
 * @param {(span: string) => string} render ITRANS -> Devanagari
 * @returns {Typed}
 */
export function typeItrans(text, render) {
  let out = '';
  let last = 0;
  const KEEP = new RegExp(`${PROTECTED.source}|\`([^\`\\n]+)\``, 'g');
  for (const m of text.matchAll(KEEP)) {
    out += render(text.slice(last, m.index)) + (m[1] ?? m[0]);
    last = m.index + m[0].length;
  }
  out += render(text.slice(last));
  return { text: out, words: [], fellBack: false };
}

/**
 * Replace one word in already-rendered output with another suggestion,
 * shifting the spans after it. Pure, so the page and the tests share it.
 *
 * @param {Typed} typed
 * @param {number} wordIndex position in typed.words
 * @param {string} choice
 * @returns {Typed}
 */
export function replaceWord(typed, wordIndex, choice) {
  const w = typed.words[wordIndex];
  if (!w) return typed;
  const delta = choice.length - (w.end - w.start);
  const text = typed.text.slice(0, w.start) + choice + typed.text.slice(w.end);
  const words = typed.words.map((x, k) => {
    if (k < wordIndex) return x;
    if (k === wordIndex) return { ...x, end: x.start + choice.length };
    return { ...x, start: x.start + delta, end: x.end + delta };
  });
  return { ...typed, text, words };
}

/** The word under a caret position, or -1. A caret right after a word counts. */
export function wordAt(typed, pos) {
  return typed.words.findIndex((w) => pos >= w.start && pos <= w.end);
}

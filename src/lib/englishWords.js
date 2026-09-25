/**
 * Is a Roman word English or Hinglish? And if English, how is it said?
 *
 * `nice to have` is English and should read नाइस तो हैव... except `to`, which
 * in a Hinglish sentence is almost always तो. So the rule is:
 *
 *   a word is ENGLISH  if it is in public/data/english-words.json
 *                      AND it is none of the HINGLISH words below.
 *
 * HINGLISH is three lists together:
 *   - HINGLISH_ALWAYS: short words that look English and are Hindi in practice
 *   - every word in the site's Hinglish dictionary (translit.js), e.g. jana,
 *     mere, log, din - they are there because people type them as Hindi
 *   - the pinned common words (corrections.js), e.g. hu, he, waha
 * ...minus LOANWORDS: English words that happen to be in the dictionary but
 * should be said the English way (phone -> फ़ोन, mobile -> मोबाइल).
 *
 * An English word is spelled by its English pronunciation (arpabet.js).
 * Everything else goes to Google as before.
 */

import { DICTIONARY_WORDS } from './translit.js';
import { COMMON_WORDS } from './corrections.js';
import { englishToDevanagari } from './arpabet.js';

/** Look English, are Hindi. Always Hinglish, whatever the English list says. */
export const HINGLISH_ALWAYS = [
  'to', 'he', 'main', 'hai', 'ho', 'na', 'par', 'kar', 'bas', 'the', 'me', 'se',
  'hi', 'is', 'us', 'jab', 'tab', 'ab', 'sab', 'kam', 'man', 'bat', 'pass', 'age',
  'more',
];

/** In the Hinglish dictionary, but English words said the English way. */
export const LOANWORDS = [
  'phone', 'guitar', 'computer', 'mobile', 'ticket', 'hotel', 'station',
  'internet', 'motor', 'police', 'train', 'march', 'april',
];

const loan = new Set(LOANWORDS);
export const HINGLISH = new Set(
  [...HINGLISH_ALWAYS, ...DICTIONARY_WORDS, ...Object.keys(COMMON_WORDS)].filter(
    (w) => !loan.has(w),
  ),
);

/**
 * @typedef {{
 *   isEnglish: (word: string) => boolean,
 *   pronounce: (word: string) => string | null,
 * }} English
 */

/**
 * Wrap the loaded word list.
 *
 * `pronounce` answers for ANY word in the English list, Hinglish or not, so the
 * tap-to-pick list can offer टू for `to` even though `to` shows as तो.
 *
 * @param {Record<string, string>} words lowercase word -> ARPAbet
 * @returns {English}
 */
export function makeEnglish(words) {
  const cache = new Map();
  const pronounce = (word) => {
    const w = word.toLowerCase();
    if (!Object.hasOwn(words, w)) return null;
    if (!cache.has(w)) cache.set(w, englishToDevanagari(w, words[w]));
    return cache.get(w);
  };
  const isEnglish = (word) => {
    const w = word.toLowerCase();
    return Object.hasOwn(words, w) && !HINGLISH.has(w);
  };
  return { isEnglish, pronounce };
}

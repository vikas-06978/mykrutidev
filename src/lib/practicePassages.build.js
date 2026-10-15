/**
 * Build-time half of the free practice page: the hardest words of each passage
 * and the Kruti Dev keys that type them. Runs in Astro frontmatter only (it
 * imports the conversion engine, which the browser never loads here).
 */
import { convert } from './fontMaps.js';
import { typeable } from './tutor.build.js';
import { PRACTICE_PASSAGES } from './practicePassages.js';

const OPTS = { keepEnglish: false };

/** The keys that type `word`, spelled with keys that are on the keyboard. */
export const keysFor = (word) => typeable(convert(word, 'unicode', 'kruti-dev', OPTS));

const clean = (w) => w.replace(/[।,?!]/g, '');

/**
 * What makes a word hard in Kruti Dev: half letters and conjuncts, a reph (typed
 * AFTER its letter), the ि sign (typed BEFORE its letter), ृ and the nasals.
 */
export function difficulty(w) {
  let s = (w.match(/्/g) || []).length * 3;
  if (/र्[क-ह]/.test(w)) s += 3;
  s += (w.match(/ि/g) || []).length * 2;
  s += (w.match(/ृ/g) || []).length * 2;
  if (/क्ष|त्र|ज्ञ|श्र/.test(w)) s += 2;
  if (/[ंः]/.test(w)) s += 1;
  return s;
}

/** The `n` hardest words of a text, one form per word, each with its keys. */
export function trickyWords(text, n = 8) {
  const seen = new Set();
  const list = [];
  for (const raw of text.split(/\s+/)) {
    const w = clean(raw);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    const d = difficulty(w);
    if (d >= 1) list.push({ w, d });
  }
  const picked = [];
  for (const x of list.sort((a, b) => b.d - a.d)) {
    // कार्यालय and कार्यालयों teach the same keys.
    if (picked.some((y) => y.w.startsWith(x.w.slice(0, -1)) || x.w.startsWith(y.w.slice(0, -1)))) continue;
    picked.push(x);
    if (picked.length === n) break;
  }
  return picked.map((x) => ({ word: x.w, keys: keysFor(x.w) }));
}

export const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/** Every passage with its word count and tricky words, in order. */
export const practiceList = () =>
  PRACTICE_PASSAGES.map((p, i) => ({ ...p, n: i + 1, words: wordCount(p.text), tricky: trickyWords(p.text) }));

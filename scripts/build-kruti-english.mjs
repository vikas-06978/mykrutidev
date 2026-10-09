#!/usr/bin/env node
/**
 * Builds public/data/kruti-english.json: the English words the Kruti Dev
 * converters may SUGGEST keeping as English ("Maybe English" on the page,
 * unticked until the visitor ticks one).
 *
 *   node scripts/build-kruti-english.mjs
 *
 * It is the 20,000-word list in public/data/english-words.json minus every
 * word that is also Hindi on the Kruti Dev keyboard: each Hindi word in the
 * site's own Hindi and Marathi text, the typing passages and the lessons is
 * written in Kruti Dev keys, and an English word spelled the same (`ls` is
 * से, `dj` is कर, `can` is बंद) is dropped. A suggestion is never applied on
 * its own, so this only keeps the list from crowding the page with Hindi.
 *
 * kruti-english.test.js rebuilds the check from the same sources.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { krutiHindiTokens } from '../src/lib/krutiEnglish.build.js';

const ROOT = new URL('../', import.meta.url);
const all = Object.keys(JSON.parse(readFileSync(new URL('public/data/english-words.json', ROOT), 'utf8')).words);
const hindi = await krutiHindiTokens();
const words = all.filter((w) => /^[a-z]{2,}$/.test(w) && !hindi.has(w));
writeFileSync(
  new URL('public/data/kruti-english.json', ROOT),
  JSON.stringify({
    _about:
      'English words a Kruti Dev converter may suggest keeping as English. From english-words.json (FrequencyWords, CC BY-SA 4.0) minus words that are Hindi in Kruti Dev keys. Built by scripts/build-kruti-english.mjs.',
    words,
  }) + '\n',
);
console.log(`kruti-english.json: ${words.length} words (${all.length - words.length} left out)`);

/**
 * Build time only: every Hindi word the site knows, written in Kruti Dev keys
 * and lower-cased, for scripts/build-kruti-english.mjs and its test.
 */
import { readFileSync } from 'node:fs';
import { convert } from './fontMaps.js';
import { PASSAGES } from './passages.js';
import { LEVELS } from './lessons.js';

const ROOT = new URL('../../', import.meta.url);

export async function krutiHindiTokens() {
  const text = [];
  for (const lang of ['hi', 'mr']) {
    const walk = (o) => {
      if (typeof o === 'string') text.push(o.replace(/<[^>]+>/g, ' '));
      else if (o && typeof o === 'object') for (const k in o) walk(o[k]);
    };
    walk(JSON.parse(readFileSync(new URL(`src/i18n/${lang}.json`, ROOT), 'utf8')));
  }
  for (const p of PASSAGES) text.push(p.text ?? '');
  for (const l of LEVELS) text.push(...l.drills);
  const out = new Set();
  for (const w of text.join(' ').match(/[ऀ-ॿ]+/g) ?? []) {
    const keys = convert(w, 'unicode', 'kruti-dev', { keepEnglish: false });
    out.add(keys.replace(/[^A-Za-z]/g, '').toLowerCase());
    out.add(keys.toLowerCase());
  }
  return out;
}

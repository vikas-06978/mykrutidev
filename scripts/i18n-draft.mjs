// Translating the site into a new language, a piece at a time.
//
//   node scripts/i18n-draft.mjs next <lang> [chars]   the next English still to translate, as JSON
//   node scripts/i18n-draft.mjs add <lang> <file>     check a translated piece and add it to the draft
//   node scripts/i18n-draft.mjs status <lang>         how much is done
//   node scripts/i18n-draft.mjs publish <lang>        write src/i18n/<lang>.json once nothing is missing
//
// The draft lives in i18n-drafts/<lang>.json, outside src/, so a language that
// is half done is never built or published. Every piece is held to the same
// rules as a published language (src/i18n/check.js) before it is added:
// <code> keystrokes, Unicode samples, links, {placeholders}, tags, the brand
// and the Word font names must come through exactly as in English.
//
// Publishing writes the dictionary only. The language goes live when it is
// added to LOCALES (src/i18n/locales.js) and DICTS (src/i18n/index.js), with
// its public/<lang>/manifest.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { checkValue } from '../src/i18n/check.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const en = JSON.parse(readFileSync(`${root}src/i18n/en.json`, 'utf8'));
const [cmd, lang, arg] = process.argv.slice(2);
if (!cmd || !/^[a-z]{2}$/.test(lang ?? '')) {
  console.error('usage: i18n-draft.mjs next|add|status|publish <lang> [chars|file]');
  process.exit(2);
}
const draftFile = `${root}i18n-drafts/${lang}.json`;
const draft = existsSync(draftFile) ? JSON.parse(readFileSync(draftFile, 'utf8')) : {};

const isObj = (x) => x !== null && typeof x === 'object';

/** Every leaf of `node` as [dottedKey, value], in document order. */
function leaves(node, prefix = '') {
  if (!isObj(node)) return [[prefix, node]];
  const entries = Array.isArray(node) ? node.map((v, i) => [String(i), v]) : Object.entries(node);
  return entries.flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

/** The value at a dotted key, or undefined. Page keys hold slashes, never dots. */
function get(node, key) {
  for (const part of key.split('.')) {
    if (!isObj(node) || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/** `b` laid over `a`, in the key order of `shape` (the English). */
function merge(shape, a, b) {
  if (!isObj(shape)) return b !== undefined ? b : a;
  const out = Array.isArray(shape) ? [] : {};
  for (const k of Object.keys(shape)) {
    const v = merge(shape[k], a?.[k], b?.[k]);
    if (v !== undefined && !(isObj(v) && Object.keys(v).length === 0)) out[k] = v;
  }
  return out;
}

/** The subtree a key belongs to, for handing out work: "pages./x", "articles.slug", or the top-level key. */
const unitOf = (key) => {
  const [a, b] = key.split('.');
  return a === 'pages' || a === 'articles' ? `${a}.${b}` : a;
};

/** Rebuild a nested object from leaves, so a piece reads like en.json. */
function nest(pairs) {
  const out = {};
  for (const [key, v] of pairs) {
    const parts = key.split('.');
    let node = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) node[p] = v;
      else node = node[p] ??= Array.isArray(get(en, parts.slice(0, i + 1).join('.'))) ? [] : {};
    });
  }
  return out;
}

const all = leaves(en);
const missing = () => all.filter(([k]) => typeof get(draft, k) !== 'string');

if (cmd === 'next') {
  const budget = Number(arg) || 12000;
  const todo = missing();
  const units = [];
  for (const [k] of todo) if (!units.includes(unitOf(k))) units.push(unitOf(k));
  const pick = [];
  let size = 0;
  for (const u of units) {
    const part = todo.filter(([k]) => unitOf(k) === u);
    const n = JSON.stringify(nest(part)).length;
    if (pick.length && size + n > budget) break;
    pick.push(...part);
    size += n;
  }
  console.log(JSON.stringify(nest(pick), null, 1));
  console.error(`${pick.length} strings, ${size} chars; ${todo.length - pick.length} more after this`);
} else if (cmd === 'add') {
  const piece = JSON.parse(readFileSync(arg, 'utf8'));
  const problems = [];
  const warnings = [];
  for (const [key, value] of leaves(piece)) {
    const source = get(en, key);
    if (typeof source !== 'string') {
      problems.push(`${key}: not a key in en.json`);
      continue;
    }
    for (const p of checkValue(key, source, value)) problems.push(`${key}: ${p}`);
    // Two Indian scripts inside one word is a slip, never intended (हिंदी-তে is
    // fine: the hyphen separates them).
    const block = (c) => Math.floor((c.codePointAt(0) - 0x900) / 0x80);
    // The danda (। ॥) is shared by the scripts, so it never counts.
    for (const w of value.replace(/<[^>]+>|[।॥]/g, ' ').split(/[^\u0900-\u0DFF]+/)) {
      if (w && new Set([...w].map(block)).size > 1) problems.push(`${key}: "${w}" mixes two scripts in one word`);
    }
    // What search engines show, as tests/seo.test.js checks on the built pages.
    if (/^((pages|articles)\.[^.]+|guidesIndex|notFound)\.title$/.test(key) && value.length > 70) problems.push(`${key}: title is ${value.length} characters, at most 70`);
    if (/^((pages|articles)\.[^.]+|guidesIndex|notFound)\.description$/.test(key) && (value.length < 50 || value.length > 160)) {
      problems.push(`${key}: description is ${value.length} characters, 50 to 160`);
    }
    // The same as English, with real words in it: probably left untranslated.
    if (value === source && /[A-Za-z]{4,}\s+[A-Za-z]{3,}/.test(source.replace(/<[^>]+>/g, ''))) warnings.push(key);
  }
  if (problems.length) {
    console.error(`NOT added, ${problems.length} problems:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const next = merge(en, draft, piece);
  mkdirSync(dirname(draftFile), { recursive: true });
  writeFileSync(draftFile, `${JSON.stringify(next, null, 2)}\n`);
  const left = all.filter(([k]) => typeof get(next, k) !== 'string').length;
  if (warnings.length) console.log(`same as English (check these are meant to be): ${warnings.join(', ')}`);
  console.log(`added ${leaves(piece).length} strings. ${all.length - left}/${all.length} done, ${left} to go.`);
} else if (cmd === 'status') {
  const left = missing();
  const chars = left.reduce((n, [, v]) => n + String(v).length, 0);
  console.log(`${lang}: ${all.length - left.length}/${all.length} strings done, ${left.length} to go (${chars} chars of English)`);
} else if (cmd === 'publish') {
  const left = missing();
  if (left.length) {
    console.error(`${left.length} strings still missing, first: ${left.slice(0, 5).map(([k]) => k).join(', ')}`);
    process.exit(1);
  }
  const out = `${root}src/i18n/${lang}.json`;
  writeFileSync(out, `${JSON.stringify(merge(en, {}, draft), null, 2)}\n`);
  console.log(`wrote ${out}`);
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}

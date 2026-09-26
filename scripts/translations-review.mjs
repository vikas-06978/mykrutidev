// Regenerate docs/TRANSLATIONS-REVIEW.md from src/i18n/en.json and hi.json:
//   npm run i18n:review
//
// One row per key: key | English | Hindi | flag. The flags below are the
// strings the translator was not sure about; edit hi.json, then re-run this.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const en = JSON.parse(readFileSync(`${root}src/i18n/en.json`, 'utf8'));
const hi = JSON.parse(readFileSync(`${root}src/i18n/hi.json`, 'utf8'));

const flat = (node, prefix = '') =>
  node !== null && typeof node === 'object'
    ? (Array.isArray(node) ? node.map((v, i) => [String(i), v]) : Object.entries(node)).flatMap(([k, v]) =>
        flat(v, prefix ? `${prefix}.${k}` : k),
      )
    : [[prefix, node]];

const get = (obj, key) => key.split('.').reduce((n, k) => n?.[k], obj);

/** key (or key prefix ending in ".") -> note */
const FLAGS = {
  'lang.bannerText': 'Only the Hindi is ever shown (the banner is for Hindi readers, on English pages). English column is for reference.',
  'lang.bannerCta': 'As above.',
  'groups.Shusha': 'Menu groups use Hindi names (कृतिदेव, मंगल, देवलिस, चाणक्य); Shusha is kept Latin (hidden today - no live page). Items inside the menus keep exact Latin font names.',
  'fontBox.kruti-dev': 'Box label kept Latin "Kruti Dev" (user must recognise the font). Headings use कृतिदेव.',
  'converter.raw': '"रॉ कोड" - is "कच्चा कोड" or "असली कोड" clearer for your users?',
  'converter.keepEnglishHelp': '"अंदाज़े से" for "heuristically". Check it reads naturally.',
  'translit.suggestBefore': 'Intentionally empty: Hindi word order puts the Roman word first ("<code> की दूसरी स्पेलिंग:").',
  'translit.modes.itrans.hint': '"ट-वर्ग" for "retroflex" - correct but school-grammar term. Alternative: "ट ठ ड ढ ण के लिए".',
  'tutor.withYour': 'Word order restructured: the prompt reads "उंगली: <b>बाएँ हाथ की तर्जनी</b>, Shift दबाकर रखें: ..." Check on the live tutor.',
  'tutor.holdingShift': 'See tutor.withYour.',
  'tutor.fingers.': 'तर्जनी / अनामिका are the standard names but a little formal. Alternative: "पहली उंगली" / "तीसरी उंगली". Your call.',
  'tutor.levels.home.': '"होम रो" etc. kept as typists say it (English term in Devanagari). Alternative: "बीच की पंक्ति".',
  'tutor.levels.top.': 'See tutor.levels.home.',
  'tutor.levels.bottom.': 'See tutor.levels.home.',
  'tutor.levels.numbers.': 'See tutor.levels.home.',
  'tutor.notQuite': '"Not quite" -> "थोड़ा और अभ्यास" (a little more practice). Not literal - check tone.',
  'tutor.durations.7200': '"2 घंटे" (plural) vs "1 घंटा" - correct, just confirming.',
  'doc.paragraphOne': 'Hindi has no plural change for पैराग्राफ़ / टेबल, so one and many are the same.',
  'doc.saveAs': 'Kept Word\'s menu names in English ("Save As → Word Document") because that is what Word shows on most office PCs. Change if your users have Hindi Office.',
  'doc.summaryLine': 'Hindi reads "12 पैराग्राफ़ बदले गए · 2 टेबल".',
  'page.pendingStrong': 'Long sentence; kept close to the English because it is the core promise of the site.',
  'keyboard.useOwn': 'Shortened to "अपना कीबोर्ड" (button). The FAQ refers to it by this label.',
  'pages./.title': 'SEO: every Hindi <title> mixes the Hindi phrase with the English search phrase people type (e.g. "Kruti Dev to Unicode"). Confirm you want this mix.',
  'pages./english-to-hindi-typing.body.3':'"लिप्यंतरण" (transliteration) is formal. Alternative: "ट्रांसलिटरेशन". Also used in the FAQ.',
  'pages./english-to-hindi-typing.body.7': '"महाप्राण अक्षर" (aspirated consonants) is a grammar term. Alternative: "ह वाले अक्षर (ख, घ, थ...)".',
  'pages./devlys-to-unicode.body.5': 'Technical: "advance width, contour count and bounding box" rendered loosely as "चौड़ाई, आकार की रेखाएँ और घेरा". Please check.',
  'pages./unicode-to-devlys.body.8': 'Same technical phrase as devlys-to-unicode.body.5.',
  'pages./mangal-to-kruti-dev.body.10': '"Round-tripping" -> "आना-जाना (राउंड-ट्रिप)". Check it is clear.',
  'pages./hindi-typing-test.h1': 'Uses रेमिंगटन in Devanagari; the <title> keeps "Kruti Dev Remington" in Latin for search. Confirm.',
  'pages./abbasi-chanakya-to-unicode.faq.0.a': '"Jamal Abbasi" written as जमाल अब्बासी. Confirm spelling.',
};

const flagFor = (key) => {
  if (FLAGS[key]) return FLAGS[key];
  const prefix = Object.keys(FLAGS).find((k) => k.endsWith('.') && key.startsWith(k));
  if (prefix) return FLAGS[prefix];
  if (/^pages\.[^.]+\.title$/.test(key) && key !== 'pages./.title') return 'SEO mix - see pages./.title';
  return '';
};

// Markdown table cells: one line, pipes escaped, and tags escaped so a viewer
// shows the markup (<code>, <a href>) as text instead of rendering it.
const cell = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const rows = flat(en).map(([key, eng]) => {
  const f = flagFor(key);
  return `| \`${cell(key)}\` | ${cell(eng)} | ${cell(get(hi, key))} | ${f ? `⚠️ ${cell(f)}` : ''} |`;
});
const flagged = rows.filter((r) => r.includes('⚠️')).length;

const md = `# Translations review (English → Hindi)

Generated from \`src/i18n/en.json\` and \`src/i18n/hi.json\` by
\`npm run i18n:review\`. Edit **hi.json**, then re-run the script. Do not edit
this file by hand.

- **${rows.length} keys**, identical in both files (enforced by \`npm test\` and at build time).
- **${flagged} flagged ⚠️** - strings I was not sure about. Search this page for ⚠️.
- Style: simple everyday Hindi. कृतिदेव in headings and running text; exact font
  names in Latin wherever the reader has to type or pick the font (Kruti Dev 010,
  Mangal, DevLys 010, Abbasi Chanakya New). Brand (MyKrutiDev), file types
  (.docx, .txt) and "MS Word" are never translated.

## Deliberately not translated

These are data, not website text, and stay the same on English and Hindi pages:

- Everything typed into or produced by a converter, the Hindi keyboard, the
  typing tool and the typing tutor.
- Legacy-font code examples such as \`fgUnh\`, \`deZ\`, \`Hkkjr\` (always inside
  \`<code translate="no">\`), and the Roman spellings on the typing page.
- The example text each converter's "Try example" button inserts, and the code
  part of the input placeholders (only "(example)" → "(उदाहरण)" changes).
- Typing-tutor practice passages (\`src/lib/passages.js\`) - they are already Hindi.
- Physical key names on the tutor's keyboard drawing (Tab, Caps, Shift, Enter,
  Ctrl, Alt, Space) - they match the printed keys.
- Screen-reader names of individual keys on the on-screen Hindi keyboard (for
  example "rupee sign"). They come from \`src/lib/keyboard.js\`, which is keyboard
  logic and was not changed.
- \`src/components/KrutiKeyHints.astro\` is not used by any page and was not converted.

## All keys

| Key | English | Hindi | Flag |
|---|---|---|---|
${rows.join('\n')}
`;

writeFileSync(`${root}docs/TRANSLATIONS-REVIEW.md`, md);
console.log(`docs/TRANSLATIONS-REVIEW.md: ${rows.length} keys, ${flagged} flagged`);

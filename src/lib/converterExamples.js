/**
 * The "Worked examples" under each converter: a few real phrases, shown the way
 * they look typed in the legacy font and the way they come out, so a visitor
 * can match their own text against them and see what the page does before they
 * paste anything.
 *
 * Nothing here is typed by hand into the page. The phrases below are written in
 * Unicode (the one form that is the same in every language), and each row is
 * produced by running the real conversion code, then CHECKED before it is shown:
 *
 *   - legacy text converts back to exactly the Unicode phrase it came from;
 *   - for a font-to-font page, converting the source font to the target font
 *     gives exactly what converting the Unicode phrase straight to it gives;
 *   - a phrase that needs a letter the font has no key for is left out.
 *
 * A row that fails any check is dropped, never shown, and a page with fewer
 * than MIN_ROWS good rows shows no block at all. src/lib/converterExamples.test.js
 * runs this for every live converter page, and for Kruti Dev and DevLys also
 * compares the rows with src/lib/__fixtures__/independent-kruti-dev.json, typed
 * from the Kruti Dev keyboard rules and not copied from this code's output.
 *
 * `limitsFor` is the other half: what a visitor should know before trusting the
 * output, read off the same data (which letters a font cannot type) or the same
 * rule the converter applies (the colon), so it cannot drift from the code.
 */
import { FONTS, KRUTI_KEYBOARD, convert, unmappedChars } from './fontMaps.js';
import { DEVA_LANGS, devaLangOfPage, scriptOfPage } from './scripts.js';
import { isUnicodeKey } from './wordFonts.js';

/** A block with fewer verified rows than this is not shown. */
export const MIN_ROWS = 3;

/**
 * Phrases by script. `id` picks the one-line "what this shows" (converter.ex*
 * in the language files); the text is Unicode. Chosen so that each Devanagari
 * row exercises a rule that goes wrong in careless converters.
 */
export const PHRASES = {
  // Hindi: short i before its letter, reph after its syllable, ra under a letter, joined letters, a sentence.
  deva: [
    { id: 'imatra', text: 'हिन्दी भाषा' },
    { id: 'reph', text: 'कार्यालय में कर्मचारी' },
    { id: 'rakar', text: 'प्रश्न का उत्तर' },
    { id: 'conjunct', text: 'क्षेत्रीय ज्ञान' },
    { id: 'sentence', text: 'भारत की राजधानी नई दिल्ली है।' },
  ],
  // Marathi (Devanagari fonts, Marathi words)
  mr: [
    { id: 'conjunct', text: 'महाराष्ट्र शासन' },
    { id: 'imatra', text: 'शिक्षण विभाग' },
    { id: 'reph', text: 'विद्यार्थी आणि शिक्षक' },
    { id: 'conjunct', text: 'ज्ञानेश्वर महाराज' },
    { id: 'sentence', text: 'मी मराठी बोलतो.' },
  ],
  // Nepali
  ne: [
    { id: 'phrase', text: 'नेपाल सरकार' },
    { id: 'imatra', text: 'शिक्षा मन्त्रालय' },
    { id: 'word', text: 'काठमाडौं' },
    { id: 'conjunct', text: 'विद्यार्थी र शिक्षक' },
    { id: 'sentence', text: 'म नेपाली हुँ।' },
  ],
  gu: [
    { id: 'phrase', text: 'ગુજરાત સરકાર' },
    { id: 'phrase', text: 'શિક્ષણ વિભાગ' },
    { id: 'word', text: 'ગાંધીનગર' },
    { id: 'conjunct', text: 'વિદ્યાર્થી અને શિક્ષક' },
    { id: 'sentence', text: 'અમે ગુજરાતી ભાષા શીખીએ છીએ.' },
  ],
  ta: [
    { id: 'phrase', text: 'தமிழ்நாடு அரசு' },
    { id: 'phrase', text: 'கல்வித் துறை' },
    { id: 'word', text: 'வணக்கம்' },
    { id: 'word', text: 'பள்ளிக்கூடம்' },
    { id: 'sentence', text: 'நான் தமிழ் கற்கிறேன்.' },
  ],
  bn: [
    { id: 'phrase', text: 'বাংলাদেশ সরকার' },
    { id: 'phrase', text: 'শিক্ষা মন্ত্রণালয়' },
    { id: 'phrase', text: 'আমার সোনার বাংলা' },
    { id: 'conjunct', text: 'গণপ্রজাতন্ত্রী' },
    { id: 'sentence', text: 'আমি বাংলা শিখছি।' },
  ],
};

const text = (r) => (typeof r === 'string' ? r : r.text);
const conv = (s, from, to) => text(convert(s, from, to));
const isUni = (k) => isUnicodeKey(k);

/** Which phrase list a converter page uses, by the script and language its Unicode side holds. */
export function phrasesFor(from, to) {
  const script = scriptOfPage(from, to);
  if (script !== 'deva') return PHRASES[script];
  const lang = devaLangOfPage(from, to);
  if (lang) return PHRASES[lang === DEVA_LANGS.mr ? 'mr' : 'ne'];
  return PHRASES.deva;
}

/**
 * The checked rows for a converter page.
 * @param {string} from font key of the box on the left
 * @param {string} to   font key of the box on the right
 * @returns {{ id: string, unicode: string, source: string, result: string }[] | null} null when too few rows pass
 */
export function examplesFor(from, to) {
  if (!FONTS[from] || !FONTS[to]) return null;
  const rows = [];
  for (const { id, text: uni } of phrasesFor(from, to)) {
    try {
      const legacy = [from, to].filter((k) => !isUni(k));
      // A letter this font has no key for would be left as it was: not a fair example.
      if (legacy.some((k) => unmappedChars(uni, k).length)) continue;
      const source = isUni(from) ? uni : conv(uni, 'unicode', from);
      const result = isUni(to) ? uni : conv(uni, 'unicode', to);
      if (isUni(from) && isUni(to)) continue; // nothing to show: the text does not change
      // 1. each legacy side reads back as the phrase it came from
      if (!isUni(from) && conv(source, from, 'unicode') !== uni) continue;
      if (!isUni(to) && conv(result, to, 'unicode') !== uni) continue;
      // 2. the page's own direction gives exactly the row's result
      if (conv(source, from, to) !== result) continue;
      rows.push({ id, unicode: uni, source, result });
    } catch {
      // A phrase the engine cannot take is left out, like any other that fails.
    }
  }
  return rows.length >= MIN_ROWS ? rows : null;
}

/** A probe covering the letters and signs a Hindi, Marathi or Nepali document can contain. */
const DEVANAGARI_PROBE = Array.from('अआइईउऊऋऌएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह' + 'ािीुूृेैोौंँः्ऽॐ।॥०१२३४५६७८९' + 'क़ख़ग़ज़ड़ढ़फ़य़').join(' ');

/**
 * What a visitor should know about this page's output, read off the code.
 *  - `colon`: on the Kruti Dev keyboard the colon of "विषय:" is typed with the
 *    visarga key (the colon key draws रू), so fontMaps.js types a colon that way
 *    ('fromUnicode') and cannot undo it: legacy text comes back with the visarga ः
 *    ('toUnicode'). null for a page that does not cross that line.
 *  - `unmapped`: letters the OUTPUT font has no key for. They are left as they
 *    were and flagged under the box; Word would draw them in another font.
 * @returns {{ colon: 'toUnicode' | 'fromUnicode' | null, unmapped: string[] }}
 */
export function limitsFor(from, to) {
  const kruti = (k) => KRUTI_KEYBOARD.has(k);
  const colon = kruti(from) && isUni(to) ? 'toUnicode' : isUni(from) && kruti(to) ? 'fromUnicode' : null;
  const out = !isUni(to) ? to : null;
  let unmapped = [];
  if (out && FONTS[out].warnUnmapped && scriptOfPage(from, to) === 'deva') {
    unmapped = [...new Set(unmappedChars(DEVANAGARI_PROBE, out))].filter((c) => c.trim());
  }
  return { colon, unmapped };
}

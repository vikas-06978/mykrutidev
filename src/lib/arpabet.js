/**
 * English pronunciation (CMU ARPAbet) -> Devanagari.
 *
 * Used by the English to Hindi Typing page for words that are English rather
 * than Hinglish: `nice` should become नाइस (how it sounds), not नीस (how its
 * letters read as Hinglish).
 *
 * Input is a CMU Pronouncing Dictionary entry with the stress digits removed,
 * e.g. `K AH M P Y UW T ER` for computer. See scripts/build-english-words.mjs.
 *
 * ---------------------------------------------------------------------------
 * THE RULES, IN SHORT
 *
 *   consonant + consonant   joined with a halant            स्कूल  प्लीज़
 *   nasal + stop            anusvara                        कंप्यूटर  थैंक
 *   NG                      anusvara + ग (none before a stop) सिंग  थैंक
 *   vowel after consonant   matra; AH is the inherent vowel
 *   vowel anywhere else     the independent letter           ऑफ़िस  आइडिया
 *   ER                      AH + R                          कंप्यूटर  पर्सन
 *   word-final AH           आ / ा, since English spells it `a`  कैमरा  चाइना
 *   word-final consonant    no halant - Hindi reads it bare  हैव  फ़ोन
 *   AO                      ऑ                               ऑफ़िस
 *   AA                      ऑ when that vowel is spelled with `o` (doctor,
 *                           shop), otherwise आ (guitar, car)
 *   F, Z, ZH                with nukta: फ़ ज़
 *   T, D                    retroflex ट ड, as Indian English says them
 *   TH, DH                  थ द
 *
 * CMU is American English. Where Indian English says a word differently, the
 * OVERRIDES table below wins - that is the only place a word is spelled by hand.
 */

import { decomposeNukta } from './deva.js';

const NUKTA = '़';
const HALANT = '्';
const ANUSVARA = 'ं';

/** ARPAbet consonant -> Devanagari consonant. */
const CONSONANTS = {
  B: 'ब', CH: 'च', D: 'ड', DH: 'द', F: `फ${NUKTA}`, G: 'ग', HH: 'ह',
  JH: 'ज', K: 'क', L: 'ल', M: 'म', N: 'न', P: 'प', R: 'र', S: 'स',
  SH: 'श', T: 'ट', TH: 'थ', V: 'व', W: 'व', Y: 'य', Z: `ज${NUKTA}`,
  ZH: `ज${NUKTA}`,
};

/** ARPAbet vowel -> [independent letter, matra after a consonant]. */
const VOWELS = {
  AA: ['आ', 'ा'],
  AE: ['ऐ', 'ै'],
  AH: ['अ', ''],
  AO: ['ऑ', 'ॉ'],
  AW: ['आउ', 'ाउ'],
  AY: ['आइ', 'ाइ'],
  EH: ['ए', 'े'],
  EY: ['ए', 'े'],
  IH: ['इ', 'ि'],
  IY: ['ई', 'ी'],
  OW: ['ओ', 'ो'],
  OY: ['ऑय', 'ॉय'],
  UH: ['उ', 'ु'],
  UW: ['ऊ', 'ू'],
};
const AA_AS_O = ['ऑ', 'ॉ'];
const FINAL_AH = ['आ', 'ा'];

/** A nasal before one of these becomes an anusvara: कंप्यूटर, थैंक, इंच. */
const TAKES_ANUSVARA = new Set([
  'B', 'CH', 'D', 'DH', 'F', 'G', 'JH', 'K', 'P', 'S', 'SH', 'T', 'TH', 'Z', 'ZH',
]);

/**
 * Indian-English pronunciations that win over CMU's American ones. Keep this
 * short: every entry is a word spelled by hand instead of by rule.
 */
export const OVERRIDES = {
  mobile: 'मोबाइल',
  hello: 'हेलो',
  doctor: 'डॉक्टर',
  water: 'वॉटर',
  office: 'ऑफ़िस',
  coffee: 'कॉफ़ी',
  college: 'कॉलेज',
  hostel: 'हॉस्टल',
  bottle: 'बोतल',
  data: 'डेटा',
  tomato: 'टमाटर',
  schedule: 'शेड्यूल',
  route: 'रूट',
  party: 'पार्टी',
  city: 'सिटी',
  sorry: 'सॉरी',
  hot: 'हॉट',
  shop: 'शॉप',
  job: 'जॉब',
  box: 'बॉक्स',
};

/**
 * Which written vowel group each spoken vowel came from, so AA can be ऑ in
 * `doctor` and आ in `guitar`. Only trusted when the counts line up; otherwise
 * a word with an `o` and no `a` is taken as the ऑ kind.
 *
 * @param {string} word
 * @param {number} vowelCount
 * @returns {(i: number) => boolean} is the i-th spoken vowel spelled with `o`?
 */
function spelledWithO(word, vowelCount) {
  const groups = word.toLowerCase().match(/[aeiou]+/g) ?? [];
  if (groups.length === vowelCount) {
    return (i) => groups[i].includes('o') && !groups[i].includes('a');
  }
  const guess = /o/.test(word) && !/a/.test(word);
  return () => guess;
}

/**
 * @param {string} phones ARPAbet, space-separated, stress digits optional
 * @param {string} [word] the spelling, used only to choose ऑ or आ for AA
 * @returns {string} Devanagari
 */
export function arpabetToDevanagari(phones, word = '') {
  // ER is a schwa followed by R: कंप्यूटर, पर्सन, फ़ाइअर.
  const ph = phones
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/\d$/, ''))
    .flatMap((p) => (p === 'ER' ? ['AH', 'R'] : [p]));

  const vowelCount = ph.filter((p) => p in VOWELS).length;
  const isO = spelledWithO(word, vowelCount);

  let out = '';
  let pending = false; // last thing written is a consonant with no vowel yet
  let v = 0; // index of the current spoken vowel

  for (let i = 0; i < ph.length; i += 1) {
    const p = ph[i];
    const next = ph[i + 1];

    if (p in VOWELS) {
      let forms = VOWELS[p];
      if (p === 'AA' && isO(v)) forms = AA_AS_O;
      if (p === 'AH' && i === ph.length - 1) forms = FINAL_AH;
      out += pending ? forms[1] : forms[0];
      pending = false;
      v += 1;
      continue;
    }

    // A nasal between a vowel and a stop is an anusvara on that vowel.
    const nasal = p === 'M' || p === 'N' || p === 'NG';
    if (nasal && !pending && out && next && TAKES_ANUSVARA.has(next)) {
      out += ANUSVARA;
      continue;
    }
    // NG anywhere else is still the velar nasal: anusvara + ग (सिंग, सिंगर).
    if (p === 'NG') {
      out += (pending ? HALANT + 'ङ' : ANUSVARA + 'ग');
      pending = true;
      continue;
    }

    const c = CONSONANTS[p];
    if (!c) throw new Error(`Unknown ARPAbet phone: ${p}`);
    out += (pending ? HALANT : '') + c;
    pending = true;
  }
  return out;
}

/**
 * Devanagari for an English word: the override if there is one, else the
 * rules applied to its CMU pronunciation.
 *
 * @param {string} word lowercase
 * @param {string} phones
 */
export function englishToDevanagari(word, phones) {
  // decomposeNukta: a hand-typed फ़ may be the precomposed codepoint, and the
  // rest of the site spells nukta letters as consonant + U+093C.
  return OVERRIDES[word] ? decomposeNukta(OVERRIDES[word]) : arpabetToDevanagari(phones, word);
}

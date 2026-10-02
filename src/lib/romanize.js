/**
 * Hindi (Devanagari) -> Roman letters, in two fixed standards.
 *
 *   iso   ISO 15919, the international standard. One spelling per letter and
 *         back again: ए is ē, ऋ is r̥, ड़ is ṛ, ं is ṁ.
 *   iast  IAST, the scholarly standard most people know (ए e, ऋ ṛ, ं ṃ), with
 *         the ISO letters for what IAST never defined (क़ q, ज़ z, फ़ f, ॉ ô).
 *         ड़ is written r̤ here, because IAST already uses ṛ for ऋ.
 *
 * Every inherent "a" is written, as both standards require: भारत is bhārata.
 * Hindi drops some of them in speech, but WHICH ones cannot be read off the
 * spelling, so a converter that dropped them would be guessing.
 *
 * Not Sanscript: it mishandles exactly the letters Hindi adds to Sanskrit
 * (the nukta letters, ॉ, ँ), and this page has to get those right.
 */

const CONSONANTS = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ṅ',
  च: 'c', छ: 'ch', ज: 'j', झ: 'jh', ञ: 'ñ',
  ट: 'ṭ', ठ: 'ṭh', ड: 'ḍ', ढ: 'ḍh', ण: 'ṇ',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', ळ: 'ḷ',
  श: 'ś', ष: 'ṣ', स: 's', ह: 'h',
};

// Consonant + nukta (़), after NFD has split क़ into क + ़.
const NUKTA_CONSONANTS = {
  क: 'q', ख: 'k͟h', ग: 'ġ', ज: 'z', ड: 'ṛ', ढ: 'ṛh', फ: 'f', य: 'ẏ',
  न: 'ṉ', र: 'ṟ', ळ: 'ḻ',
};

/** Independent vowel -> [iso, iast] */
const VOWELS = {
  अ: ['a', 'a'], आ: ['ā', 'ā'], इ: ['i', 'i'], ई: ['ī', 'ī'], उ: ['u', 'u'], ऊ: ['ū', 'ū'],
  ऋ: ['r̥', 'ṛ'], ॠ: ['r̥̄', 'ṝ'], ऌ: ['l̥', 'ḷ'], ॡ: ['l̥̄', 'ḹ'],
  ए: ['ē', 'e'], ऐ: ['ai', 'ai'], ओ: ['ō', 'o'], औ: ['au', 'au'],
  ऍ: ['ê', 'ê'], ऑ: ['ô', 'ô'], ऎ: ['e', 'e'], ऒ: ['o', 'o'],
};

/** Vowel sign (matra) -> [iso, iast] */
const SIGNS = {
  'ा': ['ā', 'ā'], 'ि': ['i', 'i'], 'ी': ['ī', 'ī'], 'ु': ['u', 'u'], 'ू': ['ū', 'ū'],
  'ृ': ['r̥', 'ṛ'], 'ॄ': ['r̥̄', 'ṝ'], 'ॢ': ['l̥', 'ḷ'], 'ॣ': ['l̥̄', 'ḹ'],
  'े': ['ē', 'e'], 'ै': ['ai', 'ai'], 'ो': ['ō', 'o'], 'ौ': ['au', 'au'],
  'ॅ': ['ê', 'ê'], 'ॉ': ['ô', 'ô'], 'ॆ': ['e', 'e'], 'ॊ': ['o', 'o'],
};

/** Everything else -> [iso, iast] */
const MARKS = {
  'ं': ['ṁ', 'ṃ'], 'ँ': ['m̐', 'm̐'], 'ः': ['ḥ', 'ḥ'], 'ऽ': ["'", "'"],
  'ॐ': ['ōṁ', 'oṃ'], '।': ['|', '|'], '॥': ['||', '||'],
  '०': ['0', '0'], '१': ['1', '1'], '२': ['2', '2'], '३': ['3', '3'], '४': ['4', '4'],
  '५': ['5', '5'], '६': ['6', '6'], '७': ['7', '7'], '८': ['8', '8'], '९': ['9', '9'],
};

const NUKTA = '़';
const VIRAMA = '्';
const RE_DEVANAGARI = /[ऀ-ॿ]/;

export const STANDARDS = ['iast', 'iso'];

/**
 * @param {string} text
 * @param {'iast'|'iso'} standard
 * @returns {{ text: string, missed: string[] }}
 */
export function romanize(text, standard = 'iast') {
  const k = standard === 'iso' ? 0 : 1;
  const chars = [...text.normalize('NFD')];
  const missed = new Set();
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONSONANTS[ch]) {
      let roman = CONSONANTS[ch];
      if (chars[i + 1] === NUKTA && NUKTA_CONSONANTS[ch]) {
        roman = NUKTA_CONSONANTS[ch];
        if (standard === 'iast' && roman.startsWith('ṛ')) roman = roman.replace('ṛ', 'r̤');
        i++;
      } else if (chars[i + 1] === NUKTA) {
        missed.add(ch + NUKTA);
        i++;
      }
      const next = chars[i + 1];
      if (next === VIRAMA) {
        i++;
      } else if (SIGNS[next]) {
        roman += SIGNS[next][k];
        i++;
      } else {
        roman += 'a';
      }
      out += roman;
    } else if (VOWELS[ch]) {
      out += VOWELS[ch][k];
    } else if (MARKS[ch]) {
      out += MARKS[ch][k];
    } else {
      if (RE_DEVANAGARI.test(ch)) missed.add(ch);
      out += ch;
    }
  }
  return { text: out.normalize('NFC'), missed: [...missed] };
}

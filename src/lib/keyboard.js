/**
 * The on-screen Devanagari keyboard layout.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT AN INSCRIPT LAYOUT
 *
 * InScript arranges Devanagari across the QWERTY keys, and it is the right
 * thing to imitate for someone who already types InScript and has lost their
 * keyboard driver. That is not who lands on /hindi-keyboard. They arrive
 * because they have no Hindi keypad at all and never learned one, and they are
 * going to find each letter by eye and click it.
 *
 * For that job an InScript picture is actively worse: the letters are scattered
 * by key position, so finding भ means scanning thirty unrelated glyphs. So the
 * keys are laid out in वर्णमाला order instead - the order every Hindi speaker
 * learned in school, vowels then the five consonant groups - and finding a
 * letter is reading, not searching.
 *
 * The physical keyboard is never intercepted, so anyone who DOES have a Hindi
 * layout installed just types and ignores all of this.
 * ---------------------------------------------------------------------------
 *
 * `ins` is what gets inserted. `key` is what is drawn on the cap, which differs
 * only for the combining marks: a bare matra drawn on its own renders on a
 * dotted circle or, worse, tries to attach to the cap's border. They are drawn
 * as ◌ा (U+25CC plus the mark), which is the convention Unicode charts use, and
 * insert the mark alone.
 */

const DOTTED = '◌';

/** A combining mark: shown on a dotted circle, inserted bare. */
const mark = (ch, name) => ({ key: DOTTED + ch, ins: ch, name });
/** An ordinary key, where what you see is what you get. */
const plain = (ch, name) => ({ key: ch, ins: ch, name });

/**
 * @typedef {object} Key
 * @property {string} key   the cap label
 * @property {string} ins   the string inserted on click
 * @property {string} [name] accessible name, where the label is not enough
 *
 * @typedef {object} KeyRow
 * @property {string} label  the row heading
 * @property {Key[]} keys
 */

// ---------------------------------------------------------------------------
// Smart vowels
// ---------------------------------------------------------------------------
//
// ONE vowel row, not a vowel row and a matra row. A vowel key inserts the full
// vowel (इ) at the start of a word and its matra (ि) straight after a
// consonant, which is the only place a matra can go - so the user never has to
// know the two are different keys. अ after a consonant inserts nothing: the
// consonant already carries it.

/** Full vowel -> its matra. '' for अ, whose "matra" is the inherent vowel. */
export const VOWEL_MATRA = {
  अ: '', आ: 'ा', इ: 'ि', ई: 'ी', उ: 'ु', ऊ: 'ू', ऋ: 'ृ',
  ए: 'े', ऐ: 'ै', ओ: 'ो', औ: 'ौ',
  // Second layer. ॲ is left out: it has no matra of its own.
  ॠ: 'ॄ', ऌ: 'ॢ', ॡ: 'ॣ', ऍ: 'ॅ', ऑ: 'ॉ', ऎ: 'ॆ', ऒ: 'ॊ',
};

/** A consonant, including the precomposed nukta letters (क़ U+0958 ...). */
const CONSONANT = /[क-हक़-य़ॹ-ॿ]/;
const NUKTA = '़';

/**
 * Does a consonant end right before `pos`? A consonant + nukta (क + ़) counts,
 * since that is how the site spells क़.
 *
 * @param {string} text
 * @param {number} pos
 */
export function consonantBefore(text, pos) {
  let i = pos - 1;
  if (text[i] === NUKTA) i -= 1;
  return i >= 0 && CONSONANT.test(text[i]);
}

/**
 * What a key inserts, given the text before the caret.
 *
 * @param {string} ins     the key's own `ins` (a full vowel, for vowel keys)
 * @param {boolean} afterConsonant
 */
export const smartIns = (ins, afterConsonant) =>
  afterConsonant && ins in VOWEL_MATRA ? VOWEL_MATRA[ins] : ins;

/**
 * Press a key: returns the new text and caret. Replaces any selection, and
 * decides vowel-or-matra from whatever is left in front of the caret - so a
 * vowel typed over a selection still joins the consonant before it.
 *
 * @param {string} text
 * @param {number} start selection start
 * @param {number} end   selection end
 * @param {string} ins   the key pressed
 * @returns {{ text: string, caret: number }}
 */
export function pressKey(text, start, end, ins) {
  const s = smartIns(ins, consonantBefore(text, start));
  return { text: text.slice(0, start) + s + text.slice(end), caret: start + s.length };
}

/** The cap label for a vowel key: the matra on a dotted circle after a consonant. */
export const vowelLabel = (vowel, afterConsonant) =>
  afterConsonant && VOWEL_MATRA[vowel] ? DOTTED + VOWEL_MATRA[vowel] : vowel;

/** The accessible name for a vowel key, e.g. "matra ि" after a consonant. */
export const vowelName = (vowel, afterConsonant) => {
  if (!afterConsonant) return vowel;
  if (vowel in VOWEL_MATRA && VOWEL_MATRA[vowel] === '') return `${vowel} (no matra)`;
  return VOWEL_MATRA[vowel] ? `matra ${VOWEL_MATRA[vowel]}` : vowel;
};

/** The default layer: everything needed to write ordinary Hindi. */
/** @type {KeyRow[]} */
export const BASE_ROWS = [
  {
    label: 'स्वर',
    // Smart: each inserts its matra after a consonant. See VOWEL_MATRA.
    keys: ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ'].map((c) => plain(c)),
  },
  {
    label: 'व्यंजन',
    keys: [
      ...[
        'क', 'ख', 'ग', 'घ', 'ङ',
        'च', 'छ', 'ज', 'झ', 'ञ',
        'ट', 'ठ', 'ड', 'ढ', 'ण',
        'त', 'थ', 'द', 'ध', 'न',
        'प', 'फ', 'ब', 'भ', 'म',
        'य', 'र', 'ल', 'व',
        'श', 'ष', 'स', 'ह',
      ].map((c) => plain(c)),
      // Needed in almost every word, so they live with the consonants.
      mark('्', 'halant'),
      mark('ं', 'anusvara'),
      mark('ँ', 'chandrabindu'),
      mark('ः', 'visarga'),
    ],
  },
  {
    label: 'संयुक्त',
    keys: [
      // Typed constantly and awkward to build by hand out of halants, so they
      // get their own caps even though each is really two letters joined.
      'क्ष', 'त्र', 'ज्ञ', 'श्र',
      'ड़', 'ढ़', 'क़', 'ख़', 'ग़', 'ज़', 'फ़',
    ].map((c) => plain(c)),
  },
  {
    label: 'अंक',
    keys: [
      ...['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'].map((c) => plain(c)),
      // । is on the bottom row, beside Space - see BOTTOM_KEYS.
      plain('॥', 'double danda'),
      plain(',', 'comma'),
      plain('?', 'question mark'),
      plain('-', 'hyphen'),
      plain('₹', 'rupee sign'),
    ],
  },
];

/**
 * The second layer.
 *
 * Everything here is real and occasionally needed - Sanskrit vowels, the
 * Marathi and Rajasthani letters, the candra vowels English loanwords use - and
 * none of it belongs on the first screen a beginner sees. One toggle, not a
 * modifier chord: this is a clickable panel, and asking someone to hold Shift
 * while clicking a key with the same mouse is a trick, not a feature.
 */
/** @type {KeyRow[]} */
export const EXTRA_ROWS = [
  {
    label: 'और स्वर',
    keys: [
      plain('ॠ'), plain('ऌ'), plain('ॡ'), plain('ऍ'), plain('ऑ'), plain('ऎ'),
      plain('ऒ'), plain('ॲ'),
    ],
  },
  {
    label: 'और मात्रा',
    keys: [
      mark('ॄ', 'rri matra'),
      mark('ॢ', 'l matra'),
      mark('ॣ', 'll matra'),
      mark('ॅ', 'candra e matra'),
      mark('ॉ', 'candra o matra'),
      mark('ॆ', 'short e matra'),
      mark('ॊ', 'short o matra'),
      mark('़', 'nukta'),
    ],
  },
  {
    label: 'और अक्षर',
    keys: [
      plain('ॐ', 'om'),
      plain('ऽ', 'avagraha'),
      plain('ऩ'), plain('ऱ'), plain('ऴ'), plain('य़'),
    ],
  },
  {
    label: 'चिह्न',
    keys: [
      plain('.', 'full stop'),
      plain('!', 'exclamation mark'),
      plain(';', 'semicolon'),
      plain(':', 'colon'),
      plain('('), plain(')'),
      plain('"'), plain("'"),
      plain('/'), plain('%'),
      plain('॰', 'abbreviation sign'),
    ],
  },
];

/**
 * Characters this keyboard can type that the verified Kruti Dev map has no key
 * for. They pass through the converter untranslated, so the page names them
 * rather than letting someone paste Devanagari into Word under a legacy font
 * and find a blank where the letter should be.
 *
 * ङ and ञ are not on it: Kruti Dev 010 draws them on Alt-code keys (Alt+0179
 * and Alt+0165), and Unicode -> Kruti Dev writes those. This list is Sanskrit
 * vowels, candra signs and Marathi or Dravidian letters.
 *
 * keyboard.test.js pins this list to what the engine actually does: fill a gap
 * in fontMaps.js and the test fails here, asking for the entry to be removed.
 */
export const NO_KRUTI_EQUIVALENT = [
  'ॠ', 'ऌ', 'ॡ', 'ऍ', 'ऎ', 'ऒ', 'ॲ', 'ॐ', 'ऽ', 'ऩ', 'ऱ', 'ऴ', '॰',
  'ॄ', 'ॢ', 'ॣ', 'ॆ', 'ॊ',
];

/**
 * The bottom row, always visible under either layer. Only । is a character
 * key; Space, Backspace and Enter are drawn by the component.
 */
/** @type {Key[]} */
export const BOTTOM_KEYS = [plain('।', 'danda')];

/** Every character key on both layers and the bottom row. */
export const allKeys = () =>
  [...BASE_ROWS, ...EXTRA_ROWS].flatMap((r) => r.keys).concat(BOTTOM_KEYS);

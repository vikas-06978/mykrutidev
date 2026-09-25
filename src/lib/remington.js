/**
 * The Remington keyboard, as a physical object.
 *
 * Kruti Dev is not a keyboard layout, it is a font - but typing it IS a layout,
 * because the letters sit on fixed US-QWERTY positions and that arrangement is
 * what the Remington typewriter used and what the exams still test. So the
 * tutor needs the QWERTY grid itself: which cap is where, which finger owns it,
 * and which Hindi letter the font draws for it.
 *
 * The grid and the finger assignment are here. The Hindi letters are NOT: they
 * are looked up from the character map by layout(), so this file never claims
 * a key types a letter that the converter disagrees about.
 *
 * Imported by the tutor's client script, so it must not import fontMaps.js -
 * the map is passed in.
 */

// ============================================================================
// Fingers
// ============================================================================

/**
 * Standard touch-typing assignment, home keys ASDF / JKL;.
 *
 * The index fingers each cover two columns, which is why they own eight keys
 * apiece and why `4 5 r t f g v b` all belong to one finger. Everything here is
 * the ordinary arrangement taught for QWERTY; Remington changes which letter
 * appears, never which finger presses it.
 */
export const FINGERS = [
  { id: 'l-pinky', hand: 'left', name: 'Left little finger', home: 'a' },
  { id: 'l-ring', hand: 'left', name: 'Left ring finger', home: 's' },
  { id: 'l-middle', hand: 'left', name: 'Left middle finger', home: 'd' },
  { id: 'l-index', hand: 'left', name: 'Left index finger', home: 'f' },
  { id: 'thumb', hand: 'both', name: 'Thumb', home: ' ' },
  { id: 'r-index', hand: 'right', name: 'Right index finger', home: 'j' },
  { id: 'r-middle', hand: 'right', name: 'Right middle finger', home: 'k' },
  { id: 'r-ring', hand: 'right', name: 'Right ring finger', home: 'l' },
  { id: 'r-pinky', hand: 'right', name: 'Right little finger', home: ';' },
];

/** Which finger owns each unshifted cap. */
const OWNER = {
  'l-pinky': ['`', '1', 'q', 'a', 'z'],
  'l-ring': ['2', 'w', 's', 'x'],
  'l-middle': ['3', 'e', 'd', 'c'],
  'l-index': ['4', '5', 'r', 't', 'f', 'g', 'v', 'b'],
  'r-index': ['6', '7', 'y', 'u', 'h', 'j', 'n', 'm'],
  'r-middle': ['8', 'i', 'k', ','],
  'r-ring': ['9', 'o', 'l', '.'],
  'r-pinky': ['0', '-', '=', 'p', '[', ']', '\\', ';', "'", '/'],
  thumb: [' '],
};

const FINGER_OF = new Map();
for (const [finger, keys] of Object.entries(OWNER)) {
  for (const k of keys) FINGER_OF.set(k, finger);
}

// ============================================================================
// The grid
// ============================================================================

/**
 * Four rows of caps, each `[unshifted, shifted]`.
 *
 * US QWERTY, which is what a Remington Hindi layout is defined against. The
 * modifier caps (Tab, Caps, Shift, Enter) are added by layout() rather than
 * listed here, because they carry no letter and their only job is to make the
 * picture look like a keyboard.
 */
const GRID = [
  [
    ['`', '~'], ['1', '!'], ['2', '@'], ['3', '#'], ['4', '$'], ['5', '%'],
    ['6', '^'], ['7', '&'], ['8', '*'], ['9', '('], ['0', ')'], ['-', '_'],
    ['=', '+'],
  ],
  [
    ['q', 'Q'], ['w', 'W'], ['e', 'E'], ['r', 'R'], ['t', 'T'], ['y', 'Y'],
    ['u', 'U'], ['i', 'I'], ['o', 'O'], ['p', 'P'], ['[', '{'], [']', '}'],
    ['\\', '|'],
  ],
  [
    ['a', 'A'], ['s', 'S'], ['d', 'D'], ['f', 'F'], ['g', 'G'], ['h', 'H'],
    ['j', 'J'], ['k', 'K'], ['l', 'L'], [';', ':'], ["'", '"'],
  ],
  [
    ['z', 'Z'], ['x', 'X'], ['c', 'C'], ['v', 'V'], ['b', 'B'], ['n', 'N'],
    ['m', 'M'], [',', '<'], ['.', '>'], ['/', '?'],
  ],
];

/** The keys a touch typist rests on. Marked with a bump on a real keyboard. */
export const HOME_KEYS = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];

/** Vowel signs have no shape alone, so a cap draws them on a dotted circle. */
const DOTTED = '◌';
const RE_COMBINING = /^[ऀ-ःऺ-़ा-ॏ॑-ॗॢॣ]/;

const capLabel = (deva) =>
  deva && RE_COMBINING.test(deva) ? DOTTED + deva : deva;

/**
 * @typedef {object} Cap
 * @property {string} base       the unshifted character
 * @property {string} shift      the shifted character
 * @property {string} baseDeva   what the font draws for `base`, '' if nothing
 * @property {string} shiftDeva  what the font draws for `shift`, '' if nothing
 * @property {string} baseLabel  baseDeva, on a dotted circle if it is a mark
 * @property {string} shiftLabel
 * @property {string} finger     a FINGERS id
 * @property {string} hand
 * @property {boolean} home      one of the eight resting keys
 */

/**
 * Resolve the grid against a font's character map.
 *
 * Only single-character map entries are used. The two-key sequences (`Hk` for
 * भ) are real and are taught in their own lesson, but they are not what any one
 * cap produces, and printing भ on the H cap would be a lie the moment somebody
 * pressed it on its own.
 *
 * @param {Record<string,string>} map legacy key -> Unicode, from FONTS[x].map
 * @returns {Cap[][]} rows
 */
export function layout(map) {
  const deva = (ch) => {
    const v = map[ch];
    return typeof v === 'string' && /[ऀ-ॿ]/.test(v) ? v : '';
  };

  return GRID.map((row) =>
    row.map(([base, shift]) => {
      const baseDeva = deva(base);
      const shiftDeva = deva(shift);
      return {
        base,
        shift,
        baseDeva,
        shiftDeva,
        baseLabel: capLabel(baseDeva),
        shiftLabel: capLabel(shiftDeva),
        finger: FINGER_OF.get(base) ?? '',
        hand: handOf(FINGER_OF.get(base) ?? ''),
        home: HOME_KEYS.includes(base),
      };
    }),
  );
}

const handOf = (finger) => FINGERS.find((f) => f.id === finger)?.hand ?? '';

// ============================================================================
// Answering "what do I press, and with what"
// ============================================================================

const SHIFTED = new Map();
for (const row of GRID) for (const [base, shift] of row) SHIFTED.set(shift, base);

/**
 * Where a character lives on the keyboard.
 *
 * `cap` is the physical key to light up - for `H` that is the `h` cap, because
 * the keyboard has no separate H key. `shift` says whether it needs the Shift
 * key held, and `shiftFinger` names the pinky that holds it: the OPPOSITE hand
 * to the one pressing the letter, which is the part everybody gets wrong and
 * the reason their little finger hurts.
 *
 * @param {string} ch a single character the user must type
 * @returns {{ cap: string, shift: boolean, finger: string, shiftFinger: string }|null}
 */
export function locate(ch) {
  if (!ch) return null;
  if (ch === ' ') return { cap: ' ', shift: false, finger: 'thumb', shiftFinger: '' };

  const shifted = SHIFTED.has(ch);
  const cap = shifted ? SHIFTED.get(ch) : ch;
  const finger = FINGER_OF.get(cap);
  if (!finger) return null;

  return {
    cap,
    shift: shifted,
    finger,
    // Shift is held by the hand that is NOT typing the letter.
    shiftFinger: shifted ? (handOf(finger) === 'left' ? 'r-pinky' : 'l-pinky') : '',
  };
}

/** Every character this keyboard can produce, unshifted and shifted. */
export const allCaps = () => GRID.flat();

/** Can every character of this string be pressed on the board above? */
export const isTypeable = (keys) => [...keys].every((ch) => locate(ch) !== null);

/** The characters of `keys` that have no cap, de-duplicated and in order. */
export const untypeable = (keys) => [
  ...new Set([...keys].filter((ch) => locate(ch) === null)),
];

/**
 * Kruti Dev characters that no US QWERTY cap produces.
 *
 * ---------------------------------------------------------------------------
 * Kruti Dev is an 8-bit font and its map reaches past ASCII into the 0xA0–0xFF
 * range. A real Kruti Dev keyboard driver puts those somewhere - but "somewhere"
 * varies by driver, and this tutor draws a keyboard and tells people which key
 * to hit. Printing a guess on a cap would teach a keystroke that does nothing.
 *
 * Four of them have an ordinary spelling that produces the identical Unicode,
 * and tutor.build.js substitutes those - see TYPEABLE_SPELLING. The two here
 * have no alternative in the map at all:
 *
 *   ¡  ँ  chandrabindu
 *   Å  ऊ
 *
 * So tutor content must not need them, which remington.test.js enforces over
 * every passage and drill on the site. In practice that costs nothing: modern
 * Hindi writes the nasal with ं rather than ँ (गांव, हूं, पूंजी are all standard
 * printed spellings), and the passages use those.
 * ---------------------------------------------------------------------------
 */
export const NO_CAP = ['¡', 'Å'];

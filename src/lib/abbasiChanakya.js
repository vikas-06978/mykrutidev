// ============================================================================
// Abbasi Chanakya New - legacy Hindi font by Jamal Abbasi (2010)
// ============================================================================
//
// THE DATA IS NOT WRITTEN HERE. It is read from the handoff file, verbatim:
//
//   vendor/fonts/Abbasi Chanakya New/abbasi-chanakya-mapping.json
//
// That file was built glyph by glyph from the real font file (the same file
// public/fonts/abbasi-chanakya-new.woff is converted from), and every entry was
// drawn in that font next to the Unicode it produces. The rules for using it
// are in HANDOFF-abbasi-chanakya.md beside it. Do not add, guess or "fix"
// entries here: change the JSON, with the evidence, or not at all.
//
// This is NOT the `chanakya` table in fontMaps.js. That one is a Walkman-style
// Remington layout that no font we hold draws, and several of its keys mean
// something else in this font (`Q` is a full फ here, `=` is a full त्र, `Ü` is
// a full श, `_` is ऋ, ...). The two must never share entries.
//
// The .py files in that folder are a reference implementation, kept for
// comparison only. Nothing in src/ imports them.
//
// Confidence: every entry carries `H` (verified visually) or `M` (best reading,
// to confirm against a real Abbasi Chanakya New document). The M entries are
// `Dk` क, `Úk` न, `à` ह्न, `å`/`ú` ०, `ñ` ॰. Until a real document has been
// run through the converter the page is labelled Beta.

import data from '../../vendor/fonts/Abbasi Chanakya New/abbasi-chanakya-mapping.json' with { type: 'json' };

/**
 * One plain legacy -> Unicode table, `multi` and `single` together. Longest
 * match first is the engine's job (the trie in fontMaps.js), so order here
 * does not decide which key wins.
 *
 * Built strictly: a key that appears twice, or that is also a reorder marker,
 * would be silently overwritten by an object literal. Here it throws instead,
 * so a bad edit to the JSON fails the build rather than the output.
 *
 * @type {Record<string, string>}
 */
export const ABBASI_CHANAKYA_TABLE = {};

const markers = new Set([
  ...Object.keys(data.reorder.preBase_iMatra),
  ...Object.keys(data.reorder.postSyllable_reph),
]);

for (const { from, to } of [...data.multi, ...data.single]) {
  if (from in ABBASI_CHANAKYA_TABLE) {
    throw new Error(`abbasi-chanakya-mapping.json: "${from}" is mapped twice`);
  }
  if (markers.has(from)) {
    throw new Error(`abbasi-chanakya-mapping.json: "${from}" is both a mapping and a reorder marker`);
  }
  ABBASI_CHANAKYA_TABLE[from] = to;
}

/**
 * Typed BEFORE the consonant cluster, belongs AFTER it: `f` ि and `Ç` िं.
 * @type {Record<string, string>}
 */
export const PRE_BASE_I_MATRA = data.reorder.preBase_iMatra;

/**
 * Typed AFTER the syllable: emit the sign where it stands, and move र् to the
 * start of the syllable. `Z` reph, `±` reph+ं, `Æ` reph+ि, `É` reph+िं, `Ê` reph+ी.
 * @type {Record<string, { emit: string, reph: boolean }>}
 */
export const POST_SYLLABLE_REPH = data.reorder.postSyllable_reph;

/**
 * Keys the font has but the mapping deliberately leaves alone (¤ § ö Ú). They
 * pass through unchanged: not in the table means the engine copies them.
 * @type {Record<string, string>} key -> why it is unmapped
 */
export const EXCLUDED = data.excluded;

/** The handoff's ground-truth words: legacy input -> expected Unicode. */
export const TESTS = data.tests;

// ============================================================================
// Unicode -> Abbasi Chanakya New: ONE canonical key per Unicode value
// ============================================================================
//
// The forward table is many-to-one (ध is `/k`, `èk` and `Ëk`), so the reverse
// cannot be derived by "first key wins" without the choice being an accident
// of JSON order. These choices were made explicitly, preferring H entries.
// abbasiChanakya.test.js proves every one of them converts back to exactly its
// Unicode through the forward converter, except the ONE_WAY set below.
//
// The reorder markers (ि -> f before the cluster, िं -> Ç, reph -> Z after the
// syllable) are applied by the engine in fontMaps.js, not here.

const CONSONANTS = {
  क: 'd', ख: '[k', ग: 'x', घ: 'Ä', ङ: '³',
  च: 'p', छ: 'N', ज: 't', झ: '>', ञ: '¥',
  ट: 'V', ठ: 'B', ड: 'M', ढ: '<', ण: '.k',
  त: 'r', थ: 'Fk', द: 'n', ध: '/k', न: 'u',
  प: 'i', फ: 'Q', ब: 'c', भ: 'Ò', म: 'e',
  य: ';', र: 'j', ल: 'y', ळ: 'G', व: 'o',
  श: "'k", ष: '"k', स: 'l', ह: 'g',
};

/** Consonant + ्. Any consonant not listed falls back to its key + `~`. */
const HALF_FORMS = {
  'क्': 'D', 'ख्': '[', 'ग्': 'X', 'घ्': '?', 'च्': 'P', 'ज्': 'T', 'झ्': 'Ö',
  'ण्': '.', 'त्': 'R', 'थ्': 'F', 'ध्': '/', 'न्': 'U', 'प्': 'I', 'फ्': '¶',
  'ब्': 'C', 'भ्': 'H', 'म्': 'E', 'य्': '¸', 'ल्': 'Y', 'व्': 'O', 'श्': "'",
  'ष्': '"', 'स्': 'L', 'ह्': 'º', 'क्ष्': '{', 'त्र्': '«', 'त्त्': 'Ù',
};

/** Conjuncts with their own glyph. Longest match is the trie's job. */
const CONJUNCTS = {
  'क्ष': '{k', 'त्र': '=', 'ज्ञ': 'K', 'श्र': 'J', 'क्क': 'ô', 'क्त': 'ä', 'क्र': 'Ø',
  'कृ': 'Ñ', 'ख्र': '£', 'त्त': 'Ùk', 'द्य': '|', 'द्व': '}', 'द्ध': ')', 'द्द': 'í',
  'द्म': 'ù', 'द्र': 'æ', 'न्न': 'é', 'प्र': 'ç', 'फ्र': 'Ý', 'स्न': 'ó', 'ह्न': 'à',
  'ह्य': 'á', 'हृ': 'â', 'ह्म': 'ã', 'ट्ट': 'ê', 'ट्ठ': 'ë', 'ठ्ठ': 'ð', 'ड्ड': 'ì',
  'ड्ढ': 'ï', 'छ्य': 'Nî', 'ट्य': 'Vî', 'ठ्य': 'Bî', 'ड्य': 'Mî', 'ढ्य': '<î',
  'रु': '#', 'रू': ':',
};

/** Rakar (्र after a consonant) is ª after these, z after everything else. */
const RAKAR_TAIL_ALT = 'टठडढछ';

const VOWELS = {
  अ: 'v', आ: 'vk', इ: 'b', ई: 'Ã', उ: 'm', ऊ: 'Å', ऋ: '_',
  ए: ',', ऐ: ',s', ओ: 'vks', औ: 'vkS', ऑ: 'vkW', 'ईं': 'b±',
};

// ो and ौ need no entry: the engine splits them into ा + े / ा + ै before
// lookup, exactly as for Kruti Dev, which gives the chosen `ks` / `kS`.
const SIGNS = {
  'ा': 'k', 'ि': 'f', 'ी': 'h', 'ीं': 'È', 'ु': 'q', 'ू': 'w', 'ृ': '`',
  'े': 's', 'ै': 'S', 'ैं': 'õ', 'ं': 'a', 'ँ': '¡', 'ॅ': 'W',
  '़': '+', '्': '~', 'ऽ': '·', '।': 'A', '॰': 'ñ',
};

const PUNCTUATION = {
  '.': '-', ',': ']', '?': '\\', ';': '(', ':': '%', '-': '&', '/': '@', '+': '$',
  '=': '¾', '(': '¼', ')': '½', '[': '¿', ']': 'À', '’': '*', '‘': '^', '÷': '»',
};

/**
 * Characters this font has no key for, written as the nearest thing it DOES
 * have. Deliberately lossy: converting back does not return the original.
 */
export const ONE_WAY = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  'ः': '%', // draws like a visarga in this font, but reads back as :
  "'": '*', // ' is the श् key, so a straight quote becomes ’
  '"': '**', // " is the ष् key
};

/** Unicode -> Abbasi Chanakya New keys, before the engine's reorder markers. */
export const ABBASI_CHANAKYA_REVERSE = {};
for (const [c, key] of Object.entries(CONSONANTS)) {
  ABBASI_CHANAKYA_REVERSE[c] = key;
  // Without these, ग्र would match the half form ग् and come out `Xj`.
  const tail = RAKAR_TAIL_ALT.includes(c) ? 'ª' : 'z';
  ABBASI_CHANAKYA_REVERSE[`${c}्र`] = key + tail;
  ABBASI_CHANAKYA_REVERSE[`${c}़्र`] = `${key}+${tail}`;
}
// Later groups win, so a dedicated conjunct glyph (क्र Ø) beats the generated
// rakar spelling (क्र dz).
Object.assign(
  ABBASI_CHANAKYA_REVERSE,
  HALF_FORMS,
  CONJUNCTS,
  VOWELS,
  SIGNS,
  PUNCTUATION,
  ONE_WAY,
);
ABBASI_CHANAKYA_REVERSE['्र'] = 'z';

/** H/M per key, for anyone who needs to know how sure a mapping is. */
export const CONFIDENCE = Object.fromEntries(
  [...data.multi, ...data.single].map(({ from, confidence }) => [from, confidence]),
);

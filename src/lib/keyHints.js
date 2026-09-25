/**
 * The Kruti Dev key chart, derived from the character map.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS TYPED BY HAND, AND THAT IS THE POINT.
 *
 * A key chart is a promise: "press this key and you get this letter". The last
 * hand-written table on this site was the transliteration tip strip, which
 * promised `ri` = ऋ while the engine actually produced री - a table and an
 * engine that agreed on the day the table was written and drifted apart after.
 *
 * So the chart is read out of FONTS[key].map at build time. It can only ever
 * say what the converter does, and a change to the map changes the chart in the
 * same commit.
 * ---------------------------------------------------------------------------
 */

const DOTTED = '◌';

/** Vowel signs and the marks that have no shape of their own. */
const RE_COMBINING = /^[ऀ-ःऺ-़ा-ॏ॑-ॗॢॣ]/;

/**
 * The order the keys are printed in.
 *
 * Lowercase, then uppercase, then digits, then everything else - the order a
 * hand finds them on a QWERTY keyboard, which is what the learner is staring
 * at. Sorting by the Hindi letter instead would be correct alphabetically and
 * useless practically.
 */
function keyRank(k) {
  const c = k[0];
  if (c >= 'a' && c <= 'z') return [0, k];
  if (c >= 'A' && c <= 'Z') return [1, k];
  if (c >= '0' && c <= '9') return [2, k];
  return [3, k];
}

const byKey = (a, b) => {
  const [ra, ka] = keyRank(a.key);
  const [rb, kb] = keyRank(b.key);
  if (ra !== rb) return ra - rb;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/**
 * Split a legacy font's map into a printable chart.
 *
 * `singles` are the keys that produce a letter on their own. `combos` are the
 * two-key sequences, which on Kruti Dev are overwhelmingly the "half consonant
 * + vertical bar" rule - `Hk` is भ because भ has no key of its own. Those are
 * the entries a learner most needs told, because nothing about the keyboard
 * hints at them.
 *
 * Longer sequences (`Hkz` = भ्र, `vks` = ओ) are left out: they are compositions
 * of the rules above, and printing every one turns a chart into a dictionary.
 *
 * @param {Record<string, string>} map legacy key -> Unicode
 * @returns {{ singles: Hint[], combos: Hint[] }}
 *
 * @typedef {object} Hint
 * @property {string} key    what to press
 * @property {string} deva   what appears
 * @property {string} label  `deva`, on a dotted circle when it is a bare mark
 */
export function keyHints(map) {
  const singles = [];
  const combos = [];

  for (const [key, deva] of Object.entries(map)) {
    // Sentinels and anything that is not Devanagari have no place on a chart
    // showing which Hindi letter a key types.
    if (!/[ऀ-ॿ]/.test(deva)) continue;

    const hint = { key, deva, label: RE_COMBINING.test(deva) ? DOTTED + deva : deva };

    if (key.length === 1) singles.push(hint);
    else if (key.length === 2) combos.push(hint);
  }

  return { singles: singles.sort(byKey), combos: combos.sort(byKey) };
}

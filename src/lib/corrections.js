/**
 * The nasal words, corrected by hand after either engine has had its go.
 *
 * ---------------------------------------------------------------------------
 * WHY A THIRD PASS EXISTS WHEN THERE ARE ALREADY TWO ENGINES
 *
 * A short list of very common words comes out without its nasal mark, and it
 * comes out wrong from BOTH engines - but not the same ones from each, which is
 * why neither engine could own the fix:
 *
 *              wanted   Google   rules (translit.js)
 *   hu         हूँ       हु  ✗     हूँ  ✓
 *   he         है       हे  ✗     हे  ✗
 *   kahi       कहीं      कही ✗     कही ✗
 *   waha       वहाँ      वह  ✗     वहा ✗
 *   wahan      वहाँ      वहां ✗     वहाँ ✓
 *   nhi        नहीं      नहीं ✓     न्ही ✗
 *   yaha       यहाँ      यहाँ ✓     यहा ✗
 *   maa        माँ       माँ  ✓     मां ✗
 *
 * Splitting the table in two - some entries in the rule dictionary, some in a
 * Google post-filter - would mean the page spelled `waha` one way online and
 * another way offline. These are the words in every other sentence; they are
 * the last ones that should change under the user when the network drops. So
 * there is ONE table, applied to whatever Hindi came back, and both engines are
 * held to the same answer.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS KEYED ON THE ROMAN, NOT THE DEVANAGARI
 *
 * The obvious alternative is a Devanagari search-and-replace - rewrite हु to
 * हूँ wherever it appears. That cannot work, because the wrong output is not
 * unique to the wrong input: Google returns हु for `hu` and हू for the same
 * `hu` in a different sentence, and वह is a perfectly correct word that
 * something else may have legitimately produced.
 *
 * The Roman spelling is the only thing that actually identifies the word, so
 * the correction reads the input and the output side by side, word by word.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY GIVES UP
 *
 * Every entry here overrules a context-aware model with a fixed answer, so each
 * one is a bet that the casual Hinglish reading is the overwhelmingly likely
 * one. Two are genuinely lossy and worth naming:
 *
 *   he    -> है, so the vocative हे ("O...") is no longer reachable as `he`.
 *   waha  -> वहाँ, so वह is no longer reachable as `waha`. It is still `wo`,
 *            `vo` and `woh`, which is how people actually spell it.
 *
 * Both are taken knowingly: `he` for है and `waha` for वहाँ are what people
 * type, and the output box stays editable for the rest.
 *
 * A word not on this list is never touched. The list is not a place to fix
 * spelling in general - that is the engines' job, and they are better at it.
 */

/**
 * Roman (lowercased, punctuation stripped) -> the Hindi it must come out as.
 *
 * Only the nasal words asked for, plus the spellings people actually use for
 * them. An entry that both engines already get right - `main`, `hai`, `tum` -
 * still earns its place: it costs one Map lookup and it turns "usually right"
 * into a guarantee that survives Google changing its model.
 */
export const COMMON_WORDS = {
  // -- हूँ / मैं : the two words in nearly every sentence --------------------
  hu: 'हूँ', hoon: 'हूँ', hun: 'हूँ', hoo: 'हूँ',
  mai: 'मैं', main: 'मैं',

  // -- है : `he` is the lossy one. See the note above. ----------------------
  hai: 'है', he: 'है',

  // -- नहीं -----------------------------------------------------------------
  nahi: 'नहीं', nahin: 'नहीं', nhi: 'नहीं',

  // -- में ------------------------------------------------------------------
  me: 'में', mei: 'में', mein: 'में',

  // -- हम / तुम : no nasal, listed so they cannot drift ---------------------
  hum: 'हम', tum: 'तुम',

  // -- क्यों -----------------------------------------------------------------
  kyu: 'क्यों', kyun: 'क्यों', kyon: 'क्यों',

  // -- यही / वही : plain ी, no nasal. Here to hold them apart from कहीं ------
  yahi: 'यही', wahi: 'वही', vahi: 'वही',

  // -- कहीं ------------------------------------------------------------------
  kahi: 'कहीं', kahin: 'कहीं',

  // -- यहाँ / वहाँ / जहाँ : chandrabindu, not anusvara ------------------------
  // Google gives वहां for `wahan` and वहाँ for `waha`; the rules give the
  // reverse. Both spellings of the place words are pinned to the chandrabindu
  // form so the page cannot answer the same question two ways.
  yaha: 'यहाँ', yahan: 'यहाँ',
  waha: 'वहाँ', wahan: 'वहाँ', vaha: 'वहाँ', vahan: 'वहाँ',
  jaha: 'जहाँ', jahan: 'जहाँ',

  // -- माँ / हाँ -------------------------------------------------------------
  maa: 'माँ',
  haan: 'हाँ', han: 'हाँ',
};

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

/**
 * Split on whitespace, KEEPING the whitespace, so a join is loss-free.
 *
 * With a capture group, split alternates word / separator / word, which means
 * every even index is a word slot and the string can be rebuilt by changing one
 * slot and joining. Getting this wrong would re-space the user's text.
 */
const ON_SPACE = /(\s+)/;

/**
 * A Roman token that is exactly one word, optionally wrapped in punctuation.
 *
 * The letters have to be a single unbroken run: `hu`, `hu.`, `(hu)`, `"hu",`
 * all qualify and resolve to `hu`. Anything with punctuation INSIDE it -
 * `hu-hu`, `hu's` - deliberately does not match and is left alone, because it
 * is no longer the word this table is about.
 *
 * DIGITS ARE EXCLUDED FROM THE WRAPPER as well as the core, which is the whole
 * reason it is not the simpler `[^A-Za-z]`. A digit next to a word is part of
 * the token rather than punctuation around it: `hu2` is a token containing
 * `hu`, not the word `hu` followed by a full stop, and rewriting it to हूँ2
 * would be the table reaching somewhere it was not invited.
 */
const ROMAN_WORD = /^[^A-Za-z0-9]*([A-Za-z]+)[^A-Za-z0-9]*$/;

/**
 * The same shape on the Devanagari side.
 *
 * The letter range stops short of U+0964 and U+0965 - the danda and double
 * danda - on purpose. They sit inside the Devanagari block but they are full
 * stops, not letters, so counting them as part of the word would swallow the
 * danda and give हूँ where हूँ। belongs. They stay legal in the wrapper, which
 * is exactly where a full stop belongs.
 *
 * ASCII digits are barred from the wrapper for the same reason as on the Roman
 * side: `क2` is one token, not a word with punctuation after it.
 */
const DEVA_LETTER = '\\u0900-\\u0963\\u0966-\\u097F';
const DEVA_WORD = new RegExp(
  `^([^${DEVA_LETTER}0-9]*)[${DEVA_LETTER}]+([^${DEVA_LETTER}0-9]*)$`,
);

/** Indices of the non-empty word slots in a split array. */
function wordSlots(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * Correct the listed words in `hindi`, using `roman` to say which is which.
 *
 * Walks the two strings as parallel lists of words. Where the nth Roman word is
 * in the table, the nth Hindi word is replaced - keeping whatever punctuation
 * was attached to it, so `hu.` stays `हूँ.` and `(waha)` stays `(वहाँ)`.
 *
 * IT REFUSES RATHER THAN GUESSES. If the two sides do not have the same number
 * of words the alignment is not trustworthy, and the function returns the Hindi
 * untouched. That happens when an engine merges or splits a word, and a wrong
 * alignment would put `हूँ` in the middle of an unrelated sentence - far worse
 * than leaving one word unnasalised. The same applies per word: a Hindi token
 * holding no Devanagari at all (a URL, a number, a stray bracket) is skipped,
 * which is a second net under the first.
 *
 * Cost is one Map lookup per word, so it is not something typing can feel.
 *
 * @param {string} roman the input the user typed
 * @param {string} hindi what the engine made of it
 * @returns {string}
 */
export function applyCommonWords(roman, hindi) {
  if (!roman || !hindi) return hindi;

  const rParts = roman.split(ON_SPACE);
  const hParts = hindi.split(ON_SPACE);
  const rAt = wordSlots(rParts);
  const hAt = wordSlots(hParts);
  if (rAt.length !== hAt.length) return hindi;

  let changed = false;
  for (let k = 0; k < rAt.length; k += 1) {
    const m = ROMAN_WORD.exec(rParts[rAt[k]]);
    if (!m) continue;
    const fix = COMMON_WORDS[m[1].toLowerCase()];
    if (!fix) continue;

    const hTok = hParts[hAt[k]];
    const d = DEVA_WORD.exec(hTok);
    if (!d) continue; // nothing here that could be the word

    const next = d[1] + fix + d[2];
    if (next !== hTok) {
      hParts[hAt[k]] = next;
      changed = true;
    }
  }

  return changed ? hParts.join('') : hindi;
}

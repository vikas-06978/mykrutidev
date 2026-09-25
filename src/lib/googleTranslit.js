/**
 * Roman (Hinglish) -> Hindi via Google Input Tools.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, HONESTLY
 *
 * Google Input Tools is the transliteration behind Gboard and the old Google
 * Transliteration IME. The endpoint it speaks to is PUBLIC BUT UNOFFICIAL:
 * free, unauthenticated, CORS-open (verified: it returns
 * `Access-Control-Allow-Origin: *`), documented nowhere, and guaranteed by
 * nobody. Google can change the response shape, rate-limit it, require a key or
 * switch it off tomorrow without telling anyone.
 *
 * So it is treated as an OPTIMISATION, never as a dependency. Every call site
 * must be able to carry on without it - see translit.js, which stays the
 * fallback and is not going anywhere. If this module is ever deleted the page
 * still works; it just guesses more.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS WORTH THE NETWORK CALL
 *
 * translit.js resolves Hinglish's missing information - vowel length, the
 * dropped schwa, retroflex vs dental, the nukta - with a dictionary of a few
 * hundred words and a syllable rewriter. That is as far as rules can go,
 * because the information genuinely is not in the spelling. Google resolves the
 * same ambiguity with a language model that has seen the word in context:
 *
 *   thela    ठेला   (rules: थेला)      tokar    टोकर   (rules: तोकर)
 *   badhiya  बढ़िया  (dictionary hit)   tota     तोता   (rules: तोता, agrees)
 *
 * The dictionary already covers the common cases. Google covers the long tail,
 * which is the half no word list was ever going to reach.
 *
 * ---------------------------------------------------------------------------
 * THE PRIVACY COST, WHICH IS REAL
 *
 * Using this sends what the user typed to Google. The page used to promise that
 * nothing was uploaded and it can no longer promise that, so the page copy says
 * so plainly instead. The Exact (ITRANS) mode never calls this - it is exact by
 * construction and has nothing to gain - so there is always a mode that stays
 * entirely local.
 */

import { splitProtected, decomposeNukta } from './deva.js';
import { applyCommonWords } from './corrections.js';

// ---------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://inputtools.google.com/request';

/** Google's language tag for Roman -> Hindi transliteration. */
const ITC = 'hi-t-i0-und';

/**
 * The longest `text` the endpoint will actually transliterate.
 *
 * MEASURED, not guessed, and it is a hard cliff rather than an error: at 180
 * characters the response is complete, and at 181 it comes back carrying
 * `matched_length: 180` with everything past that silently dropped. A page that
 * ignored this would lose the tail of any paragraph and never say a word about
 * it, which is the worst failure mode available here.
 */
export const MAX_CHUNK = 180;

/** Give up and use the fallback rather than let the box sit stale. */
const TIMEOUT_MS = 3500;

// ---------------------------------------------------------------------------
// Punctuation, which the endpoint does not leave alone
// ---------------------------------------------------------------------------

/**
 * The characters Google DESTROYS, and the stand-ins sent in their place.
 *
 * Measured against the live endpoint, one character at a time, in every
 * position a character can take:
 *
 *   ,   deleted outright. `ek, do` comes back `एक दो`, and `ek,do` comes back
 *       as the single word `एकदो` - so the words are merged too, and no amount
 *       of looking at the answer afterwards can say where the comma had been.
 *   ~   the whole request returns an empty candidate. Not the character: the
 *   ^   entire line vanishes.
 *   |   the response comes back with no segments at all.
 *
 * All four are almost certainly syntax in whatever query language the endpoint
 * speaks. They cannot be repaired after the fact and they cannot be left in, so
 * they are swapped out before the request and swapped back after.
 *
 * The stand-ins are private-use codepoints, verified to survive the round trip
 * untouched in every position - start, end, mid-word, doubled. Private use is
 * the right block precisely because nothing can legitimately mean anything by
 * them, so a collision is a pathological paste rather than ordinary typing, and
 * `containsSentinel` handles even that.
 *
 * This is NOT a place to send anything else. Every character swapped out is one
 * Google no longer sees, and it reads punctuation for context.
 */
const MASKED = [
  [',', ''],
  ['~', ''],
  ['^', ''],
  ['|', ''],
];

const TO_SENTINEL = new Map(MASKED);
const FROM_SENTINEL = new Map(MASKED.map(([c, s]) => [s, c]));

const NEEDS_MASK = /[,~^|]/g;
const IS_SENTINEL = /[-]/;
const SENTINEL = /[-]/g;

const mask = (s) => s.replace(NEEDS_MASK, (c) => TO_SENTINEL.get(c));
const unmask = (s) => s.replace(SENTINEL, (c) => FROM_SENTINEL.get(c));

/**
 * Did the user's own text already contain a stand-in?
 *
 * Only reachable by pasting a private-use codepoint, but if it happened the
 * round trip would hand back a comma the user never typed. So a chunk like that
 * skips masking entirely: the commas in it go back to being dropped, which is
 * Google's ordinary misbehaviour, rather than this module inventing characters.
 */
const containsSentinel = (s) => IS_SENTINEL.test(s);

/**
 * The characters Google ESCAPES rather than destroys.
 *
 * `"` `&` `<` `>` come back as `&quot;` `&amp;` `&lt;` `&gt;`. Left alone this
 * is worse than it looks: the entity is literal text by the time it reaches the
 * Kruti Dev converter, which reads `&quot;` as Devanagari and produces
 * `-ुनवज;`. Decoding is the exact inverse, so unlike the masked set these need
 * nothing sent in their place.
 *
 * One pass, so a decoded `&` can never be read as the start of another entity.
 */
const NAMED = new Map([
  ['amp', '&'], ['quot', '"'], ['lt', '<'], ['gt', '>'],
  ['apos', "'"], ['nbsp', ' '],
]);

function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // Anything outside Unicode, or a surrogate half, is not worth guessing at.
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return whole;
      if (cp >= 0xd800 && cp <= 0xdfff) return whole;
      return String.fromCodePoint(cp);
    }
    return NAMED.get(body.toLowerCase()) ?? whole;
  });
}

/** Exposed for tests. */
export { decodeEntities as _decodeEntities, mask as _mask, unmask as _unmask };

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Cut text into pieces of at most `max` characters, preferring word boundaries.
 *
 * The pieces concatenate back to the input EXACTLY - whitespace included - so
 * the caller can transliterate each and join with nothing between them. Getting
 * this wrong would eat or duplicate spaces at every chunk seam.
 *
 * Splitting on whitespace matters for quality as well as tidiness: the whole
 * reason to use Google is that it reads a word in the context of its
 * neighbours, and a chunk that ends mid-word throws that away twice over.
 *
 * @param {string} text
 * @param {number} [max]
 * @returns {string[]}
 */
export function chunkText(text, max = MAX_CHUNK) {
  if (!text) return [];
  if (text.length <= max) return [text];

  // Tokens are [word][following whitespace], so a join is loss-free and a break
  // between two tokens is always a break between two words.
  const tokens = text.match(/\S+\s*|\s+/g) ?? [];
  const chunks = [];
  let cur = '';

  for (let token of tokens) {
    // A single token longer than the limit - a pasted URL, a 200-character
    // keysmash - has no word boundary to use, so it gets cut where it must.
    while (token.length > max) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      chunks.push(token.slice(0, max));
      token = token.slice(max);
    }
    if (cur.length + token.length > max) {
      chunks.push(cur);
      cur = token;
    } else {
      cur += token;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Pull the transliteration out of an Input Tools response.
 *
 * The shape is an undocumented tuple, so every level is checked before it is
 * indexed. A malformed response must THROW rather than return a partial string:
 * the caller's fallback is good, and half a sentence is worse than a guessed
 * one.
 *
 *   ["SUCCESS", [ [source, [candidate, ...], [], {...}], ... ]]
 *
 * Note the second level is a list of SEGMENTS, not a single answer. Google
 * splits a sentence on its own - `namaste bharat. aaj 25 tarikh hai.` comes
 * back as two - so the top candidate of each, joined in order, is the whole
 * line.
 *
 * The segment SOURCES very nearly reconstruct the request and are not relied on
 * to: the endpoint drops some characters on the way in, which is what the
 * masking above exists to prevent. `matched_length` below is read per segment
 * against that segment's own source, so it is unaffected either way.
 *
 * @param {unknown} payload parsed JSON
 * @param {string} source the text that was sent, for the truncation check
 * @returns {string}
 */
export function parseInputTools(payload, source = '') {
  if (!Array.isArray(payload) || payload[0] !== 'SUCCESS') {
    throw new Error(`Input Tools: ${Array.isArray(payload) ? payload[0] : 'bad response'}`);
  }
  const segments = payload[1];
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Input Tools: no segments');
  }

  let out = '';
  for (const seg of segments) {
    const candidates = Array.isArray(seg) ? seg[1] : null;
    if (!Array.isArray(candidates) || typeof candidates[0] !== 'string') {
      throw new Error('Input Tools: no candidate');
    }
    // `matched_length` is how much of the segment Google actually consumed. It
    // only appears when the request was over the limit, which chunkText() is
    // there to prevent - so if it shows up, the chunking is broken and the
    // answer is short. Refusing it sends the caller to the fallback, which at
    // least returns the whole line.
    const meta = seg[3];
    const matched = meta && Array.isArray(meta.matched_length) ? meta.matched_length[0] : null;
    if (typeof matched === 'number' && matched < seg[0].length) {
      throw new Error(`Input Tools: truncated at ${matched}`);
    }
    out += candidates[0];
  }

  if (source && out === '') throw new Error('Input Tools: empty result');
  return out;
}

// ---------------------------------------------------------------------------
// Digits
// ---------------------------------------------------------------------------

const DEVA_DIGITS = /[०-९]/g;
const HAS_DEVA_DIGIT = /[०-९]/;

/**
 * Put ASCII digits back.
 *
 * Google renders numbers in Devanagari numerals - `aaj 25 tarikh` comes back as
 * `आज २५ तारीख`. The rest of this site does not: translit.js and the font
 * converters both pass digits through untouched so that a pasted phone number,
 * date or form field survives the trip. Two engines behind one toggle have to
 * agree, and the existing behaviour is the one people rely on.
 *
 * The conversion is only applied when the SOURCE had no Devanagari digits of
 * its own. If someone pasted २५ in, Google echoes it back unchanged and there
 * is no way to tell it apart from a number it converted - so in that case the
 * output is left exactly as Google wrote it rather than risk rewriting what the
 * user deliberately typed.
 *
 * @param {string} hindi
 * @param {string} source
 */
export function restoreDigits(hindi, source) {
  if (HAS_DEVA_DIGIT.test(source)) return hindi;
  return hindi.replace(DEVA_DIGITS, (d) => String(d.codePointAt(0) - 0x0966));
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Chunk text -> Hindi, so a keystroke never re-asks a question already answered.
 *
 * This earns its place on long input. Typing at the end of a paragraph leaves
 * every chunk but the last one byte-identical on each pass, so the request
 * count stays at one per keystroke however long the text gets. Backspacing and
 * re-typing a word is free.
 *
 * Bounded and insertion-ordered: Map iteration gives oldest-first, so evicting
 * is a shift off the front.
 */
const CACHE_MAX = 600;
const cache = new Map();

function cacheGet(key) {
  return cache.get(key);
}

function cacheSet(key, value) {
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/** Exposed for tests; nothing in the page needs it. */
export function _resetCache() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

/**
 * Stop calling an endpoint that is not answering.
 *
 * Without this, a user who is offline or behind a firewall that blocks Google
 * fires a doomed request on every single keystroke, each one burning its way to
 * the 3.5s timeout before the fallback runs. They would get the right text
 * either way, but the page would feel broken.
 *
 * After three consecutive failures the module stops trying for a minute and
 * reports itself unavailable immediately, so the fallback is instant. One
 * success anywhere resets it.
 */
const FAIL_LIMIT = 3;
const COOLDOWN_MS = 60_000;

let consecutiveFailures = 0;
let mutedUntil = 0;

const isMuted = () => Date.now() < mutedUntil;

function noteFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAIL_LIMIT) mutedUntil = Date.now() + COOLDOWN_MS;
}

function noteSuccess() {
  consecutiveFailures = 0;
  mutedUntil = 0;
}

/** Exposed for tests. */
export function _resetBreaker() {
  consecutiveFailures = 0;
  mutedUntil = 0;
}

// ---------------------------------------------------------------------------
// One request
// ---------------------------------------------------------------------------

/** Is there anything here Google could possibly transliterate? */
const hasRoman = (s) => /[A-Za-z]/.test(s);

/**
 * Transliterate one chunk. Cache, then network.
 *
 * @param {string} chunk
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} opts
 * @returns {Promise<string>}
 */
async function chunkToHindi(chunk, { fetchImpl = fetch, signal, timeoutMs = TIMEOUT_MS } = {}) {
  // Whitespace, digits, punctuation, text already in Devanagari: nothing for
  // Google to do, and the endpoint rejects a request with no text at all.
  if (!hasRoman(chunk)) return chunk;

  const hit = cacheGet(chunk);
  if (hit !== undefined) return hit;

  // Swap out the characters Google eats, unless the text already contains a
  // stand-in - see containsSentinel(). Masking never changes the length, so the
  // 180-character budget and the truncation check are unaffected.
  const masking = !containsSentinel(chunk);
  const sent = masking ? mask(chunk) : chunk;

  const url =
    `${ENDPOINT}?text=${encodeURIComponent(sent)}` +
    `&itc=${ITC}&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`;

  // Two reasons to abort: the caller moved on (a newer keystroke) or the
  // request is simply taking too long. Both have to reach the same fetch.
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Input Tools: HTTP ${res.status}`);

    // Undo, in the reverse order of what was done to get here: the endpoint's
    // own HTML escaping first, then the digits, then our stand-ins, and only
    // then the nukta - which has to be last, because it is the one pass that
    // must see the finished Devanagari.
    let hindi = decodeEntities(parseInputTools(await res.json(), sent));
    hindi = restoreDigits(hindi, chunk);
    if (masking) hindi = unmask(hindi);

    const value = decomposeNukta(hindi);
    cacheSet(chunk, value);
    return value;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// One word, several candidates - what the typing page uses
// ---------------------------------------------------------------------------

/** How many candidates the typing page offers for a word. */
export const MAX_SUGGESTIONS = 5;

/**
 * Pull the candidate list for ONE word out of an Input Tools response.
 *
 * Google answers a single word with a single segment whose candidates are in
 * its own ranking order, best first. That order is kept as-is: index 0 is the
 * word the page shows, and the rest are what tapping the word offers.
 *
 * @param {unknown} payload
 * @returns {string[]}
 */
export function parseCandidates(payload) {
  if (!Array.isArray(payload) || payload[0] !== 'SUCCESS') {
    throw new Error(`Input Tools: ${Array.isArray(payload) ? payload[0] : 'bad response'}`);
  }
  const segments = payload[1];
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Input Tools: no segments');
  }
  // More than one segment for one word means Google split it. Its joined top
  // answer is still right; there is just no clean list of alternatives.
  if (segments.length > 1) return [parseInputTools(payload)];
  const candidates = Array.isArray(segments[0]) ? segments[0][1] : null;
  if (!Array.isArray(candidates) || typeof candidates[0] !== 'string' || !candidates[0]) {
    throw new Error('Input Tools: no candidate');
  }
  return candidates.filter((c) => typeof c === 'string' && c);
}

/**
 * Roman word -> Google's Hindi candidates for it, best first, at most
 * MAX_SUGGESTIONS, deduplicated after nukta normalisation.
 *
 * `word` must be letters only - the typing page splits punctuation, digits and
 * whitespace off BEFORE calling this, so none of the masking above is needed
 * and none of those characters is ever sent.
 *
 * REJECTS on any failure, exactly like googleToUnicode(): the caller owns the
 * fallback.
 *
 * @param {string} word
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<string[]>}
 */
export async function googleSuggestions(
  word,
  { fetchImpl = fetch, signal, timeoutMs = TIMEOUT_MS } = {},
) {
  if (!/^[A-Za-z]+$/.test(word)) throw new Error(`Input Tools: not a word: ${word}`);
  if (isMuted()) throw new Error('Input Tools: cooling down after repeated failures');

  const key = `word:${word}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const url =
    `${ENDPOINT}?text=${encodeURIComponent(word)}` +
    `&itc=${ITC}&num=${MAX_SUGGESTIONS}&cp=0&cs=1&ie=utf-8&oe=utf-8`;

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Input Tools: HTTP ${res.status}`);
    const seen = new Set();
    for (const c of parseCandidates(await res.json())) {
      seen.add(decomposeNukta(decodeEntities(c)));
    }
    const value = [...seen].slice(0, MAX_SUGGESTIONS);
    noteSuccess();
    cacheSet(key, value);
    return value;
  } catch (err) {
    // A newer keystroke replacing this run is not Google failing - pass the
    // abort through untouched so the caller can tell.
    if (signal?.aborted) throw err;
    noteFailure();
    // Our own timeout also surfaces as an AbortError. Re-badge it, or the
    // caller would mistake a dead network for a superseded keystroke and never
    // fall back.
    if (err?.name === 'AbortError') throw new Error('Input Tools: timed out');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Is it worth trying Google right now?
 *
 * Lets a caller skip straight to the fallback while the breaker is open,
 * instead of awaiting a promise that is going to reject.
 */
export const isAvailable = () => !isMuted();

/**
 * Roman -> Hindi through Google Input Tools.
 *
 * REJECTS on any failure - offline, blocked, rate-limited, timed out, aborted,
 * or a response shape Google changed. It does not fall back internally and it
 * must not: the caller owns the fallback, and a function that silently returned
 * rule-based output while claiming to be Google would make the two impossible
 * to tell apart when one of them is wrong.
 *
 * @param {string} text
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<string>} Devanagari
 */
export async function googleToUnicode(text, opts = {}) {
  if (!text) return '';
  if (isMuted()) throw new Error('Input Tools: cooling down after repeated failures');

  try {
    // URLs and emails are cut out first and never sent. Google mangles them
    // confidently - `https://google.com` comes back as `हत्तपः://गूगल.कॉम` -
    // and they are also the spans most likely to be private.
    const parts = splitProtected(text);
    const out = await Promise.all(
      parts.map(async ({ skip, v }) => {
        if (skip) return v;
        const pieces = await Promise.all(
          chunkText(v).map((c) => chunkToHindi(c, opts)),
        );
        return pieces.join('');
      }),
    );
    noteSuccess();
    // The nasal words last, over the top of the model's answer. Google is
    // better than this table at almost everything and worse at exactly these,
    // and the table is shared with the fallback so the two cannot disagree.
    return applyCommonWords(text, out.join(''));
  } catch (err) {
    // An abort is the caller replacing this run with a newer one, not Google
    // failing, so it must not count toward the breaker.
    if (err?.name !== 'AbortError') noteFailure();
    throw err;
  }
}

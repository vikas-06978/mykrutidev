/**
 * The everyday Hindi tools: numbers in words (Hindi, and English in lakh and
 * crore), Hindi <-> English digits, dates in Hindi, and a Hindi word counter.
 *
 * Every one of these has exactly one right answer, which is why they are here
 * and "Hindi to English spelling" is not: there, which silent a to drop has
 * to be guessed.
 */

// ============================================================================
// Hindi number words
// ============================================================================
//
// 0-99 in Hindi are not built from parts the way English 21-99 are: every one
// of them is its own word (उनतालीस is 39, not "thirty-nine"), so all hundred
// are listed. The spellings are the standard ones in school textbooks and
// cheque books. A few have common variants (छः for छह, पन्द्रह for पंद्रह,
// उन्नासी for उनासी, सरसठ for सड़सठ), which say the same number.
// prettier-ignore
export const HINDI_0_99 = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ',
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

// The Indian place values above a hundred, largest first. Each takes a
// two-digit multiplier (बारह लाख), except the last, which takes whatever is
// left (one सौ खरब and up is still written with खरब).
const HINDI_PLACES = [
  [10n ** 11n, 'खरब'],
  [10n ** 9n, 'अरब'],
  [10n ** 7n, 'करोड़'],
  [10n ** 5n, 'लाख'],
  [10n ** 3n, 'हज़ार'],
];

/** The largest whole number the tools write out: 99,99,99,99,99,999. */
export const MAX_WHOLE = 10n ** 13n - 1n;

function hindiBelowThousand(n) {
  const h = Number(n / 100n);
  const rest = Number(n % 100n);
  const parts = [];
  if (h) parts.push(`${HINDI_0_99[h]} सौ`);
  if (rest) parts.push(HINDI_0_99[rest]);
  return parts.join(' ');
}

/** A whole number (BigInt, 0..MAX_WHOLE) in Hindi words. */
export function hindiWords(n) {
  if (n === 0n) return HINDI_0_99[0];
  const parts = [];
  let rest = n;
  for (const [value, name] of HINDI_PLACES) {
    const q = rest / value;
    if (q) {
      parts.push(`${hindiWords(q)} ${name}`);
      rest %= value;
    }
  }
  if (rest) parts.push(hindiBelowThousand(rest));
  return parts.join(' ');
}

// ============================================================================
// English number words, Indian system (lakh, crore)
// ============================================================================

// prettier-ignore
const EN_0_19 = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function englishBelowHundred(n) {
  if (n < 20) return EN_0_19[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${EN_TENS[t]}-${EN_0_19[o]}` : EN_TENS[t];
}

function englishBelowThousand(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h) parts.push(`${EN_0_19[h]} Hundred`);
  if (rest) parts.push(englishBelowHundred(rest));
  return parts.join(' ');
}

// English cheques stop at crore: 125 crore is "One Hundred Twenty-Five Crore",
// which is how banks print it, rather than arab and kharab.
const EN_PLACES = [
  [10n ** 7n, 'Crore'],
  [10n ** 5n, 'Lakh'],
  [10n ** 3n, 'Thousand'],
];

/** A whole number (BigInt, 0..MAX_WHOLE) in English words, lakh and crore. */
export function englishWords(n) {
  if (n === 0n) return EN_0_19[0];
  const parts = [];
  let rest = n;
  for (const [value, name] of EN_PLACES) {
    const q = rest / value;
    if (q) {
      parts.push(`${englishWords(q)} ${name}`);
      rest %= value;
    }
  }
  if (rest) parts.push(englishBelowThousand(Number(rest)));
  return parts.join(' ');
}

// ============================================================================
// Reading what was typed
// ============================================================================

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Hindi digits -> 0-9. Nothing else changes. */
export const toEnglishDigits = (s) => s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

/** 0-9 -> Hindi digits. Nothing else changes. */
export const toHindiDigits = (s) => s.replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)]);

/**
 * Parse an amount the way people type one: 125000, 1,25,000, 1 25 000,
 * ₹1,25,000.50, or in Hindi digits.
 *
 * @returns {{ ok: true, whole: bigint, fraction: string } | { ok: false, error: 'empty'|'invalid'|'too-large' }}
 *   `fraction` is the digits after the point exactly as typed ('' if none).
 */
export function parseAmount(input) {
  const s = toEnglishDigits(String(input))
    .replace(/^\s*(?:₹|rs\.?|inr|रु\.?|रुपये)\s*/i, '')
    .replace(/[,\s]/g, '')
    .replace(/\/-$/, '');
  if (!s) return { ok: false, error: 'empty' };
  const m = s.match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[1] && !m[2])) return { ok: false, error: 'invalid' };
  const whole = BigInt(m[1] || '0');
  if (whole > MAX_WHOLE) return { ok: false, error: 'too-large' };
  return { ok: true, whole, fraction: m[2] ?? '' };
}

// ============================================================================
// Amounts in words
// ============================================================================

/**
 * @param {string} input
 * @param {{ rupees?: boolean }} [opts] rupees: write it as money, for a cheque
 * @returns {{ ok: true, text: string } | { ok: false, error: string }}
 *   errors: empty, invalid, too-large, paise (more than two digits of paise)
 */
export function amountInHindi(input, { rupees = true } = {}) {
  const p = parseAmount(input);
  if (!p.ok) return p;
  if (!rupees) {
    let text = hindiWords(p.whole);
    if (p.fraction) {
      text += ` दशमलव ${[...p.fraction].map((d) => HINDI_0_99[Number(d)]).join(' ')}`;
    }
    return { ok: true, text };
  }
  if (p.fraction.length > 2) return { ok: false, error: 'paise' };
  const paise = p.fraction ? Number(p.fraction.padEnd(2, '0')) : 0;
  const parts = [];
  if (p.whole > 0n || paise === 0) {
    parts.push(`${hindiWords(p.whole)} ${p.whole === 1n ? 'रुपया' : 'रुपये'}`);
  }
  if (paise) parts.push(`${HINDI_0_99[paise]} ${paise === 1 ? 'पैसा' : 'पैसे'}`);
  return { ok: true, text: `${parts.join(' और ')} मात्र` };
}

/** Same contract as amountInHindi(), in English (lakh, crore). */
export function amountInEnglish(input, { rupees = true } = {}) {
  const p = parseAmount(input);
  if (!p.ok) return p;
  if (!rupees) {
    let text = englishWords(p.whole);
    if (p.fraction) text += ` Point ${[...p.fraction].map((d) => EN_0_19[Number(d)]).join(' ')}`;
    return { ok: true, text };
  }
  if (p.fraction.length > 2) return { ok: false, error: 'paise' };
  const paise = p.fraction ? Number(p.fraction.padEnd(2, '0')) : 0;
  const parts = [];
  if (p.whole > 0n || paise === 0) {
    // "Rupees One Only" is the cheque form even for one rupee.
    parts.push(`Rupees ${englishWords(p.whole)}`);
  }
  if (paise) parts.push(`${englishBelowHundred(paise)} ${paise === 1 ? 'Paisa' : 'Paise'}`);
  return { ok: true, text: `${parts.join(' and ')} Only` };
}

// ============================================================================
// Dates in Hindi
// ============================================================================

export const HINDI_MONTHS = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
];
export const HINDI_WEEKDAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

/**
 * Read a date as typed: 2026-10-02 (a date picker), or day first as India
 * writes it: 2/10/2026, 02-10-2026, 02.10.2026.
 * @returns {{ y: number, m: number, d: number } | null} m is 1-12
 */
export function parseDate(input) {
  const s = toEnglishDigits(String(input)).trim();
  let y, m, d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, y, m, d] = r.map(Number);
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [, d, m, y] = r.map(Number);
  else return null;
  // A real calendar date, checked by round-tripping through UTC (never local
  // time, so the weekday cannot shift with the visitor's time zone).
  const t = new Date(Date.UTC(y, m - 1, d));
  if (y < 1 || t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}

/**
 * A year as Hindi says it: years from 1100 to 1999 in pairs (1947 is उन्नीस सौ
 * सैंतालीस, never एक हज़ार नौ सौ सैंतालीस), every other year as a number
 * (2026 is दो हज़ार छब्बीस).
 */
export function hindiYear(y) {
  if (y >= 1100 && y <= 1999) {
    const rest = y % 100;
    const head = `${HINDI_0_99[Math.floor(y / 100)]} सौ`;
    return rest ? `${head} ${HINDI_0_99[rest]}` : head;
  }
  return hindiWords(BigInt(y));
}

/**
 * Every way the tool writes a date, in a fixed order.
 * @returns {{ key: string, text: string }[] | null}
 */
export function hindiDate(input) {
  const p = parseDate(input);
  if (!p) return null;
  const { y, m, d } = p;
  const weekday = HINDI_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const month = HINDI_MONTHS[m - 1];
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return [
    { key: 'long', text: `${d} ${month} ${y}` },
    { key: 'longHindiDigits', text: toHindiDigits(`${d} ${month} ${y}`) },
    { key: 'weekday', text: `${weekday}, ${d} ${month} ${y}` },
    { key: 'numeric', text: `${dd}/${mm}/${y}` },
    { key: 'numericHindiDigits', text: toHindiDigits(`${dd}/${mm}/${y}`) },
    { key: 'words', text: `${hindiWords(BigInt(d))} ${month} ${hindiYear(y)}` },
  ];
}

// ============================================================================
// Counting Hindi text
// ============================================================================

// An akshar (written syllable): an independent vowel, or a consonant cluster
// joined by halants, with its vowel sign and nasal marks. Done by rule rather
// than Intl.Segmenter, whose answer for conjuncts (क्ष, one or two?) changed
// between Unicode versions and so differs from browser to browser.
const C = '[\\u0915-\\u0939\\u0958-\\u095F\\u0979-\\u097F]\\u093C?';
const RE_AKSHAR = new RegExp(
  `(?:${C}(?:\\u094D${C})*(?:[\\u093E-\\u094C\\u0955-\\u0957\\u0962\\u0963]|\\u094D(?!${C}))?|[\\u0904-\\u0914\\u0960\\u0961\\u0972-\\u0977])[\\u0900-\\u0903]*`,
  'g',
);

/**
 * @returns {{ words: number, characters: number, charactersNoSpaces: number,
 *   akshar: number, sentences: number, paragraphs: number }}
 */
export function countText(text) {
  const t = text.normalize('NFC');
  const trimmed = t.trim();
  const words = trimmed ? trimmed.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  const characters = [...t].length;
  const charactersNoSpaces = [...t.replace(/\s/gu, '')].length;
  const akshar = (t.match(RE_AKSHAR) || []).length;
  const sentences = trimmed
    ? trimmed.split(/(?<=[।॥?!.])\s*/u).filter((s) => /[\p{L}\p{N}]/u.test(s)).length
    : 0;
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/u).filter((s) => s.trim()).length : 0;
  return { words, characters, charactersNoSpaces, akshar, sentences, paragraphs };
}

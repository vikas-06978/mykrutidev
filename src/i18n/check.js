/**
 * What a translated string must keep from its English original. Shared by
 * i18n.test.js (every published language) and scripts/i18n-draft.mjs (a
 * language still being translated), so a draft is held to the same rules the
 * build will hold it to.
 *
 * Translated: the words. Kept exactly: everything that is data rather than
 * copy - legacy-font keystrokes in <code>, Unicode samples marked lang="..",
 * link targets, {placeholders}, the brand, file types and the font names a
 * reader has to find in Word's font list.
 */

/** Font names the reader must pick in Word: kept in Latin wherever English has them. */
export const PICK_FONTS = ['Kruti Dev 010', 'DevLys 010', 'Abbasi Chanakya New', 'Mangal'];

/** Never translated, in any language. */
export const BRAND = ['MyKrutiDev', 'ToolMitra', 'MemeBox', '.docx', '.txt'];

/**
 * Keys where a language may say a font's name its own way: menu groups, the
 * names used in lists, the font links and each page's nav label.
 */
export const NAME_KEYS = (key) =>
  key.startsWith('groups.') ||
  key.startsWith('fontNames.') ||
  key.startsWith('fontStrip.fonts.') ||
  /^pages\.[^.]+\.nav$/.test(key);

/** Keys a translation may leave empty even though the English is not. */
export const MAY_BE_EMPTY = new Set(['translit.suggestBefore', 'translit.suggestAfter']);

/** Keys whose ; is a keyboard key, not punctuation. */
export const SEMICOLON_KEYS = new Set(['tutor.levels.home.focus']);

export const codes = (s) => [...s.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map((m) => m[1]).sort();
/** The contents of every element marked with a language: Unicode samples, kept as they are. */
export const samples = (s) =>
  [...s.matchAll(/<(span|strong|em|b)[^>]*\blang="[a-z]{2}"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]).sort();
export const hrefs = (s) => [...s.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).sort();
export const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
/** Text outside tags, code and entities: where a ; would be punctuation. */
export const prose = (s) => s.replace(/<code[^>]*>[\s\S]*?<\/code>|&[a-z#0-9]+;|<[^>]+>/gi, '');

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Problems with one translated value, as short messages. Empty when it keeps
 * everything it must.
 * @param {string} key   dotted key ("pages./.faq.0.a")
 * @param {string} en    the English value
 * @param {unknown} value the translation
 */
export function checkValue(key, en, value) {
  const out = [];
  if (typeof value !== 'string') return [`not a string`];
  if (!value.trim() && en.trim() && !MAY_BE_EMPTY.has(key)) out.push('empty');
  if (!same(vars(value), vars(en))) out.push(`placeholders ${vars(en)} -> ${vars(value)}`);
  if (!same(codes(value), codes(en))) out.push(`<code> changed: ${codes(en).join(' | ')} -> ${codes(value).join(' | ')}`);
  if (!same(samples(value), samples(en))) out.push(`lang samples changed: ${samples(en).join(' | ')} -> ${samples(value).join(' | ')}`);
  if (!same(hrefs(value), hrefs(en))) out.push(`links changed: ${hrefs(en).join(' ')} -> ${hrefs(value).join(' ')}`);
  if (!SEMICOLON_KEYS.has(key) && /;/.test(prose(value))) out.push('semicolon in prose');
  for (const name of BRAND) if (en.includes(name) && !value.includes(name)) out.push(`lost "${name}"`);
  if (!NAME_KEYS(key)) {
    for (const name of PICK_FONTS) if (en.includes(name) && !value.includes(name)) out.push(`lost font name "${name}"`);
  }
  // Tags must balance the same way: a dropped </strong> breaks the page.
  const tags = (s) => [...s.matchAll(/<\/?([a-z0-9]+)\b/gi)].map((m) => m[0].toLowerCase().replace(/\s.*/, '')).sort();
  if (!same(tags(value), tags(en))) out.push('HTML tags differ from the English');
  return out;
}

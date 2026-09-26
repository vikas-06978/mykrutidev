/**
 * Converter drafts and the "Recent" list - pure helpers. The client script in
 * src/scripts/workspace.ts does the storage; this decides what is kept.
 *
 * Everything stays in the visitor's browser (localStorage), per tool. The same
 * tool shares one draft and one list in English and in Hindi, because it is
 * the same text either way.
 */

/** How many recent conversions a tool keeps. */
export const MAX_RECENT = 10;
/**
 * Longer inputs are not kept. localStorage holds ~5 MB per site and a pasted
 * book in ten slots would fill it; a draft that long belongs in a file anyway.
 */
export const MAX_CHARS = 50_000;

export const draftKey = (tool) => `mkd-draft:${tool}`;
export const recentKey = (tool) => `mkd-recent:${tool}`;

/**
 * Add `text` to the front of `list` (newest first).
 *
 * Typing produces a run of prefixes of one text - "नम", "नमस्", "नमस्ते" - and
 * the list must not fill up with them, so an entry that the new text extends
 * (or that already extends the new text) is replaced rather than kept beside
 * it. An exact repeat just moves to the top.
 *
 * @param {{ text: string, at: number }[]} list
 * @param {string} text
 * @param {number} at timestamp
 */
export function addRecent(list, text, at) {
  const t = text.trim();
  if (!t || text.length > MAX_CHARS) return list;
  const kept = list.filter((e) => {
    const o = e.text.trim();
    return !(o === t || t.startsWith(o) || o.startsWith(t));
  });
  // A shorter prefix typed after a longer text (deleting back) keeps the
  // longer one: that is the version worth restoring.
  const longer = list.find((e) => e.text.trim() !== t && e.text.trim().startsWith(t));
  const entry = longer ? { text: longer.text, at } : { text, at };
  return [entry, ...kept].slice(0, MAX_RECENT);
}

/** A stored list, made safe: right shape, no empties, newest first, capped. */
export function sanitizeRecent(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.text === 'string' && e.text.trim() && e.text.length <= MAX_CHARS)
    .map((e) => ({ text: e.text, at: Number.isFinite(e.at) ? e.at : 0 }))
    .slice(0, MAX_RECENT);
}

/** One line to show for an entry: whitespace collapsed, cut at `n` characters. */
export function preview(text, n = 60) {
  const one = text.replace(/\s+/g, ' ').trim();
  // By grapheme where the browser can, so the cut never strands a matra.
  const parts =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(one)].map((s) => s.segment)
      : [...one];
  return parts.length > n ? `${parts.slice(0, n).join('')}…` : one;
}

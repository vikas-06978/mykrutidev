/**
 * The <title> of every page: the page's own title with the brand after it.
 * See Base.astro for why. tests/seo.test.js checks the built pages.
 */

export const BRAND = 'MyKrutiDev';
/** About what a search result shows before cutting the title off. */
export const TITLE_MAX = 60;
/**
 * Bing Webmaster Tools reports a title over 70 characters as an error, and it
 * counts code units: a Devanagari title with 60 visible letters can be 80.
 */
export const TITLE_MAX_CHARS = 70;

const segmenter = new Intl.Segmenter();
/** Length as a reader sees it: one Devanagari letter with its matra is one. */
export const visibleLength = (s) => [...segmenter.segment(s)].length;

/** Short enough for both: what Google shows, and what Bing counts. */
export const fits = (s) => visibleLength(s) <= TITLE_MAX && s.length <= TITLE_MAX_CHARS;

/** @param {string} title */
export function brandTitle(title) {
  if (title.includes(BRAND)) return title;
  const full = `${title} | ${BRAND}`;
  if (fits(full)) return full;
  return `${title.split(' | ')[0]} | ${BRAND}`;
}

/**
 * `{name}` placeholders in a translated string.
 *
 * Its own module so the browser scripts can use it without importing
 * src/i18n/index.js, which would pull both dictionaries into every bundle.
 * An unknown placeholder is left visible rather than blanked, so a typo in a
 * translation shows up on the page instead of silently losing a number.
 *
 * @param {string} s
 * @param {Record<string, string | number>} [vars]
 */
export const fill = (s, vars = {}) =>
  String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

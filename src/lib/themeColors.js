/**
 * Colour maths for the site's themes and accent colours - build and test time
 * only, never shipped to the browser.
 *
 * The tokens are read straight out of the CSS (global.css for Light,
 * themes.css for the rest), so there is exactly one place where a colour is
 * written down. scripts/build-accents.mjs uses this to compute each accent for
 * each theme; src/lib/themes.test.js uses it to prove every pair passes.
 */

/** The visual themes, in picker order. "system" is not one: it picks light or dark. */
export const THEMES = ['light', 'white', 'dark', 'reading', 'contrast'];

/**
 * Accent hues. Terracotta is the brand colour and keeps its hand-set values
 * in the themes that already had it (see FIXED); every other value is found by
 * searching lightness until the colour passes AA on that theme's backgrounds.
 */
export const ACCENTS = {
  terracotta: { h: 13, s: 60 },
  blue: { h: 214, s: 72 },
  green: { h: 148, s: 58 },
  purple: { h: 268, s: 50 },
  teal: { h: 184, s: 72 },
};

/** Hand-set terracotta, kept exactly as it was: [base, deep (hover), text on it]. */
const FIXED = {
  light: ['#a8442a', '#8a3722', '#ffffff'],
  white: ['#a8442a', '#8a3722', '#ffffff'],
  reading: ['#963a21', '#7a2e19', '#ffffff'],
  dark: ['#ee9275', '#f5ab93', '#1a1411'],
};

/** Minimum contrast for text, per theme. High contrast is AAA. */
export const MIN_CONTRAST = (theme) => (theme === 'contrast' ? 7 : 4.5);

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

export function hslToHex(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${hex2(f(0) * 255)}${hex2(f(8) * 255)}${hex2(f(4) * 255)}`;
}

export function luminance(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------------------------------------------------------------------------
// Tokens, read from the CSS
// ---------------------------------------------------------------------------

const tokensIn = (block) =>
  Object.fromEntries(
    [...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );

/**
 * Every theme's full token set: Light from the @theme block in global.css,
 * the others as Light plus their own overrides from themes.css.
 *
 * @param {string} globalCss
 * @param {string} themesCss
 * @returns {Record<string, Record<string, string>>}
 */
export function readThemes(globalCss, themesCss) {
  const light = tokensIn(globalCss.match(/@theme\s*\{([\s\S]*?)\n\}/)[1]);
  const out = { light };
  for (const theme of THEMES.slice(1)) {
    const m = themesCss.match(new RegExp(`:root\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`));
    if (!m) throw new Error(`themes.css has no block for ${theme}`);
    out[theme] = { ...light, ...tokensIn(m[1]) };
  }
  return out;
}

/** Backgrounds that accent-coloured text can sit on. */
export const TEXT_BACKGROUNDS = ['paper', 'surface', 'inset', 'warn-bg'];

const isDark = (t) => luminance(t.paper) < luminance(t.ink);

/**
 * One accent in one theme: { base, deep, on }.
 *   base - links, outlines, active tabs, focus; text on every background
 *   deep - hover (darker on light themes, lighter on dark ones)
 *   on   - text on a solid fill of either
 */
export function accentFor(theme, tokens, accent) {
  if (accent === 'terracotta' && FIXED[theme]) {
    const [base, deep, on] = FIXED[theme];
    return { base, deep, on };
  }
  const { h, s } = ACCENTS[accent];
  const dark = isDark(tokens);
  const on = dark ? tokens['on-brick'] : '#ffffff';
  const target = MIN_CONTRAST(theme) + 0.1;
  const passes = (c) =>
    TEXT_BACKGROUNDS.every((b) => contrast(c, tokens[b]) >= target) && contrast(on, c) >= target;
  for (let step = 0; step <= 100; step++) {
    const l = dark ? 40 + step * 0.5 : 58 - step * 0.5;
    const base = hslToHex(h, s, l);
    if (!passes(base)) continue;
    const deep = hslToHex(h, s, dark ? Math.min(92, l + 8) : Math.max(12, l - 8));
    if (!passes(deep)) continue;
    return { base, deep, on };
  }
  throw new Error(`no lightness of ${accent} passes on ${theme}`);
}

/** Every text-on-background pair the components actually draw. */
export function textPairs(t) {
  const pairs = [];
  for (const fg of ['ink', 'body', 'mute', 'brick', 'brick-deep', 'ok', 'err', 'badge']) {
    for (const bg of TEXT_BACKGROUNDS) pairs.push([fg, bg]);
  }
  pairs.push(
    ['err', 'err-bg'],
    ['ink', 'err-bg'],
    ['on-brick', 'brick'],
    ['on-brick', 'brick-deep'],
    ['on-ok', 'ok'],
    ['on-err', 'err'],
    ['paper', 'ink'], // the skip link
  );
  return pairs.map(([fg, bg]) => ({ fg, bg, ratio: contrast(t[fg], t[bg]) }));
}

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ACCENTS, THEMES, MIN_CONTRAST, accentFor, readThemes, textPairs } from './themeColors.js';
import { buildAccentsCss } from '../../scripts/build-accents.mjs';

const styles = new URL('../styles/', import.meta.url);
const read = (f) => readFileSync(new URL(f, styles), 'utf8');
const themes = readThemes(read('global.css'), read('themes.css'));

describe('every theme x accent passes its contrast minimum', () => {
  for (const theme of THEMES) {
    // High contrast has one accent of its own (yellow) whatever is chosen.
    const accents = theme === 'contrast' ? ['own yellow'] : Object.keys(ACCENTS);
    for (const accent of accents) {
      test(`${theme} + ${accent}: every text pair >= ${MIN_CONTRAST(theme)}:1`, () => {
        const t = { ...themes[theme] };
        if (theme !== 'contrast') {
          const a = accentFor(theme, t, accent);
          Object.assign(t, { brick: a.base, 'brick-deep': a.deep, 'on-brick': a.on });
        }
        const fails = textPairs(t).filter((p) => p.ratio < MIN_CONTRAST(theme));
        assert.deepEqual(
          fails.map((p) => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)}`),
          [],
        );
      });
    }
  }
});

test('terracotta keeps its exact values where it existed', () => {
  assert.deepEqual(accentFor('light', themes.light, 'terracotta'), { base: '#a8442a', deep: '#8a3722', on: '#ffffff' });
  assert.deepEqual(accentFor('dark', themes.dark, 'terracotta'), { base: '#ee9275', deep: '#f5ab93', on: '#1a1411' });
  assert.equal(themes.light.brick, '#a8442a', 'the @theme default is terracotta');
});

test('the new themes are what was asked for', () => {
  assert.deepEqual(THEMES, ['light', 'white', 'dark', 'reading', 'contrast']);
  assert.equal(themes.white.paper, '#ffffff');
  assert.equal(themes.white.surface, '#ffffff');
  // No cream in White: every background is a neutral grey (R = G <= B, tiny spread).
  for (const k of ['paper', 'surface', 'inset', 'hairline', 'hairline-soft', 'warn-bg']) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(themes.white[k].slice(i, i + 2), 16));
    assert.ok(r <= b && g <= b && b - r <= 12, `white ${k} ${themes.white[k]} is not neutral`);
  }
  assert.equal(themes.contrast.paper, '#000000');
  assert.equal(themes.contrast.ink, '#ffffff');
  assert.equal(themes.contrast.brick, '#ffd400');
  assert.equal(themes.contrast.focus, '#ffd400');
  // Every theme is its own page colour.
  assert.equal(new Set(THEMES.map((t) => themes[t].paper)).size, THEMES.length);
});

test('accents.css is up to date with the theme colours', () => {
  // Line endings aside: git may check the file out with CRLF on Windows.
  const lf = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(lf(read('accents.css')), lf(buildAccentsCss()), 'run: node scripts/build-accents.mjs');
});

test('High contrast outranks the accent mapping', () => {
  // [data-accent='x'] is (0,2,0); the contrast block must be more specific.
  assert.match(read('themes.css'), /:root\[data-theme='contrast'\]\[data-accent\]/);
});

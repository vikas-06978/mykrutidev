import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The browser code in src/lib is reached through lazy import()s, so Vite's dev
// server only discovers its npm packages when someone types or drops a file.
// Discovered late, a package is re-optimised mid-session and the page's request
// gets "Outdated Optimize Dep" - which left English to Hindi Typing blank in
// dev. Every package src/lib imports must therefore be pre-bundled.
test('every npm package imported by src/lib is in optimizeDeps.include', () => {
  const dir = new URL('./', import.meta.url);
  const config = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');
  const include = config.match(/optimizeDeps:\s*\{\s*include:\s*\[([^\]]*)\]/)?.[1] ?? '';
  const listed = new Set([...include.matchAll(/'([^']+)'/g)].map((m) => m[1]));

  const used = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || f.endsWith('.test.js') || f.endsWith('.build.js')) continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const [, spec] of src.matchAll(/^import\b[^'"]*['"]([^'"]+)['"]/gm)) {
      if (spec.startsWith('.') || spec.startsWith('node:')) continue;
      used.add(spec);
    }
  }

  assert.ok(used.has('@indic-transliteration/sanscript'), 'expected translit.js to import sanscript');
  for (const pkg of used) assert.ok(listed.has(pkg), `${pkg} is imported by src/lib but not pre-bundled`);
});

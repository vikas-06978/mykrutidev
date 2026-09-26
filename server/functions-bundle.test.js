/**
 * What Cloudflare's Pages Functions bundler can build. The site's own code runs
 * in Node and Vite, which accept things that bundler does not (it is wrangler 3
 * with esbuild 0.17 on Cloudflare), so every file functions/ reaches is checked
 * here. `npm run test:functions` builds them for real, with wrangler 3 and 4.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../src/i18n/en.json' with { type: 'json' };
import { LABELS } from './adminLabels.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** Every import in a file: its specifier and whatever follows it on the line. */
const importsOf = (src) => [
  ...[...src.matchAll(/^\s*(?:import|export)\b[^'"]*?(?:from\s*)?['"]([^'"]+)['"]([^\n;]*)/gm)].map((m) => ({
    spec: m[1],
    rest: m[2],
  })),
  ...[...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*(,[^)]*)?\)/g)].map((m) => ({ spec: m[1], rest: m[2] ?? '' })),
];

/** Every local file the Functions reach, starting from functions/. */
function functionsGraph() {
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const src = readFileSync(file, 'utf8');
    seen.set(file, importsOf(src));
    for (const { spec } of seen.get(file)) {
      if (spec.startsWith('.') && /\.(m?js)$/.test(spec)) visit(resolve(dirname(file), spec));
    }
  };
  for (const f of walk(join(ROOT, 'functions')).filter((p) => /\.(m?js)$/.test(p))) visit(f);
  return seen;
}

test('nothing the Functions import uses import attributes, JSON imports or Node built-ins', () => {
  const graph = functionsGraph();
  assert.ok(graph.size >= 5, `only ${graph.size} files found`);
  for (const [file, imports] of graph) {
    const where = relative(ROOT, file);
    for (const { spec, rest } of imports) {
      assert.doesNotMatch(rest, /\b(with|assert)\s*\{/, `${where}: import attributes on "${spec}"`);
      assert.doesNotMatch(spec, /\.json$/, `${where}: imports ${spec} (use a generated .js module)`);
      assert.doesNotMatch(spec, /^node:/, `${where}: imports ${spec}, which Pages Functions do not have`);
    }
  }
});

test('server/adminLabels.js matches en.json (run `npm run admin-labels` after changing the labels)', () => {
  const { ratings, used, wants } = en.feedback;
  assert.deepEqual(LABELS, { ratings, used, wants });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { faviconSvg, ACCENT, PAPER } from '../../scripts/favicon.mjs';

const pub = (f) => new URL(`../../public/${f}`, import.meta.url);

test('the tab icon is the MyKrutiDev mark, and up to date (run `npm run favicon` after changing it)', () => {
  const svg = readFileSync(pub('favicon.svg'), 'utf8');
  assert.equal(svg, faviconSvg());
  assert.match(svg, new RegExp(`<rect[^>]*fill="${ACCENT}"`));
  assert.match(svg, new RegExp(`<path fill="${PAPER}"`));
  // A drawn outline, not text: the tab shows the same letter on every device.
  assert.doesNotMatch(svg, /<text|<style|font-family/);
});

test('favicon.ico holds the 16, 32 and 48 px icons as PNG', () => {
  const ico = readFileSync(pub('favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'not an icon file');
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    sizes.push(ico.readUInt8(e));
    const offset = ico.readUInt32LE(e + 12);
    assert.equal(ico.subarray(offset, offset + 4).toString('latin1'), '\x89PNG');
  }
  assert.deepEqual(sizes, [16, 32, 48]);
});

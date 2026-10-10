import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandTitle, visibleLength } from './seoTitle.js';

test('the brand goes after a title that fits', () => {
  assert.equal(brandTitle('Hindi Word Counter'), 'Hindi Word Counter | MyKrutiDev');
});

test('a long title keeps its main keyword, not its tail', () => {
  assert.equal(
    brandTitle('Aakriti to Unicode Converter | Aakriti Nepali Font to Unicode Online'),
    'Aakriti to Unicode Converter | MyKrutiDev',
  );
});

test('a title that already names the brand is left alone', () => {
  assert.equal(brandTitle('Terms of Use | MyKrutiDev'), 'Terms of Use | MyKrutiDev');
});

test('Devanagari is counted as it is seen', () => {
  assert.equal(visibleLength('हिंदी'), 2); // हिं + दी
});

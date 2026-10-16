import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakeUnits, targetedDrill, nextPractice } from './tutorCoaching.js';
const units = [{ deva: 'भा', keys: 'Hkk' }, { deva: ' ', keys: ' ' }, { deva: 'कि', keys: 'fd' }];
test('coaching preserves complete aksharas when one keystroke is wrong', () => {
  const mistakes = mistakeUnits(units, 'Hkx fd');
  assert.deepEqual(mistakes, [{ deva: 'भा', keys: 'Hkk', errors: 1 }]);
  const drill = targetedDrill(mistakes);
  assert.equal(drill.map(x => x.deva).join(''), 'भा भा भा भा');
  assert.equal(drill.map(x => x.keys).join(''), 'Hkk Hkk Hkk Hkk');
});
test('untyped suffixes and correct partial characters do not become mistakes', () => {
  assert.deepEqual(mistakeUnits(units, 'H'), []);
  assert.deepEqual(mistakeUnits(units, ''), []);
  assert.deepEqual(mistakeUnits(units, 'Hkk fd'), []);
  assert.deepEqual(targetedDrill([]), []);
});
test('repeated errors rank by frequency and exclude whitespace-only units', () => {
  const list = mistakeUnits([...units, ...units], 'xxx xxHkk xx');
  assert.equal(list[0].keys, 'fd');
  assert.equal(list[0].errors, 4);
  assert(!list.some(x => x.keys === ' '));
});
test('drills are bounded even when many mistake units are supplied', () => {
  assert.equal(targetedDrill(Array.from({length:100},()=>units[0])).length,63);
});
test('recommendation respects accuracy and completion without a speed gate', () => {
  const levels = [{id:'home',threshold:90},{id:'top',threshold:90}];
  assert.equal(nextPractice(levels, [], 'home', {complete:false,accuracy:100}), 'home');
  assert.equal(nextPractice(levels, [], 'home', {complete:true,accuracy:89}), 'home');
  assert.equal(nextPractice(levels, ['home'], 'home', {complete:true,accuracy:90,net:1}), 'top');
});

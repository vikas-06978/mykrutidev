import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { romanize } from './romanize.js';

describe('Hindi to Roman letters', () => {
  test('IAST', () => {
    assert.equal(romanize('भारत सरकार', 'iast').text, 'bhārata sarakāra');
    assert.equal(romanize('कृष्ण क्षेत्र ज्ञान श्री', 'iast').text, 'kṛṣṇa kṣetra jñāna śrī');
    assert.equal(romanize('हिंदी दुःख ॐ', 'iast').text, 'hiṃdī duḥkha oṃ');
  });

  test('ISO 15919', () => {
    assert.equal(romanize('भारत सरकार', 'iso').text, 'bhārata sarakāra');
    assert.equal(romanize('कृष्ण क्षेत्र एक ओर', 'iso').text, 'kr̥ṣṇa kṣētra ēka ōra');
    assert.equal(romanize('हिंदी', 'iso').text, 'hiṁdī');
  });

  test('the letters Hindi adds to Sanskrit', () => {
    assert.equal(romanize('ज़मीन फ़िल्म क़लम', 'iast').text, 'zamīna filma qalama');
    assert.equal(romanize('डॉक्टर ऑफ़िस', 'iast').text, 'ḍôkṭara ôfisa');
    assert.equal(romanize('अँधेरा', 'iast').text, 'am̐dherā');
    assert.equal(romanize('ज़', 'iast').text, 'za', 'precomposed ज़');
  });

  test('ड़ is r̤ in IAST (ṛ is ऋ there) and ṛ in ISO (where ऋ is r̥)', () => {
    assert.equal(romanize('सड़क ऋषि', 'iast').text, 'sar̤aka ṛṣi');
    assert.equal(romanize('सड़क ऋषि', 'iso').text, 'saṛaka r̥ṣi');
  });

  test('halant, digits, danda, English', () => {
    assert.equal(romanize('जगत् २०२४। PAN', 'iast').text, 'jagat 2024| PAN');
    assert.deepEqual(romanize('भारत', 'iast').missed, []);
  });
});

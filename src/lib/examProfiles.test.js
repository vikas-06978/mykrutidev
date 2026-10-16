import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHSL_HINDI_2026, evaluateHindiPractice as grade } from './examProfiles.js';
test('CHSL profile pins sourced Hindi requirements and official source hosts', () => {
  assert.equal(CHSL_HINDI_2026.seconds,600);assert.equal(CHSL_HINDI_2026.eligibleSeconds,900);
  assert.equal(CHSL_HINDI_2026.targetWpm,30);assert.equal(CHSL_HINDI_2026.font,'Mangal');
  for (const u of [CHSL_HINDI_2026.notice,CHSL_HINDI_2026.evaluation]) assert.equal(new URL(u).hostname,'ssc.gov.in');
});
for (const [name,reference,typed,full,half] of [
  ['correct','हम भारत में रहते हैं।','हम भारत में रहते हैं।',0,0],
  ['no capitalisation penalty in Hindi','भारत API','भारत api',0,0],
  ['omission','हम भारत में रहते हैं','हम में रहते हैं',1,0],
  ['addition','हम भारत में','हम आज भारत में',1,0],
  ['spelling','हम भारत में','हम भरत में',1,0],
  ['repetition','हम भारत में','हम हम भारत में',1,0],
  ['incomplete word','हम भारत','हम भार',1,0],
  ['punctuation omission','हम भारत में हैं।','हम भारत में हैं',0,1],
  ['punctuation substitution','हम भारत में हैं।','हम भारत में हैं,',0,1],
  ['standalone punctuation','हम ।','हम',0,1],
  ['extra spaces','हम भारत में','हम  भारत में',0,1],
  ['missing space','हम भारत में','हमभारत में',0,1],
  ['split word','हम भारत में','हम भा रत में',0,1],
  ['transposition','हम भारत में','भारत हम में',0,1],
  ['manual paragraph indent','हम भारत में','  हम भारत में',0,1],
  ['tab paragraph indent','हम भारत में','\tहम भारत में',0,0],
  ['untyped suffix','हम भारत में','हम',2,0],
]) test(`SSC-category practice estimate: ${name}`, () => {
  const r=grade(reference,typed);assert.equal(r.fullMistakes,full);assert.equal(r.halfMistakes,half);assert.equal(r.weightedMistakes,full+half/2);assert.equal(r.estimated,true);
});
test('oversized attempts fail explicitly instead of silently clipping their score',()=>{
  assert.throws(()=>grade('हम','x'.repeat(1001)),RangeError);
});

test('total input size is bounded before allocating an alignment matrix',()=>{
  assert.throws(()=>grade('हम', ('क'.repeat(500)+' ').repeat(50)),RangeError);
});

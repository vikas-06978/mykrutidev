// DV-TT Surekh (Marathi). The map was read off the font file key by key, and
// the fixture's words were drawn in DV-TT Surekh itself and read back.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars } from './fontMaps.js';
import { getPage, isLive, reversePage } from './routes.js';
import { previewFontFor } from './legacyFonts.js';
import fixture from './__fixtures__/dvtt.json' with { type: 'json' };

const toU = (s) => convert(s, 'dvtt', 'unicode');
const toD = (s) => convert(s, 'unicode', 'dvtt');

describe('DV-TT Surekh', () => {
  test('Unicode -> DV-TT gives the keys that were checked in the font', () => {
    for (const { d, u } of fixture.words) assert.equal(toD(u), d, u);
  });

  test('DV-TT -> Unicode reads them back', () => {
    for (const { d, u } of fixture.words) assert.equal(toU(d).normalize('NFC'), u.normalize('NFC'), d);
  });

  test('the bar completes a half letter, and after a full letter it is ा', () => {
    assert.equal(toU('M'), 'ग्');
    assert.equal(toU('MÉ'), 'ग');
    assert.equal(toU('MÉÉ'), 'गा');
    assert.equal(toU('ºÉ¨ÉÉVÉ'), 'समाज');
  });

  test('क and फ: the full form has its own key, half + bar is का / फा', () => {
    assert.equal(toU('E'), 'क');
    assert.equal(toU('CÉ'), 'का');
    assert.equal(toU('CªÉ'), 'क्य');
    assert.equal(toU('¡'), 'फ');
    assert.equal(toU('}É'), 'फा');
  });

  test('ि hops over its cluster, and the wide ि is picked for a cluster', () => {
    assert.equal(toU('Ê´É'), 'वि');
    assert.equal(toU('\u00CE\u00BAlÉiÉÒ'), 'स्थिती');
    assert.equal(toD('वि'), 'Ê´É');
    assert.equal(toD('स्थि'), '\u00CE\u00BAlÉ');
    // A two-letter conjunct drawn as one glyph keeps the narrow ि.
    assert.equal(toD('द्धि'), 'Êr');
  });

  test('the reph is typed after its syllable, or drawn into the ि before it', () => {
    assert.equal(toU('´É¹ÉÇ'), 'वर्ष');
    assert.equal(toU('EÒÌiÉ'), 'कीर्ति');
    assert.equal(toU('ÊxÉÌ¨ÉiÉÒ'), 'निर्मिती');
    assert.equal(toD('कीर्ति'), 'EÒÌiÉ');
    assert.equal(toD('र्मिं'), 'Í¨É');
  });

  test('िं before the cluster lands after it', () => {
    assert.equal(toU('\u00CB\u00BAÉ½'), 'सिंह');
    assert.equal(toD('सिंह'), '\u00CB\u00BAÉ½');
  });

  test('ो is the bar plus the curled े, and both े keys read as े', () => {
    assert.equal(toD('को'), 'CÉà');
    assert.equal(toD('सो'), 'ºÉÉà');
    assert.equal(toD('से'), 'ºÉä');
    assert.equal(toU('ºÉÉà'), 'सो');
    assert.equal(toU('ºÉÉä'), 'सो');
    assert.equal(toU('ºÉà'), 'से');
  });

  test('Marathi letters: ळ, ॲ, च्या', () => {
    assert.equal(toU('E²'), 'कळ');
    assert.equal(toU('+ì{É'), 'ॲप');
    assert.equal(toU('S¬É'), 'च्या');
    assert.equal(toU('®ÉVªÉÉSªÉÉ'), 'राज्याच्या');
  });

  test('the number keys are Marathi digits, and the letters are never kept as English', () => {
    assert.equal(FONTS.dvtt.asciiIsScript, true);
    assert.equal(toU('ÊnxÉÉÆE 15'), 'दिनांक १५');
    assert.equal(toU('xÉÉ ¨É'), 'ना म');
  });

  test('* is the danda and the quote keys draw curly quotes', () => {
    assert.equal(toU('ºÉ*'), 'स।');
    assert.equal(toU('"ºÉ\''), '‘स’');
  });

  test('no private-use marker survives either direction', () => {
    for (const s of ['Ì', 'Í', 'Ç', 'Ë', 'Ð', 'Ñ']) assert.doesNotMatch(toU(s), /[-]/, s);
    for (const { u } of fixture.words) assert.doesNotMatch(toD(u), /[-]/, u);
  });

  test('a character DV-TT has no key for is reported', () => {
    assert.deepEqual(unmappedChars('ऌ', 'dvtt'), ['ऌ']);
    assert.deepEqual(unmappedChars('महाराष्ट्र शासन', 'dvtt'), []);
  });
});

describe('the Marathi pages', () => {
  const page = getPage('/marathi-font-converter');

  test('the Marathi font converter is live on DV-TT, with its reverse page', () => {
    assert.ok(isLive(page));
    assert.equal(page.from, 'dvtt');
    assert.equal(page.beta, true);
    assert.equal(reversePage(page).path, '/unicode-to-dvtt-surekh');
    assert.ok(isLive(getPage('/unicode-to-dvtt-surekh')));
  });

  test('the output previews in the DV-TT Surekh woff', () => {
    assert.equal(previewFontFor('dvtt').file, 'dvtt-surekh.woff');
  });
});

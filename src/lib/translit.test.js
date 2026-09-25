import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { romanToUnicode, toItrans, MODES, TIP_KEYS, tipsFor } from './translit.js';
import { convert } from './fontMaps.js';

const h = (s) => romanToUnicode(s);
const i = (s) => romanToUnicode(s, { mode: 'itrans' });

describe('hinglish: the words the page promises', () => {
  const CASES = [
    ['namaste', 'नमस्ते'],
    ['bharat', 'भारत'],
    ['namaste bharat', 'नमस्ते भारत'],
    ['main ghar ja raha hu', 'मैं घर जा रहा हूँ'],
    ['hindi', 'हिंदी'],
    ['mera naam ram hai', 'मेरा नाम राम है'],
    ['kya aap theek hain', 'क्या आप ठीक हैं'],
    ['dhanyavaad', 'धन्यवाद'],
    ['shiksha', 'शिक्षा'],
    ['rashtriya', 'राष्ट्रीय'],
    ['vidyalay', 'विद्यालय'],
    ['pradhanmantri ka karyalay', 'प्रधानमंत्री का कार्यालय'],
  ];
  for (const [roman, want] of CASES) {
    test(`${roman} -> ${want}`, () => assert.equal(h(roman), want));
  }
});

describe('hinglish: the four rules, each on its own', () => {
  test('rule 1 - a final i or u is the long vowel', () => {
    assert.equal(h('dilli'), 'दिल्ली');
    assert.equal(toItrans('dilli'), 'dillii');
  });

  test('rule 2 - a written final a is aa, because nobody types a schwa', () => {
    assert.equal(h('ganga'), 'गंगा');
    assert.equal(h('paudha'), 'पौधा');
    assert.equal(h('chinta'), 'चिंता');
  });

  test('rule 3 - a nasal before a consonant is an anusvara', () => {
    assert.equal(h('mandir'), 'मंदिर');
    assert.equal(h('pankha'), 'पंखा');
    assert.equal(toItrans('hindi'), 'hi.ndii');
  });

  test('rule 4 - a final consonant keeps its inherent vowel, no halant', () => {
    assert.equal(h('ghar'), 'घर');
    assert.doesNotMatch(h('ghar'), /्$/);
    assert.equal(h('suraj'), 'सूरज');
  });

  test('rules 2 and 4 are the same fact and never both fire', () => {
    // `ghar` has no written final a, so rule 4 supplies the schwa; `ganga` has
    // one, so rule 2 lengthens it. A word cannot be in both states.
    assert.equal(toItrans('ghar'), 'ghara');
    assert.equal(toItrans('ganga'), 'ga.ngaa');
  });

  test('doubled cc is the conjunct, not a k', () => {
    // Without the cc rule the table's `c` -> `k` catches the first one and
    // बच्चा comes out बक्चा.
    assert.equal(h('bacche'), 'बच्चे');
    assert.doesNotMatch(h('baccha'), /क/);
  });
});

describe('hinglish: the dictionary carries what the rules cannot know', () => {
  test('nukta letters, which nobody types as such', () => {
    // Spelled out rather than pasted, because ड़ has two encodings that look
    // identical: the precomposed U+095C, and ड + the combining nukta. Unicode
    // discourages the precomposed one and the font engine emits the combining
    // form, so this is the form the two engines have to agree on - otherwise
    // text from this page would not match text from the converter in a search.
    const DDDHA = 'ड़'; // ड + ़
    assert.equal(h('ladka'), `ल${DDDHA}का`);
    assert.equal(h('sadak'), `स${DDDHA}क`);
    assert.equal(h('bada'), `ब${DDDHA}ा`);
  });

  test('nukta is encoded the same way the font engine encodes it', () => {
    // If these ever diverge, round-tripping through Kruti Dev silently changes
    // the bytes of every ड़ and ज़ on the page.
    assert.equal(
      h('ladka'),
      convert(convert(h('ladka'), 'unicode', 'kruti-dev'), 'kruti-dev', 'unicode'),
    );
    assert.doesNotMatch(h('ladka'), /[क़-य़]/);
  });

  test('chandrabindu rather than anusvara where the word wants it', () => {
    assert.equal(h('haan'), 'हाँ');
    assert.equal(h('panch'), 'पाँच');
    assert.equal(h('hu'), 'हूँ');
  });

  test('irregular vowel lengths', () => {
    assert.equal(h('bharat'), 'भारत');
    assert.equal(h('kitab'), 'किताब');
    assert.equal(h('aap'), 'आप');
  });

  test('a dictionary word beats the rules', () => {
    assert.equal(toItrans('bharat'), 'bhaarata');
    assert.notEqual(toItrans('bharat'), toItrans('bharatx').slice(0, -1));
  });

  test('case does not matter in hinglish mode', () => {
    assert.equal(h('Bharat'), h('bharat'));
    assert.equal(h('NAMASTE'), h('namaste'));
  });

  /**
   * The two words the brief named, and the two failure shapes behind them.
   *
   * `badhiya` needs a nukta the rules cannot reach - ढ़ is `.Dh` in ITRANS and
   * nobody types it that way. `gitaar` needs a retroflex ट where the rules are
   * right to guess त, because `t` really is त far more often than it is ट.
   * Neither is fixable by a better rule; both are fixable by knowing the word.
   */
  test('the words the rules used to get wrong', () => {
    assert.equal(h('badhiya'), 'बढ़िया');
    assert.equal(h('gitaar'), 'गिटार');
    assert.equal(h('guitar'), 'गिटार');
  });

  test('the common alternative spellings land on the same word', () => {
    for (const [a, b] of [
      ['badhiya', 'badiya'],
      ['gitaar', 'gitar'],
      ['bazaar', 'bazar'],
      ['accha', 'acha'],
      ['saaf', 'saf'],
      ['aloo', 'alu'],
    ]) {
      assert.equal(h(a), h(b), `${a} and ${b} give different Hindi`);
    }
  });

  test('retroflex and nukta words the rules cannot reach', () => {
    assert.equal(h('tamatar'), 'टमाटर');
    assert.equal(h('computer'), 'कंप्यूटर');
    assert.equal(h('thanda'), 'ठंडा');
    assert.equal(h('padhai'), 'पढ़ाई');
    assert.equal(h('khidki'), 'खिड़की');
    assert.equal(h('kagaz'), 'कागज़');
  });

  test('the days of the week are all there', () => {
    assert.equal(h('somvar'), 'सोमवार');
    assert.equal(h('ravivar'), 'रविवार');
    assert.equal(h('shukravar'), 'शुक्रवार');
  });

  test('everyday verbs whose stem the rules cannot spell', () => {
    assert.equal(h('chhodna'), 'छोड़ना');
    assert.equal(h('pahunchna'), 'पहुंचना');
    assert.equal(h('dhundhna'), 'ढूंढना');
    assert.equal(h('hansna'), 'हंसना');
    assert.equal(h('mangna'), 'मांगना');
  });
});

// ============================================================================
// The future tense
// ============================================================================

/**
 * `khaunga` came out खौंगा and `karunga` came out करुंगा. Both are the same
 * mistake - the vowel in this ending is LONG and Hinglish does not write it -
 * and both are fixed by a rule rather than a word list, because Hindi builds
 * this ending on any verb at all.
 */
describe('the -ऊंगा future, which no word list could cover', () => {
  test('a vowel stem takes आऊंगा, not औंगा', () => {
    assert.equal(h('khaunga'), 'खाऊंगा');
    assert.equal(h('jaunga'), 'जाऊंगा');
    assert.equal(h('aunga'), 'आऊंगा');
    assert.equal(h('paunga'), 'पाऊंगा');
  });

  test('a consonant stem takes ूंगा, not ुंगा', () => {
    assert.equal(h('karunga'), 'करूंगा');
    assert.equal(h('chalunga'), 'चलूंगा');
    assert.equal(h('bolunga'), 'बोलूंगा');
    assert.equal(h('lunga'), 'लूंगा');
    assert.equal(h('dunga'), 'दूंगा');
  });

  test('feminine and plural endings too', () => {
    assert.equal(h('jaungi'), 'जाऊंगी');
    assert.equal(h('jaunge'), 'जाऊंगे');
    assert.equal(h('karungi'), 'करूंगी');
    assert.equal(h('karunge'), 'करूंगे');
  });

  test('the doubled-a spelling lands on the same word', () => {
    // A greedy stem ate the first `a` of `khaaunga` and left the spare as a
    // second आ - खाऔउंगा. The stem has to be lazy so the ending gets the vowels.
    for (const [a, b] of [
      ['khaunga', 'khaaunga'],
      ['jaunga', 'jaaunga'],
      ['aunga', 'aaunga'],
      ['jaungi', 'jaaungi'],
    ]) {
      assert.equal(h(a), h(b), `${a} and ${b} disagree`);
    }
  });

  test('the oo spelling works, because people write it that way', () => {
    assert.equal(h('jaoonga'), 'जाऊंगा');
    assert.equal(h('karoonga'), 'करूंगा');
  });

  test('it generalises to verbs nobody listed', () => {
    // The whole reason this is a rule. None of these are in the dictionary.
    assert.equal(h('banaunga'), 'बनाऊंगा');
    assert.equal(h('launga'), 'लाऊंगा');
    assert.equal(h('gaunga'), 'गाऊंगा');
    assert.equal(h('dekhunga'), 'देखूंगा');
    assert.equal(h('milunga'), 'मिलूंगा');
    assert.equal(h('sununga'), 'सुनूंगा');
  });

  test('a stem needing a nukta or retroflex is still listed, and still wins', () => {
    // The rule fixes the ending; it cannot know ढ़ from ध. WORDS is consulted
    // first, so these never reach it.
    assert.equal(h('padhunga'), 'पढ़ूंगा');
    assert.equal(h('baithunga'), 'बैठूंगा');
    assert.equal(h('uthunga'), 'उठूंगा');
    assert.equal(h('samjhunga'), 'समझूंगा');
  });

  /**
   * Where the rule stops, and why it stops there.
   *
   * The obvious wider version - any final `-aun` is आऊं - would rewrite four
   * common words that are already correct. This is the test that says so.
   */
  test('it leaves the -aun words that are not verbs alone', () => {
    assert.equal(h('kaun'), 'कौन');
    assert.equal(h('maun'), 'मौन');
    assert.equal(h('saunf'), 'सौंफ');
    assert.equal(h('chaunk'), 'चौंक');
    assert.equal(h('daud'), 'दौड़');
  });

  test('it does not fire on a word that merely contains the letters', () => {
    assert.equal(h('jungle'), 'जंगल');
    assert.equal(h('jangal'), 'जंगल');
  });

  test('the subjunctive is listed rather than ruled, and is right', () => {
    assert.equal(h('jaun'), 'जाऊं');
    assert.equal(h('karun'), 'करूं');
    assert.equal(h('aao'), 'आओ');
    assert.equal(h('jaao'), 'जाओ');
    assert.equal(h('khaao'), 'खाओ');
  });
});

// ============================================================================
// Punctuation
// ============================================================================

/**
 * Punctuation is not a letter and must arrive exactly as it was typed.
 *
 * The failure this guards against is a question mark coming back as a visarg
 * (ः) - `kya?` reading as क्याः. ITRANS does spend ASCII on meaning, so the
 * notation genuinely contains `H` for visarg and `.` for the anusvara, which
 * is what makes this worth pinning in both modes rather than assuming.
 */
describe('punctuation passes through untouched', () => {
  test('the question mark stays a question mark', () => {
    assert.equal(h('kya?'), 'क्या?');
    assert.equal(h('kya hai?'), 'क्या है?');
    assert.equal(h('hai na!'), 'है ना!');
  });

  test('the typing page passes ASCII symbols and digits through unchanged', () => {
    // The named case. On THIS page - and only this page - every ASCII symbol is
    // itself, because the input is Roman text a person typed, not a legacy
    // font's glyph slots. The legacy converters are the opposite: there `%` is
    // visarg, `]` is a comma and `,` is ए, because in those fonts that is what
    // those slots draw. Two different jobs, two different rules, and mixing
    // them up in either direction corrupts text.
    assert.equal(h('kya? hai! 100% @ #'), 'क्या? है! 100% @ #');

    for (const c of [...`?!@#$%^&*()_+=.,/\\:;"'-`, ...'0123456789']) {
      const out = h(`ghar ${c} bagh`);
      assert.ok(out.includes(c), `${JSON.stringify(c)} was lost: ${JSON.stringify(out)}`);
    }
  });

  /**
   * The reported list, pinned verbatim.
   *
   * Only `100% off` is not an equality: `off` is a run of letters, so it
   * transliterates like any other word, and the two engines do not even agree
   * on the result (`ओफ्फ` here, `ऑफ` from Google). What the report was actually
   * about is the `%` and the digits either side of it, so that is what is
   * asserted - pinning a spelling the network can change would be a test that
   * fails for the wrong reason.
   */
  test('the reported cases, exactly as reported', () => {
    assert.equal(h('kya?'), 'क्या?');
    assert.equal(h('hai ? kya ?'), 'है ? क्या ?');
    assert.equal(h('a@b.com'), 'a@b.com');
    assert.equal(h('$ # @ ! % ^ & * ( )'), '$ # @ ! % ^ & * ( )');
    assert.equal(h('namaste, bhai. kya haal?'), 'नमस्ते, भाई. क्या हाल?');
    assert.equal(h('1 + 1 = 2'), '1 + 1 = 2');
    assert.match(h('100% off'), /^100% /);
  });

  test('no punctuation ever becomes a Devanagari mark', () => {
    // Visarg, danda and double danda are the three it could plausibly turn
    // into, and none of them has an ASCII key a Hinglish typist would press.
    const marks = /[ः।॥]/;
    for (const p of [...`!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`]) {
      for (const mode of ['hinglish', 'itrans']) {
        // `kya${p}hai` and `${p}${p}` are the shapes this list used to be
        // missing, and the gap was not academic: with punctuation BETWEEN two
        // letters and no space to break the run on, itrans mode turned
        // `kya.hai` into क्याइ and `x.y.z` into क्ष्।य्।ज़् - losing the full
        // stop, inventing a danda, and eating the letter behind it. Every
        // context here had a space or an edge, so nothing ever caught it.
        for (const ctx of [
          p,
          `kya${p}`,
          `kya${p} hai`,
          `${p}kya`,
          `kya${p}hai`,
          `${p}${p}`,
          `ghar ${p} bagh`,
        ]) {
          const out = romanToUnicode(ctx, { mode });
          assert.ok(out.includes(p), `${mode}: ${JSON.stringify(ctx)} lost ${JSON.stringify(p)}`);
          assert.doesNotMatch(
            out,
            marks,
            `${mode}: ${JSON.stringify(ctx)} produced a Devanagari mark: ${JSON.stringify(out)}`,
          );
        }
      }
    }
  });

  test('a sentence keeps its shape', () => {
    assert.equal(
      h('kya aap theek hain? haan, main theek hu!'),
      'क्या आप ठीक हैं? हाँ, मैं ठीक हूँ!',
    );
  });

  test('visarg is still reachable where it genuinely belongs', () => {
    // दुःख really does carry one, from the dictionary - so the rule above is
    // "punctuation never becomes a mark", not "the mark does not exist".
    assert.match(h('dukh'), /ः/);
    assert.equal(i('duHkha'), 'दुःख');
  });

  /**
   * The dictionary is a plain object literal, so a key written twice is not an
   * error - the later one silently wins and the earlier line is dead. There was
   * one of these (`bachcha`) before this test existed.
   *
   * Read from the source text rather than the object, because by the time it is
   * an object the duplicate is already gone.
   */
  test('no word is listed twice', () => {
    const src = readFileSync(new URL('./translit.js', import.meta.url), 'utf8');
    const body = src.match(/const WORDS = \{([\s\S]*?)\n\};/);
    assert.ok(body, 'the WORDS table could not be found - has it been renamed?');

    const seen = new Map();
    for (const [, key] of body[1].matchAll(/(?:^|[\s{,])([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
    assert.deepEqual(dupes, [], `listed twice: ${dupes.join(', ')}`);
    assert.ok(seen.size > 400, `only ${seen.size} words in the dictionary`);
  });

  /**
   * Every dictionary word has to survive the legacy round trip, because the
   * page offers "Copy Kruti code" on exactly this output. An entry needing a
   * character the font cannot carry would transliterate correctly and then be
   * silently mangled on the way to the clipboard.
   */
  test('every dictionary word survives a Kruti Dev round trip', () => {
    const src = readFileSync(new URL('./translit.js', import.meta.url), 'utf8');
    const body = src.match(/const WORDS = \{([\s\S]*?)\n\};/)[1];
    const keys = [...body.matchAll(/(?:^|[\s{,])([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]);

    const opts = { keepEnglish: false };
    for (const key of keys) {
      const deva = h(key);
      const back = convert(convert(deva, 'unicode', 'kruti-dev', opts), 'kruti-dev', 'unicode', opts);
      assert.equal(back, deva, `${key} (${deva}) does not survive Kruti Dev`);
    }
  });
});

describe('itrans mode stays exact', () => {
  test('the notation survives tokenising', () => {
    // The bug this pins: splitting on letters alone turns `hi.ndii` into `hi`
    // and `ndii`, and the anusvara is silently dropped.
    assert.equal(i('hi.ndii'), 'हिंदी');
    assert.equal(i('mai.n'), 'मैं');
    assert.equal(i('huu.N'), 'हूँ');
    assert.equal(i('raaShTriiya'), 'राष्ट्रीय');
    assert.equal(i('kR^ipayaa'), 'कृपया');
  });

  test('a sentence-ending full stop is punctuation, not notation', () => {
    assert.equal(i('namaste.'), 'नमस्ते.');
  });

  /**
   * The same question one position to the left, which is where it used to be
   * answered wrong.
   *
   * A trailing mark was handed back by hand, so `namaste.` had always been
   * safe. A mark BETWEEN two letters had nothing to save it: the token ran
   * `[A-Za-z.~^]*` straight through it, and Sanscript was then asked to read
   * `.h` and `~h` as notation. It does not refuse - it returns something - so
   * the full stop and the letter behind it disappeared silently.
   */
  test('a full stop between two letters is punctuation too', () => {
    assert.equal(i('kya.hai'), 'क्य.है');
    assert.equal(i('kya~hai'), 'क्य~है');
    // `.` must never come back as a danda, which is what it did here.
    assert.doesNotMatch(i('x.y.z'), /।/);
    assert.equal((i('file.txt').match(/\./g) || []).length, 1);
  });

  test('the notation itself still spends the marks it is entitled to', () => {
    // The other half of the same rule: `.` `~` `^` ARE notation in these, and
    // narrowing the token must not have cost any of them.
    assert.equal(i('hi.ndii'), 'हिंदी'); // .n
    assert.equal(i('huu.N'), 'हूँ'); // .N
    assert.equal(i('la.Dakaa'), 'लड़का'); // .D
    assert.equal(i('ba.Dhiyaa'), 'बढ़िया'); // .Dh
    assert.equal(i('ja~naa'), 'जञा'); // ~n
    assert.equal(i('ra~Nga'), 'रङ्ग'); // ~N
    assert.equal(i('j~naana'), 'ज्ञान'); // j~n
    assert.equal(i('kR^ipayaa'), 'कृपया'); // R^i
    assert.equal(i('R^IShi'), 'ॠषि'); // R^I
    assert.equal(i('L^ikaara'), 'ऌकार'); // L^i
    assert.equal(i('chaa.Ndanii'), 'चाँदनी');
  });

  test('exact mode does NOT apply the hinglish guesses', () => {
    assert.equal(i('bhaarata'), 'भारत');
    assert.equal(i('ghara'), 'घर');
    // No final-vowel lengthening: what you write is what you get.
    assert.equal(i('dilli'), 'दिल्लि');
  });

  test('both modes are offered by name', () => {
    assert.deepEqual(Object.keys(MODES), ['hinglish', 'itrans']);
    for (const m of Object.values(MODES)) {
      for (const f of ['key', 'label', 'hint']) assert.ok(m[f], `${m.key} missing ${f}`);
    }
  });

  test('an unknown mode throws rather than silently guessing', () => {
    assert.throws(() => romanToUnicode('x', { mode: 'nope' }), /Unknown transliteration mode/);
  });
});

/**
 * The page prints these under the boxes as a promise about what the engine does.
 * They used to be a hand-written table, and it drifted: the page said `ri` = ऋ
 * while the engine produced री, with nothing anywhere to catch it.
 *
 * Now the Devanagari side is generated by running the engine, so a tip cannot
 * disagree with it by construction. These tests cover what construction alone
 * cannot: that the Roman side is a sensible thing to advertise, and that the
 * specific claims the page makes are the ones we meant to make.
 */
describe('spelling tips say what the engine actually does', () => {
  for (const mode of Object.keys(TIP_KEYS)) {
    test(`${mode}: every tip round-trips through the engine`, () => {
      for (const { roman, deva } of tipsFor(mode)) {
        assert.equal(romanToUnicode(roman, { mode }), deva, `tip "${roman}"`);
      }
    });

    test(`${mode}: every tip produces Devanagari and nothing else`, () => {
      for (const { roman, deva } of tipsFor(mode)) {
        assert.ok(deva.length > 0, `tip "${roman}" produces nothing`);
        assert.match(deva, /^[ऀ-ॿ]+$/, `tip "${roman}" -> ${JSON.stringify(deva)}`);
      }
    });

    test(`${mode}: no tip leaves a stray halant`, () => {
      // A bare consonant in ITRANS carries one, which is exactly why the two
      // modes cannot share a tip list. Every tip must show a finished letter.
      for (const { roman, deva } of tipsFor(mode)) {
        assert.doesNotMatch(deva, /्$/, `tip "${roman}" -> ${deva} ends in a halant`);
      }
    });

    test(`${mode}: tips are unique`, () => {
      const keys = TIP_KEYS[mode];
      assert.equal(new Set(keys).size, keys.length);
    });
  }

  test('the modes offering tips are exactly the modes the UI offers', () => {
    assert.deepEqual(Object.keys(TIP_KEYS).sort(), Object.keys(MODES).sort());
  });

  test('an unknown mode has no tips rather than silently empty ones', () => {
    assert.throws(() => tipsFor('nope'), /No tips for mode/);
  });

  test('the claims the page makes are the intended ones', () => {
    const h = Object.fromEntries(tipsFor('hinglish').map((t) => [t.roman, t.deva]));
    assert.deepEqual(h, {
      kh: 'ख', chh: 'छ', sh: 'श',
      aa: 'आ', ee: 'ई', oo: 'ऊ',
      ri: 'री', rri: 'ऋ', ksh: 'क्ष',
    });

    const i = Object.fromEntries(tipsFor('itrans').map((t) => [t.roman, t.deva]));
    assert.deepEqual(i, {
      kha: 'ख', chha: 'छ', sha: 'श', Sha: 'ष',
      aa: 'आ', ii: 'ई', uu: 'ऊ',
      'R^i': 'ऋ', kSha: 'क्ष',
    });
  });

  test('the two modes really do need separate tips', () => {
    // If this ever stops being true the split is dead weight - but it is the
    // reason the original single list could not be correct for both.
    assert.notEqual(romanToUnicode('kh', { mode: 'hinglish' }), romanToUnicode('kh', { mode: 'itrans' }));
  });
});

describe('the vocalic r, which is what the tip got wrong', () => {
  test('ri stays री, because that is what it usually is', () => {
    assert.equal(romanToUnicode('ri'), 'री');
    assert.equal(romanToUnicode('rishta'), 'रिश्ता');
  });

  test('rri is the way to ask for ऋ', () => {
    assert.equal(romanToUnicode('rri'), 'ऋ');
    assert.equal(romanToUnicode('RRi'), 'ऋ', 'the ITRANS spelling should work too');
  });

  test('the everyday ऋ words are named rather than guessed', () => {
    assert.equal(romanToUnicode('rishi'), 'ऋषि');
    assert.equal(romanToUnicode('ritu'), 'ऋतु');
    assert.equal(romanToUnicode('rin'), 'ऋण');
  });

  test('adding rri did not disturb ordinary doubled r', () => {
    assert.equal(romanToUnicode('arre'), 'अर्रे');
  });

  test('the kri ligature still works, in both spellings', () => {
    assert.equal(romanToUnicode('krishna'), 'कृष्ण');
    assert.equal(romanToUnicode('kripya'), 'कृपया');
  });
});

describe('structure is never touched', () => {
  test('whitespace and line breaks survive exactly', () => {
    for (const ws of ['\n', '\r\n', '\n\n', '\t', '   ', '\n \n']) {
      assert.equal(h(`ghar${ws}se`), `घर${ws}से`);
    }
  });

  test('digits, dates and punctuation pass through', () => {
    assert.equal(h('dinank 15/08/1947'), 'दिनांक 15/08/1947');
    assert.equal(h('bharat 2024'), 'भारत 2024');
    assert.equal(h('namaste!'), 'नमस्ते!');
  });

  test('URLs and emails are protected', () => {
    assert.match(h('dekhen https://mykrutidev.com/help'), /https:\/\/mykrutidev\.com\/help/);
    assert.match(h('mail info@mykrutidev.com'), /info@mykrutidev\.com/);
  });

  test('text already in Devanagari is left alone', () => {
    assert.equal(h('भारत'), 'भारत');
  });

  test('empty input is empty output', () => {
    assert.equal(h(''), '');
    assert.equal(i(''), '');
  });

  test('a large input does not blow up', () => {
    const big = 'namaste '.repeat(5000);
    assert.equal(h(big).trim().split(/\s+/).length, 5000);
  });
});

/**
 * An apostrophe is part of a Latin run - `don't` has to tokenise as one word or
 * the `t` transliterates on its own. So the apostrophe reaches the fragment
 * pass, where nothing matches it, and it has to fall through untouched rather
 * than be dropped or crash the loop.
 *
 * It matters for the words Hinglish actually spells with one: `ma'am`, and the
 * `a'i`/`a'e` people write to break a vowel that would otherwise read as one
 * sound.
 */
describe('a character no fragment matches falls through', () => {
  test('the apostrophe survives the rewrite', () => {
    assert.equal(toItrans("ma'am"), "ma'ama");
    assert.equal(toItrans("bha'i"), "bha'ii");
  });

  test('the letters around it are still rewritten normally', () => {
    // The final `i` still lengthens and the final consonant still gets its
    // inherent vowel - the unknown character does not stop the other rules.
    assert.equal(toItrans("k'l"), "k'la");
  });

  test('the curly apostrophe holds a word together as well as the straight one', () => {
    // Both are in LATIN_RUN, and each comes back as itself - the engine does
    // not quietly normalise one into the other.
    assert.ok(h("don't").includes("'"));
    assert.ok(h('don’t').includes('’'));
    assert.equal(h("don't").replace("'", '’'), h('don’t'));
  });

  test('it reaches the page without throwing', () => {
    for (const s of ["ma'am", "bha'i", "don't", "aa'o"]) {
      assert.doesNotThrow(() => h(s));
      assert.ok(h(s).length > 0);
    }
  });

  test('an apostrophe does not split the word into two', () => {
    // If the tokeniser split on it, `don` and `t` would transliterate apart and
    // the `t` would come back as a bare ट.
    assert.equal(h("don't").includes(' '), false);
  });
});

/**
 * The page offers a Kruti Dev output option. It is this composition and nothing
 * more - transliterate to Unicode, then hand the Unicode to the font engine -
 * so the two engines stay separate and neither learns about the other.
 */
describe('composing with the font converter', () => {
  const pipeline = (roman) => convert(romanToUnicode(roman), 'unicode', 'kruti-dev');

  test('roman -> unicode -> kruti dev', () => {
    assert.equal(pipeline('bharat'), 'Hkkjr');
    assert.equal(pipeline('namaste'), 'ueLrs');
    assert.equal(pipeline('hindi'), 'fganh');
  });

  test('the legacy output decodes back to what was typed', () => {
    for (const roman of ['namaste bharat', 'mera naam ram hai', 'shiksha']) {
      const unicode = romanToUnicode(roman);
      const legacy = convert(unicode, 'unicode', 'kruti-dev');
      assert.equal(convert(legacy, 'kruti-dev', 'unicode'), unicode, `on "${roman}"`);
    }
  });

  test('line breaks survive the whole pipeline', () => {
    const out = pipeline('namaste\n\nbharat');
    assert.match(out, /\n\n/);
    assert.equal(convert(out, 'kruti-dev', 'unicode'), 'नमस्ते\n\nभारत');
  });
});

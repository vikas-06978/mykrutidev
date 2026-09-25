import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  chunkText,
  parseInputTools,
  restoreDigits,
  googleToUnicode,
  isAvailable,
  MAX_CHUNK,
  _resetCache,
  _resetBreaker,
  _decodeEntities,
  _mask,
  _unmask,
} from './googleTranslit.js';

beforeEach(() => {
  _resetCache();
  _resetBreaker();
});

/** A fetch that answers with whatever `reply` makes of the requested text. */
function fakeFetch(reply, log) {
  return async (url) => {
    // searchParams already percent-decodes. Decoding again looks harmless until
    // the text contains a literal `%`, which is then read as an escape.
    const text = new URL(url).searchParams.get('text');
    log?.push(text);
    const payload = reply(text);
    if (payload instanceof Error) throw payload;
    return { ok: true, status: 200, json: async () => payload };
  };
}

/** The shape Google actually returns, for one segment. */
const oneSegment = (src, hindi, extra = {}) => [
  'SUCCESS',
  [[src, [hindi], [], { candidate_type: [0], ...extra }]],
];

// ---------------------------------------------------------------------------

describe('chunkText: pieces must rejoin to exactly the input', () => {
  const cases = [
    '',
    'namaste',
    'main ghar ja raha hu',
    'a '.repeat(400),
    'ek line\ndusri line\n\ntisri',
    'x'.repeat(500),
    '   ',
    'word ' + 'y'.repeat(300) + ' word',
  ];

  for (const input of cases) {
    test(JSON.stringify(input.slice(0, 32)), () => {
      const chunks = chunkText(input);
      assert.equal(chunks.join(''), input, 'lossless rejoin');
      for (const c of chunks) {
        assert.ok(c.length <= MAX_CHUNK, `chunk of ${c.length} exceeds ${MAX_CHUNK}`);
      }
    });
  }

  test('short text is one chunk', () => {
    assert.deepEqual(chunkText('namaste bharat'), ['namaste bharat']);
  });

  test('empty text is no chunks, because the endpoint rejects empty text', () => {
    assert.deepEqual(chunkText(''), []);
  });

  test('breaks fall between words, not inside them', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkText(text);
    assert.ok(chunks.length > 1, 'this input should need splitting');
    // Every chunk starts a word: no chunk begins mid-token.
    for (const c of chunks.slice(1)) {
      assert.ok(!/^\w/.test(c) || /\s$/.test(chunks[chunks.indexOf(c) - 1]), 'clean seam');
    }
    assert.equal(chunks.join(''), text);
  });

  test('a single oversized token is cut where it must be', () => {
    const chunks = chunkText('z'.repeat(MAX_CHUNK * 2 + 5));
    assert.equal(chunks.length, 3);
    assert.equal(chunks.join(''), 'z'.repeat(MAX_CHUNK * 2 + 5));
  });
});

// ---------------------------------------------------------------------------

describe('parseInputTools: the undocumented shape', () => {
  test('reads the top candidate', () => {
    assert.equal(parseInputTools(oneSegment('badhiya', 'बढ़िया')), 'बढ़िया');
  });

  test('joins multiple segments in order, which is how sentences come back', () => {
    const payload = [
      'SUCCESS',
      [
        ['namaste bharat', ['नमस्ते भारत'], [], { candidate_type: [0] }],
        [' aaj hai.', [' आज है.'], [], { candidate_type: [0] }],
      ],
    ];
    assert.equal(parseInputTools(payload), 'नमस्ते भारत आज है.');
  });

  test('takes the FIRST candidate when several are offered', () => {
    const payload = ['SUCCESS', [['thela', ['ठेला', 'ठेले', 'थैला'], [], {}]]];
    assert.equal(parseInputTools(payload), 'ठेला');
  });

  for (const [name, bad] of [
    ['a failure status', ['FAILED_TO_PARSE_REQUEST_BODY']],
    ['no segments', ['SUCCESS', []]],
    ['a segment with no candidates', ['SUCCESS', [['x', [], [], {}]]]],
    ['a non-string candidate', ['SUCCESS', [['x', [42], [], {}]]]],
    ['not an array at all', { error: 'nope' }],
    ['null', null],
  ]) {
    test(`throws on ${name}`, () => {
      assert.throws(() => parseInputTools(bad));
    });
  }

  test('throws when Google truncated, rather than returning half a line', () => {
    const src = 'a'.repeat(200);
    const payload = ['SUCCESS', [[src, ['आ'], [], { matched_length: [180] }]]];
    assert.throws(() => parseInputTools(payload), /truncated at 180/);
  });

  test('a matched_length covering the whole segment is not truncation', () => {
    const payload = ['SUCCESS', [['abc', ['अब'], [], { matched_length: [3] }]]];
    assert.equal(parseInputTools(payload), 'अब');
  });
});

// ---------------------------------------------------------------------------

describe('restoreDigits: the site passes numbers through', () => {
  test('Devanagari numerals become ASCII again', () => {
    assert.equal(restoreDigits('आज २५ तारीख', 'aaj 25 tarikh'), 'आज 25 तारीख');
  });

  test('all ten', () => {
    assert.equal(restoreDigits('०१२३४५६७८९', '0123456789'), '0123456789');
  });

  test('Hindi with no digits is untouched', () => {
    assert.equal(restoreDigits('नमस्ते भारत', 'namaste bharat'), 'नमस्ते भारत');
  });

  test('deliberately pasted Devanagari numerals are left alone', () => {
    // Source already had २५, so there is no way to tell Google's conversion
    // apart from the user's own text. Leave the user's text alone.
    assert.equal(restoreDigits('मेरा २५', 'mera २५'), 'मेरा २५');
  });
});

// ---------------------------------------------------------------------------

describe('googleToUnicode: end to end against a fake endpoint', () => {
  test('returns the Hindi', async () => {
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'मैं बढ़िया है'));
    assert.equal(
      await googleToUnicode('main badhiya hai', { fetchImpl }),
      'मैं बढ़िया है',
    );
  });

  test("the shared nasal corrections are applied to Google's answer too", async () => {
    // Google really does return हु/हूं for `hu`, and corrections.js really does
    // overrule it. Asserting it here as well as in corrections.test.js is what
    // stops the two engines drifting apart: this is the seam where the table
    // could silently stop being applied to the network result.
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'मैं घर हूं'));
    assert.equal(await googleToUnicode('main ghar hu', { fetchImpl }), 'मैं घर हूँ');
  });

  test('empty in, empty out, and no request', async () => {
    const log = [];
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'x'), log);
    assert.equal(await googleToUnicode('', { fetchImpl }), '');
    assert.deepEqual(log, []);
  });

  test('nukta comes back decomposed, matching the converter and translit.js', async () => {
    // U+095C precomposed, as Google sends it.
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'ड़'));
    const out = await googleToUnicode('d', { fetchImpl });
    assert.equal(out, 'ड़', 'ड + combining nukta');
    assert.ok(!out.includes('ड़'), 'no precomposed form survives');
  });

  test('URLs are never sent and never rewritten', async () => {
    const log = [];
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'देखो'), log);
    const out = await googleToUnicode('https://google.com dekho', { fetchImpl });
    assert.ok(out.startsWith('https://google.com'), `url survived: ${out}`);
    assert.ok(
      log.every((sent) => !sent.includes('google.com')),
      'the URL must not reach the network',
    );
  });

  test('emails are never sent and never rewritten', async () => {
    const log = [];
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'मेल'), log);
    const out = await googleToUnicode('mail@example.com par', { fetchImpl });
    assert.ok(out.includes('mail@example.com'));
    assert.ok(log.every((sent) => !sent.includes('@')));
  });

  test('a chunk with no Roman letters is not sent at all', async () => {
    const log = [];
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'x'), log);
    assert.equal(await googleToUnicode('123 -- ४५६', { fetchImpl }), '123 -- ४५६');
    assert.deepEqual(log, []);
  });

  test('long text is chunked, and the pieces rejoin in order', async () => {
    const log = [];
    // Each chunk answers with its own length, so an out-of-order or dropped
    // chunk changes the result visibly.
    const fetchImpl = fakeFetch((t) => oneSegment(t, `[${t.trim().split(/\s+/).length}]`), log);
    const text = Array.from({ length: 80 }, (_, i) => `shabd${i}`).join(' ');

    const out = await googleToUnicode(text, { fetchImpl });
    assert.ok(log.length > 1, 'should have needed more than one request');
    for (const sent of log) assert.ok(sent.length <= MAX_CHUNK);
    assert.equal(log.join(''), text, 'every character was sent exactly once');

    const total = [...out.matchAll(/\[(\d+)\]/g)].reduce((n, m) => n + Number(m[1]), 0);
    assert.equal(total, 80, 'every word accounted for');
  });

  test('identical chunks are only requested once', async () => {
    const log = [];
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'नमस्ते'), log);
    await googleToUnicode('namaste', { fetchImpl });
    await googleToUnicode('namaste', { fetchImpl });
    await googleToUnicode('namaste', { fetchImpl });
    assert.equal(log.length, 1, 'cached after the first');
  });
});

// ---------------------------------------------------------------------------

describe('punctuation the endpoint mangles', () => {
  describe('HTML entities are decoded', () => {
    const cases = [
      ['&quot;', '"'],
      ['&amp;', '&'],
      ['&lt;', '<'],
      ['&gt;', '>'],
      ['&apos;', "'"],
      ['&#39;', "'"],
      ['&#x41;', 'A'],
      ['क्या &quot;ye&quot; है?', 'क्या "ye" है?'],
      ['राम &amp; श्याम', 'राम & श्याम'],
    ];
    for (const [raw, want] of cases) {
      test(`${raw} -> ${want}`, () => {
        assert.equal(_decodeEntities(raw), want);
      });
    }

    test('decoding happens once, so a decoded & is not read again', () => {
      // `&amp;quot;` must become `&quot;`, NOT `"`. A second pass would eat the
      // user's own literal text.
      assert.equal(_decodeEntities('&amp;quot;'), '&quot;');
    });

    test('text with no entity is returned untouched', () => {
      assert.equal(_decodeEntities('क्या तुम हो?'), 'क्या तुम हो?');
      assert.equal(_decodeEntities('a & b'), 'a & b');
    });

    test('nonsense entities are left as typed', () => {
      assert.equal(_decodeEntities('&notareal;'), '&notareal;');
      assert.equal(_decodeEntities('&#999999999;'), '&#999999999;');
      assert.equal(_decodeEntities('&#xD800;'), '&#xD800;', 'lone surrogate');
    });
  });

  describe('the destroyed characters are masked and restored', () => {
    test('every masked character survives a round trip', () => {
      for (const c of [',', '~', '^', '|']) {
        const text = `ek${c} do${c}teen ${c}`;
        assert.equal(_unmask(_mask(text)), text, `round trip for ${c}`);
      }
    });

    test('masking does not change the length, so chunking is unaffected', () => {
      const text = 'ek, do ~ teen ^ char | panch';
      assert.equal(_mask(text).length, text.length);
    });

    test('nothing else is masked', () => {
      const keep = `ek! do" teen# char$ %&'()*+-./:;<=>?@[]_\`{}`;
      assert.equal(_mask(keep), keep);
    });
  });

  describe('end to end, against what the endpoint really returns', () => {
    test('a comma survives, in every position', async () => {
      // The fake echoes back whatever it was sent, which is the masked form -
      // exactly what the real endpoint does with the stand-ins.
      const fetchImpl = fakeFetch((t) => oneSegment(t, t.replace(/[a-z]+/g, 'क')));
      for (const text of ['ek, do', 'ek,do', 'ek , do', ',ek', 'ek,']) {
        const out = await googleToUnicode(text, { fetchImpl });
        assert.equal(
          (out.match(/,/g) || []).length,
          (text.match(/,/g) || []).length,
          `commas in ${JSON.stringify(text)} -> ${JSON.stringify(out)}`,
        );
        assert.ok(!/[-]/.test(out), 'no stand-in may leak out');
      }
    });

    test('a comma never reaches the network as a comma', async () => {
      const log = [];
      const fetchImpl = fakeFetch((t) => oneSegment(t, 'क'), log);
      await googleToUnicode('ek, do', { fetchImpl });
      assert.ok(log.length > 0);
      for (const sent of log) {
        assert.ok(!sent.includes(','), `a raw comma was sent: ${JSON.stringify(sent)}`);
        assert.ok(sent.includes(''), 'the stand-in should be there instead');
      }
    });

    test('the characters that blank the whole response are masked too', async () => {
      const log = [];
      const fetchImpl = fakeFetch((t) => oneSegment(t, t.replace(/[a-z]+/g, 'क')), log);
      const out = await googleToUnicode('ek ~ do ^ teen | char', { fetchImpl });
      for (const c of ['~', '^', '|']) {
        assert.ok(out.includes(c), `${c} missing from ${JSON.stringify(out)}`);
        assert.ok(log.every((s) => !s.includes(c)), `${c} was sent raw`);
      }
    });

    test('an escaped answer is decoded before it is handed back', async () => {
      const fetchImpl = fakeFetch(() => oneSegment('x', 'क्या &quot;ये&quot; है?'));
      assert.equal(
        await googleToUnicode('kya "ye" hai?', { fetchImpl }),
        'क्या "ये" है?',
      );
    });

    test('the other punctuation is passed through as the engine returned it', async () => {
      const fetchImpl = fakeFetch(() => oneSegment('x', 'क्या तुम हो? हाँ! (ek) - do; teen: char.'));
      assert.equal(
        await googleToUnicode('kya tum ho? haan! (ek) - do; teen: char.', { fetchImpl }),
        'क्या तुम हो? हाँ! (ek) - do; teen: char.',
      );
    });

    test('EVERY ASCII punctuation mark survives, in every position', async () => {
      // The mirror of "no punctuation ever becomes a Devanagari mark" in
      // translit.test.js. That test has guarded the rule engine for a long
      // time, and it is exactly why the rule engine never had this bug - but it
      // only ever covered translit.js, so when this module was added the
      // guarantee silently stopped applying to the text most people see.
      //
      // The fake echoes its input back with the letters turned into Devanagari,
      // which is what the real endpoint does once the stand-ins are in place.
      const fetchImpl = fakeFetch((t) => oneSegment(t, t.replace(/[a-z]+/g, 'क')));
      const marks = /[ः।॥]/;

      for (const p of [...`!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`]) {
        // `kya${p}hai` and `${p}${p}` are here because their absence from the
        // twin list in translit.test.js is what let the itrans tokeniser eat a
        // full stop sitting between two letters. This path does not have that
        // bug, but the two lists are the same guarantee and drifting apart is
        // how the first one went unnoticed.
        for (const ctx of [
          `kya${p}`,
          `kya${p} hai`,
          `${p}kya`,
          `kya${p}hai`,
          `${p}${p}`,
          `ghar ${p} bagh`,
        ]) {
          const out = await googleToUnicode(ctx, { fetchImpl });
          assert.ok(
            out.includes(p),
            `${JSON.stringify(ctx)} lost ${JSON.stringify(p)} -> ${JSON.stringify(out)}`,
          );
          assert.equal(
            (out.match(new RegExp(`\\${p}`, 'g')) || []).length,
            (ctx.match(new RegExp(`\\${p}`, 'g')) || []).length,
            `${JSON.stringify(ctx)} changed how many ${JSON.stringify(p)} there are`,
          );
          assert.doesNotMatch(
            out,
            marks,
            `${JSON.stringify(ctx)} produced a Devanagari mark: ${JSON.stringify(out)}`,
          );
          assert.doesNotMatch(out, /[-]/, 'a stand-in leaked out');
        }
      }
    });

    test('a pasted stand-in is never turned into a comma', async () => {
      // Pathological, but it must not invent punctuation the user never typed.
      const fetchImpl = fakeFetch((t) => oneSegment(t, t.replace(/[a-z]+/g, 'क')));
      const out = await googleToUnicode('ekdo', { fetchImpl });
      assert.ok(!out.includes(','), `invented a comma: ${JSON.stringify(out)}`);
    });
  });
});

// ---------------------------------------------------------------------------

describe('failure is reported, never papered over', () => {
  test('a network error rejects', async () => {
    const fetchImpl = async () => {
      throw new Error('offline');
    };
    await assert.rejects(() => googleToUnicode('namaste', { fetchImpl }), /offline/);
  });

  test('an HTTP error rejects', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await assert.rejects(() => googleToUnicode('namaste', { fetchImpl }), /429/);
  });

  test('a changed response shape rejects rather than returning junk', async () => {
    const fetchImpl = fakeFetch(() => ({ unexpected: true }));
    await assert.rejects(() => googleToUnicode('namaste', { fetchImpl }));
  });

  test('a timeout rejects instead of hanging', async () => {
    const fetchImpl = (url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    await assert.rejects(() => googleToUnicode('namaste', { fetchImpl, timeoutMs: 10 }));
  });

  test('an external abort stops the request', async () => {
    const ctrl = new AbortController();
    const fetchImpl = (url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    const p = googleToUnicode('namaste', { fetchImpl, signal: ctrl.signal });
    ctrl.abort();
    await assert.rejects(() => p);
  });
});

// ---------------------------------------------------------------------------

describe('the circuit breaker keeps a dead endpoint from slowing every keystroke', () => {
  const dead = async () => {
    throw new Error('blocked');
  };

  test('opens after three consecutive failures', async () => {
    assert.equal(isAvailable(), true);
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(() => googleToUnicode(`word${i}`, { fetchImpl: dead }));
    }
    assert.equal(isAvailable(), false, 'should be muted');
  });

  test('while open it rejects immediately without touching the network', async () => {
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(() => googleToUnicode(`word${i}`, { fetchImpl: dead }));
    }
    const log = [];
    const fetchImpl = fakeFetch((t) => oneSegment(t, 'x'), log);
    await assert.rejects(
      () => googleToUnicode('namaste', { fetchImpl }),
      /cooling down/,
    );
    assert.deepEqual(log, [], 'no request while muted');
  });

  test('a success resets the count', async () => {
    const ok = fakeFetch((t) => oneSegment(t, 'ठीक'));
    await assert.rejects(() => googleToUnicode('a1', { fetchImpl: dead }));
    await assert.rejects(() => googleToUnicode('a2', { fetchImpl: dead }));
    await googleToUnicode('a3', { fetchImpl: ok });
    await assert.rejects(() => googleToUnicode('a4', { fetchImpl: dead }));
    await assert.rejects(() => googleToUnicode('a5', { fetchImpl: dead }));
    assert.equal(isAvailable(), true, 'the success should have cleared the streak');
  });

  test('aborts do not count toward the breaker', async () => {
    const aborting = (url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() =>
        googleToUnicode(`word${i}`, { fetchImpl: aborting, timeoutMs: 5 }),
      );
    }
    assert.equal(isAvailable(), true, 'a superseded keystroke is not a failure');
  });
});

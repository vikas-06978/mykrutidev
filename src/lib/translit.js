/**
 * Roman (Hinglish) -> Devanagari transliteration.
 *
 * SEPARATE ENGINE FROM fontMaps.js, on purpose. The font converter is a
 * character mapping between two representations of text that already exists;
 * this is a guess at what Hindi someone meant by an English spelling. One is
 * exact and the other cannot be, so they do not share code and they do not
 * share a page.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LAYER EXISTS AT ALL
 *
 * Sanscript does the hard part — matras, halants, conjunct formation — and does
 * it correctly. What it cannot do is read Hinglish, because ITRANS is a precise
 * notation and Hinglish is not:
 *
 *   ITRANS wants     bhaarata   raaShTriiya   hi.ndii   mai.n
 *   people type      bharat     rashtriya     hindi     main
 *
 * Two things are missing from the way people actually type. Vowel LENGTH: one
 * `a` stands for both अ and आ, one `i` for both इ and ई. And the final SCHWA:
 * Hindi drops it in speech, so `ghar` is घर, but ITRANS reads a bare final
 * consonant as carrying a halant and gives घर्.
 *
 * So this module rewrites Hinglish into ITRANS and hands that to Sanscript.
 * Sanscript stays the only thing that knows how to build Devanagari.
 *
 * ---------------------------------------------------------------------------
 * HOW ACCURATE THIS CAN BE — read before trusting it
 *
 * Not perfectly, and not as a matter of implementation quality. `bharat` is
 * भारत and `karat` is करत; both are consonant-a-consonant-a-consonant, and
 * nothing in the spelling says which `a` is long. Google's input tools resolve
 * this with a language model. Here it is resolved two ways:
 *
 *   1. WORDS  — a dictionary of the common words people actually type, where
 *               the answer is known rather than guessed. Exact, and the reason
 *               `bharat`, `main`, `hindi` and `shiksha` come out right.
 *   2. RULES  — everything else falls through to a syllable rewriter. Sensible,
 *               often right, and sometimes not.
 *
 * A rare word may need respelling (`bhaarat` for भारत) and the UI says so. The
 * ITRANS mode exists for anyone who wants an exact answer instead of a guess.
 */

import Sanscript from '@indic-transliteration/sanscript';

/** The schemes the UI offers. `hinglish` is ours; `itrans` is Sanscript's. */
export const MODES = {
  hinglish: {
    key: 'hinglish',
    label: 'Hinglish',
    hint: 'Type the way you normally would: namaste, bharat, main ghar ja raha hu',
  },
  itrans: {
    key: 'itrans',
    label: 'Exact (ITRANS)',
    hint: 'Precise notation: aa ii uu for long vowels, capital T D N S for retroflex, .n for anusvara',
  },
};

/**
 * The spelling tips printed under the boxes — ROMAN SIDE ONLY.
 *
 * The Devanagari half is deliberately absent. `tipsFor()` produces it by running
 * the engine, so a tip physically cannot claim something the engine does not do.
 *
 * That is the whole point. The page used to carry a hand-written table that said
 * `ri` = ऋ while the engine produced री, and nothing anywhere would ever have
 * noticed. Now the tip IS the engine's answer.
 *
 * The two modes need different tips because they are different notations: a
 * bare consonant in ITRANS carries a halant, so `kh` is ख् there and ख here.
 * Showing one list for both was the second half of the same bug.
 */
export const TIP_KEYS = {
  hinglish: ['kh', 'chh', 'sh', 'aa', 'ee', 'oo', 'ri', 'rri', 'ksh'],
  itrans: ['kha', 'chha', 'sha', 'Sha', 'aa', 'ii', 'uu', 'R^i', 'kSha'],
};

/**
 * @param {'hinglish'|'itrans'} mode
 * @returns {{ roman: string, deva: string }[]}
 */
export function tipsFor(mode) {
  if (!TIP_KEYS[mode]) throw new Error(`No tips for mode: ${mode}`);
  return TIP_KEYS[mode].map((roman) => ({
    roman,
    deva: romanToUnicode(roman, { mode }),
  }));
}

// ---------------------------------------------------------------------------
// The dictionary — where the answer is known instead of guessed
// ---------------------------------------------------------------------------
//
// Hinglish spelling -> ITRANS spelling. Kept as ITRANS rather than Devanagari so
// there is exactly one thing in the system that builds Devanagari, and so an
// entry can be read and corrected by someone who knows the notation.
//
// Entries earn their place by being words whose vowel lengths or nasals the
// rules below get WRONG. A word the rules already handle does not belong here.

/** @type {Record<string, string>} */
const WORDS = {
  // -- pronouns, be-verbs, the words in every sentence ----------------------
  main: 'mai.n', mai: 'mai.n', hum: 'hama', tum: 'tuma', aap: 'aapa',
  tu: 'tuu', vo: 'vo', woh: 'vaha', yeh: 'yaha', ye: 'ye', wo: 'vo',
  mera: 'meraa', meri: 'merii', mere: 'mere', tera: 'teraa', teri: 'terii',
  uska: 'usakaa', uski: 'usakii', unka: 'unakaa', hamara: 'hamaaraa',
  aapka: 'aapakaa', apna: 'apanaa', apni: 'apanii', usne: 'usane',
  is: 'isa', us: 'usa', in: 'ina', un: 'una', jo: 'jo', jis: 'jisa',
  hai: 'hai', hain: 'hai.n', hu: 'huu.N', hoon: 'huu.N', hun: 'huu.N',
  ho: 'ho', tha: 'thaa', thi: 'thii', the: 'the', thee: 'thii',
  hoga: 'hogaa', hogi: 'hogii', honge: 'ho.nge', hota: 'hotaa', hoti: 'hotii',
  raha: 'rahaa', rahi: 'rahii', rahe: 'rahe', rehna: 'rahanaa',
  kar: 'kara', karna: 'karanaa', karta: 'karataa', karti: 'karatii',
  karte: 'karate', kiya: 'kiyaa', kiye: 'kiye', karo: 'karo', karen: 'kare.n',
  gaya: 'gayaa', gayi: 'gayii', gaye: 'gaye', jana: 'jaanaa', ja: 'jaa',
  jata: 'jaataa', jati: 'jaatii', jate: 'jaate', jao: 'jaao',
  aana: 'aanaa', aaya: 'aayaa', aayi: 'aayii', aye: 'aaye', aao: 'aao',
  dena: 'denaa', diya: 'diyaa', lena: 'lenaa', liya: 'liyaa',
  dekh: 'dekha', dekhna: 'dekhanaa', dekha: 'dekhaa', dekhen: 'dekhe.n',

  // -- question words and connectives ---------------------------------------
  kya: 'kyaa', kyu: 'kyo.n', kyun: 'kyo.n', kyon: 'kyo.n',
  kyunki: 'kyo.nki', kyonki: 'kyo.nki', kaise: 'kaise', kaisa: 'kaisaa',
  kaisi: 'kaisii', kab: 'kaba', kahan: 'kahaa.n', kaha: 'kahaa',
  kaun: 'kauna', kitna: 'kitanaa', kitni: 'kitanii', kitne: 'kitane',
  aur: 'aura', ya: 'yaa', lekin: 'lekina', par: 'para', magar: 'magara',
  agar: 'agara', to: 'to', toh: 'to', bhi: 'bhii', hi: 'hii',
  se: 'se', me: 'me.n', mein: 'me.n', ko: 'ko', ka: 'kaa', ki: 'kii',
  ke: 'ke', ne: 'ne', tak: 'taka', liye: 'liye', sath: 'saatha',
  bina: 'binaa', jab: 'jaba', tab: 'taba', phir: 'phira', fir: 'phira',
  nahi: 'nahii.n', nahin: 'nahii.n', na: 'naa', mat: 'mata',
  haan: 'haa.N', han: 'haa.N', ji: 'jii', sab: 'saba', kuch: 'kuchha',
  koi: 'koii', abhi: 'abhii', ab: 'aba', aaj: 'aaja', kal: 'kala',
  yahan: 'yahaa.N', wahan: 'vahaa.N', vahan: 'vahaa.N',

  // -- everyday nouns --------------------------------------------------------
  ghar: 'ghara', naam: 'naama', nam: 'naama', kaam: 'kaama', kam: 'kaama',
  baat: 'baata', bat: 'baata', din: 'dina', raat: 'raata', saal: 'saala',
  samay: 'samaya', waqt: 'vaqta', log: 'loga', aadmi: 'aadamii',
  aurat: 'aurata', bachcha: 'bachchaa', bachche: 'bachche',
  // The nukta letters ड़ and ढ़ are `.D` and `.Dh` in ITRANS. People type them as
  // a plain `d`, so every one of these has to be listed or the word comes out
  // with ड where ड़ belongs — लडका instead of लड़का.
  ladka: 'la.Dakaa', ladki: 'la.Dakii', dost: 'dosta', pyar: 'pyaara',
  dil: 'dila', haath: 'haatha', paani: 'paanii', pani: 'paanii',
  khana: 'khaanaa', roti: 'roTii', chai: 'chaaya', doodh: 'duudha',
  sadak: 'sa.Daka', gaadi: 'gaa.Dii', gadi: 'gaa.Dii', train: 'Trena',
  bada: 'ba.Daa', bade: 'ba.De', badi: 'ba.Dii', bura: 'buraa',
  ped: 'pe.Da', kapda: 'kap.Daa', pahad: 'pahaa.Da', jhanda: 'jha.N.Daa',
  shahar: 'shahara', gaon: 'gaa.Nva', desh: 'desha', duniya: 'duniyaa',
  subah: 'subaha', shaam: 'shaama', raste: 'raaste', rasta: 'raastaa',
  kitab: 'kitaaba', suraj: 'suuraja', sooraj: 'suuraja', chand: 'chaa.Nda',
  ram: 'raama', sita: 'siitaa', krishna: 'kR^iShNa', mandir: 'ma.ndira',
  zindagi: 'zi.ndagii', khushi: 'khushii', dukh: 'duHkha',
  // ऋ words. `ri` gives री by design, so the handful of everyday words that
  // really do start with the vocalic r have to be named.
  rishi: 'R^iShi', ritu: 'R^itu', rin: 'R^iNa', rishabh: 'R^iShabha',
  chandni: 'chaa.Ndanii', jungle: 'ja.ngala', jangal: 'ja.ngala',
  tayyar: 'taiyaara', taiyar: 'taiyaara', bachcha: 'bachchaa',
  baccha: 'bachchaa', bacche: 'bachche',

  // -- Hindi, India, the words this site is about ---------------------------
  bharat: 'bhaarata', bharatiya: 'bhaaratiiya', hindi: 'hi.ndii',
  hindustan: 'hi.ndustaana', rashtra: 'raaShTra', rashtriya: 'raaShTriiya',
  bhasha: 'bhaaShaa', raj: 'raaja', rajya: 'raajya', sarkar: 'sarakaara',
  sarkari: 'sarakaarii', pradesh: 'pradesha', zila: 'zilaa', jila: 'jilaa',
  namaste: 'namaste', namaskar: 'namaskaara', dhanyavad: 'dhanyavaada',
  dhanyavaad: 'dhanyavaada', shukriya: 'shukriyaa', swagat: 'svaagata',

  // -- office and government vocabulary --------------------------------------
  karyalay: 'kaaryaalaya', vibhag: 'vibhaaga', adhikari: 'adhikaarii',
  karmchari: 'karmachaarii', niyam: 'niyama', kanoon: 'kaanuuna',
  adalat: 'adaalata', nyayalay: 'nyaayaalaya', pramanpatra: 'pramaaNapatra',
  aavedan: 'aavedana', avedan: 'aavedana', suchna: 'suuchanaa',
  soochna: 'suuchanaa', vigyapti: 'vij~napti', aadesh: 'aadesha',
  adesh: 'aadesha', patra: 'patra', prapatra: 'prapatra',
  dinank: 'dinaa.nka', dinaank: 'dinaa.nka', hastakshar: 'hastaakShara',
  pariksha: 'pariikShaa', parinaam: 'pariNaama', parinam: 'pariNaama',
  shiksha: 'shikShaa', vidyalay: 'vidyaalaya', vidyarthi: 'vidyaarthii',
  mahavidyalay: 'mahaavidyaalaya', shikshak: 'shikShaka', chhatra: 'chhaatra',
  pustak: 'pustaka', prashn: 'prashna', prashna: 'prashna', uttar: 'uttara',
  vishay: 'viShaya', suchi: 'suuchii', soochi: 'suuchii',
  kripya: 'kR^ipayaa', kripaya: 'kR^ipayaa',
  pradhanmantri: 'pradhaanama.ntrii', mantri: 'ma.ntrii',
  vidhan: 'vidhaana', sansad: 'sa.nsada', chunav: 'chunaava',
  janta: 'janataa', samiti: 'samiti', ayog: 'aayoga',
  vikas: 'vikaasa', yojna: 'yojanaa', yojana: 'yojanaa',
  samman: 'sammaana', sanskriti: 'sa.nskR^iti', sanskrit: 'sa.nskR^ita',
  swatantrata: 'svata.ntrataa', ekta: 'ekataa', shanti: 'shaa.nti',
  satya: 'satya', dharm: 'dharma', karm: 'karma', gyan: 'j~naana',
  vigyan: 'vij~naana', itihas: 'itihaasa', bhugol: 'bhuugola',
  ganit: 'gaNita', sangeet: 'sa.ngiita', kavita: 'kavitaa', ganga: 'ga.ngaa',
  lekhak: 'lekhaka', patrakar: 'patrakaara', samachar: 'samaachaara',
  akhbar: 'akhabaara',

  // -- numbers ---------------------------------------------------------------
  ek: 'eka', do: 'do', teen: 'tiina', tin: 'tiina', char: 'chaara',
  panch: 'paa.Ncha', chhe: 'chha', chah: 'chha', saat: 'saata',
  aath: 'aaTha', nau: 'nau', das: 'dasa', sau: 'sau', hazar: 'hazaara',
  lakh: 'laakha', karod: 'karo.Da', crore: 'karo.Da', pehla: 'pahalaa',
  dusra: 'duusaraa', teesra: 'tiisaraa',

  // -- common adjectives and adverbs ----------------------------------------
  accha: 'achchhaa', acha: 'achchhaa', achha: 'achchhaa',
  chhota: 'chhoTaa', chota: 'chhoTaa',
  naya: 'nayaa', nai: 'naii', purana: 'puraanaa', theek: 'Thiika',
  thik: 'Thiika', sahi: 'sahii', galat: 'galata', bahut: 'bahuta',
  thoda: 'tho.Daa', zyada: 'zyaadaa', jyada: 'zyaadaa',
  jaldi: 'jaldii', dhire: 'dhiire', aage: 'aage', peeche: 'piichhe',
  upar: 'uupara', niche: 'niiche', andar: 'a.ndara', bahar: 'baahara',
  pass: 'paasa', paas: 'paasa', door: 'duura', dur: 'duura',
  sundar: 'su.ndara', mushkil: 'mushkila', aasan: 'aasaana',
  zaroori: 'zaruurii', jaruri: 'zaruurii', mehnat: 'mehanata',
};

// ---------------------------------------------------------------------------
// The rules — for everything the dictionary does not know
// ---------------------------------------------------------------------------

/**
 * Hinglish spelling fragments -> ITRANS, longest first.
 *
 * Order in this array IS the matching order, so every multi-letter sequence has
 * to come before its own first letter or it can never match: `chh` before `ch`
 * before `c`, `aa` before `a`. This is the same longest-match-first requirement
 * the font engine has, for the same reason.
 */
const FRAGMENTS = [
  // -- aspirated and compound consonants, longest first --------------------
  ['chh', 'chh'], ['shh', 'Sh'], ['ksh', 'kSh'], ['gya', 'j~na'],
  ['tra', 'tra'], ['shr', 'shr'],
  // `cc` is how people write the doubled च in बच्चा. Without this the `c` at the
  // end of the table catches the first one as क and the word comes out बक्चा.
  ['cch', 'chch'], ['cc', 'chch'],
  // The vocalic ऋ. It cannot live on `ri`, because `ri` in Hinglish is री far
  // more often than it is ऋ — रिश्ता, रिपोर्ट, तारीख. So `ri` keeps the common
  // reading and the doubled `rri` is the way to ask for ऋ, which matches how
  // ITRANS spells it (`RRi`) and survives this mode's lowercasing.
  ['rri', 'R^i'],
  ['ch', 'ch'], ['sh', 'sh'], ['kh', 'kh'], ['gh', 'gh'], ['jh', 'jh'],
  ['th', 'th'], ['dh', 'dh'], ['ph', 'ph'], ['bh', 'bh'], ['rh', 'rha'],
  ['ng', '.ng'], ['ny', 'ny'],
  // -- vowels, long before short -------------------------------------------
  ['aa', 'aa'], ['ai', 'ai'], ['au', 'au'], ['ee', 'ii'], ['ii', 'ii'],
  ['oo', 'uu'], ['uu', 'uu'], ['ou', 'au'], ['ei', 'ai'],
  ['a', 'a'], ['i', 'i'], ['u', 'u'], ['e', 'e'], ['o', 'o'],
  // -- plain consonants ------------------------------------------------------
  ['k', 'k'], ['g', 'g'], ['j', 'j'], ['t', 't'], ['d', 'd'], ['n', 'n'],
  ['p', 'p'], ['b', 'b'], ['m', 'm'], ['y', 'y'], ['r', 'r'], ['l', 'l'],
  ['v', 'v'], ['w', 'v'], ['s', 's'], ['h', 'h'], ['f', 'ph'], ['z', 'z'],
  ['x', 'kS'], ['q', 'q'], ['c', 'k'],
];

const VOWEL_LETTERS = 'aeiou';
const isVowelStart = (s) => VOWEL_LETTERS.includes(s[0]);

/** ITRANS consonant letters, for the anusvara and schwa passes. */
const ITRANS_CONSONANT = /[kgcjTDtdnpbmyrlvshSNq]/;

/**
 * Rewrite one Hinglish word as ITRANS.
 *
 * Four fixes, in order, each undoing one thing Hinglish leaves out:
 *   1. a final `i`/`u` is almost always the long vowel  (dilli -> dillii)
 *   2. a written final `a` is almost always आ            (ganga -> gangaa)
 *   3. `n` or `m` before a consonant is an anusvara     (hindii -> hi.ndii)
 *   4. a final consonant carries its inherent vowel     (ghar -> ghara)
 *
 * Rule 2 is the one that looks risky and is not. Nobody writes the schwa they
 * do not pronounce — घर is typed `ghar`, never `ghara` — so a final `a` that
 * someone actually typed is there because they heard one, and a heard final
 * vowel in Hindi is आ. Rules 2 and 4 are therefore the same fact from both
 * sides, which is why they cannot both fire on one word.
 */
function ruleRewrite(word) {
  let w = word;

  // 1. Long final vowel. `dilli` is दिल्ली, not दिल्लि.
  //    `rri` is exempt: it is the vocalic ऋ spelled as one unit, not a
  //    consonant followed by a vowel, so lengthening it would produce ऋि.
  if (/rri$/.test(w)) {
    // leave it for the fragment pass
  } else if (/[^aeiou]i$/.test(w)) w = w.slice(0, -1) + 'ii';
  else if (/[^aeiou]u$/.test(w)) w = w.slice(0, -1) + 'uu';
  // 2. Long final `a`, but not on a bare vowel like `a` or `aa` itself.
  else if (/[^aeiou]a$/.test(w)) w = w.slice(0, -1) + 'aa';

  // Fragment pass.
  let out = '';
  let i = 0;
  outer: while (i < w.length) {
    for (const [from, to] of FRAGMENTS) {
      if (w.startsWith(from, i)) {
        out += to;
        i += from.length;
        continue outer;
      }
    }
    out += w[i]; // unknown letter: let Sanscript decide
    i += 1;
  }

  // 3. Nasal before a consonant becomes an anusvara, which is how modern Hindi
  //    spells it: हिंदी rather than हिन्दी. Both are correct; this one is what
  //    people expect to see.
  out = out.replace(/([aeiou])[nm](?=[kgcjTDtdpbmyrlvshSNq])/g, '$1.n');

  // 4. Suppress the halant ITRANS would otherwise put on a final consonant.
  //    Hindi writes घर, not घर्.
  if (ITRANS_CONSONANT.test(out.slice(-1)) && !/\.n$|\.N$/.test(out)) {
    out += 'a';
  }

  return out;
}

/** One Hinglish word -> ITRANS. Dictionary first, rules second. */
export function toItrans(word) {
  const key = word.toLowerCase();
  return WORDS[key] ?? ruleRewrite(key);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Latin runs are the only thing we touch. Digits, punctuation, whitespace and
// anything already in Devanagari pass through exactly as typed — same rule the
// font converter follows, so a pasted phone number or date survives.
const LATIN_RUN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

// ITRANS mode needs a wider token. Its notation spends ASCII punctuation on
// meaning — `.n` is the anusvara, `.N` the chandrabindu, `~n` and `~N` the
// nasals, `R^i` the vocalic r, `.D` the nukta forms. Tokenising on letters
// alone splits `hi.ndii` into `hi` and `ndii` and drops the anusvara on the
// floor, which is exactly the bug the exact mode exists to avoid.
const ITRANS_RUN = /[A-Za-z][A-Za-z.~^]*/g;

// Never transliterate these, in either mode: they are structure, not words.
const PROTECTED = new RegExp(
  [
    '(?:[Hh][Tt][Tt][Pp][Ss]?://|[Ww][Ww][Ww]\\.)[^\\s<>"\']+', // URLs
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', // emails
  ].join('|'),
  'g',
);

/**
 * Precomposed nukta letter -> consonant + combining nukta.
 *
 * Sanscript emits ड़ as the single codepoint U+095C. The font engine in
 * fontMaps.js builds it as ड followed by the combining nukta U+093C, because
 * that is what the Kruti Dev key `M+` actually is — a consonant and a mark.
 *
 * The two look identical and are not equal. Left alone, a word typed on the
 * transliteration page would not match the same word from the converter in a
 * search, a database key or a spell-check, and round-tripping it through Kruti
 * Dev would silently rewrite the bytes. Unicode also discourages these
 * precomposed forms, so the combining pair is the right target for both.
 *
 * NFD would do this, but it would also split ो into ा + े, which is a change
 * nobody asked for. So the substitution is explicit and covers only the nukta
 * block.
 */
const NUKTA_FORMS = new Map([
  ['ऩ', 'ऩ'], ['ऱ', 'ऱ'], ['ऴ', 'ऴ'],
  ['क़', 'क़'], ['ख़', 'ख़'], ['ग़', 'ग़'],
  ['ज़', 'ज़'], ['ड़', 'ड़'], ['ढ़', 'ढ़'],
  ['फ़', 'फ़'], ['य़', 'य़'],
]);

const decomposeNukta = (s) =>
  s.replace(/[ऩऱऴक़-य़]/g, (c) => NUKTA_FORMS.get(c));

function splitProtected(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    if (m.index > last) parts.push({ skip: false, v: text.slice(last, m.index) });
    parts.push({ skip: true, v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ skip: false, v: text.slice(last) });
  return parts;
}

/**
 * Roman -> Devanagari.
 *
 * @param {string} text
 * @param {{ mode?: 'hinglish' | 'itrans' }} [opts]
 * @returns {string}
 */
export function romanToUnicode(text, { mode = 'hinglish' } = {}) {
  if (!text) return '';
  if (!MODES[mode]) throw new Error(`Unknown transliteration mode: ${mode}`);

  const render = (itrans) =>
    decomposeNukta(Sanscript.t(itrans, 'itrans', 'devanagari'));

  return splitProtected(text)
    .map(({ skip, v }) => {
      if (skip) return v;
      if (mode === 'itrans') {
        // Hand the run straight to Sanscript, which owns ITRANS. Word by word so
        // that spacing and punctuation between words are preserved untouched.
        return v.replace(ITRANS_RUN, (w) => {
          // A trailing `.` is a full stop, not the start of `.n`. Give it back.
          const m = /[.~^]+$/.exec(w);
          const tail = m ? m[0] : '';
          const core = tail ? w.slice(0, -tail.length) : w;
          return render(core) + tail;
        });
      }
      return v.replace(LATIN_RUN, (w) => render(toItrans(w)));
    })
    .join('');
}

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
 * Sanscript does the hard part - matras, halants, conjunct formation - and does
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
 * HOW ACCURATE THIS CAN BE - read before trusting it
 *
 * Not perfectly, and not as a matter of implementation quality. `bharat` is
 * भारत and `karat` is करत; both are consonant-a-consonant-a-consonant, and
 * nothing in the spelling says which `a` is long. Google's input tools resolve
 * this with a language model. Here it is resolved two ways:
 *
 *   1. WORDS  - a dictionary of the common words people actually type, where
 *               the answer is known rather than guessed. Exact, and the reason
 *               `bharat`, `main`, `hindi` and `shiksha` come out right.
 *   2. RULES  - everything else falls through to a syllable rewriter. Sensible,
 *               often right, and sometimes not.
 *
 * A rare word may need respelling (`bhaarat` for भारत) and the UI says so. The
 * ITRANS mode exists for anyone who wants an exact answer instead of a guess.
 */

import Sanscript from '@indic-transliteration/sanscript';
import { splitProtected, decomposeNukta } from './deva.js';
import { applyCommonWords } from './corrections.js';

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
 * The spelling tips printed under the boxes - ROMAN SIDE ONLY.
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
// The dictionary - where the answer is known instead of guessed
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
  // with ड where ड़ belongs - लडका instead of लड़का.
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
  tayyar: 'taiyaara', taiyar: 'taiyaara',
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

  // -- ड़ and ढ़, the nukta letters the rules can never reach -----------------
  // `.D` and `.Dh` in ITRANS. People type them as a plain `d`, so each one has
  // to be listed or बढ़िया comes out बधिया - which is the single most-reported
  // wrong word on this page.
  badhiya: 'ba.Dhiyaa', badiya: 'ba.Dhiyaa',
  kadi: 'ka.Dii', ghadi: 'gha.Dii', khidki: 'khi.Dakii',
  jod: 'jo.Da', tod: 'to.Da', chhod: 'chho.Da', mod: 'mo.Da',
  daadhi: 'daa.Dhii', dadhi: 'daa.Dhii',
  chadhna: 'cha.Dhanaa', padhna: 'pa.Dhanaa', badhna: 'ba.Dhanaa',
  padhai: 'pa.Dhaaii', kooda: 'kuu.Daa', kuda: 'kuu.Daa',
  daud: 'dau.Da', pahadi: 'pahaa.Dii', kapde: 'kapa.De',

  // -- ज़ and फ़ ---------------------------------------------------------------
  bazaar: 'baazaara', bazar: 'baazaara',
  darwaza: 'daravaazaa', darvaza: 'daravaazaa',
  kagaz: 'kaagaza', kaagaz: 'kaagaza', tez: 'teza',
  cheez: 'chiiza', chiz: 'chiiza', awaz: 'aavaaza', aawaz: 'aavaaza',
  namaz: 'namaaza', mez: 'meza', pyaz: 'pyaaza',
  saaf: 'saafa', saf: 'saafa', sirf: 'sirfa',
  fone: 'fona', phone: 'fona', maafi: 'maafii', mafi: 'maafii',

  // -- retroflex ट ठ ड, which the rules give as dental त थ द -----------------
  // The other half of the same problem: `t` is त far more often than it is ट,
  // so the rules are right to guess त and wrong on every one of these.
  gitaar: 'giTaara', guitar: 'giTaara', gitar: 'giTaara',
  tamatar: 'TamaaTara', tikat: 'TikaTa', ticket: 'TikaTa',
  computer: 'ka.mpyuuTara', motor: 'moTara', hotel: 'hoTala',
  station: 'sTeshana', internet: 'i.nTaraneTa', mobile: 'mobaaila',
  pet: 'peTa', thand: 'Tha.nDa', thanda: 'Tha.nDaa',
  peeth: 'piiTha', pith: 'piiTha', mitha: 'miiThaa', mithai: 'miThaaii',
  katna: 'kaaTanaa', mota: 'moTaa', beta: 'beTaa', beti: 'beTii',
  aspatal: 'aspataala', police: 'pulisa',

  // -- family and body -------------------------------------------------------
  maa: 'maa.n', pitaji: 'pitaajii', bhai: 'bhaaii', behen: 'bahana',
  dada: 'daadaa', dadi: 'daadii', nana: 'naanaa', nani: 'naanii',
  chacha: 'chaachaa', mama: 'maamaa', parivar: 'parivaara',
  ankh: 'aa.nkha', muh: 'mu.nha', dant: 'daa.nta',

  // -- everyday verbs, where the schwa rule needs help -----------------------
  pina: 'piinaa', uthna: 'uThanaa', baithna: 'baiThanaa',
  chalna: 'chalanaa', bolna: 'bolanaa', sunna: 'sunanaa',
  samajhna: 'samajhanaa', sikhna: 'siikhanaa', likhna: 'likhanaa',
  banana: 'banaanaa', lana: 'laanaa', bhejna: 'bhejanaa',
  milna: 'milanaa', kharidna: 'khariidanaa', bechna: 'bechanaa',
  puchhna: 'puuchhanaa', rakhna: 'rakhanaa', lagna: 'laganaa',

  // -- food, things, adjectives ---------------------------------------------
  chawal: 'chaavala', chaval: 'chaavala', aloo: 'aaluu', alu: 'aaluu',
  chini: 'chiinii', kamra: 'kamaraa', samudra: 'samudra',
  garam: 'garma', naram: 'narma', bhari: 'bhaarii', patla: 'patalaa',
  khali: 'khaalii', pura: 'puuraa',

  // -- days, months and the calendar words a form asks for -------------------
  somvar: 'somavaara', mangalvar: 'ma.ngalavaara', budhvar: 'budhavaara',
  guruvar: 'guruvaara', shukravar: 'shukravaara', shanivar: 'shanivaara',
  ravivar: 'ravivaara', janvari: 'janavarii', farvari: 'faravarii',
  march: 'maarcha', april: 'apraila', mahina: 'mahiinaa',
  hafta: 'haftaa', parso: 'paraso.n',

  // -- greetings and occasions ----------------------------------------------
  badhai: 'badhaaii', mehman: 'mehamaana', tyohar: 'tyohaara',
  janmdin: 'janmadina',

  // -- futures whose STEM the rules cannot spell -----------------------------
  // futureTense() fixes the ENDING for every verb, so almost nothing needs
  // listing here. These are the ones whose stem carries a nukta, a retroflex
  // or a swallowed schwa - the same reason their infinitives are listed.
  padhunga: 'pa.Dhuu.ngaa', padhungi: 'pa.Dhuu.ngii', padhunge: 'pa.Dhuu.nge',
  chadhunga: 'cha.Dhuu.ngaa', badhunga: 'ba.Dhuu.ngaa',
  baithunga: 'baiThuu.ngaa', baithungi: 'baiThuu.ngii',
  uthunga: 'uThuu.ngaa', uthungi: 'uThuu.ngii',
  samjhunga: 'samajhuu.ngaa', samjhungi: 'samajhuu.ngii',
  pahunchunga: 'pahu.nchuu.ngaa', kaatunga: 'kaaTuu.ngaa',
  katunga: 'kaaTuu.ngaa', lautunga: 'lauTuu.ngaa',
  dhoondhunga: 'Dhuu.nDhuu.ngaa', dhundhunga: 'Dhuu.nDhuu.ngaa',

  // -- the subjunctive -ऊं / -ूं ---------------------------------------------
  // This half of the ending stays a list on purpose. A `-un` rule to match the
  // `-unga` one would have to rewrite कौन, मौन and सौंफ, which are already
  // right - see the note on futureTense() about where that rule stops.
  jaun: 'jaauu.n', jaaun: 'jaauu.n', aaun: 'aauu.n',
  khaun: 'khaauu.n', khaaun: 'khaauu.n', paun: 'paauu.n', paaun: 'paauu.n',
  karun: 'karuu.n', dekhun: 'dekhuu.n', bolun: 'boluu.n',
  sunun: 'sunuu.n', lun: 'luu.n', dun: 'duu.n',
  aaao: 'aao',

  // -- more everyday verbs ---------------------------------------------------
  chhodna: 'chho.Danaa', pakadna: 'paka.Danaa', daudna: 'dau.Danaa',
  jodna: 'jo.Danaa', todna: 'to.Danaa', todfod: 'to.Dapho.Da',
  ghumna: 'ghuumanaa', dhundhna: 'Dhuu.nDhanaa', lautna: 'lauTanaa',
  pahunchna: 'pahu.nchanaa', nikalna: 'nikalanaa', rukna: 'rukanaa',
  girna: 'giranaa', hansna: 'ha.nsanaa', sochna: 'sochanaa',
  batana: 'bataanaa', dikhana: 'dikhaanaa', sunana: 'sunaanaa',
  sikhana: 'sikhaanaa', utarna: 'utaranaa', jagna: 'jaaganaa',
  bhagna: 'bhaaganaa', nachna: 'naachanaa', gana: 'gaanaa',
  mangna: 'maa.nganaa', bhoolna: 'bhuulanaa', bhulna: 'bhuulanaa',
  jeetna: 'jiitanaa', jitna: 'jiitanaa', harna: 'haaranaa',

  // -- more everyday words ---------------------------------------------------
  wapas: 'vaapasa', vapas: 'vaapasa', zarurat: 'zaruurata',
  jarurat: 'zaruurata', taiyari: 'taiyaarii', imtihan: 'imtihaana',
  naukri: 'naukarii', chutti: 'chhuTTii', tabiyat: 'tabiiyata',
  shayad: 'shaayada', dobara: 'dobaaraa', pehle: 'pahale', pahle: 'pahale',
};

// ---------------------------------------------------------------------------
// The rules - for everything the dictionary does not know
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
  // more often than it is ऋ - रिश्ता, रिपोर्ट, तारीख. So `ri` keeps the common
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

/** The longer form of each ending vowel: -गा -गी -गे. */
const FUTURE_TAIL = { a: 'aa', i: 'ii', e: 'e' };

/**
 * A verb stem, converted the ordinary way, so `banaunga` keeps its `ban` and
 * `likhunga` keeps its `likh`.
 */
function fragments(w) {
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
  return out;
}

/**
 * The first-person future: करूंगा, जाऊंगा, खाऊंगी, बोलूंगे.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS NEEDS ITS OWN RULE RATHER THAN DICTIONARY ENTRIES
 *
 * Both halves of this ending are wrong without it, and both for the same
 * reason - the vowel is LONG and Hinglish does not write it:
 *
 *   khaunga   the rules read `au` as औ and give खौंगा, not खाऊंगा
 *   karunga   the rules read `u` as उ and give करुंगा, not करूंगा
 *
 * It is also open-ended. Hindi forms this on any verb at all - बनाऊंगा,
 * सुनाऊंगा, दिखाऊंगा, समझूंगा, पहुंचूंगा - so a dictionary would be listing a
 * suffix one verb at a time and would still miss the next one somebody typed.
 * A rule catches every verb, including the ones nobody thought of.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SAFE, WHICH IS ENTIRELY ABOUT WHERE IT STOPS
 *
 * The obvious wider rule - treat any final `-aun` as आऊं - is wrong, and the
 * counterexamples are common words: मौन, सौंफ, कौन, चौंक all end in `-aun` and
 * are already correct. So this matches ONLY `-unga`, `-ungi` and `-unge`, an
 * ending that in Hindi is the future tense and nothing else. None of those
 * words come near it.
 *
 * The `a`/`aa` before it is what separates a vowel stem from a consonant one:
 * जा + ऊंगा against कर + ूंगा. Both end up with the same long ऊ, which is the
 * bug, but they get there from different stems.
 *
 * A word in WORDS never reaches this, so any verb whose stem needs a nukta or
 * a retroflex - पढ़ूंगा, बैठूंगा - is still listed there and still wins.
 * ---------------------------------------------------------------------------
 *
 * @param {string} w lowercased Hinglish
 * @returns {string|null} ITRANS, or null if this is not a future form
 */
function futureTense(w) {
  // Vowel stem: jaa + uu.ngaa. `oo` because people write जाऊंगा as `jaoonga`
  // about as often as `jaunga`.
  //
  // The stem is LAZY so that `a{1,2}` gets first refusal on the vowels in
  // front of it. A greedy stem eats the first `a` of `khaaunga`, leaving one
  // for the ending, and the spare `a` comes out as a separate आ.
  let m = /^(.*?)a{1,2}(?:u|oo)ng([aei])$/.exec(w);
  if (m) return fragments(m[1]) + 'aauu.ng' + FUTURE_TAIL[m[2]];

  // Consonant stem: kar + uu.ngaa.
  m = /^(.+?)(?:u|oo)ng([aei])$/.exec(w);
  if (m) return fragments(m[1]) + 'uu.ng' + FUTURE_TAIL[m[2]];

  return null;
}

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
 * do not pronounce - घर is typed `ghar`, never `ghara` - so a final `a` that
 * someone actually typed is there because they heard one, and a heard final
 * vowel in Hindi is आ. Rules 2 and 4 are therefore the same fact from both
 * sides, which is why they cannot both fire on one word.
 */
function ruleRewrite(word) {
  let w = word;

  // 0. The future tense, which rule 1 cannot reach - see futureTense().
  const future = futureTense(w);
  if (future !== null) return future;

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
  let out = fragments(w);

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

/**
 * Every Hinglish word the dictionary knows. The typing page treats these as
 * Hindi even when they are also English words (`mere`, `log`, `jana`) - see
 * englishWords.js.
 */
export const DICTIONARY_WORDS = Object.freeze(Object.keys(WORDS));

/** One Hinglish word -> ITRANS. Dictionary first, rules second. */
export function toItrans(word) {
  const key = word.toLowerCase();
  return WORDS[key] ?? ruleRewrite(key);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Latin runs are the only thing we touch. Digits, punctuation, whitespace and
// anything already in Devanagari pass through exactly as typed - same rule the
// font converter follows, so a pasted phone number or date survives.
const LATIN_RUN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

// ITRANS mode needs a wider token. Its notation spends ASCII punctuation on
// meaning - `.n` is the anusvara, `.N` the chandrabindu, `~n` and `~N` the
// nasals, `R^i` the vocalic r, `.D` the nukta forms. Tokenising on letters
// alone splits `hi.ndii` into `hi` and `ndii` and drops the anusvara on the
// floor, which is exactly the bug the exact mode exists to avoid.
//
// But it spends them ONLY in those sequences, so the run absorbs `.`, `~` and
// `^` only where the letter behind actually makes one - which is what the
// lookaheads say, read straight off Sanscript's own itrans scheme. Swallowing
// them unconditionally cost a full stop and the letter after it every time one
// landed between two letters, with no space to save it:
//
//   kya.hai   ->  क्याइ    the `.` AND the `h` gone
//   kya~hai   ->  क्यऽहै   the `~` became an avagraha
//   x.y.z     ->  क्ष्।य्।ज़्  a full stop became a danda
//
// A trailing `.`/`~`/`^` needed giving back by hand before, because the old
// token could end in one. This one cannot: every branch below requires a
// letter after the mark, and that letter is consumed on the next turn.
const ITRANS_RUN = /[A-Za-z](?:[A-Za-z]|\.(?=[DNacmn])|~(?=[Nn])|\^(?=[iI]))*/g;

// URLs, emails and the nukta spelling live in deva.js, because the Google
// engine in googleTranslit.js has to make exactly the same two decisions and
// there must not be two answers to either. See the note at the top of that file.
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

  const out = splitProtected(text)
    .map(({ skip, v }) => {
      if (skip) return v;
      if (mode === 'itrans') {
        // Hand the run straight to Sanscript, which owns ITRANS. Word by word so
        // that spacing and punctuation between words are preserved untouched.
        // A full stop, a tilde or a caret that is not part of a sequence never
        // enters the run in the first place - see ITRANS_RUN - so there is
        // nothing left to hand back here.
        return v.replace(ITRANS_RUN, render);
      }
      return v.replace(LATIN_RUN, (w) => render(toItrans(w)));
    })
    .join('');

  // The nasal words, over the top - the same table googleTranslit.js applies to
  // its own answer, so `waha` is वहाँ whether or not the network was up.
  //
  // NOT in itrans mode. That mode's entire promise is that nothing is inferred:
  // `main` is मैन there because that is what the notation says, and a table
  // that quietly made it मैं would be the one change that breaks it.
  return mode === 'hinglish' ? applyCommonWords(text, out) : out;
}

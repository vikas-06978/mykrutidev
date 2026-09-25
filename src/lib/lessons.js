/**
 * The lesson ladder.
 *
 * ---------------------------------------------------------------------------
 * HOW A LEVEL IS DEFINED, AND WHY IT IS THIS WAY ROUND
 *
 * A level owns a set of KEYS and a list of drills written in HINDI. The keys
 * are the lesson - "the home row", "the top row" - and the drills are what you
 * type to learn them.
 *
 * The obvious way to build this is to write the drills as keystrokes, since
 * that is what is being taught, and convert them for display. That way round
 * is wrong: it guarantees the keys are legal and guarantees nothing about the
 * Hindi, so a drill can read as gibberish and no test can tell. The words are
 * the thing a human has to judge, so the words are what is written here.
 *
 * lessons.test.js then does what a human cannot do reliably: converts every
 * drill and fails if it needs a key the level has not taught yet, naming the
 * level, the drill and the offending key. Both halves are checked, and each by
 * whichever of us is better at it.
 * ---------------------------------------------------------------------------
 *
 * ADDING OR EDITING A DRILL
 *
 * Write real Hindi. Then run `npm test`. If a word reaches past the level, the
 * test says so and you swap the word - do not widen `keys` to fit a word in,
 * because `keys` is what the level means.
 */

/**
 * The rows, defined PHYSICALLY - every cap on that row of the keyboard, not
 * just the ones a drill happens to use.
 *
 * So the home row carries `'` and the top row carries `[ ] \`, even though
 * they are little-finger stretches rather than resting keys. They are on those
 * rows, and a level called "the home row" that excluded one of its keys would
 * be a level about something else. `focus` names what is actually being
 * drilled; `keys` is the boundary.
 *
 * This matters more than it looks: `'` types श् and `[` types ख्, so श and ख -
 * two letters no Hindi drill can avoid for long - live on those stretches.
 */
const HOME = "asdfghjkl;' ";
const TOP = 'qwertyuiop[]\\';
const BOTTOM = 'zxcvbnm,./';
const DIGITS = '`1234567890-=';
const SHIFTED = 'QWERTYUIOPASDFGHJKL:"ZXCVBNM<>?{}|+%_~!@#$^&*()';

/** Levels are cumulative: nothing you have learned is taken away. */
const upto = (...sets) => sets.join('');

/**
 * @typedef {object} Level
 * @property {string} id
 * @property {string} name      two or three words, for the picker chip
 * @property {string} title     the full heading, with the level number
 * @property {string} focus     what is new, for the sub-heading
 * @property {string} keys      every character a drill may need
 * @property {string[]} drills  Hindi, joined with a space to make the target
 * @property {number} threshold accuracy needed to unlock the next level
 */

/** @type {Level[]} */
export const LEVELS = [
  {
    id: 'home',
    name: 'Home row',
    title: 'Level 1 - Home row',
    focus: 'a s d f g h j k l ;',
    keys: HOME,
    // क ह र स य, with the four matras that live on the home row. Everything
    // here is typed without moving a finger off its resting key.
    drills: [
      'क क क स स स र र र ह ह ह य य य',
      'का की के कि सा सी से सि',
      'रा री रे हा ही हे या यी ये',
      'कर सर रस यह कह हर सह रह',
      'हीरा सारा किसी कहार सरकार',
      'यहां साहस सहारा सीसा रास',
    ],
    threshold: 90,
  },
  {
    id: 'top',
    name: 'Top row',
    title: 'Level 2 - Top row',
    focus: 'q w e r t y u i o p',
    keys: upto(HOME, TOP),
    // म त ज ल न प व च, and the two u-matras.
    drills: [
      'म म म त त त ज ज ज ल ल ल न न न',
      'प प प व व व च च च',
      'मा ता जा ला ना पा वा चा',
      'नाम काम जल पल वन तन मन चल',
      'समय नमक जीवन कमल पानी माता',
      'तुम सुर पुल मूल जून चालू',
      'नीति जाति नहीं जीत जीवन',
    ],
    threshold: 90,
  },
  {
    id: 'bottom',
    name: 'Bottom row',
    title: 'Level 3 - Bottom row',
    focus: 'z x c v b n m , . /',
    keys: upto(HOME, TOP, BOTTOM),
    // ग ब द, and the independent vowels अ इ उ ए.
    drills: [
      'ग ग ग ब ब ब द द द',
      'अ अ अ इ इ इ उ उ उ ए ए ए',
      'गा बा दा गी बी दी गु बु दु',
      'अब इस उस एक अगर इधर उधर',
      'बाग दाम गाना बादल उदार दादा',
      'आग आम आप इमली उजाला एकता',
    ],
    threshold: 90,
  },
  {
    id: 'numbers',
    name: 'Number row',
    title: 'Level 4 - Number row',
    focus: '1 2 3 4 5 6 7 8 9 0',
    keys: upto(HOME, TOP, BOTTOM, DIGITS),
    drills: [
      '१ २ ३ ४ ५ ६ ७ ८ ९ ०',
      '१२ ३४ ५६ ७८ ९० १०० २००',
      'सन १९४७ में',
      '२५ जनवरी को १० बजे',
      '५ किलो चावल ३ किलो दाल',
      'कमरा ७ में १५ लोग',
    ],
    threshold: 90,
  },
  {
    id: 'shift',
    name: 'Shift row',
    title: 'Level 5 - Shift row',
    focus: 'Capitals, held with the opposite little finger',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    // फ ट ठ छ ड ढ, the ai-matra, the danda, and the half consonants.
    drills: [
      'फ फ फ ट ट ट ठ ठ ठ ड ड ड',
      'छ छ छ ढ ढ ढ',
      'फल टमाटर छत डर ढक्कन ठीक',
      'है हैं पैसा कैसे तैयार',
      'क्या सच्चा पक्का अच्छा',
      'यह फल है। वह छत पर है।',
    ],
    threshold: 90,
  },
  {
    id: 'matras',
    name: 'Matras',
    title: 'Level 6 - Matras',
    focus: 'ि ी ु ू े ै ो ौ - the vowel signs, on letters you already know',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    /**
     * The first level about a MARK rather than a row.
     *
     * Every matra here has been reachable since level 5 - they are scattered
     * across all four rows - so this level widens nothing. What it teaches is
     * the pattern: the i-matra is typed BEFORE its consonant and every other
     * one after it, which is the single rule that separates someone who can
     * find the keys from someone who can type.
     *
     * The consonants are deliberately held back to the ones levels 1-5 taught,
     * so the only new thing on screen is the vowel sign. भ ख घ and the rest
     * arrive in the next level and would otherwise be two lessons at once.
     */
    drills: [
      'कि की कु कू के कै को कौ',
      'ति ती तु तू ते तै तो तौ',
      'दिन दीप सुर सूत मेल मैल मोर मौन',
      'किताब नीला गुलाब जूता बेटा पैसा टोपी चौक',
      'पिता माता पुल फूल देर जैसा लोग कौर',
      'रवि नदी गुड़ दूर सेब वैसा चोट दौड़',
    ],
    threshold: 90,
  },
  {
    id: 'conjuncts',
    name: 'Two-key letters',
    title: 'Level 7 - Two-key letters',
    focus: 'भ श ष ण ध ख घ झ थ - the letters with no key of their own',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    // The half-consonant-plus-bar rule, which is where most Kruti Dev typists
    // lose their speed. Each of these is two keystrokes and nothing on the
    // keyboard hints at it.
    drills: [
      'भ भ भ श श श ष ष ष ण ण ण',
      'ध ध ध ख ख ख घ घ घ झ झ झ थ थ थ',
      'भारत शहर खाना घर झील थाली',
      'धन धीरे भाषा शहद खेल घड़ी',
      'आम ईख ऐसा और औषधि',
      'भाषण विशेष कठिन थोड़ा घंटा झंडा',
    ],
    threshold: 92,
  },
  {
    id: 'ligatures',
    name: 'Conjuncts',
    title: 'Level 8 - Conjuncts',
    focus: 'क्ष त्र ज्ञ श्र - the four that are drawn as one letter',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    /**
     * Separated from the two-key letters above because they are a different
     * problem wearing the same disguise.
     *
     * भ is one letter that happens to need two keys. क्ष is genuinely two
     * letters - क and ष - that Devanagari draws joined, and it is typed the way
     * it is built. A learner who has been told "some letters take two keys"
     * will try to memorise क्ष as a third key pair and get stuck; the point of
     * this level is that there is nothing new to memorise, only the halant they
     * already know applied to letters they already have.
     */
    drills: [
      'क्ष क्ष क्ष त्र त्र त्र ज्ञ ज्ञ ज्ञ श्र श्र श्र',
      'क्षमा क्षेत्र परीक्षा लक्ष्य',
      'त्रिशूल पत्र मित्र चित्र यात्रा',
      'ज्ञान विज्ञान अज्ञात यज्ञ',
      'श्रम श्रेणी श्रीमान परिश्रम',
      'शिक्षा और विज्ञान का क्षेत्र',
    ],
    threshold: 92,
  },
  {
    id: 'words',
    name: 'Everyday words',
    title: 'Level 9 - Everyday words',
    focus: 'The whole keyboard, one word at a time',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    drills: [
      'कार्यालय अधिकारी कर्मचारी विभाग',
      'आवेदन प्रमाणपत्र हस्ताक्षर दिनांक',
      'विद्यालय परीक्षा परिणाम छात्र',
      'सरकार राज्य जिला तहसील गांव',
      'कंप्यूटर इंटरनेट मोबाइल सूचना',
      'स्वास्थ्य शिक्षा रोजगार विकास',
    ],
    threshold: 92,
  },
  {
    id: 'sentences',
    name: 'Sentences',
    title: 'Level 10 - Sentences',
    focus: 'Real prose, at the length an exam sets',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    drills: [
      'हिंदी भारत की राजभाषा है और देश के अधिकांश राज्यों में बोली जाती है।',
      'सरकारी कार्यालय में हर आवेदन पर दिनांक और हस्ताक्षर आवश्यक होते हैं।',
      'परीक्षा का परिणाम विद्यालय की सूचना पट्टिका पर लगा दिया गया है।',
      'कंप्यूटर के आने से दफ्तर का काम पहले की तुलना में बहुत तेज हो गया है।',
      'नियमित अभ्यास से टाइपिंग की गति और शुद्धता दोनों बढ़ती हैं।',
    ],
    threshold: 95,
  },
  {
    id: 'paragraphs',
    name: 'Paragraphs',
    title: 'Level 11 - Paragraphs',
    focus: 'Continuous prose - the last step before a timed test',
    keys: upto(HOME, TOP, BOTTOM, DIGITS, SHIFTED),
    /**
     * The top of the ladder, and the only level where a drill runs past one
     * sentence.
     *
     * Sentences are typed with a full stop to rest on. A paragraph is where a
     * typist finds out whether they can keep a rhythm across one - which is the
     * actual skill an exam tests, and the thing the lesson ladder has been
     * building towards. Kept to four short paragraphs so the level still fits
     * the "long enough to be practice, short enough to finish" rule the tests
     * enforce; anything longer belongs in a timed practice test, which is the
     * other half of this page.
     */
    drills: [
      'सुबह जल्दी उठना एक अच्छी आदत है। ताजी हवा में थोड़ी देर टहलने से शरीर स्वस्थ रहता है और मन भी प्रसन्न रहता है।',
      'पुस्तकें हमारी सबसे अच्छी मित्र होती हैं। वे हमें ज्ञान देती हैं, हमारा मनोरंजन करती हैं और कठिन समय में हमारा साथ निभाती हैं।',
      'परिश्रम ही सफलता की कुंजी है। जो व्यक्ति नियमित रूप से अभ्यास करता है, वह धीरे धीरे अपने लक्ष्य तक पहुंच ही जाता है।',
      'हमें अपने आसपास सफाई रखनी चाहिए। कचरा सही जगह डालें और पानी का कम से कम उपयोग करें, तभी हमारा गांव और शहर सुंदर बनेगा।',
    ],
    threshold: 95,
  },
];

/** The separator between drill lines when they become one target. */
export const DRILL_JOINER = ' ';

/** The whole of a level, as one string to type. */
export const levelText = (level) => level.drills.join(DRILL_JOINER);

export const levelById = (id) => LEVELS.find((l) => l.id === id) ?? null;
export const levelIndex = (id) => LEVELS.findIndex((l) => l.id === id);

/**
 * Is this level open to a learner who has completed `done`?
 *
 * The first is always open, and each other needs the one before it. Progress
 * is the only gate: there is no time lock and no score to beat, because the
 * point of a ladder is that you can always start at the bottom of it.
 */
export function isUnlocked(id, done = []) {
  const i = levelIndex(id);
  if (i <= 0) return i === 0;
  return done.includes(LEVELS[i - 1].id);
}

/** The next level after this one, or null at the top of the ladder. */
export function nextLevel(id) {
  const i = levelIndex(id);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

/**
 * Practice passages for the Hindi typing test.
 *
 * Plain Unicode Devanagari, and only that. The Kruti Dev form of every passage
 * is produced at BUILD TIME by the same convert() the converter pages use, so
 * there is no second copy of any passage to keep in sync and no hand-typed
 * legacy text that could be wrong. passages.test.js round-trips each one
 * through Unicode -> Kruti Dev -> Unicode and fails if a single character does
 * not survive, which means a passage can never reach the page carrying a letter
 * the engine cannot represent.
 *
 * ---------------------------------------------------------------------------
 * ADDING A PASSAGE
 *
 * Append to PASSAGES. Keep it neutral - general knowledge, an essay topic, the
 * kind of thing a CPCT or SSC paper would actually set. No politics, no names
 * of living people, nothing that dates. Then run `npm test`: if the passage
 * uses a character outside the verified map, the round-trip test says so by
 * name rather than letting it ship and render as mojibake in Kruti Dev mode.
 *
 * ---------------------------------------------------------------------------
 * TWO LETTERS THESE PASSAGES DELIBERATELY AVOID: ँ AND ऊ
 *
 * The tutor draws a Remington keyboard and highlights the key to press next.
 * Kruti Dev's map reaches past ASCII for a handful of glyphs, and two of them -
 * ँ (chandrabindu) and ऊ - have no US QWERTY cap and no alternative spelling in
 * the map. A passage containing them would ask for a keystroke that is not on
 * the keyboard being drawn.
 *
 * So the nasal is written ं throughout: गांव, हूं, पूंजी, आंखों. These are
 * ordinary printed Hindi - newspapers and government documents use them - and
 * not a compromise in accuracy, only a choice between two accepted spellings.
 * remington.test.js enforces it, naming the passage and the character if one
 * ever slips back in.
 * ---------------------------------------------------------------------------
 */

/**
 * @typedef {object} Passage
 * @property {string} id
 * @property {string} title  shown above the target panel
 * @property {string} text   Unicode Devanagari
 */

/** @type {Passage[]} */
export const PASSAGES = [
  {
    id: 'vividhata',
    title: 'भारत की विविधता',
    text: 'भारत एक विशाल और विविधताओं से भरा देश है। यहां अलग अलग राज्यों में अलग अलग भाषाएं बोली जाती हैं, फिर भी सब लोग एक सूत्र में बंधे हुए हैं। उत्तर में हिमालय की बर्फीली चोटियां हैं और दक्षिण में समुद्र की लहरें किनारों से टकराती रहती हैं। हर प्रदेश का अपना पहनावा, अपना भोजन और अपने त्योहार हैं। दीपावली, होली, ईद और बैसाखी पूरे देश में उत्साह के साथ मनाए जाते हैं। यही विविधता हमारी सबसे बड़ी पूंजी है। जब अलग अलग विचारों के लोग मिलकर काम करते हैं तब समाज और अधिक मजबूत बनता है। हमें अपनी इस साझी विरासत को संभालकर रखना चाहिए और आने वाली पीढ़ियों तक पहुंचाना चाहिए।',
  },
  {
    id: 'shiksha',
    title: 'शिक्षा का महत्व',
    text: 'शिक्षा मनुष्य को सही और गलत के बीच अंतर करना सिखाती है। एक पढ़ा लिखा व्यक्ति न केवल अपना जीवन सुधारता है बल्कि अपने परिवार और समाज को भी आगे बढ़ाता है। शिक्षा से आत्मविश्वास आता है और नए अवसरों के द्वार खुलते हैं। आज के समय में केवल किताबी ज्ञान पर्याप्त नहीं है। व्यावहारिक कौशल, अच्छा व्यवहार और निरंतर सीखते रहने की आदत भी उतनी ही आवश्यक है। हर बच्चे को प्राथमिक शिक्षा उपलब्ध कराने के लिए अनेक योजनाएं चलाई गई हैं। गांव गांव में विद्यालय खोले गए हैं और छात्राओं के लिए विशेष सुविधाएं दी जा रही हैं। जब तक देश का हर नागरिक शिक्षित नहीं होगा, तब तक पूर्ण विकास संभव नहीं है।',
  },
  {
    id: 'computer',
    title: 'कंप्यूटर और इंटरनेट',
    text: 'आज कंप्यूटर हमारे जीवन का एक आवश्यक हिस्सा बन चुका है। बैंक, रेलवे, अस्पताल और सरकारी कार्यालय सभी जगह कामकाज कंप्यूटर की सहायता से होता है। जो काम पहले कई दिनों में पूरा होता था वह अब कुछ ही मिनटों में हो जाता है। इंटरनेट ने दुनिया भर की जानकारी हमारी उंगलियों तक पहुंचा दी है। विद्यार्थी घर बैठे पढ़ाई कर सकते हैं और कर्मचारी दूर रहकर भी अपना काम कर सकते हैं। परंतु हमें इसका उपयोग सोच समझकर करना चाहिए। बहुत देर तक पर्दे को देखते रहने से आंखों पर बुरा असर पड़ता है और समय भी नष्ट होता है। तकनीक हमारी सेवक है, उसे स्वामी नहीं बनने देना चाहिए।',
  },
  {
    id: 'paryavaran',
    title: 'पर्यावरण संरक्षण',
    text: 'पेड़ हमें शुद्ध हवा, छाया और फल देते हैं, फिर भी हम उन्हें लगातार काटते जा रहे हैं। जंगल घटने से वर्षा कम हो रही है और गर्मी बढ़ती जा रही है। नदियों में कारखानों का गंदा पानी गिरने के कारण जल प्रदूषण की समस्या गंभीर हो गई है। प्लास्टिक की थैलियां मिट्टी में वर्षों तक नहीं गलतीं और पशुओं के लिए घातक सिद्ध होती हैं। हमें अपने दैनिक जीवन में छोटे छोटे बदलाव करने होंगे। बिजली और पानी का कम उपयोग करें, कचरा सही जगह डालें और हर वर्ष कम से कम एक पौधा अवश्य लगाएं। यह धरती हमें अपने पूर्वजों से मिली है और हमें इसे अपनी संतानों को सौंपना है।',
  },
  {
    id: 'hindi-bhasha',
    title: 'हिंदी भाषा',
    text: 'हिंदी भारत में सबसे अधिक बोली और समझी जाने वाली भाषा है। यह देवनागरी लिपि में लिखी जाती है, जिसमें जैसा बोला जाता है वैसा ही लिखा जाता है। यही कारण है कि हिंदी पढ़ना और लिखना अपेक्षाकृत सरल है। चौदह सितंबर को हर वर्ष हिंदी दिवस मनाया जाता है। कार्यालयों में आवेदन, सूचना और आदेश हिंदी में जारी किए जाते हैं। कंप्यूटर पर हिंदी लिखने के लिए पहले विशेष प्रकार के अक्षरों की आवश्यकता होती थी, परंतु अब यूनिकोड के कारण यह काम बहुत आसान हो गया है। अपनी भाषा में काम करने से विचार अधिक स्पष्ट होते हैं और आत्मविश्वास भी बढ़ता है।',
  },
  {
    id: 'samay',
    title: 'समय का महत्व',
    text: 'समय संसार की सबसे मूल्यवान वस्तु है। धन खो जाए तो दोबारा कमाया जा सकता है, परंतु बीता हुआ समय किसी भी कीमत पर वापस नहीं आता। जो व्यक्ति समय का सम्मान करता है, समय भी उसका साथ देता है। विद्यार्थी जीवन में समय का सदुपयोग सबसे अधिक आवश्यक है। प्रतिदिन का काम उसी दिन पूरा करने की आदत डालनी चाहिए। आलस्य और टालमटोल सबसे बड़े शत्रु हैं। एक सूची बनाकर काम करने से पता चलता है कि दिन कहां बीत रहा है। थोड़ा थोड़ा करके नियमित अभ्यास करने वाला व्यक्ति अंत में उससे आगे निकल जाता है जो कभी कभी बहुत अधिक मेहनत करता है।',
  },
  {
    id: 'swasthya',
    title: 'स्वास्थ्य और दिनचर्या',
    text: 'स्वस्थ शरीर में ही स्वस्थ मन निवास करता है। सुबह जल्दी उठना, थोड़ा व्यायाम करना और संतुलित भोजन लेना तीन ऐसी आदतें हैं जो जीवन भर काम आती हैं। हरी सब्जियां, मौसमी फल और पर्याप्त पानी शरीर को रोगों से लड़ने की शक्ति देते हैं। तले हुए और बाहर के भोजन से जितना बच सकें उतना अच्छा है। नींद पूरी न हो तो दिन भर थकान बनी रहती है और किसी काम में मन नहीं लगता। पैदल चलना सबसे सरल और सबसे सस्ता व्यायाम है। बीमारी आने पर इलाज कराने से बेहतर है कि उसे आने ही न दिया जाए।',
  },
  {
    id: 'shram',
    title: 'परिश्रम का फल',
    text: 'परिश्रम ही सफलता की एकमात्र कुंजी है। भाग्य के भरोसे बैठे रहने वाले लोग जीवन भर प्रतीक्षा ही करते रह जाते हैं। जो व्यक्ति लगन के साथ अपने काम में जुटा रहता है, उसे देर सवेर फल अवश्य मिलता है। किसान धूप और वर्षा की परवाह किए बिना खेत में काम करता है, तभी हमें अनाज मिलता है। विद्यार्थी रात दिन पढ़ता है, तभी परीक्षा में अच्छे अंक प्राप्त करता है। कठिनाइयां सबके जीवन में आती हैं, परंतु उनसे घबराकर रुक जाना उचित नहीं है। असफलता केवल यह बताती है कि प्रयास का तरीका बदलना है, प्रयास छोड़ना नहीं।',
  },
  {
    id: 'jal',
    title: 'जल का महत्व',
    text: 'पानी के बिना जीवन की कल्पना नहीं की जा सकती। धरती पर उपलब्ध जल का बहुत छोटा हिस्सा ही पीने योग्य है, फिर भी हम उसे लापरवाही से बहा देते हैं। नल खुला छोड़ देना, टंकी का भर कर बहना और पाइप से गाड़ी धोना ऐसी आदतें हैं जिन पर हम ध्यान ही नहीं देते। कई गांवों में महिलाओं को पीने का पानी लाने के लिए दूर तक चलना पड़ता है। वर्षा का जल संचय करके और तालाबों की सफाई करके हम भूजल का स्तर सुधार सकते हैं। खेती में टपक सिंचाई अपनाने से कम पानी में अधिक उपज ली जा सकती है। जल बचाना किसी एक विभाग का काम नहीं, हर नागरिक की जिम्मेदारी है।',
  },
  {
    id: 'yog',
    title: 'योग और व्यायाम',
    text: 'योग भारत की प्राचीन देन है और आज पूरी दुनिया इसे अपना रही है। प्रतिदिन कुछ समय आसन और प्राणायाम के लिए निकालने से शरीर लचीला बनता है और मन एकाग्र रहता है। इससे रक्तचाप, मधुमेह और तनाव जैसी समस्याओं में लाभ मिलता है। इसके लिए किसी महंगे सामान की आवश्यकता नहीं होती, केवल थोड़ी सी जगह और नियमित अभ्यास चाहिए। इक्कीस जून को हर वर्ष अंतरराष्ट्रीय योग दिवस मनाया जाता है। विद्यालयों में भी बच्चों को योग सिखाया जाने लगा है, जिससे उनका ध्यान पढ़ाई में अधिक लगता है। जो अभ्यास बचपन में शुरू होता है, वही जीवन भर साथ निभाता है।',
  },
  {
    id: 'vigyan',
    title: 'विज्ञान के लाभ',
    text: 'विज्ञान ने मनुष्य के जीवन को सरल और सुविधाजनक बना दिया है। बिजली, रेल, हवाई जहाज, दूरभाष और चिकित्सा के नए साधन सभी विज्ञान की देन हैं। जो रोग पहले असाध्य माने जाते थे, आज उनका इलाज संभव हो गया है। खेती में नए बीज और मशीनों के प्रयोग से पैदावार कई गुना बढ़ गई है। परंतु विज्ञान का दूसरा पहलू भी है। कारखानों का धुआं और रसायन हवा तथा पानी को दूषित कर रहे हैं। विज्ञान अपने आप में न अच्छा है न बुरा, सब कुछ इस बात पर निर्भर करता है कि हम उसका उपयोग किस दिशा में करते हैं।',
  },
  {
    id: 'kisan',
    title: 'किसान और खेती',
    text: 'भारत गांवों का देश है और खेती यहां की अर्थव्यवस्था का आधार है। किसान कड़ी धूप और बारिश की परवाह किए बिना खेतों में काम करता है, तब जाकर हमारी थाली तक अनाज पहुंचता है। पहले खेती पूरी तरह वर्षा पर निर्भर थी, परंतु अब नहरों और नलकूपों से सिंचाई की सुविधा बढ़ी है। सरकार किसानों को उन्नत बीज, खाद और कम ब्याज पर ऋण उपलब्ध कराती है। फिर भी कई किसान आज भी कर्ज और कम दाम की समस्या से जूझ रहे हैं। यदि उपज का उचित मूल्य और भंडारण की सुविधा मिल जाए तो गांव की तस्वीर बदल सकती है।',
  },
  {
    id: 'pustakalay',
    title: 'पुस्तकालय',
    text: 'पुस्तकालय वह स्थान है जहां ज्ञान का भंडार सहेज कर रखा जाता है। वहां इतिहास, विज्ञान, साहित्य और प्रतियोगी परीक्षाओं की पुस्तकें एक साथ मिल जाती हैं। जो छात्र महंगी किताबें नहीं खरीद सकते, उनके लिए पुस्तकालय किसी वरदान से कम नहीं है। वहां का शांत वातावरण पढ़ाई में मन लगाने के लिए सबसे उपयुक्त होता है। पुस्तकालय से पुस्तक लेते समय हमें कुछ नियमों का पालन करना चाहिए। पन्ने मोड़ना, उन पर लिखना या पुस्तक समय पर वापस न करना उचित नहीं है। आजकल कई पुस्तकालय अपनी सामग्री इंटरनेट पर भी उपलब्ध करा रहे हैं।',
  },
  {
    id: 'yatayat',
    title: 'यातायात के नियम',
    text: 'सड़क पर चलते समय नियमों का पालन करना अपनी और दूसरों की सुरक्षा के लिए आवश्यक है। हमें सदा बाईं ओर चलना चाहिए और सड़क पार करते समय जेब्रा पट्टी का ही प्रयोग करना चाहिए। लाल बत्ती पर रुकना, पीली पर तैयार होना और हरी पर आगे बढ़ना यह बात हर बच्चे को मालूम होनी चाहिए। दोपहिया वाहन चलाते समय हेलमेट पहनना और कार में सीट बेल्ट लगाना जीवन रक्षक सिद्ध होता है। तेज गति और जल्दबाजी अधिकांश दुर्घटनाओं का कारण बनती है। कुछ मिनट बचाने के लिए जान जोखिम में डालना कहीं से भी समझदारी नहीं है।',
  },
  {
    id: 'khel',
    title: 'खेल का महत्व',
    text: 'खेल शरीर और मन दोनों के लिए आवश्यक हैं। दिन भर पढ़ाई या काम करने के बाद कुछ देर मैदान में खेलने से थकान दूर हो जाती है और नई ताजगी आती है। खेल से अनुशासन, सहयोग और नेतृत्व के गुण अपने आप विकसित होते हैं। हार और जीत को समान भाव से स्वीकार करना भी मैदान में ही सीखा जाता है। कबड्डी, खो खो और कुश्ती हमारे पारंपरिक खेल हैं, जबकि क्रिकेट, हॉकी और बैडमिंटन आज घर घर में लोकप्रिय हैं। आजकल खेल में भी अच्छा भविष्य बनाया जा सकता है, इसलिए हर विद्यालय में खेल का मैदान होना चाहिए।',
  },
  {
    id: 'sanchar',
    title: 'संचार के साधन',
    text: 'संदेश एक स्थान से दूसरे स्थान तक पहुंचाने के साधनों को संचार के साधन कहते हैं। पहले लोग पत्र लिखकर डाक से भेजते थे और उत्तर की प्रतीक्षा में कई दिन बीत जाते थे। तार और दूरभाष के आने से यह काम कुछ तेज हुआ। आज मोबाइल और इंटरनेट ने दूरी का अर्थ ही बदल दिया है। कुछ ही क्षणों में संदेश, चित्र और आवाज दूसरे देश तक पहुंच जाती है। सरकारी सूचनाएं भी अब जालस्थल पर तुरंत उपलब्ध करा दी जाती हैं। परंतु इन साधनों का अधिक उपयोग समय और स्वास्थ्य दोनों का नुकसान करता है, इसलिए संतुलन आवश्यक है।',
  },
];

/**
 * The test lengths, in seconds.
 *
 * Labelled in the unit every exam notification quotes, which is minutes up to
 * an hour and hours past it. "120 min" is arithmetic the candidate has to do;
 * "2 hr" is the number on the paper.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RANGE RUNS ALL THE WAY TO TWO HOURS
 *
 * Stamina is a separate skill from speed. A typist who is comfortable for one
 * minute is often finished by minute eight, and the only way to find out is to
 * sit the length the paper actually sets. Departmental and court typing tests
 * run far longer than the 10-15 minutes a speed test needs, and a candidate
 * rehearsing for one of those has nowhere else to practise it.
 *
 * The long end is not free. A 2-hour test is ~36,000 keystrokes of queued
 * passage, which is why the tutor renders the passage in chunks rather than
 * building 24,000 spans up front - see renderPassage() in TypingTutor.astro.
 * The pool is also finite, so a test this long necessarily repeats paragraphs;
 * passages.test.js pins how close to optimal that repetition has to stay.
 * ---------------------------------------------------------------------------
 */
export const DURATIONS = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
  { value: 900, label: '15 min' },
  { value: 1800, label: '30 min' },
  { value: 3600, label: '1 hr' },
  { value: 7200, label: '2 hr' },
];

/**
 * Characters a very fast Hindi typist could reach in a minute.
 *
 * 60 WPM at five keystrokes to the word. Well above the 25–30 WPM that clears
 * CPCT or an SSC Hindi paper, on purpose: this number only decides how much
 * text to queue up, and running out of passage mid-test is a far worse failure
 * than preparing a paragraph nobody reaches.
 */
const CHARS_PER_MINUTE = 60 * 5;

/** The separator between two queued passages. One space, in both scripts. */
export const JOINER = ' ';

/**
 * Choose the passages for one test, in order.
 *
 * A 5-minute test needs more text than any single paragraph worth reading, so
 * passages are queued until there is enough for the whole duration. They are
 * shuffled rather than cycled, and none repeats until the pool is exhausted, so
 * a returning user does not get the same opening paragraph every morning.
 *
 * Takes LENGTHS rather than passages on purpose. The caller has two forms of
 * each passage - the Devanagari and the Kruti Dev keystrokes, which are
 * different lengths - so there is no one object here that could be "the
 * passage", and a planner that reached into a field would only ever be reaching
 * into the wrong one.
 *
 * `lengths` is required rather than defaulted to PASSAGES. A default would
 * reference the passage text from inside this function, which pins it into
 * whatever bundle imports planPassages - and TypingTutor.astro's client script
 * imports it while ALSO receiving every passage as JSON in the page. That
 * default shipped all eight paragraphs twice, on the one page where the time
 * to the first keystroke is the product.
 *
 * @param {number} seconds duration of the test
 * @param {number[]} lengths character count of each passage, in the mode about
 *        to be typed
 * @param {() => number} [rand] injectable, so the tests are not random
 * @returns {number[]} indices into `lengths`, in the order to be typed
 */
export function planPassages(seconds, lengths, rand = Math.random) {
  if (lengths.length === 0) return [];

  const needed = Math.ceil((seconds / 60) * CHARS_PER_MINUTE);
  const order = [];
  let bag = [];
  let chars = 0;

  // Always at least one, however short the test: a 1-minute test still needs a
  // paragraph to look at before the clock starts.
  while (order.length === 0 || chars < needed) {
    if (bag.length === 0) bag = shuffled(lengths.length, rand);
    const next = bag.pop();
    // The joiner sits BETWEEN passages, so the first one does not carry one.
    // Counting it for every passage made `chars` one more than the string the
    // caller actually gets, and a queue that stopped exactly on `needed` came
    // out one character short of the length this function promised.
    chars += (order.length > 0 ? JOINER.length : 0) + lengths[next];
    order.push(next);
  }

  return order;
}

/** Fisher–Yates over [0, n), so every passage appears before any repeats. */
function shuffled(n, rand) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

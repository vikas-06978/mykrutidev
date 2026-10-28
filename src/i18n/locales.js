/**
 * The site's languages, in one place. Everything that lists languages - the
 * routes, the switcher, hreflang, the sitemap, Open Graph, the share images -
 * reads LOCALES from here.
 *
 * A language is listed in LOCALES only when its dictionary is complete: every
 * key of en.json, translated. i18n.test.js and the import-time check in
 * index.js hold each one to that, so a half-done language can never be
 * published. To add one: write src/i18n/<code>.json, import it in index.js
 * (DICTS), and add the code here.
 *
 * No JSON is imported here, so astro.config.mjs can read this file too.
 */

/** The languages the site is published in. English first: it is the default. */
export const LOCALES = /** @type {const} */ (['en', 'hi', 'bn', 'mr', 'ta', 'gu', 'pa']);
export const DEFAULT_LOCALE = 'en';

/**
 * What each language is called and how it is marked up. `label` is the name in
 * its own script, as the switcher shows it; `script` picks the body font in
 * global.css (html[lang]); `dateLocale` formats dates on guide pages.
 * Languages not yet in LOCALES are listed so their pages are ready the day
 * their dictionary is.
 */
export const LOCALE_META = {
  en: { htmlLang: 'en', hreflang: 'en', ogLocale: 'en_IN', label: 'English', english: 'English', dateLocale: 'en-IN', script: 'latin' },
  hi: { htmlLang: 'hi', hreflang: 'hi', ogLocale: 'hi_IN', label: 'हिंदी', english: 'Hindi', dateLocale: 'hi-IN', script: 'deva' },
  bn: { htmlLang: 'bn', hreflang: 'bn', ogLocale: 'bn_IN', label: 'বাংলা', english: 'Bengali', dateLocale: 'bn-IN', script: 'beng' },
  mr: { htmlLang: 'mr', hreflang: 'mr', ogLocale: 'mr_IN', label: 'मराठी', english: 'Marathi', dateLocale: 'mr-IN', script: 'deva' },
  ta: { htmlLang: 'ta', hreflang: 'ta', ogLocale: 'ta_IN', label: 'தமிழ்', english: 'Tamil', dateLocale: 'ta-IN', script: 'taml' },
  gu: { htmlLang: 'gu', hreflang: 'gu', ogLocale: 'gu_IN', label: 'ગુજરાતી', english: 'Gujarati', dateLocale: 'gu-IN', script: 'gujr' },
  pa: { htmlLang: 'pa', hreflang: 'pa', ogLocale: 'pa_IN', label: 'ਪੰਜਾਬੀ', english: 'Punjabi', dateLocale: 'pa-IN', script: 'guru' },
};

/** The languages that live under a prefix: /hi/, /bn/, ... */
export const PREFIXED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export const isLocale = (x) => LOCALES.includes(x);

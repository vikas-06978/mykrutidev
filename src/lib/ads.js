/**
 * Google AdSense, ready but OFF until the site owner switches it on.
 *
 * Nothing here runs, loads or changes a page until Cloudflare Pages passes the
 * build these environment variables (Settings -> Variables and Secrets, then a
 * new deployment). Without them the site is byte for byte what it was:
 * tests/dist.test.js checks there is no AdSense code, no ads.txt and no ad
 * address in the Content-Security-Policy.
 *
 *  PUBLIC_ADSENSE_CLIENT  the publisher ID, ca-pub- and 16 digits, from AdSense
 *                         (Account -> Settings -> Account information). On its
 *                         own it is the "apply" step: every page gets
 *                         <meta name="google-adsense-account">, which is how
 *                         AdSense checks the site is yours, the site gets its
 *                         /ads.txt, and the privacy policy gets its section on
 *                         advertising cookies. No ad code is loaded yet.
 *  PUBLIC_ADSENSE_ADS     "on", once AdSense has approved the site: the AdSense
 *                         script is loaded (after the page has finished
 *                         loading, like Google Analytics) and the
 *                         Content-Security-Policy allows Google's ad addresses.
 *                         With only this, the ads are Auto ads, placed by
 *                         Google as set in the AdSense dashboard.
 *  PUBLIC_ADSENSE_SLOT    optional: a display ad unit's ID (10 digits, from
 *                         Ads -> By ad unit). The site then also shows that
 *                         unit in two fixed places that never cover a tool:
 *                         under a page's "how to use" steps, and at the end
 *                         of each guide, before its questions.
 *
 * Never on pages with nothing to read beside an ad, or where an ad would
 * hurt: the store, the thank-you page, the policies, contact and the 404
 * (AdSense's own rules forbid ads on pages without publisher content).
 *
 * See docs/ADSENSE.md for the steps.
 */

/** ca-pub- and 16 digits, exactly as AdSense writes it. */
const CLIENT_RE = /^ca-pub-\d{16}$/;
/** An ad unit's data-ad-slot: 10 digits. */
const SLOT_RE = /^\d{10}$/;

/**
 * Google's certification authority ID for ads.txt: the same for every
 * AdSense publisher (the fourth field of the line AdSense shows).
 */
export const GOOGLE_TAG_ID = 'f08c47fec0942fa0';

/**
 * @typedef {{ client: string, pub: string, show: boolean, slot: string | null }} Ads
 */

/**
 * The AdSense settings from the build's environment, or null when AdSense is
 * not set up. A malformed value is treated as not set, with a reason, so a
 * typo never ships half an ad setup.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Ads | null}
 */
export function readAds(env) {
  const client = (env?.PUBLIC_ADSENSE_CLIENT ?? '').trim();
  if (!client) return null;
  if (!CLIENT_RE.test(client)) {
    console.warn(`[ads] PUBLIC_ADSENSE_CLIENT "${client}" is not ca-pub- and 16 digits: AdSense stays off`);
    return null;
  }
  const show = (env?.PUBLIC_ADSENSE_ADS ?? '').trim().toLowerCase() === 'on';
  const rawSlot = (env?.PUBLIC_ADSENSE_SLOT ?? '').trim();
  const slot = rawSlot && SLOT_RE.test(rawSlot) ? rawSlot : null;
  if (rawSlot && !slot) console.warn(`[ads] PUBLIC_ADSENSE_SLOT "${rawSlot}" is not 10 digits: no fixed ad units`);
  return { client, pub: client.slice(3), show, slot };
}

/** The settings this build was made with. */
export const ADS = readAds(import.meta.env ?? {});

/** The one line of /ads.txt that authorises Google to sell this site's ads. */
export const adsTxt = (ads) => `google.com, ${ads.pub}, DIRECT, ${GOOGLE_TAG_ID}\n`;

/**
 * Pages that never carry ads, by route path (no language prefix). The store's
 * product pages are caught by their prefix.
 */
const NO_ADS = new Set([
  '/store',
  '/store/thanks',
  '/privacy-policy',
  '/terms',
  '/refund-policy',
  '/delivery-policy',
  '/contact',
  '/support',
  '/links',
]);

/** Whether a page may show ads. */
export const adsAllowedOn = (path) => !NO_ADS.has(path) && !path.startsWith('/store/');

/**
 * The addresses AdSense loads from, frames and reports to, as Google lists
 * them for a Content-Security-Policy, plus Google's consent message
 * (fundingchoicesmessages), which AdSense shows to visitors from the EEA, the
 * UK and Switzerland when "Privacy & messaging" is set up.
 */
export const ADS_CSP = {
  script: [
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://*.adtrafficquality.google',
    'https://*.doubleclick.net',
    'https://www.google.com',
    'https://*.gstatic.com',
    'https://fundingchoicesmessages.google.com',
  ],
  frame: [
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://*.adtrafficquality.google',
    'https://www.google.com',
    'https://fundingchoicesmessages.google.com',
  ],
  connect: [
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://*.adtrafficquality.google',
    'https://*.google.com',
    'https://fundingchoicesmessages.google.com',
  ],
  // Ad images come from many advertisers' servers.
  img: ['https:'],
};

/**
 * The AdSense loader, as an inline script: adsbygoogle.js is added once the
 * page has loaded and the browser is idle, so it never competes with the
 * tools for the first paint. Every fixed unit on the page is then filled.
 * Only on the live host, like Google Analytics: AdSense serves no ads on a
 * preview address, and a test run should not ask it to.
 * @param {Ads} ads
 * @param {string} site
 */
export function adsScript(ads, site) {
  const src = JSON.stringify(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ads.client}`);
  const host = JSON.stringify(new URL(site).hostname);
  return `
      (function () {
        if (location.hostname !== ${host}) return;
        var load = function () {
          var s = document.createElement('script');
          s.async = true;
          s.crossOrigin = 'anonymous';
          s.src = ${src};
          document.head.appendChild(s);
          var units = document.querySelectorAll('ins.adsbygoogle');
          window.adsbygoogle = window.adsbygoogle || [];
          for (var i = 0; i < units.length; i++) window.adsbygoogle.push({});
        };
        var idle = function () {
          if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 4000 });
          else setTimeout(load, 2000);
        };
        if (document.readyState === 'complete') idle();
        else addEventListener('load', idle);
      })();
    `;
}

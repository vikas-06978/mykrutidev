/**
 * Google Analytics (GA4): visit counts for the live site.
 *
 * It runs only on the live host (SITE in routes.js), so the dev server, the
 * test runs and Cloudflare preview addresses never count as visits. Google
 * signals and ad personalisation are off: the numbers are for us, not for
 * advertising (the privacy policy says so). The Content-Security-Policy
 * allows Google's addresses for it (src/security/integration.mjs).
 *
 * gtag.js is about 70 KB of script that nothing on the page waits for, so it
 * is fetched once the page has loaded and the browser is idle, not while the
 * page is still drawing: on a phone it otherwise competes with the first paint
 * (PageSpeed Insights lists it as unused JavaScript and a long main-thread
 * task). The visit is still counted, with the same ID and settings: the
 * config call is queued in dataLayer at once and gtag.js reads it on arrival.
 * Only a visitor who leaves before the page has finished loading goes
 * uncounted.
 *
 * The store's thanks page (/store/thanks) carries the buyer's order number and
 * download key in its address. Google is told the page's address without them
 * (page_location), so the key is never sent to Google.
 */
import { SITE } from './routes.js';

/** The measurement ID. It is printed in every page, so it is not a secret. */
export const GA_ID = 'G-VZZRXNT8TQ';

/**
 * Google's tag, as an inline script for the top of <head>. The same steps as
 * the snippet Google gives, but the gtag.js file is added only on the live host,
 * and only after the page has loaded (see above).
 * @param {string} [site]
 */
export function analyticsScript(site = SITE) {
  const host = JSON.stringify(new URL(site).hostname);
  const id = JSON.stringify(GA_ID);
  return `
      if (location.hostname === ${host}) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
          dataLayer.push(arguments);
        };
        gtag('js', new Date());
        var cfg = { allow_google_signals: false, allow_ad_personalization_signals: false };
        // The page a buyer is sent back to has the order and its download key in
        // its address: Google gets the page without them.
        if (/\\/store\\/thanks\\/?$/.test(location.pathname)) cfg.page_location = location.origin + location.pathname;
        gtag('config', ${id}, cfg);
        var load = function () {
          var s = document.createElement('script');
          s.async = true;
          s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ${id};
          document.head.appendChild(s);
        };
        var idle = function () {
          if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 4000 });
          else setTimeout(load, 2000);
        };
        if (document.readyState === 'complete') idle();
        else addEventListener('load', idle);
      }
    `;
}

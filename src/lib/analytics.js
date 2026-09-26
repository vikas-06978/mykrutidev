/**
 * Google Analytics (GA4): visit counts for the live site.
 *
 * It runs only on the live host (SITE in routes.js), so the dev server, the
 * test runs and Cloudflare preview addresses never count as visits. Google
 * signals and ad personalisation are off: the numbers are for us, not for
 * advertising (the privacy policy says so). The Content-Security-Policy
 * allows Google's addresses for it (src/security/integration.mjs).
 */
import { SITE } from './routes.js';

/** The measurement ID. It is printed in every page, so it is not a secret. */
export const GA_ID = 'G-VZZRXNT8TQ';

/**
 * Google's tag, as an inline script for the top of <head>. The same steps as
 * the snippet Google gives, but the gtag.js file is added only on the live host.
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
        gtag('config', ${id}, { allow_google_signals: false, allow_ad_personalization_signals: false });
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ${id};
        document.head.appendChild(s);
      }
    `;
}

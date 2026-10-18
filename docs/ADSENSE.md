# Google AdSense: switching it on

## Current plan: product sales, advertising off

The owner's publisher ID is configured in the site for ownership verification.
`PUBLIC_ADSENSE_ADS` and `PUBLIC_ADSENSE_SLOT` remain unset, so no ads appear.

The existing integration supports applying and enabling advertising through
deployment settings, without editing source files. The policy introduction
does not promise permanent absence of advertising; its advertising disclosure
is added automatically when a valid publisher ID is configured. About names
the independent maintainer rather than claiming a development team.

Before enabling ads in the future, review the then-current Google publisher
policies and confirm that disclosures match the actual deployment. Configure
and publish a Google-certified consent management solution where required,
then verify its behavior on the live site, including Analytics consent where
applicable. Allowing consent-message domains in CSP does not by itself collect
consent or establish compliance. Dashboard configuration, consent verification
and Google's site review cannot be completed in advance by this repository.
Approval and permanent compatibility with future policies are not guaranteed.

Follow the steps below when you decide to apply. Keep the ad switch off until
approval and the applicable consent setup are complete. Switching to ads does
not change product pricing, checkout or download access.

The verification-only setup adds the ownership meta tag, `/ads.txt`, and the
advertising disclosure. It does not load ad code or display ads. The optional
AdSense integration can later show ads through Cloudflare Pages variables.
`tests/dist.test.js` checks the built output.

The code is in `src/lib/ads.js`. The fixed ad box is in
`src/components/AdSlot.astro`. The headers and `/ads.txt` come from
`src/security/integration.mjs`.

| Variable | Value | What it does |
| --- | --- | --- |
| `PUBLIC_ADSENSE_CLIENT` | `ca-pub-` + 16 digits (optional override) | Overrides the configured publisher ID. An empty value disables verification. The ID alone never loads ads. |
| `PUBLIC_ADSENSE_ADS` | `on` | Loads the AdSense script after the page has loaded, on mykrutidev.com only. It also allows Google's ad addresses in the CSP. Ads are then Auto ads, placed as set in the AdSense dashboard. |
| `PUBLIC_ADSENSE_SLOT` | 10 digits (optional) | Shows one display ad unit in two fixed places: under a page's "how to use" steps, and at the end of each guide. Never above a tool. |

Ads never appear on these pages, whatever the settings:
- the store and its product and thank-you pages
- the privacy, terms, refund and delivery policies
- contact, support and links
- the 404 page

AdSense does not allow ads on pages with no content of their own.

## Steps

1. **Apply.** Sign in at <https://adsense.google.com> with the site's Google
   account and add the site `mykrutidev.com`. AdSense shows your publisher ID,
   `ca-pub-XXXXXXXXXXXXXXXX`.
2. **Verify the publisher ID.** Once the verification-only deployment is live,
   open the home page and confirm its `google-adsense-account` meta tag contains
   your `ca-pub-…` ID. No Cloudflare variable is needed for this publisher ID.
3. **Verify.** Open `https://mykrutidev.com/ads.txt`. It should show one line:
   `google.com, pub-…, DIRECT, f08c47fec0942fa0`. In AdSense, choose the
   **Meta tag** (or ads.txt) way of verifying the site, and request a review.
4. **Consent message for Europe.** In AdSense → Privacy & messaging, create
   the **European regulations** message. It is Google's own certified consent
   tool. Review Google's current consent requirements for visitors from the
   EEA, the UK and Switzerland, including the selected ad-serving mode. The
   CSP already allows the consent-message host once ads are on; test that
   the message actually appears and the user's choice is respected.
5. **After approval.** Add `PUBLIC_ADSENSE_ADS` = `on` (Production) and
   deploy again. In AdSense → Ads, switch on Auto ads for the site. If you
   want ads only in the fixed places, leave Auto ads off, create a display ad
   unit under Ads → By ad unit and put its 10-digit `data-ad-slot` number in
   `PUBLIC_ADSENSE_SLOT`.
6. **Check.** Open a converter page on your phone and on a computer. Ads
   should sit below the tools. In the browser's developer console there
   should be no red "Content-Security-Policy" errors.

To switch ads off again, remove `PUBLIC_ADSENSE_ADS` and `PUBLIC_ADSENSE_SLOT`
and deploy again. The ownership tag and ads.txt may remain for later use.

## Worth knowing

- **Speed.** The AdSense script is large. It loads only after the page has
  finished loading, so the tools appear first. PageSpeed scores will still
  drop a little once ads are on.
- **Privacy wording.** The site's code never passes text, files or typing to
  Google or any advertiser, and the privacy policy says exactly that. The
  ad script does run on the same page as the tools, so the tools' own claims
  are about what the site sends, which stays true.
- **Preview builds.** The script runs only on `mykrutidev.com`, so a
  `pages.dev` preview shows the empty ad box (when a unit is set) but asks
  Google for nothing.

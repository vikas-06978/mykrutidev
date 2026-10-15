# Google AdSense: switching it on

Everything for AdSense is already in the site, and all of it is **off**. Three
Cloudflare Pages variables turn it on in steps. Without them the site is the
same as it is today: no ad code, no `/ads.txt`, no ad addresses in the
Content-Security-Policy, and no advertising section in the privacy policy.
`tests/dist.test.js` checks this on every build.

The code is in `src/lib/ads.js`. The fixed ad box is in
`src/components/AdSlot.astro`. The headers and `/ads.txt` come from
`src/security/integration.mjs`.

| Variable | Value | What it does |
| --- | --- | --- |
| `PUBLIC_ADSENSE_CLIENT` | `ca-pub-` + 16 digits | Adds the AdSense site check (`<meta name="google-adsense-account">`) to every page and writes `/ads.txt`. It also adds the advertising section to the privacy policy in all 7 languages. **No ads yet.** |
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
2. **Set the publisher ID.** In Cloudflare: Workers & Pages → mykrutidev →
   Settings → Variables and Secrets → **Production** → add
   `PUBLIC_ADSENSE_CLIENT` = your `ca-pub-…` ID. Then deploy again: Deployments
   → the latest production deployment → Retry deployment. A variable only
   reaches the site through a new build.
3. **Verify.** Open `https://mykrutidev.com/ads.txt`. It should show one line:
   `google.com, pub-…, DIRECT, f08c47fec0942fa0`. In AdSense, choose the
   **Meta tag** (or ads.txt) way of verifying the site, and request a review.
4. **Consent message for Europe.** In AdSense → Privacy & messaging, create
   the **European regulations** message. It is Google's own certified consent
   tool. Google requires it for personalised ads to visitors from the EEA,
   the UK and Switzerland. The CSP already allows it once ads are on.
5. **After approval.** Add `PUBLIC_ADSENSE_ADS` = `on` (Production) and
   deploy again. In AdSense → Ads, switch on Auto ads for the site. If you
   want ads only in the fixed places, create a display ad unit under Ads → By
   ad unit and put its 10-digit `data-ad-slot` number in `PUBLIC_ADSENSE_SLOT`.
6. **Check.** Open a converter page on your phone and on a computer. Ads
   should sit below the tools. In the browser's developer console there
   should be no red "Content-Security-Policy" errors.

To switch AdSense off again, delete the variables and deploy again.

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

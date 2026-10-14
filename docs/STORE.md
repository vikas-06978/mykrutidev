# The store (PDFs and ebooks)

MyKrutiDev sells digital files (PDFs, ebooks) through **Razorpay Payment Links**. The buyer pays on Razorpay's own page and comes back; no Razorpay script ever runs on our pages, so the site's Content-Security-Policy and the promise "nothing you type is uploaded" are unchanged.

```
product page ──POST /api/store/checkout──▶ order (D1) + Razorpay payment link
      │                                              │
      └──── browser goes to rzp.io, buyer pays ◀─────┘
                         │
      Razorpay ──▶ /store/thanks?razorpay_payment_link_reference_id=<order>
                         │  POST /api/store/confirm  (we ask Razorpay: is it paid?)
                         ▼
                 order = paid ─▶ download button + email with  /store/thanks#o=<order>&t=<token>
                         │
                 POST /api/store/download ─▶ PDF from the private R2 bucket
```

**What is trusted:** only Razorpay's answer to `GET /v1/payment_links/{id}` made with our secret key (status `paid`, amount, currency and reference all matching the order). The callback address and the webhook body on their own unlock nothing. The webhook only tells us *when* to ask.

## Where the code is

| Piece | File |
| --- | --- |
| Catalog, prices, limits, order table | `src/lib/store.js` (the **only** place a price or a file name lives) |
| Seller details printed on `/contact` | `src/lib/business.js` |
| Razorpay client + webhook signature | `server/razorpay.js` |
| API handlers | `server/storeApi.js`, `functions/api/store/*.js` |
| Emails (Resend) | `server/storeMail.js` |
| Orders dashboard | `server/storeAdmin.js`, `/admin/orders` |
| Pages | `src/components/Store*.astro`, `src/pages/store/`, `src/pages/refund-policy.astro`, `src/pages/delivery-policy.astro` |
| Browser logic that is tested | `src/lib/storeClient.js` |
| Tests | `server/store.test.js` (API, real local D1/R2), `src/lib/store.test.js` |

## One-time setup (Cloudflare)

1. **R2 bucket** (private): Workers & Pages → R2 → *Create bucket* → e.g. `mykrutidev-store`. Pages project → Settings → Bindings → *R2 bucket*, variable name **`STORE_FILES`**. Never make the bucket public.
2. **D1**: the same `DB` binding the feedback form uses. The `orders` table is created by the first request (`db/store.sql` is the same statements, for reference).
3. **Secrets / variables** (Pages → Settings → Variables and Secrets, *Production*):

   | Name | Type | Value |
   | --- | --- | --- |
   | `RAZORPAY_KEY_ID` | Text | `rzp_live_…` |
   | `RAZORPAY_KEY_SECRET` | Secret | the key secret |
   | `RAZORPAY_WEBHOOK_SECRET` | Secret | any long random string, the same as in step 4 |
   | `STORE_TOKEN_SECRET` | Secret | 16+ random characters. Download links are signed with it; changing it kills every old link |
   | `RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_TO` | | already set for feedback; buyers get their link by mail, you get a copy of every sale |
   | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_SALT`, `ADMIN_KEY` | | already set for feedback |

4. **Razorpay webhook**: Razorpay dashboard → Account & Settings → Webhooks → *Add*:
   URL `https://mykrutidev.com/api/store/webhook`, the secret from step 3, events **`payment_link.paid`** and **`refund.processed`**.
5. **Check**: open `/admin/orders` (signing in at `/admin/feedback` first). The *Setup check* lists what is connected and what is missing.

## Test before real money (Preview environment)

1. Pages → Settings → *Preview* environment: the same variables but with **test keys** (`rzp_test_…`), a test webhook, and `STORE_TEST_PRODUCTS` = `1`.
2. Upload any one-page PDF to the bucket as `test/sample.pdf`.
3. Open `/store/sample-test` on the preview URL: it sells the ₹1 sample. Pay with Razorpay's test UPI/card, watch the order turn *paid* in `/admin/orders`, download the file, then mark it refunded and see the download close.

`STORE_TEST_PRODUCTS` must **not** be set in Production: the sample product is only sold where it is `1`.

## Adding a real product

1. Make the PDF. Upload it to the bucket, e.g. `ebooks/ssc-chsl-typing-mock-tests.pdf`.
2. Add an entry to `PRODUCTS` in `src/lib/store.js` with `status: 'live'`, its `pricePaise` (₹199 → `19900`), `file`, `fileName`, `pages`.
3. Add `pages["/store/<id>"]` (nav, h1, title, description, lede, body) to every `src/i18n/<lang>.json` (and the matching `i18n-drafts/`).
4. Fill `src/lib/business.js` (name, address, phone: the same as on the Razorpay KYC). A test fails while a product is live and these are empty.
5. `npm test`, build, merge. The store page, the product page and the sitemap entries appear by themselves; with nothing live they stay `noindex` and out of the sitemap.

Changing a price or a file later: edit `src/lib/store.js`. Already-created orders keep the amount they were created with.

## Rules the code enforces

* **Price and file never come from the browser.** The request names a product id, nothing else.
* **Paid is decided once**: `UPDATE … WHERE status='created' RETURNING *`, so two racing webhook/return calls cannot both send the emails.
* **Downloads** are POST-only (a mail scanner opening the link cannot use one up) and counted in a single `UPDATE` that also checks paid, not refunded, not expired, under the limit (`STORE.maxDownloads`, `STORE.downloadDays`). A missing file does not cost a download.
* **The link** is `/store/thanks#o=<order>&t=<HMAC>`: the token is in the fragment, so it is never sent to a server or in a Referer, and `src/lib/analytics.js` also strips the query from what Google Analytics sees on that page.
* **Refunds**: the 7-day promise is in `STORE.refundDays` and printed from it. Refund in Razorpay's dashboard; the `refund.processed` webhook closes the downloads for a full refund. *Mark refunded* in `/admin/orders` does the same by hand.
* **Privacy**: an order keeps only email, product, amount and Razorpay ids. Orders nobody paid are deleted after `STORE.unpaidDays`.

## Before the first sale

* Razorpay KYC is approved and the site's `/contact`, `/terms`, `/privacy-policy`, `/refund-policy` and `/delivery-policy` are live (Razorpay asks for them).
* The first end-to-end payment was made in test mode on the preview.
* A ₹ live payment of the cheapest product was made by you and refunded by you, to see the whole path once with real keys.
* Income tax (and GST above the threshold) can apply to digital sales even for a sole proprietor: check with a CA.

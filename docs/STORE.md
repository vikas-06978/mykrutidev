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
   | `STORE_CRON_SECRET` | Secret | 16+ random characters, for the scheduled background check (step 6). Optional but recommended |

4. **Razorpay webhook**: Razorpay dashboard → Account & Settings → Webhooks → *Add*:
   URL `https://mykrutidev.com/api/store/webhook`, the secret from step 3, events **`payment_link.paid`** and **`refund.processed`**.
5. **Resend webhook** (delivery reports): resend.com → Webhooks → *Add webhook*: URL `https://mykrutidev.com/api/store/mail-webhook`, events **`email.delivered`**, **`email.bounced`** and **`email.complained`**. Copy its signing secret (`whsec_…`) into Cloudflare as the secret **`RESEND_WEBHOOK_SECRET`** (Production). Without it the store still works; you just do not hear about a bounced download email.
6. **Scheduled background check** (`server/storeJobs.js`): it settles payments no webhook or return reported (a closed tab, a UPI app that never came back), retries download emails that failed to send, and picks up refunds made in Razorpay's dashboard. It already runs on its own at most every 10 minutes when someone uses the store or opens `/admin/orders`; a schedule makes it run when nobody does. Free option: cron-job.org → *Create cronjob*, URL `https://mykrutidev.com/api/store/reconcile`, every 10 minutes, *Advanced* → method **POST**, header `Authorization: Bearer <STORE_CRON_SECRET>`. The answer is counts only (`checked`, `settled`, `mailsSent`, `refunded`, …). If it settles a payment, you get one email (at most every 6 hours) saying the Razorpay webhook may not be arriving.
7. **Check**: open `/admin/orders` (signing in at `/admin/feedback` first). The *Setup check* lists what is connected and what is missing, and *Needs attention* says when the background check and each webhook last ran.

## Test before real money (Preview environment)

1. Pages → Settings → *Preview* environment: the same variables but with **test keys** (`rzp_test_…`), a test webhook, `STORE_TEST_PRODUCTS` = `1`, and the `STORE_FILES` (R2) and `DB` (D1) bindings. Variables and bindings only reach a build that starts after they were saved, so push a commit to the branch (or retry the *preview* deployment, never the Production one) after changing them.
2. Upload any one-page PDF to the bucket as `test-sample.pdf`.
3. Open `/store/sample-test` on the preview URL: it sells the ₹1 sample. Pay with Razorpay's test UPI/card, watch the order turn *paid* in `/admin/orders`, download the file, then mark it refunded and see the download close.

**Seeing the store on a preview.** A build on a Cloudflare branch preview (`CF_PAGES_BRANCH` set and not `main`) treats `test` products as listed: the header gets a *Store* link, `/store` lists them, and their pages are full pages. The ₹1 sample has `unlisted: true`, so it keeps a noindex page and stays out of the list. Production (`main`) and CI builds are unchanged until a product is `live`.

`STORE_TEST_PRODUCTS` must **not** be set in Production: the sample product is only sold where it is `1`.

## Adding a real product

1. Make the PDF. Upload it to the bucket, e.g. `ebooks/ssc-chsl-typing-mock-tests.pdf`.
2. Add an entry to `PRODUCTS` in `src/lib/store.js` with `status: 'live'`, its `pricePaise` (₹199 → `19900`), `file`, `fileName`, `pages`.
3. Add `pages["/store/<id>"]` (nav, h1, title, description, lede, body) to every `src/i18n/<lang>.json` (and the matching `i18n-drafts/`).
4. Fill `src/lib/business.js` (name and address, the same as on the Razorpay KYC; the phone is optional and is not printed while empty). A test fails while a product is live and the name or address is empty.
5. `npm test`, build, merge. The store page, the product page and the sitemap entries appear by themselves; with nothing live they stay `noindex` and out of the sitemap.

Changing a price or a file later: edit `src/lib/store.js`. Already-created orders keep the amount they were created with.

## The products so far

| id | price | file in the bucket | status |
| --- | --- | --- | --- |
| `kruti-dev-7-day-starter` | ₹39 | `kruti-dev-7-day-starter.pdf` (32 pages, prepared for stamping) | live |

The 30 practice passages are NOT sold: they are a free page (`/hindi-typing-practice-passages`) and a free PDF in `public/downloads/`, because passages like these are free elsewhere and the book's value is in the keys and layout, which work better as free content. The data is `src/lib/practicePassages.js`.

## Product pictures ("Look inside")

A product's `images` in `src/lib/store.js` name three files in `public/store-img/`: the cover, one inside page shown free (`openPage`), and a later page **blurred in the file itself** with a lock on top. Make them from the PDF that is sold (`pdftoppm -r 110`, then 640 px wide WebP), never from a review copy. The blur must be in the image: a CSS blur would still ship the readable page.

Changing a Preview secret (for example `ADMIN_KEY`) also needs a new build before it applies.

Preview bindings needed: D1 `DB` (the feedback database) and R2 `STORE_FILES` (the private store bucket).

## Rules the code enforces

* **Price and file never come from the browser.** The request names a product id, nothing else.
* **Paid means Razorpay says so, exactly.** A payment link counts only when Razorpay's API, asked with our secret key, answers `status: paid` with our order id as `reference_id`, currency `INR`, and `amount` and `amount_paid` both equal to the order's amount. A missing field is a "no". A declined or fake card never reaches `paid`: Razorpay itself refuses it, and nothing the browser or a callback says can unlock a file.
* **No test keys on the live site.** On `mykrutidev.com` the store refuses every sale while the keys are `rzp_test_…` (anyone could otherwise "pay" with Razorpay's published test cards and get the real file), and never sells a `test` product even if `STORE_TEST_PRODUCTS` is set. `/admin/orders` shows this as *Not ready*.
* **Paid is decided once**: `UPDATE … WHERE status='created' RETURNING *`, so two racing webhook/return calls cannot both send the emails.
* **Downloads** are POST-only (a mail scanner opening the link cannot use one up) and counted in a single `UPDATE` that also checks paid, not refunded, not expired, under the limit (`STORE.maxDownloads`, `STORE.downloadDays`). One download is a **session** of `STORE.sessionMinutes` (15): taps, retries and a phone's re-requests within it count once. The file is prepared before anything is counted, so a missing file or an error never costs a download.
* **Three keys per order**, none stored (HMACs of `STORE_TOKEN_SECRET`, `server/storeApi.js`):
  * the **checkout secret** (`claim`): made at checkout, only its SHA-256 is kept. The paying browser keeps it (`mkd-pending`) and, with it or with Razorpay's **signed return** (`razorpay_signature`, checked with the key secret), gets the other two. Knowing an order id alone gets nothing: `/api/store/confirm` answers `locked`.
  * the **download key** (`t`, in the link). It moves to a new version (`token_ver`) when the email is changed, by the buyer or by you, so a link sent to a wrong address stops working.
  * the **management key** (`m`): only the browser that paid has it, and only it can correct the email. A link from an email (or a forwarded one) cannot.
* **One Pay, one payment page**: a second Pay from the same browser within the link's life reuses the open order and Razorpay page (`resume`), so a worried buyer does not pay twice. *Buy another copy* starts a new one.
* **Back from Razorpay** the thanks page asks every 4 s for a minute, then every 20 s for 10 more minutes, saying plainly not to pay again. The product page also shows "payment in progress, do not pay again" for a payment started there and not yet confirmed (up to 3 days).
* **On the buyer's device** the thanks page keeps that order's keys in local storage (`mkd-bought`, `src/lib/storeClient.js`), and the product page then shows *Download my PDF again* above the buy form, or why it closed (refunded, expired, used up). *Forget this purchase on this device* removes it. Another browser or device needs the emailed link or the saved recovery card.
* **Receipt and recovery card**: the thanks page shows the receipt (order number, amount, date in India time, Razorpay payment id, refund) and saves it as a text file with the download link, the buyer's copy when they gave no email.
* **Audit trail**: every owner action, email change, refund seen and payment settled by the background check is written to `store_audit` (no keys), shown at the bottom of `/admin/orders`.
* **Provider events** are taken once: a Razorpay or Resend event delivered twice (same event id) does nothing the second time. Refunds add up, using Razorpay's running total; only a full refund closes the downloads, a partial one is listed under *Needs attention*.
* **`/admin`** on its own redirects to `/admin/orders` (`public/_redirects`); both admin pages ask for `ADMIN_KEY`.
* **The link** is `/store/thanks#o=<order>&t=<HMAC>`: the token is in the fragment, so it is never sent to a server or in a Referer, and `src/lib/analytics.js` also strips the query from what Google Analytics sees on that page.
* **Refunds**: no refund once a working file has been delivered. The 7 days (`STORE.refundDays`) are the time a buyer has to report a failed download, a double payment or a file that will not open, which we can check ourselves. Refund in Razorpay's dashboard; the `refund.processed` webhook (or the background check) closes the downloads for a full refund. *Close access (refund done in Razorpay)* in `/admin/orders` does the same by hand; it does not move any money.
* **Email is optional.** With one, the link is emailed; without one, the buyer downloads from the page Razorpay sends them back to, and that page says to save its link (with a Copy link button). `/admin/orders` shows every paid order's download link, so you can send it yourself to a buyer who gave no email and lost the page. Ask them for the order number or the Razorpay payment ID.
* **Privacy**: an order keeps only email, product, amount and Razorpay ids. Orders nobody paid are deleted after `STORE.unpaidDays`.

## Stamping (each buyer's copy carries their name)

A product with `stamp: true` is served with the buyer's stamp at the foot of every page: `Licensed to ab***@gmail.com - Order o... - mykrutidev.com` (or `Licensed copy - Order ...` when no email was given). It is a mark that lets a leaked copy be traced to an order. It does **not** stop sharing and is easy to remove by someone determined: it is a deterrent, not copy protection.

How it stays cheap: opening and re-saving a PDF in the Function takes 50 to 130 ms of CPU, far over what the free plan allows (about 10 ms). So the work is done once, beforehand:

1. Make the finished PDF, then run `node scripts/prepare-store-pdf.mjs book.pdf book-prepared.pdf`. It adds a fixed-length placeholder line to every page.
2. Upload **`book-prepared.pdf`** to the R2 bucket under the product's `file` key.
3. At download, `server/storeStamp.js` overwrites the placeholder bytes with the buyer's stamp: the file does not change size, nothing is parsed (about 1 to 2 ms for a 30-page, 900 KB PDF).

If the file in the bucket was not prepared, the download still works but is served without a stamp, and `store file has no stamp slot` is logged. Check the Function's logs on the preview after the first test purchase.

## /admin/orders

Sign in at `/admin/feedback` first (the same `ADMIN_KEY`). The page shows, top to bottom:

1. **Ready or not**: green when this deployment can take payments; otherwise each reason in red (missing key, webhook secret or bucket, a product on sale whose PDF is not uploaded, test keys on the live site, nothing on sale). Warnings (no bot check, live keys on a preview, `STORE_TEST_PRODUCTS` on the live site) are listed under it.
   **Needs attention**: paid orders whose email bounced, was marked as spam, failed or has no report after 30 minutes; the same email or phone paying twice for one product (a double payment to refund?); partial refunds; a background check that has not run for an hour. Under it, when the background check, the Razorpay webhook and the Resend webhook last ran, and **Run checks now**.
2. **Live orders / Test orders** tabs. Each order records the mode of the Razorpay keys that made it (`mode`: `live` or `test`; orders from before the column count as test). Preview and live share one database, so test purchases land here too, but they are only ever on the Test tab and never in the live totals. The page opens on the tab of this deployment's keys.
3. **Money in**: today, last 7 days, last 30 days and all time (India time, paid orders of the open tab only), then paid / refunded / started-not-paid / email-not-delivered (failed, bounced or marked as spam) counts.
4. **By product**: price, status, paid, money in and refunds per product.
5. **Orders**: filter by status and product, search an order id, a `pay_…` id or part of an email; 50 a page. A payment id links to that payment in Razorpay's dashboard. Each paid order shows the buyer's **phone** (from Razorpay) with **WhatsApp हिंदी / WhatsApp English** buttons: WhatsApp opens with the message typed in and the download link in it (a "thank you" message, or, after a bounce, "your email looks wrong"). The **Mail** column says `sent`, `delivered` (green) or `bounced` / `complained` / `failed` (red). An email changed by the buyer or by you shows the old address under it. Actions: *Check payment*, *Download link*, *Resend email*, *Change email & send* (puts the right address on the order and sends a new link there; the old link stops working), *+30 days* (the date only), *Reset downloads* (a fresh set, the date stays), and *Close access (refund done in Razorpay)* (the "sure" box must be ticked). After each one the page says what it did, and the audit trail records it.
6. **Setup check** (folded): every setting, ✓ or ✗.
7. **Audit trail** (folded): the last 50 actions and events.

Admin security: the session cookie is `SameSite=Strict`, every form post must come from the same site, and wrong keys count against a per-IP limit. For a second factor, put `/admin/*` behind **Cloudflare Access** (Zero Trust → Access → Applications → *Self-hosted*, path `/admin`, policy: your email, one-time PIN): free for one user, and nothing in the code changes.

## Reaching a buyer whose email is wrong

* **Your emails** (English): every sale, every bounce or spam complaint, and every email a buyer corrects comes to `NOTIFY_TO`, with the buyer's phone and the two WhatsApp buttons (not on the correction note). A tap on a button opens WhatsApp with the message ready; you press Send.
* **The buyer** sees on their download page where the link was emailed. They can correct the address **once**, within `STORE.emailChangeHours` (24) of paying, or at any time after a bounce (`POST /api/store/email`, allowed only with the management key that only the paying browser holds). The new address gets a new link with the same downloads left (the old link stops working), so a changed address is never another copy; the old address is kept (`email_prev`) and you are told.
* **Lost link** (another phone or browser): the product page has one line, "Already bought? Get your download link", to the thanks page, whose form (`POST /api/store/find`) emails the links of that address's paid, unexpired orders to that address only (never on the page). The page says plainly what happened: sent, no paid purchase with this email, or a purchase whose link has closed (expired, used up or refunded). One address gets at most `STORE.findPerDay` (3) such emails a day.
* **Refund claims**: the order keeps the downloads count, whether the email was delivered, and any address change with who made it and when. A delivered email plus a used download means the file was delivered (the refund policy covers failed delivery, not a change of mind).

## Before the first sale

* Razorpay KYC is approved and the site's `/contact`, `/terms`, `/privacy-policy`, `/refund-policy` and `/delivery-policy` are live (Razorpay asks for them).
* The first end-to-end payment was made in test mode on the preview: pay with a Razorpay test card that succeeds (the order turns *Paid* in `/admin/orders`, the file downloads, the email arrives), then with one of Razorpay's failing test cards (it stays *Started, not paid*, nothing downloads). Razorpay lists its test cards and UPI ids in its docs (Payments → Test card details).
* A ₹ live payment of the cheapest product was made by you and refunded by you, to see the whole path once with real keys.
* Income tax (and GST above the threshold) can apply to digital sales even for a sole proprietor: check with a CA.

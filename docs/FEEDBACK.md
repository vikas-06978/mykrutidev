# Feedback widget

A small "Feedback" / "सुझाव" button at the bottom-right of every page. It opens
a four-step panel **only when clicked**: a rating, what was used, what to add
next, and an optional message and email. No sign-up.

| Piece | File |
|---|---|
| Button + panel markup (all words from `src/i18n/*.json` → `feedback`) | `src/components/Feedback.astro` |
| Panel script, loaded on idle or on first click | `src/scripts/feedback.js` |
| Options, validation, schema, CSV (shared by all of the below) | `src/lib/feedback.js` |
| `POST /api/feedback` (and `GET` for the Turnstile site key) | `functions/api/feedback.js` → `server/feedbackApi.js` |
| `/admin/feedback` (private dashboard + CSV) | `functions/admin/feedback.js` → `server/feedbackAdmin.js` |
| D1 schema | `db/feedback.sql` |
| Privacy Policy page | `/privacy-policy` (`src/i18n/*.json` → `pages./privacy-policy`) |

## What is stored

One row per submission in the D1 table `feedback`: `id, created_at, rating,
used, wants, bug_text, message, email, page, lang, theme, device, width,
browser` (`used` and `wants` are JSON arrays of option ids).

The ToolMitra links page (`/links`, `src/components/LinksPage.astro`) has a
"which tool should we build next?" form. It posts to `/api/tool-request`
(`functions/api/tool-request.js` → `handleToolRequest` in
`server/feedbackApi.js`), with the same checks and its own rate-limit count.
One row per request in `tool_requests`: `id, created_at, idea, details, email,
lang, device`. They are listed on `/admin/feedback` under the feedback, with a
**Tool requests CSV** download. The table is created on first use, so there
is nothing to run for it.

Never stored or sent: the text in any tool, uploaded files, the IP address, the
user-agent string. The server rejects any field it does not know.

Spam protection: Cloudflare Turnstile (invisible), a hidden honeypot field, and
5 submissions per IP per hour. The rate limit keeps only
`SHA-256(salt | hour | IP)` in `feedback_rate`, deleted once the hour is over.

## Cloudflare setup (once)

Run from the repository root. `wrangler` is a dev dependency (`npm ci`).

1. **Log in**

   ```sh
   npx wrangler login
   ```

2. **Create the D1 database**

   ```sh
   npx wrangler d1 create mykrutidev-feedback
   ```

3. **Create the tables** (safe to re-run; the Function also creates them if missing)

   ```sh
   npx wrangler d1 execute mykrutidev-feedback --remote --file=db/feedback.sql
   ```

4. **Bind the database to the Pages project.** Dashboard → Workers & Pages →
   your Pages project → Settings → Bindings → Add → **D1 database**:
   variable name `DB`, database `mykrutidev-feedback`. Add it for Production
   (and Preview, if you want previews to accept feedback).

5. **Create the Turnstile widget.** Dashboard → Turnstile → **Add widget**:
   - Widget name: `MyKrutiDev feedback`
   - Hostnames: `mykrutidev.com` (add `www.mykrutidev.com` and your
     `*.pages.dev` preview host if you use them)
   - Widget mode: **Invisible**

   Copy the **Site Key** and the **Secret Key**.

6. **Add the variables.** Pages project → Settings → Variables and Secrets:

   | Name | Type | Value |
   |---|---|---|
   | `TURNSTILE_SITE_KEY` | Text | the Turnstile Site Key |
   | `TURNSTILE_SECRET_KEY` | Secret | the Turnstile Secret Key |
   | `ADMIN_KEY` | Secret | a long random string (16+ characters), e.g. `openssl rand -base64 32` |
   | `RATE_LIMIT_SALT` | Secret | optional; another random string (defaults to `ADMIN_KEY`) |

   While `TURNSTILE_SECRET_KEY` is not set, submissions are accepted without a
   Turnstile check (honeypot and rate limit still apply).

7. **Redeploy** (bindings and variables apply from the next deployment).

8. **Read feedback** at `https://mykrutidev.com/admin/feedback`: enter
   `ADMIN_KEY` once (an 8-hour session cookie is set). It shows totals per
   rating, the top requests as a bar chart, the latest 50 messages, and
   **Download CSV**. It is not in the sitemap and every response is `noindex`.
   From a script: `curl -H "Authorization: Bearer $ADMIN_KEY" "https://mykrutidev.com/admin/feedback?format=csv"`.

## Email to the owner (optional)

Each saved feedback and each tool request can also be emailed to the owner,
through [Resend](https://resend.com) (`server/notify.js`). It is off until all
three of these are set in Pages -> Settings -> Variables and Secrets:

| Name | Type | Value |
|---|---|---|
| `RESEND_API_KEY` | Secret | an API key from resend.com |
| `NOTIFY_TO` | Text | where the mail goes, e.g. `you@gmail.com` (comma separated for more) |
| `NOTIFY_FROM` | Text | `MyKrutiDev <contact@mykrutidev.com>`, an address on the domain verified in Resend |

Setup: create a Resend account, **Domains -> Add domain** `mykrutidev.com`,
add the DNS records it lists in Cloudflare (it uses a `send.` subdomain, so
Email Routing keeps working), wait for **Verified**, then **API Keys -> Create**
(sending access only) and redeploy.

The mail is plain text. The visitor's email, when given, is the Reply-To, so
replying goes straight to them. The subject never contains visitor-written text.
The mail is sent after the row is saved, through `waitUntil`, so a Resend
outage or a wrong key never fails or slows a submission (it only logs in
Cloudflare). Nothing is sent that is not already in the database.

The privacy policy says this, in every language: change it there too if the
provider ever changes.

## Local development

- `astro dev` has no API: pressing Send logs the feedback to the browser
  console and still shows "Thank you".
- The full thing, with a local D1 database:

  ```sh
  echo "ADMIN_KEY=local-admin-key-0123456789" > .dev.vars
  npm run preview:cf        # builds, then wrangler pages dev on http://localhost:8788
  ```

## Tests

- `npm test` — validation and CSV (`src/lib/feedback.test.js`), and the API and
  admin page against a local D1 (`server/feedback.test.js`).
- `npm run test:functions` — bundles `functions/` the way Cloudflare Pages does
  (wrangler 3, esbuild 0.17) and with the current wrangler. That bundler cannot
  parse import attributes (`with { type: 'json' }`), so Functions code never
  imports JSON: the admin page's labels are generated into `server/adminLabels.js`
  by `npm run admin-labels`, and `server/functions-bundle.test.js` checks both.
- `npm run test:dist` (after a build) — markup on every page, sitemap, and the
  whole stack through `wrangler pages dev` (`tests/feedback-pages.test.js`).
- `npx playwright test e2e/feedback.spec.js` (after a build) — opens only on
  click, Esc/✕, keyboard-only flow, both languages, no overlap with Copy /
  Download / keys at 390×844 and 1366×768, CLS 0.

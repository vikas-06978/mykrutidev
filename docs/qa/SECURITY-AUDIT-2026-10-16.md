# Local security and quality audit, 16 October 2026

Baseline: `d36feb88a5de7c83e1a46708d6912f5fc640c92e`. This report was written before application changes. Evidence line numbers refer to that baseline. No requests, attacks, purchases or load tests were made against the live site. Review and local tests cannot establish the state of production bindings or provider dashboards.

## Findings

| ID / severity | Evidence | Realistic scenario and verification | Smallest fix | Risk and disposition |
| --- | --- | --- | --- | --- |
| A01 / Medium | `server/storeApi.js:162`, `:700`, `:942` | A misdelivered download key is validated, then an email correction rotates `token_ver` while R2 prepares the file. The final download UPDATE rechecks status and expiry but not the key version. A local real-D1 reproduction rotated the version inside the R2 read and still received HTTP 200 with downloads incremented. | Require the validated version in the final atomic UPDATE. | Low. A download racing revocation is refused without consuming a session. Normal downloads, limits and schema stay intact. Fixed in `2e78750`, with two regression cases. |
| A02 / Medium | `server/storeJobs.js:72` | Production and preview share a database. Unlike settlement and refund queries, failed-mail retries have no mode filter. A local test-mode failed order was retried and emailed by a live-mode reconciliation run. It can send a test link that the production signing secret cannot validate and consume the real mail account. | Filter mail retries by the current mode, using the existing legacy NULL-as-test convention. | Low. The matching deployment remains responsible for its mail retries. Fixed in `edb3ac4`, with a regression test for both directions and legacy rows. |
| A03 / Low | `server/feedbackApi.js:134`, `server/storeApi.js:241`, `:573`, `:810`, `:889` | JSON and webhook size limits are checked after reading the entire body. Download form parsing has no explicit byte limit. A caller can make the runtime buffer more than the application's stated limit before refusal. Worker memory exhaustion or billing impact is **not verified**. | A shared bounded stream reader and explicit form limits. | Deferred. This crosses every request parser and needs Cloudflare stream and multipart compatibility tests. No unverified denial-of-service claim or arbitrary new limit is introduced. |
| A04 / Low | `src/lib/docConvert.js:746`, `src/lib/sheetConvert.js:357` | Both Office importers synchronously inflate all ZIP entries. The upload limit bounds compressed bytes, not expanded bytes. A hostile file selected by a visitor can expand substantially and freeze their tab. No server upload or XML external-entity fetch was found. A browser crash is **not verified**. | Bound expanded bytes and entry count before allocation, including forged ZIP metadata handling. | Deferred. Limits and streaming changes can reject legitimate documents or alter preservation of untouched parts. Requires a dedicated archive-hardening change. Conversion mappings are untouched. |
| A05 / Medium | `server/storeApi.js:773`, `docs/STORE.md:146`, privacy policy in `src/i18n/en.json` | The find form distinguishes no purchase, a closed purchase and an active purchase. This discloses whether an address bought here. It is explicitly requested and documented behavior, rather than an accidental token disclosure. IP and address limits and optional Turnstile reduce abuse. | A uniform recovery response if the owner chooses to change this behavior. | Deferred. Changing this would alter existing text and a deliberate recovery flow. It requires an owner decision and all seven translations. Links are only emailed to the submitted address. |
| A06 / High upstream advisory, application exploitability not verified | `package-lock.json:6453`, `node_modules/@indic-transliteration/sanscript/package.json:118` | `npm audit` reports `toml@2.3.6`, GHSA-82x6-q7mm-w9cf and GHSA-v5mp-jgw5-2x6j, inherited through Sanscript. The shipped `sanscript.js` entry contains no TOML parser import or parse call. No route from a user's input to that parser was found. | An upstream compatible release that removes or updates this dependency, followed by transliteration validation. | Deferred. npm reports no automatic fix. Forcing a major TOML override or replacing the transliteration library is not justified without a reachable application exploit and compatibility evidence. |

No verified Critical or High application vulnerability was found in this review. This is not a guarantee that none exists.

## Additional findings from validation

| ID / severity | Evidence | Realistic scenario and verification | Smallest fix | Risk and disposition |
| --- | --- | --- | --- | --- |
| A07 / Low | `e2e/tools.spec.js:129`, `:136`, `src/components/Converter.astro:596`, `:653` | The test waits for any nonempty output, then immediately reads its value for a strict equality check. Conversion output is debounced. The full run read intermediate prefixes on the Punjabi and Tamil Abbasi Chanakya-to-Kruti Dev pages. Both unchanged assertions passed on an isolated single-worker rerun after the full suite. This does not demonstrate a mapping defect. | Await the complete expected value rather than merely nonempty output, keeping the equality assertion intact. | Deferred under the instruction to fix only Critical, High and clearly safe Medium findings. No test assertion or converter code was changed. |
| A08 / Low | `e2e/security.spec.js:126` | The test assumes that a blocked iframe contains no h1. Chromium 154 instead renders a local-network blocking error page with its own h1 when about:blank frames localhost. The snapshot shows the browser error, not the app. A separate cross-origin parent served locally exercised the actual CSP and confirmed a frame-ancestors refusal with no converter rendered. The existing sweep also passed for all 896 built pages without a CSP violation. | Serve the cross-origin parent locally and assert actual CSP refusal, distinguishing browser error markup from application rendering. Recheck with Playwright's pinned browser when its download is available. | Deferred. This is a test/runtime compatibility issue, not evidence of a missing frame restriction. The existing test and security headers are unchanged. |

## Already done well, do not change

- Admin sessions expire on the server, rotate with ADMIN_KEY and use Secure, HttpOnly, SameSite=Strict cookies. Secret comparisons hash both inputs before comparing fixed-length digests. Login and invalid Bearer attempts share the D1 rate limit. Order mutations require authentication and a same-site origin check. Admin HTML is escaped, script execution is prohibited by CSP, responses are no-store and noindex.
- Prices and products come from the catalog. Settlement asks Razorpay for the payment and checks reference, currency, amount and amount paid. Atomic created-to-paid settlement prevents duplicate settlement mail. Test keys and test products are refused on the live host. Checkout claims, management keys and versioned download keys have separate purposes.
- Razorpay raw bodies are HMAC-verified. Resend verifies the Svix signature and timestamp. Provider event IDs are deduplicated. Refund totals are monotonic, and paid/refunded state is checked again during download grants. Duplicate events, partial refunds and reconciliation already have local tests.
- Downloads prepare the file before consuming a session and use one conditional D1 UPDATE for session accounting. File names come from the catalog. R2 keys never come from the caller. Missing files do not consume a download. PDFs and token responses use no-store. Download and management keys are excluded from exported order columns.
- SQL values are bound, dynamic SQL fragments come from fixed application lists, admin/email HTML is escaped and CSV formula prefixes are neutralized. Mail subjects strip controls and user emails are validated. Payment redirects accept only HTTPS Razorpay hosts. Provider calls use fixed HTTPS endpoints and encoded resource identifiers. No caller-controlled fetch destination was found.
- All public Function routes were reviewed for allowed methods and auth or abuse controls: feedback, tool-request, checkout, confirm, order, email, find, download, both webhooks and reconcile. Webhooks rely on provider signatures rather than browser credentials. Reconcile requires an admin or scheduler secret. Turnstile remains optional by existing configuration.
- Converter files and tutor text are processed locally. Store and feedback requests use their own form data, never converter text. The explicitly documented Hinglish exception asks Google's input-tools service for spelling, while Exact mode is offline. Analytics events use allowlisted metadata rather than tool text. The thanks-page analytics location strips purchase query and fragment data.
- DOM review found validated order/key parsing and textContent-based store rendering. Local storage deliberately keeps converter drafts, recent text, tutor progress and purchase recovery keys, with documented removal controls. The service worker excludes /api and /admin and only handles same-origin GET requests. XML scanning does not resolve external entities.
- Static security headers are generated by `src/security/integration.mjs`, rather than a source `public/_headers`: inline-script hashes, HSTS, frame restrictions, nosniff and an explicit CSP. Admin Functions provide their own restrictive headers. Sensitive order URLs are noindex and tokens use fragments or POST bodies. Browser store tests exercise mobile recovery and download behavior.
- The schema migration creates tables, adds missing columns, then creates indexes. Existing schema parity tests cover STORE_SCHEMA and db/store.sql. No schema change is needed for A01 or A02.
- Current policy discloses buyer phone collection, previous email, local purchase keys, PDF stamping, providers and retention. Unpaid order cleanup is traffic-triggered. Paid-order and feedback deletion processes and production log retention cannot be verified from source.

## Changes made

- `server/storeApi.js`: require the validated download key version in the same D1 statement that grants or reuses a session. This closes A01 without changing the download policy.
- `server/storeJobs.js`: scope failed-mail retries to the deployment's payment mode. This closes A02 without changing retry timing or legacy NULL-as-test handling.
- `server/store.test.js`: add three regression cases. Each new regression failed before its fix and passed afterward. The full unit suite passes with 2,413 tests.

No Cloudflare, Razorpay or Resend dashboard change is required by these fixes. No schema, catalog, price, limit, page design, user-facing string, mapping, tutor logic, dependency declaration or lockfile was changed. Build-generated public assets were restored and are excluded from the branch.

## Limits and remaining checks

- Credential-pattern scans of current tracked text and historical diffs across available local Git refs found no private-key blocks, common GitHub/AWS credentials or long live Razorpay/Stripe key patterns. This is not proof that every possible secret format or binary credential is absent. No credential values were printed.
- CI uses version tags for actions and declares no explicit token permissions. Actual default permissions and branch protection are **not verified**. Recommend read-only repository defaults in GitHub settings. No speculative workflow change was made.
- Reconciliation batches orders and refunds, but one run can perform many database operations, mail calls and provider reads. Plan-specific Cloudflare CPU/subrequest limits, maximum PDF size, dashboard access, R2 privacy, Turnstile configuration and production scheduled jobs are **not verified**. No production limit or readiness claim is made.
- Git read access works. GitHub API access currently returns Forbidden, despite an injected authentication binding. No additional token was requested and no credential was exposed. This may block PR creation after local validation.
- Existing tests were not deleted, skipped or weakened by this branch. Built-in conditional skips remain distinct from passing checks.


## Final validation

Commands ran in `/workspace/mykrutidev` after sourcing the workspace cache configuration. Node was v24.19.0 and npm was 11.9.0. Browser checks and asset generation used the machine's Chromium 154.0.8037.57 through a workspace browser path. Playwright's expected Chromium 153 download was blocked by the network proxy. The default Playwright configuration was used for the complete suite, with four workers and no test filter. The existing CI fixture `PUBLIC_UPI_ID` was supplied for build and built-site checks.

| Required command | Result |
| --- | --- |
| `npm ci` | PASS, 385 packages installed with the lockfile unchanged |
| `npm test` | PASS, 2,413 passed, zero failed or skipped |
| `npm run test:functions` | PASS, Wrangler 4.149.0 and 3.114.17 both compiled the Functions |
| `npm run build` | PASS, including PDF generation, share-image generation and 24 passing SEO tests |
| `CI=true npm run test:dist` | PASS, 101 passed, zero failed, three existing conditional skips for the inverse UPI setting and unconfigured advertising variants |
| `npx playwright test --workers=4` | FAIL, 1,709 passed, 288 built-in skips, three failed, 42.6 minutes. All 2,000 selected cases reached an outcome. |

The full browser run's failures were the desktop iframe test at `e2e/security.spec.js:126` and the Punjabi and Tamil Abbasi Chanakya-to-Kruti Dev comparisons at `e2e/tools.spec.js:136`. See A07 and A08. The unchanged two converter tests subsequently both passed with one worker in 6.9 seconds. That rerun does not turn the failed full-suite result into a pass. All 896 built pages passed the existing CSP navigation sweep. A separate local cross-origin framing probe observed an actual frame-ancestors refusal and no application converter in the frame.

The new A01 regression cases both failed before the fix with HTTP 200 instead of 410, then both passed. The new A02 regression failed before the fix because the other mode retried one mail, then passed for live, test and legacy NULL modes.

`npm audit --json` reports two High affected-package entries through the TOML advisories described in A06. No automatic dependency fix was applied. Credential-pattern checks of current tracked text and available local Git history returned no matches for the checked patterns.

## Review and PR status

The required browser gate is failing, so no PR was opened. No merge or push to main was attempted. The audit report was committed before either application fix, and A01 and A02 each have their own small commit. A prepared PR description is retained outside the checkout at `/workspace/.cloud-setup/AUDIT-PR-DESCRIPTION.md` for use after the gate is resolved.

Git push access works, but a fresh GitHub API read still fails with a proxy CONNECT 403 for `api.github.com`. To complete the workflow, allow that host for PR API access and `cdn.playwright.dev` for the pinned-browser installation, then recheck the affected operations. Existing authentication should be reused. The Low test findings remain unfixed under the requested severity restriction. The browser gate must pass before opening the PR.

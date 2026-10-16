# Final local security and quality audit, 16 October 2026

**Final result:** the required local checks pass with the official pinned Playwright browser. Two verified server issues were fixed. The complete final browser run passed 1,712 cases with zero failures and 288 existing conditional skips. Main branch protection requires owner action. Production-only settings outside the supplied screenshots remain explicitly unverified.

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
| A07 / Low | `e2e/tools.spec.js:129`, `:136`, `src/components/Converter.astro:596`, `:653` | The test waits for any nonempty output, then immediately reads its value for a strict equality check. Conversion output is debounced. The full run read intermediate prefixes on the Punjabi and Tamil Abbasi Chanakya-to-Kruti Dev pages. Both unchanged assertions passed on an isolated single-worker rerun after the initial suite and in the final complete pinned-browser run. This does not demonstrate a mapping defect. | Await the complete expected value rather than merely nonempty output, keeping the equality assertion intact. | Retained as a Low test-timing observation under the requested severity restriction. The final supported-browser run passed without changing any assertion or converter code. |
| A08 / Low | `e2e/security.spec.js:126` | The test assumes that a blocked iframe contains no h1. Chromium 154 instead renders a local-network blocking error page with its own h1 when about:blank frames localhost. The snapshot shows the browser error, not the app. A separate cross-origin parent served locally exercised the actual CSP and confirmed a frame-ancestors refusal with no converter rendered. The existing sweep also passed for all 896 built pages without a CSP violation. | Serve the cross-origin parent locally and assert actual CSP refusal, distinguishing browser error markup from application rendering. The official Chromium 153 is now installed, and the unchanged iframe check passed on its focused rerun. | Resolved for the supported browser environment by installing the official pinned Chromium. This was a test/runtime compatibility issue, not evidence of a missing frame restriction. The existing test and security headers are unchanged. |

## Dashboard evidence supplied by the owner

The following checks were added after the owner supplied three dashboard screenshots on 16 October 2026. Screenshots establish what is displayed, rather than proving backend connectivity, saved permissions or all deployment scopes.

| Check | Evidence and result | Remaining action or limit |
| --- | --- | --- |
| GitHub Actions default token permission | The Workflow permissions screenshot shows **Read repository contents and packages permissions** selected. This is the appropriate restrictive default for the current test workflow. | The integration cannot read this administration setting through the API, which returns 403. Keep this selection saved. |
| Actions creating and approving PRs | The same screenshot shows **Allow GitHub Actions to create and approve pull requests** checked. The current `test.yml` does not create or approve PRs. | Optional hardening: uncheck this if no other trusted Actions workflow needs it. This setting is separate from Codex's GitHub integration access. |
| Main branch protection | The screenshot says classic branch protections have not been configured. A fresh successful `GET /repos/vikas-06978/mykrutidev/rules/branches/main` returned `[]`, so no active matching ruleset rules were returned either. | See A09. The integration cannot read the separate classic-protection administration endpoint. |
| Cloudflare D1 binding | The bindings screenshot shows `DB` pointing to `mykrutidev-feedback`. The binding name matches the handlers. | Actual production DB connectivity and deployment scope were not tested. |
| Cloudflare R2 binding | The screenshot shows `STORE_FILES` pointing to `mykrutidev-store`. The binding name matches the download handler. | This does not establish that the bucket is private, that the paid PDF exists, or that Production and Preview scopes are configured correctly. |

| ID / severity | Evidence | Realistic scenario and verification | Smallest fix | Risk and disposition |
| --- | --- | --- | --- | --- |
| A09 / Medium, repository configuration | Owner's Branch protection rules screenshot, plus the successful effective-rules API response `[]` for `main` | The provided evidence shows no classic protection and no active matching ruleset rules. A writer can bypass the intended PR/check review process, allowing a mistaken direct change onto the deployment branch. No bypass or force push was attempted. | Have the owner enforce a ruleset for `main` requiring pull requests and the existing test status check, blocking force pushes and deletion. Consider bypass permissions explicitly. | Owner action. Enforcing rules can affect collaborator access and merges, so no repository settings were changed. Repository source and GitHub integration permissions were left intact. |

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
- CI uses version tags for actions and declares no explicit token permissions. The owner supplied evidence of the selected read-only default and absent classic protection. The active-rules API returned no matching ruleset rules for main. See the dashboard evidence and A09 for the precise limits. No workflow or repository settings were changed.
- Reconciliation batches orders and refunds, but one run can perform many database operations, mail calls and provider reads. Plan-specific Cloudflare CPU/subrequest limits, maximum PDF size, dashboard access, R2 privacy, Turnstile configuration and production scheduled jobs are **not verified**. No production limit or readiness claim is made.
- Ordinary repository API access now works with the existing authentication. Direct HTTPS Git access to github.com currently receives a proxy CONNECT 403 under the updated network settings. Administration endpoints for workflow permissions and classic branch protection still return Resource not accessible by integration. No additional token was requested and no credential was exposed.
- Existing tests were not deleted, skipped or weakened by this branch. Built-in conditional skips remain distinct from passing checks.


## Initial validation with system Chromium 154

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

## Final validation with official pinned Chromium 153

Browser download access was restored. `npx playwright install chromium` successfully installed the official Chrome for Testing and Chrome Headless Shell 153.0.8010.12, Playwright revision 1243, plus FFmpeg. These are real downloaded browser binaries in a separate workspace cache, rather than the earlier system-browser substitutes.

The three previously failing checks first passed unchanged on a focused run, three passed in 6.2 seconds. Then the entire unfiltered desktop/mobile suite passed with the default repository configuration and four workers. The final command was:

```sh
cd /workspace/mykrutidev
source /workspace/.cloud-setup/env.sh
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cloud-setup/playwright-pinned
PUBLIC_UPI_ID=mykrutidev.test@upi npx playwright test --workers=4 --output /workspace/.cloud-setup/pinned-full-results
```

| Required command | Final result |
| --- | --- |
| `npm ci` | PASS, earlier validation of the same application source and unchanged lockfile |
| `npm test` | PASS, 2,413 passed, zero failed or skipped |
| `npm run test:functions` | PASS with Wrangler 4.149.0 and 3.114.17 |
| `npm run build` | PASS, including PDF/OG generation and 24 SEO checks |
| `CI=true npm run test:dist` | PASS, 101 passed, three existing configuration-dependent skips |
| `npx playwright test --workers=4` | PASS with the official pinned browser, 1,712 passed, zero failed, 288 existing conditional skips, 11.3 minutes |

All 2,000 selected browser cases reached an outcome. The final run included the iframe assertion, the two previously intermittent converter comparisons, all 896 built pages under the CSP sweep, mobile store recovery, downloads, accessibility, typing and converters. Existing assertions, retry settings and built-in skip conditions were unchanged. No application source, dependency or lockfile changed between the earlier passing non-browser commands and this final browser run. The earlier system-browser failure remains recorded above as historical evidence and is superseded for the browser gate by this complete supported-browser pass.

## Owner actions and evidence still outstanding

1. **Protect main, A09:** configure an enforced rule for `main` requiring PRs and the existing test status check, and block force pushes and deletion. Review bypass roles. No repository settings were changed by this audit.
2. **Optional Actions hardening:** disable Actions creating/approving PRs if no trusted workflow needs it. Keep the selected read-only token default.
3. **R2 privacy and objects:** the binding is shown, but bucket settings proving public development access and custom-domain access are disabled, and the paid object's existence/size, have not been supplied or tested.
4. **Production services:** Cloudflare plan/limits, Production versus Preview scope, variable/secret presence by name, Turnstile hostnames, scheduled reconciliation, and Razorpay/Resend webhook enablement and delivery history remain unverified without read-only dashboard evidence. Secret values are not needed for these configuration checks.
5. **Live behavior:** no live purchase, real customer email delivery, attack or load test was performed. These are separate from the verified local workflow. Provider settings must not be inferred from source or binding names alone.
6. **Deferred findings:** A03 through A07 retain their documented dispositions. The upstream TOML advisories are not resolved by passing tests. No dependency upgrade or existing product behavior was changed to hide them.

## Review status

The required local validation gate now passes. The report and two isolated server fixes are on the review branch `security/audit-verified-fixes`, with the application fixes in `2e78750` and `edb3ac4`. The initial audit report was committed before application changes. There was no merge or push to main.

Ordinary GitHub API access works with existing authentication. Direct Git HTTPS currently receives a proxy CONNECT 403 for github.com under the latest network settings. The GitHub API is available for publication, so no new credential is requested. For future native Git operations, restore the GitHub network destination or preset in environment settings. Administration endpoints remain inaccessible to the integration, and the owner's screenshots are identified separately from API-verified evidence.

The prepared PR description is retained outside the checkout at `/workspace/.cloud-setup/AUDIT-PR-DESCRIPTION.md`. It contains this audit report, both changes, validation results, owner dashboard actions and deferred findings. Repository settings and production configuration remain for owner review.

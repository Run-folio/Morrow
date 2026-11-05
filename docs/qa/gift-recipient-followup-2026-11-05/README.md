# Gift recipient privacy and email migration follow-up — 5 November 2026

Extends local JSON candidate `4543a235def801309908fb25993ec0d9015a5429`, based on staging `64adb5eb3de905604ba2ff73dddb0b7aee653bb1`. Staging was rechecked after qualification and remains at that base. No push, deployment, real account, email delivery, database connection or SQL execution occurred. Shaun's approval is still required for staging.

## Privacy assessment and fix

The previous mask disclosed the full recipient domain and up to two local-part characters to any token holder, including the entire local part for one- or two-character addresses. Length clues also remained. This was a material, unnecessary personal-data disclosure: forwarding a trip capability did not need to identify its intended recipient. No claim/authentication bypass was identified.

The existing recipient paragraph now renders only when the authenticated session email matches the invitation recipient (case-insensitively). Signed-out and other-account viewers receive no generated address hint, including expired invitations. Removed the mask helper entirely. Matching users may still see their own address; expired invitations still suppress claiming. Existing sign-in, wrong-account, expiration and shared trip/note content remain. The page remains `force-dynamic`.

Reused the existing page layout, recipient paragraph, account styles and claim component; added no control, visual pattern, CSS, breakpoint or shared component. This is conditional disclosure, not a new design. The previous JSON allowlist and no-store protections remain in the candidate.

## Verification through rendering and API boundaries

`tests/gift-page-privacy.test.ts` executes the actual async server page with real ReactDOM static rendering, React JSX, Next Link/notFound and Lucide components. Auth/repository edges and unrelated navigation/claim client leaves are synthetic. It inspects complete rendered HTML and props passed across the claim leaf boundary, rather than merely checking source strings.

- Page RED: **12 total, 4 passed, 8 failed** before the fix (`page-red.log`). Short, long, other-account, signed-out and expired cases reproduced the hints.
- Combined GREEN: **94/94 passed, zero skips** (`flow-green.log`). Includes page, actual NextResponse route, email, library gift/retry, private-session, analytics and replay tests.
- Matching account receives only the token prop at the claim boundary; other accounts receive no claim leaf. Null/unavailable previews use the actual framework 404 path. Public previews and unauthenticated claim rejection remain covered by the prior route tests.
- Full release gate: **exit 0; 666 total, 642 passed, 24 browser-only skips, zero failures**, including strict UI audit, both typechecks, production build and offline/client manifests (`release-gate.log`). Build ID `jJFvsEkVSIUaCKQoTC-jt`, 227 offline assets. This is the local composite patch built with the base `COMMIT_REF`, not a hosted revision claim.
- Independent review: no blocking findings; **57/57** relevant tests independently passed. It confirmed the material disclosure, corrected boundary, historical SQL identity/dependencies and preserved test safeguards.
- Final standalone typecheck and `git diff --check` pass.

This substantiates the local page-render/JSON/claim-delegation flow. It does **not** claim full Next.js Flight serialization, a running browser/server/session, CDN behavior, database enforcement or email delivery were verified end to end. Those remain hosted qualification work after deployment approval. Intentionally shared title, sender and note values are not content-redacted and can themselves contain sender-entered personal information.

## Missing migration: source recovery, not database repair

History identifies the cause: snapshot `effa3d99c838659f623a10b2edd3057299f3cac6` deleted migrations 0001–0017. The email test's `ENOENT` was reproduced (`email-red.log`). Restored these **byte-identical historical files** from `a803a757a538d432ce0bbe30ca7b0e315c7d81ed`:

- `0005_easyt_email_events.sql`: standalone email-events table, provider/created indexes. Git blob `a57a15bf8e9c5e78e478d4cefec865f96ab958e4`.
- `0014_morrovia_email_idempotency.sql`: nullable idempotency key and partial unique index; requires that email-events table. Git blob `190c10e6b3e9057412645284ec2d2a1b4ac06a40`.

Both are idempotent source statements and neither references other application tables. Checksums/provenance are recorded in `result.json`. No new schema design, migration numbering or SQL behavior was invented, and no statements were executed. No local PostgreSQL executable was available. Repository build scripts do not automatically apply these files.

Restoring the missing file exposed a second stale assertion in the same email test: random key generation moved from the dashboard into `use-trip-library-actions.ts`. The old assertion failure was reproduced against the old test with restored SQL (`email-stale-client-red.log`). The repaired assertion follows the current hook and verifies dashboard wiring plus the idempotency header. Existing key-reuse-on-retry behavior is also exercised by the actual hook tests; no guard was removed or skipped.

That broader hook suite exposed a stale extracted-callback harness, which lacked `renderScope` and `retainedEquivalentRef` (`flow-with-stale-library-harness.log`). Its test-only repair supplies those dependencies and adds rejection checks for retired scopes and retained acknowledgements. Product persistence code is unchanged.

## Actual remaining risk

- Live deployments are unchanged. The locally fixed disclosure remains wherever the old page/API is still deployed until an approved update.
- The **full migration chain remains incomplete**: fifteen historical migration sources are still absent. This focused restoration resolves the email source/test dependency, not a fresh-install or complete schema-recovery qualification.
- Actual deployed schema, duplicate-data compatibility and installed index definitions are unknown. `IF NOT EXISTS` does not prove compatibility with existing tables/indexes. SQL application needs a separate schema/data review and approval; this candidate must not trigger automatic repair of production data.
- Deployed cache/session/Flight behavior and real database/claim flow remain unverified. No blanket production-safety or complete privacy-elimination claim is made.

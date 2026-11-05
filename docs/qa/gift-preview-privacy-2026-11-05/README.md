# Gift-preview JSON privacy candidate — 5 November 2026

Local branch: `codex/gift-preview-privacy-20261105`. Base: **`64adb5eb3de905604ba2ff73dddb0b7aee653bb1`**, verified against GitHub staging before work and again after qualification. No push, deployment or other external write was performed. Staging requires Shaun's approval.

## Reconciliation and scope

The inventory `/tmp/morrovia-local-inventory.json` identified an unfinished patch in `/Users/shaun/Documents/Codex/2026-11-03/task-3/staging-security-review` (and its earlier `security-worktree`). Those original workspaces remain untouched. Their patch combines a gift-route allowlist with analytics changes. Current staging still serializes `{ gift }` directly, so its public JSON preview exposes `recipientEmail` and would expose future repository preview fields.

This candidate applies only the gift-route security boundary. It does not blindly reapply the accompanying analytics changes. The existing analytics/replay privacy regressions pass. One production file changes: `app/api/easyt/gifts/[token]/route.ts`.

- GET constructs a fresh object containing exactly `tripTitle`, `senderName`, `note`, `status`, and `expiresAt`. It excludes recipient email, internal IDs/documents, future fields and repository-level `toJSON` behavior.
- GET 200, 404 and 503 responses explicitly use `Cache-Control: no-store`. The unfinished patch only supplied the success header; the candidate also protects missing/unavailable responses. Existing statuses and generic error text remain.
- POST is byte-identical to staging. Repository, authentication, recipient matching, claim state/expiration checks, copy behavior, schema and gift page remain unchanged. The repository retains recipient email for these server-side checks.
- The existing page calls the repository directly; the client only POSTs to this endpoint. No in-repository GET consumer requires the removed identity field.

The allowlist is a response-field boundary. The five intentionally shared values, including a sender-authored note, are not content-redacted.

## Test evidence

`tests/gift-preview-privacy.test.ts` executes the actual transpiled route with installed Next.js `NextResponse`. Only the session and repository edges are synthetic. No server, real token, account, email, database connection, draft or recovery record is used.

- Exact staging baseline using the final test harness: **11 total, 4 passed, 7 failed** (`red.log`). This was reproduced in a disposable code-only directory with the baseline route, final tests and the installed dependencies; the directory was then removed. Failures demonstrate excess serialization and missing no-store headers.
- Candidate privacy/authentication suite: **75/75 passed, zero skips** (`privacy-focused.log`). Includes all eleven route tests, analytics/replay, private-session boundaries, email auth/verification and Google auth.
- New route checks cover all four invitation statuses, exact public envelope, null note, private getter/custom serialization exclusion, generic missing/unavailable errors, no-store, public preview without claim side effects, auth-before-claim, exact owner/token delegation, missing claim and recipient rejection propagation.
- Full release gate: **exit 0; 666 total, 642 passed, 24 browser-only skips, zero failures**, including strict UI audit, both typechecks, production build, client manifests and offline identity (`release-gate.log`). The build was qualified with the base `COMMIT_REF` plus this local route patch; it is not a hosted candidate deployment. Build ID `BQJZqzjVjPr33PDVcvA3Q`, 227 offline assets.
- Independent review: no blocking findings within JSON scope; independently reran **11/11** checks with actual `NextResponse`. Confirmed unchanged product diff, claim boundaries and page compatibility.
- Final standalone typecheck and `git diff --check` pass. Initial test-only export type errors were corrected with explicit runtime function checks and TypeScript narrowing; `release-gate-initial-test-types.log` preserves that intermediate failure.

## Baseline failure and qualification limits

The adjacent email run has **60 passes and one failure** (`targeted.log`): `trip invitation and email-event persistence own retry idempotency without storing raw tokens`. It reads missing `db/migrations/0014_morrovia_email_idempotency.sql`. The exact staging tree contains only migration `0018_morrovia_calendar_exports.sql`; both the email test and migrations are unchanged by this candidate. A focused reproduction is `baseline-email-migration.log`. No SQL was restored, removed, executed or altered, and this test was not weakened or skipped. This is an unresolved baseline repository/migration issue, not evidence of the deployed database's schema state. It needs separate reconciliation before making broader schema/release safety claims.

The server-rendered gift page still intentionally shows a masked recipient address to a token holder: its full domain, up to two local-part characters and partial length information remain visible. Very short local parts may be fully visible before appended dots. That existing page policy is outside this JSON patch. This candidate must not be described as eliminating every recipient-identity disclosure.

These tests prove route payloads/headers and claim delegation; they do not verify a running Next.js server, deployed CDN behavior or actual database enforcement. No hosted check or real gift invitation was attempted. Deployment remains unapproved; any later staging qualification must check the exact approved revision and preserve all existing user data.

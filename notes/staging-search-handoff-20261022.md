# AI place search — staging handoff

Base: `76366143aa091f58fbea4c30ad227a510196bb89`. Isolated checkout: `/Users/shaun/Documents/Codex/2026-10-22/task/place-search-investigation-20261022`.

## Current setup (supersedes historical marker and hosted web setup)

Apply the original frozen search patch, then metadata repair delta, then alias-only delta and counter-free follow-up delta. No production action is authorized.

- Verified staging endpoint: `ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech`, database `morrovia_staging`, project `frosty-mode-70756654`, branch `br-lingering-sunset-arw7uok8`. Main is independently verified distinct. Runtime validates exact endpoint/database plus ordinary application metadata; metadata alone cannot authenticate the endpoint.
- Migration 0017 ordinary metadata revision was applied on staging at 2026-10-22T19:07:09.856Z. No custom GUC, `ALTER DATABASE`, connection `options`, role change or grants are required or permitted. Use existing exact connection with `sslmode=require` (or stronger supported verification); unknown/routing override parameters fail closed. Do not append the obsolete `app.morrovia_environment` marker to the URL.
- Budget and reviewed cache tables exist, but public policy and mapping row counts are zero. Missing policy denies admission. Feature remains OFF; no activation values were changed.
- Tool-free Luna aliases replace hosted web research. Guard the complete immutable serialized request (including instructions/schema) at 4096 UTF-8 bytes; this is not a complete model token count. No counting endpoint is called. Output <=1024; Standard; explicit cache without breakpoints; no tools/history/files; retries zero. Aliases have no source URLs. Photon independently validates raw name, identity, country and type. Manual reviewed cache publication still requires independently reviewed public sources.
- The approved four public-place acceptance calls are now completed (4/4); zero counter calls and no retries. Usage-derived token estimate $0.0003145, up to $0.00034595 including the regional premium. The four-call authorization is exhausted regardless of unused dollar allowance; no further paid calls are authorized. Published complete-context/output ceiling including 10% regional premium is $0.2318448 each ($0.9273792/four). The prepared evaluator rounds to $0.231845 and reserves $0.25 per dispatch, never more than $1 across four. The counting endpoint is removed; its undocumented fee is irrelevant to this request. Actual short input should cost much less; the context ceiling is not an estimate of expected spend. Preserve the existing conservative $0.25 reservation and `luna-place-v1` SQL admission policy identifier; it is an admission version, not a claim the old web cost bound was valid. No applied migration rewrite is required.
- Before activation: prove live two-session concurrency with the prepared harness, record the actual staging privacy/notice/abuse/spend review, then create only the approved bounded policy and short-lived review configuration. Exact notice version is now `public-place-alias-v3`; old notices cannot activate dispatch. Owner authorized ordinary staging setup, not new credentials, role/security expansion or production changes.

### Existing-runner concurrency qualification

The Neon connector offers stateless SQL and complete transaction calls, with no session handle or ability to hold a transaction open across calls. Earlier parallel calls serialized on one backend; they are not concurrency evidence. Do not obtain/extract credentials to work around this.

In a runner that already has the authorized direct staging `DATABASE_URL` in its process environment (do not paste it into command arguments or create another copy):

```sh
MORROVIA_ENVIRONMENT=staging MORROVIA_PLACE_RESEARCH_CONCURRENCY_TESTS=1 MORROVIA_PLACE_RESEARCH_ENABLED=false node scripts/staging-place-concurrency.mjs
```

The harness pins the exact target, validates metadata and qualification function body before writes, uses two distinct pg sessions and verifies the blocking relationship. It touches only isolated qualification objects, then disables their caps; no trip/auth/public policy mutation. If no such runner exists, minimum approval is to make the existing staging connection available in evaluator process memory through an approved secure runner, not create a new database credential or persistent local file. This executor currently has no `DATABASE_URL`; live overlap remains unqualified.

### Acceptance evidence and boundary

The approved temporary-profile Chromium component fixture passed 2/2 EN/ES tests against the current v3 notice. It uses mock API responses and does not prove full hosted Builder, paid aliases or live base selection. Current isolated four-call model/provider evidence is in `public-place-alias-acceptance-20261022.json`; all four deterministic baselines already returned candidates, so no live healthy-miss retrieval gain or global reliability pass is claimed. MANUAL HOSTED VERIFICATION REQUIRED for First Place, Add Stop and attraction base panel.

Manual cache publication remains required. No automatic raw-query/model-output cache INSERT/UPSERT, no synthetic citations, no automatic trip selection. The cache may start empty. Production remains disabled and needs separate qualification.

## Handoff transport

Use the original frozen patch and metadata repair delta unchanged, followed by the alias-only delta and counter-free delta manifests. Dependencies, credentials, build outputs and unrelated uncommitted patches are excluded. Parent integrator owns deployment.

# Current counter-free revision

See `staging-search-counter-free-final-20261022.md` and the current setup handoff. This supersedes token-counting and hosted-web statements in the historical reports below. The request has a 4096 serialized UTF-8-byte guard, no counting call, a conservative $0.2318448 per-dispatch ceiling, and notice version `public-place-alias-v3`.

# Current status — tool-free alias revision

The current setup instructions are in `staging-search-handoff-20261022.md`. They supersede this earlier report. The ordinary metadata migration has been applied on verified isolated staging; no custom PostgreSQL marker or connection options are required. Public budget and mapping rows remain zero and activation is OFF.

The current request has no hosted web tools. Luna suggests aliases only, with independent provider verification. Complete immutable input is counted and capped at 4096 tokens; output at 1024; no history, files, automatic retries or cache writes. Notice version is `public-place-alias-v2`. Published generation ceiling is $0.0009216 per call; counting-endpoint billing still needs qualification before paid acceptance. The historical context-based web cost figures below were not proven rigorous caps and must not be used for activation.

---

## Historical report (superseded; retained as audit evidence)

# Search fallback release controls — local result and exact remaining work

## Completed locally

The paid path is **off by default**. `defaultPlaceResearchControls()` has privacy, notice, abuse and spending qualifications false, qualification expiry zero, and **no durable budget adapter**. `MORROVIA_PLACE_RESEARCH_ENABLED=true` alone cannot enable it. No environment/configuration value was changed. Both POST readiness and the SDK entry enforce the gate; the SDK client/key is not initialized while disabled. Deterministic Hirayu/Fanjingshan pilot lookup remains available.

- First Place/Add Stop completed searches now use same-origin `POST /api/journey-geocode`, with only a submitted place name and explicitly typed comma-country in JSON. The research action adds a boolean and exact notice version. No trip/account/session/profile/history/nearby point is included. GET research flags return 405; POST query strings are rejected.
- POST enforces exact Origin plus same-origin Fetch Metadata when present, JSON content type, strict field allowlist, a streaming **1 KiB / 1 second** input bound, basic name/country checks and the exact notice version. Success and failure responses are `private, no-store`. Same-origin checks prevent browser cross-site dispatch; they do not authenticate arbitrary clients or bound spending by themselves.
- Server capability is false when release controls are unavailable. The UI does not offer research without an explicit true capability following a healthy deterministic miss. It names **OpenAI** before the separate action and excludes addresses/personal details. This is a requested public-name action, not a claim of general PII detection or legally qualified consent.
- The SDK cannot dispatch before a durable admission adapter grants the versioned worst-case reservation. Missing/denied/throwing/insufficient/stale admission fails closed. Admission has a one-second cancellation-aware deadline; late grants cannot dispatch a late request. The interface has no automatic refund or retry: uncertain outcomes retain the conservative charge. No in-memory limiter is represented as a durable cap.
- Existing model bounds remain: gpt-6-luna only, one tool call, 1,024 output tokens, Standard, store:false, explicit caching/no breakpoints, retries zero, overall enrichment deadline, provider identity/country/OSM type verification and selectable results.

### Verification

`/tmp/morrovia-search-release-final-tests.log`: **97 tests: 96 pass, 0 fail, 1 browser test skipped**. This includes actual SDK-boundary default-off before client initialization, POST privacy guards, capability hiding, admitted/rejected budget mocks, cancelled/late admission, recorded provider replay and existing search/area-base/reference tests. No paid calls were made by these checks.

Nonincremental TypeScript, diff check and UI convergence audit passed. A component-only esbuild fixture compiles; no full app/Storybook build was run. The unrelated activity/discover baseline assertion and the four older Add Stop source-string assertions remain documented in the preceding report and were not weakened.

## Minimum production qualification — still pending

1. **Privacy/operator review:** follow `docs/privacy-operations.md`. Record OpenAI contracting/DPA/subprocessor/retention and transfer review, and approve the actual data flow. `store:false` is not zero retention. This is an existing repository release requirement, not a newly invented legal certification.
2. **Notice:** approve English and Spanish public-notice text for this optional action, including OpenAI/web-search processing, submitted public name plus explicit country, independent Photon validation, no automatic trip change, and the shared-cache boundary. Update the processing inventory/public notice when activation is approved. The existing notice covers initial capture/copilot but does not yet describe this fallback. No review flag is set by writing draft copy.
3. **Logging:** completed-search names are removed from first-party URL query strings, and request bodies/model output/source text are not logged by this path. Qualify hosting/error/proxy request-body logging/redaction operationally. Typing/reference autocomplete still uses its existing GET path, and Photon uses provider GET queries; do not claim all place names are absent from every log/provider.
4. **Durable abuse and money admission:** approve the global fallback scope, rate/concurrency limits, daily/rolling monetary ceiling, model/pricing/context assumptions, and reservation expiry policy. A client-controlled Origin/header/notice flag cannot enforce a budget. Do not activate before the shared atomic adapter is deployed and qualified.
5. **Acceptance:** run the scoped offline browser fixture after launch authorization, then full Builder/hosted First Place/Add Stop and base-panel acceptance separately. The mock fixture does not qualify actual paid model reliability or live providers.

### Conservative reservation proposal, not an active budget

The prior approved-pair calculation bounded Luna at **$0.2205632**: at most 1,048,976 input tokens × $0.20/M, 1,024 output tokens × $0.75/M, plus one $0.01 search tool charge, with explicit caching/no breakpoints. Rounded proposed reservation: **250,000 micro-USD ($0.25)** per dispatch. The code never enables this pricing policy automatically. Reverify current official model context/pricing/tool/cache behavior before qualifying it, set an expiry, and requalify on any model/control change. No additional cache-write fee is assumed when explicit caching has no breakpoints.

Expected spend on the earlier single Luna case was about $0.01095; that is **not** a rigorous per-request or aggregate cap. An initial **$2/day, 4 claims/minute, 1 active request** policy would be a small proposal for owner review, not authorization or current configuration. At $0.25 conservative reservation it would admit at most eight requests/day if no safe reconciliation is implemented. This fallback budget would not cap other Terra/OpenAI application features or the entire OpenAI account.

## Exact durable admission proposal (no migration written or executed)

Existing abstractions inspected: `lib/easyt/database.ts` lazily returns Neon SQL; `lib/easyt/viator-admission.server.ts` plus migration 0016 demonstrate row-lock claim/lease/cooldown behavior. The repository migration is not evidence it is applied to any live database. Contact/capture limiters are per-process Maps and cannot supply a shared spending ceiling. Do **not** reuse or modify Viator's table/scope/limits.

Prepare a separate operational budget table/function under explicit migration approval:

- Table `morrovia_place_research_budget`: primary key scope (canonical app origin + fallback provider/project budget namespace); policy version, current accounting window, reserved micro-USD, bounded claim timestamps, bounded active leases and cooldown. No query, user ID, raw IP, trip, name, source text or credentials.
- Function `morrovia_place_research_claim(scope text, reservation uuid, policy_version text, upper_micro_usd bigint)` returning admitted, reservation ID, reserved micro-USD and policy version. Under one transaction/row lock, check the deployed approved policy, use the database clock, prune expired concurrency leases, validate rate/day/money/concurrency limits, and reserve the **full** upper bound **before** returning admitted. Prevent first-insert and concurrent-claim races. Missing schema/DB/policy or unexpected receipts means unavailable, never an unlimited fallback.
- Keep monetary reservation on errors, timeouts and unknown dispatch outcomes; lease expiry must not refund spending. Initially omit refunds/reconciliation entirely. If later introduced, require trusted provider usage evidence and conservative rules. A process-memory counter, lease cleanup or SDK timeout is not a monetary refund mechanism.
- Tests still needed with an isolated approved database: concurrent workers/first insert, exhaustion/window boundary, DB unavailable, policy mismatch, abort/late completion, and retained charges on unknown outcome. Mock tests here establish call ordering/fail-closed behavior only.

Smallest external authorization: approve a separate migration/adapter and numeric policy for the fallback, then apply it in an approved isolated database before release qualification. Existing credential/configuration remains untouched here.

## Exact reviewed mapping cache proposal (no external writes)

No existing migration/table or shared public-place mapping cache was found. Use the existing Neon abstraction only after table/migration approval; do not put public mappings in user/trip tables or alter save/auth state.

Proposed table `morrovia_reviewed_place_mappings`:

- Composite key: normalized public query (Unicode NFKC, case fold, collapsed whitespace; do not discard native script), explicit country-context code or empty global context, intent, schema/verification version, **provider ID**. Including provider ID preserves reviewed namesakes instead of enforcing a false one-answer mapping.
- Fields: alternate lookup name; exact provider ID/key/value/place type/country; bounded source URLs with attribution; review state/version/date, expiry and active/revoked state. No model coordinates, confidence, trip/user/session data or automatic raw-query ingestion.
- `ReviewedPublicPlaceMappingReader.read()` is now an unwired read-only interface returning at most eight reviewed records. Future SQL must select explicit columns by exact key/version, active reviewed state and nonexpired timestamps. Return distinct verified identities as choices; ambiguity is not a failure for AI to guess around.
- Re-query the canonical provider and require exact feature ID, raw name, country and taxonomy/routability before offering an entry. Re-review identity/type changes. Do not infer a lodging base from an attraction centroid. A positive database row does not establish intent equivalence by itself.
- Publication is a separate reviewed operator action. Reopen independent public sources, establish that the input alias itself is public and equivalent to the provider feature, and only then publish. No request-path INSERT/UPSERT and no automatic learning from model suggestions or user selection. Current runtime source URLs are checked but not attached to the returned candidate; a future review intake must explicitly preserve public source evidence without storing unreviewed/private query text.
- Decide retention/review cadence before migration; a short proposed positive-mapping TTL is 30 days with immediate revoke/version invalidation. Do not cache private inputs, outages or arbitrary negative queries. No durable adapter is currently wired and no cache hit/persistence is claimed.

## Browser acceptance preparation and blocker

Completed read-only inventory: existing Playwright package 1.62.1, npx and an installed executable:
`/Users/shaun/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`.

Prepared `tests/public-place-research-browser.test.mjs`. Its unconditional component/helper compilation passes. The native React/DOM test is explicitly opt-in and **skipped**. It uses a disposable headless context, intercepts every request, serves only fixture HTML/API responses, blocks external requests/service workers, verifies default-off capability, OpenAI notice/action, explicit selection and preserved canonical locality for First Place/Add Stop in English/Spanish at 390px. It does not attach to personal Chrome/Safari, use CDP/debugging ports, read real browser state, install software, call providers or run an app build.

**Launch not attempted; authorization pending, not a new denial or uncertain execution.** Prior browser/Safari access denials remain in force, and this turn did not explicitly clear them for a disposable headless fixture. Smallest next step: authorize this exact isolated fixture launch through the supported approval flow. Then run with the existing executable and `MORROVIA_PUBLIC_PLACE_BROWSER_TESTS=1`; no dependencies/configuration need installation. The full Builder `addStop`/base-panel transition, actual styling/mobile layout/hydration and hosted behavior remain separate acceptance gaps even if this component fixture later passes.

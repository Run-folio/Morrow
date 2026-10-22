# Counter-free Luna alias fallback — final local handoff

## Current implementation

The owner-approved narrower fallback is implemented. Luna suggests alternative names from existing model knowledge, with no tools or fresh source citations. Production request builder is shared by app and evaluator, deeply freezes the entire request, and rejects complete serialized UTF-8 JSON >4096 **bytes**, including fixed instructions, user name/country, JSON schema and all generation settings. This is not a 4096-token guarantee.

One synchronous `responses.create`: gpt-6-luna, reasoning standard/low, Standard tier, background:false, stream:false, store:false, output <=1024 including reasoning, explicit caching without breakpoints, retries0. No counting endpoint, tools, history, conversations, remote files or automatic continuations. Existing $0.25 durable global admission precedes client/key initialization; cancellation and uncertain-charge retention remain. Existing current model/config for other Terra tasks is unchanged.

The public-name action still requires a healthy completed deterministic miss, public input shape, explicit separate action and current notice. EN/ES processing notice removes counting disclosure; notice version is `public-place-alias-v3`, so earlier notices cannot dispatch this path. Existing component and styles are reused. Provider identity/raw-name/country/type verification, ambiguity preservation, no guessed accommodation bases and manual-only reviewed cache publication remain unchanged. No AI-selected coordinates or automatic trip mutation.

## Actual four-call acceptance, completed

Exactly four approved generation calls, zero token-count calls, no retries. All four returned completed structured output. Ten bounded/rate-spaced public Photon requests supplied independent provider evidence. No external cache publication, DB/configuration mutation, credential copy, persistent access change or deployment occurred.

| Submitted name / country | Luna returned | Actual verifier result | Model latency |
| --- | --- | --- | --- |
| Hirayu / Japan | 平湯 | No candidate accepted: provider returned 平湯温泉 N:2481035449, but raw name does not exactly match suggested 平湯. Existing deterministic reviewed mapping already returns correct Hirayu Onsen locality. No guard was loosened. | 3878 ms |
| Fangjin mountain / China | Fanjing Mountain; 梵净山 | photon:N:699700351, natural=peak, China, natural_area / needs_base_selection. Native query's differently named park was rejected. Summit is not an overnight base. | 2048 ms |
| Yunomine / Japan | Yunomine Onsen; 湯の峰温泉 | photon:N:2822838506, place=locality, Japan, town / direct_destination. English query verifies; native query yields no usable match. | 1834 ms |
| Springfield / United States | ambiguous, no aliases | Negative control passed; no guessed identity. Deterministic results preserve multiple states/namesakes. | 1542 ms |

Two of three positive model outputs yielded expected verified identities; Hirayu conservatively remained unresolved in the AI-only path. The ambiguity control passed. None of the accepted candidates was a false expected identity in this tiny set. This is not a global accuracy rate or broad reliability claim.

**All four deterministic baselines already returned candidates**, including reviewed pilot recovery and ordinary provider results. Therefore these isolated calls test the generator plus real verifier; they do not demonstrate live retrieval gain after an actual healthy zero-result search. The product would suppress AI for all four baselines. Mock route/component tests separately cover the healthy-miss trigger and no-AI-on-ambiguity/outage behavior. No additional paid case is authorized to fill that limitation.

Raw public evidence, full returned structured outputs, provider captures and ledger:
`public-place-alias-acceptance-20261022.json`. Expected source URLs in that file are independently predeclared truth references, not citations supplied by this tool-free model. The evaluator refuses to run again when that ledger exists; do not delete/reset it to extend approval.

## Cost

Usage: input 192/193 tokens per call; output 186/108/140/41 total tokens respectively, including reasoning. Cache reads/writes zero.

Usage-derived model-token estimate: **$0.0003145 total**. Including a possible 10% regional premium: **$0.00034595**. These are estimates from reported usage and current published prices, not an account billing receipt.

Independently reviewed conservative ceiling for the precise single tool-free request uses the full 1,050,000-token model context at long-context input $0.20/M plus 1024 output at $0.75/M, then 10% region premium: **$0.2318448 each / $0.9273792 for four**. Rounded evaluator upper reservations are 231845 micro-USD each; $0.25 is retained per dispatch, $1 total, without refunds. This is an intentionally extreme ceiling, not expected spend. No counting fee is assumed because no counter is called. Explicit caching has no breakpoints and actual reported cache writes were zero.

The approved **four-call authorization is exhausted**, regardless of unused dollar allowance. No further paid request or ongoing staging spend is authorized by that phase. Stage activation needs an approved explicit operational cap/review; do not silently turn unused evaluation allowance into recurring service spend.

Primary sources verified 2026-10-22:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/guides/prompt-caching

## Tests and review

Regression-first: new zero-counter and abort tests failed against old counting adapter, then passed. New byte tests cover 4096/4097 boundary, multibyte Unicode, full schema/instruction inclusion, complete immutable request, oversized country, no tools/history and exact generation controls. SDK mocks verify admission before key/client, zero counting calls, one generation, retries0. Existing route/provider/cancellation/type/country/base guards remain. Actual four-response replay test verifies exact accepted identities, Hirayu rejection and suppression when deterministic candidates exist.

Focused suite: 167 tests, 166 passed, 0 failed, 1 native browser test skipped in the default run; no full build/install. Nonincremental typecheck and diff check pass. Native temporary-profile Chromium fixture **2/2 passed** for v3 in EN/ES, First Place/Add Stop, explicit notice/capability, selectable locality. This is actual React/DOM component acceptance with fixture requests, not full hosted Builder/base-panel acceptance.

Independent source and evaluator review found no must-fix. Reviewers made no paid requests. All credential use stayed in evaluator memory with only public response/usage metadata persisted. No new denial or uncertain request outcome occurred.

## Remaining activation work, owned by integrator

- Parent/integrator is qualifying actual two-session DB concurrency with its approved existing connection. This executor does not duplicate it, extract credentials or change roles/access.
- Ordinary metadata migration is already applied to independently pinned isolated staging; no custom PostgreSQL GUC, connection options, ALTER DATABASE or grants are needed. No migration rewrite in this revision.
- Record actual v3 notice/privacy/abuse/spend review and a separately approved bounded operational policy before activation. Public policy/cache remain empty and feature OFF here.
- Deploy through integrator, then hosted First Place/Add Stop and scenic base panel acceptance. MANUAL HOSTED VERIFICATION REQUIRED. Do not claim the summit has a selectable accommodation base until actual base flow passes.
- Cache starts empty unless an operator separately publishes reviewed public mappings with exact provider IDs/provenance/expiry. No automatic AI ingestion or personal/trip query cache.

Parent owns staging deployment. No source commit, push, full build, dependency installation or save/auth mutation was performed by this task.

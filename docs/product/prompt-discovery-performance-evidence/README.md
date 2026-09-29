# Prompt → Discovery / Builder performance evidence

## Before product changes

- Source: `50c248679859bbbbb06f35ae771e6e565ebbd177` (accepted New Trip history through `0860d4f` merged into plan base).
- Environment: optimized local `NEXT_DIST_DIR=.next-check next build` and `next start` on localhost, headless installed Chrome, 390×844 CSS pixels, fresh browser context per attempt. No provider credentials or `.env.local` are present in this worktree. These runs are **local deterministic/fallback**, not live model/provider benchmarks.
- Inputs: Stops = selected canonical Tokyo; Describe = “Visit Tokyo and Kyoto in Japan for one week.” Date defaults from 29 Sep–5 Oct 2026. The Stops intake has one selected occurrence; Describe returned Tokyo and Kyoto through the local capture endpoint.
- Milestones measured from Plan my trip click: the older harness observed `/journey/new` after navigation; first actionable = rendered “Your route — Nights per stop:” with an editable canonical stop. Its navigation measurement may include page loading, so it is not compared as exact URL-change latency. Route-ready remained false because required departure context was missing. Shell/spinner was not counted.
- Three fresh-context runs each, one cold server/browser run and two warm runs per mode; see `before-timings.jsonl`. Stops navigation: 8632 / 1984 / 1969 ms; first actionable: 8638 / 2782 / 2766 ms. Describe navigation: 964 / 953 / 6310 ms; first actionable: 1772 / 1766 / 6319 ms. The cold/warm split is observational only; caching and fallback behavior were not controlled well enough to claim a provider speedup.
- Screenshots: `before-stops-intake-390.png`, `before-stops-builder-390.png`, `before-describe-intake-390.png`, `before-describe-result-390.png`.
- Integrated source owner check: `canonicalizePlanningSuggestions` is invoked only by `app/api/journey-capture/route.ts`. `planningSuggestions` and `planningAssessment` are applied from the initial capture in Builder; no later bounded suggestion request owner exists. The intent-only P0 path will defer optional suggestions/assessment rather than introduce another model request.

## Task 7 after the cross-tab correction

- Corrected source: `d99e02d453c6efe06056212c9dd6534d3dc06065` plus the Task 7 changes in this commit. The optimized local app was built with `npm run build:check`, served using `NEXT_DIST_DIR=.next-check next start -p 4317`, and measured with `measure-local.cjs` in headless installed Chrome. Inputs and viewports are recorded in `current-optimized-runs.json`; screenshots use the `current-*` prefix. Browser contexts were isolated per attempt, with the first context labelled cold and later contexts warm-server. This does not isolate every HTTP or Next.js cache.
- Preserved `after-*` files came from the paused, pre-correction run. They remain historical evidence only; `current-*` files are the post-correction acceptance. The paused `before-*` and `matched-before-*` files remain unchanged.
- No live model/provider credentials were present. All timings below describe the actual local application using its local fallback and bounded public data paths; **live provider latency is unavailable**. The controlled slow/failure cases delayed or failed the geocode response in the browser. They are fixtures, not live provider samples.
- The local User Timing helper records only an opaque attempt token and allow-listed milestones. A retry retires its previous browser marks, and the measurement script selects stages from one submission identity. The browser harness carries only opaque User Timing marks across a document navigation in its isolated session storage and converts each mark to the click page’s absolute clock. The `urlObservedUpperBoundMs` field is when the harness first observed `/journey/new`; it is an upper bound, not an exact URL-change timestamp or a page-load claim. `submit` is zero, `durable-intake` follows verified handoff write, and `shell-visible` is orientation only. `first-actionable` requires an editable canonical occurrence or a selectable Discovery decision with enabled controls. Every recorded first-actionable mark was checked against the rendered app. The initial prompt, spinner and bare shell do not qualify.

### Matched 390×844 comparison

The preserved `matched-timings.jsonl` before series and fresh `current-optimized-runs.json` after series use the same Stops and ordinary Describe inputs in the optimized local app. The before series predates the cross-tab correction. `n=3` in each cell; the tail column is the observed maximum, not a statistically stable percentile. The two separate before series in this directory were not pooled.

| Mode | Before first actionable, ms | Before median / max | Current first actionable, ms | Current median / max | Failures |
| --- | --- | ---: | --- | ---: | ---: |
| Stops | 368, 374, 371 | 371 / 374 | 822, 397, 409 | 409 / 822 | 0 / 0 |
| Describe | 1950, 362, 365 | 365 / 1950 | 1022, 426, 1193 | 1022 / 1193 | 0 / 0 |

The earlier initial baseline in `before-timings.jsonl` has larger cold and fallback tails: Stops first actionable 8638/2782/2766 ms (median 2782, max 8638); Describe 1772/1766/6319 ms (median 1772, max 6319). It used a different capture pass and is retained as diagnostic context, not treated as a matched speedup comparison. The matched comparison above does **not** establish a first-actionable speedup; Stops is slightly slower and Describe is substantially slower in this small local fallback sample. The result is not evidence of a speedup. More repetitions and live-provider access are needed to estimate production effect.

### Current milestone and scenario checks

At 390 px, the current ordinary Describe median was: durable intake 52 ms, shell 989 ms, first actionable 1022 ms, required interpretation 1118 ms. The observed URL upper bound was 71 ms at the median. Its route-ready milestone was absent because the sample lacks a required departure choice. Optional-complete was absent because intent-only capture deliberately defers optional suggestions/assessment; no later model request was introduced to fill that stage. Stops reached durable intake in 48–49 ms and first actionable at 397–822 ms; route-ready was likewise absent.

| Scenario, 390 px | n | First actionable | Required complete | Result |
| --- | ---: | ---: | ---: | --- |
| Broad region | 1 | 711 ms | 711 ms | Selectable Discovery; no fabricated route |
| Mixed known/unresolved | 1 | 1100 ms | 1118 ms | Known Tokyo route retained with Discovery |
| Repeated structured stops | 1 | 418 ms | 426 ms | Tokyo → Kyoto → Tokyo remained three distinct visible stops |
| Slow Kyoto lookup fixture | 1 | 433 ms | 2962 ms | Tokyo actionable before slow sibling completes |
| Failing Kyoto lookup fixture | 1 | 730 ms | not reached | Existing route remains actionable; failure is not marked complete |

At 430, 768, 1024 and 1440 px, one ordinary Describe run per width reached verified first actionable content at 425, 876, 4393 and 5367 ms respectively, with zero page errors and no horizontal overflow. The large desktop values are observed local tails, not a claimed responsive performance improvement. `current-*.png` records the actual rendered states at all five widths.

The repeated-stop run uses three deliberate canonical selections, Tokyo → Kyoto → Tokyo, and verifies `Stops (3)` plus the ordered three-stop Builder route. The free-text repeated prompt in an earlier paused fixture produced only two interpreted stops, so it is **not** used as evidence of repeated occurrence preservation. The structured occurrence contract is also covered by the focused handoff tests. Its required-complete mark was 426 ms once the three canonical occurrences were ready.

`current-context.json` records the actual-app reload, cancellation and import-return checks. Reload resumed the same reserved trip without a fresh starter; delayed capture after Edit did not restore a stale route; import opened the existing route and returned with the prompt intact. `current-two-tabs.json` records two simultaneous Homepage Describe submissions converging on one locked token/trip. Authenticated account switching could not be exercised in this credential-free local browser; owner-scope tests cover its fail-closed contract. No optional analytics event was added, so existing consent rules remain authoritative.

### Final review and known browser harness limit

Independent Task 7 review found and prompted fixes for retired lookup status, retry mark isolation, and cross-document timing. The corrected cross-tab owner remains authoritative; no direct shared-key writer was restored. The regular Builder gate, capture, persistence and Discovery suites pass. An opt-in browser-rendered `trip-builder-gate` run still has older structural expectations such as a `Journey details` region absent from the accepted Builder at `d99e02d`; it produced four failures and six timeout cancellations. That legacy harness needs separate reconciliation against accepted Builder structure. This run is reported rather than treated as a passing browser gate. The optimized actual-app scenarios above succeeded.

Final local counts after the status and timing fixes: capture 136/136, place intelligence 100/100, Builder clarification 80/80, persistence 147/147, combined homepage/New Trip/Builder/Discovery/analytics 310 passed, 52 skipped, 0 failed, progressive and milestone 19/19, model routing and Builder layout 26 passed, 13 skipped, 0 failed. The separate opt-in browser harness reported 41 passed, 4 failed, 6 cancelled. Typecheck, strict UI audit, optimized build, Storybook build and `git diff --check` passed. No authenticated account-switch or live-provider latency measurement was available locally.

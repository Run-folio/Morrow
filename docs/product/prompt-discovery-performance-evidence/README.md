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

Independent Task 7 review found and prompted fixes for retired lookup status, retry mark isolation, and cross-document timing. The corrected cross-tab owner remains authoritative; no direct shared-key writer was restored. The regular Builder gate, capture, persistence and Discovery suites pass. At the Task 7 checkpoint, an opt-in browser-rendered `trip-builder-gate` run produced four failures and six timeout cancellations. That historical run was not counted as a passing browser gate; the final reconciliation below resolves each case. The optimized actual-app scenarios above succeeded.

Final local counts after the status and timing fixes: capture 136/136, place intelligence 100/100, Builder clarification 80/80, persistence 147/147, combined homepage/New Trip/Builder/Discovery/analytics 310 passed, 52 skipped, 0 failed, progressive and milestone 19/19, model routing and Builder layout 26 passed, 13 skipped, 0 failed. The separate opt-in browser harness reported 41 passed, 4 failed, 6 cancelled. Typecheck, strict UI audit, optimized build, Storybook build and `git diff --check` passed. No authenticated account-switch or live-provider latency measurement was available locally.

## Final browser-harness and URL-to-content reconciliation

The earlier opt-in browser run had 41 passed, 4 failed and 6 cancelled. Each of the ten problem cases failed again when run alone, so none was merely a cascade. Seven seeded an unversioned `?homeDraft=1` value without the owner-scoped stored input, matching receipt and `handoff` URL token. The accepted entry-state gate correctly rendered its unavailable state. The repaired fixture uses `homepageReceiptForProjection` and the real stored-input contract; the original endpoint, retained-intention and recovery assertions then pass without a product-code change.

| Previous result | Case | Classification and current invariant |
| --- | --- | --- |
| Failed | Populated Builder journey-end summary | Test/harness failure: invalid handoff fixture; explicit, same-as-start and unknown ends remain visible in the accepted Builder. |
| Failed | Builder end-mode editing and Cancel | Test/harness failure: invalid handoff fixture; atomic canonical recovery, stop IDs and Cancel remain asserted. |
| Cancelled | Build continuation with unresolved intent | Test/harness failure: invalid handoff fixture; deliberate continuation, retained reminder and reload remain asserted. |
| Failed | Overview retained-mention deep link | Test/harness failure: invalid handoff fixture; the exact Serengeti mention still opens. |
| Cancelled | Post-Build Kruger recovery | Test/harness failure: invalid handoff fixture; no unverified base is promoted. |
| Cancelled | Provider-backed nearby Kruger place | Test/harness failure: invalid handoff fixture; nearby evidence cannot bypass the missing canonical base. |
| Failed | Provider-unavailable model base | Test/harness failure: invalid handoff fixture; an unverified model base remains non-actionable. |
| Cancelled | Route-stop search evidence | Stale structural assertion: fresh New Trip now uses the shared controlled planner. The test opens the populated Builder's existing Add stop search and still checks canonical evidence. |
| Cancelled | Consecutive mobile Add stop | Stale structural assertion: the old empty-entry combobox is gone. The test now starts with a canonical populated stop, then checks consecutive additions, focus, duplicate prevention, order and explicit close. |
| Cancelled | Mobile confirmed-stop summary | Stale structural assertion: the current handoff summary is a semantic list rather than text buttons. The test checks visible canonical names, reorder, remove, one Add action and no overflow at 390/430. |

The exact 51-test combined opt-in run (`trip-builder-gate`, `homepage-builder-hydration`, `new-trip-builder-submission`) now passes **51/51, zero failed, zero cancelled, zero skipped**. No product UI, receipt or capture owner was changed for the harness correction. A separate broader 22-file owner run passed 326, failed 0 and skipped 35; its one initially failing assertion expected generated check-in prose to become a saved Morning activity. Current Itinerary composition keeps the authoritative `tonight` stay state and does not invent a saved activity. The test now asserts that ownership and the original same-place transfer invariant. The focused capture, place-intelligence, Builder-clarification and persistence suites passed 136/136, 100/100, 80/80 and 147/147 respectively.

### Matched optimized-app timing, 390×844

`final-before-optimized-runs.json` and `final-after-optimized-runs.json` each contain ten fresh-context Stops attempts and ten ordinary Describe attempts. Both phases used the **same optimized product build**, the same inputs and the same browser-visible definition: either a painted canonical route row with an enabled Add stop action, or a visible selectable Discovery choice while its dialog is open. A route row behind an open dialog, the initial shell and a spinner do not qualify. Each series started after a local server restart; attempt 1 is the first context, and attempts 2–10 reuse the warm server. These are fixture/local-fallback measurements, not live-provider latency. No product or matched-measurement logic changed between these two phases, so any timing difference is run-to-run variation, **not a product speedup**.

| Mode / phase | n | First actionable median | Min | Max | p90 | First context | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stops before | 10 | 397 ms | 392 | 695 | 498 | 397 | 0 |
| Stops after | 10 | 416 ms | 396 | 1286 | 712 | 396 | 0 |
| Describe before | 10 | 477 ms | 421 | 885 | 829 | 446 | 0 |
| Describe after | 10 | 738 ms | 419 | 1773 | 1527 | 1034 | 0 |

The painted-orientation medians were Stops 397→416 ms and Describe 421→712 ms. The local User Timing `shell-visible` effect mark can precede the next painted frame by roughly one frame; the table uses the separate browser-observed painted orientation/actionability marks. For ordinary Describe in the after series, median milestones from submit were: durable intake 55 ms, route request 55 ms, URL commit 61 ms, Builder root mounted 668 ms, hydrated entry render committed 679 ms, painted orientation 712 ms, capture requested 684 ms, capture response 688 ms, and painted first actionable 738 ms. These are medians of each event, so their differences are approximate. Capture started after entry render; instrumented localStorage reads/writes totalled at most 0.3 ms in these samples. Warm route fetches and route-chunk transfers were generally 1–4 ms. The longer tails correlate with delayed route/chunk load or the interval from URL commit to Builder mount, before handoff hydration or capture. The after series is slower, but it runs identical product code: the traces isolate the variation before Builder mount, not in recovery or interpretation. No unnecessary synchronous recovery wait was proven, so no correctness-sensitive product work was deferred to improve this number.

The first after Describe attempt illustrates the original ~900 ms gap: route commit at 56 ms, `/journey/new` page chunk transfer lasting 620 ms, Builder root mounted at 976 ms, hydrated entry render at 988 ms, painted orientation at 1028 ms, and painted selectable content at 1034 ms. On warm attempts the chunk transfer took about 2 ms while URL commit to root mount could still take about 600 ms. The gap is a real pre-mount navigation/module/render interval, not a late shell mark or a wait for capture. These browser marks do not separate Next's client transition/module evaluation from synchronous work before the first Builder DOM commit, so attributing the entire warm interval to either would overstate the evidence. No storage or interpretation dependency explains it in these traces.

The retained after scenarios show a selectable broad-region Discovery choice (painted 457 ms), mixed known/unresolved input with its visible scoped search (painted 1180 ms), three distinct Tokyo → Kyoto → Tokyo occurrences (painted 441 ms), a slow Kyoto lookup with the sibling actionable at painted 856 ms before required completion at 3441 ms, and a failed Kyoto lookup with the existing route actionable at painted 933 ms and no false required-complete mark. Responsive Describe checks at 430, 768, 1024 and 1440 px all showed actionable content without overflow or browser errors; the desktop attempts had large local route-loading tails and are not speedup evidence. Route-ready is correctly absent without a chosen departure, and optional-complete is absent because intent-only capture defers optional suggestions. Live semantic/provider performance remains a staging gate.

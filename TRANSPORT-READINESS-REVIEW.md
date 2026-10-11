# Transport readiness guard review

Base: 7e85caba9a818f13cb1c88503a76dbfdb15c5f51. Local isolated branch codex/transport-readiness-guard. No deployment or push.

Shared geographic policy gates canonical multimodal resolution and direct road fallback before evidence/provider use, including source-rewritten and stale-binding legs. Unready endpoints yield a non-mutating unknown projection with null inferred metrics and no geometry, segments or road reference. Canonical gateway air/rail/access candidates also need ready gateway points. Verified geography still relies on existing connectivity, land, fixed-link and provider plausibility rules; no service facts or durations were added.

Entry points inspected: API journey-transfer-resolution POST -> multimodal server batch/trip wrappers -> core single/batch/trip resolution; direct road single/batch/trip and server wrappers; ordinary road candidates, gateway access, ferry-port access. All provider calls in these canonical paths pass direct road fallback's shared guard. Low-level coordinate provider adapters are unchanged. Named ferry ports remain untimed source-backed components with unknown geometry; no endpoint binding is invented. Authored/saved input is not mutated by guard projection.

New tests: canonical construction -> JSON serialization -> resolution, either/both unready, stale binding and source rewrite, direct fallback, verified mainland road, verified sourced crossing controls both directions, and unverified derived gateway. Red on exact base: 6 fail/3 pass. Final new regression lane: 9 pass/0 fail. Typecheck passed; git diff --check passed. No UI changes or heavy build/browser run.

Compatibility lane (bounded relevant files): baseline 48 tests,37 pass,11 fail; candidate plus new tests/accepted-reference controls 61 tests,36 pass,25 fail at recorded run. The later gateway regression adds one passing test to that set; no full-suite pass claimed. Original five benchmark definitions/expectations remain untouched and unresolved. Existing tests whose raw fixtures lack accepted geography cannot qualify routing; the new sourced mainland/bridge/ferry controls independently remain green.

Hoi An accepted destination control now stays unknown because its derived Da Nang gateway point does not satisfy existing geographic acceptance. Do not restore timing by manufacturing a binding or changing the original Hoi An benchmark. This needs reviewed gateway point/provenance or a separately approved evidence contract; it is an explicit coverage blocker. Rome-Venice remains missing canonical rail coverage, not a resolver downgrade.

## Pre-existing failures

- La Paz to Huacachina composes flight to Lima plus provider-routed ground access
- a short land journey selects routed road when driving is preferred
- catalogued island endpoints cannot become direct road legs without crossing evidence
- Huacachina to Lima resolves from unknown to one canonical road leg
- a second land-connected pair resolves when the provider succeeds
- a legacy planner-owned unsupported-rail leg can be healed without touching authored unknowns
- a cross-water no-route response retains the honest unresolved fallback
- implausible and cross-border results are rejected conservatively
- road routing is skipped when either endpoint country is unknown
- the deterministic benchmark is repeatable and matches the reviewed final baseline
- final engine defects are cleared while knowledge gaps and appropriate unknowns stay explicit

## Additional readiness-contract failures

- new hard exclusions discard structured impact and distances from saved generated transport
- a mainland road candidate is selectable without a driving preference
- Java–Bali reuses an explicit ferry component without inventing timing
- hard exclusions prevent ferry composition and missing access evidence stays untimed
- untimed ferry components discard stale saved whole-leg estimates and retain traveller rules
- resolving a saved generated crossing again removes newly forbidden transport without changing traveller intent
- accepted reference control Tokyo → Hoi An retains mixed transport
- trip save preserves the exact pending necessary prefix while the explicit worker can resolve it
- Huacachina to Lima selects routed road when the traveller prefers driving
- exact supported ferry evidence can resolve without inventing a service
- island/no-route stays unresolved while reviewed gateway access survives an unavailable provider
- explicit confirmed transport is preserved and legacy persisted legs remain readable
- an unsupported planner flight records the resolver-owned unresolved normalization
- missing coordinates skip the provider and safely remain unresolved

Logs and prior exact-input classification are in task-10/qa-baseline/readiness-*.log and transport-7e85cab.md. This correction is ready for independent source review; compatibility/data gates remain open.

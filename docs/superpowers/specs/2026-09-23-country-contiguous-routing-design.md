# Country-Contiguous Routing and Re-entry Penalty Design

**Date:** 2026-09-23

**Status:** Approved design direction, amended for proof-safe continuity classification; no product implementation has started

**Issue:** #335

**Scope:** Deterministic route candidate generation, scoring, explanation, validation and existing Route Check consumption

## Decision summary

Morrovia will extend its existing deterministic `RouteCandidate` pipeline with a canonical-country continuity signal. The engine will strongly prefer completing the planned stays in one country before leaving it, while retaining country re-entry whenever the current protected planning boundary cannot safely change it or the split route is materially better.

The change will not introduce another optimizer. A small pure country-block analyzer will be shared by candidate generation, scoring and final-plan validation. Exhaustive generation remains unchanged for routes of six or fewer stays. Bounded generation will gain a small deterministic country-block seed so the scorer can actually consider a contiguous alternative on larger routes. The scorer will add one typed, centralized `country-reentry` penalty only for avoidable repeated country blocks.

Country identity will be resolved through the existing ISO-backed country registry, preferring an existing `countryCode`. Raw display strings will never be compared directly. Unknown identity is a stable barrier: Morrovia never guesses the country or moves a known block across that occurrence, but may still improve fully known spans on either side.

## Accepted base and audit divergence

- Starting commit: `04cf724848fb4312d7222782e9073a065b1faaec`
- Source branch at that commit: `codex/route-map-system-333`
- Isolated #335 worktree: `/Users/shaun/.codex/worktrees/country-contiguous-routing-335/Morrovia`
- Isolated #335 branch: `codex/country-contiguous-routing-335`
- Product-code changes before this specification: none

The exact primary route does **not** reproduce the reported bad winner at the accepted commit when Madrid is represented through the current origin/journey-end contract:

`Madrid → Mumbai → Dubai → Cape Town → Swakopmund → Dushanbe → Agra → Madrid`

With six overnight stops and no fixed commitment, the current generator exhaustively emits all 720 permutations. The current scorer selects:

`Swakopmund → Cape Town → Dubai → Mumbai → Agra → Dushanbe`

Mumbai and Agra are already contiguous in that winner. The entered re-entry order ranks 211th because it has about 750 more estimated door-to-door minutes, 9,463 more estimated kilometres, one more travel-heavy leg, one more excessive leg and a 24-point `unnecessary-backtracking` penalty. This is incidental protection from the geometry and transfer model, not country-aware reasoning.

The architectural defect is reproducible when transfer evidence slightly favours the split route. In a deterministic comparison between:

- `Mumbai → Dubai → Dushanbe → Agra` at 400 estimated minutes; and
- `Mumbai → Agra → Dubai → Dushanbe` at 430 estimated minutes,

the current scorer selects the India re-entry route by 3.2 points. It records no penalty or metric for leaving and re-entering India.

Candidate generation also has a distinct large-route gap. A seven-stop canonical fixture with alternating India, China and Japan occurrences produces eight bounded candidates, none of which completes every country in one block. A scoring-only change therefore cannot satisfy #335 for larger routes.

These findings change the diagnosis, not the requested product outcome: the exact route is currently saved by existing geography, but the engine has no invariant that explains or generalizes that result.

## Traveller job and policy

The traveller needs a multi-country route whose overall sequence is credible, not merely a chain of individually possible legs. Re-entering a country after unrelated countries usually adds international-transfer friction and makes the route harder to trust.

The default policy is:

> When a traveller enters a country, strongly prefer completing the planned stays in that country before leaving it.

This is a strong soft preference. It must never invalidate a candidate or override a hard constraint. A split-country route remains valid when it is protected by fixed commitments, locked dates, booked anchors, fixed gateways, an authoritative application-level order, hard transport constraints, or when its evidenced route advantage is large enough to overcome the soft penalty.

## Goals

- Detect a country represented by multiple separated blocks of planned stop occurrences.
- Make avoidable re-entry a visible, typed and deterministic scoring penalty.
- Generate at least one realistic country-contiguous candidate for bounded larger routes inside each fully known span.
- Preserve every stop occurrence, including repeat visits to the same canonical place.
- Distinguish observed avoidability, proven constraint-driven re-entry and unproven protected re-entry without visa claims.
- Keep fixed commitments, schedule locks, bookings, gateways, required stops and hard transport constraints authoritative.
- Make Builder Route Check, final-plan validation, repair and Trip Health consume the same engine fact without creating separate country logic.
- Preserve deterministic bounds and existing route-quality safeguards.

## Non-goals

- Implementing #321 country or region discovery.
- Adding visa, entry-right or multiple-entry advice.
- Inferring countries from city names.
- Treating every international border as undesirable.
- Replacing route candidate generation or introducing a general-purpose optimizer.
- Using an LLM to choose route order.
- Adding India-, Tajikistan-, Japan- or China-specific routing rules.
- Redesigning Builder or adding new route controls.
- Reclassifying every ordered-looking prompt as a hard fixed order.
- Changing canonical place or stop-occurrence identity.

## Current pipeline audit

| Stage | Current owner | Audit finding |
| --- | --- | --- |
| Canonical intent | `lib/easyt/structured-trip-brief.ts` and `lib/easyt/place-intelligence.ts` | Destinations retain canonical place identity and parent countries. Hard route constraints are derived separately. `sequenceKind` detects ordered language but is not a hard route-order constraint. |
| Planner input | `PlannerStop` in `lib/easyt/planner.ts` | Stops already support `canonicalPlaceId` and optional `countryCode`. Builder and persisted `TripStop` also retain `countryCode`. |
| Country identity | `lib/easyt/country-registry.ts` | `countryCodeFor` maps ISO codes, canonical display names and curated aliases to one stable alpha-2 code. This is the existing resolver #335 should reuse. |
| Candidate generation | `lib/easyt/route-candidates.ts` | Routes with at most six stops use exhaustive permutations. Larger routes use at most 20 existing/reverse/nearest/geographic/local-swap seeds. No seed uses country blocks. |
| Candidate deduplication | `lib/easyt/route-candidates.ts` | Ordered stable stop IDs form the dedupe key. Repeat visits survive as long as occurrence IDs are distinct. |
| Hard filtering | `lib/easyt/route-candidates.ts` | Fixed endpoints, required/excluded stops, maximum stops, forbidden modes and maximum transfer time prune candidates. Any fixed commitment conservatively reduces generation to the entered order. |
| Scoring | `lib/easyt/route-scoring.ts` | The winner is selected from five weighted components plus typed penalties. No country-transition, country-block or border metric exists. |
| Existing penalties | `lib/easyt/route-scoring.ts` | Backtracking is 10 points scaled from 1–3× by excess-distance severity; excessive transfers are 8 per leg; one-night anchors 12; stay-consuming arrival/departure 8; unnecessary flights 8 each. |
| Recommendation gate | `assessRouteOrder` in `lib/easyt/planner.ts` | A score advantage must normally accompany equal/lower transfer time. A backtracking-specific exception permits at most 60 extra minutes and 5% extra transfer time. |
| Explanation | `lib/easyt/route-scoring.ts` and `lib/easyt/planner.ts` | The scorer compares component and penalty totals. Planner reasons currently name time savings or backtracking, but cannot name country continuity. |
| Builder consumption | `app/journey/new/trip-builder.tsx` and `trip-builder-route-workspace.tsx` | Route Check reads the same candidate/scoring result and applies a validated stop-ID permutation. Fixed commitments and schedule locks prevent application. The current reason projection only recognizes backtracking explicitly. |
| Replan/application | `lib/easyt/trip-replan.ts`, `lib/easyt/cascade.ts` | Replan preserves stop IDs, constraints and canonical legs, then cascades dates. The saved-trip-to-planner projection currently omits `countryCode`; this is a propagation gap. |
| Independent validation | `lib/easyt/plan-validator.ts` and `lib/easyt/plan-repair.ts` | The validator detects only local geographic backtracking. Bounded repair already regenerates and rescores candidates and protects fixed/dated/locked state. |
| Trip Health | `lib/easyt/review.ts` | It consumes final-plan validation and persisted route assessment, but no country-re-entry issue exists to surface. |
| Benchmarks | engine-v2, route-quality calibration, global routing and prompt-engine harnesses | The suites already protect constraints, bounded generation, route quality, raw-prompt retention, state preservation and explanation. They lack country-block assertions. |

### Constraint behavior that must remain unchanged

- A fixed start or fixed end remains at its required stop position.
- Every required stop remains present; excluded stops and maximum-stop conflicts remain hard failures.
- Any current fixed commitment keeps the entered order as the sole candidate.
- Builder schedule locks continue to block route application; final-plan repair continues to protect locked and dated state.
- Fixed nights, stop dates, bookings and trip dates are never rewritten merely to improve country continuity.
- Hard transport exclusions and maximum-transfer constraints continue to prune before scoring.
- External origin and journey-end gateways remain routing context rather than overnight stop occurrences.

There is no first-class engine flag today for “the traveller stated this exact order and it is authoritative.” Ordered prompt syntax is intentionally broader than that meaning, and `decisionSelections.routeOrder: "entered"` can also describe a normal initial route. #335 must not convert either signal into a new hard constraint. A singleton candidate caused by the current fixed-commitment generation boundary is protected from automatic change, but the singleton alone is not proof that the re-entry is required. A future dedicated authoritative-order model is outside this ticket.

## Options considered

### 1. Penalty only

Add `country-reentry` to scoring and leave generation unchanged.

Rejected because routes above six stops can omit every country-contiguous order. The scorer cannot select a candidate it never receives.

### 2. Hard country grouping

Require every known country to appear in one block and prune all split candidates.

Rejected because it would violate fixed commitments, deliberate returns, hub routing and legitimate geographic or transport exceptions. It would also turn incomplete country evidence into a false hard claim.

### 3. Shared analyzer, one bounded seed and a strong soft penalty

Add a pure canonical country-block analyzer, use it to introduce a small bounded seed, and score avoidable re-entry relative to the hard-safe candidate set.

Selected because it extends the current architecture, keeps constraints authoritative, remains explainable and bounded, and can identify an observed lower-block alternative without treating incomplete generation as proof that no such alternative exists.

## Canonical country identity

Country continuity operates on stop occurrences only. It does not inspect stop names or infer geography from a canonical place ID.

For each `PlannerStop`:

1. If `countryCode` is present, resolve it with `countryCodeFor`.
2. Otherwise pass the existing canonical/selected `country` value through `countryCodeFor` as a registry lookup, never as a raw-string comparison.
3. If neither resolves to one registry code, return unknown.

The alpha-2 code is the comparison identity. A canonical country name may be obtained from the same registry for explanation only.

External origin and journey-end endpoints are excluded from the country-block metric. They are not planned stays, and including them would incorrectly penalize ordinary return-home journeys such as Madrid → … → Madrid. Fixed gateway stops that are actual members of `stops` remain part of the analysis.

`trip-replan.ts` must preserve `TripStop.countryCode` when it projects saved stops back into `PlannerStop`. No new country field, resolver or persistence migration is required.

## Pure country-block analysis

Add a focused pure module, proposed as `lib/easyt/route-country-continuity.ts`. It is an analyzer and deterministic ordering helper, not an optimizer.

Conceptual result:

```ts
type RouteCountryContinuity = {
  knownStopCount: number;
  unknownCountryStopIds: string[];
  knownSpanCount: number;
  blockCount: number;
  blocks: Array<{
    countryCode: string;
    stopIds: string[];
    spanIndex: number;
    startIndex: number;
    endIndex: number;
  }>;
  blocksByCountry: Record<string, number>;
  reentriesByCountry: Record<string, number>;
  reentryCount: number;
  repeatedCountryCodes: string[];
};
```

Adjacent occurrences with the same resolved code form one block inside a fully known span. A re-entry is an additional block for the same country after at least one known, different country block in that same span.

Unknown identity is an uncertainty barrier:

- `IN → unknown → IN` does not prove an India re-entry and receives none.
- `IN → unknown → AE → IN` does not connect the two India occurrences across the barrier.
- `IN → IN → unknown → JP → CN → JP` detects the Japan re-entry within the fully known suffix.
- Unknown stops remain distinct occurrences and are never assigned to a country group.
- Blocks and re-entries are never joined, inferred or moved across an unknown occurrence.
- `blocksByCountry` may report blocks on both sides for audit, but `reentriesByCountry`, `reentryCount` and `repeatedCountryCodes` count only repetition established inside a fully known span.

The helper must be deterministic, side-effect-free and tested independently.

## Candidate generation

Exhaustive generation for six or fewer stops already includes every possible country-contiguous order and remains unchanged.

For bounded routes, `RouteCandidateSource` gains `country-block`. The generator splits the flexible middle into maximal fully known spans separated by stable unknown-country occurrences, then adds at most two country-block seeds before local-swap seeds:

1. **Stable country-block seed:** within each known span, group stops by resolved country in first-appearance order while preserving the entered occurrence order inside each country.
2. **Reverse country-block seed:** within each known span, reverse the country-group order while preserving the occurrence order inside each group.

Unknown occurrences remain at their original barrier positions relative to the spans, and no known stop may cross them. For example, `IN1 → IN2 → unknown → JP1 → CN1 → JP2` may become `IN1 → IN2 → unknown → JP1 → JP2 → CN1`, but no India, Japan or China occurrence may move across `unknown`.

Fixed start and end stops remain outside the flexible middle exactly as today. A flexible group matching a fixed-start country is placed first only within the first known span; a distinct group matching a fixed-end country is placed last only within the last known span. If the same country is required at both endpoints with other required countries between, the repeated block may be proven constraint-driven by those concrete positions rather than “fixed” by violating a gateway.

Segmented grouping is the V1 policy. It is a bounded extension of the same two seeds, not a new search: grouping is applied independently inside each known span, and the concatenated result remains one seed. The conservative global opt-out is therefore not adopted.

The existing stop-ID order key deduplicates the new seeds. Repeat occurrences of the same city retain distinct IDs and remain present. The overall bound stays `MAX_BOUNDED_CANDIDATES = 20`; country-block seeds displace only the lowest-priority local-swap seeds when the limit is reached. There is no factorial expansion.

Hard candidate filtering remains unchanged and runs after seed construction. A country-block seed that violates a gateway, transport rule, maximum transfer or another hard constraint is rejected normally.

## Scoring and penalty policy

`RouteCandidateMetrics` gains auditable continuity facts:

- `countryBlockCount`
- `countryReentryCount`
- `observedAvoidableCountryReentryCount`
- `repeatedCountryCodes`
- `provenConstraintDrivenCountryCodes`
- `unprovenProtectedCountryCodes`
- `countryContinuityAssessments`
- `unknownCountryStopIds`

Scoring first computes each viable candidate’s country blocks. Because all viable candidates retain the same stop occurrences, the scorer can derive the minimum observed block count for each known country across the generated hard-safe candidate set.

For candidate `C` and country `X`:

```text
observed avoidable re-entries for X = max(0, blocks(C, X) - minimum observed blocks(X) across generated viable candidates)
```

This gives the required distinction:

- `IN → IN → AE` has one India block and no re-entry.
- `IN → AE → TJ → IN` has two India blocks and one re-entry.
- If another generated viable candidate has one India block, that re-entry is observed avoidable and penalized.
- If no generated viable candidate has fewer India blocks, generation has established no impossibility claim. The split is classified from concrete canonical constraint evidence, not from candidate-set absence.

Candidate-set minima are one-way evidence: they can prove that a lower-block alternative was observed, but they cannot prove that a lower-block alternative is impossible. Bounded generation, and the current singleton behavior in the presence of any fixed commitment, make the opposite inference unsound.

Add typed penalty code `country-reentry` to the centralized scoring configuration. The initial default is **12 points per avoidable re-entry**. This is stronger than one excessive-transfer penalty and three times the existing four-point recommendation guard, but it is not absolute: a candidate with materially better supported travel, pacing or transport evidence can still win. Calibration may change the centralized value before implementation is accepted, but fixtures must not receive country-specific weights.

One penalty record is emitted per affected country, with:

- points;
- canonical country code and display name;
- the affected stop occurrence IDs;
- departure/re-entry leg indexes where known; and
- a truthful generic-friction reason.

No penalty text may claim that a visa is required, entry is prohibited or the traveller has specific immigration rights.

Country continuity remains a separate typed penalty rather than a sixth weighted component. Existing benchmark and consumer expectations for five components remain stable. The transport-convenience component reasons may include the continuity fact, while the points are applied once through the penalty list.

## Meaningful recommendation and hub exception

`assessRouteOrder` currently permits a small time trade-off only when the winning route removes `unnecessary-backtracking`. Generalize that existing exception to a structural-route improvement:

- removing `unnecessary-backtracking`; or
- removing `country-reentry`.

The existing bounds remain authoritative: at most 60 additional estimated minutes and at most 5% additional total transfer time. No new broader threshold is introduced.

This prevents a 15-minute estimate difference from preserving an avoidable country split, while a hub or geography-driven route with a large supported transfer advantage can retain the re-entry. The penalty itself remains soft, and the planner recommendation gate remains a second protection against weak evidence.

## Country-continuity classification and proof

Every repeated known-country block receives one of three explicit classifications:

```ts
type CountryContinuityStatus =
  | "avoidable"
  | "proven-constraint-driven"
  | "unproven-protected";

type CountryContinuityAssessment = {
  countryCode: string;
  status: CountryContinuityStatus;
  blockCount: number;
  reentryCount: number;
  observedLowerBlockCount?: number;
  affectedStopIds: string[];
  legIndexes: number[];
  proof?: {
    kind:
      | "fixed-position-chronology"
      | "fixed-gateway-position"
      | "authoritative-protected-order"
      | "hard-transport-rejection";
    constraintIds: string[];
  };
};
```

The classifier is pure. It accepts the analyzed route, the generated viable candidate analyses and zero or more typed `CountryContinuityConstraintProof` records. Those proof records are created only from canonical constraint data or from an explicitly evaluated lower-block order rejected by an authoritative hard rule. The classifier does not inspect raw prompts or invent a cause from candidate counts.

Candidate generation must retain narrowly scoped diagnostics for a country-block seed rejected by an existing hard transport or fixed-position check: the proposed stop-ID order, affected country code, hard issue code and referenced constraint IDs. It does not retain every rejected permutation or expand the 20-candidate viable bound. Scoring and validation consume the same typed assessments rather than independently interpreting absence.

### A. Avoidable

A lower-block ordering was actually generated, passed all existing hard constraints and retained every occurrence. This is positive evidence that the current split is avoidable within the engine’s current planning boundary. The observed difference is eligible for the centralized `country-reentry` penalty and, subject to the existing scoring and 60-minute/5% recommendation gate, automatic repair.

### B. Proven constraint-driven

Concrete canonical constraints themselves demonstrate that the split is required. Permitted proof is narrow and inspectable:

- dated or fixed occurrences whose chronology structurally requires `country A → another country → country A`;
- fixed start/end or gateway positions that structurally require another planned country between occurrences of the repeated country;
- an actual authoritative protected-order boundary supplied by the application contract; or
- a constructed lower-block arrangement that is demonstrably rejected by an existing hard transport rule, with the rejected order and hard issue code retained as diagnostic evidence.

The proof must identify the affected occurrence IDs and the canonical constraint or hard-rejection evidence. A generic fixed commitment, booking or schedule lock elsewhere in the trip is not proof. Nor is a singleton candidate set, an absent seed, `sequenceKind`, `decisionSelections.routeOrder: "entered"`, or raw prompt wording.

The current model has no general authoritative prompt-order field. Therefore `authoritative-protected-order` remains valid only when an existing application boundary supplies explicit typed evidence; #335 does not add prompt interpretation to manufacture that evidence.

### C. Unproven / protected by current planning boundary

The engine did not generate a lower-block viable alternative, but no permitted canonical proof demonstrates that the split is required. The route remains protected because the current generator or application boundary cannot safely produce and apply a change. The re-entry fact remains available for audit and review, but it receives no automatic repair and no explanation may claim that all valid routes require the split.

This state explicitly covers the current behavior where any unrelated fixed commitment collapses generation to the entered singleton order. That boundary must preserve the route without being relabeled as a semantic necessity.

`proven-constraint-driven` and `unproven-protected` receive zero `country-reentry` penalty points because no observed lower-block viable comparator exists. Their metrics remain distinct so downstream review cannot turn uncertainty into proof.

The engine does not infer hard order from raw prose. Existing ordered capture remains useful sequence input, not proof that reordering is forbidden. The Builder’s current Keep/apply semantics remain unchanged.

## Explanation contract

Scoring reasons become specific enough to support review:

- Avoidable: “India appears in two separate route blocks, adding one avoidable country re-entry.”
- Improved winner: “This order keeps Mumbai and Agra in one India block.”
- Proven constraint-driven: name the actual proof, for example “India remains in two route blocks because the fixed start and end positions require another planned country between them.”
- Unproven protected: “India appears in two route blocks. The current protected planning boundary did not produce a proven lower-block alternative, so Morrovia preserved the route without treating the split as required.”
- Unknown: “Country continuity was not scored for one stop because its canonical country is not confirmed.”

`explanationFor` should prefer “fewer avoidable country re-entries” over the current generic “fewer supported penalties” when that is a material difference between winner and runner-up.

`assessRouteOrder.reasons` should name country continuity when it is the reason a slightly slower candidate clears the meaningful-change guard. The existing summary, trade-off and confidence boundaries remain intact.

Builder Route Check may update its current one-line reason projection to recognize `country-reentry`; no new panel, control, layout or interaction is required.

## Validation, repair and Trip Health

Add `country-reentry` to `PlanValidationIssueCode` as a soft warning. Final-plan validation will use the shared analyzer, observed generated alternatives and explicit proof evidence to assign the same three-state classification as scoring.

- Avoidable split with no fixed/dated/locked protection and a numerically scoreable lower-block candidate selected by the shared scorer within the existing recommendation gate: `repairability: "automatic"`.
- Avoidable split whose lower-block alternative lacks enough transfer evidence to score: `repairability: "manual"`; validation must not promise an automatic reorder the scorer cannot support.
- Proven constraint-driven split: `repairability: "manual"` or no issue when the protected route is already acknowledged; evidence must name the concrete proof and it must never trigger automatic reorder.
- Unproven protected split: `repairability: "manual"` or no issue at an acknowledged application boundary; evidence must state that no lower-block alternative was observed and no constraint proof was established. It must never trigger automatic reorder or a `constraint-driven` explanation.
- Evidence includes country codes, block counts, affected stop IDs, observed lower-block alternatives and any concrete proof record. Candidate absence is recorded only as absence.

The existing bounded repair loop already routes order defects through `generateRouteCandidates` and `scoreRouteCandidates`. Add only automatically repairable `avoidable` issues to that existing route-order repair family; do not add a repair algorithm. `proven-constraint-driven` and `unproven-protected` issues remain advisory.

Trip Health can surface the final validator warning by adding the typed code to its existing critic projection. This preserves one source of truth and avoids a second review-only detector.

## Persistence and state preservation

Candidate metrics, candidate arrays and score detail remain transient exactly as today. `routeIntelligenceForPersistence` continues to strip them.

The concise persisted route assessment may retain the resulting human-readable reason, but no new mutable country grouping is stored. Country blocks are always derived from ordered canonical stop occurrences.

Applying a recommendation continues to use the current validated stop-ID permutation. Replan and cascade continue to preserve:

- stable stop occurrence IDs;
- repeated occurrences;
- canonical place IDs and country codes;
- selected places and authored days;
- fixed commitments, schedule locks and bookings;
- journey endpoints;
- canonical leg rebuilding; and
- current analytics semantics.

No persistence migration is required.

## TDD acceptance matrix

Implementation must begin with failing tests and proceed through the existing owners.

### Pure analysis

- One country block has zero re-entry.
- `A → B → A` has two A blocks and one re-entry.
- `A → B → A → B` records one re-entry for each repeated country.
- Repeat occurrences keep distinct stop IDs.
- Canonical aliases/codes resolve through the shared registry.
- Unknown identity never receives an invented classification or unsafe penalty.
- Unknown occurrences divide analysis into stable spans; re-entry is neither inferred nor joined across a barrier.

### Candidate generation

- The primary six-stop India fixture proves exhaustive generation includes a Mumbai–Agra-contiguous candidate.
- A seven-plus-stop alternating-country fixture proves bounded generation now includes at least one all-known country-block candidate.
- `IN1 → IN2 → unknown → JP1 → CN1 → JP2` can group the known suffix without moving any occurrence across the unknown barrier.
- Candidate count remains at most 20 and output is byte-for-byte deterministic across repeated runs.
- Fixed start/end, required stops, maximum stops, transport exclusions and maximum transfer constraints remain preserved.
- Repeated city occurrences are retained and never deduplicated by canonical place ID.

### Scoring

- The controlled India case that currently selects `Mumbai → Dubai → Dushanbe → Agra` now materially ranks a one-block India alternative above it.
- The exact Madrid round trip retains every requested stop and external endpoints while its winning stay order has one India block.
- Two or more India stops mixed with other countries default to one India block.
- Dushanbe plus two or three Tajikistan stops default to one Tajikistan block when feasible.
- Multi-stop Japan and China avoid `Japan → China → Japan → China` when a coherent block candidate exists.
- A genuinely authoritative protected order remains unchanged and is explained as proven constraint-driven only when that typed boundary is actually present.
- Fixed-date/booked-anchor protection remains unchanged and does not receive an avoidable penalty; only chronology that structurally requires the split is labeled proven constraint-driven.
- An unrelated fixed commitment that collapses generation to a singleton preserves the split as `unproven-protected`, never as `proven-constraint-driven`.
- Absence of a lower-block generated candidate never appears in metrics or prose as proof that the split is required.
- A hard-transport proof is accepted only when the concrete lower-block arrangement and authoritative hard rejection are recorded.
- A hub/geographic fixture proves a split route can still win when its supported advantage exceeds the soft penalty and recommendation guard.
- Existing sensible linear routes retain accepted quality.

### Integration

- `assessRouteOrder` can recommend a country-contiguous route within the existing 60-minute/5% structural trade-off bound.
- Builder Route Check applies the same occurrence-safe permutation and names country continuity in its existing reason.
- Final-plan validation emits one typed country-re-entry warning without duplicating backtracking warnings.
- Bounded repair uses the existing scorer for automatically repairable `avoidable` issues, preserves every hard constraint and terminates within the current loop bound.
- Validator and repair retain `proven-constraint-driven` and `unproven-protected` as advisory states and never manufacture a reorder.
- Trip Health consumes the validator issue once.
- Saved-trip replan preserves `countryCode`, canonical identity, endpoints, locks, bookings and authored state.

### Benchmarks and gauntlets

- Add country-continuity coverage to the existing route-quality calibration/engine fixture set rather than creating a second routing benchmark framework.
- Record before/after totals, route-order dimension changes, hard failures, warnings and any degraded previously passing route.
- Run repeated deterministic comparisons.
- Run prompt-engine and global-routing coverage because raw-prompt trips feed the same planner, while keeping prompt interpretation itself out of scope.

## Verification commands after implementation

At minimum:

- `npm run test:route-candidates`
- `npm run test:route-scoring`
- `npm run test:route-intelligence`
- `npm run test:plan-validator`
- `npm run test:trip-replan`
- `npm run test:trip-cascade`
- `npm run test:trip-health`
- `npm run test:trip-capture`
- `npm run test:engine-benchmark`
- `npm run test:global-routing`
- `npm run test:prompt-engine`
- `npm run test:state-preservation`
- `npm run test:persistence`
- `npm run benchmark:engine`
- `npm run benchmark:route-quality-calibration`
- `npm run benchmark:global-routing`
- `npm run benchmark:prompt-engine`
- `npm run typecheck`
- `npm run build:check`
- `git diff --check`

Attempt `npm run lint` only under the accepted baseline policy. If Next.js still opens its first-time interactive ESLint setup, cancel it, report lint as baseline-unavailable and do not change lint infrastructure.

## Recorded pre-implementation baseline

### Engine-v2

`npm run benchmark:engine` produced:

- 327 pass
- 50 warnings
- 0 failures
- constraint compliance: 156 / 0 / 0
- route efficiency: 21 / 2 / 0
- pacing: 78 / 14 / 0
- transfer quality: 44 / 19 / 0
- preference fit: 5 / 15 / 0
- unsupported claims: 23 / 0 / 0

The command exits non-zero because the accepted #333 stack already differs from the preserved historical snapshot. That comparison is baseline context, not a #335 regression.

### Route-quality calibration

`npm run benchmark:route-quality-calibration` passed:

- 20 fixtures
- 9 GOOD
- 11 ACCEPTABLE BUT SUBOPTIMAL
- 0 CLEARLY POOR
- 0 hard failures
- 9 route orders changed
- 11 deliberately unchanged
- average transfer: 967 minutes
- median transfer: 840 minutes

### Global routing

`npm run benchmark:global-routing` produced:

- 51 fixtures
- 5 PASS
- 46 PASS WITH EXPECTED UNCERTAINTY
- 0 WARNING
- 0 HARD FAILURE
- all five capability scores at 100%
- 46 unknown transfers
- 59 unresolved/base-required places

It exits non-zero because the stored baseline expects 47 unknown transfers; the accepted base now has two rather than three unknown transfers in the Uzbekistan Silk Road fixture.

A combined focused regression run passed 139 of 141 tests. The two failures are both accepted-base global-routing drift:

1. a source assertion still expects `mapRouteLegsFromTrip(customTrip)` after the #333 map refactor; and
2. the stored global-routing snapshot still expects the previous Uzbekistan unknown-transfer count.

These failures must be held constant or resolved separately; #335 must not disguise them as country-routing changes.

### Prompt engine

`npm run benchmark:prompt-engine` passed and matched its baseline at 208/224:

- intent 28/32
- constraints 28/32
- route 26/32
- time realism 32/32
- state preservation 32/32
- uncertainty 30/32
- explanation 32/32

## Likely implementation files

Production:

- `lib/easyt/route-country-continuity.ts` — new pure analyzer, segmented grouping helper and proof-safe classifier
- `lib/easyt/route-candidates.ts` — bounded country-block seeds, source type and explicit hard-rejection diagnostics
- `lib/easyt/route-scoring.ts` — metrics, typed penalty, config and explanation
- `lib/easyt/planner.ts` — scoring inputs, structural trade-off and route reason
- `lib/easyt/plan-validator.ts` — typed warning and shared analysis
- `lib/easyt/plan-repair.ts` — existing route-order repair-family inclusion and scoring inputs
- `lib/easyt/trip-replan.ts` — preserve `countryCode` in saved-trip projection
- `lib/easyt/review.ts` — surface the validator issue through existing Trip Health projection
- `app/journey/new/trip-builder.tsx` — tiny existing Route Check reason projection only

Tests and benchmarks:

- `tests/route-country-continuity.test.ts`
- `tests/route-candidates.test.ts`
- `tests/route-scoring.test.ts`
- `tests/route-intelligence.test.ts`
- `tests/plan-validator.test.ts`
- `tests/trip-replan.test.ts`
- `tests/trip-health.test.ts`
- `tests/trip-builder-gate.test.ts`
- `benchmarks/route-quality-calibration/fixtures.ts`
- `tests/route-quality-calibration.test.ts`
- engine/global/prompt snapshots or expectations only when the measured #335 delta is reviewed and intentional

No database migration, new UI component, new service, new resolver or remote dependency is expected.

## Risk and estimated size

**Risk: High.** This changes route ranking and bounded final-plan repair, both of which can alter a traveller’s itinerary order. The risk is controlled by hard-constraint filtering before scoring, a small bounded seed, a centralized soft penalty, the existing meaningful-change gate, independent final validation and benchmark comparison.

**Estimated implementation size: Medium, approximately 2–4 focused engineering days** including TDD fixtures, calibration and full branch verification. The product-code change should remain modest; most effort is in proving constraint preservation and avoiding route-quality regressions.

## Architectural conflict assessment

There is no blocking architectural conflict. The current candidate/scoring system is the correct owner and already exposes the necessary deterministic extension points.

Two gaps must be treated explicitly during implementation:

1. The exact India example is not a failing winner at the accepted SHA; acceptance must test the country-continuity invariant and controlled scorer failure, not assert a false baseline ordering.
2. The engine has no reliable first-class “authoritative raw-prompt order” constraint. #335 will respect existing protected candidate/application boundaries and will not infer hard order from broad ordered-language syntax. Adding a new prompt-order product model would be a separate decision.

Neither gap requires a second optimizer, UI redesign or scope expansion.

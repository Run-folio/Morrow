# Country-Contiguous Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Morrovia strongly prefer coherent country blocks while preserving hard constraints and distinguishing observed avoidability from proven necessity and unproven protected routes.

**Architecture:** Extend the existing `RouteCandidate` generator, scorer, planner, validator and repair loop. A pure country-continuity module resolves canonical countries, analyzes stable known spans, builds segmented block seeds and classifies each repeated block from positive evidence. Candidate minima may establish observed avoidability only; proven constraint-driven status requires typed canonical proof, while unsupported singleton/protected cases remain `unproven-protected`.

**Tech Stack:** TypeScript, Node test runner, Next.js, existing deterministic route engine and benchmark harnesses.

**Spec:** `docs/superpowers/specs/2026-09-23-country-contiguous-routing-design.md`

## Global Constraints

- Start from `04cf724848fb4312d7222782e9073a065b1faaec` plus documentation commits `9b4a9eb` and `ab24aa2` on `codex/country-contiguous-routing-335`.
- Work only in `/Users/shaun/.codex/worktrees/country-contiguous-routing-335/Morrovia`.
- Work test-first and commit after each independently reviewable task.
- Keep all work local. Do not push, merge, deploy or trigger remote builds.
- Do not add another optimizer, CMS, service, database migration, LLM ordering step or country resolver.
- Preserve the 20-candidate bounded maximum, hard constraints, stable stop-occurrence IDs, canonical place identity, external origin/end semantics and current application boundaries.
- Do not infer authoritative order from raw prompt text, `sequenceKind` or `decisionSelections.routeOrder`.
- Candidate absence never proves impossibility. Only explicit typed canonical evidence may produce `proven-constraint-driven`.
- In country-continuity analysis and country-block grouping, treat unknown country occurrences as immovable barriers. Never infer their country or move a known block across them.
- Apply the country penalty only to `avoidable` assessments with an actually observed hard-safe lower-block candidate.
- Keep `proven-constraint-driven` and `unproven-protected` advisory and ineligible for automatic repair.
- Do not implement #321, visa advice or a Builder redesign.
- Do not alter lint infrastructure. If `npm run lint` launches the accepted first-time interactive setup, cancel and report it as baseline-unavailable.

## Review Focus

1. The unrelated-fixed-commitment regression must preserve the singleton route as `unproven-protected`, never `proven-constraint-driven`.
2. The unknown-barrier fixture must improve only its fully known suffix and keep the unknown occurrence at the same boundary.
3. Every `proven-constraint-driven` result must carry concrete proof kind, affected occurrence IDs and constraint/rejection identifiers.
4. The 12-point centralized penalty and 60-minute/5% structural recommendation gate must remain soft, calibrated and deterministic.
5. Validator, repair, Builder and Trip Health must consume the shared assessment rather than recreate country logic.

---

## Task 1: Preserve country identity through replan and state transitions

**Files:**

- Modify: `lib/easyt/trip-replan.ts`
- Modify: `tests/trip-replan.test.ts`
- Modify when needed for explicit regression only: `tests/cascade.test.ts`
- Modify when needed for explicit regression only: `tests/state-preservation-torture.test.ts`

- [ ] Add a failing saved-trip replan test where every `TripStop.countryCode` survives the `PlannerStop` projection, recommendation/application and cascade.

- [ ] Include repeated same-place occurrences, journey endpoints, canonical place IDs, locks, bookings, authored days and canonical legs in the fixture so a route permutation cannot silently drop adjacent state.

- [ ] Run `npm run test:trip-replan` and confirm the country-code assertion fails on the accepted base.

- [ ] Add the missing projection field only:

```ts
countryCode: stop.countryCode,
```

- [ ] Run `npm run test:trip-replan`, `npm run test:trip-cascade`, `npm run test:state-preservation`, `npm run test:persistence`, `npm run typecheck` and `git diff --check`.

- [ ] Commit the exact files changed:

```bash
git add lib/easyt/trip-replan.ts tests/trip-replan.test.ts
git commit -m "fix: preserve country identity through replan"
```

Add `tests/cascade.test.ts` or `tests/state-preservation-torture.test.ts` only if the explicit regression required changing them.

## Task 2: Add the pure country-continuity analyzer and proof-safe classifier

**Files:**

- Create: `lib/easyt/route-country-continuity.ts`
- Create: `tests/route-country-continuity.test.ts`

- [ ] Write failing analyzer tests for one block, `A → B → A`, alternating `A → B → A → B`, repeat occurrence IDs, canonical aliases/codes and external endpoint exclusion.

- [ ] Write failing barrier tests showing `IN → unknown → IN` is not joined across the barrier while `unknown → JP → CN → JP` detects the suffix re-entry.

- [ ] Write failing classifier tests for all three states:

```ts
assert.equal(classifyCountryContinuity({ route: current, viableAlternatives: [lowerBlock] })[0]?.status, "avoidable");
assert.equal(classifyCountryContinuity({ route: current, viableAlternatives: [current], proofs: [gatewayProof] })[0]?.status, "proven-constraint-driven");
assert.equal(classifyCountryContinuity({ route: current, viableAlternatives: [current] })[0]?.status, "unproven-protected");
```

- [ ] Run `node --experimental-strip-types --test tests/route-country-continuity.test.ts` and confirm failure because the module/API does not exist.

- [ ] Implement canonical resolution through `countryCodeFor`, maximal known spans and deterministic block analysis. Do not inspect raw names beyond the shared registry.

- [ ] Implement the shared types and pure classifier:

```ts
export type CountryContinuityStatus =
  | "avoidable"
  | "proven-constraint-driven"
  | "unproven-protected";

export type CountryContinuityConstraintProof = {
  countryCode: string;
  kind: "fixed-position-chronology" | "fixed-gateway-position"
    | "authoritative-protected-order" | "hard-transport-rejection";
  stopIds: string[];
  constraintIds: string[];
};

export function classifyCountryContinuity(input: {
  route: RouteCountryContinuity;
  viableAlternatives: RouteCountryContinuity[];
  proofs?: readonly CountryContinuityConstraintProof[];
}): CountryContinuityAssessment[];
```

- [ ] Ensure proof selection is explicit: first use an observed lower-block viable route, then a matching typed proof, otherwise return `unproven-protected`.

- [ ] Run the focused test until it passes, then run `npm run typecheck` and `git diff --check`.

- [ ] Commit:

```bash
git add lib/easyt/route-country-continuity.ts tests/route-country-continuity.test.ts
git commit -m "feat: analyze country continuity safely"
```

## Task 3: Add bounded segmented country-block candidates and rejection evidence

**Files:**

- Modify: `lib/easyt/route-candidates.ts`
- Modify: `tests/route-candidates.test.ts`

- [ ] Add failing tests for an all-known seven-plus-stop route where the existing bounded seeds omit a contiguous alternative.

- [ ] Add the required barrier regression:

```ts
const entered = [in1, in2, unknown, jp1, cn1, jp2];
const generated = generateRouteCandidates(inputFor(entered));
assert.ok(generated.candidates.some(({ stops }) =>
  ids(stops).join("|") === "in1|in2|unknown|jp1|jp2|cn1"));
assert.ok(generated.candidates
  .filter(({ source }) => source === "country-block")
  .every(({ stops }) => stops.indexOf(unknown) === 2));
```

- [ ] Add failing assertions for distinct repeated city occurrences, fixed start/end, required stops, hard transport filters, determinism and `candidates.length <= 20`.

- [ ] Add a failing diagnostic test where a constructed lower-block order is rejected by a hard transport rule and the exact order plus authoritative issue code are retained.

- [ ] Run `npm run test:route-candidates` and confirm the new assertions fail for missing `country-block` seeds/diagnostics.

- [ ] Extend `RouteCandidateSource` with `country-block`, add at most stable and reverse segmented seeds before local swaps, and reserve room inside the existing 20-candidate slice.

- [ ] Keep unknown occurrences fixed between independently grouped known spans. Apply fixed-start/fixed-end affinity only in the first/last known span.

- [ ] Extend generation output narrowly:

```ts
export type CountryBlockRejection = {
  countryCode: string;
  stopIds: string[];
  issueCodes: RouteConstraintIssue["code"][];
  constraintIds: string[];
};

export type RouteCandidateGeneration = {
  // existing fields
  countryBlockRejections: CountryBlockRejection[];
};
```

Retain at most the first lower-block hard rejection per affected country; do not retain all rejected permutations and do not count diagnostics toward the 20 viable candidates.

- [ ] Ensure every early return supplies `countryBlockRejections: []`, and keep stop-ID deduplication unchanged.

- [ ] Run `npm run test:route-candidates`, `npm run typecheck` and `git diff --check`.

- [ ] Commit:

```bash
git add lib/easyt/route-candidates.ts tests/route-candidates.test.ts
git commit -m "feat: generate bounded country block routes"
```

## Task 4: Integrate the three-state assessment into scoring

**Files:**

- Modify: `lib/easyt/route-scoring.ts`
- Modify: `tests/route-scoring.test.ts`

- [ ] Add failing score tests for the controlled India comparison: the 400-minute split route versus the 430-minute contiguous route must apply a material penalty to the observed avoidable re-entry.

- [ ] Add failing metric assertions for:

```ts
metrics.observedAvoidableCountryReentryCount
metrics.provenConstraintDrivenCountryCodes
metrics.unprovenProtectedCountryCodes
metrics.countryContinuityAssessments
metrics.unknownCountryStopIds
```

- [ ] Add the mandatory regression: supply a singleton split candidate plus an unrelated fixed-commitment boundary and no proof. Assert zero `country-reentry` penalty, status `unproven-protected`, and no constraint-driven claim.

- [ ] Add a proven fixed-gateway fixture using explicit typed proof, and a hub/geographic fixture where an avoidable split may still win because its supported advantage exceeds the soft penalty.

- [ ] Run `npm run test:route-scoring` and confirm the new expectations fail.

- [ ] Add `country-reentry` to `RoutePenaltyCode`, `RouteScoringConfig.penalties` and the centralized default at 12 points. Bump the config version once.

- [ ] Add `countryContinuityProofs?: readonly CountryContinuityConstraintProof[]` to `ScoreRouteCandidatesInput`. Analyze all generated viable candidates once, then classify each candidate with positive lower-block evidence plus the supplied proofs.

- [ ] Apply one penalty per affected `avoidable` country only:

```ts
if (assessment.status === "avoidable") {
  penalties.push({
    code: "country-reentry",
    points: config.penalties["country-reentry"] * avoidableReentries,
    reason: `${countryName} appears in separate route blocks, adding ${avoidableReentries} avoidable country re-entry.`,
    stopIds: assessment.affectedStopIds,
    legIndexes: assessment.legIndexes,
  });
}
```

- [ ] Update `explanationFor` to prefer “fewer avoidable country re-entries” when that is the material penalty difference. Add proof-specific and unproven-protected reasons; never say every valid/hard-safe route requires a split unless a typed proof says so.

- [ ] Run `npm run test:route-scoring`, `npm run typecheck` and `git diff --check`.

- [ ] Commit:

```bash
git add lib/easyt/route-scoring.ts tests/route-scoring.test.ts
git commit -m "feat: score observed country reentry"
```

## Task 5: Wire canonical proofs, recommendation gating and planner explanations

**Files:**

- Modify: `lib/easyt/route-country-continuity.ts`
- Modify: `lib/easyt/planner.ts`
- Modify: `tests/route-intelligence.test.ts`

- [ ] Add failing tests for fixed gateways that structurally force `A → B → A`, and assert a concrete `fixed-gateway-position` proof with the relevant stop/constraint IDs.

- [ ] Add failing tests for three linked dated/fixed occurrences whose chronology proves `A → B → A`, plus a negative case where one unrelated dated commitment protects generation but proves nothing about the country split.

- [ ] Add a failing test showing a generic unrelated fixed commitment still collapses generation and holds the entered order, but scoring/reasons classify the split as `unproven-protected` rather than proven.

- [ ] Add failing tests around the existing structural gate: a contiguous winner may cost at most 60 extra minutes and 5%; exceeding either bound keeps the current route.

- [ ] Add failing route reasons that name country continuity when it is the structural difference, including the exact Madrid/India quality assertions without requiring one exact overall ordering.

- [ ] Run `npm run test:route-intelligence` and confirm the new assertions fail.

- [ ] Add pure fixed-gateway and linked fixed-position chronology proof builders. Chronology qualifies only when canonical stop IDs and dates structurally order every affected same-span `A → B → A` transition; country/count matches or proof from another unknown-barrier span do not qualify. Retain `countryBlockRejections` as diagnostics; a single rejected bounded seed does not prove every lower-block ordering impossible and must not become `hard-transport-rejection` proof.

- [ ] Pass those proofs to `scoreRouteCandidates`. Generalize the existing backtracking exception without changing its numeric bounds:

```ts
const structuralCodes = ["unnecessary-backtracking", "country-reentry"] as const;
const replacesStructuralPenalty = structuralCodes.some((code) =>
  originalPenalties.has(code) && !winnerPenalties.has(code));
```

- [ ] Preserve the current fixed-commitment early return and application boundary. Its reason may say the route is protected, but not that the country split is required unless chronology proof exists.

- [ ] Run `npm run test:route-intelligence`, `npm run test:route-scoring`, `npm run test:route-candidates`, `npm run typecheck` and `git diff --check`.

- [ ] Commit:

```bash
git add lib/easyt/route-country-continuity.ts lib/easyt/planner.ts tests/route-intelligence.test.ts
git commit -m "feat: explain country continuity recommendations"
```

## Task 6: Classify final plans and restrict repair to observed avoidability

**Files:**

- Modify: `lib/easyt/route-country-continuity.ts`
- Modify: `lib/easyt/plan-validator.ts`
- Modify: `lib/easyt/plan-repair.ts`
- Modify: `tests/plan-validator.test.ts`

- [ ] Add failing validator tests for an automatic avoidable split whose lower-block alternative wins within the existing recommendation gate, a manual unscoreable avoidable split, a proven dated chronology, a bounded hard-transport rejection that remains unproven, and an unproven protected singleton caused by an unrelated commitment.

- [ ] In the unrelated-commitment case assert:

```ts
assert.equal(issue.evidence.continuityStatus, "unproven-protected");
assert.equal(issue.repairability, "manual");
assert.doesNotMatch(issue.message, /every|required by|constraint-driven/i);
```

- [ ] Add failing repair tests proving only an automatic `avoidable` issue enters `reorderRoute`; proven and unproven states leave stop order, dates, locks, bookings and authored allocation untouched.

- [ ] Run `npm run test:plan-validator` and confirm the new cases fail.

- [ ] Add `country-reentry` to `PlanValidationIssueCode` and issue ordering. Use the same generation, analysis, proof and classification helpers as the planner.

- [ ] Build `fixed-position-chronology` proof only when linked dated/fixed occurrences themselves establish `A → B → A`. An unrelated dated occurrence or generic booking must not qualify.

- [ ] Include `continuityStatus`, block counts, affected occurrence IDs, observed alternative IDs and proof kind/constraint IDs in evidence. Do not add a second country detector.

- [ ] Add `country-reentry` to the existing route-order repair family only when `repairability === "automatic"` and evidence status is `avoidable`. Keep the current bounded validate → repair → validate loop.

- [ ] Run `npm run test:plan-validator`, `npm run typecheck` and `git diff --check`. The existing repair-loop coverage is in `tests/plan-validator.test.ts`.

- [ ] Commit:

```bash
git add lib/easyt/route-country-continuity.ts lib/easyt/plan-validator.ts lib/easyt/plan-repair.ts tests/plan-validator.test.ts
git commit -m "feat: validate country reentry safely"
```

## Task 7: Project the shared reason into Builder and Trip Health

**Files:**

- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `lib/easyt/review.ts`
- Modify: `tests/trip-builder-gate.test.ts`
- Modify: `tests/trip-builder-route-check-presentation.test.ts`
- Modify: `tests/trip-health.test.ts`

- [ ] Add failing source/behavior tests proving Builder Route Check recognizes `country-reentry` through the existing one-line reason and applies the same occurrence-safe stop-ID permutation.

- [ ] Add failing Trip Health tests proving a validator `country-reentry` issue is surfaced once, including its advisory repairability/status, with no duplicate review-only country detector.

- [ ] Add an interaction regression showing fixed commitments or schedule locks continue to block Builder apply even if country continuity would improve.

- [ ] Run `npm run test:builder-gate`, `node --experimental-strip-types --test tests/trip-builder-route-check-presentation.test.ts` and `npm run test:trip-health`; confirm new assertions fail.

- [ ] Extend only the existing reason projection and `surfacedCriticCodes`. Reuse current controls, layout, analytics and application logic; add no component, panel or route control.

- [ ] Run the three focused commands again, then `npm run audit:ui`, `npm run typecheck` and `git diff --check`.

- [ ] Commit:

```bash
git add app/journey/new/trip-builder.tsx lib/easyt/review.ts tests/trip-builder-gate.test.ts tests/trip-builder-route-check-presentation.test.ts tests/trip-health.test.ts
git commit -m "feat: surface country continuity review"
```

## Task 8: Add acceptance fixtures and calibrate without overfitting

**Files:**

- Modify: `benchmarks/route-quality-calibration/fixtures.ts`
- Modify: `tests/route-quality-calibration.test.ts`
- Modify when an intentional measured delta requires it: relevant engine/global/prompt benchmark expectations

- [ ] Add deterministic quality fixtures for the Madrid/India route, multi-stop India, Tajikistan, alternating Japan/China, repeated city occurrence, hub/geographic exception, unknown barrier, large bounded route and an existing sensible linear route.

- [ ] Assert qualities rather than one arbitrary full permutation: all stops retained, endpoints preserved, relevant country block count, hard constraints held and determinism across repeated runs.

- [ ] Add benchmark assertions that separately count `avoidable`, `proven-constraint-driven` and `unproven-protected`. Include the unrelated-fixed-commitment singleton regression in the corpus.

- [ ] Run `npm run test:route-quality-calibration` and confirm new fixtures fail before any final calibration.

- [ ] Make only evidence-led centralized calibration changes. Keep the initial country penalty at 12 unless the full corpus demonstrates a regression; document any change in the fixture expectation and commit message, never with country-specific weights.

- [ ] Run twice and compare output for determinism:

```bash
npm run benchmark:route-quality-calibration
npm run benchmark:route-quality-calibration
```

- [ ] Run `npm run test:engine-benchmark`, `npm run test:global-routing`, `npm run test:prompt-engine` and record intentional versus accepted-baseline deltas. Do not update the stale #333 map assertion or Uzbekistan snapshot unless #335 itself changes the measured value and the change is reviewed.

- [ ] Run `npm run typecheck` and `git diff --check`.

- [ ] Commit the exact benchmark files changed:

```bash
git add benchmarks/route-quality-calibration/fixtures.ts tests/route-quality-calibration.test.ts
git commit -m "test: cover country contiguous routing"
```

Add benchmark expectation files only when the reviewed #335 delta requires them.

## Task 9: Run the whole-branch regression and review

**Files:**

- Review: all branch changes since `ab24aa2`
- Modify: none unless a verified #335 regression is found

- [ ] Confirm branch ancestry, scope and task commits:

```bash
git merge-base --is-ancestor 04cf724848fb4312d7222782e9073a065b1faaec HEAD
git log --oneline 04cf724848fb4312d7222782e9073a065b1faaec..HEAD
git diff --stat ab24aa2..HEAD
git status --short
```

- [ ] Run the full focused regression suite:

```bash
node --experimental-strip-types --test \
  tests/route-country-continuity.test.ts \
  tests/route-candidates.test.ts \
  tests/route-scoring.test.ts \
  tests/route-intelligence.test.ts \
  tests/plan-validator.test.ts \
  tests/trip-replan.test.ts \
  tests/cascade.test.ts \
  tests/trip-health.test.ts \
  tests/trip-builder-gate.test.ts \
  tests/trip-builder-route-check-presentation.test.ts \
  tests/route-quality-calibration.test.ts
```

- [ ] Run the wider required suites:

```bash
npm run test:trip-capture
npm run test:state-preservation
npm run test:persistence
npm run test:engine-benchmark
npm run test:global-routing
npm run test:prompt-engine
npm run benchmark:engine
npm run benchmark:route-quality-calibration
npm run benchmark:global-routing
npm run benchmark:prompt-engine
```

- [ ] Record the accepted-base benchmark exceptions separately: engine historical comparison drift, the stale #333 `mapRouteLegsFromTrip(customTrip)` assertion and the Uzbekistan unknown-transfer snapshot. Any additional failure is a #335 regression until proven otherwise.

- [ ] Run static/UI/build verification:

```bash
npm run typecheck
npm run audit:ui
npm run build:check
npm run build-storybook
git diff --check
```

- [ ] Attempt `npm run lint`. If it launches Next.js first-time interactive ESLint setup, cancel it, record lint as unavailable due to the accepted baseline and do not modify package/config files.

- [ ] Search for forbidden or stale semantics:

```bash
rg -n "every hard-constraint-safe candidate|constraintDrivenCountryCodes|infer.*country|visa|required.*re-entry" lib app tests benchmarks
rg -n "TODO|FIXME|placeholder|coming soon" lib/easyt/route-country-continuity.ts lib/easyt/route-candidates.ts lib/easyt/route-scoring.ts lib/easyt/planner.ts lib/easyt/plan-validator.ts lib/easyt/plan-repair.ts
```

- [ ] Review every `proven-constraint-driven` construction site and verify its typed evidence. Review every automatic `country-reentry` repair and verify an observed viable lower-block candidate exists.

- [ ] Review the full diff for canonical identity, occurrence preservation, hard constraints, unknown barriers, persistence boundaries, analytics stability and absence of #321/visa/Builder redesign scope.

- [ ] If review requires a fix, first add or tighten a failing regression, implement the smallest correction, rerun affected commands and commit it as a focused review-fix commit. Otherwise leave the worktree clean without an empty commit.

- [ ] Report final HEAD, commits by task, files changed, all test/build/benchmark results, accepted baseline exceptions, remaining Critical/Important/Minor issues and a `READY TO STACK WITH #333` or `STOP FOR REVIEW` recommendation. Do not push, merge or deploy.

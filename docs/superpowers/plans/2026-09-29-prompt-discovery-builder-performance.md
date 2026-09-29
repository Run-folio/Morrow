# Prompt to Discovery / Builder Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a traveller reach useful, editable Builder content sooner after Stops or Describe submission, while preserving canonical interpretation, occurrence identity and recovery.

**Architecture:** Homepage durably hands off frozen input and navigates; the mounted Builder alone requests essential Describe interpretation. The existing capture endpoint offers an intent-only mode, while Builder publishes bounded place lookups per occurrence and retains its existing canonical save and readiness owners.

**Tech Stack:** Next.js 15, React, TypeScript, browser storage and existing recovery/CAS, `node:test`, Storybook, current Journey components/tokens.

**Spec:** `docs/superpowers/specs/2026-09-29-prompt-discovery-builder-performance-design.md` (`5b66ef54b5e3e3d2bda7fec43f93bd365cd2a1fb`). Read it before Task 1.

## Global Constraints

- Implement against the accepted New Trip source through `0860d4ff87ca26323d9f04d29f941b7b93b123a3`; the traced `cb66557978ae3f7393257affaaf254c1ff379519` alone lacks the shared entry and semantic receipt contract. Integrate accepted history in the isolated branch before product edits, preserving newer candidate work. Stop on an unsafe conflict; do not cherry-pick the final test commit alone.
- Do not edit the dirty staging checkout or staging/main branches. No push, deploy, CI, database or cloud change. No new dependency, draft store, persistence owner, capture owner, queue or streaming subsystem.
- `TripBuilderDocument` owns interpretation requests, canonical mutations, recovery and persistence. Homepage owns only its existing intake/receipt/navigation boundary. Direct New Trip submits into the mounted Builder without self-navigation.
- `homepageSemanticInputFingerprint` identifies traveller-controlled input; `homepageSubmissionFingerprint` verifies a projected draft. A pending receipt has no projected fingerprint. Legacy exact handoffs and completed-receipt duplicate prevention remain intact.
- Never promote speculative text to a confirmed stop, drop an unresolved mention, merge repeated occurrences, bypass existing route/commitment/night/feasibility checks, or count a shell/spinner as actionable.
- Preserve existing EN/ES behavior, keyboard/focus and mobile touch targets. Reuse shared production controls/status patterns after reading `docs/design-system.md`; Storybook uses production components.
- Optional model destination suggestions/assessments have **no downstream request owner in the traced baseline**: `canonicalizePlanningSuggestions` is called only inside `/api/journey-capture`. Recheck the integrated source before Task 2. If still absent, defer those optional fields in intent-only mode; do not add a separate model request to recover them. Legitimate existing interpretation fallback attempts remain governed by current validation. Keep the full capture mode unchanged for existing consumers.
- RED → GREEN → focused commit for each numbered task. Do not weaken a test or UI-audit allowance. Record fixture versus live-provider timings separately.

## Review Focus

- A second tab submits the same frozen intake while the first is hydrating: both must converge on one reserved trip ID (Tasks 1 and 4).
- React effect replay or a late model response after account switch must not start/apply a second interpretation (Task 3).
- A valid semantic result with only a broad country must lead to actionable Discovery, not a guessed route stop or “ready” route (Tasks 2 and 6).
- An aborted shared lookup must not poison retry for the surviving occurrence; repeated names still have separate IDs (Task 5).
- A storage quota error after the first staged write must preserve previous work and prevent unsafe navigation (Tasks 1 and 4).

## Source and evidence gate before Task 1

This is preparation, not a feature task or permission to edit product code while the plan is under review.

1. In the isolated `codex/prompt-discovery-performance` worktree, verify clean status and merge the **full accepted New Trip branch history** through `0860d4f` into the implementation branch using normal Git integration. Compare merge-base `8fb0319`; preserve newer candidate work. If accepted source has changed, inspect the new tip and stop for review before substituting it.
2. Run the accepted New Trip receipt, homepage and Builder owner tests before performance edits. Capture an optimized local-app **before** baseline for Stops and Describe with matched fixture inputs, source SHA, environment, cold/warm state and milestone definitions. If provider credentials are unavailable, label model/provider baseline unavailable instead of substituting fixture time for live latency. Keep baseline screenshots and timings under `docs/product/prompt-discovery-performance-evidence/`.
3. Re-run `rg -n 'canonicalizePlanningSuggestions|planningSuggestions|planningAssessment' app lib components` on integrated source. Record the actual producer and any later request owner in the evidence README. The traced baseline has no later owner, so Task 2 defaults to deferral unless this check proves otherwise.

## File and interface map

| Owner | Planned responsibility |
| --- | --- |
| `lib/easyt/home-trip-handoff.ts` | Versioned pending receipt/envelope, frozen-input validation, staged handoff compatibility, projected-draft acknowledgement, existing occurrence projection. No new storage key. |
| `app/journey/new/new-trip-entry-state.ts` | Pure precedence gate for pending direct intake and pending homepage URL handoff, beside accepted completed/legacy paths. |
| `app/journey/home/home-trip-starter.tsx`, `app/journey/new/new-trip-starter.tsx` | Pass validated frozen input to existing owners; remove client capture from both submission controllers. |
| `app/journey/new/trip-builder.tsx` | Sole request generation, in-memory projection/application, scoped async result application, `saveTripRecovery` acknowledgement and existing UI. Extract a small pure scope guard beside it only if tests need one. |
| `app/api/journey-capture/route.ts`, `lib/easyt/journey-capture-client.ts` | Add opt-in intent-only mode, preserve default full mode. Reuse `captureJourneyBriefFromSemanticIntent` without provider and deterministic fallback. |
| `lib/easyt/home-trip-handoff.ts` resolution seam | Add incremental bounded resolver and session-local lookup deduplication, while retaining `resolveHandoffBatch` compatibility. |
| `lib/easyt/planning-attempt-performance.ts` (new, small) | Opaque local milestone recording only; optional existing consent-gated analytics use stays in current analytics owner. |
| `tests/`, `app/journey/new/trip-builder-review.stories.tsx`, evidence README/screenshots | Behavior tests, production-component states and matched local-browser acceptance. |

**Pinned receipt interface for Tasks 1–4:**

```ts
type PendingIntakeReceipt = {
  version: 2;
  phase: "pending-interpretation";
  ownerId: string | null;
  handoffId: string;
  tripId: string;
  inputRevision: number;
  semanticInputFingerprint: string;
  frozenSnapshot: HomepageInputSnapshot;
};
type PendingHomeTripHandoff = {
  version: 2;
  phase: "pending-interpretation";
  receipt: PendingIntakeReceipt;
};
```

`StoredHomepageInput.receipt` accepts the existing projected `HomepageHandoffReceipt` or `PendingIntakeReceipt`. The frozen snapshot lives inside the existing owner-scoped receipt record; the normal editable `StoredHomepageInput.snapshot` may later change without changing the submitted fingerprint. Homepage also writes `PendingHomeTripHandoff` to the existing `HOME_TRIP_DRAFT_KEY`, with byte-for-byte matching identity fields. Direct New Trip writes only the owner-scoped intake record and keeps the mounted Builder's reservation; it never writes a navigation handoff. V2 validation recomputes `homepageSemanticInputFingerprint(frozenSnapshot)`. V1 projected receipts keep their existing reader and draft fingerprint. No raw pending record passes `homepageHandoffReceiptForOwner`.

**Canonical acknowledgement:** existing `saveTripRecovery(trip, { ownerId, replace })` returning `stored: true` is the first durable Builder write. For a projected pending intake, additionally require same reserved trip ID, owner, token and `homepageHandoffMatchesTrip(projectedDraft, trip)` (or its direct-intake equivalent) before retiring the pending envelope or replacing the direct pending receipt with the completed projected receipt. Keep the pending input if either check or the receipt write fails. If recovery already has that trip ID after a crash, load it first; cleanup must never delete a newer token. Cloud promotion is not this first local acknowledgement.

---

### Task 1: Pending receipt and entry-state proof

**Files:** Modify `lib/easyt/home-trip-handoff.ts`, `app/journey/new/new-trip-entry-state.ts`; test `tests/homepage-input-preservation.test.ts`, `tests/new-trip-entry-state.test.ts`, `tests/homepage-builder-hydration.test.ts`.

**Interfaces:** Produce `PendingIntakeReceipt`, `PendingHomeTripHandoff`, `createPendingIntakeReceipt(snapshot, { handoffId, tripId }): PendingIntakeReceipt`, `pendingIntakeReceiptForOwner(value, ownerId): PendingIntakeReceipt | null`, and `pendingHomepageHandoffForOwner(value, ownerId, handoffId): PendingIntakeReceipt | null`. Extend `NewTripEntryState.kind` with `pending-home-handoff` and `pending-direct-intake`, both carrying the reserved trip ID and frozen snapshot. Keep `homepageHandoffReceiptForOwner` projected-only.

- [ ] **RED:** Add table tests: exact frozen semantic fingerprint/owner/token/revision accepted; any mismatch or mutated frozen input rejected; edited outer snapshot does not mutate pending meaning; v1 projected handoff unchanged; legacy completed receipt never reseeds; `?trip=`/`?recover=` and current draft outrank pending; saved library trip does not override fresh; same pending receipt in two tabs yields one trip ID. Inject failed staged storage writes and assert prior snapshot/handoff remains recoverable.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/homepage-input-preservation.test.ts tests/new-trip-entry-state.test.ts tests/homepage-builder-hydration.test.ts`; new pending cases must fail for missing behavior while accepted existing cases pass.
- [ ] **GREEN:** Implement v2 validation and pure precedence without creating a new key. Extend the existing staged `commitHomepageHandoff` input to accept `HomeTripDraft | PendingHomeTripHandoff`; validate/read back both existing keys and restore prior values on failure. Do not accept v2 as a projected draft or infer edits from its absent draft fingerprint.
- [ ] **Verify:** Re-run the three files; inspect both failure and success assertions. `git diff --check` must pass.
- [ ] **Commit:** `feat: reserve pending intake through existing receipt boundary`.

### Task 2: Essential intent-only capture and suggestion-owner gate

**Files:** Modify `app/api/journey-capture/route.ts`, `lib/easyt/journey-capture-client.ts`, targeted `lib/easyt/journey-capture.ts` only if the existing provider-optional helper needs a narrow validation seam; test `tests/journey-capture.test.ts`, `tests/journey-capture-corpus.test.ts`, `tests/model-task-routing.test.ts`, `tests/p0-open-world-capture.test.ts`.

**Interfaces:** Extend `requestJourneyCapture(brief, { mode?: "full" | "intent-only", signal?, onResponse?, fetcher? }): Promise<JourneyCaptureResult>`; default remains `full`. Existing POST accepts only those mode values and returns the existing result shape. In `intent-only`, call `captureJourneyBriefFromSemanticIntent(brief, intent, undefined, ...)` or deterministic fallback, and omit provider-enriched facts plus `planningSuggestions`/`planningAssessment`.

- [ ] **RED:** Recheck integrated source for a downstream suggestion request. If none exists, add tests proving intent-only does **zero open-world provider lookups, zero `canonicalizePlanningSuggestions` calls and no separate optional-suggestion model request**; full mode retains current calls/results. Test valid semantic named-place/source coverage, broad area, invalid model output, missing named intent, legitimate model fallback and no provider-completeness-induced retry. A broad area stays unresolved/clarifiable rather than becoming a guessed stop.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/journey-capture.test.ts tests/journey-capture-corpus.test.ts tests/model-task-routing.test.ts tests/p0-open-world-capture.test.ts`; new mode/omission cases fail first.
- [ ] **GREEN:** Add the narrow mode to the existing endpoint/client. Keep existing semantic model routing and validation timeouts; separate required source coverage from optional provider completion. Record the downstream-owner result in the evidence README. If a proven existing bounded path exists, document exactly how it is reused **without an extra model call**; otherwise defer optional suggestions/assessment for this P0 path.
- [ ] **Verify:** Re-run the four files plus `npm run test:semantic-intent` and `npm run test:model-routing` if those scripts remain present after integration. `git diff --check`.
- [ ] **Commit:** `feat: return essential trip intent without provider enrichment`.

### Task 3: Builder-owned interpretation, reload and acknowledgement

**Files:** Modify `app/journey/new/trip-builder.tsx`, `app/journey/new/new-trip-entry-state.ts`, `lib/easyt/home-trip-handoff.ts`; test `tests/homepage-builder-hydration.test.ts`, `tests/new-trip-entry-state.test.ts`, `tests/new-trip-builder-submission.test.ts`, `tests/builder-persistence-acceptance.test.ts`, `tests/trip-browser-storage.test.ts`.

**Interfaces:** Consume Tasks 1–2. Builder uses one generation-scoped `requestJourneyCapture(prompt, { mode: "intent-only", signal })` for pending Describe. `projectHomepageInput({ snapshot: receipt.frozenSnapshot, capture, profile, handoffId: receipt.handoffId })` creates an in-memory projected draft; `homepageReceiptForProjection` supplies the projected fingerprint using the **same** reserved trip ID. `applyNewTripIntake` remains the sole Builder application seam. Existing `saveTripRecovery` is the acknowledgement boundary described above.

- [ ] **RED:** Test reload before interpretation, reload after capture but before recovery acknowledgement, crash after recovery before envelope cleanup, and existing reserved trip resume. Assert one active capture under React effect replay; stale response after edit/cancel/account switch is ignored even if abort is ignored. Test completed same/edited/legacy receipts, direct entry no self-navigation, explicit clears preserved, and injected recovery/receipt-write failure leaves pending intake recoverable rather than claiming account save.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/homepage-builder-hydration.test.ts tests/new-trip-entry-state.test.ts tests/new-trip-builder-submission.test.ts tests/builder-persistence-acceptance.test.ts tests/trip-browser-storage.test.ts`; new transitions fail first.
- [ ] **GREEN:** Hydrate pending intake without presenting it as a projected route. For pending records, run essential capture in Builder only; keep the accepted starter path working until Task 4 switches its producer. Recheck owner/token/fingerprint/revision/generation before projection and application. Reserve trip ID before effects. Keep pending frozen receipt until `saveTripRecovery` plus exact projected-trip match; project/write completed receipt through existing owner, and clean only the same token. On invalid interpretation, retain prompt and offer edit/retry; never create a second trip.
- [ ] **Verify:** Re-run the five files, then accepted New Trip/homepage/import/recovery owner tests. `git diff --check`.
- [ ] **Commit:** `feat: interpret pending intake in Builder with durable recovery`.

### Task 4: Durable early Homepage and direct New Trip submission

**Files:** Modify `app/journey/home/home-trip-starter.tsx`, `app/journey/new/new-trip-starter.tsx`, `app/journey/new/trip-builder.tsx`; test `tests/homepage-submission.test.ts`, `tests/new-trip-starter.test.ts`, `tests/new-trip-builder-submission.test.ts`, `tests/p0-new-trip-correctness.test.ts`.

**Interfaces:** Consume Tasks 1 and 3 receipt/Builder seams and existing `commitHomepageHandoff`. `NewTripStarter.onSubmit` becomes `(snapshot: HomepageInputSnapshot) => Promise<void>`; `TripBuilderDocument.submitNewTripIntake` freezes/records the pending direct receipt using its existing `tripId`. Homepage Describe submits the pending envelope, while Stops retains the projected canonical handoff path. Neither starter calls `requestJourneyCapture`.

- [ ] **RED:** Assert Homepage Describe navigates only after both pending records and current-trip preservation succeed, with **zero capture requests** before navigation. Assert failed second write/quota/rollback blocks navigation without losing the old handoff; double submit, mode edit, stale owner and another tab cannot create a second reservation. Assert New Trip Describe calls mounted Builder once, writes no `HOME_TRIP_DRAFT_KEY`, and never navigates `/journey/new` into itself. Replace accepted source-shape expectations for starter capture with stronger owner/behavior assertions, not a deletion of coverage.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/homepage-submission.test.ts tests/new-trip-starter.test.ts tests/new-trip-builder-submission.test.ts tests/p0-new-trip-correctness.test.ts`; new behavior must fail first.
- [ ] **GREEN:** Remove the awaited capture branch from both starters. Reuse existing snapshot validation, in-flight latch and owner/revision gate; Homepage calls the Task 1 staged boundary and pushes its exact URL only on success. Direct New Trip stores pending intake through its mounted Builder owner and keeps the submitted input visible while interpretation begins later.
- [ ] **Verify:** Run the four files plus `tests/homepage-input-projection.test.ts`; check no change to template/import or Stops projection. `git diff --check`.
- [ ] **Commit:** `feat: hand off frozen intake before Describe capture`.

### Task 5: Progressive occurrence-level place resolution

**Files:** Modify `lib/easyt/home-trip-handoff.ts`, `app/journey/new/trip-builder.tsx`; create focused `tests/handoff-progressive-resolution.test.ts`; extend `tests/homepage-builder-hydration.test.ts`, `tests/canonical-place-route-regression.test.ts`.

**Interfaces:** Produce `type HandoffOutcome<T, R> = { item: T; value?: R; status: "resolved" | "failed" | "timeout" }` and `resolveHandoffIncrementally<T, R>(items: readonly T[], resolveItem: (item: T, signal: AbortSignal) => Promise<R>, options: { signal?: AbortSignal; concurrency?: number; timeoutMs?: number; onOutcome: (outcome: HandoffOutcome<T, R>) => void }): Promise<HandoffOutcome<T, R>[]>`. Builder maps outcomes to occurrence `pending | resolved | needs-confirmation | failed`. Defaults: at most 3 concurrent requests and the existing 4,000 ms geocode deadline (10,000 ms cap). Keep `resolveHandoffBatch` signature/result for existing consumers. A Builder-owned session `Map<provider/query/context, Promise<choices>>` deduplicates permitted lookups, never occurrence state.

- [ ] **RED:** Deferred promises prove fast sibling publishes before a slow/hanging sibling; max three active requests; timeout remains recoverable and does not drop occurrence; successful results are not refetched on scoped retry; aborted shared promise does not poison a new session. Test Tokyo → Kyoto → Tokyo retains separate IDs, user reorder uses current order, and edit/remove/newer selection/owner switch discards late outcomes. Assert selected canonical ID is not renamed by coordinate enrichment; a named unresolved direct place gets a provider candidate/confirmation rather than disappearing, while a broad area goes to Discovery.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/handoff-progressive-resolution.test.ts tests/homepage-builder-hydration.test.ts tests/canonical-place-route-regression.test.ts`; new incremental cases fail first.
- [ ] **GREEN:** Implement bounded queue and per-outcome callback beside existing helper. Move Builder's all-at-once `outcomes.map` application to guarded per-occurrence updates; include eligible named unresolved direct mentions in the existing geocode/provider path, while broad planning areas stay in Discovery. Retain uncertainty confirmation and origin handling. Keep successful state on retry; abort/clear session dedup on generation change. Do not interpret already selected canonical occurrences again merely for optional facts.
- [ ] **Verify:** Re-run the three files plus `npm run test:place-intelligence`; `git diff --check`.
- [ ] **Commit:** `feat: publish handoff place results per occurrence`.

### Task 6: Honest first-useful Builder and Discovery states

**Files:** Modify `app/journey/new/trip-builder.tsx` and its CSS only as needed; extend `app/journey/new/trip-builder-review.stories.tsx`; test `tests/trip-builder-gate.test.ts`, `tests/builder-clarification-followup.test.ts`, `tests/country-discovery-builder.test.ts`, `tests/trip-builder-layout.test.ts`.

**Interfaces:** Consume pending/intake states from Tasks 1–5. No new route validator or persistence interface. Reuse existing Builder status controls, Discovery/clarification and `builderRouteInputIsReady`/`canBuildTrip` contracts.

- [ ] **RED:** Test selected Stops render editable ordered structure before optional lookup; pending Describe renders preserved input and enabled edit/cancel/retry but is not route-ready; broad country opens existing actionable Discovery; mixed known/unresolved preserves both; failed/offline lookup distinguishes unavailable from no places; late enrichment does not steal focus, shift active controls or overwrite an edit. Add Storybook production-component states for pending, partial, failed and repeated occurrences.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/trip-builder-gate.test.ts tests/builder-clarification-followup.test.ts tests/country-discovery-builder.test.ts tests/trip-builder-layout.test.ts`; new assertions fail first.
- [ ] **GREEN:** Wire compact existing status/feedback treatment. Render canonical known items immediately, ordered unresolved placeholders and scoped retry/confirmation. Keep route readiness blocked by existing required-mention, commitment, nights and feasibility rules. Preserve current EN/ES and mobile focus/touch behavior.
- [ ] **Verify:** Re-run the four files and inspect the production stories at 390/430/desktop. Run `npm run audit:ui` and `npm run build-storybook` because shared visual states changed. `git diff --check`.
- [ ] **Commit:** `ui: show truthful progressive Builder planning states`.

### Task 7: Privacy-safe milestones and matched actual-app acceptance

**Files:** Create `lib/easyt/planning-attempt-performance.ts`, `tests/planning-attempt-performance.test.ts`, `docs/product/prompt-discovery-performance-evidence/README.md` and matched captures; modify homepage/Builder milestone call sites and Storybook fixtures only if needed.

**Interfaces:** `type PlanningMilestone = "submit" | "durable-intake" | "shell-visible" | "first-actionable" | "required-complete" | "route-ready" | "optional-complete"`; `markPlanningMilestone(attemptId: string, milestone: PlanningMilestone, at?: number): void`; `planningAttemptDurations(attemptId: string): Partial<Record<PlanningMilestone, number>>` returns elapsed milliseconds since submit for reached stages only; `planningContentIsActionable(input: { mode: "stops" | "describe"; editableCanonicalOccurrences: number; selectableClarification: boolean; controlsEnabled: boolean }): boolean` is a measurement predicate, not another product state owner. The opaque handoff token correlates homepage SPA navigation; direct New Trip uses its Builder submission token. No raw input enters marks or analytics. Existing `trackEvent`/consent rules govern any emitted event.

- [ ] **RED:** Test monotonic one-time milestones, no shell-as-actionable, Stops versus Describe actionable predicates, missing/error terminal stages, no prompt/name/coordinate/document fields and no duplicate event under rerender. Test consent-off sends no optional analytics. Include a controlled fast/slow fixture report distinct from live timings.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/planning-attempt-performance.test.ts tests/analytics.test.ts`; new milestone cases fail first.
- [ ] **GREEN:** Add the small local timeline helper and mark existing submit, durable write, shell, first actionable, required complete, route-ready and optional complete transitions. Keep diagnostic data bounded/coarse and local; use existing analytics owner only if a reviewed consented event is warranted. Do not log private receipt contents.
- [ ] **Verify:** Re-run milestone/analytics tests. In an optimized local build, compare matched **before/after** Stops, ordinary Describe, broad region, mixed known/unresolved, repeated occurrences and slow/failing provider. Separate cold/warm and fixture/live results; report medians, tails, sample counts and any unavailable provider access. Exercise reload, cancel, account switch and import/template. Inspect actual app at 390, 430, 768, 1024 and 1440; capture screenshots and measured first-actionable timing, not just shell paint.
- [ ] **Final local gates:** Run all affected homepage/New Trip/Builder/capture/place/recovery/Discovery suites, `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook`, and `git diff --check`. Do not call unmeasured goals achieved. Record exact pass/fail/skip and source SHA in the evidence README.
- [ ] **Independent review and commit:** Review for duplicate trips, old receipt reuse, loss of explicit clears, provider-dependent navigation, dropped/reordered occurrences, stale async work, weakened readiness, false analytics and new model calls. Fix concrete findings with the owning task tests, then commit `test: verify prompt to Builder performance and recovery`.

## Self-review and execution handoff

Coverage mapping: the source/evidence gate covers baseline and New Trip ancestry; Tasks 1 and 4 cover minimum handoff, receipts and navigation; Task 2 covers server interpretation split and the optional-suggestion owner proof; Task 3 covers single Builder owner and recovery; Task 5 covers per-occurrence progress; Task 6 covers useful UI/route correctness; Task 7 covers milestones, responsive app acceptance and final regressions. The pinned v2 pending receipt never carries a draft fingerprint; only the projected in-memory v1 receipt does. All tasks keep Builder as canonical persistence owner. The five Review Focus conditions each have explicit RED tests. No task authorizes a second model request, a new persistence namespace, a parser replacement or weaker tests/audit limits.

Execution options after plan approval: **native sequential** using `superpowers:executing-plans`, or **subagent-driven** using `superpowers:subagent-driven-development`. Recommend **native sequential with Sol High** because receipt, Builder and capture interfaces overlap tightly and each task builds directly on the preceding state; reserve an independent final review for the full branch. Stop here for plan review before any product code, merge or browser execution.

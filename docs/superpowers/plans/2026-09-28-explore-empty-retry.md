# Explore Empty and Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a traveller a truthful compact Explore empty or unavailable state and a working recovery action for the selected stop/category.

**Architecture:** Extend `TripExploreWorkspace` and the existing `lib/easyt/explore.ts` lane/result projection. Classify only eligible current-scope results and relevant request outcomes; keep existing provider requests, saved ideas, images and taxonomy owners. The accepted four-category branch is the implementation base.

**Tech Stack:** React/Next.js, TypeScript, Node test runner, Storybook, Morrovia controls/status components.

**Spec:** `docs/superpowers/specs/2026-09-28-explore-empty-retry-design.md` at amendment commit `56422a74695c102b47201e06406afa8a985c873c`.

## Global Constraints

- Start a fresh local `codex/explore-empty-retry` branch/worktree at **`d18a9c17384e794f13859ecabd623176f7261f83`**, the accepted `codex/explore-category-simplification` HEAD. Confirm SHA before editing. Do not rebuild from the frozen MVP or merge this planning branch merely to begin.
- Visible categories stay **For you, Must-see, Food, Tours**, in one horizontally scrollable row with 44px targets.
- Selected canonical stop ID, category, trip mutation owner, provider/filter/fallback rules, saved/planned state, imagery and attribution remain authoritative. No new provider, taxonomy, persistence owner, UI framework or audit-baseline weakening.
- Local only: no push, deploy, CI, staging or main changes. Stop for plan review before product code.

## Review Focus

1. Organic empty + tour failure with zero eligible results must show unavailable, not confirmed empty (Task 1).
2. Raw results filtered out for the selected stop/category plus another failed source must show unavailable (Task 1).
3. An empty settled source with another pending source must stay loading; valid results override partial failure (Task 1).
4. Repeated retry clicks and a scope change during retry must not duplicate requests or publish stale cards (Task 2).
5. Missing coordinates/canonical ID and optional image failure must not create a false confirmed-empty or whole-panel failure (Tasks 1 and 3).

## File map and interfaces

- `lib/easyt/explore.ts`: keep `streamExploreDiscoveryLane`; extend `ExploreDiscoveryLaneSnapshot` with `requestCount: number` and change `exploreResultsPresentation(resultCount: number, lanes: readonly ExploreDiscoveryLaneSnapshot[]): "results" | "loading" | "unavailable" | "empty"`. `resultCount` is the **filtered, eligible selected-scope** count. Empty means all relevant searches attempted and settled with `failedCount === 0`.
- `components/easyt/trip-explore-workspace.tsx`: keep destination/category/request and saved-idea state here; store latest organic/commercial snapshots, supply only lanes required by `exploreSourcePlan`, own a retry epoch and a synchronous in-flight guard. Preserve `initialResults` story injection by deriving honest initial snapshots from its status args.
- `components/easyt/morrovia-loading-states.tsx` and module CSS: safely extend `MorroviaSectionStatus` only as needed for a compact neutral empty action and optional detail; retain existing error/loading consumers. `EasyTButton` remains the action owner.
- `components/easyt/trip-explore-workspace.module.css`: remove the oversized page-local empty treatment; keep the accepted category strip.
- `components/easyt/trip-explore-workspace.stories.tsx`: production-component fixtures for confirmed empty, mixed failure, filtered failure, partial useful results, and 390/430/desktop layouts.
- Focused tests: `tests/explore-provider-lanes.test.ts`, `tests/explore.test.ts`, `tests/trip-explore-workspace-presentation.test.ts`; add a narrow interaction test only if the existing test harness can exercise the mounted workspace without a new dependency.

---

### Task 1: Correct selected-scope result classification

**Files:** Modify `lib/easyt/explore.ts`, `tests/explore-provider-lanes.test.ts`, and the snapshot-state wiring in `components/easyt/trip-explore-workspace.tsx`.

**Interfaces:** Produce the `ExploreDiscoveryLaneSnapshot.requestCount` and `exploreResultsPresentation(resultCount, lanes)` contract from the file map. Relevant but unattempted searches must be represented as unavailable rather than a successful empty result; optional photo/enrichment work is not a result lane.

- [ ] **RED:** Change the old `['empty','degraded'] → empty` expectation. Add tests for empty+failed, filtered-out+failed, all-successful-empty, empty+pending, partial failure+usable result, no runnable required request and optional image failure after valid search. Assert exact `"unavailable"`, `"empty"`, `"loading"`, or `"results"` outcomes.
- [ ] **Run:** `node --experimental-strip-types --test tests/explore-provider-lanes.test.ts` → new cases fail on the accepted base for the expected classification/interface reasons.
- [ ] **GREEN:** Preserve `failedCount`, `pendingCount`, `requestCount` through each relevant lane snapshot; use filtered `visibleResults.length`. Priority: usable results → pending → any relevant failed or unattempted required search → confirmed empty. Coordinate/canonical-ID prerequisites that prevent a required search count as unavailable; do not alter provider URLs or photo loading.
- [ ] **Run:** the focused test command above and `node --experimental-strip-types --test tests/explore.test.ts` → pass. Check current partial-results ordering and saved-state tests.
- [ ] **Commit:** `git add` only the task files; `git commit -m "fix: classify incomplete Explore searches honestly"`.

### Task 2: Current-scope single-flight retry and useful scope actions

**Files:** Modify `components/easyt/trip-explore-workspace.tsx`, `tests/explore-provider-lanes.test.ts`, `tests/trip-explore-workspace-presentation.test.ts`; extend a focused interaction test if the existing harness supports it.

**Interfaces:** Consume Task 1's snapshots and `exploreResultsPresentation`. Keep `destinationId: string | null` and `category: ExplorePrimaryCategory` in `TripExploreWorkspace`; `retryEpoch: number` is presentation/request state only. Retry callback uses the current canonical stop ID/category, an immediate in-flight ref guard, existing `createAbortableEffectScope`, and the same `exploreSourcePlan` loaders. A scope change invalidates the prior epoch/response. No trip write.

- [ ] **RED:** Test repeated retry clicks start only one new attempt; same stop/category is retained; an old response after a stop/category change is ignored while persisted ideas remain. Test **Try For you** changes only category; a named alternative changes to its exact existing stop ID only on click, with duplicate place names distinguished by occurrence ID and no action when no supported alternative exists.
- [ ] **Run:** focused Explore tests → fail on missing retry/action behaviour.
- [ ] **GREEN:** Add explicit retry epoch and guard, release the guard only when both relevant lanes settle for the current epoch, and disable/reject additional retry clicks while pending. Preserve existing aborted-scope cleanup. Choose any named alternative only from `exploreDestinationOptions` with a real supported opportunity/result; do not promise inventory or fetch a different stop before selection.
- [ ] **Run:** focused tests → pass; verify save/schedule/remove still use `useTripShellMutation` and are not blocked by a failed discovery read.
- [ ] **Commit:** `git commit -m "feat: retry the selected Explore scope once"` with only task files.

### Task 3: Compact states and production Storybook acceptance

**Files:** Modify `components/easyt/morrovia-loading-states.tsx`, its CSS module, `components/easyt/trip-explore-workspace.tsx` and CSS module, `components/easyt/trip-explore-workspace.stories.tsx`, `tests/trip-explore-workspace-presentation.test.ts`, and existing loading/status tests if the shared API changes.

**Interfaces:** `MorroviaSectionStatus` may add `state="empty"`, optional `detail`, and one explicit `actionLabel`/`onAction` pair; existing `onRetry`/`retryLabel` remain compatible. Keep its shared button, semantic tokens and 44px target. In Explore: **No ideas found** with a valid single action or none; **Couldn’t load ideas** with **Try again**. Hide zero result counts in loading/unavailable/empty. Do not repeat selected scope in a second heading.

- [ ] **RED:** Add source/component assertions for the two distinct copies, absent “0 ideas” on failure, one action, one-row categories and existing shared status consumers. Add Storybook cases using `TripExploreWorkspace`, including accepted four-category controls and valid current-scope cards during partial failure.
- [ ] **Run:** `node --experimental-strip-types --test tests/trip-explore-workspace-presentation.test.ts tests/loading-state-rollout.test.ts` → new cases fail.
- [ ] **GREEN:** Compose the compact status in the existing workspace, retain its route-stop navigation, cards, credits and saved/planned state, and remove obsolete large empty CSS. Replace any active Outdoors/Day trips empty story with a supported Tours/For you state; preserve hidden taxonomy compatibility in its existing owner. Keep semantic alert/status behaviour and keyboard focus on recovery controls.
- [ ] **Run:** focused tests plus `npm run typecheck`, `npm run audit:ui`, `npm run build-storybook` and `npm run build:check` locally. Inspect 390, 430, 768 and desktop stories with existing non-browser review tooling; if browser verification is necessary, follow `AGENTS.md` opt-in rule and report the limitation. Run `git diff --check`. No CI.
- [ ] **Commit:** `git commit -m "ui: compact Explore empty and retry states"` with only task files.

## Final review gate

On the implementation branch, report the three task commits, accepted starting SHA, state matrix, retry/scope/saved-state evidence, Storybook states, local checks and remaining limits. Do not execute this plan until separately approved. The feedback plan is independent.

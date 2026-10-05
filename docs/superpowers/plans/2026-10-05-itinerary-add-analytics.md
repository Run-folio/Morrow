# Itinerary Add Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit one privacy-safe `itinerary_item_added` for each newly accepted canonical itinerary activity across manual and recommended scheduling paths.

**Architecture:** Keep `useTripMutationPersistence.mutateTrip` as the durability gate. Classify a scheduled idea by comparing the canonical trip before and after the scheduling command, so saved-to-planned counts once while moves and no-ops do not. Emit only after that gate succeeds in the Itinerary and Explore owners; preserve existing discovery and affiliate events.

**Tech Stack:** Next.js, React, TypeScript, Node tests, Playwright.

**Spec:** Planning-thread Batch 13 itinerary add analytics brief, 2026-10-05; `docs/product/jtbd-analytics.md`.

## Global Constraints

- Local isolated worktree only; no provider, PostHog configuration, consent UI, affiliate, or booking changes.
- Event fields are opaque `trip_id`, `stop_id`, categorical `source` and `item_kind` only.
- Analytics failure cannot affect persistence or UI.

## Review Focus

- Duplicate provider product: no second add event.
- Saved idea scheduled for the first time: one event, with no extra event for Saved cleanup.
- Existing scheduled idea moved: no add event.
- Failed recovery write followed by successful retry: one event.
- Consent disabled then enabled: no replay, only future additions count.

---

### Task 1: Canonical new-add classification

**Files:** Create `lib/easyt/itinerary-add-analytics.ts`; create `tests/itinerary-add-analytics.test.ts`.

- [x] Write failing tests for new, saved-to-planned, duplicate, move, and source categories; verify payload in the browser test.
- [x] Implement the smallest pure classifier and run tests.

### Task 2: Accepted mutation seams

**Files:** Modify `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-explore-workspace.tsx`, `lib/analytics.ts`, `docs/product/jtbd-analytics.md`; update `tests/posthog-funnel.test.ts`.

- [x] Add a real-app browser contract for scheduling seams and approved source values.
- [x] Emit only after accepted canonical mutation, with classification derived inside its update callback.
- [x] Preserve manual add, distinct `attraction_selected`, Explore selection, and affiliate events.

### Task 3: Real app proof and gates

**Files:** Create `tests/itinerary-add-analytics-app-browser.test.ts`.

- [x] Exercise manual, organic, Viator fixture, and live OSM Food paths with intercepted analytics and persisted state.
- [x] Cover duplicate, retry/failure, reload, move, consent off/on, and payload boundaries.
- [x] Run focused, persistence, privacy, #387, Tier 1, typecheck, build, and diff checks; record inherited failures separately.
- [x] Commit the clean local branch and report exact ancestry and limitations.

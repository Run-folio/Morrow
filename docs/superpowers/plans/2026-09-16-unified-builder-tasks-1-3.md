# Unified Trip Builder Tasks 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver only the first approved unified Builder slice: the source-aware empty state, first-class journey endpoints, and atomic complete-document commits.

**Architecture:** `TripBuilderDocument` remains the sole canonical state and persistence owner. Entry sources select an empty, clarification, or populated presentation of that owner. Endpoint editing reuses `JourneyEndpointsEditor`. Details edits are prepared as a complete candidate document and cross the existing Builder mutation boundary once after validation.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Node test runner, Storybook.

**Spec:** `docs/superpowers/specs/2026-09-15-unified-builder-design.md`

## Global Constraints

- Implement Tasks 1–3 only. Do not begin route/map projection, drag/reorder, Route Check overlay, final responsive rollout, integration, push or deployment.
- `/journey/new` is the unified Builder. Never restore the old mandatory Step 1–2 intake page.
- Direct entry has two primary starts—existing text/voice capture and canonical first-place selection—and a subordinate link to `/journey/new/import`.
- Do not redesign, embed or rewrite `/journey/new/import`; preserve its parsing, proposal, recovery, account-save and confirmed-trip navigation behavior.
- Homepage and route-template handoffs with a useful route bypass empty capture. Ambiguous handoffs stay in Builder clarification.
- `TripBuilderDocument` remains the single owner. Do not add a persistence layer, draft store or section save.
- Origin and `JourneyEndSelection` are endpoint context, not night-bearing stops. Stable stop-occurrence IDs remain authoritative.
- A details change constructs and validates a complete candidate document before one logical canonical commit. Failed, cancelled or stale drafts leave canonical state unchanged.
- Preserve current recovery, CAS, guest/account, build invariant and current-trip behavior.
- Reuse shared controls and current visual tokens. Do not redesign navigation, typography, homepage or the import page.

---

## Task 1: Replace the creation wizard with the unified Builder empty state

**Files:**

- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `app/journey/new/trip-builder.module.css`
- Modify: `tests/trip-builder-layout.test.ts`
- Modify: the existing import workflow test covering `/journey/new/import`
- Modify: `app/journey/new/trip-builder-review.stories.tsx`

- [ ] Add failing behavior-oriented regressions for direct `/journey/new`, useful homepage/template handoff, ambiguous handoff clarification, import navigation and import Back behavior. Prove the old mandatory step presentation still appears before implementation.
- [ ] Implement one `hasUsefulRouteSkeleton` boundary based on valid canonical stop occurrences, not endpoint text.
- [ ] For direct entry without a route/current draft, render the unified Builder empty state with:
  - `MorroviaTripCapture` as **Describe your trip**, retaining text/voice parsing and clarification callbacks;
  - existing `CanonicalPlaceAutocomplete` as **Add your first place**, committing through the current stop-add path;
  - subordinate `EasyTLinkButton` to `/journey/new/import`.
- [ ] Do not render an empty route table or map. Do not require origin/end before adding the first stop.
- [ ] Make useful homepage and route-template handoffs render the populated Builder presentation immediately. Keep area-only/ambiguous handoffs in current clarification.
- [ ] Remove the visible mandatory Step 1/Step 2 intake navigation and ensure legacy `?step=` no longer chooses a separate application state. Preserve valid query parameters and current recovery selection.
- [ ] Verify the protected import route itself is unchanged apart from an already-existing or narrowly corrected Back link to `/journey/new`.
- [ ] Add Storybook states for direct empty entry, populated handoff and clarification at 1440, 1366×768, 768 and 390.
- [ ] Run the focused layout, hydration/handoff, navigation, import, recovery and Builder gate tests; capture the intended red failure before production edits and green output afterward.
- [ ] Review the diff for duplicate capture/persistence ownership, then commit as one Task 1 commit.

---

## Task 2: Preserve first-class Journey End and Same as start

**Files:**

- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `components/easyt/journey-endpoints-editor.tsx` only if its existing controlled API cannot represent the approved states
- Modify: `tests/journey-endpoints.test.ts`
- Modify: `tests/trip-builder-gate.test.ts`
- Modify: `app/journey/new/trip-builder-review.stories.tsx`

- [ ] Add failing regression coverage for explicit end, `same_as_start`, unknown end, a stop sharing an endpoint name, and preserved canonical place identity.
- [ ] Reuse the existing `JourneyEndSelection` union and `JourneyEndpointsEditor`; do not create another endpoint model.
- [ ] Expose origin/end editing in the populated Builder details controls, supporting explicit, Same as start and unknown.
- [ ] Keep endpoints out of `stops` unless the traveller separately selected that place as a stop occurrence. Never filter legitimate stops by matching display text.
- [ ] Prove Same as start creates the correct return endpoint leg without a duplicate night-bearing stop, and an explicit Busan end does not collapse an intentional Busan stop.
- [ ] Render and inspect explicit, Same as start, unknown and validation/error states at 1440, 1366×768, 768 and 390.
- [ ] Run endpoint, canonical-place, trip-leg, Builder gate and hydration compatibility suites; capture red then green.
- [ ] Review and commit as one Task 2 commit.

---

## Task 3: Commit details as one complete canonical document mutation

**Files:**

- Create: `lib/easyt/trip-builder-document-commit.ts`
- Create: `tests/trip-builder-document-commit.test.ts`
- Create or modify: `app/journey/new/trip-builder-details-editor.tsx`
- Modify: `app/journey/new/trip-builder.tsx`
- Modify: relevant persistence/recovery/state-preservation tests

- [ ] Add failing tests for a valid complete candidate, stale source fingerprint, invalid candidate, cancelled draft, asynchronous place-resolution failure and endpoint/stop separation.
- [ ] Add a deterministic fingerprint covering canonical editable Builder inputs only; exclude derived legs, timestamps, map/UI state and save status.
- [ ] Prepare a complete proposed `EasyTTrip` with current `tripFromBuilder` and `preserveBuilderCanonicalState` behavior, validate the existing invariant, verify the source fingerprint, then invoke one parent `commitTripDetailsDocument` boundary.
- [ ] Permit local temporary form state only while editing. It must never write recovery, cloud state, analytics mutation events, save status or build readiness.
- [ ] Ensure no `await` or other failure point occurs after canonical commit begins. Rejected/cancelled drafts perform zero canonical writes.
- [ ] Preserve homepage/template hydration, guest/account recovery, CAS and current-trip ownership exactly.
- [ ] Verify the visible Builder controls still render after the owner change at 1440, 1366×768, 768 and 390.
- [ ] Run focused document-commit tests, `test:builder-gate`, `test:persistence`, endpoint/hydration/state-preservation suites, then typecheck, `build:check`, `build-storybook`, `audit:ui` and `git diff --check`.
- [ ] Review and commit as one Task 3 commit, then stop. Do not begin later unified Builder tasks.

---

## Completion Evidence

Report starting remote SHAs, isolated worktree/branch, one commit per task, focused and broad gates, rendered evidence paths, deliberately preserved behavior, conflicts with homepage Phase A/persistence/later Builder tasks, and final clean status. Confirm no push, merge or deploy occurred.

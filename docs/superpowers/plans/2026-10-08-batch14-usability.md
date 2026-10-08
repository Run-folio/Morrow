# Batch14 Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans; sole native implementer, no additional implementer. Steps use checkbox syntax.

**Goal:** Make ordinary Builder planning/search/edits useful and quiet while preserving traveller authorship.
**Architecture:** Repair existing autocomplete/evidence owners, accepted canonical edit allocation and shared readers. Compose existing feedback/dialog controls; keep route writer and proposal contracts.
**Tech Stack:** TypeScript, Next/React, Node tests, existing Storybook/Playwright fixtures.
**Spec:** `docs/superpowers/specs/2026-10-08-batch14-usability.md` (already approved consolidated direction).

## Global Constraints
- Local only; no push/deploy; no affected QA B credential use or modifications to user trips.
- Preserve canonical writer, occurrence IDs, table/map, held/authored/booked/locked nights and stored constraints.
- Update route remains optional broader optimization; authoritative-order changes require acceptance.

## Review Focus
- Qualified locality/foreign country namesakes must not receive wrong-country default selection (Task1).
- Source captures must not override deliberate empty/current preferences (Task1).
- Equal allocator scores, legacy unknown counts and held regional budgets must not lose nights (Task2).
- Pending/failed scoped legs must not be falsely acknowledged by a knowledge bridge (Task4).
- Expanded retained content/focused controls and true protected conflicts remain recoverable without layout jolt (Task3).

### Task1: Country ranking and canonical preference authority
Files: `lib/easyt/place-autocomplete.ts`, `components/easyt/canonical-place-autocomplete.tsx`, `lib/easyt/trip.ts`, `lib/easyt/trip-copilot.ts`; tests `tests/batch14-usability-authority.test.ts` plus existing autocomplete/interest/capture consumers.
Interfaces: extend `prioritizeRouteStopSuggestions(suggestions,intent,query?)` with exact verified country priority; retain same output objects/order otherwise. `tripIntentForTrip` v2 returns accepted canonical authority without source overlay; legacy overlay stays.
- [ ] RED: exact Germany/Japan country before foreign namesakes and before display limit; supported alias/qualified city exclusions; current packed/train/no-driving survives contradictory capture and source stays unchanged.
- [ ] GREEN: repair helper/caller before truncation and shared canonical readers.
- [ ] Verify focused authority/autocomplete/interest/copilot suites; commit local task.

### Task2: Helpful generated night scheduling and truthful completion
Files: `lib/easyt/trip-builder-edit.ts`, `lib/easyt/night-allocation.ts` only if existing adapter needs bounded support, `app/journey/new/trip-builder.tsx`, existing night status/workspace owner; new `tests/batch14-generated-night-edits.test.ts`.
Interfaces: existing accepted edits produce generated allocation changes within one candidate commit; requested/manual values unchanged except deliberate target. Provenance flags/request bindings determine protection; unknown legacy preserved. Existing allocation methods handle scores/minimums. Expose Needs nights for unresolved required stays; total alone is insufficient.
- [ ] RED: generated7/7 plus three accepted additions; protected14 + new stay; held request; explicit0; repeated occurrence; manual +/-; removal released nights; unknown legacy; stale source rejection/Undo.
- [ ] GREEN: allocate permitted flexible budget in accepted owner for initial/add/resolve/bounded edits, retain generated provenance, keep dates/order/source/held counts.
- [ ] Verify accepted edit/calendar/preservation/night suites; commit local task.

### Task3: Quiet stable feedback and beta Personalize
Files: Builder and existing retained-review owner/styles; shared feedback composition/stories only if needed. Reuse SaveStatus, BriefNotice/Undo, ContentDialog, existing controls/tokens.
- [ ] Verify runtime specimens for normal +/- and real protected conflict; hide always-inline transient stack, open retained actions from stable secondary access, retain safety/recovery/Undo/focus.
- [ ] Hide new unsupported beta controls, preserve all hidden data and existing actionable constraints; keep Interests/mode preferences/no-driving.
- [ ] Verify actual local responsive UI/keyboard, audit/build/Storybook if shared UI changed; commit local task.

### Task4: Supported discovery/search and transfer evidence
Files: existing discovery content/evidence/canonical catalog/provider normalization owner as actual HTTP evidence requires; `destination-knowledge.ts` and existing rail adapter; matching regression suites.
- [ ] Capture actual public Chamonix response/filters without auth; verify Germany/Alps official evidence and Korean source pages.
- [ ] RED: supported reviewed region bases, verified search identity/containment and country type; London metro rail access preserves original endpoint IDs; Korean canonical/country/direction guards; pending/failed work stays pending/failed.
- [ ] GREEN: integrate supported evidence only, keep indicative timings distinct from live service and door-to-door, no fuzzy identity override.
- [ ] Verify discovery/intercity/multimodal/provider suites; commit local task.

### Task5: Whole-branch verification and review handoff
- [ ] Run typecheck, applicable release/UI/build/Storybook checks and broad relevant tests with separate exit receipts; classify pre-existing failures rather than claiming allgreen.
- [ ] Review actual local UI and preservation/recovery/authority invariants; keep frozen c8 evidence/source intact.
- [ ] Prepare parent independent-review package with approved brief, branch range, ledger/decisions and evidence. No publication without separate approval.

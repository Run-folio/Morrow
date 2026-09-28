# New Trip Shared Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing dual-mode homepage planner for genuinely fresh `/journey/new` intake, preserve import, and enter the already-mounted Builder exactly once.

**Architecture:** `TripBuilderDocument` remains the hydration, canonical trip, mutation and persistence owner. Reuse `HomepageInputSnapshot`, `projectHomepageInput`, `MorroviaTripCapture` and `HomeDestinationEditor` through a narrow controlled New trip adapter; keep homepage navigation and import confirmation in their present owners. Decide entry state and receipt freshness before mounting the starter or changing UI.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Storybook 10, current Morrovia Journey components and CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-28-new-trip-shared-entry-design.md` at `61b616afd33ceda816bd51ecfc94bfc92847fcfa`.

## Global Constraints

- Start on `codex/new-trip-shared-entry` from `8fb031993ff701259ad47ddc0f190e1acbd5ebf6`; do not rewrite accepted ancestry.
- No new trip draft model, persistence owner, provider, generation path, dependency, route, or homepage redesign.
- Preserve populated **Shape the route**, current recovery/clarification, canonical stop occurrences, current import route and its CSV/XLSX/paste formats.
- Use the current Journey design system, production controls and accepted EN/ES copy. Mobile custom targets remain at least 44 CSS pixels.
- Task changes are local only: no push, deploy, CI, staging/main change or staging database write.
- Each task starts RED, reaches GREEN with focused tests, and ends in a local focused commit. Do not weaken tests or `audit:ui` allowances.

## File and owner map

| File | Responsibility in this plan |
| --- | --- |
| `app/journey/new/trip-builder.tsx` | Existing hydration precedence, Builder application and fresh-entry mount; remains sole canonical Builder owner. |
| `app/journey/new/new-trip-entry-state.ts` (new) | Pure entry/receipt decision only; no storage writes or React state. |
| `app/journey/new/new-trip-starter.tsx` (new) | Controlled intake adapter using existing snapshot codec/storage and shared capture; calls one Builder-owned submit callback. No trip persistence or router push. |
| `app/journey/home/home-trip-starter.tsx` | Homepage navigation/receipt owner; touch only if a narrow shared control extraction is demonstrably necessary. |
| `app/journey/home/home-destination-editor.tsx`, `components/easyt/morrovia-trip-capture.tsx` | Reuse as-is if possible; extend only for a concrete cross-surface control issue. |
| `lib/easyt/home-trip-handoff.ts`, `lib/easyt/private-browser-context.ts`, `lib/easyt/storage.ts` | Existing snapshot, receipt and recovery contracts; targeted safe helpers only, no new store/schema. |
| `app/journey/new/import/spreadsheet-import-client.tsx` | Existing import parser/review/confirm owner; retain route and back behaviour. |
| Builder/capture CSS, Storybook stories, focused tests | Presentation, production fixtures and regressions. |

## Receipt and freshness transition to implement first

`stored = readHomepageInput(raw, ownerId)` is the only intake decode. `receipt = stored?.receipt` is bookkeeping for a submitted homepage handoff, not a new trip source. A `homeDraft=1` URL is valid only when its `handoff` query value, owner-scoped stored receipt, draft's embedded receipt, `homepageHandoffReceiptForOwner`, `reusableHomepageReceipt`, fingerprint and reserved trip ID agree. If the reserved canonical trip already exists, resume that trip once. If no canonical trip exists and the matching draft is still present, apply it once in the current Builder. If the draft is gone, never reconstruct it from a receipt; load only the exact reserved trip if available, otherwise show the existing unavailable/recovery outcome. A mismatched owner, handoff ID or fingerprint fails closed.

For a plain fresh `/journey/new`, an owner-matching unsubmitted snapshot may resume. A receipt-bearing snapshot whose **active projected planning meaning** still matches `receipt.inputFingerprint` is completed/consumed for this entry and must not seed a new Builder trip; show fresh `mode="stops"` intake. If the traveller has materially edited the snapshot since submission, its active projection differs and may resume as intake; the old receipt is ignored for New trip submission. An inactive-tab edit alone does not make the same completed submission new. New trip submission never calls `commitHomepageHandoff`, `beginNewTripNavigation`, or `router.push('/journey/new…')`; it applies the projection through the mounted Builder. Existing homepage submission remains the only creator/consumer of its navigation receipt. Implement this with a pure decision helper and the current owner-scoped snapshot key, not a second receipt ledger or storage namespace.

## Review Focus

1. A completed receipt plus identical snapshot on plain New trip shows fresh intake and makes no new trip (Task 1).
2. A received handoff whose `handoff` URL token or account owner differs from the stored receipt fails closed (Task 1).
3. An unfinished canonical stop entry, repeated city occurrence and explicit empty interests survive mode switches without a free-text reinterpretation (Tasks 2–3).
4. Import return after a storage write error does not claim intake was preserved; the planner stays visible with an actionable error (Task 5).
5. Long translated place labels, keyboard focus and an open mobile calendar do not clip or cause page overflow (Task 6).

---

### Task 1: Prove entry-state, receipt and hydration boundary

**Files:** Create `app/journey/new/new-trip-entry-state.ts`, `tests/new-trip-entry-state.test.ts`; modify only the boundary in `app/journey/new/trip-builder.tsx` and, if needed, a narrow pure validation helper in `lib/easyt/home-trip-handoff.ts`.

**Interfaces:** `resolveNewTripEntryState(input: NewTripEntryStateInput): NewTripEntryState` returns a discriminated `loading | explicit-trip | current-draft | home-handoff | route-handoff | populated-builder | fresh | unavailable` decision. `NewTripEntryStateInput` contains `hydrated`, `sessionPending`, `ownerId`, the existing `trip`/`recover`/`homeDraft`/`handoff`/`inspire` query values, `currentDraftTripId`, decoded `StoredHomepageInput | null`, decoded `HomeTripDraft | null`, `reservedTripId` from the existing recovery/repository lookup, and `hasBuilderContext`. The helper compares the owner, URL handoff token and both receipt/fingerprint records; it performs no fetch, mutation or navigation. The existing Builder hydration effect supplies resolved inputs and applies the selected document. `resumableNewTripSnapshot(stored: StoredHomepageInput | null, profile: TravelProfile | null): HomepageInputSnapshot | null` returns only owner-valid, unsubmitted or materially changed intake; it never creates a handoff.

- [ ] **RED:** In `tests/new-trip-entry-state.test.ts`, assert every precedence row: explicit `trip`/`recover` over intake; queryless current draft over fresh; matching unconsumed `homeDraft` once; completed receipt without draft resolves only its existing reserved trip; identical completed or stale receipt cannot seed a new trip; mismatched URL token/fingerprint/owner fails closed; route template bypasses fresh; saved library trip without current-draft recovery does not override fresh; `hydrated=false` or session pending returns `loading`, never fresh. Add a Builder source/integration assertion that the New trip path does not call homepage navigation or commit the homepage handoff.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-entry-state.test.ts tests/homepage-input-preservation.test.ts tests/homepage-submission.test.ts tests/trip-browser-storage.test.ts` → new cases fail before implementation.
- [ ] **GREEN:** Add the pure decision and freshness helpers; wire the existing hydrate branches to enforce exact handoff/owner matching before `applySaved` or draft application. Preserve the existing receipt trip ID and `removeHomeTripDraftIfDurable` lifecycle. Do not alter the current trip save owner. Keep the starter unmounted while hydration/session scope is undecided.
- [ ] **Run:** same focused command → pass. Inspect the branch path for one hydration decision and zero new storage keys.
- [ ] **Commit:** `git add app/journey/new/new-trip-entry-state.ts app/journey/new/trip-builder.tsx lib/easyt/home-trip-handoff.ts tests/new-trip-entry-state.test.ts && git commit -m "test: guard new trip entry and receipt transitions"` (omit untouched paths).

### Task 2: Reuse one controlled dual-mode intake surface

**Files:** Create `app/journey/new/new-trip-starter.tsx`, `tests/new-trip-starter.test.ts`; reuse `HomeDestinationEditor`, `MorroviaTripCapture`, `JourneyEndpointsEditor`; modify their files or `HomeTripStarter` only if a focused test proves a shared control extension is needed.

**Interfaces:** `NewTripStarter({ ownerId, language, travelProfile, onSubmit }: { ownerId: string | null; language: EasyTLanguage; travelProfile: TravelProfile | null; onSubmit: (snapshot: HomepageInputSnapshot, capture?: JourneyCaptureResult) => Promise<void> })` owns only controlled *pre-submit intake* and passes the active snapshot to Builder. It reads/writes `homepageInputStorageKey(ownerId)` via `readHomepageInput`; Task 1's freshness helper decides whether to restore. It does not create, save or navigate a canonical trip.

- [ ] **RED:** Test default `stops`, selected canonical Tokyo → Kyoto → Tokyo occurrence IDs/order, active mode and inactive prompt preservation, shared dates/travellers/budget/interests/endpoints including explicit clears, owner switch fail-closed, long labels and the real capture's keyboard tabs/voice/validation/AI disclosure. Check the adapter renders the production `MorroviaTripCapture` and `HomeDestinationEditor`, not copied controls.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-starter.test.ts tests/homepage-input-preservation.test.ts tests/homepage-dual-entry-presentation.test.ts` → new cases fail.
- [ ] **GREEN:** Implement a controlled adapter around the existing `HomepageInputSnapshot` and `homepageEntry` prop. Keep `HomeTripStarter` navigation intact. If duplication appears, extract only controlled field binding into a shared helper with explicit homepage/New surface callbacks; do not move receipt/persistence/navigation into the visual component.
- [ ] **Run:** focused tests → pass; check homepage Storybook/source still uses the same shared capture.
- [ ] **Commit:** `git add app/journey/new/new-trip-starter.tsx tests/new-trip-starter.test.ts` plus only actually modified shared files; `git commit -m "feat: reuse controlled homepage planner for new trip intake"`.

### Task 3: Submit the active mode into the mounted Builder once

**Files:** Modify `app/journey/new/trip-builder.tsx`; create `tests/new-trip-builder-submission.test.ts`; modify `app/journey/new/new-trip-starter.tsx` only for request cancellation/submit interface and `lib/easyt/home-trip-handoff.ts` only for a necessary pure projection seam.

**Interfaces:** The Task 2 `onSubmit(snapshot, capture?)` calls `projectHomepageInput({ snapshot, capture, profile, handoffId })`, then one Builder-local application function, `applyNewTripIntake(draft: HomeTripDraft, isCurrent: () => boolean): void`, that reuses Builder's existing handoff/brief state setters and clarification flow. It never writes `HOME_TRIP_DRAFT_KEY` or calls `commitHomepageHandoff`. The latest-request gate and snapshot revision/owner/mode check reject stale completions.

- [ ] **RED:** Assert only active mode projects; structured stops retain canonical IDs, order and repeat occurrence IDs; Describe requests the existing capture once and enters existing clarification if needed; selected dates and explicit traveller/preference/endpoint clears outrank stale profile values; provider error preserves intake; mode edit, cancellation, owner switch, double click and late response cannot apply a stale draft or create two trip IDs. Assert no `/journey/new` self-navigation.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-builder-submission.test.ts tests/homepage-dual-entry-presentation.test.ts tests/journey-capture-entry-parity.test.ts tests/p0-new-trip-correctness.test.ts` → new cases fail.
- [ ] **GREEN:** Route the adapter's projected draft to the already-mounted Builder transition. Reuse the existing `initialHandoffRouteStops`, occurrence mention mapping, endpoint/timing/intent setters and `createLatestJourneyCaptureRequestGate`; extract a Builder-local applicator from the current handoff block if needed, without another canonical document. Keep save/recovery in `TripBuilderDocument`.
- [ ] **Run:** focused tests → pass; inspect one generation/application path and existing save status semantics.
- [ ] **Commit:** `git add app/journey/new/trip-builder.tsx app/journey/new/new-trip-starter.tsx tests/new-trip-builder-submission.test.ts` plus only changed helper files; `git commit -m "feat: apply new trip planner intake in Builder once"`.

### Task 4: Replace only the genuinely empty presentation

**Files:** Modify `app/journey/new/trip-builder.tsx`, `app/journey/new/trip-builder.module.css`, optionally `app/journey/new/trip-builder-mobile.module.css`; test `tests/trip-builder-layout.test.ts`, `tests/new-trip-starter.test.ts`.

**Interfaces:** Render `NewTripStarter` only for Task 1's `fresh` decision after hydration. Preserve `hasRouteSkeleton`, prompt/clarification, current draft and imported/route/home handoff branches and the existing populated Builder tree.

- [ ] **RED:** Assert exactly one `New trip` heading, one tablist, one primary `Plan my trip`, and neutral page container for fresh. Assert absent old empty-only eyebrow, duplicate Describe/Tell us and separate first-place field. Assert populated Builder still renders **Shape the route** with its existing review/actions and no starter flash during loading.
- [ ] **Run:** `node --experimental-strip-types --test tests/trip-builder-layout.test.ts tests/new-trip-starter.test.ts tests/trip-builder-gate.test.ts` → new cases fail.
- [ ] **GREEN:** Replace the empty-only markup, compose the shared planner, and adjust only local spacing/reflow. Keep old Builder controls outside the fresh branch untouched.
- [ ] **Run:** focused tests → pass; compare current production/Storybook Builder markup.
- [ ] **Commit:** `git add app/journey/new/trip-builder.tsx app/journey/new/trip-builder.module.css app/journey/new/trip-builder-mobile.module.css tests/trip-builder-layout.test.ts tests/new-trip-starter.test.ts && git commit -m "ui: show shared planner in fresh new trip"` (omit untouched paths).

### Task 5: Preserve intake across the existing import route

**Files:** Modify `app/journey/new/new-trip-starter.tsx` and, only if needed for back/cancel, `app/journey/new/import/spreadsheet-import-client.tsx`; test `tests/new-trip-import-return.test.ts`, `tests/spreadsheet-import.test.ts`.

**Interfaces:** `persistBeforeImport(): boolean` writes the current owner-scoped `StoredHomepageInput` through the existing snapshot key and returns false on failure; the import link/action sits outside `MorroviaTripCapture`'s `<form>`. Import's existing `confirm()` remains the sole importer-to-canonical transition.

- [ ] **RED:** Test neither mode's import action submits capture; opening then returning restores mode, prompt, selected/repeated stops, dates/preferences and explicit clears; blocked storage keeps planner visible with error; invalid file/review leaves snapshot unchanged; successful import creates only its canonical imported trip, without planner data; existing recovery conflict prevents replacement. Verify CSV, XLSX and pasted-table paths remain available.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-import-return.test.ts tests/spreadsheet-import.test.ts tests/homepage-input-preservation.test.ts` → new cases fail.
- [ ] **GREEN:** Place one secondary **Import existing trip** link below the planner form and preserve intake before route navigation. Keep `/journey/new/import`, parser/review/confirm and its back route; do not introduce a modal, nested form, upload owner or another submit handler.
- [ ] **Run:** focused tests → pass, including existing imported-trip recovery assertions.
- [ ] **Commit:** `git add app/journey/new/new-trip-starter.tsx tests/new-trip-import-return.test.ts tests/spreadsheet-import.test.ts` plus only actually modified import files; `git commit -m "feat: preserve new trip intake across import"`.

### Task 6: Responsive, locale, accessibility and production Storybook states

**Files:** Modify `components/easyt/morrovia-trip-capture.stories.tsx`, `app/journey/new/trip-builder-review.stories.tsx`, fresh-entry CSS as needed, and `tests/new-trip-entry-presentation.test.ts`; reuse production `NewTripStarter`/Builder rather than fixture-only imitation.

**Interfaces:** Storybook fresh stops/Describe, restored intake, repeated and long stops, validation error, import-return and populated Builder states use the same components as `/journey/new`. No new UI primitive.

- [ ] **RED:** Assert stories mount production components and expose both modes. Add semantic DOM checks for one mode selector/submit/import, EN/ES labels, keyboard tab/arrow-key movement, focus/error association and mobile custom target sizing; test long-place text and open date/personalisation state without fixed-height clipping.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-entry-presentation.test.ts tests/ui-convergence.test.ts` → new cases fail.
- [ ] **GREEN:** Add representative stories and only responsive/token-aligned CSS corrections. Check 390, 430, 768, 1024 and 1440 CSS pixels on the production component states: both modes, long names, autocomplete, calendar, personalisation, import return, keyboard/focus, 44px targets and no horizontal page overflow. Capture matched mobile and desktop before/after states using local fixtures; if browser-level verification is necessary, this request authorises local browser testing under `AGENTS.md`.
- [ ] **Run:** focused tests, `npm run typecheck`, `npm run audit:ui`, `npm run build-storybook`; record any unavailable browser state separately.
- [ ] **Commit:** `git add` only changed stories/CSS/tests, then `git commit -m "test: cover responsive shared new trip entry"`.

### Task 7: Combined owner regressions and local acceptance

**Files:** Add or extend only focused regression tests in `tests/homepage-submission.test.ts`, `tests/homepage-input-preservation.test.ts`, `tests/public-route-handoff.test.ts`, `tests/p0-new-trip-correctness.test.ts`, `tests/spreadsheet-import.test.ts`, `tests/new-trip-entry-state.test.ts` where prior tasks exposed a missing case; no product-code expansion for unrelated findings.

**Interfaces:** No new interface. Verify the Task 1–6 contracts together against existing homepage, Builder, import and recovery owners.

- [ ] **RED:** Add one combined test for homepage handoff followed by New trip and import-return without duplicate consumption; one route/template identity/order/nights test; one guest-to-account/reload test; one saved-library-trip plus deliberately fresh entry test. Confirm a populated Builder still owns edits and save. Run the added cases before any correction.
- [ ] **Run:** added focused cases → fail only where a remaining regression is real; document any known baseline failure separately.
- [ ] **GREEN:** Resolve only #new-trip regressions in their owning code. Do not alter homepage navigation, import confirmation or canonical Builder persistence to make tests pass superficially.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-entry-state.test.ts tests/new-trip-starter.test.ts tests/new-trip-builder-submission.test.ts tests/new-trip-import-return.test.ts tests/homepage-input-preservation.test.ts tests/homepage-submission.test.ts tests/homepage-dual-entry-presentation.test.ts tests/journey-capture-entry-parity.test.ts tests/p0-new-trip-correctness.test.ts tests/public-route-handoff.test.ts tests/spreadsheet-import.test.ts tests/trip-browser-storage.test.ts tests/trip-builder-layout.test.ts tests/trip-builder-gate.test.ts`; then `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook` if shared UI/stories changed, and `git diff --check`. Test actual local app at 390/430/768/1024/1440 and retain before/after screenshots. Report exact pass/fail/skip totals, EN/ES coverage, homepage and import outcomes, and any browser/identity limitation.
- [ ] **Commit:** `git add` only focused final regression changes; `git commit -m "test: verify shared new trip entry owners"` if files changed. Record task commits, final local HEAD, source SHA, screenshots and `NEW TRIP ENTRY: READY FOR STAGING INTEGRATION / NEEDS FOLLOW-UP`.

## Execution gate

This plan changes no product code. After review, choose **subagent-driven** or **native** execution. Subagent-driven provides independent task and whole-branch review at higher context cost; native is faster for this tightly coupled Builder/receipt transition and still requires a final independent review. Do not execute until the plan is approved and a method is selected.

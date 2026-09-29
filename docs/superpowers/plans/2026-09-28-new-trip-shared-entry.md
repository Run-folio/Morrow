# New Trip Shared Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing dual-mode homepage planner for genuinely fresh `/journey/new` intake, preserve import, and enter the already-mounted Builder exactly once.

**Architecture:** `TripBuilderDocument` remains the hydration, canonical trip, mutation and persistence owner. Reuse `HomepageInputSnapshot`, `projectHomepageInput`, `MorroviaTripCapture` and `HomeDestinationEditor` through a narrow controlled New trip adapter; keep homepage navigation and import confirmation in their present owners. Extend the existing receipt with one deterministic traveller-input fingerprint, computed by the shared handoff owner before capture, and decide entry state before mounting the starter or changing UI.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Storybook 10, current Morrovia Journey components and CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-28-new-trip-shared-entry-design.md` (approved source `61b616afd33ceda816bd51ecfc94bfc92847fcfa`, including the subsequent receipt-contract amendment).

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
| `app/journey/home/home-trip-starter.tsx` | Homepage navigation/receipt owner; add the shared semantic fingerprint to newly submitted receipts without changing its navigation effect. |
| `app/journey/home/home-destination-editor.tsx`, `components/easyt/morrovia-trip-capture.tsx` | Reuse as-is if possible; extend only for a concrete cross-surface control issue. |
| `lib/easyt/home-trip-handoff.ts`, `lib/easyt/private-browser-context.ts`, `lib/easyt/storage.ts` | Existing snapshot, receipt and recovery contracts; one canonical semantic-input fingerprint helper in `home-trip-handoff.ts`, no new store/schema. |
| `app/journey/new/import/spreadsheet-import-client.tsx` | Existing import parser/review/confirm owner; retain route and back behaviour. |
| Builder/capture CSS, Storybook stories, focused tests | Presentation, production fixtures and regressions. |

## Receipt and freshness transition to implement first

`stored = readHomepageInput(raw, ownerId)` is the only intake decode. Extend its existing `HomepageHandoffReceipt` with optional-on-read `semanticInputFingerprint` for legacy compatibility; all newly created receipts must set it with `homepageSemanticInputFingerprint(snapshot: HomepageInputSnapshot): string` in `lib/easyt/home-trip-handoff.ts`. This helper hashes only active traveller-controlled meaning before provider capture: active mode; normalized Describe prompt or ordered stop occurrence IDs plus selected canonical place identities; discriminated date, traveller, budget, interest and endpoint choices including explicit clears. Exclude inactive-mode data, capture/provider output, unselected coordinates, timestamps, generated route state, reserved trip ID and persistence metadata. Keep `receipt.inputFingerprint = homepageSubmissionFingerprint(draft)` solely for exact projected-draft integrity. Homepage and New trip call the same semantic helper; neither reimplements it.

`receipt = stored?.receipt` is bookkeeping for a submitted homepage handoff, not a new trip source. A `homeDraft=1` URL is valid only when its `handoff` query value, owner-scoped stored receipt, draft's embedded receipt, `homepageHandoffReceiptForOwner`, projected-draft `inputFingerprint` and reserved trip ID agree. New-format receipts also carry the semantic fingerprint captured at submission; do not compare it with an intake snapshot subsequently edited while an exact URL handoff is in flight. If the reserved canonical trip already exists, resume that trip once. If no canonical trip exists and the matching draft is still present, apply it once in the current Builder. If the draft is gone, never reconstruct it from a receipt; load only the exact reserved trip if available, otherwise show the existing unavailable/recovery outcome. A mismatched owner, handoff ID or receipt/draft fingerprint fails closed.

For a plain fresh `/journey/new`, an owner-matching unsubmitted snapshot may resume. If a completed receipt's `semanticInputFingerprint` equals `homepageSemanticInputFingerprint(stored.snapshot)`, the intake was already submitted: show fresh `mode="stops"` input, never recreate the handoff. A repeated Homepage submit of that same semantic input must reuse its existing reserved trip or exact still-present handoff; a changed provider capture is not an edit and cannot mint another reserved ID. If neither trip nor valid draft is available, use existing recovery/unavailable feedback. If semantic fingerprints differ, restore the materially edited snapshot **without the old receipt**; its next submit gets a new handoff token and Builder trip identity, never the old reserved ID. Inactive-tab edits and capture-output differences do not change the semantic fingerprint. A legacy completed receipt lacking the new field cannot prove an edit: show fresh input, never auto-reseed or convert its volatile draft fingerprint. A still-present exact legacy URL handoff can use existing receipt/draft integrity checks; an existing reserved trip resumes. New trip submission never calls `commitHomepageHandoff`, `beginNewTripNavigation`, or `router.push('/journey/new…')`; it applies the projection through the mounted Builder. Homepage retains its existing navigation owner. Use the current owner-scoped snapshot key, not a second receipt ledger or storage namespace.

## Review Focus

1. A completed receipt plus semantically identical snapshot on plain New trip shows fresh intake even if Describe provider capture output changes (Task 1).
2. A received handoff whose `handoff` URL token or account owner differs from the stored receipt fails closed (Task 1).
3. An unfinished canonical stop entry, repeated city occurrence and explicit empty interests survive mode switches without a free-text reinterpretation (Tasks 2–3).
4. Import return after a storage write error does not claim intake was preserved; the planner stays visible with an actionable error (Task 5).
5. Long translated place labels, keyboard focus and an open mobile calendar do not clip or cause page overflow (Task 6).

---

### Task 1: Prove entry-state, receipt and hydration boundary

**Files:** Create `app/journey/new/new-trip-entry-state.ts`, `tests/new-trip-entry-state.test.ts`; modify the hydration boundary in `app/journey/new/trip-builder.tsx`, the existing receipt helper in `lib/easyt/home-trip-handoff.ts`, Homepage receipt construction in `app/journey/home/home-trip-starter.tsx`, and focused `tests/homepage-input-preservation.test.ts` / `tests/homepage-submission.test.ts`.

**Interfaces:** `homepageSemanticInputFingerprint(snapshot: HomepageInputSnapshot): string` is the sole semantic-fingerprint owner in `lib/easyt/home-trip-handoff.ts`. `HomepageHandoffReceipt.semanticInputFingerprint?: string` is optional only when decoding legacy receipts; new receipt construction requires it. `resolveNewTripEntryState(input: NewTripEntryStateInput): NewTripEntryState` returns a discriminated `loading | explicit-trip | current-draft | home-handoff | route-handoff | populated-builder | fresh | unavailable` decision. `NewTripEntryStateInput` contains `hydrated`, `sessionPending`, `ownerId`, the existing `trip`/`recover`/`homeDraft`/`handoff`/`inspire` query values, `currentDraftTripId`, decoded `StoredHomepageInput | null`, decoded `HomeTripDraft | null`, `reservedTripId` from the existing recovery/repository lookup, and `hasBuilderContext`. The helper compares owner, URL token and receipt/draft records but performs no fetch, mutation or navigation. `resumableNewTripSnapshot(stored: StoredHomepageInput | null): HomepageInputSnapshot | null` returns owner-valid unsubmitted or semantically edited intake; completed equal and legacy completed receipts return null. The existing Builder hydration effect supplies resolved inputs and applies the selected document.

- [ ] **RED:** In `tests/new-trip-entry-state.test.ts` and focused Homepage receipt tests, assert identical Describe prompt/preferences with two different provider captures gives the same semantic fingerprint; a prompt edit, date/explicit-clear, traveller or preference edit changes it; identical canonical stop IDs/occurrence order remains equal while a stop or order edit differs. Assert precedence: explicit `trip`/`recover`; queryless current draft; matching unconsumed handoff exactly once; existing reserved trip resumes; completed equal shows fresh without duplicate; completed edited restores intake with receipt detached; legacy completed never auto-reseeds; owner/token/draft-fingerprint mismatch fails closed; route template bypasses fresh; saved library trip does not override fresh; unhydrated/session-pending returns `loading`. Assert repeated Homepage submit with same semantic input and different provider capture cannot mint another reserved trip ID. Assert the New trip path does not call homepage navigation/commit and the new Homepage receipt records both fingerprints.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-entry-state.test.ts tests/homepage-input-preservation.test.ts tests/homepage-submission.test.ts tests/homepage-builder-hydration.test.ts tests/trip-browser-storage.test.ts` → new cases fail before implementation.
- [ ] **GREEN:** Add the pure semantic fingerprint and decision helpers; extend existing receipt decoding to accept missing legacy fields but reject malformed present fields; make Homepage write the new field before capture without changing navigation, and prevent an unchanged repeated submission from allocating a new reserved ID when capture output varies. Wire Builder hydration to enforce exact handoff/owner/draft matching before `applySaved` or draft application. Compare only the semantic fingerprint for plain New trip freshness, never reproject provider capture. Preserve the existing receipt trip ID and `removeHomeTripDraftIfDurable` lifecycle. Do not alter the current trip save owner. Keep the starter unmounted while hydration/session scope is undecided.
- [ ] **Run:** same focused command → pass. Inspect the branch path for one hydration decision and zero new storage keys.
- [ ] **Commit:** `git add app/journey/new/new-trip-entry-state.ts app/journey/new/trip-builder.tsx app/journey/home/home-trip-starter.tsx lib/easyt/home-trip-handoff.ts tests/new-trip-entry-state.test.ts tests/homepage-input-preservation.test.ts tests/homepage-submission.test.ts && git commit -m "test: guard new trip entry and receipt transitions"` (omit untouched paths).

### Task 2: Reuse one controlled dual-mode intake surface

**Files:** Create `app/journey/new/new-trip-starter.tsx`, `tests/new-trip-starter.test.ts`; reuse `HomeDestinationEditor`, `MorroviaTripCapture`, `JourneyEndpointsEditor`; modify their files or `HomeTripStarter` only if a focused test proves a shared control extension is needed.

**Interfaces:** `NewTripStarter({ ownerId, language, travelProfile, onSubmit }: { ownerId: string | null; language: EasyTLanguage; travelProfile: TravelProfile | null; onSubmit: (snapshot: HomepageInputSnapshot, capture?: JourneyCaptureResult) => Promise<void> })` owns only controlled *pre-submit intake* and passes the active snapshot to Builder. It reads/writes `homepageInputStorageKey(ownerId)` via `readHomepageInput`; Task 1's freshness helper decides whether to restore. On an edited completed snapshot, persist the restored input with no old receipt; on fresh input, never copy a completed/legacy receipt into subsequent edits. It does not create, save or navigate a canonical trip.

- [ ] **RED:** Test default `stops`, selected canonical Tokyo → Kyoto → Tokyo occurrence IDs/order, active mode and inactive prompt preservation, shared dates/travellers/budget/interests/endpoints including explicit clears, owner switch fail-closed, long labels and the real capture's keyboard tabs/voice/validation/AI disclosure. Assert an edited completed snapshot is restored and persisted without its prior receipt; the first edit of a fresh entry also does not carry a completed or legacy receipt forward. Check the adapter renders the production `MorroviaTripCapture` and `HomeDestinationEditor`, not copied controls.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-starter.test.ts tests/homepage-input-preservation.test.ts tests/homepage-dual-entry-presentation.test.ts` → new cases fail.
- [ ] **GREEN:** Implement a controlled adapter around the existing `HomepageInputSnapshot` and `homepageEntry` prop. Keep `HomeTripStarter` navigation intact. If duplication appears, extract only controlled field binding into a shared helper with explicit homepage/New surface callbacks; do not move receipt/persistence/navigation into the visual component.
- [ ] **Run:** focused tests → pass; check homepage Storybook/source still uses the same shared capture.
- [ ] **Commit:** `git add app/journey/new/new-trip-starter.tsx tests/new-trip-starter.test.ts` plus only actually modified shared files; `git commit -m "feat: reuse controlled homepage planner for new trip intake"`.

### Task 3: Submit the active mode into the mounted Builder once

**Files:** Modify `app/journey/new/trip-builder.tsx`; create `tests/new-trip-builder-submission.test.ts`; modify `app/journey/new/new-trip-starter.tsx` only for request cancellation/submit interface and `lib/easyt/home-trip-handoff.ts` only for a necessary pure projection seam.

**Interfaces:** The Task 2 `onSubmit(snapshot, capture?)` calls `projectHomepageInput({ snapshot, capture, profile, handoffId })` with a fresh token for a detached edited intake, then one Builder-local application function, `applyNewTripIntake(draft: HomeTripDraft, isCurrent: () => boolean): void`, that reuses Builder's existing handoff/brief state setters and clarification flow. It never reads the prior receipt's `tripId`/`handoffId`, writes `HOME_TRIP_DRAFT_KEY` or calls `commitHomepageHandoff`. The latest-request gate and snapshot revision/owner/mode check reject stale completions.

- [ ] **RED:** Assert only active mode projects; structured stops retain canonical IDs, order and repeat occurrence IDs; Describe requests the existing capture once and enters existing clarification if needed; selected dates and explicit traveller/preference/endpoint clears outrank stale profile values; provider error preserves intake; mode edit, cancellation, owner switch, double click and late response cannot apply a stale draft or create two trip IDs. Assert detached edited intake uses neither the old handoff token nor the old reserved trip ID, and no `/journey/new` self-navigation occurs.
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

- [ ] **RED:** Add one combined test for homepage handoff followed by New trip and import-return without duplicate consumption, including changed provider capture for unchanged Describe input and a legacy receipt; one route/template identity/order/nights test; one guest-to-account/reload test; one saved-library-trip plus deliberately fresh entry test. Confirm a populated Builder still owns edits and save. Run the added cases before any correction.
- [ ] **Run:** added focused cases → fail only where a remaining regression is real; document any known baseline failure separately.
- [ ] **GREEN:** Resolve only #new-trip regressions in their owning code. Do not alter homepage navigation, import confirmation or canonical Builder persistence to make tests pass superficially.
- [ ] **Run:** `node --experimental-strip-types --test tests/new-trip-entry-state.test.ts tests/new-trip-starter.test.ts tests/new-trip-builder-submission.test.ts tests/new-trip-import-return.test.ts tests/homepage-input-preservation.test.ts tests/homepage-submission.test.ts tests/homepage-builder-hydration.test.ts tests/homepage-dual-entry-presentation.test.ts tests/journey-capture-entry-parity.test.ts tests/p0-new-trip-correctness.test.ts tests/public-route-handoff.test.ts tests/spreadsheet-import.test.ts tests/trip-browser-storage.test.ts tests/trip-builder-layout.test.ts tests/trip-builder-gate.test.ts`; then `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook` if shared UI/stories changed, and `git diff --check`. Test actual local app at 390/430/768/1024/1440 and retain before/after screenshots. Report exact pass/fail/skip totals, EN/ES coverage, homepage and import outcomes, and any browser/identity limitation.
- [ ] **Commit:** `git add` only focused final regression changes; `git commit -m "test: verify shared new trip entry owners"` if files changed. Record task commits, final local HEAD, source SHA, screenshots and `NEW TRIP ENTRY: READY FOR STAGING INTEGRATION / NEEDS FOLLOW-UP`.

## Execution gate

This amendment changes no product code. **Native/sequential** execution was selected for the original plan and remains the intended method after review of this receipt correction; it still requires a final independent review. Do not resume Task 1 or execute later tasks until this amendment is approved.

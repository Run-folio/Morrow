# Imported Trip Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan natively and sequentially, task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reviewed dated spreadsheet import creates one canonical trip whose 21 dated days, six stop occurrences, five truthful transfers and normal workspace consumers are immediately usable.

**Architecture:** Validate the reviewed stop timeline before confirmation, then compose deterministic open `PlanItem` rows into the existing `EasyTTrip` once. Reuse canonical route/leg, TripShell mutation, recovery and repository ownership; downstream workspaces continue to read the same trip. Guard legacy `spreadsheet-v1` repair through the mounted TripShell mutation path only.

**Tech Stack:** TypeScript, Next.js/React, Node test runner, existing Morrovia trip model and Storybook.

**Spec:** `docs/superpowers/specs/2026-09-29-imported-trip-hydration-design.md` at `5aa91bb490ad55fc5f9802d1ae8fc89034710a71`.

## Global constraints

- Preserve one `EasyTTrip` ID, existing stop occurrence IDs and canonical place IDs, and existing recovery/account save ownership. Ordinary Builder day generation is unchanged.
- The Philippines fixture has **6 occurrences, 20 nights, 21 dates (11–31 December 2026)**. The final Manila is distinct. The final departure date is a planning day and adds no night.
- The tested headers are `Stop order`, `Journey origin`, `Destination`, `Arrival date`, `Departure date`, `Nights`, `Arriving from`, `Journey / transport`, `Notes`. `Journey / transport` is not a booked-transport alias; the fixture lacks full booking fields and correctly yields **0 journeys**.
- Never infer an activity, booking, road/ferry/flight mode, duration, route schedule, provider result or photograph. Preserve explicit authored content through its existing owner.
- Keep Explore, Stay, Map, imagery, Itinerary and Transport as existing consumers. No new provider, persistence model, migration, Google Maps change or import-specific workspace.
- Each coding task runs RED → GREEN → focused verification → focused commit. Stop at any owner/recovery contradiction rather than creating a parallel save path. No staging/main changes, push, deploy or CI.

## Review focus

- A repeated place name with a different canonical identity must not be collapsed in the header (Task 4).
- An imported activity dated on a shared departure/arrival boundary must not silently move to the wrong occurrence (Tasks 1 and 3).
- A previously saved import with an authored day or confirmed transport leg must not be rewritten by compatibility repair (Task 7).
- A late account save conflict must retain the recoverable local copy, not acknowledge a stale repair (Task 7).
- Provider-empty Explore and absent approved photos must remain truthful empty/placeholder states even after structural hydration (Task 6).

## File and owner map

| Unit | Existing/new owner and interface |
| --- | --- |
| Parsing and review integrity | `lib/easyt/spreadsheet-import.ts` keeps the alias map and `SpreadsheetImportProposal.canConfirmStructure`; import review remains `app/journey/new/import/spreadsheet-import-client.tsx`. |
| Pure dated projection | Create `lib/easyt/imported-trip-hydration.ts` with `buildImportedDatedDays(input: ImportedDatedDayInput): ImportedDatedDayResult`. Input contains trip ID, ISO span, canonical stops and explicitly dated activities as plain structural values; output contains one `PlanItem` per date and activity comments keyed by day. It has no storage or provider calls. |
| Route label | Add `tripRouteDisplayLabel(trip: Pick<EasyTTrip, "id" | "brief" | "stops">): string` beside the existing endpoint projection in `lib/easyt/trip-legs.ts`; TripShell server/client call it. Reuse `sameJourneyPlace` for the first origin/stop comparison, then retain every sorted stop occurrence in the label. |
| Import legs | `lib/easyt/spreadsheet-import.ts` composes canonical legs and reviewed bookings; `lib/easyt/imported-trip-hydration.ts` exports `unconfirmedImportedLeg(leg: TripLeg): TripLeg` for unbooked imported legs. `lib/easyt/road-transfer-resolution.ts` is touched only if existing route metadata cannot suppress fallback. |
| Legacy mutation | `components/easyt/trip-shell-client.tsx` calls `useTripShellMutation().mutateTrip` for an eligible one-shot repair. `components/easyt/use-trip-mutation-persistence.ts` supplies a read-only recovery-classification-ready signal if needed; `lib/easyt/storage.ts` and `lib/easyt/repository.ts` retain their write and acknowledgement logic. |
| Consumers and readiness | Existing Itinerary/Calendar, Explore, imagery, Stay, Map, Overview and Transport projections consume the hydrated `EasyTTrip`; only narrow eligibility/readiness adjustments are allowed. |

## Legacy repair ownership decision

**Owner exists:** `TripShellCanonicalMutationProvider` (`components/easyt/trip-shell-client.tsx`) owns `useTripMutationPersistence` (`components/easyt/use-trip-mutation-persistence.ts`). Its `mutateTrip(current => next, pendingKey)` writes the exact local recovery handle synchronously, serializes account `saveTripRecoveryToEasyT`, then acknowledges through `cacheCanonicalTrip`. Repository saving uses the existing revision/conflict check. `TripShellTripProvider` already has the session/owner boundary and device-recovery blockers. No repository, route loader, read-only projection or import client should independently save a legacy repair.

**Automatic eligibility:** `capturedIntent.parserVersion === "spreadsheet-v1"`, complete contiguous stop/date allocation, zero canonical day rows, and no day-linked authored/scheduled content or confirmed leg decision that repair would replace. A nonempty or ambiguous partial itinerary is ineligible and remains for explicit review. The pure repair must recheck all predicates against the *current* trip passed to `mutateTrip`, preserve identifiers/bookings/authored fields, and return that same trip object if ineligible or already repaired. Invoke only after recovery classification and owner/session checks finish, with no pending save or visible conflicting recovery. On a CAS/storage conflict, retain normal recovery/conflict UI and do not retry automatically. If implementation cannot prove this gate with the available data, stop automatic repair and report it blocked; creation-time hydration remains shippable.

## Task 1: Exact fixture and reviewed timeline integrity

**Files:** Modify `tests/fixtures/spreadsheet-import.ts`, `tests/spreadsheet-import.test.ts`, `lib/easyt/spreadsheet-import.ts`. No alias broadening.

**Interface:** Extend existing proposal validation so `canConfirmStructure` is false for zero/negative nights, interval gaps/overlaps, a span mismatch, or an activity assigned to the outgoing stop on a shared boundary. Keep the existing parser/proposal type and review flow.

- [ ] **RED:** Add the exact nine-header Philippines CSV fixture and assert six ordered source occurrence IDs, 20 nights, 11–31 Dec, both Manila occurrences, and 0 imported journeys. Add separate gaps, overlaps, zero/negative interval and boundary-activity tests; a less-structured existing fixture must pass after reliable review. Assert import review alone writes nothing.
- [ ] **Prove RED:** Run `node --experimental-strip-types --test tests/spreadsheet-import.test.ts`; record failures caused by missing cross-stop validation, not the already-correct 0-journey mapping.
- [ ] **GREEN:** Validate normalized half-open stop intervals against the reviewed span inside the existing proposal construction/confirmation gate. Do not parse `Journey / transport` as transport or reinterpret `Notes`.
- [ ] **Verify:** Rerun the focused suite; inspect that exact supported booked-transport aliases and existing successful less-structured parsing remain intact. Commit only this parser/fixture task.

## Task 2: Pure 21-day imported projection

**Files:** Create `lib/easyt/imported-trip-hydration.ts`; modify `tests/spreadsheet-import.test.ts` (or add `tests/imported-trip-hydration.test.ts`).

**Interface:** `buildImportedDatedDays(input: ImportedDatedDayInput): ImportedDatedDayResult`, with `ImportedDatedDayInput = { tripId: string; startDate: string; endDate: string; stops: readonly TripStop[]; activities: readonly { id: string; stopId: string; date: string; title: string; notes: readonly string[] }[] }` and `ImportedDatedDayResult = { planItems: PlanItem[]; activityCommentsByDay: Record<number, string[]> }`. The helper is pure and refuses noncontiguous/ambiguous input; day IDs derive only from trip ID and day number.

- [ ] **RED:** Assert exactly one `open` row for every date/day 1–21, with ownership 11–12 first Manila, 13–17 El Nido, 18–21 Bohol, 22–26 Siquijor, 27–29 Cebu City, 30–31 final Manila. Assert 20 overnight bands, empty editable activity notes, stable IDs on repeated calls, and no day 22.
- [ ] **Prove RED:** Run the focused new/extended hydration test; it fails because the pure projection is absent.
- [ ] **GREEN:** Implement the projection using existing ISO date and `PlanItem` conventions. The final departure day binds to the last stop without adding a night; no generated activity, visit, booking, prose or photo.
- [ ] **Verify:** Rerun its focused test and `npm run typecheck`; commit the pure helper and tests without wiring the importer yet.

## Task 3: Compose explicit imported activities and notes once; save once

**Files:** Modify `lib/easyt/spreadsheet-import.ts`, `tests/spreadsheet-import.test.ts`, `tests/itinerary-day-composition.test.ts`, `app/journey/new/import/spreadsheet-import-client.tsx` only if its existing double-Create guard fails.

**Interface:** `canonicalTripFromSpreadsheetProposal` calls `buildImportedDatedDays` once after `tripFromBuilder` and reviewed stop dates are finalized. It places activity **titles** in the correct day row's editable `PlanItem.notes`, activity comments in existing `brief.dayNotes`, and independent notes/bookings in their current owners.

- [ ] **RED:** Assert a dated activity creates no extra day, retains title once and comment once without counting the comment as an activity; repeated-name stops bind via source occurrence ID/date. Assert activity order, notes, booking IDs, explicit clear behavior, and no duplicate trip ID or save on rapid double Create. Assert failed account acknowledgement leaves the same recoverable trip.
- [ ] **Prove RED:** Run `node --experimental-strip-types --test tests/spreadsheet-import.test.ts tests/itinerary-day-composition.test.ts`; record the absent-day/duplicate-content failures.
- [ ] **GREEN:** Wire the pure result into the existing canonical conversion before the current single recovery/account save. Preserve reviewed geocode IDs, provider IDs, coordinates, notes and bookings. Keep `tripFromBuilder` and ordinary Builder behavior unchanged.
- [ ] **Verify:** Rerun focused tests plus `tests/trip-persistence.test.ts` and `tests/trip-browser-storage.test.ts`; commit the import composition task.

## Task 4: Canonical route-label projection

**Files:** Modify `lib/easyt/trip-legs.ts`, `components/easyt/trip-shell.tsx`, `components/easyt/trip-shell-client.tsx`; test `tests/trip-identity-presentation.test.ts`, `tests/trip-shell-mobile-presentation.test.ts`, and route-leg tests.

**Interface:** `tripRouteDisplayLabel(trip)` uses the existing `sameJourneyPlace` equivalence on origin and first sorted stop, suppressing only that adjacent duplicate in the displayed path. It retains every stop occurrence after the first, including an adjacent repeated stop if one exists; `canonicalRouteEndpoints` continues to own travel-leg deduplication. It does not mutate trip state or leg construction.

- [ ] **RED:** Assert shared desktop/mobile/fallback-image labels say `Manila → El Nido → Bohol → Siquijor → Cebu City → Manila`, while origin, stop 1, stop 6 and five legs remain in state. Same text with different canonical identity/location stays distinct.
- [ ] **Prove RED:** Run the three focused route/presentation suites and record the duplicated initial Manila assertion.
- [ ] **GREEN:** Replace raw origin-plus-stops joins in the shared shell with the projection; use it in another shared header/card only if the same raw join is found. Leave map/leg endpoints intact.
- [ ] **Verify:** Rerun route/presentation tests, including desktop/mobile labels and accessible fallback label; commit the read-only projection.

## Task 5: Truthful imported leg provenance and booking association

**Files:** Modify `lib/easyt/spreadsheet-import.ts`, `lib/easyt/imported-trip-hydration.ts`; `lib/easyt/road-transfer-resolution.ts` or `lib/easyt/transport-leg-compatibility.ts` only if metadata suppression needs a narrow fix. Test `tests/spreadsheet-import.test.ts`, `tests/itinerary-transport-agenda.test.ts`, `tests/transport-workspace-browser.test.ts`.

**Interface:** `unconfirmedImportedLeg(leg: TripLeg): TripLeg` retains leg/stop identity and endpoints but sets unsupported mode to `unknown`, `durationMinutes`/`headlineMinutes`/`doorToDoorMinutes`/`usableDayLoss` to null, `confidence`/`provenance` to `unknown`, `scheduleNeedsChecking` to true, and `routeMetadata.roadFallbackEligible` to false. Remove any estimated road segments/geometry whose display would contradict the unknown state. Reviewed booking association uses adjacent from/to occurrences **and** transport date; a nonunique match attaches to no leg.

- [ ] **RED:** Assert five transfer legs for the fixture, 0 bookings, unknown/needs-confirmation state and no supported duration for El Nido→Bohol and Siquijor→Cebu City. Assert a complete explicit booking changes exactly one dated adjacent leg; repeat-name/date mismatch and ambiguous matches change none. Assert later confirmed edits remain authoritative.
- [ ] **Prove RED:** Run the focused import/transport suites; record the generic road/time failures.
- [ ] **GREEN:** Build the canonical legs through `buildCanonicalTripLegs`, then conservatively mark only unbooked/unconfirmed imported legs. Apply only uniquely matched reviewed bookings. Prevent the existing road fallback from promoting these unknown legs; no island heuristic or free-text booking parser.
- [ ] **Verify:** Rerun focused suites and leg compatibility tests; inspect Transport and Map projections for unknown labels with intact endpoints. Commit transport provenance separately.

## Task 6: Existing consumers and honest readiness

**Files:** Inspect `lib/easyt/explore.ts`, `lib/easyt/itinerary-calendar.ts`, `lib/easyt/trip-overview-imagery.ts`, `lib/easyt/personal-route.ts`, `lib/easyt/trip-readiness-summary.ts`, `lib/easyt/trip-facts.ts`, existing Stay/Map/Overview/Transport consumers. Modify only a proven day-gated image or readiness projection. Test the corresponding `tests/explore.test.ts`, `tests/itinerary-calendar.test.ts`, `tests/trip-overview-imagery.test.ts`, `tests/personal-route.test.ts`, `tests/stay-workspace.test.ts`, and readiness tests.

**Interface:** `deriveItineraryCoverage` continues to mean dated calendar coverage. Any readiness/status owner that equates open rows with substantive plans must separately inspect authored/scheduled content; 21 open rows never mean 21 activities or a complete itinerary.

- [ ] **RED:** Assert day-by-day and Calendar open all 21 dated empty days, normal Explore options/request bodies retain all six occurrence IDs and canonical place context, and Stay/Map/Overview/Transport read the same trip. Assert Explore success, genuine empty, partial failure and provider failure remain distinct; approved image candidate follows existing source/credit path, absent candidate remains placeholder. Assert structural days alone do not produce fully-planned copy/status.
- [ ] **Prove RED:** Run focused consumer suites; distinguish missing structural input from actual consumer failure before editing a consumer.
- [ ] **GREEN:** Make only the readiness wording/status or unnecessary day-existence image gate changes proved by RED. Keep existing Explore/provider and image owners; do not promise results or new photos.
- [ ] **Verify:** Rerun the listed suites and inspect EN/ES wiring for touched copy; commit only narrow consumer/readiness changes. If all pass with the hydrated trip, commit the new consumer regression tests alone.

## Task 7: Guarded legacy `spreadsheet-v1` repair through TripShell

**Files:** Modify `lib/easyt/imported-trip-hydration.ts`, `components/easyt/trip-shell-client.tsx`; `components/easyt/use-trip-mutation-persistence.ts` only for a read-only recovery-classification-ready signal. Test `tests/trip-shell-canonical-mutation.test.ts`, `tests/trip-mutation-persistence.test.ts`, `tests/trip-browser-storage.test.ts`, `tests/trip-persistence.test.ts`, and a focused legacy hydration test. Do not add write code to `lib/easyt/storage.ts` or `lib/easyt/repository.ts`.

**Interface:** `repairEligibleSpreadsheetV1Trip(current: EasyTTrip): EasyTTrip` reuses Task 2 day projection and Task 5 unknown-leg normalization, returns `current` unchanged unless the eligibility predicate above is proven. The mounted provider invokes it once via `mutation.mutateTrip(repairEligibleSpreadsheetV1Trip, "import-legacy-hydration-v1")` after owner/recovery classification.

- [ ] **RED:** Test an eligible old 0-day import repairs to 21 days with identical trip/owner/stop/booking IDs and revision-safe acknowledgement; second invocation and reload write nothing. Test partly authored/scheduled/ambiguous trips no-op, later confirmed leg preserved, account switch/owner mismatch blocked, concurrent newer account revision conflict retained, newer local recovery not overwritten, and failed acknowledgement leaves one recoverable copy.
- [ ] **Prove RED:** Run the focused repair and mutation/recovery suites; record missing eligible repair while existing conflict tests stay green.
- [ ] **GREEN:** Implement the pure predicate/repair and the one-shot TripShell invocation after classification-ready, current owner and no pending/conflicting recovery. Use only the existing mutation callback. If the data cannot prove eligibility, do **not** enable automatic repair; report Task 7 blocked and leave Tasks 1–6 intact for review.
- [ ] **Verify:** Rerun focused suites, inspect the diff for direct storage/repository writes or new trip creation, then commit only if the owner and eligibility tests pass. A blocked gate gets a documented finding, not an unsafe commit.

## Task 8: Actual import and responsive acceptance

**Files:** Existing import/TripShell/Itinerary/Explore/Stay/Transport/Map browser tests or Storybook stories; only focused fixture/evidence additions. No new page or control.

**Interface:** Exercise the production import review → one Create trip → Overview/Itinerary/Calendar/Explore/Stay/Transport/Map → hard reload/recovery path for the Philippines fixture and one less-structured fixture.

- [ ] **RED:** Add browser assertions for the integrated production flow and replay them against an isolated approved-spec base checkout to preserve the pre-implementation no-days/duplicate-label/road evidence. At 390, 430 and desktop record keyboard focus, overflow and import-review status; verify supported EN/ES strings only where wiring already exists.
- [ ] **Prove RED:** Run the existing opt-in browser harness or manual local browser flow against that base checkout with the fixed fixture and viewport; preserve screenshots and exact failing assertions without changing the implementation branch.
- [ ] **GREEN:** Add/adjust browser assertions to the approved behavior. Fix only a concrete scope regression revealed by actual production components, reusing shared controls and tokens. No import-specific visual redesign.
- [ ] **Verify:** Repeat matched browser flow and screenshots at 390, 430 and desktop, including keyboard/day navigation, saved trip reload and no duplicate Create; build Storybook if a shared story changed. Commit focused browser evidence/tests and any scoped fix.

## Task 9: Whole-branch verification and independent review

- [ ] Run all affected import, Itinerary/Calendar, route/TripShell, Transport, Explore, imagery, Stay, recovery/account and browser suites. Record exact passed/failed/skipped totals and any unavailable provider result separately.
- [ ] Run `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook` when shared UI/stories changed, and `git diff --check`; no CI or remote build.
- [ ] Independently review canonical occurrence preservation, no invented content, 0-journey alias behavior, readiness claims, unknown-leg fallback, duplicate Create, legacy eligibility, account/recovery conflict, and downstream provider/imagery truthfulness. Fix findings in the owning task with RED → GREEN before final acceptance; no no-op commit.
- [ ] Report task commits, changed files, browser evidence, exact checks, legacy-repair gate result and remaining provider/photo uncertainty. This is local implementation review, not staging approval.

## Execution order and stop gates

Run Tasks 1–6 sequentially; Task 2 stays pure until Task 3 integrates it. Task 7 follows only after creation-time hydration and conflict tests are green. Task 8 uses the integrated production flow; Task 9 verifies the whole branch. **Native sequential** is recommended because parser validation, canonical day composition, leg provenance and recovery mutation share one evolving trip contract. No task should begin by replaying the spreadsheet into an existing trip or writing from a read-only server/loader path.

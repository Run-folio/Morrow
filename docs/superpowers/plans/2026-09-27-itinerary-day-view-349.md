# Itinerary Day View #349 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Itinerary → Day by day view immediately legible and useful on empty, planned and travel days while preserving every canonical planning action.

**Architecture:** `TripItineraryWorkspace` remains the only Itinerary day-selection, mutation and persistence owner. It projects canonical trip data into the shared `JourneyRouteStopTrack`, existing `RichItineraryDayPlanner`, stay/transport/map context and existing suggestion owner. A pure presentation image selector chooses only approved trip/destination photos; it never fetches or saves photo choice.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, existing Morrovia controls/tokens, Node test runner and Storybook. No new dependencies are planned.

**Spec:** `docs/superpowers/specs/2026-09-27-itinerary-day-view-349-design.md` (approved at commit `5e3a8d52448d91d1857b5500a6b28c03455a94e2`). Read it before Task 1.

## Global Constraints

- Work only in `/Users/shaun/.codex/worktrees/itinerary-day-view-349/Morrovia` on `codex/itinerary-day-view-349`, based on `f6dd263550d3eccdd9bbf388423d0fa2e6882668`; do not reset to or change staging/main.
- Do not push, deploy, trigger GitHub Actions, consume CI minutes, alter production configuration/data or customer trips, or merge #346/Trips branches.
- The approved mockup controls composition, not factual content. No new Today/active-trip mode, navigation, scheduling/timezone engine, Google Places integration, trip schema or persistence owner.
- Keep the desktop shared photo destination strip **and** precise day rail. On mobile retain the existing compact day navigation and hide the destination strip, avoiding two stacked horizontal navigators.
- Only supported canonical/product data may supply weather, exact times, booking status, opening hours, duration, hotel or transport facts; otherwise omit them or label an existing estimate truthfully.
- Image variation is deterministic and presentation-only: explicit reviewed/assigned route or day imagery wins; otherwise prefer an unused valid photo of the same stop/destination among simultaneously visible media, retain the matching source metadata, allow a duplicate when no valid alternative exists, and never persist choice or show unrelated photography. Compact strip thumbnails have no individual photo-credit controls; required visible attribution uses the selected-day hero or an established page-level/consolidated credit treatment tied to the displayed source.
- Extend production owners and semantic tokens; do not build a parallel planner, itinerary state, photo fetch, suggestion fetch or Storybook-only mockup. Preserve EN/ES copy, map and photo attribution, recovery and loading states.
- Use RED → GREEN for each behavior change, then make a focused local commit. Never weaken an existing assertion or `audit:ui` baseline to obtain green.

## File responsibility map

| File | Planned responsibility |
| --- | --- |
| `lib/easyt/itinerary-presentation-images.ts` (new) | Pure read-only photo projection; source records remain in `trip-overview-imagery.ts`, `itinerary-media.ts` and route-photo owners. |
| `lib/easyt/itinerary-route-track.ts` (new) | Pure adapter from canonical occurrence/day projection to shared track entries; no selection state. |
| `lib/easyt/route-timeline.ts` | Optional disabled state on the shared stop type, with current consumers unaffected. |
| `components/journey-planner-strip.tsx` / `.module.css` | Shared disabled-stop rendering; retain the existing compact thumbnail treatment without credit icons. |
| `components/easyt/trip-itinerary-workspace.tsx` / `.module.css` | Sole day selection, mutation and persistence integration; header, stay/logistics/support placement, responsive composition. |
| `components/easyt/rich-itinerary-day-planner.tsx` / `.module.css` | Compact empty/populated presentation using existing composition and callbacks. |
| Existing colocated Storybook stories and focused `tests/` files | Production-component fixtures and behavior/persistence regressions. |

Do not split `TripItineraryWorkspace` into a second controller. The two new `lib/easyt` files are pure presentation projections, not alternate data or state owners.

## Review Focus

1. **Repeated occurrence:** Tokyo → Kyoto → Tokyo must distinguish the two Tokyo stop IDs, including back/forward URL and Calendar selection. Task 2 tests both navigation targets and active state.
2. **One or zero valid photos:** one-image days may repeat with the correct source metadata; no-photo days show no unrelated hero or layout gap. Tasks 1 and 3 test both, including required visible attribution through the hero or page-level credit treatment.
3. **Logistics-only day:** a booked transfer or stay remains prominent while the activity invitation appears, without claiming the whole day is empty. Tasks 3 and 4 test it.
4. **Provider failure or late response:** switching days during suggestion loading cannot replace the new day's results; failure never hides saved items or prevents manual Add. Task 6 tests it.
5. **Long trip and narrow viewport:** long Mexico/Guatemala labels and a 65-day route retain reachable day controls and no horizontal page overflow. Tasks 2 and 7 test it.

---

### Task 1: Deterministic, attributed itinerary photo projection

**Files:**
- Create: `lib/easyt/itinerary-presentation-images.ts`
- Create: `tests/itinerary-presentation-images.test.ts`
- Modify: `lib/easyt/itinerary-media.ts`
- Read only: `lib/easyt/trip-overview-imagery.ts`, `lib/easyt/route-images.ts`

**Interfaces:**
- Consumes `EasyTTrip`, `OverviewPlaceImage`, `overviewStopImage(trip, stop)`, `mediaImagesForExactDestination(destination)` and `routeImageCredit(src)`; use existing records only.
- Produces `mediaImagesForExactDestination(destination: string): JourneyImage[]` in `itinerary-media.ts`. It uses the existing exact normalized key or declared `MEDIA_KEYS` alias and omits the broad substring fallback used by legacy `mediaImagesFor`, so a partial city-name match cannot invent a valid candidate.
- Produces `itineraryPresentationImages(trip: EasyTTrip): { stopById: Readonly<Record<string, OverviewPlaceImage | null>>; dayById: Readonly<Record<string, OverviewPlaceImage | null>> }` for Tasks 2–3. Both maps use canonical IDs, never city names.

- [ ] **Step 1: Write the failing selector tests.** In `tests/itinerary-presentation-images.test.ts`, fixture two visits to Tokyo with multiple valid Tokyo photos, one-photo Kyoto and an unknown/no-photo stop. Name tests `explicit reviewed photo wins`, `valid alternatives precede duplicates`, `one valid image may repeat`, `unknown destination has no photo` and `selection is stable without trip mutation`. Assert exact output keys are stop/day IDs; no candidate from substring-only city matching is accepted; a photo without required source metadata falls back rather than losing its credit; source, licence and full-credit metadata travel with the chosen `src`; two calls deep-equal and the input trip JSON is unchanged.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/itinerary-presentation-images.test.ts`; expect failure because the selector is absent.
- [ ] **Step 3: Implement the exact media helper and pure selector.** Derive candidate sets from `overviewStopImage`, exact destination media and the selected day's assigned image. Accept an overview result only when its source is an explicitly assigned image of that stop, a reviewed `routeImageCredit` record, or an exact-destination media candidate; this filters the legacy broad substring fallback. Process stops in canonical order and days by canonical day number, preferring an explicit image for its own stop/day. Among non-explicit candidates, choose the first unused source within the visible stop collection, then rotate valid day candidates deterministically; reset to a valid duplicate only after alternatives are exhausted. Carry the selected record's own attribution. Do not call a provider, add random choice or mutate/persist `EasyTTrip`.
- [ ] **Step 4: Confirm GREEN and compatibility.** Run `node --experimental-strip-types --test tests/itinerary-presentation-images.test.ts tests/route-editorial-imagery.test.ts tests/itinerary-destination-track.test.ts`; expect all pass.
- [ ] **Step 5: Commit.** `git add lib/easyt/itinerary-presentation-images.ts lib/easyt/itinerary-media.ts tests/itinerary-presentation-images.test.ts && git commit -m "feat(itinerary): project varied approved day photos"`.

### Task 2: Shared photo destination strip and occurrence-safe navigation

**Files:**
- Create: `lib/easyt/itinerary-route-track.ts`
- Modify: `lib/easyt/route-timeline.ts`
- Modify: `components/journey-planner-strip.tsx`, `components/journey-planner-strip.module.css`, `components/journey-planner-strip.stories.tsx`
- Modify: `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-itinerary-workspace.module.css`, `components/easyt/trip-itinerary-workspace.stories.tsx`
- Create: `tests/itinerary-route-track.test.ts`
- Modify: `tests/trip-itinerary-workspace-presentation.test.ts`, `tests/itinerary-destination-track.test.ts`

**Interfaces:**
- Consumes Task 1's `itineraryPresentationImages(trip).stopById` and existing `itineraryDestinationTrack`, `firstItineraryDayForStop`, `setSelectedIndex`, `RouteTimelineStop`, `JourneyRouteStopTrack`.
- Produces `itineraryRouteTrackStops(trip: Pick<EasyTTrip, "stops" | "planItems">, selectedDayId: string | null, stopImages: Readonly<Record<string, OverviewPlaceImage | null>>, language: "en" | "es"): RouteTimelineStop[]`. Extend `RouteTimelineStop` only with optional `disabled?: boolean`; the adapter passes `image.src` to the shared track and keeps source metadata in Task 1's projection for the selected-day/page-level attribution owner. Do not add `photoCredit` or another credit hit target to the 30–32px thumbnail track.

- [ ] **Step 1: Write failing track/navigation tests.** Assert the adapter returns only canonical stops (never `kind: "origin"` or `All trip`), ordered by `stop.order`, with correct day/range labels and stop-ID-keyed active state; Tokyo-first and Tokyo-return have separate first-day targets; a stop with no day is disabled; Spanish labels are localized. Add a workspace presentation assertion that it renders `JourneyRouteStopTrack` and calls the existing index-selection path. Extend `RepeatedDestinationSecondOccurrence` Storybook `play` to select the second Tokyo, switch Day by day → Calendar → Day by day, and assert the same canonical day/stop and existing numeric `day` query value. Add a deep-link/popstate regression using `itineraryWorkspaceHref(..., dayNumber)` and `parseItineraryWorkspaceTarget`; assert `day` remains the sole selected-day query key. Shared-strip tests assert disabled buttons do not fire, thumbnail fallback geometry is stable, and no per-thumbnail credit control/icon appears.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/itinerary-route-track.test.ts tests/trip-itinerary-workspace-presentation.test.ts tests/itinerary-destination-track.test.ts tests/route-timeline.test.ts`; expect the new adapter/strip assertions to fail.
- [ ] **Step 3: Implement the adapter and shared extension.** Use `itineraryDestinationTrack` by canonical stop ID, compute labels from that occurrence's days, and pass only `image.src` into the shared track. Keep the shared thumbnail, connector, active state, fallback and normal compact appearance. Render a no-day stop as a real disabled button; do not add a camera/credit icon or hidden interactive control to any thumbnail. In the workspace replace only local `.destinationTrack` markup with `JourneyRouteStopTrack` using `presentation="integrated"`, `surface="standalone"` and the existing localized aria label; use `onSelectStop(id)` → `firstItineraryDayForStop` → `days.findIndex` → existing `setSelectedIndex` when nonnegative. Update the workspace's internal push/restore orientation to write/read the established numeric `day` value via `parseItineraryWorkspaceTarget`/`itineraryWorkspaceHref`, retaining the current Day by day/Calendar view orientation. Do not add origin or a second day-selection state. Preserve the desktop day rail and current mobile rule hiding the destination strip.
- [ ] **Step 4: Confirm GREEN and shared consumers.** Run the RED command plus `node --experimental-strip-types --test tests/trip-workspace-links.test.ts tests/map-trip-shell-presentation.test.ts tests/trip-explore-workspace-presentation.test.ts tests/stay-workspace.test.ts`; expect all pass. Inspect Map, Explore and Stay track stories at desktop and 390px in Task 7.
- [ ] **Step 5: Commit.** Stage only the files in this task and `git commit -m "feat(itinerary): use shared occurrence-safe destination track"`.

### Task 3: Compact selected-day photo heading and truthful stay/logistics context

**Files:**
- Modify: `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-itinerary-workspace.module.css`, `components/easyt/trip-itinerary-workspace.stories.tsx`
- Modify: `tests/trip-itinerary-workspace-presentation.test.ts`, `tests/itinerary-stay-presentation.test.ts`, `tests/itinerary-transport-agenda.test.ts`

**Interfaces:**
- Consumes Task 1's `dayById[active.id]`, `MorroviaPhotoCredit`, existing `SelectedDayStayContext({ composition, tripId, onSelect })`, `composeItineraryDay`, `itineraryTransportAgenda`, map detail/handoff and the current workspace selectors.
- Produces a compact day heading using the selected canonical day and its attributed `OverviewPlaceImage | null`; no new state or changed stay/transport model.

- [ ] **Step 1: Write failing heading/context tests.** Test valid hero source with matching credit, no-photo text-only heading, day/date/stop identity, long destination containment and consistent weekday/date. Assert any thumbnail source requiring visible attribution is represented accurately in the selected-day hero or established consolidated/page-level credit treatment; never imply that the active hero's credit covers a different thumbnail image. Add travel-day cases for incoming/outgoing transfer truth, tonight's stay versus checkout/no-overnight, and one booking shown once. Assert no mockup weather, invented hotel detail, fake exact time or booked claim.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/trip-itinerary-workspace-presentation.test.ts tests/itinerary-stay-presentation.test.ts tests/itinerary-transport-agenda.test.ts`; expect new heading/layout assertions to fail.
- [ ] **Step 3: Compose existing owners.** Add the compact header photo only when `dayById[active.id]` is valid, place its existing `MorroviaPhotoCredit` outside navigation/menu targets, and keep text readable. Keep required attribution for other displayed strip sources in the established page-level/consolidated credit treatment with exact source mapping, not a thumbnail control. Keep `SelectedDayStayContext` directly below; use existing composition/agenda for arrivals, departures, stay and booking detail, without an independent selector or duplicate booking card. Preserve the current recovery and detail priority.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-day-composition.test.ts tests/itinerary-day-context.test.ts`; expect all pass.
- [ ] **Step 5: Commit.** Stage only Task 3 files and `git commit -m "feat(itinerary): clarify selected day and stay context"`.

### Task 4: Compact empty and logistics-only day planner

**Files:**
- Modify: `components/easyt/rich-itinerary-day-planner.tsx`, `components/easyt/rich-itinerary-day-planner.module.css`, `components/easyt/rich-itinerary-day-planner.stories.tsx`
- Modify: `components/easyt/trip-itinerary-workspace.tsx`
- Modify: `tests/rich-itinerary-day-planner-presentation.test.ts`, `tests/itinerary-workspace-gauntlet.test.ts`

**Interfaces:**
- Widen `RichItineraryDayPlannerProps.onAddOpen` to `(dayPart: ItineraryDayPart | null) => void`; add optional `onSeeSuggestions?: () => void`. A `null` daypart calls existing `openAddFlow(active.notes.length, "activity")` with no invented period. The workspace callback opens/focuses the existing `${tabIdPrefix}-ideas` details/summary; it does not own results.
- Preserve all existing planner callbacks, `composition` input and canonical mutation routing.

- [ ] **Step 1: Write failing empty-state tests.** Assert zero visible activities produces one compact invitation plus Add/See suggestions, not four prominent empty rows; the four dayparts remain reachable in disclosure; unslotted activities suppress the empty invitation; logistics-only days retain transfer and stay before invitation; Add targets selected day with no fake time; removing the last activity restores the invitation. Storybook's empty and logistics-only fixtures must render the production planner/workspace.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/rich-itinerary-day-planner-presentation.test.ts tests/itinerary-workspace-gauntlet.test.ts`; expect the new empty-state assertions to fail.
- [ ] **Step 3: Extend `RichItineraryDayPlanner`.** Show the invitation only when planned plus unslotted visible activity count is zero. Keep transfers/context outside it. Put empty period controls in one accessible disclosure and keep drag/add targets reachable when expanded or actively dragging. Wire Add to existing composer and See suggestions to the workspace's existing section, with focus restoration on day change. Keep the existing daypart model and no extra itinerary state.
- [ ] **Step 4: Confirm GREEN and mutation safety.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-workspace-mutations.test.ts tests/itinerary-day-composition.test.ts`; expect all pass.
- [ ] **Step 5: Commit.** Stage only Task 4 files and `git commit -m "feat(itinerary): make empty days inviting and compact"`.

### Task 5: Make populated saved activity composition primary

**Files:**
- Modify: `components/easyt/rich-itinerary-day-planner.tsx`, `components/easyt/rich-itinerary-day-planner.module.css`, `components/easyt/rich-itinerary-day-planner.stories.tsx`
- Modify: `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-itinerary-workspace.module.css`
- Modify: `tests/rich-itinerary-day-planner-presentation.test.ts`, `tests/itinerary-day-composition.test.ts`, `tests/itinerary-workspace-mutations.test.ts`

**Interfaces:**
- Consumes Task 4's planner props, `composeItineraryDay`'s `planned`, `unslotted` and `transfers`, and the unchanged workspace edit/move/undo handlers.
- Produces no new data model or mutation signature. Existing `ActivityRow`, `ItineraryActivityIdentity`, detail owner and `.sequenceEditor` remain accessible.

- [ ] **Step 1: Write failing populated-state regressions.** Cover exact-time, daypart and untimed rows in canonical order; valid activity thumbnail versus fallback; booked only with canonical booking; occupied periods visible ahead of secondary insertion controls; dense day readable; protected rows not editable. In `tests/itinerary-workspace-mutations.test.ts`, extend the existing add → move → remove → undo → JSON reload path to assert stable IDs, saved order, dayparts and only supported `startsAt` values. Assert menus/keyboard movement, cross-day move and drag still call the existing handlers.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/rich-itinerary-day-planner-presentation.test.ts tests/itinerary-day-composition.test.ts tests/itinerary-workspace-mutations.test.ts`; expect new composition assertions to fail while existing mutation truth remains green.
- [ ] **Step 3: Refine the existing planner presentation.** Put saved transfer/activity content before empty daypart/insertion chrome; retain occupied daypart order and unslotted rows. Keep the current `ActivityRow` selection and menu controls; make Add activity reachable without four repeated buttons. Preserve `.sequenceEditor` for detailed editing, canonical drag/drop, keyboard alternatives and undo notice. Display `startsAt` only when present and booking state only from actual booking evidence. Do not add mockup-only Add meal/transport controls.
- [ ] **Step 4: Confirm GREEN and save/reload.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-calendar.test.ts tests/trip-shell-canonical-mutation.test.ts tests/state-preservation-torture.test.ts`; expect all pass, including durable/recovery reload of item IDs, order, dayparts and supported times.
- [ ] **Step 5: Commit.** Stage only Task 5 files and `git commit -m "feat(itinerary): prioritise the saved day plan"`.

### Task 6: Put relevant suggestions ahead of secondary intentions

**Files:**
- Modify: `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-itinerary-workspace.module.css`, `components/easyt/trip-itinerary-workspace.stories.tsx`
- Modify: `tests/itinerary-day-context.test.ts`, `tests/itinerary-recommendation-quality.test.ts`, `tests/itinerary-ideas.test.ts`, `tests/trip-itinerary-workspace-presentation.test.ts`

**Interfaces:**
- Consumes the current `ItineraryDaySuggestions({ trip, day, stop, ... })` internal owner, `rankItineraryRecommendations`, `ideaStateForPlace`, the day-keyed component instance, `createAbortableEffectScope` and parent `scheduleIdea(idea, dayId, dayPart?)`.
- Produces an optional `previewLimit?: number` on the internal suggestion component, with `3` in the day support rail. The full ranked candidate set and Explore handoff stay in the existing owners.

- [ ] **Step 1: Write failing hierarchy/async tests.** Assert three relevant Mexico City results preview before different-destination retained intentions, each with supported thumbnail/category/duration and Add action; Tikal/Lake Atitlán remain accessible but are not called nearby. Test no-results, partial/unavailable provider, rapid day switch with late response, duplicate clicks, exact selected day ID and pending/error state. Assert manual Add and existing saved plan remain available throughout.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/itinerary-day-context.test.ts tests/itinerary-recommendation-quality.test.ts tests/itinerary-ideas.test.ts tests/trip-itinerary-workspace-presentation.test.ts`; expect new hierarchy/preview assertions to fail.
- [ ] **Step 3: Reorder and constrain presentation only.** Move the existing suggestion section ahead of cross-destination `TripExplicitPlans` in the support rail, show at most three ranked results without changing ranking/eligibility/fetching, and keep See all/Explore. Keep explicit plans and notes accessible. Close/reset previous-day detail on day change; preserve abortable scopes and day-keyed rendering. Continue using mutation pending keys and canonical idea state to reject a second Add; do not duplicate provider fetches.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-workspace-gauntlet.test.ts tests/itinerary-workspace-mutations.test.ts`; expect all pass.
- [ ] **Step 5: Commit.** Stage only Task 6 files and `git commit -m "feat(itinerary): keep day suggestions contextual"`.

### Task 7: Responsive production stories and interaction acceptance

**Files:**
- Modify: `components/easyt/trip-itinerary-workspace.module.css`, `components/easyt/rich-itinerary-day-planner.module.css`
- Modify: `components/easyt/trip-itinerary-workspace.stories.tsx`, `components/easyt/rich-itinerary-day-planner.stories.tsx`, `components/journey-planner-strip.stories.tsx`
- Modify: `tests/itinerary-workspace-gauntlet.test.ts`, `tests/itinerary-calendar-presentation.test.ts`, `tests/trip-itinerary-workspace-presentation.test.ts`

**Interfaces:**
- Consumes Tasks 1–6 unchanged. Storybook renders `TripItineraryWorkspace`, `RichItineraryDayPlanner` and `JourneyRouteStopTrack` production components, using local trip fixtures only.
- Produces named stories for all ten spec fixture classes and responsive variants at 390, 430, 768, 1024 and 1440 CSS px; no Storybook-only UI component or customer data.

- [ ] **Step 1: Write failing fixture/responsive assertions.** The ten stories cover empty Mexico City/no stay, populated Mexico City/stay/photo, mixed timing, transfer/stay transition, no suggestions, no photography, long Mexico/Guatemala names, Tokyo → Kyoto → Tokyo, dense day and logistics-only day. Assert mobile CSS hides the shared strip while retaining the current compact day rail; tablet support follows the plan; Calendar and day selection use the same parent; no new navigation/Today mode appears.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/itinerary-workspace-gauntlet.test.ts tests/itinerary-calendar-presentation.test.ts tests/trip-itinerary-workspace-presentation.test.ts`; expect new story/layout assertions to fail.
- [ ] **Step 3: Add only production-backed stories and responsive CSS.** Keep the desktop rail and strip, reflow support below the plan at 768–1024px, and show one compact day scroller at 390/430px. Keep photo credits, map attribution, menus/dialogs, Add and Calendar reachable. Use existing Morrovia tokens and breakpoints; do not add another mobile navigation or fixed action layer.
- [ ] **Step 4: Confirm GREEN and visual behavior.** Re-run the RED command, then run `npm run build-storybook` and `npm run storybook` locally. At all five widths check screenshot geometry, no page overflow, loading/fallback media size, keyboard focus, touch targets, and no per-thumbnail credit action. Compare the empty/populated state to the approved mockup and the photo strip to shared Explore/Stay/Map treatment. Correct concrete mismatches and rerun the same tests.
- [ ] **Step 5: Commit.** Stage only Task 7 files and `git commit -m "test(itinerary): cover responsive day view states"`.

## Final local verification and completion gate

**Spec coverage check:** Task 1 covers valid/varied imagery and attribution; Task 2 covers the shared origin-free occurrence track, desktop rail and selection/Calendar identity; Task 3 covers day identity, photo, stay and transport truth; Task 4 covers empty, partial and logistics-only planning; Task 5 covers populated content and every existing edit/move/undo path; Task 6 covers suggestions, retained intentions and provider failures; Task 7 covers production Storybook fixtures, EN/ES and the full responsive matrix. The global constraints apply to every task.

After Task 7, use the actual local application with isolated fixtures or an approved test account. Check desktop and 390px Add, edit, remove, reorder, move, undo, suggestion Add once, save/reload, day deep links and Day by day ↔ Calendar selected-day preservation. Check 430, 768, 1024 and 1440 in Storybook. Verify long labels, no-photo and provider-failure states, repeated Tokyo occurrences, logistics-only days, EN/ES labels, map/photo attribution and other shared-track consumers. Do not modify customer trips.

Run and record exact pass/fail/skipped evidence:

```bash
node --experimental-strip-types --test tests/itinerary-*.test.ts tests/rich-itinerary-day-planner-presentation.test.ts tests/trip-itinerary-workspace-presentation.test.ts tests/trip-workspace-links.test.ts tests/route-timeline.test.ts
npm run typecheck
npm run audit:ui
npm run build:check
npm run build-storybook
git diff --check
git status --short --branch
```

If a wildcard pulls an unrelated flaky test, report the exact failure and rerun a named focused set; do not delete or weaken it. A local build may require installing the existing lockfile dependencies in this worktree; use the lockfile unchanged. The implementation report must list base SHA, branch/worktree, changed owners, Storybook states/screenshots, local save/reload outcome, all checks, risks and final local commit SHA. Do not push or deploy.

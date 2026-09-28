# Itinerary Day View #349 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Itinerary → Day by day view immediately legible and useful on empty, planned and travel days while preserving every canonical planning action.

**Architecture:** `TripItineraryWorkspace` remains the only Itinerary day-selection, mutation and persistence owner. It projects canonical trip data into the shared `JourneyRouteStopTrack`, existing `RichItineraryDayPlanner`, stay/transport/map context and existing suggestion owner. A pure presentation image selector chooses only approved trip/destination photos; it never fetches or saves photo choice.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, existing Morrovia controls/tokens, Node test runner and Storybook. No new dependencies are planned.

**Spec:** `docs/superpowers/specs/2026-09-27-itinerary-day-view-349-design.md` (approved at commit `5e3a8d52448d91d1857b5500a6b28c03455a94e2`). Read it before Task 1.

**Follow-up:** Tasks 1–7 are completed implementation history through `1852e57f411242427ad59f5404ba60aa8da8cc7c`; do not replay them. The approved compact mobile TripShell amendment was committed at `55d5345fd993bd6c1df6103a7452b09f9ee15d46` and its content-position clarification at `5728481202a371c401c6aa0fa4c8543147112a78`. Execute only Tasks 8–14 after separate review of this amended plan, using the previously selected **native sequential** method.

## Global Constraints

- Work only in `/Users/shaun/.codex/worktrees/itinerary-day-view-349/Morrovia` on `codex/itinerary-day-view-349`, based on `f6dd263550d3eccdd9bbf388423d0fa2e6882668`; do not reset to or change staging/main.
- Do not push, deploy, trigger GitHub Actions, consume CI minutes, alter production configuration/data or customer trips, or merge #346/Trips branches.
- The approved mockup controls composition, not factual content. No new Today/active-trip mode, navigation, scheduling/timezone engine, Google Places integration, trip schema or persistence owner.
- Keep the desktop shared photo destination strip **and** precise day rail. On mobile retain the existing compact day navigation and hide the destination strip, avoiding two stacked horizontal navigators.
- Only supported canonical/product data may supply weather, exact times, booking status, opening hours, duration, hotel or transport facts; otherwise omit them or label an existing estimate truthfully.
- Image variation is deterministic and presentation-only: explicit reviewed/assigned route or day imagery wins; otherwise prefer an unused valid photo of the same stop/destination among simultaneously visible media, retain the matching source metadata, allow a duplicate when no valid alternative exists, and never persist choice or show unrelated photography. Compact strip thumbnails have no individual photo-credit controls; required visible attribution uses the selected-day hero or an established page-level/consolidated credit treatment tied to the displayed source.
- Extend production owners and semantic tokens; do not build a parallel planner, itinerary state, photo fetch, suggestion fetch or Storybook-only mockup. Preserve EN/ES copy, map and photo attribution, recovery and loading states.
- Use RED → GREEN for each behavior change, then make a focused local commit. Never weaken an existing assertion or `audit:ui` baseline to obtain green.
- Follow-up only: compact the **shared mobile** TripShell and ordinary device-only status, leaving the global header and desktop shell visually unchanged. Keep one interactive Route/Edit/More tree and the existing resolver, mutation, orientation and recovery owners. On 390×844, first meaningful day content in the initial viewport is the hard UX goal; first saved activity there on a normal populated day is a stretch goal that never overrides truthful logistics, serious recovery, readable titles, ≥44px targets or text zoom.

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
| `components/easyt/trip-shell.tsx`, `trip-shell-client.tsx`, `trip-shell.module.css` | One shared mobile identity/action/navigation presentation; preserve desktop composition, route/edit links and More owner. |
| `components/easyt/trip-shell-resolver.tsx`, `morrovia-feedback.tsx` / `.module.css` | Existing device-only promotion and save/recovery presentation; no new persistence state. |
| `components/easyt/trip-itinerary-workspace.tsx` / `.module.css` | Follow-up mobile toolbar, selected-day hero, source disclosure and compact notice placement; sole day owner remains. |
| `components/easyt/rich-itinerary-day-planner.tsx` / `.module.css` | Follow-up read-first populated layout while retaining all insertion, movement, drag and keyboard controls. |
| `lib/easyt/itinerary-day-composition.ts` | Correct one-day ownership of each canonical inter-stop transfer; keep final departure. |

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

## Approved follow-up: compact mobile shell and final Itinerary polish

Tasks 8–14 implement only the approved follow-up amendment. Tasks 1–7 and their commits remain complete; do not rewrite, reset or replay them. Use the existing #349 worktree and branch, with one native executor and a RED → GREEN → focused local commit cycle for each task. No product code starts until this amended plan is reviewed. The baseline Storybook `AcceptanceMobile390` with the existing `day=2` query measured a 209px trip header, 61px workspace navigation, 241px Itinerary toolbar, day panel at y=750px and first saved activity at y=1263px in a 390×843 CSS viewport; the requested matched acceptance viewport is 390×844. Keep the before capture and measure the actual 390×844 result after implementation. No forced scroll, hidden logistics or reduced touch targets may be used to satisfy the viewport goal.

### Follow-up review focus

1. **Shared shell drift:** a long/unknown-date, no-photo or image-failure trip on Overview, Itinerary, Explore, Stay and Transport must keep a readable identity, one set of Route/Edit/More actions and a correct URL-driven active tab. Task 8 and Task 14 cover this.
2. **Promotion versus recovery:** an ordinary device-only trip must show Save trip and preserve the auth return, while pending/cloud/error/conflict states remain truthful and prominent. Task 9 and Task 14 cover this.
3. **Canonical day context:** the Mexico City Day 2 fixture must not show Day 3's departure; selected Tokyo occurrence, `day` deep link and Calendar return must remain exact. Task 10 and Task 14 cover this.
4. **Mutation parity:** compact reading/Undo cannot remove precise insertion, cross-day movement, keyboard controls, drag targets or save/reload. Tasks 11–12 and Task 14 cover this.
5. **Image-source mismatch:** header thumbnail, route thumbnails and selected-day hero may use different reviewed sources; each displayed source remains discoverable without tiny credit hit targets or a detached route-credit band. Task 13 and Task 14 cover this.

### Task 8: Shared compact mobile TripShell identity, actions and navigation

**Files:** Modify `components/easyt/trip-shell.tsx`, `components/easyt/trip-shell-client.tsx`, `components/easyt/trip-shell.module.css`, `components/easyt/trip-shell.stories.tsx`; create `tests/trip-shell-mobile-presentation.test.ts`; retain the existing link/orientation and photo projection owners.

**Interfaces:** Consume `deriveTripDateFacts`, `tripDisplayTitle`, `personalRouteHref`, `tripBuilderHref`, `WorkspaceOrientationLauncher`, `TripShellNavigation`, `ResilientImage` and `itineraryPresentationImages(trip)` as a read-only approved-photo source. Produce one shared mobile presentation through the existing `TripShell`/`TripShellImage`/`TripShellIdentityAndActions` components; preserve their canonical mutation provider and the existing desktop header. Any mobile thumbnail uses an `OverviewPlaceImage` with its matching source fields and a discoverable existing credit disclosure, or the existing neutral fallback; Task 13 consolidates credit placement. Do not add a second interactive header tree or a new photo fetch.

- [ ] **Step 0: Freeze exact visual baseline.** Before changing product code, capture the production-component `AcceptanceMobile390` Storybook state with the existing `day=2` URL at measured CSS viewport 390×844 and scroll y=0. Record the six y/height landmarks in Task 14 and save the viewport/full-page images outside the repository. Preserve the earlier 390×843 probe at `~/.codex/visualizations/2026/09/27/01a0e43a-9517-7680-87cc-5c3e9e529e8e/itinerary-349-followup/before-390x844-populated.png` as context, not as the exact matched comparator.
- [ ] **Step 1: Write RED shell tests.** Assert the same shell component is used on all five workspace routes; mobile CSS attaches full-width identity and tabs beneath the global header, suppresses only the decorative eyebrow/route/count metadata, retains truthful dates/duration, stable 40–48px approved thumbnail/fallback and a full accessible long title. Assert exactly one Route link, Edit link, More launcher and five ordered navigation links; their existing destinations/`aria-current`, menu Escape/outside/focus behavior and ≥44px hit areas remain. Add long-title, unknown-date, no-photo and desktop-unchanged stories with production components.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/trip-shell-mobile-presentation.test.ts tests/trip-workspace-links.test.ts tests/workspace-orientation.test.ts`; expect the new mobile assertions to fail and existing link tests to stay green.
- [ ] **Step 3: Implement only the shared mobile composition.** Reflow the existing semantic header and `TripShellNavigation` at the existing mobile breakpoint; keep one Route/Edit/More DOM tree, existing link handlers and menu owner. Derive mobile image from valid existing projection with source metadata and expose its credit through an existing discoverable disclosure outside the tiny thumbnail from this task onward; Task 13 may consolidate that placement. Retain desktop hero behavior and use the intentional fallback when no valid credited mobile image exists. Do not make the whole lockup clickable or sticky.
- [ ] **Step 4: Confirm GREEN and shared-route behavior.** Re-run the RED command, plus `node --experimental-strip-types --test tests/trip-shell-canonical-mutation.test.ts tests/map-trip-shell-presentation.test.ts`. Inspect the shared shell stories at 390, 430 and desktop for menu containment, focus return, title wrapping and correct active tab.
- [ ] **Step 5: Commit.** Stage only Task 8 files and `git commit -m "feat(trip-shell): compact shared mobile trip identity"`.

### Task 9: Compact ordinary device-only save promotion

**Files:** Modify `components/easyt/trip-shell-resolver.tsx`, `components/easyt/trip-shell.tsx`, `components/easyt/trip-shell.module.css`, `components/easyt/trip-shell.stories.tsx`; modify `tests/trip-shell-mobile-presentation.test.ts`, `tests/auth-feedback.test.ts`, `tests/feedback-rollout.test.ts`, `tests/trip-sync-recovery.test.ts` and `tests/trip-recovery-classification.test.ts`. Touch `components/easyt/morrovia-feedback.tsx`/`.module.css` only if its existing banner/status composition cannot safely express the compact row.

**Interfaces:** `TripShellResolver` alone decides the ordinary `!ownerId` notice and continues to use `tripSaveSignInHref(tripId)`; `TripShellCanonicalMutationProvider`, `MorroviaSaveStatus`, `MorroviaStatusBanner` and `MorroviaRecoveryFeedback` remain state/recovery owners. If a presentation slot is needed, pass a single `ReactNode` from resolver to `TripShell`; do not clone its Save link or create new save state.

- [ ] **Step 1: Write RED status tests.** For device-only, assert one compact mobile status/action adjacent to the identity and a reachable Save trip link with the same trip ID and auth return. Distinguish account saved, saving/pending, failed, auth, conflict and device-recovery states; ordinary status may compact, serious states retain title, safety copy and actions. Assert desktop banner presentation and the existing promotion/recovery path remain unchanged.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/trip-shell-mobile-presentation.test.ts tests/auth-feedback.test.ts tests/feedback-rollout.test.ts tests/trip-sync-recovery.test.ts`; expect only new compact-layout assertions to fail.
- [ ] **Step 3: Recompose the existing ordinary notice.** Place the one resolver-owned informational notice within or immediately below the mobile lockup and keep its Save trip action. Preserve desktop visual presentation and leave warning/error/recovery banners in their current prominent path. Do not add storage, sync or dismiss persistence.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command plus `node --experimental-strip-types --test tests/trip-recovery-classification.test.ts tests/trip-shell-canonical-mutation.test.ts`; inspect mobile device-only and error states at 390/430, and desktop account/device states.
- [ ] **Step 5: Commit.** Stage only Task 9 files and `git commit -m "feat(trip-shell): compact ordinary mobile device status"`.

### Task 10: Compact mobile Itinerary chrome and selected-day hero

**Files:** Modify `components/easyt/trip-itinerary-workspace.tsx`, `.module.css`, `.stories.tsx` and, for the verified next-day transfer duplication, `lib/easyt/itinerary-day-composition.ts`; modify `tests/trip-itinerary-workspace-presentation.test.ts`, `tests/itinerary-day-composition.test.ts`, `tests/itinerary-transport-presentation.test.ts`, `tests/itinerary-calendar-presentation.test.ts` and `tests/itinerary-workspace-gauntlet.test.ts`.

**Interfaces:** Keep `TripItineraryWorkspace` as sole day-selection/mutation/persistence owner; reuse `ItinerarySubviewSwitch`, `EasyTSelect`, existing `setSelectedIndex`, numeric `day` orientation, `SelectedDayStayContext`, `itineraryTransportAgenda`, `RichItineraryDayPlanner` and `MorroviaPhotoCredit`. Preserve desktop `JourneyRouteStopTrack` plus precise day rail; preserve one mobile horizontal **day** rail. Produce no new state owner or transport facts.

- [ ] **Step 1: Write RED chrome/context tests.** Assert a compact, labelled mobile switch/heading/Today-when-eligible/previous-select-next composition without duplicated trip range or a separate jump-label band; selected day scrolls only inside its rail, not the document. Assert the photo hero remains credited and shorter on mobile, no-photo has no reserved media height, stay remains destination-scoped/saved-versus-booked, and only canonical day-relevant transport appears. The Mexico fixture's Day 2 must not show its Day 3 Oaxaca departure; the transition appears once on Day 3, while a genuine same-date transition still appears once on its canonical destination day and a final departure remains represented. Assert Tokyo occurrence IDs, `day` URL and Day by day ↔ Calendar return remain exact.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/trip-itinerary-workspace-presentation.test.ts tests/itinerary-day-composition.test.ts tests/itinerary-transport-presentation.test.ts tests/itinerary-calendar-presentation.test.ts tests/itinerary-workspace-gauntlet.test.ts`; expect the new layout/logistics assertions to fail. Record separately the pre-existing Map effect assertion in `trip-itinerary-workspace-presentation.test.ts`, whose assertion and Map source were unchanged at frozen SHA.
- [ ] **Step 3: Refine current owners.** Reflow the toolbar and hero at mobile breakpoints using existing controls/tokens, keep accessible labels and ≥44px controls, remove redundant subtitle only, and preserve true stay/transport context. In `transfersForDay`, let the destination/transition day's existing `incomingLegForPlanItem` own each inter-stop leg once; remove the preceding day's `outgoingLegForDay` projection, while keeping explicit final-departure behavior. Keep day-rail selection scrolling local to the rail. Do not hide all transfers or add an empty travel card.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-destination-track.test.ts tests/itinerary-route-track.test.ts tests/itinerary-calendar.test.ts tests/itinerary-stay-presentation.test.ts`; all new assertions pass. If the unchanged Map assertion still fails, report it as the verified frozen-base exception, with no test weakening.
- [ ] **Step 5: Commit.** Stage only Task 10 files and `git commit -m "feat(itinerary): compact mobile day orientation and hero"`.

### Task 11: Read-first populated RichItineraryDayPlanner

**Files:** Modify `components/easyt/rich-itinerary-day-planner.tsx`, `.module.css`, `.stories.tsx`; modify `tests/rich-itinerary-day-planner-presentation.test.ts`, `tests/itinerary-day-composition.test.ts`, `tests/itinerary-workspace-mutations.test.ts`.

**Interfaces:** Keep `RichItineraryDayPlanner` and its existing `composition`, `onAddOpen(part)`, `onActivityDrop`, `onDayPartChange`, `onMoveActivity`, `onMoveToDay`, detail/drag handlers and workspace `.sequenceEditor`. Do not create a second planner or copy of canonical item state.

- [ ] **Step 1: Write RED reading/editing tests.** On populated days, saved transfers/activities and supported daypart/time labels precede repeated editor chrome; show one obvious Add activity action, valid existing thumbnails/fallback and discreet item controls. Occupied dayparts do not each show a default prominent Add something row. Precise insertion stays available via existing edit/disclosure, drop targets appear during drag, and keyboard/menu movement, cross-day move, edit, remove, Undo, stable IDs and JSON reload still work. Empty and logistics-only days keep their distinct invitations.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/rich-itinerary-day-planner-presentation.test.ts tests/itinerary-day-composition.test.ts tests/itinerary-workspace-mutations.test.ts`; expect new read-first assertions to fail while existing mutation paths stay green.
- [ ] **Step 3: Demote repeated insertion UI in the existing planner.** Reuse current activity rows and handlers; make occupied-period Add controls secondary until editing/insertion is requested, while leaving drop markers and `.sequenceEditor` functional. Keep exact times and booking labels only when supported by canonical data.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-calendar.test.ts tests/trip-shell-canonical-mutation.test.ts tests/state-preservation-torture.test.ts`; inspect populated, empty, logistics-only and dense-day stories on mobile and desktop.
- [ ] **Step 5: Commit.** Stage only Task 11 files and `git commit -m "feat(itinerary): prioritise populated day reading"`.

### Task 12: Compact normal success and Undo feedback

**Files:** Modify `components/easyt/trip-itinerary-workspace.tsx`, `.module.css`, `.stories.tsx`; modify `components/easyt/morrovia-feedback.module.css` only if a reusable semantic compact variant is needed; modify `tests/auth-feedback.test.ts`, `tests/feedback-rollout.test.ts` and `tests/itinerary-workspace-mutations.test.ts`.

**Interfaces:** Reuse `MorroviaBriefNotice({title, detail?, action?, onDismiss?, autoDismissMs?})`, existing workspace `notice`/`undoReceipt` and `undoLastItemAction`; error states continue through `MorroviaRecoveryFeedback`. No new timer, receipt, notification state or undo mutation is produced.

- [ ] **Step 1: Write RED feedback tests.** Assert normal Add/move/remove success uses a compact polite notice with a visible ≥44px Undo action when a receipt exists; dismiss and Undo never overlap at 320/390px or with long EN/ES text. Undo remains available until the existing dismiss/new-action semantics end it; the remove/Undo regression and latest-valid receipt stay intact. Serious save/planner failure still uses full recovery feedback.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/auth-feedback.test.ts tests/feedback-rollout.test.ts tests/itinerary-workspace-mutations.test.ts`; expect the new compact-geometry/feedback assertions to fail.
- [ ] **Step 3: Style the existing notice in Itinerary context.** Reduce normal receipt padding/layout while retaining `role="status"`, polite announcement, action, dismiss and existing `autoDismissMs` behavior. Keep full recovery notices unchanged.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command; inspect Add → Undo, remove → Undo, long Spanish copy and keyboard focus at 320/390/430px.
- [ ] **Step 5: Commit.** Stage only Task 12 files and `git commit -m "feat(itinerary): compact normal undo feedback"`.

### Task 13: Integrate route and shell photo attribution

**Files:** Modify `components/easyt/trip-itinerary-workspace.tsx`, `.module.css`, `.stories.tsx`, `components/easyt/trip-shell-client.tsx` and `components/easyt/trip-shell.module.css` for Task 8's shell disclosure; modify `tests/photo-credit-presentation.test.ts`, `tests/itinerary-presentation-images.test.ts`, `tests/trip-itinerary-workspace-presentation.test.ts`, `tests/trip-shell-mobile-presentation.test.ts`.

**Interfaces:** Consume Task 1's `itineraryPresentationImages(trip)` records, Task 8's approved mobile thumbnail record and existing `MorroviaPhotoCredit`/consolidated disclosure patterns. The selected-day hero continues its own source-specific credit. Source, license and full-credit links must correspond to each displayed `src`, including a route thumbnail different from the hero and a shell thumbnail different from both.

- [ ] **Step 1: Write RED attribution tests.** Use fixture photos with three distinct reviewed source records, a one-photo repeat, no-photo fallback and failed image load. Assert source metadata/links follow the displayed shell, route and hero image; no 30–32px thumbnail credit hit targets, camera icon over actions or detached full-width `routePhotoSources` row remain. The consolidated disclosure is discoverable by keyboard, includes all displayed route-thumbnail sources and remains truthful when images differ.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/photo-credit-presentation.test.ts tests/itinerary-presentation-images.test.ts tests/trip-itinerary-workspace-presentation.test.ts tests/trip-shell-mobile-presentation.test.ts`; expect the new source-placement assertions to fail, recording the known frozen-base Map assertion separately.
- [ ] **Step 3: Compose existing credit UI.** Move the route-thumbnail disclosure into a compact established context location rather than removing source links, preserve the hero's `MorroviaPhotoCredit`, and make the shell thumbnail source discoverable outside its tiny image. Do not invent credit text or assume one source covers another. Preserve MapLibre attribution.
- [ ] **Step 4: Confirm GREEN.** Re-run the RED command plus `node --experimental-strip-types --test tests/itinerary-destination-track.test.ts tests/map-trip-shell-presentation.test.ts`; inspect keyboard disclosure, no-photo and differing-source Storybook states.
- [ ] **Step 5: Commit.** Stage only Task 13 files and `git commit -m "feat(itinerary): integrate compact photo source disclosure"`.

### Task 14: Matched responsive and actual-app acceptance

**Files:** Modify `components/easyt/trip-itinerary-workspace.stories.tsx`, `components/easyt/trip-shell.stories.tsx` and focused fixture/presentation tests only where acceptance exposes a defect; save screenshots and measurements outside the repository. No disconnected mockup component.

**Interfaces:** Consume Tasks 8–13 unchanged, with production `TripShell`, `TripItineraryWorkspace`, `RichItineraryDayPlanner`, `JourneyRouteStopTrack`, resolver and feedback owners. Existing `day` URL, mutation provider and persistence paths remain authoritative.

- [ ] **Step 1: Write RED acceptance fixtures/tests.** Fix the Storybook pathname/trip-ID mismatch so Itinerary is active only on its actual route; provide account-saved populated, ordinary device-only, saving/pending, recovery/error, empty, logistics-only, travel, long/unknown-date, no-photo, EN/ES, Undo, provider-failure/late-response and Tokyo → Kyoto → Tokyo states. Assert the shared shell across all five workspaces, one mobile day rail, correct selected occurrence, Calendar return, exact-day suggestion Add once, menu/sheet containment and no duplicate controls. Use real product components; avoid customer trip data.
- [ ] **Step 2: Confirm RED.** Run `node --experimental-strip-types --test tests/trip-shell-mobile-presentation.test.ts tests/trip-itinerary-workspace-presentation.test.ts tests/itinerary-workspace-gauntlet.test.ts tests/itinerary-calendar-presentation.test.ts`; expect new fixture assertions to fail and list the frozen-base Map assertion separately.
- [ ] **Step 3: Complete fixtures and correct only acceptance defects.** Use the same trip/day/status and initial scroll for matched before/after 390×844 captures, plus 430×844, 320px/text zoom, 768, 1024 and 1440. Record shell, tabs, ordinary notice, toolbar, first meaningful content and first saved activity y coordinates. For this measurement, first meaningful content means the first day-specific stay, relevant transport, saved-plan item or actionable empty/logistics-only invitation; the photo/heading alone does not satisfy it. That content must appear within the initial 390×844 viewport for the representative normal state; report an exceptional warning/recovery state separately rather than hiding its content. First saved activity there is a stretch target on a normal populated day and must move substantially earlier than y=1263. Never hide true logistics, serious status or readable controls to meet that target. Include viewport and useful full-page captures with CSS viewport metadata.
- [ ] **Step 4: Confirm GREEN and actual-app behavior.** Run the RED command, `npm run build-storybook`, `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `git diff --check` and the focused shell/recovery/itinerary/Map-consumer suites from Tasks 8–13. Inspect actual local application at desktop and 390/430px: Route/Edit/More, Save trip/recovery, active tab, `day` deep link, repeated Tokyo occurrence, Day by day ↔ Calendar, Add/edit/reorder/move/remove/Undo, exact-day suggestion Add, save/reload, attribution, 44px targets, focus order and no horizontal overflow. Report pass/fail/skip separately; do not weaken UI audit baselines or pre-existing assertions.
- [ ] **Step 5: Commit.** Stage only Task 14 fixture/test changes and `git commit -m "test(itinerary): verify compact mobile shell acceptance"`. Report task commits, screenshots, measurements, complete local verification and final HEAD. No push, deploy or CI.

**Follow-up spec coverage check:** Task 8 owns shared mobile identity/actions/navigation and approved imagery; Task 9 owns ordinary device-only presentation versus serious recovery; Task 10 owns mobile orientation, truthful hero/stay/transport and canonical day/Calendar identity; Task 11 owns read-first populated planning with full mutation parity; Task 12 owns compact Undo with unchanged receipt semantics; Task 13 owns distinct displayed-image attribution; Task 14 owns production-story and actual-app responsive, persistence, focus and matched before/after acceptance. All tasks inherit the original Global Constraints and the approved spec amendment. The one known frozen-base Map assertion is reported, never silently skipped or weakened.

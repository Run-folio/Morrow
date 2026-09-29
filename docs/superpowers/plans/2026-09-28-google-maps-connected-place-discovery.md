# Google Maps Connected Place Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a traveller inspect native Google map places and nearby results, deliberately save or add a place to the correct canonical trip day, and recover that reference without copying Google place facts into Morrovia's trip document.

**Architecture:** The existing `JourneyMapPlannerWorkspace` remains the sole trip, stop/day, category, selection and mutation owner. A lazy Google Maps canvas replaces the expanded authenticated Trip Map canvas only when the feature and both required browser configuration values are available; server Places calls stay behind the existing authenticated API. A tagged provider reference extends existing itinerary/accommodation owners, while MapLibre consumers receive only neutral reference projections.

**Tech Stack:** Next.js, React, TypeScript, existing Maps/Places spike and API, existing trip repository, Node tests, Storybook. Do not add a map or persistence dependency merely for this feature.

**Spec:** `docs/superpowers/specs/2026-09-28-google-maps-connected-place-discovery-design.md` at `615323464818e857d71aef913bfbfc7b3f551a62`.

## Global Constraints

- **Jurisdiction gate resolved:** the founder verified Google Cloud project **1042247868089**, now **Morrovia Core**, linked to a billing account whose payments-profile country is **United Kingdom**. Record **UK / non-EEA** for this implementation. Use the spec's non-EEA canvas plus custom server Places branch, subject to the applicable agreement, Places policies, attribution and storage limits. Recheck the project/billing link and any superseding agreement before live enablement; revisit the EEA/Places UI Kit gate only if new evidence changes jurisdiction.
- Never display custom Google Places content in association with MapLibre. Preserve MapLibre and its existing consumers for the flag-off and unavailable paths without presenting Google results beside it.
- Existing canonical stop occurrence, day selection, trip mutation, itinerary scheduling, accommodation choice, repository, recovery and consented analytics owners remain authoritative. No second saved-place document or generated route owner.
- Store only Google provider reference, canonical Morrovia binding, stable traveller-choice ID, genuinely user-authored text and resolution freshness. Google name, coordinates, address, rating, hours, reviews, photos and photo URLs are transient.
- Browser Maps key and optional map ID must be separately restricted from the server Places key. Flag defaults off. Enable Maps JavaScript API and Places API (New) for the verified project as prerequisites through the approved Cloud owner, with no Cloud configuration change from Codex. No Google Directions/Routes calls solely for route drawing; no automatic Nearby requests on map pan/zoom.
- Use existing Morrovia controls/tokens, one category navigation, one desktop selected-place panel or one mobile sheet, accessible result list, 44×44 CSS-pixel custom mobile targets, correct Google attribution and disclosure.
- Keep local-only, no push, deploy, CI, staging/main edits or staging/production database writes. Do not weaken tests or UI-audit allowances.

## Review Focus

1. A native Google POI absent from Nearby results still resolves by its `placeId` and selects the correct detail, not the first list item (Tasks 1–2).
2. Switching repeated destination occurrences or categories while a request is pending never paints the stale place into the newly selected stop or day (Tasks 2 and 6).
3. Double tapping Add, reloading, then removing or undoing a saved Google reference cannot create a second choice or lose the first (Tasks 4–5).
4. An obsolete Place ID preserves the saved reference and offers retry/reselection without a name-based silent rematch (Task 5).
5. Browser/server key failure and photo/review failure leave a truthful, usable base experience without mixing Google content onto MapLibre (Tasks 3 and 6).

---

## File/owner map and shared contracts

| Owner | Expected files | Responsibility |
| --- | --- | --- |
| Canvas and canonical selection | `components/journey-map-planner-workspace.tsx`, new `components/easyt/google-trip-map-canvas.tsx`, new `lib/easyt/map-workspace-selection.ts`, `components/journey-planner-map.tsx` (read-only except a proven compatibility fix) | Parent owns selected occurrence/day/category/place; canvas emits native POI and canonical overlay events only. |
| Provider/API | `lib/easyt/google-place-enrichment.server.ts`, `lib/easyt/place-enrichment.ts`, `lib/easyt/google-place-photo.ts`, `app/api/journey-place-enrichment/route.ts` | Authenticated bounded Nearby, base Details, selected media, ID-only refresh; no durable facts. |
| Discovery presentation | `components/easyt/map-place-enrichment.tsx` and its module CSS, `components/easyt/trip-map-workspace.tsx` and module CSS, parent workspace | One controlled results/detail projection, shared category navigation, desktop panel and existing mobile sheet. |
| Canonical save | `lib/easyt/trip.ts`, `lib/easyt/itinerary-ideas.ts`, `lib/easyt/accommodation.ts`, `lib/easyt/storage.ts`, `lib/easyt/repository.ts` | Tagged Google reference, existing trip mutation/scheduling/accommodation paths and serialization. |
| Downstream readers | `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-explore-workspace.tsx`, overview/dashboard/My Trips projections, `lib/easyt/stay-workspace.ts`, `lib/easyt/itinerary-day-composition.ts`, other `ItineraryIdea` readers found by `rg` | Reference-aware neutral or provider-resolved display, never a fabricated persistent Google fact. |
| Acceptance | `components/easyt/trip-map-workspace.stories.tsx`, focused `tests/` files, local browser evidence | Production-component states, responsive and actual keyed-map flows. |

The task interfaces use these contracts consistently; adapt the exact existing `EasyTTrip` mutation callback shape without adding a new persistence owner:

```ts
type WorkspacePlaceSelection =
  | { kind: "none" }
  | { kind: "google"; placeId: string; stopId: string; dayId: string | null }
  | { kind: "existing-map-result"; resultId: string; stopId: string; dayId: string | null };
type GooglePlaceReference = {
  provider: "google";
  placeId: string;
  lastResolvedAt?: string; // successful reference resolution only
};
type GooglePlaceReferenceIdea = {
  id: string; // stable Morrovia traveller-choice ID
  source: "google-place-reference";
  stopId: string; // canonical stop occurrence, not destination name
  category: "activity" | "restaurant" | "stay";
  providerReference: GooglePlaceReference;
  dayId?: string;
  dayPart?: ItineraryDayPart | null;
  userNote?: string;
};
```

The new tagged branch must not require `title`, coordinate, address or photo fields. Legacy non-Google `ItineraryIdea` remains unchanged. A Google stay is a `category: "stay"` reference in the existing `brief.itineraryIdeas` collection, read and removed through the existing accommodation-choice owner. It is an **unbooked choice**, excluded from activity rows and accommodation-complete counts; never create a booking or map pin by copying Google facts.

### Task 1: Actual Google canvas and native POI proof

**Files:** Create `components/easyt/google-trip-map-canvas.tsx`, `lib/easyt/map-workspace-selection.ts`, `tests/google-trip-map-canvas.test.ts`; modify `components/journey-map-planner-workspace.tsx`, `components/easyt/trip-map-workspace.stories.tsx`; inspect existing `components/journey-planner-map.tsx`.

**Interfaces:** `GoogleTripMapCanvas` consumes canonical stops/legs, selected stop occurrence, selected `WorkspacePlaceSelection`, and callbacks `onSelectStop(stopId)`, `onSelectLeg(legId)`, `onSelectNativePoi(placeId)`. `selectNativePoi(placeId, stopId, dayId)` in the parent produces the `kind: "google"` selection above. The canvas does not own saved trip state or Places results.

- [ ] **RED:** Write focused tests for flag-off no SDK load; incomplete configuration unavailable without Google-labelled MapLibre; flag-on lazy **single-flight** SDK load only in expanded authenticated Map; mount/unmount cleanup; category/detail changes preserving the same map instance and camera; SDK rejection/invalid browser key recovery; separate browser/server key paths; stop/leg identity and repeated stops; native POI event `placeId` (including one absent from Nearby) suppressing the competing default info window and calling the parent once. Include mobile selection and no Directions/Routes invocation.
- [ ] Run `node --experimental-strip-types --test tests/google-trip-map-canvas.test.ts` (or the repository's existing focused test runner); confirm the new assertions fail for the missing adapter.
- [ ] **GREEN:** Add the narrow browser canvas adapter and parent branch. Draw canonical overlay geometry from existing trip coordinates, not a Google-generated route. Keep the existing MapLibre branch as the non-Google map experience, with no Places UI mixed into it.
- [ ] Run the same focused test and relevant existing map-selection tests; verify pass. Commit the task's files with `feat(map): add gated Google canvas and native POI selection`.

### Task 2: One parent-owned discovery and detail selection

**Files:** Modify `components/journey-map-planner-workspace.tsx`, `components/easyt/map-place-enrichment.tsx`, `components/easyt/map-place-enrichment.module.css`, `components/easyt/trip-map-workspace.tsx`, associated module CSS; test `tests/map-result-selection.test.ts` and new `tests/google-map-workspace-selection.test.ts`.

**Interfaces:** Parent owns `WorkspacePlaceSelection`, current canonical stop occurrence, day, `Plan | Stay | Eat | See` category, scoped results and scroll restoration. Controlled child receives these and emits `onSelectPlace(placeId)` / `onBackToPlaces()`. Native POI, list item and custom result marker call the same parent selection transition; parent fetches Details by selected `placeId` even when it is absent from the result set.

- [ ] **RED:** Test native POI, fetched list and custom marker entrances converge on the same parent action and the existing authenticated **server** Details path, with no browser Details call; native POI absent from Nearby still resolves. Empty-map click preserves existing dismissal/Add-pin behavior, custom trip markers retain canonical IDs, and no display-name/index matching occurs. Test one desktop results-or-detail panel and one mobile sheet/header; Back restores exact occurrence/category/result set/list position; fast selection between Tokyo → Kyoto → Tokyo keeps the two Tokyo stop IDs distinct, and stale Details cannot replace a newer selection. Assert no provider toggle, second See/Eat/Stay/Practical strip, nested Back to day planning or child-owned selected-place state.
- [ ] Run focused selection/workspace tests and confirm these new assertions fail.
- [ ] **GREEN:** Move spike selection and category control into `JourneyMapPlannerWorkspace`; render the controlled list/detail in the existing panel/sheet. Keep provider data ephemeral in parent memory; restore list scroll via the existing scroll container, without refetch when scoped results remain valid.
- [ ] Run focused map/workspace tests and commit `feat(map): unify Google discovery selection and detail`.

### Task 3: Progressive factual details and attribution

**Files:** Modify `lib/easyt/google-place-enrichment.server.ts`, `lib/easyt/place-enrichment.ts`, `lib/easyt/google-place-photo.ts`, `app/api/journey-place-enrichment/route.ts`, controlled detail component and CSS; test `tests/google-place-enrichment-server.test.ts`, `tests/place-enrichment.test.ts`, and API route tests.

**Interfaces:** Existing authenticated `/api/journey-place-enrichment` remains the only server fetch path. Split bounded base Details from selected-only media/reviews; retain source and attribution metadata with transient detail/photo projections. Use explicit Nearby and Details field masks; return optional facts as absent rather than synthesized strings.

- [ ] **RED:** Test the route retains authentication, input bounds and `no-store`; base Details returns available name/category/address/rating count/current open state/hours/website/Google Maps link without loading list-wide media; selected photo/review requests carry their own required attribution; missing facts stay absent; provider failure of optional media retains base detail. Test external text rendering and outbound URL validation, and test wording does not turn current opening state into a promise for a future itinerary day.
- [ ] Run focused provider/API tests and confirm failures for the new split/attribution cases.
- [ ] **GREEN:** Extend existing provider and route, request photos/reviews only for selected place, and render source links/credits next to the actual material. Reuse `google-place-photo.ts` validation, no persistent photo URL or detail cache.
- [ ] Run focused tests and commit `feat(places): resolve selected detail and attributed media`.

### Task 4: Reference-only Save and Add to day

**Files:** Modify `lib/easyt/trip.ts`, `lib/easyt/itinerary-ideas.ts`, `lib/easyt/accommodation.ts`, `components/journey-map-planner-workspace.tsx`, existing itinerary chooser/activity-placement UI, `lib/easyt/storage.ts`, `lib/easyt/repository.ts`; test `tests/itinerary-ideas.test.ts`, `tests/accommodation-state.test.ts`, repository/storage tests and new `tests/google-place-reference.test.ts`.

**Interfaces:** Add tagged `GooglePlaceReferenceIdea` and `GooglePlaceReference` above to the existing `brief.itineraryIdeas` trip model; `saveGooglePlaceReference(trip, input)` and `scheduleGooglePlaceReference(trip, choiceId, dayId, dayPart)` are pure existing-owner mutations returning `EasyTTrip`, with idempotency keyed by stable choice ID. The parent calls the existing canonical mutation callback once. Hotel references are projected by the existing accommodation-choice owner as unbooked options, not by `stayBookingForStop`; no `TripBooking` or mapped-stay pin from Google data.

- [ ] **Before RED:** Inventory every `ItineraryIdea` reader with `rg` across Overview, Itinerary, Explore, expanded Map, MapLibre previews, My Trips, repository, recovery and accommodation. Record the resulting file list in the task review before changing the tagged model.
- [ ] **RED:** Test selection and camera pan do not save or silently change intended stop/day; Save for later and Add to day are separate explicit actions. Test persisted JSON contains provider/placeId, canonical stop occurrence, optional day/daypart, stable choice ID, authored note and resolution freshness only; explicitly assert absence of name, coordinates, address, rating, hours, reviews, photos, photo URLs and provider descriptions at every nesting level. Test two Tokyo occurrences, wrong-stop/ambiguous-day chooser, double activation, explicit Save vs Add, Undo/remove, reload and legacy non-Google idea round-trip. Test Google stay remains unbooked and excluded from accommodation-complete counts.
- [ ] Run focused model/scheduling/storage tests and confirm new assertions fail against `itineraryIdeaForLocalPlace` / `scheduleItineraryIdea`'s current title-coordinate path.
- [ ] **GREEN:** Add the tagged branch and narrow reference mutations in the existing owners; bypass legacy conversion for Google, retain chooser/Undo/persistence behavior and existing trip save/recovery path. Add only necessary type guards to old consumers.
- [ ] Run focused tests and commit `feat(trip): save Google places as canonical references`.

### Task 5: Durable Place ID lifecycle and downstream projections

**Files:** Modify provider/API, `lib/easyt/itinerary-ideas.ts`, `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-explore-workspace.tsx`, `lib/easyt/stay-workspace.ts`, `lib/easyt/itinerary-day-composition.ts`, Overview/dashboard/My Trips reader files found by `rg 'itineraryIdeas|\.title|placeId'`, `lib/easyt/storage.ts`, `lib/easyt/repository.ts`; add `tests/google-place-reference-lifecycle.test.ts` and update focused consumer tests.

**Interfaces:** `resolveGooglePlaceReference(reference)` returns a transient `{ status: "resolved"; detail; refreshedReference } | { status: "unavailable"; reason: "invalid" | "not-found" | "provider-failure"; reference }`. Successful ID-only refresh updates `lastResolvedAt`; failed resolution never erases the choice or rewrites `placeId`. Provider facts from a successful detail stay transient.

- [ ] **RED:** Test a recent ID avoids needless refresh; a reference older than 12 months uses the supported ID-only refresh path before detail; successful refresh records a new freshness time without provider facts. `INVALID_REQUEST` and `NOT_FOUND` retain saved stop/day binding, offer retry and traveller-led reselection, and never fuzzy-rematch or silently swap identity with a search result. Test Overview, Itinerary, Explore, expanded Map, lightweight MapLibre previews, My Trips, repository and recovery with resolved/unavailable references; any MapLibre view uses neutral saved-reference text/outbound Google Maps link without custom Google content. Assert Saved, Added to day and Booked remain distinct.
- [ ] Run lifecycle and affected consumer tests; confirm failures.
- [ ] **GREEN:** Add ID-only provider operation and typed unavailable projection; update existing consumers with reference-aware branches rather than persisting fetched facts. Preserve legacy ideas and saved/scheduled binding.
- [ ] Run focused tests and commit `feat(places): refresh IDs and render durable references`.

### Task 6: Bounded requests, cancellation, failure and cost visibility

**Files:** Modify provider/API, `components/journey-map-planner-workspace.tsx`, `lib/easyt/place-enrichment.ts`, existing analytics module/call sites; test provider/API, new `tests/google-place-request-control.test.ts`, workspace tests.

**Interfaces:** Requests carry a canonical scope `{ stopId, category, requestId }`; responses only update the still-current scope. Nearby runs on explicit stop/category entry or retry, not on pan/zoom. Count Maps JS load, Nearby, base Details, photo media and retry separately through existing consented analytics owner.

- [ ] **RED:** Test bounded stop/category-scoped Nearby, no pan/zoom request storm, rapid stop/category changes and cancellation, stale detail rejection, in-memory dedupe only, partial failure retaining valid current-scope results, retry of **only** the failed scope. Cover absent/invalid browser key, absent/invalid server key, quota, offline, SDK rejection, and optional media failure. Assert analytics separates SDK load, Nearby, Details, photo media and retry/failure without raw trip documents, notes or precise travel history. No failure state renders Google list beside MapLibre.
- [ ] Run focused request/control tests; confirm failures.
- [ ] **GREEN:** Bound and cancel requests in existing provider/parent, expose truthful distinct errors and retry, add privacy-safe counters using existing analytics. Record exact masks and current SKU classes for the execution report; do not add an unbounded general search engine.
- [ ] Run focused provider/workspace tests and commit `feat(places): bound requests and recover scoped failures`.

### Task 7: Shared interaction principles and responsive production UI

**Files:** Modify existing Map workspace components/CSS and `components/easyt/trip-map-workspace.stories.tsx`; add or extend focused keyboard/responsive browser tests. Read `docs/design-system.md` and canonical controls/stories before changing UI.

**Interfaces:** Reuse current Map mobile sheet/focus/dismissal controls, shared `JourneyRouteStopTrack`/category/navigation primitives where applicable, and the Task 2 controlled detail. Storybook renders actual production components with a fake provider boundary, including no-photo, unavailable and repeated-stop states.

- [ ] **RED:** Add browser assertions at 390, 430, 768, 1024 and 1440 for 44×44 custom targets and separation, no marker hit-area overlap, selected POI visible above sheet, unobscured map controls and Google attribution, native pan/zoom and POI clickability, keyboard result **and trip-item** selection, mobile keyboard/focus and Back restoration, long labels, no page-level overflow, and one mobile sheet/header. Include a native POI not in the result list and destination/category/day retention. Storybook fixtures must show distinct Delhi, Agra and Jaipur scoped results, not the spike's reused Delhi records, plus no-photo, no-review, no-hours and failure states.
- [ ] Run focused browser/story checks and capture failing current states.
- [ ] **GREEN:** Adjust existing responsive composition and markers; preserve native pan/zoom/POI interactions and a list-based accessible path. Keep one primary Add to day action and labeled secondary actions; never hide warnings or booking/storage distinctions.
- [ ] Run focused browser tests, inspect production Storybook states, and commit `feat(map): refine accessible responsive place planning`.

### Task 8: Actual local Google acceptance and combined verification

**Files:** Extend `components/easyt/trip-map-workspace.stories.tsx` only for missing production states; create a concise local evidence/report document under `docs/product/` if useful. No product code unless acceptance reveals a specific regression; any fix gets its own RED/GREEN test and focused commit.

**Interfaces:** Restricted local `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` for project 1042247868089 (Maps JavaScript API and allowed Morrovia/local referrers), `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` if required by the chosen marker API, separate server `GOOGLE_PLACES_API_KEY` restricted to Places API (New) and never sent to the browser, `MORROVIA_GOOGLE_PLACE_ENRICHMENT=enabled`, approved local test account/trip, bounded test budget. Both Maps JavaScript API and Places API (New) must be enabled by the approved Cloud owner. Keep secrets in ignored local environment. Confirm billing project and non-EEA agreement before enabling keyed tests; Codex does not change Cloud configuration.

- [ ] **RED acceptance:** In the actual local authenticated workspace, verify Google canvas loads, pan/zoom work, an unfetched native POI emits its `placeId` and opens the same parent Details through Morrovia's server; fast stop/category switch cannot overwrite it; select an intended canonical day, Add or Save, reload/reopen with the same binding, remove/Undo; inspect obsolete ID, provider failure and repeated same-name destination; repeat at mobile 390/430 and keyboard. Use disposable local data, not staging/production. If keys or budget are unavailable, record **LIVE MAP GATE UNVERIFIED** and do not substitute fixtures.
- [ ] **Budget before keyed run:** Establish a small agreed spend cap and check actual pricing/SKU classes. For a single desktop-plus-mobile happy-path pass, target at most **2 page-session SDK loads, 2 Nearby calls, 3–4 base Details calls, 0–1 photo-media calls, 0–1 review requests, and 0–1 ID-only refresh**; total approximately **7–11 billable provider requests plus 2 SDK loads**, depending on which optional detail/media paths are enabled. Mock key/quota/offline failure cases. Log actual counts and stop if the agreed bound would be exceeded; these counts are a test budget estimate, not a pricing claim or quota guarantee.
- [ ] **GREEN only if a defect is found:** Add a regression test, observe failure, make the smallest owner-specific fix, rerun it and commit separately. Record browser screenshots, interaction results, actual masks/SKU classes and request counts.
- [ ] Run focused provider, map, selection, repeated-stop, scheduling, accommodation, repository/recovery, downstream rendering and responsive tests, then `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook`, and `git diff --check`. Report exact passed/failed/skipped gates; do not weaken audit baselines or turn an unverified live gate into READY.
- [ ] Review all changed files against the spec and policy constraints; record local commits and final HEAD. Stop at review gate. No push/deploy/CI/staging/main changes.

## Execution handoff

Read the approved spec and this plan before implementation. Execute task-by-task with RED → GREEN and a focused local commit per task, preserving unrelated worktree changes. Execution method remains for founder selection: **native** is recommended because the provider, parent selection, and canonical save interfaces have tight sequential dependencies; **subagent-driven** is available for independent per-task implementation and review at greater context cost. Do not begin product work until the plan is reviewed.

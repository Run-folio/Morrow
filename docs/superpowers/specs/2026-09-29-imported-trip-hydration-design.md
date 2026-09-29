# Imported trip hydration — technical design

**Date:** 29 September 2026
**Status:** For review; no implementation authorised
**Source case:** Philippines spreadsheet import observed on staging on 29 September 2026
**Scope:** Canonical structure and truthful presentation after a reviewed spreadsheet import

## Job and acceptance case

A traveller who imports a dated, multi-stop route should be able to open the resulting trip and start planning each day immediately. The import must retain the traveller's route, timing and explicit information without presenting inferred activities, bookings or unsupported transport as facts.

The observed case has six **occurrences**, 20 nights and 21 inclusive calendar dates, from 11 through 31 December 2026:

| Occurrence | Stop | Stay interval | Nights | Dated day ownership |
| --- | --- | --- | ---: | --- |
| 1 | Manila | 11–13 Dec | 2 | 11–12 Dec |
| 2 | El Nido | 13–18 Dec | 5 | 13–17 Dec |
| 3 | Bohol | 18–22 Dec | 4 | 18–21 Dec |
| 4 | Siquijor | 22–27 Dec | 5 | 22–26 Dec |
| 5 | Cebu City | 27–30 Dec | 3 | 27–29 Dec |
| 6 | Manila | 30–31 Dec | 1 | 30–31 Dec, including the departure day |

The arrival date belongs to the incoming stop. Each overnight belongs to the half-open interval `[arrivalDate, departureDate)`. The final departure date belongs to the final stop as a planning day, with **no extra night**. Thus there are 21 distinct day rows, not 20 or 22. The first and final Manila stops may share a canonical place ID but must retain separate occurrence IDs, dates and day bindings.

The staging review recognized the route, nights, dates and repeated Manila. Stay found hotels near the first stop. The saved Itinerary had no days; the shared trip heading repeated the origin and first Manila; two island connections appeared as approximate road journeys; Explore showed zero ideas; and Overview/route imagery used fallbacks. These are separate downstream symptoms. A screenshot does not establish whether an Explore provider returned empty results, failed, or was never requested.

## Current data flow and trust boundary

1. `app/journey/new/import/spreadsheet-import-client.tsx` reads CSV, XLSX or pasted rows in the browser. `lib/easyt/spreadsheet-import.ts` maps columns and builds a temporary `SpreadsheetImportProposal`; no trip is saved during parsing/review.
2. Review requires complete stop dates/nights and resolves the origin and **each source stop ID** through `/api/journey-geocode`. Each `ResolvedImportPlace` carries canonical place ID, name, country/code, region, provider ID and coordinates. Repeated source stops resolve separately even if their place identity is equal.
3. On explicit Create trip, `canonicalTripFromSpreadsheetProposal` calls `tripFromBuilder` once with the reviewed origin, occurrence IDs/order, date bounds, night allocations and schedule locks. It overlays reviewed stop dates, builds canonical legs, attaches confirmed bookings and notes, and writes `planItems` **only from explicitly dated activity rows**. A zero-activity sheet therefore produces `planItems: []` despite complete stop timing.
4. The client creates one trip ID, writes the ordinary local recovery record, then, for an account, saves the same canonical document and acknowledges recovery through the existing cache path. It navigates to the existing trip workspace. The spreadsheet proposal is not a persistence model.

The import's six stop identities can be present while a consumer still has no day context. Stay primarily needs the stop and its coordinates; Itinerary and Explore currently need `planItems`. This explains why Stay can work while the other two appear empty.

## Root causes by surface

| Surface | Current evidence | Root cause or remaining uncertainty |
| --- | --- | --- |
| Itinerary and Calendar | `canonicalTripFromSpreadsheetProposal` maps only `proposal.activities` to `planItems`; `trip-itinerary-workspace.tsx` shows its empty state when there is no active day; `itinerary-calendar.ts` also projects only existing day rows. | **Confirmed structural gap.** Complete stop timing does not create the canonical dated day skeleton. |
| Overview / route label / My Trips header | `trip-shell.tsx` and `trip-shell-client.tsx` join the raw origin name and every stop name. `trip-legs.ts` already deduplicates equal adjacent origin/first-stop endpoints for travel legs while retaining the stop ID. | **Confirmed presentation gap.** Raw label construction bypasses the canonical route projection; there is no need to delete either domain role. Inspect other shared route labels/cards for the same raw join. |
| Transport | Import review creates a transport booking only with explicit from, to, date and confirmation reference. There is no unbooked journey proposal. `buildCanonicalTripLegs` then creates five estimated legs; the generic same-country estimate can select road. Current validation does not reject every island crossing, and the legacy-road compatibility path does not cover these newly created `morrovia-planner` legs. | **Confirmed estimate/provenance mismatch.** The screenshot's road/time labels are not evidence of a reviewed route. The exact worksheet headers/cells and review mapping were not supplied, so whether its text reached supported transport columns is still unverified. |
| Explore | `exploreDestinationOptions` drops a stop with no `planItems`, before discovery requests. The import requires geocoded stop identity. | **Confirmed pre-request eligibility gap for zero-day imports.** Missing canonical identity is not established by the screenshots. After day hydration, distinguish request failure, genuine zero results and normal results using the existing Explore state owner. The staging screenshot also displays Day trips/Outdoors, whereas the accepted current branch uses For you/Must-see/Food/Tours; this is evidence of an older staging Explore build, not a reason to redesign Explore here. |
| Destination imagery | `personal-route.ts` returns no normal stop image when there is no day. `overviewStopImage` can use a reviewed destination photo without a day, but its local media fallback is also gated by finding a day. | **Confirmed eligibility gap for some existing photo paths.** A dated day can enter those normal paths; a placeholder remains correct when no approved image exists. The staging image alone cannot prove photo coverage for all six resolved places. |
| Stay, Map, repository/recovery | Stay reads stop identity/date/coordinates and worked for Manila. Map receives canonical stops and five legs. The same `EasyTTrip` is saved through normal local and account ownership. | No separate representation is needed. The acceptance risk is that any hydration/repair must preserve occurrence IDs, route endpoints, save acknowledgement and reload semantics. |

## Proposed narrow design

### 1. Hydrate canonical days at confirmation

Add a **pure, deterministic** imported-day projection in the spreadsheet-to-trip conversion path. Consume only the reviewed stop occurrence IDs/order, normalized ISO arrival/departure dates and the confirmed trip span. Produce one canonical `PlanItem` of type `open` for each calendar date, with a stable ID derived from the trip ID and day number, the exact date/day number, the correct occurrence ID and empty editable activity notes. Use neutral day wording; no place visits, activity suggestion, schedule, booking, photo or generated prose may be invented. Coordinates may come from the selected canonical stop, as normal trip context, but never from guessed geography.

Map explicitly reviewed activity rows onto their matching dated day using the **source stop occurrence ID and date**; retain each activity title as an editable activity row rather than creating a second day row for the same date. The current `PlanItem.notes` array is itself treated as editable activity rows, so activity comments must remain comment/context text through the existing day-note channel when no per-activity comment field exists; they must not become additional activities. Keep independent explicit notes in their existing `brief.dayNotes` owner and bookings in `brief.bookings`. Do not reinterpret a note or transport string as an activity. Preserve activity order and avoid duplicate activity content. Existing ordinary Builder day generation and non-import trips remain unchanged.

Before allowing confirmation, validate that reviewed stop intervals form an unambiguous contiguous allocation for the asserted trip span. Gaps, overlaps, zero/negative nights and an activity on a shared departure/arrival date assigned to the **outgoing** occurrence require review rather than silent rebinding to the incoming occurrence. A less structured sheet with recognizable dates/nights should still pass once those facts are reliable; no exact Philippines header/template is required. This is a stop/date integrity check, not AI interpretation.

The resulting 21 open days make both day-by-day and Calendar navigable. Existing day edit, saved-idea and transfer composition remain the owners of subsequent planning. Audit `deriveItineraryCoverage` and readiness wording: its present `days planned` count means represented calendar rows. A structurally filled but activity-empty import must not be described as 21 activities planned or fully arranged. Keep the distinction between dated coverage and substantive plans in any touched presentation.

### 2. Use canonical route identity for labels

Share a small **read-only route-label projection** with TripShell's server/client presentation, based on the existing `canonicalRouteEndpoints`/`sameJourneyPlace` semantics. Suppress only an adjacent origin endpoint that is the same canonical place as the first overnight stop. Keep `brief.origin` and the first stop intact in the saved trip. Do not collapse the final Manila: it is separated by other occurrences and has its own ID. Do not deduplicate equal names if canonical identity/location differs. Check desktop/mobile shell, fallback-image accessible label and any My Trips/Overview summary that shows the same path; no route-map or leg rewrite is needed.

### 3. Keep imported transport truthful

The imported stop sequence establishes **five transfers**, not five booked journeys. Continue constructing `TripLeg` with the existing canonical route owner so stop IDs, dates and map lines remain correct. For import legs with **no reviewed transport booking or confirmed traveller choice**, do not present the generic distance-based mode or duration as a supported journey. Persist the existing leg shape with mode `unknown`, null duration/impact fields, unknown confidence and an explicit needs-confirmation state; mark its route metadata so the existing road-fallback resolver cannot silently promote it back to road. This conservative rule follows the import trust boundary for every unsupported transfer, without requiring a new island taxonomy or claiming ferry/flight schedules. It leaves explicit, validated booked modes to the existing booking/leg path. A booking confirmation does not itself confirm a duration.

When matching a reviewed booking to a leg, use adjacent occurrence endpoints **and transport date**; normalized place names alone are insufficient when a destination repeats. If the mapping is ambiguous or not adjacent, keep the booking for review without applying high-confidence mode to multiple legs. Preserve explicitly authored booking data and any later user-confirmed route edit.

Inspect the actual worksheet's headers and transport cells against the current aliases: `Transport`/`Transport mode`/`Mode`/`Travel mode`, `From`, `To`, `Transport date` and `Booking reference` are recognized; a generic `Route` or `Journey` column is not. A row lacking from/to/date/reference deliberately produces **zero booked transport**. Clarify that fact in import review if the mapped text was detected; do not silently call it a booking. Supporting general free-text, unbooked transport intent is a separate import-scope decision unless the supplied sheet proves a safe mapping into existing reviewed notes. No geography-derived ferry, flight, road route or timetable is proposed.

### 4. Let existing downstream owners consume the hydrated trip

The imported `TripStop` already carries canonical place ID, provider ID and coordinates after required geocoding. Preserve those fields and distinct occurrence IDs through recovery/account save and reload. The new day rows make the current Explore destination projection eligible; `providerRequestBody` can then use the same canonical stop context as hand-built/Builder-generated trips. Do not add an import-specific Explore provider, taxonomy, cache or retry model. Use the already accepted Explore empty/partial/failure behavior to report what the provider actually returns. No successful results are promised.

Allow Overview, personal route, shared shell and Itinerary image projections to use their existing approved destination photo paths once the canonical days exist. Remove a **day-existence gate only where it blocks an otherwise approved image candidate**; keep source/credit rules and normal placeholder behavior. Do not persist provider photos as user-authored itinerary content and do not build an import image service. Map remains the existing route projection of the same six stops and five transfers; unknown transport is rendered as unknown, not as a road journey.

### 5. Existing saved imports and write ownership

Newly confirmed imports persist the hydrated `EasyTTrip` through the current one-ID recovery/account flow. For previously saved `spreadsheet-v1` trips such as the staging case, specify a **guarded, idempotent repair** of missing structural days and unconfirmed import-estimate legs under the existing repository/recovery mutation ownership. The repair must keep the same trip ID, owner, stop IDs, booking IDs, user edits and updated revision discipline; it must never replay the spreadsheet or create another trip. Only derive a missing day when its date/occurrence binding is unambiguous. Never overwrite an authored day, scheduled idea, confirmed leg or booking. Reopening and repeated repair must produce the same document; a stale repair must not overwrite a newer account/recovery version.

This compatibility repair may be automatic only for cases with provably empty or missing structural rows and no conflicting authored state. A partially populated legacy import with ambiguous activities or edited days needs explicit review/migration, not a broad read-time rewrite. A read-only view may project the missing structure while save is pending, but durable changes must use the canonical mutation and acknowledgement path. The implementation plan must identify the exact safe entry point and conflict tests before coding this repair.

## Ownership and likely files

| Concern | Existing owner; likely files |
| --- | --- |
| Parse, aliases, stop/date integrity, import review | `lib/easyt/spreadsheet-import.ts`, `app/journey/new/import/spreadsheet-import-client.tsx`, import review presentation only if mapping/status wording changes |
| Canonical trip/day construction | `lib/easyt/spreadsheet-import.ts` composing `lib/easyt/trip.ts` `PlanItem`/`TripStop`; reuse ISO date helpers and day composition, no new trip type |
| Route and transport | `lib/easyt/trip-legs.ts`, `lib/easyt/road-transfer-resolution.ts` / `lib/easyt/transport-leg-compatibility.ts` only if needed for safe import leg provenance, existing Transport agenda/workspace as consumer |
| Route presentation | `components/easyt/trip-shell.tsx`, `components/easyt/trip-shell-client.tsx`, shared canonical endpoint projection; inspect `personal-route.ts` and My Trips summary consumers |
| Explore, stay, map, imagery | `lib/easyt/explore.ts`, `components/easyt/trip-explore-workspace.tsx`, `lib/easyt/trip-overview-imagery.ts`, `lib/easyt/personal-route.ts` primarily as consumer/projection checks; no new provider owner |
| Persistence/legacy repair | `lib/easyt/storage.ts`, `lib/easyt/repository.ts` and existing trip mutation/recovery path, with account/owner revision checks; only a narrowly gated `spreadsheet-v1` compatibility projection if required |
| Tests and visual reference | `tests/fixtures/spreadsheet-import.ts`, `tests/spreadsheet-import.test.ts`, Itinerary/Explore/transport/TripShell/recovery owner suites; closest existing workspace Storybook stories if presentation changes |

Reuse current TripShell, Itinerary, Explore, Stay, Transport and Map components, their shared controls and design tokens. No new card, day view, provider, storage owner or import-specific UI system is proposed. Any necessary review/status copy should use the established import and uncertainty patterns in `docs/design-system.md`.

## Test matrix

| Level | Proof required |
| --- | --- |
| Philippines parser fixture | Six source occurrence IDs in exact order; 20 nights; 11–31 Dec; 21 inclusive dates; repeated Manila retained; same-date duplicate source rows merged only under the current exact-stop rule; 0 booked journeys unless full booking facts exist. Fixture records the **known** review data; do not pretend it reproduces unavailable original transport headers. |
| Day hydration | Exactly one row per date/day number, days 1–21; 11–12 Dec first Manila, 13–17 El Nido, 18–21 Bohol, 22–26 Siquijor, 27–29 Cebu City, 30–31 final Manila; 20 overnight bands; empty activities/notes when none supplied; Calendar and Itinerary open dated days rather than the no-days state. |
| Explicit content | A fixture with dated activities/notes retains each authored item once in the correct day and stop occurrence. Departure-boundary activity ambiguity and stop gaps/overlaps fail review safely. No invented activity, accommodation or booking. |
| Origin and route | Origin and first overnight place remain distinct in state; one initial Manila in shared label and five canonical legs; final Manila displayed as occurrence 6; map route/stop selection and Overview/TripShell/Trips labels agree at desktop and mobile. Equal text with different canonical place remains distinct. |
| Transport | Five unbooked transfer states remain unknown/needs confirmation with no supported duration; El Nido→Bohol and Siquijor→Cebu City never display confident road/time. Explicit supported booking is attached to exactly one adjacent dated leg. A repeat-name or date mismatch cannot attach twice. Existing confirmed route edits survive compatibility repair. |
| Identity and consumers | Every stop retains its source occurrence ID, canonical ID, provider ID and coordinates through save/reload/recovery. Stay remains functional. Explore destination options include all six occurrences and send the normal canonical request for the selected stop; mocked success, genuine empty, partial failure and provider failure remain distinct. Existing approved imagery appears only when a candidate exists and carries required credit; otherwise placeholder. No mixed Google/MapLibre provider content introduced. |
| Persistence and compatibility | Import review alone writes nothing; double Create trip does not make two IDs/saves; failed account acknowledgement leaves one recoverable trip. New and guarded legacy hydration are deterministic/idempotent, owner-scoped and conflict safe across reload and account switch. A legacy import with authored/ambiguous days is not overwritten. |
| Less-structured spreadsheet | Reuse `messySpreadsheetCsv` or pasted-tab fixture with varied header casing, blanks and an ignored column; after review it produces contiguous dated empty days and normal downstream eligibility without a Philippines-specific template. Unsupported transport/freeform data stays visible as not imported rather than being guessed. |
| Browser/accessibility | Actual import review→creation→Overview/Itinerary/Stay/Transport/Explore/Map at 390/430 and desktop; keyboard selection and day navigation; appropriate EN/ES where already wired; no layout/touch-target regression. |

## Boundaries and deferred work

In this ticket: reviewed stop/date integrity, canonical dated day hydration, adjacent origin display, truthful import transfer state, normal Explore/image eligibility, guarded repair of the observed empty legacy import, and focused downstream/recovery tests.

Later enrichment: activities, transport route options/schedules, hotel bookings, provider result coverage, more destination photos, arbitrary route/journey prose extraction, cross-sheet parsing and broad migration of partially authored legacy imports. Missing provider data must remain an honest empty/unavailable state. This spec does not authorize the Explore redesign, Google Maps work, new persistence, schema migration or staging writes.

## Unresolved evidence and implementation-plan gates

1. **Original spreadsheet:** obtain an anonymized header row plus the transport cells and import mapping review from the staging case. The screenshot proves 0 journeys, not whether route text was mapped, lacked booking fields, or sat in an unsupported column. Do not claim a specific worksheet defect without that evidence.
2. **Legacy repair entry point:** identify the existing canonical owner that can acknowledge an idempotent `spreadsheet-v1` repair without overwriting newer recovery/account revisions. If no safe owner exists, implement creation-time hydration first and keep the existing staging trip as an explicit repair case rather than writing from a read-only component.
3. **Partially populated old imports:** confirm whether any live `spreadsheet-v1` trips have authored/scheduled day rows. Automatic normalization must not reinterpret or discard them; decide a reviewed migration separately if found.
4. **Transport booking matching:** verify whether any existing booked rows rely on name-only matching with repeated endpoint names. Date/adjacency must disambiguate before applying a mode to a leg.
5. **Provider/photo availability:** once a hydrated fixture issues normal Explore/photo requests, record actual result/empty/failure and approved media coverage separately. Neither a valid canonical ID nor the Stay result guarantees Explore ideas or a destination photograph.

The implementation plan should establish these gates in test-first order. This document is the design review artifact, not approval to edit product code.

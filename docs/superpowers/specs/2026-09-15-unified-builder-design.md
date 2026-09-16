# Unified Trip Builder Design

**Date:** 2026-09-15
**Status:** Approved interaction baseline; implementation planning follows written-spec review
**Scope:** `app/journey/new/` Builder presentation and interaction composition

## Summary

Morrovia will replace the Builder's two visible stages with one unified route-building workspace. `TripBuilderDocument` remains the sole owner of the trip being built. The new UI is a controlled composition of its existing state, validation, derivation, recovery, persistence and build paths—not a second Builder or a new orchestration layer.

The unified screen keeps the trip details editable, shows a map projection of the ordered route, and presents the ordered stop occurrences as the primary mutation surface. Dragging and Route Check both converge on one validated stop-order operation. Route changes are previewed transiently and committed exactly once only after a valid drop or explicit Apply action.

Direct New Trip retains its current natural-language Trip Capture while no useful canonical route exists. The unified route workspace appears only after capture has produced a useful canonical route skeleton; Morrovia must not show an empty route table or map as the initial state.

## Goals

- Make the Builder feel like one coherent route-editing task instead of two application states.
- Keep the trip's order, nights and material transfer consequences understandable without turning each row into an information dump.
- Keep the map synchronized with route rows while preserving the rows as the only route-editing surface.
- Preserve repeated-stop identity throughout selection, preview, reordering, validation and persistence.
- Keep existing Builder validation, recovery, CAS, persistence and build ownership unchanged.
- Preserve old Builder links without retaining `step` as workflow state.
- Provide a usable, accessible route-reorder interaction across pointer, touch and keyboard input without adding parallel visible controls.

## Non-goals

- Replacing `TripBuilderDocument` as the state owner.
- Redesigning homepage natural-language trip capture.
- Creating section-level saves, dirty states or recovery records.
- Changing planner, route-scoring, night-allocation, transfer-impact, persistence, recovery or CAS semantics.
- Making the Builder map an independent editor.
- Reworking downstream Overview, Map, Itinerary, Explore, Stay or Transport workspaces.
- Broadly refactoring the Builder beyond boundaries needed for this composition.

## Design principles

1. **One presentation, one canonical state owner.** Presentational children receive controlled data and callbacks from `TripBuilderDocument`.
2. **Occurrence identity is first-class.** A route such as Tokyo → Kyoto → Tokyo contains three distinct stop occurrences identified by stable stop IDs. Names never substitute for identity.
3. **Preview is not persistence.** Drag and recommendation previews may derive temporary presentation, but they cannot update recovery, cloud state, save status or build readiness.
4. **One mutation contract.** Drag/drop and Route Check apply the same validated stop-ID permutation through the same canonical Builder mutation.
5. **Map is a projection.** It renders the current or transiently previewed ordered stops and derived legs. It can select and focus rows; it cannot reorder or save the route.
6. **Consequences, not clutter.** Destination and nights lead each row. Transfer and usable-time detail appears when it materially affects the trip or requires confirmation.
7. **Atomic structured editing.** A temporary trip-details draft either commits through the existing Builder mutation path as one valid update or leaves the canonical Builder document unchanged.

## Information architecture

The unified Builder document is ordered as follows:

1. Builder identity and canonical save/recovery status.
2. Compact trip summary with an **Edit trip** disclosure.
3. Persistent status, warning or recovery feedback when required.
4. Route heading and route-level actions, including **Add stop** and **Route check**.
5. Route workspace:
   - desktop: route rows beside a sticky route map;
   - mobile: map-first block above the same route rows, with a Collapse map control.
6. More trip details disclosure.
7. Existing build validation summary and primary **Build my trip** action.

The map and rows are two views of the same ordered occurrences. They do not create separate tabs or stages.

## Responsive composition

### Desktop

The route editor occupies the larger left column. The map occupies a narrower, sticky right column and remains visible while editing longer routes. Status and recovery feedback occupy a full-width row above both columns so they never compress or obscure route content.

Each route row uses this hierarchy:

`drag handle · route ordinal · destination · dates/nights · material transfer warning or summary · actions`

Nights remain directly editable through the existing canonical allocation controls. Usable-time detail is shown when a long or unknown transfer materially changes the stay, not as an equally weighted column on every healthy row.

### Mobile

The compact trip summary appears first, followed by the route heading and the map. The map may collapse but is initially visible. Route rows follow it and use the same occurrence numbers as map markers.

The grip is the primary visible reorder control. It supports touch drag directly without adding permanent move buttons. The implementation must reserve touch gesture ownership only on the grip so ordinary vertical scrolling still works elsewhere in the row.

Touch, keyboard and assistive users also retain an explicit fallback through the existing row actions/menu. A **Move stop** action exposes safe earlier/later or position choices through the same reorder validation and commit boundary. This fallback is available without becoming another permanently visible control.

### Map failure

If MapLibre or a map resource fails, the map panel shows a contained fallback with route text and a retry where appropriate. Route rows, Route Check evidence, validation, save/recovery status and Build remain fully usable.

## Trip summary and structured editing

### Direct New Trip empty state

When Direct New Trip has no useful canonical route skeleton, the Builder keeps the current natural-language Trip Capture as the focused empty state. Capture may resolve places, request clarification and construct the first canonical route skeleton through the existing capture path.

Once that useful route skeleton exists, intake collapses into the compact trip summary and unified route workspace. The empty capture and populated route workspace are states of the same `TripBuilderDocument`; they are not wizard steps. An empty route table, empty map or placeholder route workspace must not appear before the route skeleton exists.

### Populated trip summary

After homepage handoff, direct capture or direct structured entry has produced a useful route skeleton, the Builder shows a compact summary containing:

- ordered destination names;
- origin;
- journey end, including **Same as start**;
- dates;
- travellers;
- important pace or transport preferences.

Selecting **Edit trip** expands the existing structured controls in place. It does not restore a first step and does not show the homepage's free-form “Describe your trip” prompt.

The expanded editor contains:

- **Where do you want to go?** occurrence rows;
- **Add stop**;
- origin;
- `JourneyEndSelection`, including **Same as start**;
- start and end dates;
- travellers;
- **More trip details** for budget, fixed plans, pace, transport preferences and other existing canonical inputs.

The visible route remains underneath while editing. Cancel discards only the temporary form draft.

Origin and journey end are endpoint context, not overnight route occurrences. They inform arrival/departure legs and validation but do not automatically become night-bearing rows. They appear as route rows only when the traveller has separately selected that place as a canonical overnight stop occurrence. This distinction must remain occurrence-safe for cases where the final overnight stop and explicit journey end share a place name.

### Atomic commit contract

All asynchronous place resolution and validation happens against the temporary draft before canonical mutation begins. The commit function constructs and validates the complete next `TripBuilderDocument` using existing Builder helpers and mutation semantics, verifies that the canonical source snapshot has not changed while the draft was being resolved, and commits the result through the existing canonical Builder mutation boundary as one logical mutation.

There must be no asynchronous failure point after canonical commit begins. If resolution, validation, invariant checks or source-snapshot comparison fails, the mutation boundary is not invoked and the canonical Builder document remains unchanged. Whether the existing owner internally uses one reducer or multiple React setters is an implementation detail; React batching is not the atomicity guarantee. Existing persistence effects must observe only the complete committed document, never an intermediate draft.

Consequential edits that would remove occurrences, invalidate fixed plans or substantially reshape the route require an explicit consequence review before the atomic commit.

The draft never writes recovery, cloud state, save status, analytics mutation events or build readiness directly.

## Legacy `step` compatibility

`step` is removed as a render or workflow-state variable.

On initial hydration only:

- `?step=0` focuses or scrolls to the trip-summary/editing section;
- `?step=1` and historical higher accepted values focus or scroll to the route timing and nights section;
- invalid values are ignored.

After the one-time focus has been scheduled, `history.replaceState` removes only the `step` query parameter while preserving `trip`, `recover`, `view` and all other valid parameters. A subsequent interaction cannot recreate step state. Direct links remain backward-compatible, but the Builder has one canonical URL after load.

## Component boundaries and reuse

`TripBuilderDocument` remains the orchestration and canonical state owner. Large visual sections may be extracted as controlled presentational components, but none may own canonical trip state or persistence:

- `BuilderTripSummary` — compact summary and temporary structured editor shell;
- `BuilderRouteWorkspace` — responsive route/map composition;
- `BuilderRouteRow` — one occurrence, nights control, material route consequence and drag grip;
- `BuilderRouteMap` — adapter from Builder stops/legs/selection to `JourneyPlannerMap`;
- `BuilderRouteCheckProposal` — current/proposed comparison and explicit Apply/Keep actions.

Names are illustrative rather than mandatory file boundaries. Extraction should follow readability and Storybook needs, not introduce a new framework.

Reuse the existing Morrovia system:

- `EasyTButton`, `EasyTField`, `EasyTSelect`, `MorroviaDatePicker` and `MorroviaQuantitySelector`;
- `MorroviaStatusBanner`, `MorroviaSaveStatus` and existing recovery feedback;
- `MorroviaTripCapture` for the Direct New Trip no-route state only;
- `JourneyEndpointsEditor` and its canonical `JourneyEndSelection`, including **Same as start**;
- `JourneyPlannerMap` and the canonical Morrovia map presentation;
- current Builder clarification, place search, night allocation and trip-detail controls;
- existing Builder tokens and responsive breakpoints from `journey-design.css` and `trip-builder.module.css`.

No new generic card, field, map or status primitive is required.

## Selection and map synchronization

The Builder owns one ephemeral `selectedStopId: string | null`, always containing a stable stop-occurrence ID.

- Clicking or focusing a route row selects that occurrence and highlights its map marker.
- Selecting a map marker selects the same occurrence and scrolls/focuses its route row.
- Repeated destination names remain distinct because all lookup, refs and callbacks use `stop.id`.
- Visible `1, 2, 3…` labels are ordinals derived from the currently presented order. They may renumber after a committed reorder; they are never used as identity.
- During a drag preview, the selected occurrence remains selected by stable ID even if its preview ordinal changes.

The normal interactive `JourneyPlannerMap` remains the rendering owner. The Builder adapter supplies only route stops, derived legs, current selection and selection callbacks. The map receives no route-mutation callback.

## Unified reorder contract

A pure helper owns stop-order validation and materialization. It accepts:

- current ordered stop occurrences;
- proposed ordered stop IDs;
- schedule locks and fixed-order constraints.

It succeeds only when:

- the proposal length equals the current occurrence count;
- every current occurrence ID appears exactly once;
- no unknown or duplicate ID exists;
- locked/fixed constraints remain satisfied;
- the proposal represents a real order change.

The helper returns either a complete reordered occurrence array or a typed rejection. It does not mutate state.

### Drag lifecycle

1. Drag start records the source occurrence ID and current canonical-order fingerprint.
2. Pointer or touch movement computes an insertion position and a transient proposed ID order.
3. The route list and map render from that transient order. Preview legs are derived in memory from the same canonical leg-building functions; recovery and persistence remain untouched.
4. Drop revalidates the proposal against the latest canonical occurrence IDs and locks.
5. A valid drop invokes the canonical commit function once using a functional state update.
6. An invalid, cancelled or stale drop clears preview state and restores the canonical projection with zero persistence side effects.

The grip also supports keyboard reordering without additional visible controls: focus the grip, enter grabbed mode, move the transient insertion point with arrow keys, commit with Enter/Space, and cancel with Escape. Announcements identify the occurrence by destination plus dates or current ordinal so repeated stops are unambiguous.

## Route Check contract

Route Check remains advisory. It produces:

- a proposed stop-occurrence ID permutation;
- material evidence such as reduced backtracking, transfer-time improvement or protected usable time;
- no canonical mutation.

While the proposal is open:

- route rows remain in the current canonical order;
- the map may overlay the proposed route as a visually distinct comparison;
- map markers retain current canonical ordinals until Apply; the comparison card names the proposed sequence with occurrence context rather than temporarily renumbering canonical markers;
- current and proposed sequences disambiguate repeated stops with dates or other occurrence context;
- **Keep my order** closes the proposal without state changes;
- **Apply order** passes the proposal to the same reorder validation and commit function used by drag/drop.

If no material improvement exists, Route Check reports that the current order already works and offers no apply action. It never silently replaces a deliberate order.

## Derivations and canonical authority

The presented route is derived from:

- ordered canonical stops, or the transient preview order while actively dragging;
- `buildCanonicalTripLegs` and current route-intelligence inputs;
- current night allocation;
- existing transfer-impact and usable-time calculations.

After a successful canonical reorder or trip-detail commit, these existing derivations recompute normally. The unified UI must not persist derived rows, marker ordinals, preview legs or usable-time display values.

`buildInvariant` remains the sole readiness authority. Existing recovery, browser storage, cloud CAS and generated-trip persistence paths remain unchanged. There is one Builder-level save state and no section-level save button or status.

## Failure and concurrency handling

- **Invalid drag proposal:** clear preview; retain canonical order; no save or analytics mutation event.
- **Canonical order changes during drag:** fingerprint mismatch rejects the drop as stale and returns to the newest canonical order.
- **Locked/fixed occurrence:** drag cannot begin or the commit rejects without mutation.
- **Route Check becomes stale:** Apply revalidates against current occurrences and locks; stale proposals do not commit.
- **Trip-detail resolution or validation failure:** retain the draft for correction, surface the existing focused error treatment, and leave canonical state unchanged.
- **Map loading/resource failure:** contain it within the map panel; keep the route editor and Build available.
- **Persistence/CAS/recovery issue after a valid canonical change:** use the existing Builder recovery and save-state behavior. The presentation adds no fallback persistence path.

## Accessibility

- Drag grips are focusable controls with descriptive accessible names that include occurrence context.
- Keyboard grabbed mode announces the source, proposed position, successful commit and cancellation.
- The row actions/menu exposes an explicit **Move stop** fallback that uses the same canonical reorder boundary as drag.
- Map-marker selection moves focus only when explicitly activated; passive map updates do not steal focus.
- Route Check comparison is labelled as a proposal and its Apply consequence is explicit.
- Expanded trip editing manages disclosure state without replacing the page or losing the initiating focus target.
- Warnings use existing semantic feedback components and do not rely on colour alone.
- Mobile touch targets retain the established 44-pixel minimum where the existing component contract requires it.

## Analytics

Preserve existing privacy-safe events and consent checks. A successful recommended-order Apply continues to emit the existing `route_accepted` semantics. Drag reordering continues to use the existing structural-change accounting. Preview, cancelled drag, rejected drop, opening/closing trip editing and dismissed Route Check proposals must not emit successful mutation events.

## Testing strategy

### Pure behavior

- valid ID permutation returns the intended occurrence order;
- missing, duplicate, unknown and stale IDs reject;
- repeated names with distinct IDs remain distinct;
- locks and fixed commitments reject illegal moves;
- drag and Route Check call the same validation/commit boundary;
- preview leg derivation has no persistence side effects.

### Builder integration

- no `step` variable controls rendering after migration;
- legacy `?step=` focuses the correct section once and is removed without dropping other parameters;
- Direct New Trip retains natural-language capture until a useful canonical route skeleton exists, then collapses into the unified workspace;
- homepage handoff and direct Builder entry converge on the same unified state;
- `JourneyEndSelection`, including **Same as start**, remains editable endpoint context without automatically creating a night-bearing row;
- structured trip-detail commit is atomic, including asynchronous resolution failure and source-snapshot mismatch;
- Cancel leaves canonical state unchanged;
- drag preview changes list/map presentation only;
- valid drop commits once; invalid/cancelled drop commits zero times;
- Route Check does not mutate before Apply and uses the same commit on Apply;
- repeated Tokyo → Kyoto → Tokyo selection and reordering remain occurrence-safe;
- explicit journey end sharing a name with a final overnight stop does not collapse endpoint and stop-occurrence identity;
- arrival and departure legs remain complete when **Same as start** or an explicit endpoint such as Busan is selected;
- row/marker selection synchronizes by ID;
- map failure leaves route editing and Build usable;
- existing `buildInvariant`, save status, recovery and CAS behavior remains unchanged.

### Visual and responsive coverage

Add representative Storybook coverage for:

- fresh direct entry;
- Direct New Trip natural-language empty capture before route creation;
- homepage handoff with compact summary;
- desktop route/map workspace;
- exact 390-pixel map-first composition;
- repeated stops;
- drag preview and insertion target;
- Route Check proposal;
- trip editing expanded;
- map failure fallback;
- blocking validation and recovery feedback.

Validate at 320, 390, 430, 768, 1024 and 1440 pixels, with exact rendered checks at 390 and desktop. Regenerate the Storybook visual inventory and run the repository's strict UI audit and convergence checks.

### Regression gates

Run focused Builder, route-intelligence, route-candidate, transfer-impact, night-allocation, state-preservation, persistence/CAS and clarification tests, followed by typecheck, production `build:check`, Storybook production build, strict `audit:ui`, UI convergence, `git diff --check` and the release gate.

## Acceptance criteria

- Builder presents one unified route-editing workspace with no visible or hidden step-controlled render states.
- Old step URLs focus the relevant unified section once and canonicalize the URL.
- Desktop and mobile match the approved route/map compositions.
- The free-form homepage prompt does not appear inside Builder editing.
- Direct New Trip shows the existing natural-language capture only until a useful canonical route skeleton exists; it never shows an empty route table or map first.
- Journey End and **Same as start** remain first-class structured controls, while origin/end remain endpoint context rather than automatic night-bearing rows.
- Repeated stops remain distinct across rows, map markers, drag, Route Check and persistence.
- Drag is insertion-based, previews list and map together, and commits exactly once only after validation.
- The grip remains primary, with an explicit **Move stop** fallback in the existing row actions/menu for touch, keyboard and assistive use.
- Route Check is advisory until explicit Apply and shares the drag reorder boundary.
- Trip-detail draft commit is atomic: complete canonical success or no canonical change.
- Map failure cannot block route editing or building.
- Existing invariant, persistence, recovery and CAS tests remain green.
- No downstream workspace behavior changes outside the Builder handoff produced by the existing build path.

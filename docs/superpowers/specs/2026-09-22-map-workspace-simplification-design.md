# Map Workspace Simplification Design

**Issue:** #312 · P1 Map workspace simplification — immersive full-screen + single left rail

**Date:** 2026-09-22

## Purpose

Make the Map tab a focused planning workspace in which the map is the dominant surface. Travellers should be able to understand the route, move around the map, switch between planning modes, inspect results, and return to route context without competing permanent panels.

This change reorganises the existing Map presentation. It does not replace the canonical trip document, map provider, MapLibre owner, selection model, persistence flow, or mobile product.

## Product outcome

The Map tab should answer one primary question at a time while keeping geographic context visible:

- Where am I in this trip?
- What am I planning for this destination or day?
- Which mapped result, saved place, pin, or transfer am I inspecting?

The map remains easy to pan, zoom, and read throughout those tasks. Planning controls live in one stable place instead of surrounding the canvas with left and right application rails.

## Approved interpretation of immersive

“Full-bleed” and “immersive” mean viewport-dominant within the existing Morrovia trip workspace.

- Preserve global Morrovia navigation and the existing Trip workspace navigation.
- Let the normal Map tab use the available viewport width and height as its working surface.
- Do not create or preserve a separate browser-style fullscreen product mode.
- Remove the need for the current separate **Fullscreen map** presentation and control.
- Keep the Map workspace embedded in the normal trip route, focus order, and navigation model.

## Existing owners to retain

The implementation must reuse the current production owners:

- `TripMapWorkspace` remains the TripShell adapter and canonical mutation bridge.
- `JourneyMapPlannerWorkspace` remains the Map interaction and presentation-state owner.
- `JourneyPlannerMap` remains the only MapLibre map and camera owner.
- `JourneyPlannerStrip` and `JourneyRouteStopTrack` remain the route/location navigation owner.
- `finderDock` remains the Plan / Stay / Eat / See, filter, and result owner.
- `mapContextualSurface` remains the single mobile bottom-sheet owner.
- Existing result, pin, transfer, trip-health, save/recovery, and co-pilot state remain in their current owners.

## Desktop composition

### Viewport-dominant workspace

The normal Trip Map presentation becomes full-bleed relative to the Trip workspace and consumes the useful viewport height. The map canvas fills all space not occupied by the integrated route strip and the persistent left rail.

The workspace must not depend on a separate expansion state to become useful. Existing expansion-only layout rules and the Map-strip fullscreen action may be removed when their remaining consumers have been accounted for.

### Route and location context

`JourneyPlannerStrip` remains fixed at the top of the Map workspace. It owns:

- ordered trip stops;
- active stop state;
- whole-route reset and fit;
- adding a stop;
- existing overflow trip actions.

Selecting a stop or the whole route continues to use the current canonical selection and camera callbacks. The strip must remain horizontally usable when routes contain more stops than fit in the available width.

### Single persistent left rail

`finderDock` becomes the only persistent desktop rail. Its target width is between 360px and 420px, responsive within that range.

The rail owns:

- the current destination/day context;
- Plan / Stay / Eat / See tabs;
- contextual filters;
- loading, empty, partial-provider, and error states;
- result lists and their existing save/add actions;
- the current Plan agenda and its existing navigation actions.

The rail scrolls internally when its content exceeds the available height. The page and map canvas must not become horizontally scrollable because of the rail.

### Removal of the permanent right rail

The current always-visible `canonicalPlannerStatus` desktop rail is removed from the default composition.

- Whole-route summary does not create a second permanent panel.
- Ordinary destination selection does not create a second permanent panel.
- Healthy/default trip status does not create a second permanent panel.
- Map controls return to the open canvas area and must not retain offsets reserved for a right rail.

### Contextual selected detail

Selected-result detail is optional and contextual.

- Prefer the existing left rail when it communicates the selected state clearly.
- A compact floating detail card may be used when proximity to the selected marker materially improves spatial understanding.
- A floating card must be dismissible and restore predictable focus to the originating marker or result control.
- It must not become a permanent second rail.
- It must not obscure the selected marker, zoom controls, whole-route control, attribution, or another active map action.
- Place, saved-pin, and transfer details must continue to reflect the same canonical selection used by the list and marker.

Only one detail owner may be visually dominant at a time. Opening result detail, transfer detail, trip status, pin composition, or co-pilot must not leave another competing contextual panel active.

### Trip status and warnings

Trip status remains contextual rather than persistent.

- Do not create another always-visible status panel.
- Surface a warning when it affects the current destination, result, transfer, or requested traveller action.
- Preserve access to actionable trip-health detail from the planning context.
- Healthy/default state remains visually quiet.
- Save, recovery, and conflict feedback keep their existing truthful priority and must remain visible when action is required.

### Map-only controls

Keep existing controls on the map canvas or integrated route strip:

- MapLibre zoom controls;
- whole-route/fit action;
- search-this-area only where the current owner already supports it;
- layers only where the current owner already supports them.

Do not add speculative layers or search-area controls. Controls must remain reachable and must not overlap the left rail, contextual detail, selected marker, or provider attribution.

## Mobile and tablet composition

Mobile uses the same information architecture, not a separate product:

1. Map canvas.
2. One `mapContextualSurface` bottom sheet.

The existing sheet states remain:

- **Peek:** compact orientation and current-context summary while preserving most of the map.
- **Medium:** normal Plan / Stay / Eat / See work and result browsing.
- **Expanded:** long results, detailed planning, or action-required status.

The sheet continues to switch between planner, context, status, and pin content so only one owner is visible at a time. Selected detail replaces or refines the current sheet content rather than opening another overlay. Closing detail returns to the prior results/planning context without losing the selected destination or provider result set.

Short phones, landscape phones, tablets, and safe-area insets must retain a recoverable portion of the map and reachable sheet controls.

## State and interaction contract

The redesign is presentation-only and must preserve these invariants:

- `shapeDayTab` remains the Plan / Stay / Eat / See state owner.
- `selectedMapResult` remains the canonical result selection shared by list, marker, detail, and camera.
- `selectedPlannerPin` and `selectedRouteLegId` retain their current independent selection contracts.
- `mapMode`, `mapDetailScope`, and `resetWholeRoute` retain camera intent.
- Changing tabs, sheet size, rail content, or contextual detail does not reload the MapLibre style.
- Result selection does not unmount the active finder or restart its provider request.
- Closing contextual detail restores focus through the existing marker/list focus contract.
- Existing account persistence, device recovery, canonical mutation, and analytics behavior remain unchanged.

## Map reliability boundary

The accepted #278, #279, and #319 behavior is a hard boundary for #312.

- Do not change `morroviaMapStyle`, the OpenFreeMap provider, bundled fallback geography, or basemap lifecycle.
- Do not add another MapLibre instance or camera owner.
- Preserve repeated overview/detail zoom transitions without blank basemap states.
- Preserve Stay / Eat / See result projection and exact list-marker-detail selection.
- Preserve homepage and public Route map behavior; #312 is limited to the authenticated Trip Map workspace.

## Accessibility and responsive behavior

- Keep the route strip, rail tabs, result rows, marker controls, sheet controls, and dismiss actions keyboard reachable.
- Preserve visible focus treatment and current ARIA relationships.
- A contextual card or sheet must have an explicit accessible name and dismiss action.
- Escape continues to clear the active contextual selection without destroying the finder state.
- Rail and sheet content scroll independently without trapping page or map gestures.
- Touch targets retain the established Morrovia mobile minimums.
- Reduced-motion behavior and camera interruption remain unchanged.

## Loading, empty, error, and recovery states

The single-rail/sheet composition must account for:

- initial trip hydration;
- missing or inaccessible trip;
- finder loading;
- useful results;
- valid empty results;
- partial provider failure;
- total provider unavailability;
- basemap fallback and retry;
- unsaved changes, cloud conflict, authentication interruption, and device recovery.

No state may silently replace the map with a blank surface. Action-required recovery feedback may temporarily take visual priority over ordinary contextual content.

## Design-system contract

- Reuse `JourneyPlannerStrip`, `PlanWorkspace`, `JourneyLocalFinder`, `JourneyItineraryRefinement`, `ItineraryItemDetail`, Morrovia controls, feedback, loading, and map presentation tokens.
- Do not introduce a parallel panel, tab, card, sheet, map-control, or navigation primitive.
- Prefer existing semantic tokens over new raw colours, radii, shadows, type roles, or breakpoints.
- Update the production Map Storybook family to represent the new desktop rail and existing mobile sheet at the protected viewport matrix.
- Record no new design-system exception unless the existing map-overlay exception mechanism is demonstrably insufficient.

## Testing and acceptance

Implementation follows test-first development. Presentation tests must fail against the current three-panel layout before production changes are made.

Automated acceptance must cover:

- normal Map presentation is viewport-dominant without requiring an expansion action;
- desktop has one persistent left rail between 360px and 420px and no permanent right rail;
- the route strip remains the route/location owner;
- Plan / Stay / Eat / See remain in the rail with their current state and result ownership;
- selected result, pin, and transfer context is dismissible and never establishes a permanent second rail;
- healthy status is quiet while actionable warning/recovery states remain reachable;
- mobile retains one bottom sheet with peek, medium, and expanded states;
- map controls and attribution remain reachable at desktop, tablet, phone, short-phone, and landscape widths;
- accepted basemap, camera, result projection, persistence, and public-map reliability tests remain green.

Required verification includes focused Map tests, responsive/Storybook coverage, typecheck, strict UI audit, Storybook build when shared stories change, and `git diff --check`. Browser verification is appropriate for #312 because the ticket explicitly changes the responsive spatial composition; it supplements rather than replaces automated coverage.

## Non-goals

- Provider or basemap replacement.
- MapLibre lifecycle or fallback redesign.
- New layers or search-this-area functionality.
- New trip data, persistence, or selection models.
- Changes to homepage, Discover, or public Route maps.
- A separate mobile Map product.
- A browser-style fullscreen mode.
- Redesign of Plan, Stay, Eat, See, TripShell, or global navigation beyond the composition required to make the Map tab viewport-dominant.

## Success criteria

#312 is complete when the normal Map tab is the immersive workspace, one persistent desktop left rail owns planning, the permanent right rail is gone, contextual detail and warnings appear only when useful, the mobile sheet remains the sole mobile context owner, and all accepted Map reliability behavior remains intact.

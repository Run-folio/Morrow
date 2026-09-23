# #333 Unified map behaviour, controls and visual system

**Status:** Accepted design direction, awaiting specification review  
**Date:** 2026-09-23  
**Accepted base:** `812604ebe162a9b81f36d90189ae99f73f6fc801`  
**Scope:** Map-system hardening and saved-trip Journey integration only

## Outcome

Morrovia will have one explicit behavioural and visual contract for every MapLibre surface while retaining the existing domain owners. Builder, authenticated trip workspaces, Discover and Route Detail will share setup, camera, padding, marker and control policies. Each owner will continue to translate its own data into that contract.

The saved-trip editorial Journey at `/journey/my-routes/[tripId]` is part of this system. It will become a first-class authenticated workspace destination and will use the same canonical map selection and camera rules as the rest of the product.

This is a hardening change, not a map rewrite. It preserves canonical route facts, trip state, Builder parity, analytics, public Route Detail hashes, publication boundaries, attribution and the accepted #328 Route Detail architecture.

## Traveller job and design principles

The map must help an independent traveller answer three questions without learning different interactions on different pages:

1. What is the shape of the whole journey?
2. Where is this stop in that journey?
3. What geography does this connection cover?

Every map decision follows these principles:

- The selected journey entity is the source of camera intent; component location does not redefine it.
- A route, stop and connection have visibly different focus states.
- The map preserves surrounding route context without letting unrelated geography dominate the selection.
- Controls exist only when they complete a job on that surface.
- Repeated visits to the same place remain distinct journey occurrences.
- Pointer, keyboard, deep-link and adjacent-UI selection converge on the same canonical state.
- Attribution is always present and remains owned by MapLibre.
- Missing coordinates or imagery degrade to factual, usable UI rather than placeholders or invented detail.

## Current-system audit

The accepted base contains three MapLibre setup owners and several consumers.

| Owner | Current consumers | Canonical role after #333 |
| --- | --- | --- |
| `components/journey-planner-map.tsx` | Builder; Overview; Dashboard; Map; Stay; Itinerary; Transport; legacy Plan Next; homepage demo | Authenticated-trip and planning map renderer. Keeps transport markers and authenticated trip identity semantics. Adopts the shared foundation and explicit variants. |
| `app/journey/discover/discovery-map.tsx` | Full Discover map; Discover route preview | Discover-specific clustering, route-card and collection behaviour. Adopts the shared foundation and canonical route/stop selection. |
| `app/journey/routes/[slug]/route-live-map.tsx` through `route-map-summary.tsx` | Published Route Detail and saved-trip personal Journey | Editorial journey map. Adopts the shared foundation, canonical entity selection and visible Journey navigator. |

Existing shared foundations remain authoritative and are extended rather than replaced:

- `components/easyt/morrovia-map-presentation.ts` for map style and route paint.
- `components/easyt/morrovia-map-presentation.module.css` for shared map presentation.
- `lib/easyt/map-camera.ts` for fit, focus, interruption and duration behaviour.
- `lib/easyt/map-spatial-context.ts` for canonical leg identifiers, modes and hit resolution.
- `lib/easyt/map-basemap-lifecycle.ts` for basemap lifecycle.
- `components/easyt/morrovia-transport-icons.ts` for transport semantics.
- `MorroviaMapLoading`, `EasyTButton`, `EasyTLinkButton`, `JourneyPlannerStrip` and existing feedback components for shared UI.

The audit found these divergences, which #333 owns:

- Map variants are currently implicit props rather than an explicit contract.
- Discover and Route Detail duplicate worker, style, camera and marker setup.
- Discover selection is partly index-based and selecting a stop does not reliably focus it.
- Route Detail selection is index-based internally even though route occurrences have stable identities.
- A selected leg is highlighted in Map and Transport but the camera retains whole-route geography.
- Discover route previews expose controls that are not useful in a preview.
- Some preview pins remain actionable without an explicit interaction policy.
- Plan Next carries page-local marker and control overrides.
- Camera padding is fixed or page-specific and does not consistently account for visible rails and overlays.
- Route Detail offers a native dropdown as its main map navigator and duplicates whole-route controls.
- The saved-trip Journey is not a first-class destination in the authenticated trip workspace.
- The saved-trip Journey hero uses a dark-brand treatment over a dark/full-bleed image despite an approved white asset existing.

Two baseline tests fail on the accepted base because their source-code regular expressions no longer describe accepted behaviour: `tests/map-camera-and-icons.test.ts` omits the `preserveCameraOnResize` dependency, and `tests/map-trip-shell-presentation.test.ts` assumes a direct click callback instead of the accepted pointer-up/click activation gate. They will be replaced with behavioural coverage; they are not product regressions to preserve.

## Architecture

### Ownership boundary

There will not be a universal map component. The three existing domain renderers remain because they own materially different data and interaction jobs:

- `JourneyPlannerMap` owns authenticated trip stops, legs, planner pins and transport presentation.
- `DiscoveryMap` owns discoverable route collections and route-card coordination.
- `RouteLiveMap` and `RouteMapSummary` own published and personal editorial journeys, hash navigation and journey narration.

A small shared policy layer will own only behaviour that must be identical:

- MapLibre worker, style, attribution and allowed controls.
- Explicit surface variants.
- Camera targets and responsive occlusion-aware padding.
- Stop-marker DOM, state and fallback presentation.
- Activation semantics needed to make map and adjacent UI select the same entity.

Domain renderers map their data into the shared contract and keep their existing analytics and business-state responsibilities.

### Explicit surface variants

Every map instance must declare one of these variants:

```ts
type MorroviaMapSurfaceVariant = "workspace" | "embedded" | "preview";
```

| Variant | Interaction | Map controls | Camera updates | Intended surfaces |
| --- | --- | --- | --- | --- |
| `workspace` | Full pan/zoom and domain selection | Zoom controls; no compass or fullscreen; whole-route reset remains in the owning workspace UI | Route, stop, leg and collection targets | Builder, authenticated Map and Transport, full Discover |
| `embedded` | Pan/zoom and direct entity selection where the owner exposes details | Zoom controls only when the map is the primary interaction in the section; no compass or fullscreen | Route, stop and connection targets | Route Detail and saved-trip Journey |
| `preview` | No map navigation or map selection | None | Initial fit and resize preservation only | Overview, Dashboard cards, itinerary/stay previews, Discover route preview, homepage demo |

Preview content may remain a link or button at the page level, but the MapLibre canvas and markers inside it are non-interactive. This removes undocumented clickable pins while preserving contextual navigation owned by the surrounding card or section.

### Shared setup contract

The shared setup function will configure the existing worker URL, Morrovia map style, attribution and variant control policy. It will not own React state or domain sources. Each renderer remains responsible for creating and removing its map and layers, but setup values may not be copied into page-local code.

MapLibre attribution remains enabled in all variants. Attribution may use the existing compact presentation but cannot be hidden. Compass, geolocation and fullscreen controls are outside this issue because none is needed to understand or select a planned route.

Basemap error and reload behaviour continues through `map-basemap-lifecycle.ts`. A failed basemap must not remove the adjacent factual route, stop or connection content.

### Canonical map entities

The policy layer accepts stable journey entities rather than display indices:

```ts
type MorroviaMapTarget =
  | { kind: "route"; coordinates: Array<[number, number]> }
  | { kind: "stop"; id: string; coordinates: [number, number] }
  | { kind: "leg"; id: string; coordinates: Array<[number, number]> }
  | { kind: "collection"; ids: string[]; coordinates: Array<[number, number]> };
```

`id` is an occurrence or leg identity, not a place name. Two visits to the same city therefore remain selectable independently even when their coordinates match. Display order may be derived from the canonical sequence but cannot be used as internal identity.

Connection identity is resolved at the presentation boundary. An existing canonical trip-leg ID is used when one exists; otherwise the projection derives a stable view ID from the adjacent occurrence IDs (`connection:<from-stop-id>:<to-stop-id>`). It is never derived from display names or array position and does not alter canonical route facts.

Discover uses its stable route key and stable stop identity. Authenticated trip maps retain the IDs already produced by `map-spatial-context.ts`. Editorial Route Detail translates public index hashes into stable stop and connection IDs at its boundary.

### Camera policy

`lib/easyt/map-camera.ts` will become the single camera-policy owner. The renderer supplies a target, container dimensions, safe edge spacing and measured UI occlusions. The policy returns one replaceable camera request.

The target rules are:

- **Whole route:** fit all trustworthy mapped coordinates, with a maximum zoom that retains geographic context.
- **Stop:** centre the occurrence at the established regional stop zoom. The stop must be clear of every visible rail, card or control.
- **Leg or connection:** fit only its endpoints and trustworthy relevant geometry. The rest of the route remains visible as subdued context but does not affect the fit bounds.
- **Collection:** fit the selected route or stop collection, never every item still loaded in the Discover dataset.
- **Single mapped coordinate:** use stop focus rather than attempting zero-area bounds.
- **No mapped coordinates:** do not issue a camera request; keep the factual empty/error treatment beside the map.

Selection camera requests replace earlier selection requests. Manual pan, wheel, pinch, drag or control activation interrupts pending automatic camera motion through the existing interruption paths. Resize may preserve the selected target and recalculate padding but must not unexpectedly reset to the whole route.

Whole-route reset is owned by the existing surrounding UI: `JourneyPlannerStrip` in authenticated workspaces, the Discover toolbar, and the editorial Journey navigator. A second reset button must not be placed on the canvas.

### Responsive, occlusion-aware padding

Camera padding is calculated from the rendered map container plus measured occlusions:

```ts
type MorroviaMapInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
```

The shared calculation combines token-based safe edge space with actual rail, navigator, panel or compact-overlay measurements. It is clamped so the remaining drawable area stays positive at 320 px and during resizing.

- The authenticated Map workspace continues to supply its left planning rail, replacing the fixed legacy assumption with its measured width.
- Transport supplies the visible detail rail when present.
- Discover supplies its visible results rail or mobile sheet occlusion.
- Desktop editorial Journey uses a right-side navigator over the map treatment; its measured width is included as the right occlusion inset.
- Mobile editorial Journey moves navigation out of the map viewport into the compact route strip, so only the strip's actual overlap, if any, is included.
- Preview maps use symmetric token spacing and no fictional desktop rail.

The calculation is container-based, not based on `window.innerWidth`, so Storybook, split views and embedded surfaces behave like production.

### Shared stop-marker presentation

A shared marker factory and shared CSS own stop marker structure across all three renderers. The contract includes:

- A minimum 44 by 44 CSS-pixel activation target for interactive variants.
- Stable `data-stop-id` occurrence identity.
- Accessible label containing sequence and stop name.
- Default, hover/focus-visible, selected, origin and journey-end states.
- The current Morrovia semantic colours, border, radius, shadow and focus-ring tokens.
- A text or numbered marker fallback that does not depend on imagery or a remote icon.
- Non-interactive markup and presentation in `preview` maps.

Transport-mode icons and planner-specific pins stay with `JourneyPlannerMap`; #333 does not collapse them into the stop-marker abstraction. Page-local overrides are removed when the shared contract covers them.

### Route line state

The existing route source and paint helpers remain the source of truth. Renderers expose route line states consistently:

- Whole-route state shows all mapped legs at the standard emphasis.
- Selecting a stop keeps its adjacent route understandable while reducing unrelated line emphasis.
- Selecting a leg or connection gives that segment primary emphasis and subdues all other mapped route geometry.
- Unknown or straight-line geometry remains explicitly approximate; selection must not imply verified roads, rail tracks or schedules.

Line selection can be initiated by pointer interaction where the renderer already supports hit resolution. Keyboard users receive equivalent selection through the ordered, focusable adjacent controls and marker buttons; a bare MapLibre canvas path is not treated as an accessible control.

## Surface-specific design

### Builder and authenticated trip workspaces

`JourneyPlannerMap` adopts the shared setup, variant, camera, padding and stop-marker contracts without changing canonical trip data or the existing map/hash selection architecture.

- Builder and full Map use `workspace`.
- Overview, Dashboard, Itinerary and Stay map previews use `preview` and become non-interactive inside the map canvas.
- Transport uses `workspace` and retains transport-specific markers and details.
- Selecting a leg in Map or Transport fits that leg's endpoints/relevant geometry rather than leaving the camera on the whole route.
- Selecting the same entity in a list, strip, card, marker or route line produces the same canonical selection.
- Existing whole-route reset and manual camera interruption behaviour remains.

Explore stays map-free. It continues to pass canonical result and stop context into the Map workspace instead of becoming a fourth map owner.

### Discover

`DiscoveryMap` keeps route discovery and collection logic but adopts the shared setup and policies.

- The full Discover map uses `workspace`.
- The route preview uses `preview` and exposes no zoom control or interactive marker.
- Selecting a route fits only that route's mapped coordinates.
- Selecting a stop focuses its stable occurrence identity at stop zoom.
- Re-selecting whole results fits the active collection, not stale or hidden results.
- Result card, keyboard and map activation remain bidirectional and use the same selection state.

### Published Route Detail and saved-trip Journey

`RouteMapSummary` and `RouteLiveMap` share one editorial selection model for both published and personal journeys:

```ts
type EditorialJourneySelection =
  | { kind: "route" }
  | { kind: "stop"; stopId: string }
  | { kind: "connection"; connectionId: string };
```

The renderer receives stable stop and connection IDs. It never stores array index as selection state. The public URL contract remains unchanged:

- `#route-map` selects the whole route.
- `#route-map-stop-N` selects the stop occurrence at public index `N`.
- `#route-map-connection-N` selects the onward connection at public index `N`.

Hash parsing validates the public index and immediately resolves it to a stable ID. Selection-to-hash serialization looks up the current public index. Existing authored links, no-JavaScript destinations, browser history and #328 deep links therefore continue to work. Invalid or stale hashes fall back to the whole route without inventing a selection.

The current native `EasyTSelect` is replaced by one visible Journey navigator:

- Desktop shows an ordered right-side navigator containing one **Whole journey** button followed by interleaved stop and connection buttons.
- Each stop shows its sequence and name. Each connection names both endpoints and its reviewed transport label when available.
- The active item uses `aria-current="location"`; activation updates the canonical selection and public hash.
- The map detail content is coordinated with the navigator selection. It is not a second selector.
- The old dropdown and every duplicate **Whole route** control are removed.

On mobile, the desktop navigator becomes a compact, horizontally scrollable Journey strip immediately before the map. It contains the same interleaved entities, begins with **Whole journey**, exposes the selected item in view and uses the identical canonical state. It is not a native select and does not reproduce the long desktop panel vertically. The strip follows the current Morrovia mobile action and focus patterns and remains usable at 320 and 390 px.

Camera and visual behaviour follows the shared rules:

- Whole journey fits the complete mapped route.
- A stop receives intentional regional focus.
- A connection fits its endpoints and trustworthy geometry.
- Non-selected route lines remain subdued context.
- **Whole journey** restores the complete route.
- The measured desktop navigator width is included in camera padding.

The published Route Detail continues to show only reviewed and publication-safe facts accepted under #328. The personal Journey continues to show only facts saved on that trip. The map policy does not add prose, infer missing transport facts or widen any publication boundary.

### Saved-trip Journey discoverability

The existing `TripShellNavigation` remains the only authenticated workspace navigation owner. It gains one first-class **Journey** destination pointing to `/journey/my-routes/[tripId]`; no second navigation model or parallel trip state is introduced. The personal Journey page resolves the same canonical saved trip through its existing owner/device boundary.

The Overview route card retains a contextual editorial entry in addition to **Explore on map**. The entry is labelled **View journey** and points to `/journey/my-routes/[tripId]`. **Explore on map** continues to open the functional Map workspace. These destinations have distinct jobs and analytics must preserve that distinction.

Workspace visit and journey-view analytics will use the existing privacy-safe event conventions and trip ID/stop-count context. This issue must not rename or reinterpret existing Builder, map or #328 publication events.

### Editorial header treatment

The dark/full-bleed personal Journey hero uses `EasyTNavigation` with `logoTone="light"`, which resolves to the existing approved `/brand/morrovia-full-white.png` asset through `MorroviaBrandLogo`. Navigation text and interaction states use the established light-on-image treatment. No inverse logo is redrawn or generated, and no second editorial header is created.

If the hero image is unavailable, the existing hero-missing state supplies a sufficiently dark fallback surface for the same light navigation treatment; it does not leave white navigation on a light fallback.

## Accessibility and interaction contract

- Every interactive marker and navigator item is reachable and operable by keyboard.
- Enter and Space activate buttons. Existing link semantics remain Enter-activated links.
- Pointer-up/click deduplication prevents a single gesture from toggling a route leg twice.
- Focus-visible treatment uses shared tokens and is not clipped by the map container.
- Map selection never steals focus from the initiating navigator or list control.
- Hash entry focuses the existing `#route-map` region without forcing focus into the canvas.
- The coordinated detail region announces meaningful selection changes through the existing polite live-region pattern, without announcing every camera frame.
- Escape continues to close only the topmost owned overlay or sheet and returns focus to its trigger. The mobile Journey strip itself is not a modal and needs no Escape behaviour.
- Touch targets meet the established minimum size, and horizontal mobile navigation does not require precision dragging.
- Reduced-motion preferences eliminate animated camera travel while preserving final bounds and selection state.

## Responsive contract

The implementation reuses existing design tokens and breakpoints wherever they express the intended layout. A new breakpoint is allowed only if no existing route/workspace breakpoint can represent the navigator transition.

- **Desktop:** map and visible Journey navigator form one coordinated treatment; camera padding includes the navigator and any workspace rail.
- **Tablet:** the same entity model remains; navigator width and camera padding respond to actual container measurements.
- **Mobile at 390 and 320 px:** editorial Journey uses the compact strip, map controls do not overlap it, factual detail follows the map, and no desktop sidebar is stacked into a long selector. Workspace rails/sheets contribute only their real visible occlusion.
- **Preview cards:** remain legible at their story dimensions with no orphaned controls or clipped attribution.

## Loading, sparse and failure states

- Map loading uses `MorroviaMapLoading` and preserves a stable container size.
- A route with one mapped occurrence uses stop focus and still exposes factual route details.
- A partially mapped route fits only trustworthy coordinates and surfaces the existing factual warning.
- A route with no trustworthy coordinates shows the factual route/Journey content and an honest map-unavailable state; it does not show arbitrary geography.
- A missing connection duration or unreviewed mode retains its existing warning and never changes camera eligibility if endpoints are known.
- Marker image/icon failures fall back to the shared numbered/text marker.
- Basemap failure does not discard the navigator, selection, route facts or attribution obligations.

## Testing strategy

Implementation is test-first and sequential. Source-regex assertions are used only for static contracts that cannot be expressed behaviourally. The two known stale baseline regex tests are replaced, not loosened to match implementation text.

### Pure policy tests

- Explicit `workspace`, `embedded` and `preview` behaviour and controls.
- Whole-route, single-stop, selected-leg and collection targets.
- Container-based inset calculation, clamping and rail/navigator occlusion.
- Stable repeated-stop identities and public-hash translation.
- Marker structure, fallback and visual-state class contract.
- Reduced-motion and manual-interruption results.

### Component behaviour tests

- Map/list/strip/card selection stays bidirectional.
- Pointer and keyboard activation produce the same canonical entity.
- Pointer-up/click deduplication activates once.
- Whole-route reset, stop focus and selected-leg/connection fit issue the expected camera target.
- Preview variants have no map controls and no interactive markers.
- Attribution remains enabled.
- Route Detail hashes survive load, activation, history and invalid indices.
- Desktop Journey navigator and 320/390 mobile strip expose the same ordered entities and selection.
- Personal Journey uses the light brand variant over a valid dark hero and readable fallback treatment otherwise.
- Authenticated TripShell and Overview expose the canonical Journey destination without a second trip state owner.

### Representative scenarios

The verified scenario matrix includes:

- #328 published Japan, India, Vietnam–Cambodia, Balkans and Portugal routes.
- A saved personal Journey with repeated stops.
- Builder handoff into the authenticated workspace.
- Map and Transport leg focus.
- Discover route and stop selection.
- Sparse and partially mapped routes.
- Mobile 320 and 390 px; tablet; desktop with visible rails.
- Relevant #328 and #330 regression suites.

### Required checks

Run focused tests first, then the relevant complete test group, lint, typecheck and production build. Because shared UI changes, build Storybook and verify representative `workspace`, `embedded` and `preview` stories at desktop and mobile viewports. Visual verification must include attribution, control collisions, marker states, navigator selection and actual camera framing.

## Migration boundaries

Implementation will proceed by establishing tested shared policy before migrating one owner at a time. Each migrated surface must retain its existing state and analytics owner. The later implementation plan will define the exact test/commit sequence after this specification is approved.

The migration may extend the existing shared files or add narrowly named map-policy helpers and stories. It must not create parallel controls, duplicate route state, a new content source or a replacement domain renderer.

## Non-goals

- Rewriting all maps as one universal React component.
- Replacing MapLibre or the existing Morrovia basemap style.
- Enriching all 25 routes or changing #328 reviewed-content readiness rules.
- Adding Wikidata, a CMS, a new content owner or generated travel prose.
- Changing canonical trip, route, stop or leg facts.
- Changing Builder draft parity, ownership boundaries or persistence.
- Replacing the existing map/hash selection architecture.
- Adding compass, geolocation, fullscreen or a second whole-route control.
- Adding a map to Explore.
- Inventing exact road, rail, ferry or flight geometry.
- Redesigning unrelated Journey sections or broad product navigation.

## Acceptance criteria

#333 is complete only when:

- Every MapLibre surface declares an explicit variant and follows its control policy.
- The three domain renderers share setup, camera, padding and stop-marker policy without surrendering domain ownership.
- Whole route, stop, leg/connection and collection selections frame the intended geography with visible UI occlusions accounted for.
- Repeated stops remain distinct by canonical occurrence ID.
- Map and adjacent UI selection are bidirectional with pointer/keyboard parity.
- Preview maps are intentionally non-interactive and control-free.
- Published Route Detail hashes and #328 publication/readiness boundaries remain intact.
- Desktop Route Detail and personal Journey use the visible ordered Journey navigator; mobile uses the compact strip; duplicate whole-route controls and the native selector are gone.
- The saved-trip Journey is available from the canonical authenticated workspace navigation and the Overview contextual entry.
- The personal Journey hero uses the existing approved white Morrovia logo treatment when appropriate.
- Attribution, analytics and responsive Storybook states are verified.
- The representative route, Builder, map/hash, accessibility, #328 and #330 checks pass.

## Rejected alternatives

### One universal map component

Rejected because Builder/trip maps, Discover and editorial Journey have different data and interaction responsibilities. A universal renderer would create conditional coupling and risk canonical state while adding no traveller value.

### CSS and utility cleanup only

Rejected because the failures are behavioural: selected geometry, camera target replacement, responsive occlusion, stable identity and control policy cannot be solved through visual consolidation alone.

### A new personal-Journey navigation shell

Rejected because `TripShellNavigation` already owns authenticated trip destinations. A second shell would split navigation and trip state and make Journey discoverability less predictable.

### Keep the native Route Detail dropdown on mobile

Rejected because it hides journey sequence and connections and reproduces the desktop information problem in a smaller control. The compact ordered strip preserves direct selection while remaining concise.

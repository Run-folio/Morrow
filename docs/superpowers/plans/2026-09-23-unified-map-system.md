# Unified Map System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Morrovia MapLibre surface one explicit interaction, camera, padding, marker and control policy while preserving each domain owner and the intentional Builder, Stay, Itinerary, Discover and editorial Journey behaviours.

**Architecture:** Keep `JourneyPlannerMap`, `DiscoveryMap` and `RouteLiveMap` as domain renderers. Add a pure shared policy module plus shared MapLibre runtime and marker helpers, then migrate one owner at a time. Canonical IDs remain in domain state; public Route Detail hashes translate to and from those IDs only at the URL boundary.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, MapLibre GL 6, CSS Modules, Node test runner, Storybook 10.

**Spec:** `docs/superpowers/specs/2026-09-23-unified-map-system-design.md`

## Global Constraints

- Start from accepted base `812604ebe162a9b81f36d90189ae99f73f6fc801` plus the approved #333 documentation commits on `codex/route-map-system-333`.
- Retain the three domain map owners; do not create a universal map component.
- Preserve canonical trip facts, Builder draft parity, persistence, publication boundaries, analytics, attribution and the current map/hash architecture.
- Builder is a `preview`: non-pannable, non-selectable and control-free.
- Stay and Itinerary are `embedded` with `selection-only`: preserve canonical marker-to-card/item selection without pan/zoom controls.
- Route Detail and personal Journey are `embedded` with `pan-zoom`; Map, Transport and full Discover are `workspace`.
- Explore remains map-free and hands canonical context to Map.
- Preserve public `#route-map-stop-N` and `#route-map-connection-N` hashes while storing stable stop/connection IDs internally.
- Transport semantics stay in `JourneyPlannerMap` and `morrovia-transport-icons.ts`, outside the generic stop-marker abstraction.
- Do not add Wikidata, a CMS, a content owner, generated travel prose, route-wide enrichment, compass, geolocation or fullscreen controls.
- Reuse `EasyTButton`, `EasyTLinkButton`, `MorroviaMapLoading`, `JourneyPlannerStrip`, existing semantic tokens and existing breakpoint patterns.
- Work test-first and commit after every independently reviewable task.
- Do not push, merge or deploy.

## File Structure

### New shared files

- `lib/easyt/map-surface-policy.ts` — pure surface variants, embedded interaction profiles, camera targets, camera requests and occlusion-aware inset calculation.
- `components/easyt/morrovia-map-runtime.ts` — shared MapLibre worker, style, attribution and allowed-control setup.
- `components/easyt/morrovia-map-markers.ts` — shared stop-marker model, DOM construction and state updates.
- `tests/map-surface-policy.test.ts` — pure policy, target, inset and repeated-identity tests.
- `tests/map-runtime-and-markers.test.ts` — runtime options, control policy, marker fallback and state tests.
- `tests/map-surface-consumers.test.ts` — explicit consumer classification and intentional Builder/Stay/Itinerary behavior contracts.

### Existing files with focused changes

- `lib/easyt/map-camera.ts` — apply a resolved focus/fit request with interruption and reduced-motion behavior.
- `components/easyt/morrovia-map-presentation.ts` — retain canonical style and route paint; add selected/subdued route paint if required.
- `components/easyt/morrovia-map-presentation.module.css` — own shared stop and transport-marker visuals.
- `components/journey-planner-map.tsx` — accept the explicit surface contract and use shared runtime, target, padding and marker policy.
- `app/journey/new/trip-builder-route-workspace.tsx` — declare `preview`.
- `components/easyt/trip-overview-workspace.tsx`, `app/journey/dashboard/dashboard-client.tsx`, `app/journey/home/immersive/demo-map.tsx` — declare genuine previews.
- `components/easyt/trip-stay-workspace.tsx`, `components/easyt/trip-itinerary-workspace.tsx` — declare `embedded`/`selection-only` while retaining canonical selection.
- `components/easyt/trip-map-workspace.tsx`, `components/easyt/trip-transport-workspace.tsx` — supply selected-leg targets and measured occlusions.
- `app/journey/discover/discovery-map.tsx`, `app/journey/discover/discovery-browser.tsx`, `app/journey/discover/route-preview.tsx` — migrate setup and stable route/stop selection.
- `app/journey/routes/[slug]/route-map-selection.ts` — public-hash ↔ canonical-ID translation.
- `app/journey/routes/[slug]/route-live-map.tsx`, `app/journey/routes/[slug]/route-map-summary.tsx`, `app/journey/routes/[slug]/route-overview.module.css` — shared runtime/camera and Journey navigator.
- `lib/easyt/personal-route.ts` — expose stable connection IDs from canonical legs or adjacent occurrence IDs.
- `components/easyt/trip-shell-client.tsx`, `lib/easyt/trip-workspace-links.ts`, `components/easyt/trip-overview-workspace.tsx` — first-class Journey destination and contextual entry.
- `app/journey/my-routes/[tripId]/page.tsx`, `personal-route-view.tsx`, `personal-route.module.css` — approved light header treatment and responsive Journey composition.
- Relevant Storybook stories and existing map, route, personal-route, Stay, Itinerary and Transport tests.

## Review Focus

- A 320 px map with a visible rail/strip must retain a positive drawable area and keep the selected geography visible; Task 1 tests clamping and Task 10 verifies the rendered matrix.
- Two visits to the same coordinates must retain different stop and connection identities; Tasks 1, 6 and 8 test occurrence IDs, hashes and navigator activation.
- A `selection-only` map must keep marker selection while rejecting pan/zoom controls; Tasks 2 and 3 test policy plus Stay/Itinerary wiring.
- A missing transport mode must render an accessible shared fallback with a visible background in every relevant state; Task 4 tests the icon model and shared CSS ownership.
- Rapid UI/map/hash selection followed by resize must leave the newest target selected and framed; Tasks 4, 5 and 7 test replacement, resize and history behavior.

---

### Task 1: Define the pure surface, camera-target and padding policy

**Files:**
- Create: `lib/easyt/map-surface-policy.ts`
- Create: `tests/map-surface-policy.test.ts`
- Modify: `lib/easyt/map-camera.ts`
- Test: `tests/map-camera-and-icons.test.ts`

**Interfaces:**
- Produces: `MorroviaMapSurfaceVariant`, `MorroviaEmbeddedInteraction`, `MorroviaMapSurface`, `MorroviaMapTarget`, `MorroviaMapInsets`, `MorroviaMapCameraRequest`, `resolveMapSurfacePolicy()`, `resolveMapInsets()`, `resolveMapCameraRequest()` and `applyMapCameraRequest()`.
- Consumes: existing `focusMapCamera()`, `fitMapCamera()`, `interruptMapCamera()` and reduced-motion behavior.

- [ ] **Step 1: Write failing pure-policy tests**

```ts
test("surface variants expose only their intended interaction", () => {
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "preview" }), { panZoom: false, domainSelection: false, zoomControl: false });
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "embedded", interaction: "selection-only" }), { panZoom: false, domainSelection: true, zoomControl: false });
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "embedded", interaction: "pan-zoom" }), { panZoom: true, domainSelection: true, zoomControl: true });
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "workspace" }), { panZoom: true, domainSelection: true, zoomControl: true });
});

test("occlusions clamp without erasing a 320px map", () => {
  assert.deepEqual(resolveMapInsets({ width: 320, height: 420, safe: 16, occlusions: { left: 440, right: 0, top: 0, bottom: 0 } }), { top: 16, right: 16, bottom: 16, left: 144 });
});

test("connection targets use only selected geometry", () => {
  const request = resolveMapCameraRequest({ kind: "leg", id: "leg-a-b", coordinates: [[1, 2], [3, 4]] }, { top: 20, right: 200, bottom: 20, left: 20 });
  assert.deepEqual(request, { kind: "fit", coordinates: [[1, 2], [3, 4]], padding: { top: 20, right: 200, bottom: 20, left: 20 }, maxZoom: 9 });
});
```

- [ ] **Step 2: Run the new test and confirm the missing module failure**

Run: `node --experimental-strip-types --test tests/map-surface-policy.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `map-surface-policy.ts`.

- [ ] **Step 3: Implement the minimal pure contracts**

```ts
export type MorroviaMapSurfaceVariant = "workspace" | "embedded" | "preview";
export type MorroviaEmbeddedInteraction = "selection-only" | "pan-zoom";

export type MorroviaMapSurface =
  | { variant: "workspace" }
  | { variant: "preview" }
  | { variant: "embedded"; interaction: MorroviaEmbeddedInteraction };

export type MorroviaMapTarget =
  | { kind: "route" | "collection"; ids?: string[]; coordinates: Array<[number, number]> }
  | { kind: "stop"; id: string; coordinates: [number, number] }
  | { kind: "leg"; id: string; coordinates: Array<[number, number]> };

export function resolveMapSurfacePolicy(surface: MorroviaMapSurface) {
  const domainSelection = surface.variant !== "preview";
  const panZoom = surface.variant === "workspace" || surface.variant === "embedded" && surface.interaction === "pan-zoom";
  return { panZoom, domainSelection, zoomControl: panZoom };
}
```

Implement `resolveMapInsets()` from container dimensions and measured occlusions, reserving at least 160×160 CSS pixels of drawable area. Implement `resolveMapCameraRequest()` so route/collection and leg targets fit their own finite coordinates, stop targets focus at zoom 8, one-coordinate fits become focus, and empty targets return `{ kind: "none" }`. Add `applyMapCameraRequest()` to `map-camera.ts`, delegating to the existing focus/fit functions and accepting a caller-supplied bounds factory.

- [ ] **Step 4: Replace the stale camera regex assertion with behavior**

In `tests/map-camera-and-icons.test.ts`, delete the `ResizeObserver` dependency regex and add a test that calls `applyMapCameraRequest()` twice, then asserts `stop` precedes each camera operation and the second request is last. Keep the existing manual-interruption assertions as direct function tests.

- [ ] **Step 5: Run focused policy and camera tests**

Run: `node --experimental-strip-types --test tests/map-surface-policy.test.ts tests/map-camera-and-icons.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the pure policy**

```bash
git add lib/easyt/map-surface-policy.ts lib/easyt/map-camera.ts tests/map-surface-policy.test.ts tests/map-camera-and-icons.test.ts
git commit -m "feat: define shared map surface and camera policy"
```

### Task 2: Centralize MapLibre setup and stop-marker construction

**Files:**
- Create: `components/easyt/morrovia-map-runtime.ts`
- Create: `components/easyt/morrovia-map-markers.ts`
- Create: `tests/map-runtime-and-markers.test.ts`
- Modify: `components/easyt/morrovia-map-presentation.module.css`
- Modify: `components/easyt/morrovia-map-presentation.ts`

**Interfaces:**
- Consumes: `MorroviaMapSurface` and `resolveMapSurfacePolicy()` from Task 1.
- Produces: `MORROVIA_MAP_WORKER_URL`, `morroviaMapOptions()`, `installMorroviaMapControls()`, `MorroviaStopMarkerInput`, `morroviaStopMarkerModel()`, `createMorroviaStopMarker()` and `setMorroviaStopMarkerState()`.

- [ ] **Step 1: Write failing runtime and marker-model tests**

```ts
test("preview and selection-only maps are control-free but keep attribution", () => {
  assert.equal(morroviaMapOptions({ variant: "preview" }).interactive, false);
  assert.equal(morroviaMapOptions({ variant: "embedded", interaction: "selection-only" }).interactive, false);
  assert.equal(morroviaMapOptions({ variant: "workspace" }).interactive, true);
  assert.equal(morroviaMapOptions({ variant: "workspace" }).attributionControl.compact, false);
});

test("repeated stops and fallback labels retain occurrence identity", () => {
  const first = morroviaStopMarkerModel({ id: "tokyo-first", sequence: 1, name: "Tokyo", interactive: true, selected: false });
  const second = morroviaStopMarkerModel({ id: "tokyo-return", sequence: 3, name: "Tokyo", interactive: true, selected: true });
  assert.notEqual(first.dataset.mapStopId, second.dataset.mapStopId);
  assert.equal(second.label, "Stop 3: Tokyo");
  assert.match(second.classNames.join(" "), /is-active/);
});
```

- [ ] **Step 2: Run the new runtime test and confirm it fails**

Run: `node --experimental-strip-types --test tests/map-runtime-and-markers.test.ts`

Expected: FAIL because the runtime and marker modules do not exist.

- [ ] **Step 3: Implement shared runtime options and controls**

```ts
export const MORROVIA_MAP_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export function morroviaMapOptions(surface: MorroviaMapSurface) {
  const policy = resolveMapSurfacePolicy(surface);
  return {
    style: morroviaMapStyle,
    attributionControl: { compact: false as const },
    interactive: policy.panZoom,
    scrollZoom: policy.panZoom,
    dragRotate: false,
    pitchWithRotate: false,
  };
}
```

`installMorroviaMapControls()` adds a `NavigationControl({ showCompass: false })` only when `zoomControl` is true. It never adds compass, geolocation or fullscreen. Each renderer still constructs and disposes its own map.

- [ ] **Step 4: Implement shared stop marker construction and CSS**

Make the marker model return tag, text fallback, canonical dataset, accessible label and state class names. `createMorroviaStopMarker(document, input)` creates a `button` for interactive markers and a presentation-only `span` for previews. Move the common `.planner-map__stop`, number, origin/end, active, hover and focus-visible rules into `morrovia-map-presentation.module.css`; remove only duplicate rules covered by this shared owner.

- [ ] **Step 5: Run the runtime, marker and UI convergence tests**

Run: `node --experimental-strip-types --test tests/map-runtime-and-markers.test.ts tests/map-basemap-presentation.test.ts tests/ui-convergence.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit shared runtime and markers**

```bash
git add components/easyt/morrovia-map-runtime.ts components/easyt/morrovia-map-markers.ts components/easyt/morrovia-map-presentation.ts components/easyt/morrovia-map-presentation.module.css tests/map-runtime-and-markers.test.ts
git commit -m "feat: centralize MapLibre setup and stop markers"
```

### Task 3: Make `JourneyPlannerMap` variants explicit without erasing embedded selection

**Files:**
- Modify: `components/journey-planner-map.tsx`
- Modify: `app/journey/new/trip-builder-route-workspace.tsx`
- Modify: `components/easyt/trip-overview-workspace.tsx`
- Modify: `app/journey/dashboard/dashboard-client.tsx`
- Modify: `app/journey/home/immersive/demo-map.tsx`
- Modify: `components/easyt/trip-stay-workspace.tsx`
- Modify: `components/easyt/trip-itinerary-workspace.tsx`
- Modify: `app/journey/plan-next/map-plan-next.tsx`
- Create: `tests/map-surface-consumers.test.ts`
- Modify: `tests/stay-workspace.test.ts`
- Modify: `tests/itinerary-workspace-presentation.test.ts`

**Interfaces:**
- Consumes: Task 1 `MorroviaMapSurface`; Task 2 runtime and marker helpers.
- Produces: required `surface: MorroviaMapSurface`, optional `cameraSafeEdge?: number` and `cameraOcclusions?: Partial<MorroviaMapInsets>` props on `JourneyPlannerMap`; preserves `onMapResultSelect()` and `onPlannerPinSelect()` for `embedded`/`selection-only`.

- [ ] **Step 1: Write failing consumer-classification tests**

Add tests that assert the production owners pass these exact values:

```ts
assert.match(builder, /surface=\{\{ variant: "preview" \}\}/);
assert.match(stay, /surface=\{\{ variant: "embedded", interaction: "selection-only" \}\}/);
assert.match(itinerary, /surface=\{\{ variant: "embedded", interaction: "selection-only" \}\}/);
assert.match(mapWorkspace, /surface=\{\{ variant: "workspace" \}\}/);
```

In Stay and Itinerary tests, also assert `selectionId`/planner-pin IDs continue to flow to the selected card/item callbacks.

- [ ] **Step 2: Run the consumer tests and confirm old implicit props fail**

Run: `node --experimental-strip-types --test tests/map-surface-consumers.test.ts tests/stay-workspace.test.ts tests/itinerary-workspace-presentation.test.ts`

Expected: FAIL because owners still pass `previewMode` instead of `surface`.

- [ ] **Step 3: Replace implicit booleans with the explicit surface prop**

In `JourneyPlannerMap`, derive `policy = resolveMapSurfacePolicy(surface)`. Replace `previewMode` branches as follows:

```ts
const presentationOnly = surface.variant === "preview";
const domainSelection = policy.domainSelection;
const panZoom = policy.panZoom;
```

Use `presentationOnly` for inert stop markers, `domainSelection` for planner pins and result markers, and `panZoom` for map gestures, controls and manual camera listeners. Remove the Itinerary capture-handler workaround once marker buttons fire one canonical activation themselves.

Replace `overviewPadding` with `cameraSafeEdge` plus `cameraOcclusions`. On every camera request and `ResizeObserver` callback, call `resolveMapInsets()` with the actual map container dimensions; never read `window.innerWidth`.

- [ ] **Step 4: Classify every `JourneyPlannerMap` consumer**

Set Builder, Overview, Dashboard, homepage demo and true visual-only previews to `{ variant: "preview" }`; Stay and Itinerary to `{ variant: "embedded", interaction: "selection-only" }`; full Map, Transport and legacy interactive Plan Next to `{ variant: "workspace" }`. Preserve Builder's external route-list selection and collapse behavior.

- [ ] **Step 5: Run focused consumer and type tests**

Run: `node --experimental-strip-types --test tests/map-surface-consumers.test.ts tests/stay-workspace.test.ts tests/itinerary-workspace-presentation.test.ts tests/trip-builder-route-preview.test.ts tests/map-trip-shell-presentation.test.ts && npm run typecheck`

Expected: PASS, including canonical Stay/Itinerary selection and Builder's inert map.

- [ ] **Step 6: Commit explicit consumer variants**

```bash
git add components/journey-planner-map.tsx app/journey/new/trip-builder-route-workspace.tsx components/easyt/trip-overview-workspace.tsx app/journey/dashboard/dashboard-client.tsx app/journey/home/immersive/demo-map.tsx components/easyt/trip-stay-workspace.tsx components/easyt/trip-itinerary-workspace.tsx app/journey/plan-next/map-plan-next.tsx tests/map-surface-consumers.test.ts tests/stay-workspace.test.ts tests/itinerary-workspace-presentation.test.ts
git commit -m "refactor: declare map interaction variants"
```

### Task 4: Fit selected trip legs and unify transport-marker visuals

**Files:**
- Modify: `components/journey-planner-map.tsx`
- Modify: `components/easyt/trip-map-workspace.tsx`
- Modify: `components/easyt/trip-transport-workspace.tsx`
- Modify: `lib/easyt/map-spatial-context.ts`
- Modify: `components/easyt/morrovia-map-presentation.module.css`
- Modify: `app/journey/journey.module.css`
- Modify: `tests/map-camera-and-icons.test.ts`
- Modify: `tests/map-trip-shell-presentation.test.ts`
- Modify: `tests/transport-workspace-browser.test.ts`
- Modify: `components/easyt/trip-map-workspace.stories.tsx`
- Modify: `components/easyt/trip-transport-workspace.stories.tsx`

**Interfaces:**
- Consumes: `resolveMapCameraRequest({ kind: "leg", ... })`, `applyMapCameraRequest()` and existing canonical `MapSpatialLeg` IDs/modes.
- Produces: `mapRouteFitCoordinates()` for canonical leg geometry framing and one shared transport-marker visual contract.

- [ ] **Step 1: Write failing selected-leg and icon acceptance tests**

Extend pure camera tests with a curved leg whose `mapRouteFitCoordinates()` result is `routeGeometry`, plus a two-endpoint fallback when geometry is absent. Add Map/Transport tests that a visible desktop rail supplies its measured left/right occlusion and that hiding the mobile panel supplies zero occlusion. Extend Transport browser coverage so selecting leg B updates both `data-selected` and the mocked map's `data-selected-leg-id` to `leg-B`. Add static CSS ownership assertions that shared presentation contains `.planner-map__leg`, `.planner-map__leg-icon`, active, hover, focus-visible and unknown rules while `journey.module.css` no longer restyles those classes.

- [ ] **Step 2: Run focused tests and observe whole-route framing/local CSS failures**

Run: `node --experimental-strip-types --test tests/map-camera-and-icons.test.ts tests/map-trip-shell-presentation.test.ts tests/transport-workspace-browser.test.ts`

Expected: FAIL because selected legs do not yet issue a leg-target request and transport marker rules remain page-local.

- [ ] **Step 3: Resolve selected-leg targets in `JourneyPlannerMap`**

Export `mapRouteFitCoordinates()` from `map-spatial-context.ts`, using finite `routeSegments`, then finite `routeGeometry`, then endpoints. Build the target from the selected canonical leg:

```ts
const selectedLegTarget = selectedLeg
  ? { kind: "leg" as const, id: selectedLeg.id, coordinates: mapRouteFitCoordinates(selectedLeg) }
  : null;
```

Give the newest stop/result/leg selection one camera request key; selecting a leg replaces whole-route framing, and reset restores `{ kind: "route" }`. Preserve manual interruption and reduced motion.

Observe the existing Map planning rail and Transport detail rail in their owning workspaces. Pass their measured, currently visible widths through `cameraOcclusions`; do not recreate either rail inside `JourneyPlannerMap`.

- [ ] **Step 4: Move the transport marker visual contract to shared presentation**

Move background, border, shadow, icon sizing, active, hover, focus-visible and `.is-unknown` rules into `morrovia-map-presentation.module.css`. Keep tooltip/card layout local only where it positions workspace content. Continue resolving icons through `mapTransportIcon()` and use `CircleHelp` plus `Unknown transport` for unsupported modes.

- [ ] **Step 5: Replace the stale leg-listener regex with activation behavior**

Delete the direct-click callback regex from `tests/map-trip-shell-presentation.test.ts`. Test `mapRouteLegActivationEvent()` with `pointerup` followed by `click`, asserting one activation, then test Enter/Space through the focusable transport marker or adjacent leg control.

- [ ] **Step 6: Run focused behavior, Storybook contract and type checks**

Run: `node --experimental-strip-types --test tests/map-camera-and-icons.test.ts tests/map-trip-shell-presentation.test.ts tests/transport-workspace-browser.test.ts tests/itinerary-transport-presentation.test.ts tests/storybook-visual-system.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit leg focus and transport visuals**

```bash
git add components/journey-planner-map.tsx components/easyt/trip-map-workspace.tsx components/easyt/trip-transport-workspace.tsx lib/easyt/map-spatial-context.ts components/easyt/morrovia-map-presentation.module.css app/journey/journey.module.css tests/map-camera-and-icons.test.ts tests/map-trip-shell-presentation.test.ts tests/transport-workspace-browser.test.ts components/easyt/trip-map-workspace.stories.tsx components/easyt/trip-transport-workspace.stories.tsx
git commit -m "fix: focus selected legs and unify transport markers"
```

### Task 5: Migrate Discover to shared policy and stable entity selection

**Files:**
- Modify: `app/journey/discover/discovery-map.tsx`
- Modify: `app/journey/discover/discovery-browser.tsx`
- Modify: `app/journey/discover/route-preview.tsx`
- Modify: `tests/immersive-route-discovery.test.ts`
- Modify: `tests/route-detail-discovery.test.ts`
- Modify: `components/easyt/storybook/morrovia-routes-discovery.stories.tsx`

**Interfaces:**
- Consumes: shared runtime, stop markers, route/collection/stop targets and insets.
- Produces: `DiscoveryMapSelection = { kind: "collection" } | { kind: "route"; routeKey: string } | { kind: "stop"; routeKey: string; stopId: string }`.

- [ ] **Step 1: Write failing stable-selection and preview tests**

Test that selecting the second Tokyo occurrence returns its stop ID, that route selection targets only that route's coordinates, collection selection targets only active results, and `route-preview.tsx` declares `preview` with no control or interactive marker.

- [ ] **Step 2: Run Discover tests and confirm index/control failures**

Run: `node --experimental-strip-types --test tests/immersive-route-discovery.test.ts tests/route-detail-discovery.test.ts`

Expected: FAIL because Discover still stores `selectedStop` as an index and always adds navigation controls.

- [ ] **Step 3: Replace Discover indices with route key plus stop ID**

Update `DiscoveryMap` props to accept `selection: DiscoveryMapSelection` and `onSelection(selection)`. Resolve ordering only for labels. Route-card and marker actions dispatch the same selection object.

- [ ] **Step 4: Adopt shared setup, marker and camera policy**

Full Discover declares `workspace`; route preview declares `preview`. Route selection resolves a route target, stop selection resolves a stop target, and overview resolves a collection target from current results. The browser owner measures the currently visible results rail or mobile sheet overlap and passes it as an occlusion. Resize reapplies the current target rather than fitting stale loaded routes.

- [ ] **Step 5: Run Discover tests and typecheck**

Run: `node --experimental-strip-types --test tests/immersive-route-discovery.test.ts tests/route-detail-discovery.test.ts tests/route-discovery.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the Discover migration**

```bash
git add app/journey/discover/discovery-map.tsx app/journey/discover/discovery-browser.tsx app/journey/discover/route-preview.tsx tests/immersive-route-discovery.test.ts tests/route-detail-discovery.test.ts components/easyt/storybook/morrovia-routes-discovery.stories.tsx
git commit -m "refactor: align Discover with shared map policy"
```

### Task 6: Translate editorial public hashes to canonical stop and connection IDs

**Files:**
- Modify: `app/journey/routes/[slug]/route-map-selection.ts`
- Modify: `app/journey/routes/[slug]/route-map-summary.tsx`
- Modify: `lib/easyt/personal-route.ts`
- Modify: `tests/immersive-route-detail.test.ts`
- Modify: `tests/personal-route.test.ts`

**Interfaces:**
- Produces: `EditorialJourneySelection`, `editorialConnectionId()`, `routeMapSelectionFromHash(hash, stops)`, `routeMapHashForSelection(selection, stops)`.
- Consumes: stable stop occurrence IDs; canonical trip leg ID when available; fallback `connection:<from-stop-id>:<to-stop-id>`.

- [ ] **Step 1: Write failing repeated-stop and round-trip hash tests**

```ts
const stops = [
  { id: "tokyo-first", onward: { id: "leg-first-kyoto" } },
  { id: "kyoto", onward: { id: "connection:kyoto:tokyo-return" } },
  { id: "tokyo-return", onward: null },
];
assert.deepEqual(routeMapSelectionFromHash("#route-map-stop-2", stops), { kind: "stop", stopId: "tokyo-return" });
assert.equal(routeMapHashForSelection({ kind: "connection", connectionId: "leg-first-kyoto" }, stops), "#route-map-connection-0");
```

Also assert invalid indices return `{ kind: "route" }` and personal-route connections retain the canonical leg ID or deterministic adjacent-occurrence fallback.

- [ ] **Step 2: Run editorial identity tests and confirm index-state failure**

Run: `node --experimental-strip-types --test tests/immersive-route-detail.test.ts tests/personal-route.test.ts`

Expected: FAIL because `RouteMapSelection` stores `{ type, index }` and personal connections expose no ID.

- [ ] **Step 3: Implement canonical editorial selection**

```ts
export type EditorialJourneySelection =
  | { kind: "route" }
  | { kind: "stop"; stopId: string }
  | { kind: "connection"; connectionId: string };

export function editorialConnectionId(fromStopId: string, toStopId: string, legId?: string | null) {
  return legId ?? `connection:${fromStopId}:${toStopId}`;
}
```

Translate at hash input/output only. Update `personalRoutePresentation()` to expose connection IDs without mutating the trip or changing route facts.

- [ ] **Step 4: Run identity, publication and handoff regressions**

Run: `node --experimental-strip-types --test tests/immersive-route-detail.test.ts tests/public-route-presentation.test.ts tests/personal-route.test.ts tests/public-route-handoff.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit canonical editorial identity**

```bash
git add app/journey/routes/[slug]/route-map-selection.ts app/journey/routes/[slug]/route-map-summary.tsx lib/easyt/personal-route.ts tests/immersive-route-detail.test.ts tests/personal-route.test.ts
git commit -m "refactor: canonicalize editorial map selection"
```

### Task 7: Migrate Route Detail camera, runtime and responsive padding

**Files:**
- Modify: `app/journey/routes/[slug]/route-live-map.tsx`
- Modify: `app/journey/routes/[slug]/route-map-summary.tsx`
- Modify: `app/journey/routes/[slug]/route-overview.module.css`
- Modify: `tests/immersive-route-detail.test.ts`
- Modify: `tests/public-route-presentation.test.ts`

**Interfaces:**
- Consumes: `EditorialJourneySelection`, shared `embedded`/`pan-zoom` runtime, targets, marker helpers and measured insets.
- Produces: `navigatorWidth`/occlusion input to `RouteLiveMap`; selected and subdued route-layer filters.

- [ ] **Step 1: Write failing camera and padding behavior tests**

Test these resolved requests directly: route uses all mapped coordinates; stop uses only its occurrence and zoom 8; connection uses only endpoints/relevant geometry; one mapped stop focuses; missing coordinates return no request. Add a resize test that changes right occlusion from 320 to 0 and keeps the same canonical selected connection.

- [ ] **Step 2: Run Route Detail tests and confirm fixed-padding/index failures**

Run: `node --experimental-strip-types --test tests/immersive-route-detail.test.ts tests/public-route-presentation.test.ts tests/map-surface-policy.test.ts`

Expected: FAIL because `RouteLiveMap` still uses fixed padding and index-based fit logic.

- [ ] **Step 3: Adopt shared runtime and marker construction**

Declare `{ variant: "embedded", interaction: "pan-zoom" }`, remove duplicated worker/style/control setup, keep attribution visible, remove compass, and create canonical stop markers through `createMorroviaStopMarker()`.

- [ ] **Step 4: Drive route layers and camera from canonical selection**

Resolve the selected entity by ID. Give the selected connection primary paint and set non-selected route geometry to the shared subdued paint. Call `applyMapCameraRequest()` for route, stop or connection; resize recomputes measured insets without resetting selection.

- [ ] **Step 5: Run Route Detail and sparse-route tests**

Run: `node --experimental-strip-types --test tests/immersive-route-detail.test.ts tests/public-route-presentation.test.ts tests/public-route-release.test.ts tests/route-visual-readiness.test.ts`

Expected: PASS, including public hashes, sparse routes and attribution.

- [ ] **Step 6: Commit editorial map migration**

```bash
git add app/journey/routes/[slug]/route-live-map.tsx app/journey/routes/[slug]/route-map-summary.tsx app/journey/routes/[slug]/route-overview.module.css tests/immersive-route-detail.test.ts tests/public-route-presentation.test.ts
git commit -m "feat: unify editorial map focus and padding"
```

### Task 8: Replace the dropdown with the responsive Journey navigator

**Files:**
- Modify: `app/journey/routes/[slug]/route-map-summary.tsx`
- Modify: `app/journey/routes/[slug]/route-overview.module.css`
- Modify: `app/journey/routes/[slug]/route-detail-view.stories.tsx`
- Modify: `app/journey/my-routes/[tripId]/personal-route-view.stories.tsx`
- Modify: `tests/public-route-presentation.test.ts`
- Modify: `tests/personal-route.test.ts`

**Interfaces:**
- Consumes: Task 6 canonical selection and hash serialization; Task 7 navigator occlusion measurement.
- Produces: one ordered desktop navigator and one compact mobile strip using the same button list and selection callback.

- [ ] **Step 1: Write failing navigator structure and activation tests**

Assert one `Whole journey` action, interleaved stop/connection buttons, `aria-current="location"`, no `EasyTSelect`, no duplicate `Whole route`, and stable repeated-stop keys. Verify click, Enter and Space produce the same canonical selection, focus remains on the initiating button, and hash entry focuses the map region rather than the canvas. Add story assertions for desktop and mobile navigator states.

- [ ] **Step 2: Run presentation tests and confirm dropdown/duplicate failures**

Run: `node --experimental-strip-types --test tests/public-route-presentation.test.ts tests/personal-route.test.ts`

Expected: FAIL while the native selector and duplicate whole-route actions remain.

- [ ] **Step 3: Build one shared ordered navigator item list**

```ts
type JourneyNavigatorItem = {
  selection: EditorialJourneySelection;
  label: string;
};

const items: JourneyNavigatorItem[] = [
  { selection: { kind: "route" }, label: "Whole journey" },
  ...stops.flatMap((stop, index) => [
    { selection: { kind: "stop", stopId: stop.id }, label: `${index + 1}. ${stop.name}` },
    ...(stop.onward ? [{ selection: { kind: "connection", connectionId: stop.onward.id }, label: `${stop.name} to ${stop.onward.to}` }] : []),
  ]),
];
```

Render it as the right-side desktop navigator and the horizontal mobile strip. Buttons replace the URL hash, preserve focus and update the same state used by map markers and content links.

- [ ] **Step 4: Remove duplicate controls and measure the desktop navigator**

Remove `EasyTSelect` and redundant whole-route buttons. Observe the navigator element with `ResizeObserver`, pass its current width as the RouteLiveMap right occlusion, and use zero navigator occlusion when the mobile strip is outside the map viewport.

- [ ] **Step 5: Run navigator, hash and Storybook contract tests**

Run: `node --experimental-strip-types --test tests/public-route-presentation.test.ts tests/immersive-route-detail.test.ts tests/personal-route.test.ts tests/storybook-visual-system.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the Journey navigator**

```bash
git add app/journey/routes/[slug]/route-map-summary.tsx app/journey/routes/[slug]/route-overview.module.css app/journey/routes/[slug]/route-detail-view.stories.tsx app/journey/my-routes/[tripId]/personal-route-view.stories.tsx tests/public-route-presentation.test.ts tests/personal-route.test.ts
git commit -m "feat: add responsive Journey map navigator"
```

### Task 9: Make saved-trip Journey first-class and correct its editorial header

**Files:**
- Modify: `components/easyt/trip-shell-client.tsx`
- Modify: `components/easyt/trip-overview-workspace.tsx`
- Modify: `app/journey/my-routes/[tripId]/page.tsx`
- Modify: `app/journey/my-routes/[tripId]/personal-route-view.tsx`
- Modify: `app/journey/my-routes/[tripId]/personal-route.module.css`
- Modify: `app/journey/my-routes/[tripId]/personal-route-view.stories.tsx`
- Modify: `lib/analytics.ts`
- Modify: `tests/personal-route.test.ts`
- Modify: `tests/map-trip-shell-presentation.test.ts`
- Modify: `tests/analytics.test.ts`

**Interfaces:**
- Consumes: existing `personalRouteHref(tripId)` as the canonical Journey destination.
- Produces: one Journey destination in the existing workspace nav and Overview action, plus privacy-safe `/journey/my-routes/[tripId]` pageview normalization.
- Consumes: existing TripShell trip ID/state, `EasyTNavigation logoTone="light"`, existing privacy-safe analytics.

- [ ] **Step 1: Write failing navigation, header and analytics tests**

Assert workspace order includes one `Journey` item pointing to `personalRouteHref(tripId)`, Overview has one `View journey` action in addition to `Explore on map`, the page passes `logoTone="light"`, and the hero-missing CSS remains dark enough for the light logo. In `tests/analytics.test.ts`, assert `normalizeAnalyticsPath("/journey/my-routes/trip-secret") === "/journey/my-routes/[tripId]"` and that no duplicate Journey-view event is introduced beyond the existing consent-gated pageview.

- [ ] **Step 2: Run focused tests and confirm missing Journey/light-logo failures**

Run: `node --experimental-strip-types --test tests/personal-route.test.ts tests/map-trip-shell-presentation.test.ts tests/analytics.test.ts`

Expected: FAIL because Journey is absent from `TripShellNavigation`, Overview uses the old action copy/state, and the page does not request the light logo.

- [ ] **Step 3: Add Journey to the existing navigation owner**

Add `{ id: "journey", label: "Journey", icon: Route, href: personalRouteHref(tripId) }` through the existing `views` mapping without adding a second navigation component or trip store. Extend analytics path normalization with an explicit `my-routes` branch that removes the opaque trip ID. Keep all existing workspace event names and rely on the existing consent-gated pageview for the editorial Journey view.

- [ ] **Step 4: Add the contextual Overview entry and light hero treatment**

Render **View journey** with `personalRouteHref(trip.id)` next to the existing functional map action. Pass `logoTone="light"` to the existing `EasyTNavigation`; update only the personal hero-missing background/contrast rules needed for the same white logo and light navigation treatment.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node --experimental-strip-types --test tests/personal-route.test.ts tests/map-trip-shell-presentation.test.ts tests/analytics.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Journey discoverability and header**

```bash
git add components/easyt/trip-shell-client.tsx components/easyt/trip-overview-workspace.tsx app/journey/my-routes/[tripId]/page.tsx app/journey/my-routes/[tripId]/personal-route-view.tsx app/journey/my-routes/[tripId]/personal-route.module.css app/journey/my-routes/[tripId]/personal-route-view.stories.tsx lib/analytics.ts tests/personal-route.test.ts tests/map-trip-shell-presentation.test.ts tests/analytics.test.ts
git commit -m "feat: make saved Journey a trip destination"
```

### Task 10: Complete Storybook, responsive and regression verification

**Files:**
- Modify: `components/easyt/trip-map-workspace.stories.tsx`
- Modify: `components/easyt/trip-transport-workspace.stories.tsx`
- Modify: `components/easyt/trip-stay-workspace.stories.tsx`
- Modify: `components/easyt/trip-itinerary-workspace.stories.tsx`
- Modify: `app/journey/routes/[slug]/route-detail-view.stories.tsx`
- Modify: `app/journey/my-routes/[tripId]/personal-route-view.stories.tsx`
- Modify: `components/easyt/storybook/morrovia-routes-discovery.stories.tsx`
- Modify: `tests/storybook-visual-system.test.ts`
- Modify: `tests/map-surface-consumers.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: explicit representative stories and the final verification record.

- [ ] **Step 1: Write the failing viewport/story matrix test**

For the relevant Map, Transport, Stay, Itinerary and editorial Journey owners, assert coverage of the exact shared viewport set:

```ts
const requiredViewports = ["morrovia320", "morrovia390", "morrovia430", "morrovia768", "morrovia1024", "morrovia1440"];
for (const viewport of requiredViewports) assert.match(joinedStories, new RegExp(`viewport: \\{ value: "${viewport}"`));
```

Also assert representative `workspace`, `embedded/selection-only`, `embedded/pan-zoom`, `preview`, unknown-transport, repeated-stop, sparse-route and map-unavailable stories exist.

- [ ] **Step 2: Run the story contract test and list missing states**

Run: `node --experimental-strip-types --test tests/storybook-visual-system.test.ts tests/map-surface-consumers.test.ts`

Expected: FAIL with the exact missing owner/state/viewport combinations.

- [ ] **Step 3: Add the minimum representative stories**

Reuse existing fixtures. Add only missing stories for the six required widths and interaction states; do not duplicate identical content fixtures. Include Japan/repeated Tokyo, India, Vietnam–Cambodia, Balkans, Portugal, sparse personal Journey and unknown transport.

- [ ] **Step 4: Run the complete focused #333 regression group**

Run:

```bash
node --experimental-strip-types --test \
  tests/map-surface-policy.test.ts \
  tests/map-runtime-and-markers.test.ts \
  tests/map-surface-consumers.test.ts \
  tests/map-camera-and-icons.test.ts \
  tests/map-basemap-presentation.test.ts \
  tests/map-spatial-context.test.ts \
  tests/map-trip-shell-presentation.test.ts \
  tests/map-result-selection.test.ts \
  tests/map-local-finder-selection.test.ts \
  tests/stay-workspace.test.ts \
  tests/itinerary-workspace-presentation.test.ts \
  tests/itinerary-transport-presentation.test.ts \
  tests/transport-workspace-browser.test.ts \
  tests/immersive-route-discovery.test.ts \
  tests/route-detail-discovery.test.ts \
  tests/immersive-route-detail.test.ts \
  tests/public-route-presentation.test.ts \
  tests/public-route-handoff.test.ts \
  tests/public-route-release.test.ts \
  tests/route-visual-readiness.test.ts \
  tests/personal-route.test.ts \
  tests/trip-workspace-links.test.ts \
  tests/analytics.test.ts \
  tests/storybook-visual-system.test.ts
```

Expected: PASS. If browser tests report skipped because `MORROVIA_BUILDER_BROWSER_TESTS` is unset, rerun them with `MORROVIA_BUILDER_BROWSER_TESTS=1` and record that result.

- [ ] **Step 5: Run static and production checks**

Run:

```bash
npm run lint
npm run typecheck
npm run audit:ui
npm run build:check
npm run build-storybook
```

Expected: every command exits 0.

- [ ] **Step 6: Visually verify the exact responsive matrix**

At **320, 390, 430, 768, 1024 and 1440 CSS pixels**, inspect Map, Transport, Stay, Itinerary, Discover, published Route Detail and personal Journey stories. Record pass/fail for:

| Check | 320 | 390 | 430 | 768 | 1024 | 1440 |
| --- | --- | --- | --- | --- | --- | --- |
| Selected geography clears visible rail/navigator | Pass required | Pass required | Pass required | Pass required | Pass required | Pass required |
| Attribution visible and unclipped | Pass required | Pass required | Pass required | Pass required | Pass required | Pass required |
| Controls match the declared variant/profile | Pass required | Pass required | Pass required | Pass required | Pass required | Pass required |
| Stop and transport marker states remain legible | Pass required | Pass required | Pass required | Pass required | Pass required | Pass required |
| Journey navigator/strip keeps active item visible | Pass required | Pass required | Pass required | Pass required | Pass required | Pass required |
| No horizontal page overflow or control collision | Pass required | Pass required | Pass required | Pass required | Pass required | Pass required |

Use Storybook's existing viewport names and capture any failure before changing code. Re-run the owning task's focused test after each correction.

- [ ] **Step 7: Verify repository scope and commit final coverage**

Run: `git diff --check && git status --short && git diff --stat 812604ebe162a9b81f36d90189ae99f73f6fc801...HEAD`

Confirm no content source, CMS, generated prose, unrelated route enrichment, deployment file or unrequested dependency changed.

```bash
git add components/easyt/trip-map-workspace.stories.tsx components/easyt/trip-transport-workspace.stories.tsx components/easyt/trip-stay-workspace.stories.tsx components/easyt/trip-itinerary-workspace.stories.tsx app/journey/routes/[slug]/route-detail-view.stories.tsx app/journey/my-routes/[tripId]/personal-route-view.stories.tsx components/easyt/storybook/morrovia-routes-discovery.stories.tsx tests/storybook-visual-system.test.ts tests/map-surface-consumers.test.ts
git commit -m "test: complete unified map verification matrix"
```

### Task 11: Final branch review and handoff

**Files:**
- Review only: all files changed since `812604ebe162a9b81f36d90189ae99f73f6fc801`

**Interfaces:**
- Consumes: Tasks 1–10 and the approved specification.
- Produces: a clean, reviewed branch ready for the user's chosen integration workflow.

- [ ] **Step 1: Run a requirement-by-requirement diff review**

Check the branch against every acceptance criterion in the specification, with particular attention to Builder remaining inert, Stay/Itinerary selection remaining live, selected-leg fit, public hashes, attribution, transport icon fallback and Journey discoverability.

- [ ] **Step 2: Run the final verification commands from a clean shell**

Run the focused regression group and all five static/production commands from Task 10 again if any code changed during review. Expected: PASS and a clean `git status --short`.

- [ ] **Step 3: Request code review before integration**

Use the `superpowers:requesting-code-review` skill for a whole-branch review against base `812604ebe162a9b81f36d90189ae99f73f6fc801`. Resolve findings test-first and repeat the owning focused checks.

- [ ] **Step 4: Stop before external mutation**

Report commits, verification evidence, known baseline history and any residual risk. Do not push, merge or deploy without a new explicit user instruction.

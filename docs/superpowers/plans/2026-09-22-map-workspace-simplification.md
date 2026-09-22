# Map Workspace Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the normal Trip Map viewport-dominant with one persistent desktop left rail, contextual detail only when useful, and the existing single mobile bottom-sheet owner.

**Architecture:** Keep `TripMapWorkspace`, `JourneyMapPlannerWorkspace`, `JourneyPlannerMap`, `JourneyPlannerStrip`, `finderDock`, and `mapContextualSurface` as the production owners. Remove the expansion-only presentation state, make the shell Map composition fill the useful viewport, use `finderDock` as the sole persistent desktop rail, and allow `canonicalPlannerStatus` to appear only for actionable status or explicit place/pin/transfer context. Preserve all map, selection, persistence, and provider behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, MapLibre GL, Node test runner, Storybook.

**Spec:** `docs/superpowers/specs/2026-09-22-map-workspace-simplification-design.md`

## Global Constraints

- Start from the current `codex/beta-hardening-batch-4` branch; do not fetch or reset to `origin/staging`.
- Preserve global Morrovia navigation and Trip workspace navigation.
- “Immersive” means viewport-dominant inside the existing Trip workspace, not browser fullscreen.
- Keep `JourneyPlannerStrip` persistently positioned at the top without adding a CSS `position: fixed` navigation layer.
- Keep exactly one MapLibre instance and the accepted #278 basemap lifecycle.
- Preserve the accepted #279 Stay / Eat / See list-marker-detail selection contract.
- Do not change homepage, Discover, or public Route map behavior from #319.
- Do not change provider, persistence, trip-model, or canonical mutation contracts.
- Do not add layers or search-this-area controls that do not already exist.
- Reuse Morrovia components and semantic tokens; do not introduce parallel rail, panel, tab, sheet, or map-control primitives.
- Write and run each focused regression before its production change, confirm the expected RED failure, then implement the minimum change to reach GREEN.
- Do not push, merge, or deploy.

## Review Focus

1. **Long route strip:** more stops than fit at 1440px must scroll horizontally without covering the rail or map controls; Task 1 keeps the existing strip owner and verifies the integrated strip contract.
2. **Long/partial finder content:** loading, partial-provider, empty, and long result lists must scroll inside the left rail without growing the page; Task 2 pins the rail overflow contract and Task 3 exercises a representative Stay result state.
3. **Selected detail near map controls:** explicit place, pin, or transfer context must remain dismissible and avoid the zoom controls and attribution; Task 2 establishes the contextual class contract and Task 4 checks the 1440px selected-result state.
4. **Healthy versus actionable status:** healthy state must remain quiet while warnings and recovery remain reachable without a second permanent rail; Task 2 tests both branches.
5. **Mobile return path:** closing selected detail at 390px must return to the existing finder/sheet state without clearing the provider result set; Task 3 preserves the selected-result Storybook fixture and Task 4 checks the interaction.

---

### Task 1: Make the normal Trip Map viewport-dominant and remove expansion mode

**Files:**
- Modify: `tests/map-trip-shell-presentation.test.ts`
- Modify: `components/journey-map-planner-workspace.tsx`
- Modify: `components/easyt/trip-map-workspace.stories.tsx`
- Modify: `components/easyt/trip-map-workspace.module.css`
- Modify: `app/journey/journey.module.css`

**Interfaces:**
- Consumes: `TripMapWorkspace`, `JourneyMapPlannerWorkspace`, `JourneyPlannerStrip`, `resetWholeRoute`, and the existing shell presentation.
- Produces: a normal shell Map composition with `--map-workspace-strip-height` and `--map-workspace-rail-width`, no `isExpandedMap` state, and no shell `onFullTrip` action.

- [ ] **Step 1: Replace the fullscreen presentation assertion with a viewport-dominant layout regression**

In `tests/map-trip-shell-presentation.test.ts`, replace the current expansion-specific assertions with a focused contract:

```ts
test("the normal Map workspace is viewport-dominant without a separate fullscreen mode", () => {
  assert.match(tripMapWorkspaceStylesSource, /width:\s*100vw/);
  assert.match(mapStylesSource, /--map-workspace-strip-height:\s*64px/);
  assert.match(mapStylesSource, /--map-workspace-rail-width:\s*clamp\(360px,[^,]+,420px\)/);
  assert.match(mapStylesSource, /height:\s*calc\(100svh - var\(--morrovia-navigation-height\)\)/);
  assert.doesNotMatch(mapWorkspaceSource, /isExpandedMap|toggleExpandedMap|closeExpandedMap/);
  assert.doesNotMatch(mapWorkspaceSource, /Fullscreen map|Exit fullscreen|onFullTrip=|fullTripExpanded=/);
  assert.doesNotMatch(mapStylesSource, /shellPlannerExpanded/);
});
```

Remove `isExpandedMap` from the camera-key expectation and update the existing “mobile navigation” test name so it asserts one mobile sheet owner rather than fullscreen exit coverage.

- [ ] **Step 2: Run the presentation test and confirm the expected RED failure**

Run:

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts
```

Expected: FAIL because the current code still contains `isExpandedMap`, the fullscreen action, expansion CSS, and the contained 720–860px shell height.

- [ ] **Step 3: Remove the expansion-only React state and history behavior**

In `components/journey-map-planner-workspace.tsx`:

- remove `expandedMap` from `JourneyMapPlannerWorkspaceProps["storyState"]` and remove the existing fullscreen-only Storybook exports and arguments that consume it;
- remove `isExpandedMap`, `expandedHistoryEntryRef`, `restoreExpandedControlFocus`, `closeExpandedMap`, `toggleExpandedMap`, and the expansion `popstate` effect;
- remove `isExpandedMap` from `cameraInteractionKey` and Escape handling;
- remove `showFullscreenDestination` and all class/visibility branches that depend on it;
- render the shell `JourneyPlannerStrip` without `onFullTrip`, `fullTripExpanded`, or a shell fullscreen label;
- retain `fullTripHref` for the non-shell focused presentation only;
- leave `resetWholeRoute`, destination selection, camera inputs, and MapLibre props unchanged.

Delete the shell expansion props from the existing strip call and retain these route-owner props:

```tsx
<JourneyPlannerStrip
  fullTripHref={isShellPresentation ? undefined : mapWorkspaceHref(customTrip.id)}
  fullTripLabel="Return to trip map"
  wholeRouteActive={mapMode === "overview"}
  onWholeRoute={resetWholeRoute}
  presentation={isShellPresentation ? "integrated" : "focused"}
/>
```

Keep the existing `containerRef`, `summary`, `stops`, `addStopHref`, `onSelectStop`, and `overflow` props and callbacks unchanged.

- [ ] **Step 4: Make the shell Map full-bleed and viewport-dominant**

In `components/easyt/trip-map-workspace.module.css`, replace the capped width and expansion exception with:

```css
.wideMap {
  width: 100vw;
  margin-left: 50%;
  transform: translateX(-50%);
}
```

Keep the existing mobile full-width behavior only if it still adds a distinct safe-area or overflow contract; otherwise remove the now-redundant media rule.

In `app/journey/journey.module.css`, replace the contained shell and expansion blocks with the normal shell variables and size:

```css
.canonicalPlanner.shellPlanner {
  --map-workspace-strip-height: 64px;
  --map-workspace-rail-width: clamp(360px, 28vw, 420px);
  isolation: isolate;
  width: 100%;
  height: calc(100svh - var(--morrovia-navigation-height));
  min-height: 680px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.shellPlanner :global(.journey-map),
.shellPlanner :global(.planner-map) {
  position: absolute !important;
  inset: var(--map-workspace-strip-height) 0 0 !important;
  width: 100% !important;
  height: auto !important;
}
```

Delete `.shellPlannerExpanded`, `.fullscreenDestination`, and expansion-specific descendants. Do not change the MapLibre lifecycle styles or map presentation module.

- [ ] **Step 5: Run the focused test and confirm GREEN**

Run:

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts
```

Expected: PASS, including the existing single-map, camera, route, keyboard, persistence, and mobile sheet tests.

- [ ] **Step 6: Commit the viewport-dominant shell change**

```bash
git add tests/map-trip-shell-presentation.test.ts components/journey-map-planner-workspace.tsx components/easyt/trip-map-workspace.stories.tsx components/easyt/trip-map-workspace.module.css app/journey/journey.module.css
git commit -m "feat(map): make trip workspace viewport dominant"
```

---

### Task 2: Establish one desktop rail and contextual detail/status ownership

**Files:**
- Modify: `tests/map-trip-shell-presentation.test.ts`
- Modify: `tests/map-local-finder-selection.test.ts`
- Modify: `components/journey-map-planner-workspace.tsx`
- Modify: `app/journey/journey.module.css`
- Modify: `app/journey/plan-map-docks.module.css` only if the desktop rules there still override the canonical shell composition.

**Interfaces:**
- Consumes: `finderDock`, `canonicalPlannerStatus`, `selectedMapResult`, `selectedPlannerPin`, `selectedRouteLeg`, `tripStatusExpanded`, `tripIssueCount`, `mapContextualSurface`, and the existing dismiss/focus callbacks.
- Produces: `mapDefaultContext` as a desktop-only quiet state; `finderDock` as the only persistent desktop rail; transient `mapPlaceContext`, `mapTransferContext`, or actionable `tripStatusExpanded` detail without a permanent right rail.

- [ ] **Step 1: Write failing ownership and layout regressions**

Add the following expectations to `tests/map-trip-shell-presentation.test.ts`:

```ts
test("desktop Map has one persistent left rail and only contextual secondary detail", () => {
  assert.match(mapWorkspaceSource, /styles\.mapDefaultContext/);
  assert.match(mapWorkspaceSource, /!tripStatusExpanded && !copilotOpen/);
  assert.match(mapWorkspaceSource, /tripIssueCount > 0/);
  assert.match(mapStylesSource, /\.shellPlanner \.finderDock\{[^}]*left:0!important[^}]*width:var\(--map-workspace-rail-width\)!important/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapDefaultContext\{display:none!important\}/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapPlaceContext[^}]*position:absolute!important/);
  assert.doesNotMatch(mapStylesSource, /\.shellPlanner:not\(\.shellPlannerExpanded\)[\s\S]*right:18px!important;[\s\S]*width:clamp\(350px,24vw,400px\)!important/);
});
```

Replace the wide-desktop three-panel assertion in `tests/map-local-finder-selection.test.ts` with:

```ts
assert.match(css, /--map-workspace-rail-width:\s*clamp\(360px,[^,]+,420px\)/);
assert.match(css, /\.shellPlanner \.finderDock\{[^}]*overflow:hidden!important/);
assert.match(css, /\.finderDockStay \.restaurantFinder[^}]*overflow-y:auto/);
```

- [ ] **Step 2: Run both focused files and confirm RED for the current right-rail composition**

Run:

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts
```

Expected: FAIL because the current 1180px rules place `finderDock` on the right, keep `canonicalPlannerStatus` permanently visible on the left, and expose healthy status as a panel.

- [ ] **Step 3: Make ordinary context quiet and actionable status explicit**

In `components/journey-map-planner-workspace.tsx`, derive the desktop presentation state without changing canonical selections:

```ts
const hasExplicitMapContext = Boolean(selectedLocalPlace || selectedPlannerPin || selectedRouteLeg);
const showShellContext = Boolean(
  !tripStatusExpanded
  && !copilotOpen
  && (wholeRouteMapContext || hasExplicitMapContext || mapMode === "detail"),
);
const defaultMapContext = Boolean(
  isShellPresentation
  && !tripStatusExpanded
  && !hasExplicitMapContext,
);
```

Add `styles.mapDefaultContext` to `canonicalPlannerStatus` when `defaultMapContext` is true. Keep ordinary overview/destination content available to the mobile `mapContextualSurface`; CSS, not state deletion, makes it quiet on desktop.

Render the existing `mobileTripStatus` trigger in the finder header only when action is required:

```tsx
{customTrip && tripIssueCount > 0 ? (
  <details
    className={styles.mobileTripStatus}
    open={tripStatusExpanded}
    onToggle={(event) => setTripStatusExpanded(event.currentTarget.open)}
  >
    <summary>
      <span>{language === "es" ? "Estado del viaje" : "Trip status"}</span>
      <b>{tripIssueCount} {tripIssueCount === 1 ? "issue" : "issues"}</b>
    </summary>
  </details>
) : null}
```

Retain the existing Spanish plural handling if present. Do not change save/recovery feedback, which remains independently visible when action is required.

- [ ] **Step 4: Replace desktop three-panel CSS with the single-rail composition**

Within the canonical `@media (min-width: 981px)` shell rules in `app/journey/journey.module.css`:

```css
.shellPlanner .finderDock {
  position: absolute !important;
  top: var(--map-workspace-strip-height) !important;
  right: auto !important;
  bottom: 0 !important;
  left: 0 !important;
  display: flex !important;
  width: var(--map-workspace-rail-width) !important;
  height: auto !important;
  max-height: none !important;
  overflow: hidden !important;
  border-width: 0 1px 0 0 !important;
  border-radius: 0 !important;
  transform: none !important;
}

.shellPlanner .mapDefaultContext {
  display: none !important;
}

.shellPlanner .canonicalPlannerStatus.tripStatusExpanded {
  top: var(--map-workspace-strip-height) !important;
  right: auto !important;
  bottom: 0 !important;
  left: 0 !important;
  width: var(--map-workspace-rail-width) !important;
  max-width: none !important;
  max-height: none !important;
}

.shellPlanner .mapPlaceContext,
.shellPlanner .mapTransferContext {
  position: absolute !important;
  top: auto !important;
  right: 18px !important;
  bottom: 18px !important;
  left: auto !important;
  width: min(330px, calc(100% - var(--map-workspace-rail-width) - 54px)) !important;
  max-width: 330px !important;
  max-height: calc(100% - var(--map-workspace-strip-height) - 36px) !important;
  overflow-y: auto !important;
}

.shellPlanner :global(.planner-map .maplibregl-ctrl-top-right) {
  top: 14px !important;
  right: 18px !important;
}
```

Make `.mobileTripStatus` visible in the desktop rail only when rendered, while retaining its current mobile treatment. Keep `shapeDayPlan`, Stay/Eat finder results, and See content internally scrollable.

Delete the `@media(min-width:1180px)` rules that swap the status and finder into left/right rails. Remove any desktop offsets in `plan-map-docks.module.css` that contradict this owner; keep its `max-width:980px` bottom-sheet rules unchanged.

- [ ] **Step 5: Preserve contextual dismissal and marker/list state**

Verify the JSX retains:

```tsx
onMapResultSelect={(place) => {
  setMobileShapeDayOpen(false);
  selectMapResult(place);
}}
```

and the existing explicit close callbacks:

```tsx
onClose={clearSelectedLocalPlace}
```

Do not unmount `JourneyLocalFinder` when `selectedMapResult` changes. Keep `restoreMapMarkerFocus`, Escape cleanup, and the result `selectionId` unchanged.

- [ ] **Step 6: Run both focused files and confirm GREEN**

Run:

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts
```

Expected: PASS with the existing result selection, keyboard cleanup, mobile sheet, and responsive finder assertions intact.

- [ ] **Step 7: Commit the single-rail ownership change**

```bash
git add tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts components/journey-map-planner-workspace.tsx app/journey/journey.module.css app/journey/plan-map-docks.module.css
git commit -m "feat(map): consolidate planning into one left rail"
```

If `app/journey/plan-map-docks.module.css` is unchanged, omit it from `git add`.

---

### Task 3: Align representative Storybook states with the simplified workspace

**Files:**
- Modify: `components/easyt/trip-map-workspace.stories.tsx`
- Modify: `tests/map-local-finder-selection.test.ts`
- Modify: `tests/map-trip-shell-presentation.test.ts`

**Interfaces:**
- Consumes: the existing `trip`, `goldenTriangleTrip`, `providerPlaces`, `DetailedBasemap`, and 1440px/390px Storybook viewport globals.
- Produces: deterministic whole-route, selected-destination, Stay-results, and selected-result stories after Task 1 removed the obsolete `expandedMap` fixtures.

- [ ] **Step 1: Write failing representative-state assertions**

Update the story assertions to require this minimum matrix:

```ts
for (const story of [
  "MapWorkspaceDesktop1440WholeRoute",
  "MapWorkspaceDesktop1440Destination",
  "MapWorkspaceDesktop1440StayResults",
  "MapWorkspaceDesktop1440SelectedStay",
  "MapWorkspaceMobile390WholeRoute",
  "MapWorkspaceMobile390SelectedStay",
]) {
  assert.match(mapStoriesSource, new RegExp(`export const ${story}`), story);
}
assert.doesNotMatch(mapStoriesSource, /Fullscreen|expandedMap/);
```

Keep broader existing viewport stories unless they exist only to demonstrate the removed fullscreen mode.

- [ ] **Step 2: Run the focused tests and confirm RED because the new representative names do not exist**

Run:

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts
```

Expected: FAIL on the representative Storybook state assertions because the approved state names do not yet exist.

- [ ] **Step 3: Replace expansion stories with the approved risk-based matrix**

In `components/easyt/trip-map-workspace.stories.tsx`, add or alias deterministic stories using production owners:

```ts
export const MapWorkspaceDesktop1440WholeRoute: Story = {
  ...GoldenTriangle,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "overview" } },
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};

export const MapWorkspaceDesktop1440Destination: Story = {
  ...DetailedBasemap,
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};

export const MapWorkspaceDesktop1440StayResults: Story = {
  ...DetailedBasemap,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "detail", shapeDayTab: "stay" } },
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};

export const MapWorkspaceDesktop1440SelectedStay: Story = {
  ...DetailedBasemap,
  args: {
    storyTrip: goldenTriangleTrip,
    storyState: {
      mapMode: "detail",
      shapeDayTab: "stay",
      localPlaces: [providerPlaces.hotel],
      selectedLocalPlaceId: providerPlaces.hotel.id,
    },
  },
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};

export const MapWorkspaceMobile390WholeRoute: Story = {
  ...GoldenTriangle,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "overview" } },
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const MapWorkspaceMobile390SelectedStay: Story = {
  ...DetailedBasemap,
  args: {
    storyTrip: goldenTriangleTrip,
    storyState: {
      mapMode: "detail",
      shapeDayTab: "stay",
      localPlaces: [providerPlaces.hotel],
      selectedLocalPlaceId: providerPlaces.hotel.id,
      mobileSheetSize: "medium",
    },
  },
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};
```

Reuse the existing fixtures and decorators; do not introduce a story-only recreation of the Map workspace.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run:

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts
```

Expected: PASS with no `expandedMap` or fullscreen story contract remaining.

- [ ] **Step 5: Commit representative states**

```bash
git add components/easyt/trip-map-workspace.stories.tsx tests/map-local-finder-selection.test.ts tests/map-trip-shell-presentation.test.ts
git commit -m "test(map): cover simplified workspace states"
```

---

### Task 4: Run the risk-based #312 verification gate

**Files:**
- Verify only; modify production files only if a focused check exposes a concrete regression, restarting the relevant task at RED.

**Interfaces:**
- Consumes: the completed #312 commits and the accepted #278/#279/#319 baseline.
- Produces: recorded evidence for the representative desktop/mobile composition, one reliability regression, type safety, and a clean diff.

- [ ] **Step 1: Run the focused Map presentation and selection suite**

```bash
node --experimental-strip-types --test tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts tests/map-result-selection.test.ts
```

Expected: PASS. This covers the shell composition, one-rail ownership, bottom-sheet ownership, and exact Stay/Eat/See selection projection.

- [ ] **Step 2: Run one accepted Map reliability regression**

```bash
node --experimental-strip-types --test --test-name-pattern="provider errors recover to local geography" tests/map-basemap-presentation.test.ts
```

Expected: the named provider-fallback regression passes; unrelated tests in the file may be reported as skipped by the name filter.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 4: Verify the representative 1440px states**

Open the production Map Storybook stories at 1440px and inspect:

- `MapWorkspaceDesktop1440WholeRoute` — route strip at top, one 360–420px left rail, no permanent right rail, whole route readable;
- `MapWorkspaceDesktop1440Destination` — selected destination and Plan rail remain coherent;
- `MapWorkspaceDesktop1440StayResults` — results scroll inside the rail while the map remains pannable;
- `MapWorkspaceDesktop1440SelectedStay` — selection is visible in list and marker, detail is dismissible, and map controls/marker remain unobscured.

Expected: no horizontal page scroll, no duplicated contextual owner, and no blank map canvas.

- [ ] **Step 5: Verify the representative 390px states**

Open the production Map Storybook stories at 390px and inspect:

- `MapWorkspaceMobile390WholeRoute` — map plus one bottom sheet with reachable whole-route control;
- `MapWorkspaceMobile390SelectedStay` — selected detail uses the existing sheet, closes back to results, and retains the selected destination/result set.

Expected: the sheet supports peek/medium/expanded controls, does not create a second mobile panel, and leaves a recoverable map area.

- [ ] **Step 6: Apply the conditional UI/Storybook checks only because the planned diff touches those contracts**

The planned implementation changes shared Map CSS and production Storybook stories, so run:

```bash
npm run audit:ui
npm run build-storybook
```

Expected: both exit 0. If implementation avoids changing the Storybook file, omit `npm run build-storybook`. If implementation avoids shared/design-system CSS changes, omit `npm run audit:ui`. Do not add short-phone, landscape, or tablet manual passes unless a focused check fails or the final diff changes their media-query contracts.

- [ ] **Step 7: Check the final diff and worktree**

```bash
git diff --check
git status --short
git log --oneline --decorate -6
```

Expected: `git diff --check` exits 0; status contains only intentional uncommitted verification artifacts, preferably none; the #312 commits follow the accepted Batch 4 reliability and spec commits.

- [ ] **Step 8: Commit any verification-only fixture correction**

Only if verification required a Storybook fixture or test correction that did not alter product behavior:

```bash
git add components/easyt/trip-map-workspace.stories.tsx tests/map-trip-shell-presentation.test.ts tests/map-local-finder-selection.test.ts
git commit -m "test(map): finalize simplification acceptance"
```

If no files changed during verification, do not create an empty commit.

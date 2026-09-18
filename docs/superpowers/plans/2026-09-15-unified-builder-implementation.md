# Unified Trip Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Builder's two visible stages with one responsive route workspace while preserving `TripBuilderDocument` as the sole canonical state, persistence, recovery, CAS and build owner.

**Architecture:** Keep `TripBuilderDocument` in `app/journey/new/trip-builder.tsx` as the container. Extract pure route-order and document-commit guards into `lib/easyt/`, and extract controlled presentation into Builder-local components. The map remains a projection of canonical or drag-preview state. Drag, the accessible move fallback and Route Check all submit stable stop-occurrence ID permutations to one validated canonical reorder boundary.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, MapLibre through the existing `JourneyPlannerMap`, Node's built-in test runner, Storybook.

**Spec:** `docs/superpowers/specs/2026-09-15-unified-builder-design.md`

## Global Constraints

- `TripBuilderDocument` remains the single canonical state owner. Do not add another orchestration hook, reducer, persistence path or section-level dirty state.
- Direct `/journey/new` renders one unified empty state with **Describe your trip**, **Add your first place**, and subordinate **Import existing trip** paths until a useful canonical route skeleton exists. Never show the retired mandatory Step 1–2 intake page or an empty route table/map.
- Homepage and route-template handoffs with a useful route bypass empty capture. Ambiguous handoffs remain inside Builder clarification.
- `/journey/new/import` remains a protected external workflow; the Builder only links to it and does not replace its parsing, review, recovery, save or confirmed-trip navigation owners.
- `JourneyEndSelection`, including `Same as start`, remains first-class. Origin and journey end are endpoint context and must not automatically become night-bearing route rows.
- Stop identity is always the stable stop-occurrence `id`; never key selection, movement or persistence by destination name.
- Construct and validate a complete next Builder document before committing it through one logical canonical mutation boundary. React batching is not the atomicity guarantee.
- Drag preview is transient. Route Check keeps canonical row/marker order and uses a separate proposal overlay. Cancelled, stale and invalid interactions have zero persistence side effects.
- Reuse `MorroviaTripCapture`, `JourneyEndpointsEditor`, `JourneyPlannerMap`, shared Morrovia controls, status treatments and design tokens before creating any new primitive.
- Do not add a drag-and-drop dependency. Use pointer/keyboard semantics around the existing row/grip pattern and retain an explicit `Move stop` action in the row menu for touch and assistive use.
- Do not change `buildInvariant`, save/build ownership, recovery classification, CAS, route-scoring, night allocation or downstream workspace semantics.
- Keep map failure non-blocking: route editing and building must continue with a truthful fallback.
- Use the isolated worktree only. Do not touch the dirty primary checkout. Do not push staging or main as part of implementation unless separately authorized.

---

## Task 1: Add the shared stop-order validation boundary

**Files:**

- Create: `lib/easyt/trip-builder-order.ts`
- Create: `tests/trip-builder-order.test.ts`

- [ ] **Step 1: Write failing tests for stable occurrence-ID permutations**

Create `tests/trip-builder-order.test.ts` with fixtures that deliberately repeat destination names but use distinct IDs:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  builderStopOrderFingerprint,
  validateBuilderStopOrder,
} from "../lib/easyt/trip-builder-order.ts";

const stops = [
  { id: "tokyo-1", place: "Tokyo" },
  { id: "kyoto-1", place: "Kyoto" },
  { id: "tokyo-2", place: "Tokyo" },
];

test("accepts an exact occurrence-ID permutation with repeated destinations", () => {
  const result = validateBuilderStopOrder(stops, ["tokyo-2", "kyoto-1", "tokyo-1"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.stops.map((stop) => stop.id), ["tokyo-2", "kyoto-1", "tokyo-1"]);
});

test("rejects duplicate, missing and unknown occurrence IDs", () => {
  assert.deepEqual(validateBuilderStopOrder(stops, ["tokyo-1", "tokyo-1", "tokyo-2"]), {
    ok: false,
    reason: "duplicate-id",
  });
  assert.deepEqual(validateBuilderStopOrder(stops, ["tokyo-1", "kyoto-1"]), {
    ok: false,
    reason: "length-mismatch",
  });
  assert.deepEqual(validateBuilderStopOrder(stops, ["tokyo-1", "kyoto-1", "osaka-1"]), {
    ok: false,
    reason: "unknown-id",
  });
});

test("rejects a stale source fingerprint and locked-stop displacement", () => {
  assert.deepEqual(
    validateBuilderStopOrder(stops, ["kyoto-1", "tokyo-1", "tokyo-2"], {
      expectedFingerprint: "stale",
      lockedStopIds: ["kyoto-1"],
    }),
    { ok: false, reason: "stale-source" },
  );
  assert.deepEqual(
    validateBuilderStopOrder(stops, ["kyoto-1", "tokyo-1", "tokyo-2"], {
      expectedFingerprint: builderStopOrderFingerprint(stops),
      lockedStopIds: ["kyoto-1"],
    }),
    { ok: false, reason: "locked-stop" },
  );
});

test("treats unchanged and globally fixed orders as non-mutations", () => {
  assert.deepEqual(validateBuilderStopOrder(stops, stops.map(({ id }) => id)), {
    ok: false,
    reason: "same-order",
  });
  assert.deepEqual(
    validateBuilderStopOrder(stops, ["kyoto-1", "tokyo-1", "tokyo-2"], { fixedOrder: true }),
    { ok: false, reason: "fixed-order" },
  );
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module is absent**

Run:

```bash
node --experimental-strip-types --test tests/trip-builder-order.test.ts
```

Expected: `ERR_MODULE_NOT_FOUND` for `lib/easyt/trip-builder-order.ts`.

- [ ] **Step 3: Implement the pure validator**

Create `lib/easyt/trip-builder-order.ts` with this public contract:

```ts
export type BuilderStopOrderRejection =
  | "same-order"
  | "length-mismatch"
  | "duplicate-id"
  | "unknown-id"
  | "missing-id"
  | "stale-source"
  | "fixed-order"
  | "locked-stop";

export type BuilderStopOrderResult<T> =
  | { ok: true; ids: string[]; stops: T[] }
  | { ok: false; reason: BuilderStopOrderRejection };

export function builderStopOrderFingerprint(
  items: readonly ({ id: string } | string)[],
): string;

export function validateBuilderStopOrder<T extends { id: string }>(
  current: readonly T[],
  proposedIds: readonly string[],
  options?: {
    expectedFingerprint?: string;
    lockedStopIds?: readonly string[];
    fixedOrder?: boolean;
  },
): BuilderStopOrderResult<T>;
```

Implementation order must be deterministic: stale fingerprint, length, duplicates, unknown IDs, missing IDs, unchanged order, fixed order, locked positions, success. A locked stop is valid only when its proposed index equals its current index. The success result must reuse the original stop objects and reorder them through an ID lookup.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node --experimental-strip-types --test tests/trip-builder-order.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit the validation boundary**

```bash
git add lib/easyt/trip-builder-order.ts tests/trip-builder-order.test.ts
git commit -m "feat: validate builder stop order by occurrence"
```

---

## Task 2: Replace workflow steps with one-time URL focus and the source-aware empty state

**Files:**

- Create: `lib/easyt/trip-builder-view.ts`
- Create: `tests/trip-builder-view.test.ts`
- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `tests/trip-builder-layout.test.ts`

- [ ] **Step 1: Write failing compatibility tests**

Create `tests/trip-builder-view.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalBuilderUrl,
  initialBuilderFocus,
} from "../lib/easyt/trip-builder-view.ts";

test("maps legacy step URLs to one-time focus targets", () => {
  assert.equal(initialBuilderFocus(new URLSearchParams("step=0")), "trip-details");
  assert.equal(initialBuilderFocus(new URLSearchParams("step=1")), "route-workspace");
  assert.equal(initialBuilderFocus(new URLSearchParams("step=route")), "route-workspace");
  assert.equal(initialBuilderFocus(new URLSearchParams("source=home")), null);
});

test("removes only the legacy step parameter from the canonical URL", () => {
  assert.equal(
    canonicalBuilderUrl(new URL("https://morrovia.com/journey/new?step=1&trip=abc#route")),
    "/journey/new?trip=abc#route",
  );
});
```

Update `tests/trip-builder-layout.test.ts` so it asserts source-level contracts rather than `Step 1`/`Step 2` rendering:

- `MorroviaTripCapture` remains the no-route rendering path.
- direct entry exposes **Describe your trip**, **Add your first place**, and a subordinate `/journey/new/import` link without reproducing the old full intake form.
- homepage/template handoffs with a useful route skip the empty state; area-only/ambiguous handoffs stay in clarification.
- populated Builder markup contains both `data-builder-section="trip-details"` and `data-builder-section="route-workspace"` without `step ===` branches.
- the route workspace is not rendered from the no-route capture branch.
- legacy `step` is read only by `initialBuilderFocus` and then removed with `history.replaceState`.
- the existing import page continues to expose CSV/XLSX/pasted-table review and its Back link resolves to `/journey/new`.

- [ ] **Step 2: Run the two focused test files and confirm failure**

```bash
node --experimental-strip-types --test tests/trip-builder-view.test.ts tests/trip-builder-layout.test.ts
```

Expected: the new helper is missing and old step assertions fail.

- [ ] **Step 3: Implement one-time URL compatibility**

Create `lib/easyt/trip-builder-view.ts`:

```ts
export type BuilderInitialFocus = "trip-details" | "route-workspace" | null;

export function initialBuilderFocus(params: URLSearchParams): BuilderInitialFocus {
  const step = params.get("step");
  if (step === "0" || step === "details" || step === "capture") return "trip-details";
  if (step === "1" || step === "route" || step === "review") return "route-workspace";
  return null;
}

export function canonicalBuilderUrl(url: URL): string {
  const next = new URL(url.toString());
  next.searchParams.delete("step");
  return `${next.pathname}${next.search}${next.hash}`;
}
```

In `TripBuilderDocument`:

- remove `step` as a persistent React state and remove step navigation controls;
- read the initial focus once after hydration, scroll/focus the matching section once, then call `window.history.replaceState` with `canonicalBuilderUrl`;
- preserve homepage handoff hydration exactly as today;
- define the route-skeleton boundary as at least one valid canonical stop occurrence (`stops.some(stop => stop.id && stop.name.trim())`), not origin/end alone;
- while there is no useful route skeleton, render the unified empty state: compose the current `MorroviaTripCapture`, a canonical first-place selector and a visually subordinate `EasyTLinkButton` to `/journey/new/import`; do not mount route rows or `JourneyPlannerMap`;
- keep import as navigation to the existing page, not a modal, embedded parser or duplicated persistence owner;
- bypass the empty state when homepage or route-template hydration already supplies a useful route skeleton; keep unresolved area-only handoffs in the existing clarification path;
- once the skeleton exists, render the details summary/editor and route workspace in one document.

- [ ] **Step 4: Run compatibility, layout and baseline Builder gates**

```bash
node --experimental-strip-types --test tests/trip-builder-view.test.ts tests/trip-builder-layout.test.ts
npm run test:builder-gate
```

Expected: all tests pass; the existing Builder gate remains green.

- [ ] **Step 5: Commit the unified shell**

```bash
git add lib/easyt/trip-builder-view.ts tests/trip-builder-view.test.ts app/journey/new/trip-builder.tsx tests/trip-builder-layout.test.ts
git commit -m "feat: unify builder workflow shell"
```

---

## Task 3: Add atomic trip-details editing with first-class journey endpoints

**Files:**

- Create: `lib/easyt/trip-builder-document-commit.ts`
- Create: `tests/trip-builder-document-commit.test.ts`
- Create: `app/journey/new/trip-builder-details-editor.tsx`
- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `tests/journey-endpoints.test.ts`
- Modify: `tests/trip-builder-gate.test.ts`

- [ ] **Step 1: Write failing tests for the logical document mutation guard**

Create `tests/trip-builder-document-commit.test.ts` using existing `EasyTTrip` fixtures and this contract:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  builderDocumentFingerprint,
  prepareBuilderDocumentCommit,
} from "../lib/easyt/trip-builder-document-commit.ts";
import { tripFromBuilder, type BuilderTripInput } from "../lib/easyt/trip.ts";

function fixtureTrip(overrides: Partial<BuilderTripInput> = {}) {
  const stops: BuilderTripInput["stops"] = [
    { id: "tokyo-1", name: "Tokyo", country: "Japan" },
    { id: "kyoto-1", name: "Kyoto", country: "Japan" },
  ];
  return tripFromBuilder({
    id: "builder-document-commit",
    origin: "London",
    journeyEnd: { mode: "unknown" },
    stops,
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: Object.fromEntries(stops.map((stop) => [stop.id, 1])),
    draft: [],
    ...overrides,
  });
}

test("accepts one complete valid next document", () => {
  const current = fixtureTrip({
    origin: "London",
    journeyEnd: { mode: "same_as_start" },
    stops: [{ id: "busan-1", name: "Busan", country: "South Korea" }],
    nightAllocations: { "busan-1": 3 },
  });
  const proposed = { ...current, travellers: 2 };
  const result = prepareBuilderDocumentCommit({
    current,
    proposed,
    expectedFingerprint: builderDocumentFingerprint(current),
    validate: () => true,
  });
  assert.deepEqual(result, { ok: true, document: proposed });
});

test("rejects stale and invalid drafts without returning a partial document", () => {
  const current = fixtureTrip();
  const proposed = { ...current, travellers: 4 };
  assert.deepEqual(
    prepareBuilderDocumentCommit({ current, proposed, expectedFingerprint: "stale", validate: () => true }),
    { ok: false, reason: "stale-source" },
  );
  assert.deepEqual(
    prepareBuilderDocumentCommit({
      current,
      proposed,
      expectedFingerprint: builderDocumentFingerprint(current),
      validate: () => false,
    }),
    { ok: false, reason: "invalid-document" },
  );
});

test("keeps origin and journey end out of night-bearing stops", () => {
  const proposed = fixtureTrip({
    origin: "London",
    journeyEnd: { mode: "explicit", place: { name: "Busan" } },
    stops: [{ id: "seoul-1", name: "Seoul", country: "South Korea" }],
    nightAllocations: { "seoul-1": 4 },
  });
  const result = prepareBuilderDocumentCommit({
    current: proposed,
    proposed,
    expectedFingerprint: builderDocumentFingerprint(proposed),
    validate: () => true,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.document.stops.map((stop) => stop.name), ["Seoul"]);
});
```

Use the repository's existing trip fixture builder rather than introducing a second fixture model; if no exported fixture exists, define the smallest valid `EasyTTrip` fixture in this test file.

Extend `tests/journey-endpoints.test.ts` and `tests/trip-builder-gate.test.ts` with:

- origin London, stop Busan, end `same_as_start` produces endpoint legs but only Busan is night-bearing;
- explicit Busan journey end does not append another Busan stop;
- changing the end selection never silently changes the ordered stop-occurrence IDs.

- [ ] **Step 2: Confirm the new guard tests fail**

```bash
node --experimental-strip-types --test tests/trip-builder-document-commit.test.ts tests/journey-endpoints.test.ts tests/trip-builder-gate.test.ts
```

Expected: module-not-found for the new commit guard and new endpoint assertions fail until wired.

- [ ] **Step 3: Implement the complete-document commit guard**

Create `lib/easyt/trip-builder-document-commit.ts`:

```ts
import type { EasyTTrip } from "./trip";

export type BuilderDocumentCommitResult =
  | { ok: true; document: EasyTTrip }
  | { ok: false; reason: "stale-source" | "invalid-document" };

export function builderDocumentFingerprint(trip: EasyTTrip): string;

export function prepareBuilderDocumentCommit(input: {
  current: EasyTTrip;
  proposed: EasyTTrip;
  expectedFingerprint: string;
  validate: (trip: EasyTTrip) => boolean;
}): BuilderDocumentCommitResult;
```

The fingerprint must cover the canonical editable document fields used by the Builder: origin, `journeyEnd`, ordered stop occurrences and nights, dates, travellers, budget/intent and structured brief. Do not include derived legs, transient status, timestamps or map selection. Use deterministic JSON serialization of an explicitly constructed object, not `JSON.stringify(trip)`.

- [ ] **Step 4: Build the controlled details editor using existing controls**

Create `app/journey/new/trip-builder-details-editor.tsx` as a controlled disclosure:

```ts
export type TripBuilderDetailsDraft = {
  origin: JourneyEndpointPlace;
  journeyEnd: JourneyEndSelection;
  stops: BuilderTripInput["stops"];
  startDate: string;
  endDate: string;
  travellers: number;
  budget: BuilderTripInput["budget"];
  intent: BuilderTripInput["intent"];
  structuredBrief: StructuredTripBrief;
};

type TripBuilderDetailsEditorProps = {
  value: TripBuilderDetailsDraft;
  sourceFingerprint: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCommit: (draft: TripBuilderDetailsDraft, sourceFingerprint: string) => Promise<void>;
};
```

Requirements:

- initialize a local draft only when the disclosure opens;
- reuse `JourneyEndpointsEditor` for origin and `JourneyEndSelection`, including `Same as start`;
- use the current destination lookup, date picker, traveller and more-details controls;
- show destinations as editable stop occurrences with `Add stop`; do not add the homepage natural-language description field;
- Cancel discards the draft and performs no canonical setter or persistence call;
- Save resolves any pending place lookups into the draft first, constructs one complete proposed `EasyTTrip` through the existing `tripFromBuilder`/preservation helpers, validates it with the existing Builder invariant, calls `prepareBuilderDocumentCommit`, and only then invokes one parent `commitTripDetailsDocument(document)` boundary;
- if validation or the source fingerprint fails, leave the canonical document unchanged and keep the editor open with an actionable error.

The parent commit boundary may internally update existing React fields, but it must contain no `await` between partial setters and must be the only path invoked after the complete document passes validation.

- [ ] **Step 5: Run endpoint, commit and Builder gates**

```bash
node --experimental-strip-types --test tests/trip-builder-document-commit.test.ts tests/journey-endpoints.test.ts tests/trip-builder-gate.test.ts tests/trip-builder-layout.test.ts
npm run typecheck
```

Expected: all tests and typecheck pass.

- [ ] **Step 6: Commit atomic details editing**

```bash
git add lib/easyt/trip-builder-document-commit.ts tests/trip-builder-document-commit.test.ts app/journey/new/trip-builder-details-editor.tsx app/journey/new/trip-builder.tsx tests/journey-endpoints.test.ts tests/trip-builder-gate.test.ts
git commit -m "feat: edit builder trip details atomically"
```

---

## Task 4: Build the route workspace and canonical/preview projection

**Files:**

- Create: `lib/easyt/trip-builder-route-preview.ts`
- Create: `tests/trip-builder-route-preview.test.ts`
- Create: `app/journey/new/trip-builder-route-workspace.tsx`
- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `tests/trip-builder-layout.test.ts`

- [ ] **Step 1: Write failing route-preview tests**

Create `tests/trip-builder-route-preview.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildBuilderRoutePreview } from "../lib/easyt/trip-builder-route-preview.ts";
import { tripFromBuilder, type BuilderTripInput } from "../lib/easyt/trip.ts";

function fixtureTrip(overrides: Partial<BuilderTripInput> = {}) {
  const stops: BuilderTripInput["stops"] = [
    { id: "tokyo-1", name: "Tokyo", country: "Japan" },
    { id: "kyoto-1", name: "Kyoto", country: "Japan" },
    { id: "tokyo-2", name: "Tokyo", country: "Japan" },
  ];
  return tripFromBuilder({
    id: "builder-route-preview",
    origin: "London",
    journeyEnd: { mode: "same_as_start" },
    stops,
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: { "tokyo-1": 3, "kyoto-1": 2, "tokyo-2": 1 },
    draft: [],
    ...overrides,
  });
}

test("reorders occurrences and re-derives legs without mutating the canonical trip", () => {
  const canonical = fixtureTrip({
    origin: "London",
    journeyEnd: { mode: "same_as_start" },
    stops: [
      { id: "tokyo-1", name: "Tokyo", country: "Japan" },
      { id: "kyoto-1", name: "Kyoto", country: "Japan" },
      { id: "tokyo-2", name: "Tokyo", country: "Japan" },
    ],
    nightAllocations: { "tokyo-1": 3, "kyoto-1": 2, "tokyo-2": 1 },
  });
  const preview = buildBuilderRoutePreview(canonical, ["tokyo-2", "kyoto-1", "tokyo-1"]);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.deepEqual(preview.trip.stops.map(({ id }) => id), ["tokyo-2", "kyoto-1", "tokyo-1"]);
  assert.deepEqual(canonical.stops.map(({ id }) => id), ["tokyo-1", "kyoto-1", "tokyo-2"]);
  assert.equal(preview.trip.brief.origin, "London");
  assert.equal(preview.trip.brief.journeyEnd?.mode, "same_as_start");
});

test("returns a rejection rather than a partial preview for an invalid permutation", () => {
  const canonical = fixtureTrip();
  assert.deepEqual(buildBuilderRoutePreview(canonical, ["missing"]), {
    ok: false,
    reason: "length-mismatch",
  });
});
```

- [ ] **Step 2: Confirm the preview tests fail**

```bash
node --experimental-strip-types --test tests/trip-builder-route-preview.test.ts
```

Expected: module-not-found for the preview helper.

- [ ] **Step 3: Implement immutable preview derivation**

Create `lib/easyt/trip-builder-route-preview.ts`:

```ts
import type { EasyTTrip } from "./trip";
import type { BuilderStopOrderRejection } from "./trip-builder-order";

export type BuilderRoutePreview =
  | { ok: true; trip: EasyTTrip }
  | { ok: false; reason: BuilderStopOrderRejection };

export function buildBuilderRoutePreview(
  canonical: EasyTTrip,
  orderedStopIds: readonly string[],
): BuilderRoutePreview;
```

Use `validateBuilderStopOrder`, clone only the document fields being presented, and re-derive canonical legs with `buildCanonicalTripLegs`. Do not call persistence, change timestamps, append endpoints to `stops`, or mutate canonical objects.

- [ ] **Step 4: Add the controlled route workspace**

Create `app/journey/new/trip-builder-route-workspace.tsx` with a narrow parent contract:

```ts
export type BuilderOrderSource = "drag" | "move-menu" | "route-check";

type TripBuilderRouteWorkspaceProps = {
  canonicalTrip: EasyTTrip;
  previewStopIds: readonly string[] | null;
  selectedStopId: string | null;
  lockedStopIds: readonly string[];
  fixedOrder: boolean;
  onSelectStop: (stopId: string) => void;
  onPreviewOrder: (stopIds: readonly string[] | null) => void;
  onCommitOrder: (stopIds: readonly string[], source: BuilderOrderSource) => boolean;
  onEditNights: (stopId: string, nights: number) => void;
  onAddStop: () => void;
  onOpenRouteCheck: () => void;
};
```

The component must:

- render route rows from canonical stop occurrences, or from `buildBuilderRoutePreview` only while a drag preview is active;
- use `stop.id` for keys, selection and row refs;
- show the same one-based occurrence ordinal in each row and map marker;
- pass only overnight stops to `JourneyPlannerMap`, while legs still include origin/end endpoint context;
- use `mapRouteLegsFromTrip(presentedTrip)` for line projection;
- synchronize map selection to `selectedStopId`; map marker click selects and scrolls/focuses the matching row but never mutates order;
- keep route rows usable when the map is unavailable;
- retain existing nights controls and material transfer/usable-time summaries without promoting every derived field to equal visual weight.

Wire this controlled component into `TripBuilderDocument`; do not move canonical state into the child.

- [ ] **Step 5: Run preview, map and layout regression tests**

```bash
node --experimental-strip-types --test tests/trip-builder-route-preview.test.ts tests/trip-builder-layout.test.ts tests/map-trip-shell-presentation.test.ts tests/trip-legs.test.ts
npm run typecheck
```

If `tests/map-trip-shell-presentation.test.ts` has a different repository filename at implementation time, use the existing closest `JourneyPlannerMap` presentation test rather than creating a duplicate suite.

- [ ] **Step 6: Commit the route projection**

```bash
git add lib/easyt/trip-builder-route-preview.ts tests/trip-builder-route-preview.test.ts app/journey/new/trip-builder-route-workspace.tsx app/journey/new/trip-builder.tsx tests/trip-builder-layout.test.ts
git commit -m "feat: add unified builder route workspace"
```

---

## Task 5: Implement transient drag and the accessible Move stop fallback

**Files:**

- Create: `app/journey/new/use-builder-stop-reorder.ts`
- Create: `tests/trip-builder-reorder-interaction.test.ts`
- Modify: `app/journey/new/trip-builder-route-workspace.tsx`
- Modify: `app/journey/new/trip-builder.tsx`
- Modify: `tests/trip-builder-layout.test.ts`

- [ ] **Step 1: Write failing interaction-contract tests**

Create `tests/trip-builder-reorder-interaction.test.ts` as source-contract and pure-boundary coverage that verifies:

- the grip is the only permanently visible reorder control and has an accessible name such as `Reorder Tokyo, stop 1`;
- pointer/touch preview calls `onPreviewOrder` but does not call `onCommitOrder` until a valid drop;
- Escape and pointer cancellation call `onPreviewOrder(null)` and do not commit;
- keyboard Space/Enter starts and drops, Arrow keys preview positions, Escape cancels;
- the row actions menu contains `Move stop`, with earlier/later/position choices;
- drag and menu submit the same ID permutation to `onCommitOrder`, changing only the `source` argument;
- no interaction calls a save/recovery function directly.

Add direct pure tests for the movement helper exported by the hook module:

```ts
assert.deepEqual(moveOccurrenceId(["a", "b", "c"], "b", 0), ["b", "a", "c"]);
assert.equal(moveOccurrenceId(["a", "b", "c"], "missing", 0), null);
assert.equal(moveOccurrenceId(["a", "b", "c"], "b", 3), null);
```

- [ ] **Step 2: Run the tests and confirm failure**

```bash
node --experimental-strip-types --test tests/trip-builder-reorder-interaction.test.ts tests/trip-builder-order.test.ts
```

- [ ] **Step 3: Implement the reorder interaction hook**

Create `app/journey/new/use-builder-stop-reorder.ts` with this contract:

```ts
export function moveOccurrenceId(
  currentIds: readonly string[],
  movedId: string,
  targetIndex: number,
): string[] | null;

export function useBuilderStopReorder(options: {
  stopIds: readonly string[];
  lockedStopIds: readonly string[];
  fixedOrder: boolean;
  onPreview: (ids: readonly string[] | null) => void;
  onCommit: (ids: readonly string[], source: "drag" | "move-menu") => boolean;
}): {
  draggingId: string | null;
  previewIds: readonly string[] | null;
  gripProps: (stopId: string) => React.HTMLAttributes<HTMLElement>;
  previewAt: (stopId: string, targetIndex: number) => void;
  drop: () => void;
  cancel: () => void;
  moveFromMenu: (stopId: string, targetIndex: number) => boolean;
};
```

Behavior:

- capture the starting fingerprint at gesture start;
- calculate previews with stable IDs, not array indexes stored across renders;
- validate every preview against locked/fixed constraints;
- on drop, revalidate against the latest canonical order and captured fingerprint; a stale drop cancels without commit;
- invoke `onCommit` at most once per successful interaction;
- reserve `touch-action` only on the grip; do not prevent default scrolling on the rest of the row;
- release pointer capture/listeners on drop, cancellation and unmount;
- publish `aria-grabbed`/live-region movement announcements without changing canonical state;
- menu movement uses `moveOccurrenceId` and the same parent commit callback.

- [ ] **Step 4: Consolidate parent order commits**

In `TripBuilderDocument`, replace the current index-based `moveStop(from, to)` with one boundary:

```ts
const commitStopOrder = useCallback((proposedIds: readonly string[], source: BuilderOrderSource) => {
  const result = validateBuilderStopOrder(stops, proposedIds, {
    expectedFingerprint: activeGestureFingerprintFor(source),
    lockedStopIds,
    fixedOrder,
  });
  if (!result.ok) return false;
  setStops(result.stops);
  return true;
}, [fixedOrder, lockedStopIds, stops]);
```

Adapt the details to the current local stop type, but retain the invariant: one successful `setStops` call is the logical canonical reorder; no save is called by the interaction child. Existing owner-level persistence effects may observe the committed canonical state exactly once.

- [ ] **Step 5: Run focused reorder, persistence and state-preservation tests**

```bash
node --experimental-strip-types --test \
  tests/trip-builder-reorder-interaction.test.ts \
  tests/trip-builder-order.test.ts \
  tests/trip-builder-layout.test.ts \
  tests/state-preservation-torture.test.ts \
  tests/trip-persistence.test.ts \
  tests/trip-mutation-persistence.test.ts \
  tests/builder-persistence-acceptance.test.ts
npm run typecheck
```

These are the current persistence/state-preservation suites. If the repository renames one before implementation, resolve the replacement with `rg --files tests | rg 'builder|persistence|preservation'`; do not create a duplicate suite merely to preserve a stale filename.

- [ ] **Step 6: Commit shared reorder interactions**

```bash
git add app/journey/new/use-builder-stop-reorder.ts tests/trip-builder-reorder-interaction.test.ts app/journey/new/trip-builder-route-workspace.tsx app/journey/new/trip-builder.tsx tests/trip-builder-layout.test.ts
git commit -m "feat: reorder builder stops through one boundary"
```

---

## Task 6: Converge Route Check on the same commit and add a proposal-only map overlay

**Files:**

- Modify: `components/journey-planner-map.tsx`
- Modify: `app/journey/new/trip-builder-route-workspace.tsx`
- Modify: `app/journey/new/trip-builder.tsx`
- Create: `tests/trip-builder-route-check-presentation.test.ts`
- Modify: the closest existing `JourneyPlannerMap` presentation test

- [ ] **Step 1: Write failing Route Check presentation tests**

Create `tests/trip-builder-route-check-presentation.test.ts` to assert:

- while reviewing a proposal, route rows remain in canonical order;
- canonical marker numbers remain paired with canonical occurrence IDs;
- the proposal is provided as `comparisonLegs`, not as reordered map stops;
- Dismiss clears only proposal state and has no commit/persistence side effect;
- Apply submits proposal occurrence IDs to the same `commitStopOrder(..., "route-check")` boundary as drag/menu;
- the existing scored-candidate apply path also uses that boundary;
- stale, duplicate, missing or locked proposal IDs are rejected without changing canonical state.

Extend the closest `JourneyPlannerMap` presentation test with a two-layer assertion: canonical route layer is solid/current and optional comparison route layer is visually distinct and noninteractive.

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
node --experimental-strip-types --test tests/trip-builder-route-check-presentation.test.ts tests/map-trip-shell-presentation.test.ts
```

- [ ] **Step 3: Add an optional comparison overlay to the existing map**

Extend `JourneyPlannerMapProps`:

```ts
type JourneyPlannerMapProps = {
  // existing props remain unchanged
  comparisonLegs?: readonly MapRouteLeg[];
  comparisonLabel?: string;
};
```

Render `comparisonLegs` as a separate GeoJSON source/layer with a dashed semantic-accent line. Do not create comparison markers, change `selectedId`, change canonical bounds ownership, or make the overlay interactive. Include comparison coordinates in fit bounds only while the proposal is visible so the proposal can be inspected.

- [ ] **Step 4: Route every recommendation apply through `commitStopOrder`**

In `TripBuilderDocument`:

- retain canonical rows and marker order while a Route Check proposal is open;
- derive proposed legs with `buildBuilderRoutePreview`, passing only its legs as `comparisonLegs`;
- change `applyRecommendedOrder` and `applyScoredRouteCandidate` to extract stable occurrence IDs and call `commitStopOrder(ids, "route-check")`;
- close the proposal only after a successful commit;
- display a stale/invalid proposal message when validation rejects it;
- never call `onPreviewOrder` for Route Check review.

- [ ] **Step 5: Run Route Check, planner and map tests**

```bash
node --experimental-strip-types --test tests/trip-builder-route-check-presentation.test.ts tests/trip-builder-route-preview.test.ts tests/trip-builder-order.test.ts tests/trip-builder-gate.test.ts tests/map-trip-shell-presentation.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit Route Check convergence**

```bash
git add components/journey-planner-map.tsx app/journey/new/trip-builder-route-workspace.tsx app/journey/new/trip-builder.tsx tests/trip-builder-route-check-presentation.test.ts tests/map-trip-shell-presentation.test.ts
git commit -m "feat: preview route checks without changing builder order"
```

---

## Task 7: Complete responsive composition, map fallback and Storybook coverage

**Files:**

- Modify: `app/journey/new/trip-builder.module.css`
- Modify: `app/journey/new/trip-builder-route-workspace.tsx`
- Modify: `components/journey-planner-map.tsx`
- Modify: `components/journey-patterns.stories.tsx`
- Modify: `app/journey/new/trip-builder-review.stories.tsx`
- Modify: `tests/trip-builder-layout.test.ts`
- Modify: the closest map lifecycle test

- [ ] **Step 1: Add failing responsive and lifecycle assertions**

Extend tests to require:

- desktop grid: route rows in the primary column and a sticky map in the secondary column;
- status/recovery notices use a full-width row above the grid;
- 390px layout: map before rows, initially visible, with a `Collapse map` control;
- no horizontal overflow at 390px, 430px, 768px, 1024px and 1440px fixtures;
- map setup failure produces a truthful `Route map unavailable` fallback while rows and Build remain usable;
- aborted teardown/resource requests do not flip a previously healthy route workspace into the failure state;
- exact-property or downstream workspace CSS is untouched.

- [ ] **Step 2: Implement layout using existing tokens and patterns**

In `trip-builder.module.css`:

- use existing spacing, border, radius, type and semantic surface variables from `journey-design.css`/`docs/design-system.md`;
- make the notice region `grid-column: 1 / -1`;
- use a desktop route/map grid consistent with current Journey workspace proportions;
- make the map container sticky only where the current responsive system permits;
- collapse to one column at the established Journey breakpoint, ordering map before rows;
- keep the grip hit target accessible and apply `touch-action: none` only to it;
- preserve neutral surfaces; do not introduce page-local purple/lilac fills.

In `JourneyPlannerMap`, add a narrow lifecycle callback only if the existing component cannot already report initial fatal failure:

```ts
onLifecycleChange?: (state: "ready" | "unavailable") => void;
```

Report `ready` after initial style load. Report `unavailable` only for a fatal initial map/style failure. Do not globally swallow `AbortError`; teardown cancellation and individual tile/resource failures after ready remain contained map-library behavior and must not replace the workspace with a fallback.

- [ ] **Step 3: Add representative Storybook states**

Update the existing stories rather than creating a parallel story family. Include:

- Direct New Trip capture/no-route at desktop and 390px;
- populated unified route with repeated Tokyo occurrences;
- journey end `Same as start` visible in Edit trip;
- drag-preview state with rows and map using the same transient 1/2/3 order;
- Route Check review with canonical 1/2/3 markers plus proposal overlay;
- stale/invalid proposal feedback;
- map-unavailable fallback;
- fixed/locked route state;
- touch/assistive `Move stop` menu at 390px.

- [ ] **Step 4: Run focused UI checks and Storybook production build**

```bash
node --experimental-strip-types --test tests/trip-builder-layout.test.ts tests/trip-builder-route-check-presentation.test.ts tests/trip-builder-reorder-interaction.test.ts tests/map-trip-shell-presentation.test.ts tests/map-basemap-presentation.test.ts
npm run build-storybook
npm run audit:ui
```

- [ ] **Step 5: Perform rendered fixture acceptance**

Run the repository's existing Builder/Storybook screenshot fixture workflow and inspect 390, 430, 768, 1024 and 1440 widths. Verify:

- no empty table/map before capture;
- route ordinal and marker identity remain aligned for repeated destinations;
- notices never reduce timeline/workspace width;
- desktop map remains useful and mobile map precedes rows;
- grip drag does not block normal row scrolling;
- the menu fallback is operable by keyboard and touch;
- map failure does not block editing or Build;
- no purple/lilac surface regression.

Record screenshots in the repository's existing ignored artifact directory; do not commit generated QA screenshots unless the repository currently versions that fixture.

- [ ] **Step 6: Commit responsive and Storybook completion**

```bash
git add app/journey/new/trip-builder.module.css app/journey/new/trip-builder-route-workspace.tsx components/journey-planner-map.tsx components/journey-patterns.stories.tsx app/journey/new/trip-builder-review.stories.tsx tests/trip-builder-layout.test.ts tests/map-trip-shell-presentation.test.ts
git commit -m "feat: complete responsive unified builder"
```

---

## Task 8: Run the exact-tree release verification and implementation review

**Files:**

- Modify only if a test exposes a defect within this approved scope.

- [ ] **Step 1: Inspect the implementation diff for ownership violations**

```bash
git diff --stat e17e97cf26076203e0ca51ef5efc8c95f9909765..HEAD
git diff --name-status e17e97cf26076203e0ca51ef5efc8c95f9909765..HEAD
git diff e17e97cf26076203e0ca51ef5efc8c95f9909765..HEAD -- app/journey/new lib/easyt components/journey-planner-map.tsx
```

Confirm:

- no persistence/recovery/CAS implementation was replaced;
- no endpoint was inserted into `stops` merely because it is origin/end context;
- no destination-name comparison owns occurrence identity;
- no Route Check review mutates presented row or marker order;
- no preview/cancel/error path invokes canonical setters or persistence;
- no downstream workspace or unrelated visual work is present.

- [ ] **Step 2: Run all focused Builder and route suites**

Use `rg --files tests | rg 'trip-builder|journey-endpoint|trip-leg|planner|route|persistence|recovery|state-preservation'` to confirm the current filenames, then run the applicable suites, including at minimum:

```bash
npm run test:builder-gate
node --experimental-strip-types --test \
  tests/trip-builder-order.test.ts \
  tests/trip-builder-view.test.ts \
  tests/trip-builder-document-commit.test.ts \
  tests/trip-builder-route-preview.test.ts \
  tests/trip-builder-reorder-interaction.test.ts \
  tests/trip-builder-route-check-presentation.test.ts \
  tests/trip-builder-layout.test.ts \
  tests/journey-endpoints.test.ts \
  tests/trip-legs.test.ts
```

- [ ] **Step 3: Run repository quality gates on the exact candidate**

```bash
npm run typecheck
npm run build:check
npm run build-storybook
npm run audit:ui
git diff --check
npm run release:gate
```

`audit:ui` currently runs `scripts/ui-convergence-audit.mjs --strict`, so it is both the strict UI audit and convergence gate. If a script is renamed before implementation, use the existing `package.json` script with equivalent semantics. Do not weaken flags, skip strict audit or treat a missing required gate as a pass.

- [ ] **Step 4: Verify the final worktree and commit history**

```bash
git status --short
git log --oneline --decorate e17e97cf26076203e0ca51ef5efc8c95f9909765..HEAD
git diff --check e17e97cf26076203e0ca51ef5efc8c95f9909765..HEAD
```

Expected: clean worktree, only the planned sequential implementation commits, no generated build artifacts tracked.

- [ ] **Step 5: Request implementation review before integration**

Use the repository's review workflow to check the exact final diff against `docs/superpowers/specs/2026-09-15-unified-builder-design.md`, with special attention to:

- atomic details commit behavior;
- repeated-stop and endpoint identity;
- stale-drop/recommendation rejection;
- pointer cleanup and mobile scrolling;
- proposal overlay vs canonical marker order;
- zero persistence side effects for invalid/cancelled interactions;
- map-failure isolation.

Do not push staging or main. Hand off the final local commit range, tree SHA, validation evidence and any remaining manual acceptance items for explicit integration authorization.

---

## Completion Evidence

The implementation handoff must report:

1. Starting staging SHA and isolated worktree path.
2. Sequential implementation commit SHAs and final tree SHA.
3. Reused shared components and any narrowly extended shared API.
4. Direct New Trip empty-state result.
5. Journey End / Same as start and Busan endpoint regression result.
6. Atomic edit commit and stale-draft rejection result.
7. Repeated-stop identity, drag, menu fallback and Route Check results.
8. Desktop and 390px rendered evidence, plus wider fixture coverage.
9. Map-failure and teardown behavior.
10. Focused tests and full quality-gate results.
11. Confirmation that persistence/recovery/CAS ownership and the dirty primary checkout remained untouched.
12. Confirmation that no remote branch, staging or main was pushed without separate authorization.

# Homepage Dual-entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a plan, not authorization to execute it; stop for implementation-plan review.

**Goal:** Replace the small homepage prompt card with the approved wide dual-entry planner, compact route inspiration and How it works, with trustworthy canonical handoff and preservation.

**Architecture:** `HomeTripStarter` owns intake; `MorroviaTripCapture` owns shared capture presentation; `ImmersiveHome` owns homepage composition and selected route/index. Extend `HomeTripDraft` and the existing preservation boundary; `TripBuilderDocument` remains the sole canonical trip, recovery, CAS and build owner. Known stop selections retain occurrence IDs without language-model re-interpretation.

**Tech Stack:** Existing Next.js 15, React 19, TypeScript, CSS Modules, Lucide, Node test runner and Storybook 10; existing browser automation for rendered acceptance. No new routing engine, database migration, drag library or general state-management dependency.

**Spec:** `docs/superpowers/specs/2026-09-16-homepage-dual-entry-design.md`, revision `ae3c5df` (read with this plan).

## Global constraints

- No product code is implemented by the planning pass. No push, merge, deployment or infrastructure changes.
- `TripBuilderDocument` remains the only canonical trip owner. Homepage snapshots contain intake only; never copy `TripBuilderDetailsDraft` or persist a second generated trip.
- Existing navigation is unchanged. Reuse `EasyTNavigation current="home" landing logoTone="light" deferPrefetch`; keep its structure, auth/language/mobile behaviour, sizing and preservation.
- The supplied current screenshot is authoritative for navigation, full-height hero feel and photographic treatment. Capture exact staging before product changes. Document divergence and request review only if material to implementation; do not reopen navigation design.
- Use `min-height: 100svh` on the whole hero including navigation. Content may grow. Do not retain a compulsory 900px minimum, clip inputs/overlays or add header height to a full-height body.
- Reuse reviewed photography, responsive variants, focal positions, loader, credits and fallbacks. Generated mockups are composition references, not assets or metadata sources.
- One planner form; Plan with stops selected initially. Mode changes preserve work, never generate or silently mix inactive input.
- Budget / Mid-range / Luxury map to `value` / `mid` / `high`; no mandatory selected default. Preserve explicit clears and profile precedence.
- Interest IDs are `food`, `culture`, `nature`, `cities`, `beach`, `hiking`. Preserve dates, duration intent, travellers and endpoints.
- Route card clicks, hover and focus never change homepage selected-route state. Retained Route Story uses the existing `ImmersiveHome` index through `RouteChapters`.
- No new homepage Continue/separate conflict UI. Use existing owner-aware New Trip/recovery UX; request separate design approval if new user-facing conflict UX proves necessary.
- Retain Route Story, ProductDemo, AffiliateChapter, ClosingChapter, footer and credits. Only the old large featured-route introduction is replaced.
- Phase A must review the transition into Route Story. If materially duplicative or disconnected, stop for design review; do not remove/redesign it.
- No Describe my trip BETA badge, fake video/play control, Popular ideas row, generic Multi-country chip, invented route duration or stop counts.
- Test-first: introduce behavioural assertions, observe the intended failure, make the smallest change, rerun, then commit. A source-contract test does not replace a rendered interaction or visual review.

## Baseline, dependencies and execution policy

This plan was inspected against staging `d93395d213371f90d5352d606e734513bcfa6adc` and main `ad4966a59455fffac764fdabb03e12ce574628a7`, in `/Users/shaun/Documents/Morrovia-homepage-dual-entry-spec`, branch `codex/homepage-dual-entry-design`. The primary checkout is dirty and remains untouched.

Unified-builder documents are in `/private/tmp/morrovia-unified-builder-design.IH0sA3/worktree`, branch `codex/unified-builder-design`, HEAD `eb792ddb043ac9d0de52d554cb77ca63c630edf4`. Its two commits beyond staging contain only its specification and plan. Its planned Task 1 creates `trip-builder-order.ts`; Task 2 changes hydration/empty-state presentation; Task 3 creates the atomic document/details editor; Tasks 4–7 change map/route presentation. These are not implemented APIs at this baseline.

Before execution, use the worktree workflow to create/reuse an isolated candidate from freshly fetched staging; record SHAs and read applicable AGENTS/design-system instructions. Do not switch/reset/clean the primary checkout, import its uncommitted work or modify the builder task's worktree. Inspect actual integrated builder changes before touching overlapping owners. Dependencies may be reconciled in one authorized local candidate, but this plan does not execute the unified-builder plan on its behalf.

| Tasks | Can proceed before unified builder? | Gate |
| --- | --- | --- |
| 1–4 (A) | Yes | Shared capture remains backward-compatible; new layout is preview-only until connected; complete Phase A visual review |
| 5–6 (B pure input/handoff support) | Yes, on agreed contracts | Reconcile schema with builder owner before finalizing interfaces; no builder edits or live activation |
| 7–8 (B canonical hydration/budget) | Must wait/reconcile | Unified-builder Tasks 2/3 and actual canonical hydration/mutation ownership must be available/coordinated |
| 9 (B connected submission/template protection) | Must wait for 5–8 | End-to-end hydration/receipt/preservation must work before enabling handoff |
| 10–11 (C) | Must wait | All A/B tasks and unified-builder populated/clarification behaviour verified on the same tree |

No separate setup task: baseline capture/tool setup belongs to Task 1, schema support to Task 5, fixture tooling to the task that uses it. Each task ends with a local commit of its explicit file list, never `git add .`.

## File and responsibility map

| Owner | Planned change |
| --- | --- |
| `components/easyt/morrovia-trip-capture.tsx`, `.module.css`, `.stories.tsx` | Opt-in controlled wide composition; reuse text/voice/AI/interest subcompositions and existing builder API |
| `app/journey/home/home-destination-editor.tsx`, `.module.css` (new) | Controlled occurrence editor; no routing, save, budget or night state |
| `components/easyt/canonical-place-autocomplete.tsx` | Compatible locale strings only; preserve canonical search and keyboard semantics |
| `app/journey/home/immersive/homepage-route-inspiration.tsx`, `homepage-how-it-works.tsx` (new) | Compact canonical route links and existing tour trigger |
| `app/journey/home/immersive/immersive-home.tsx`, `immersive.module.css`, `route-chapters.tsx`, `immersive-home.stories.tsx` (new story) | Wide hero preview, final composition, narrowed old introduction; preserve existing selected index |
| `app/journey/home/home-trip-starter.tsx`, `.stories.tsx` | Intake orchestration, requests, restoration, existing preservation/recovery feedback |
| `lib/easyt/home-trip-handoff.ts` | Intake types, pure projection, validation, snapshot/receipt codec, durable comparison and staged transfer; no canonical persistence |
| `lib/easyt/private-browser-context.ts` | Owner-scoped intake-key naming next to existing profile scope |
| `app/journey/new/trip-builder.tsx` | Reconciled hydration of handoff IDs/source flags and receipt; no new canonical owner |
| `lib/easyt/structured-trip-brief.ts`, `trip.ts`, `trip-copilot.ts` | Narrow source/clear propagation and verified AI-context effect |
| `lib/easyt/storage.ts`, `app/journey/routes/[slug]/route-plan-link.tsx` | Reuse/extend existing New Trip preservation checks; protect template activation |
| `tests/fixtures/homepage-dual-entry.ts` (new) | Shared deterministic canonical suggestion/intake fixtures, never a parallel route catalogue |
| Focused Node suites and adjacent Storybook plays | Behaviour first; existing suites retain publication/persistence invariants |
| `docs/design-system.md` | Update canonical ownership map only if extraction changes it; no unrelated rewrite |

All new symbols below are **proposed interfaces**. Existing imported types remain authoritative. Small implementation bodies illustrate required algorithms; an executor must implement the complete listed cases, not only the sample assertion.

## Phase A — Reviewable visual components and Storybook states

### Task 1: Add the controlled wide capture composition

**Files:** Modify shared capture TSX/CSS/stories and `app/journey/home/home-trip-starter.stories.tsx`; create `tests/homepage-dual-entry-presentation.test.ts`. Read `docs/design-system.md`, Journey tokens, controls, date picker, voice capture and navigation stories first.

**Interfaces:** Preserve `MorroviaTripCaptureProps`; add optional `homepageEntry` with:

```ts
type HomepageCaptureEntry = {
  mode: "stops" | "describe";
  onModeChange: (mode: "stops" | "describe") => void;
  destinationEntry: React.ReactNode;
  budget: "value" | "mid" | "high" | null;
  onBudgetChange: (value: "value" | "mid" | "high" | null) => void;
  datesChosen: boolean;
  onDatesClear: () => void;
};
```

The existing value/onValueChange, dates, interests, travellers, endpointEntry, submit/loading/error props remain controlled. The new surface has one primary submit. Its mode-specific input validity is supplied by controller validation (Task 5/9), not inferred from `destinationEntry`; preserve existing prompt validation when `homepageEntry` is absent. `allowEmptyPrompt` remains only a compatibility flag, not proof that selected stops are valid.

- [ ] **1. Capture baseline and define failing states.** Start the unchanged staging candidate and existing stories with `npm run dev` and `npm run storybook -- --host 127.0.0.1`. Capture the supplied screenshot's nav/full-height/photo treatment and all specified viewports to ignored `output/homepage-dual-entry/before/`. Record exact SHA and any material divergence. In the new test, keep the existing no-nested-form contract and add the opt-in interface assertion:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("../components/easyt/morrovia-trip-capture.tsx", import.meta.url), "utf8");
test("wide capture is opt-in without removing the canonical capture owner", () => {
  assert.match(source, /homepageEntry\?/);
  assert.match(source, /VoiceTripBrief/);
  assert.match(source, /MorroviaDatePicker/);
});
```

Add story plays that assert one form/one submit, switch tabs using keyboard and click, open/close Personalize and verify retained interest/date values. Use the existing native-DOM `play` pattern, throw an Error on a failed assertion; do not introduce a test framework solely for stories.

- [ ] **2. Observe failure.** Run `node --experimental-strip-types --test tests/homepage-dual-entry-presentation.test.ts`; expected missing opt-in contract. Open new story to confirm missing wide controls before implementing them.
- [ ] **3. Implement the controlled composition.** Keep the old render path default; share prompt/voice/AI and interest rendering within the existing owner. Render two labelled tabs with `aria-selected`, `aria-controls`, roving tabIndex, arrow/Home/End behaviour; use one shared form, dates and primary action. Wire the slot without parsing it:

```tsx
{homepageEntry.mode === "stops" ? homepageEntry.destinationEntry : promptField}
```

Here `promptField` is the extracted existing textarea/VoiceTripBrief/validation subcomposition, not a second form. Shared dates use `MorroviaDatePicker`; clear calls `onDatesClear`; budget uses shared segmented/buttons with a quiet Clear action. Personalize is a closed-initially compact row, separate from the existing Add trip details disclosure with travellers/endpoints. Preserve AI information access in Describe mode. Mode unmount must stop speech/ignore late transcripts. Use token styles and no page-local field/button primitives.
- [ ] **4. Verify.** Run the new test plus `tests/journey-capture-validation.test.ts`, `tests/storybook-visual-system.test.ts`; run `npm run typecheck` and `npm run build-storybook`. Inspect empty/filled/error/loading, both modes, open/closed Personalize, EN/ES, 320/390/768/1440 states. Direct-builder capture stories must remain usable and unchanged unless a documented shared defect needs correction.
- [ ] **5. Commit.** Stage the five modified/created paths explicitly; commit `feat: compose the wide homepage trip capture`.

### Task 2: Build the occurrence-safe destination editor

**Files:** Create `app/journey/home/home-destination-editor.tsx`, `.module.css`, `tests/homepage-destination-entry.test.ts`, `tests/fixtures/homepage-dual-entry.ts`; modify `lib/easyt/home-trip-handoff.ts`, autocomplete TSX and homepage starter stories.

**Interfaces:** Export from `home-trip-handoff.ts`:

```ts
export type HomepageDestinationEntry = {
  id: string; text: string; selection: CanonicalPlaceSuggestion | null;
};
export function moveHomepageEntry(
  entries: readonly HomepageDestinationEntry[], id: string, offset: -1 | 1,
): HomepageDestinationEntry[];
```

Editor props: `entries: HomepageDestinationEntry[]`, `language: EasyTLanguage`, `disabled?: boolean`, `onChange: (entries: HomepageDestinationEntry[]) => void`. It owns disclosure/focus only. Caller allocates stable IDs on Add/first entry creation. The fixture file exports `selectedEntry(id: string, canonicalName: string): HomepageDestinationEntry`, using existing `canonicalPlaceSuggestionFor(canonicalName)` with an assertion that the direct-destination catalogue fixture exists. For Japan/region/anchor fixtures use `canonicalPlaceSuggestionsForQuery`, selecting the exact canonical type/ID; `canonicalPlaceSuggestionFor` deliberately returns only direct destinations and cannot supply a country fixture.

- [ ] **1. Write failing ID/keyboard cases.** Use Node tests for mutation and story plays for the editor:

```ts
const entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];
assert.deepEqual(moveHomepageEntry(entries, "c", -1).map(e => e.id), ["a", "c", "b"]);
assert.deepEqual(entries.map(e => e.id), ["a", "b", "c"]);
assert.deepEqual(moveHomepageEntry(entries, "missing", -1), entries);
```

Also assert five total means the complete five-entry editor including entry one, editing text clears only that selection, same-place Add has a fresh ID, removing first shifts displayed first entry without changing surviving IDs, and invalid boundary movement is a no-op. Story plays must test focus restoration and autocomplete Enter selecting rather than submitting.
- [ ] **2. Observe failure.** Run `node --experimental-strip-types --test tests/homepage-destination-entry.test.ts`; expect missing helper/module.
- [ ] **3. Implement.** Reuse `CanonicalPlaceAutocomplete` without excluding already-selected canonical IDs. Implement movement by a copied array and ID lookup:

```ts
const from = entries.findIndex(entry => entry.id === id);
const to = from + offset;
if (from < 0 || to < 0 || to >= entries.length) return [...entries];
const next = [...entries];
const [entry] = next.splice(from, 1);
next.splice(to, 0, entry);
return next;
```

The full named editor includes first entry, Add, Remove, Move earlier/later; use current shared buttons. Do not import builder UI. When unified order validation becomes available, reuse it for a final permutation if useful without introducing a dependency for simple pre-route list movement. Count `isOvernightBaseEligible` selections as stops and planning areas separately; unresolved entries/anchors are visibly unconfirmed. Add a backward-compatible `language` prop to autocomplete for type/searching/retry labels; reuse its abort/search machinery.
- [ ] **4. Verify.** Run new suite, `tests/canonical-place-route-regression.test.ts`, `tests/journey-endpoints.test.ts`, typecheck and Storybook. Inspect repeated/long names, zero results/retry, keyboard/Escape/remove focus and EN/ES. Reordering affects intake only, never recovery or route allocation.
- [ ] **5. Commit.** Stage Task 2 paths explicitly; commit `feat: edit homepage destination occurrences accessibly`.

### Task 3: Add canonical compact route links and How it works

**Files:** Create `app/journey/home/immersive/homepage-route-inspiration.tsx`, `homepage-how-it-works.tsx`, `homepage-inspiration.stories.tsx`, `tests/homepage-inspiration.test.ts`; modify `immersive.module.css`. Read `homepage-routes.ts`, `immersive-homepage-routes.ts`, reviewed photography and Route Detail link owners.

**Interfaces:** `HomepageRouteInspiration({ routes }: { routes: ImmersiveRoute[] })`; `HomepageHowItWorks()` uses `useHomepageLanguage` and existing `PRODUCT_TOUR_OPEN_EVENT`. Neither receives an index or route-change callback.

- [ ] **1. Write failing link/ownership checks and plays.** Source assertions protect the boundary; rendered plays inspect each card URL/metadata and tour open/close:

```ts
const source = readFileSync(new URL("../app/journey/home/immersive/homepage-route-inspiration.tsx", import.meta.url), "utf8");
assert.match(source, /href=\{route.href\}/);
assert.doesNotMatch(source, /RoutePlanLink|routePlannerPayload|localStorage|setIndex/);
```

`tests/homepage-routes.test.ts` remains the real publication/metadata test. New play focuses and hovers every card and verifies the surrounding selected-story key never changes; native click targets Route Detail. No generation event or handoff write.
- [ ] **2. Observe failure.** Run `node --experimental-strip-types --test tests/homepage-inspiration.test.ts tests/homepage-routes.test.ts`; new file assertions fail, existing route eligibility stays green.
- [ ] **3. Implement.** Use `route.title`, `route.dayRange`, `route.stops.length`, `route.href`, existing reviewed hero/photo variants and fallback. Do not use the reduced photo-subset count. Use normal Link and sibling credits, no nested anchors:

```tsx
<Link href={route.href}><span>{route.title}</span><span>
  {route.dayRange.min === route.dayRange.max ? route.dayRange.min : `${route.dayRange.min}–${route.dayRange.max}`} {es ? "días" : "days"}
  {" · "}{route.stops.length} {es ? "paradas" : "stops"}
</span></Link>
```

Place landscape image inside this link and accessible credit alongside it using existing photo owners. Grid uses `repeat(auto-fit, minmax(min(100%, 180px), 1fr))`, capped by the editorial container; no invented metadata. Add exact approved heading/supporting text/catalogue URL. How it works renders the three approved steps with shared button dispatching the existing tour event. No new tour or video.
- [ ] **4. Verify.** Run new and existing homepage-routes/public-route/imagery suites, typecheck and Storybook. Check seven eligible routes and zero/fewer eligible routes, 320px readability, no overflow and no coupling on focus/hover/click. Tour Escape returns focus to its activated trigger; patch the existing tour owner only if the new trigger exposes a real defect and cover that regression.
- [ ] **5. Commit.** Stage Task 3 paths plus any narrowly tested tour fix; commit `feat: add compact homepage inspiration and tour steps`.

### Task 4: Compose the full-height preview and review the retained story transition

**Files:** Modify `immersive-home.tsx`, `immersive.module.css`, `route-chapters.tsx`; create `immersive-home.stories.tsx` and extend `tests/homepage-dual-entry-presentation.test.ts`. Do not activate the new composition in `morrovia-homepage.tsx` yet.

**Interfaces:** Temporarily add `presentation?: "current" | "dual-entry"` and `plannerSlot?: ReactNode` to `ImmersiveHome`, defaulting to the current connected homepage. Add `showIntroduction?: boolean` to `RouteChapters`, default true until Task 10. The Storybook preview opts into dual-entry and supplies the controlled Task 1/2 fixture planner. These temporary composition props are removed in Task 10; no user setting or feature-flag service.

- [ ] **1. Write the failing preview assertions.** Protect hero sizing and retained anchors with source assertions; add a full-composition story play:

```ts
const story = canvasElement.querySelector('#route-story');
if (!story) throw new Error('Retained Route Story is missing');
const original = story.textContent;
for (const link of canvasElement.querySelectorAll<HTMLAnchorElement>('#routes a')) {
  link.focus();
  link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  if (story.textContent !== original) throw new Error('Card focus/hover changed Route Story');
}
```

Add assertions for single nav, single `#routes`, planner form, `#product`, `#booking-support`, `#closing`, and no duplicate introduction in dual-entry mode. Intercept a card navigation in the fixture to verify click does not mutate the index before leaving.
- [ ] **2. Observe failure.** Run presentation suite and open full composition preview; the baseline lacks the opt-in arrangement.
- [ ] **3. Implement preview-only composition.** Keep state ownership unchanged:

```tsx
const route = routes[index];
const dualEntry = presentation === "dual-entry";
// Existing navigation/photo pipeline stays in ImmersiveHome.
{dualEntry ? <><HomepageRouteInspiration routes={routes} /><HomepageHowItWorks /></> : null}
<RouteChapters routes={routes} index={index} onChange={setIndex}
  quiet={systemQuiet} showIntroduction={!dualEntry}>
  {(selected, change) => <><ProductDemo route={selected} routes={routes} change={change} /><AffiliateChapter routeKey={selected.key} /></>}
</RouteChapters>
```

Use a dual-entry CSS class to scope `min-height:100svh`, full-width planner and left-copy-above-form layout. Move photo overflow clipping to decorative layer. Remove no lower content. Skip the old pinned-introduction effect when hidden; retain route-story/product scroll correction. Empty routes render fallback photo/credits and usable planner; avoid dereferencing an absent route throughout effects/children.
- [ ] **4. Review Phase A, not just build it.** Run `npm run build-storybook`, `npm run audit:ui`, typecheck and the presentation tests. Capture default, five-stop, both modes, Personalize/list/calendar open, long/repeated names, errors/loading, EN/ES and reduced motion at 1920×1080, 1440×900, 1366×768, 768×1024, 390×844, 320px and 200%/400% zoom. Compare navigation/photo treatment with supplied current screenshot and exact staging baseline. Review cards → How it works → retained Route Story as one sequence: it must not imply the story belongs to a clicked/focused card. If materially duplicative/disconnected, stop for design review without redesign/removal. Store evidence under ignored `output/homepage-dual-entry/phase-a/`.
- [ ] **5. Commit.** Stage Task 4 paths explicitly; commit `feat: preview the full-height homepage composition`. Connected default stays unchanged until B is verified.

## Phase B — Connected input behaviour and canonical handoff

### Task 5: Define and test active-mode projection and explicitness

**Files:** Modify `lib/easyt/home-trip-handoff.ts`, `lib/easyt/structured-trip-brief.ts` only if a canonical projection helper is needed; create `tests/homepage-input-projection.test.ts`; extend Task 2 fixtures. Coordinate this API with unified-builder Task 2/3 before consumers are finalized.

**Interfaces:** Add intake-only types to the existing handoff owner:

```ts
export type HomepageChoice<T> =
  | { state: "untouched" }
  | { state: "selected"; value: T }
  | { state: "cleared" };
export type HomepageInputSnapshot = {
  version: 1; ownerId: string | null; revision: number;
  mode: "stops" | "describe";
  entries: HomepageDestinationEntry[]; prompt: string;
  dates: HomepageChoice<{ start: string; end: string }>;
  budget: HomepageChoice<"value" | "mid" | "high">;
  interests: HomepageChoice<TripInterest[]>;
  travellers: HomepageChoice<number>;
  origin: HomepageChoice<JourneyEndpointPlace>;
  journeyEnd: HomepageChoice<JourneyEndSelection>;
};
export type HomepageInputIssue = {
  field: "destinations" | "prompt" | "dates" | "travellers";
  code: "required" | "unresolved" | "invalid"; entryId?: string;
};
export function projectHomepageInput(input: {
  snapshot: HomepageInputSnapshot;
  capture?: JourneyCaptureResult;
  profile: TravelProfile | null;
  handoffId: string;
}): { ok: true; draft: HomeTripDraft } | { ok: false; issues: HomepageInputIssue[] };
```

Extend `HomeTripDraft` compatibly with optional versioned `homepage` metadata: `{ version: 1; ownerId; revision; mode; occurrenceMentionIds: Record<string,string>; choices: Pick<HomepageInputSnapshot, "dates" | "budget" | "interests" | "travellers" | "origin" | "journeyEnd"> }`, plus optional `budget`. Do not require metadata on legacy capture/template payloads. Preserve existing `datesExplicit`, `travellersExplicit`, `interestsExplicit`, duration, origin/end and capture fields. Add fixture `emptyHomepageInput(ownerId: string | null = null): HomepageInputSnapshot` with untouched shared values, empty entries/prompt, initial mode stops/revision zero.

- [ ] **1. Write failing projection tests.** Use catalogue selections and the real capture fixture:

```ts
const snapshot = emptyHomepageInput();
snapshot.entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];
snapshot.prompt = "An inactive trip to Peru";
const result = projectHomepageInput({ snapshot, profile: null, handoffId: "h1" });
assert.equal(result.ok, true);
if (result.ok) assert.deepEqual(result.draft.destinations?.map(s => s.id), ["a", "b", "c"]);
snapshot.mode = "describe";
snapshot.prompt = " ";
assert.equal(projectHomepageInput({ snapshot, profile: null, handoffId: "h2" }).ok, false);
```

Cases: selected Japan stays planning_area with zero invented stops; anchor needs base; mixed area/cities preserve order/IDs; unknown free text blocks until confirmed; explicit end Tokyo cannot remove separately selected Tokyo; explicit empty interests overrides prompt/profile; clear dates removes fixed dates but retains captured duration; malformed/partial/reversed dates reject; 1–12 travellers, 1–12 week intent; all budget bands and late profile precedence; Describe ignores inactive entries.
- [ ] **2. Observe failure.** Run `node --experimental-strip-types --test tests/homepage-input-projection.test.ts`; expect missing projection API.
- [ ] **3. Implement deterministic adaptation.** Select only active mode. Use `structuredTripBriefFromSavedSelections`/existing structured merge primitives; materialize occurrence-specific mentions and placeSelections with a stable explicit ID mapping. Use `isOvernightBaseEligible` for night-bearing stops (canonical suggestions have optional routability, so resolve it using existing place-intelligence classification before passing the required field); preserve area/anchor canonical identity, bounds, provenance and clarification semantics. Do not round-trip chosen names through capture/extraction deduplication. For structured order set `decisionSelections.routeOrder = "entered"` without adding locks. For Describe use existing `createHomeTripDraft`, then apply shared choices. The precedence algorithm is:

```ts
// Apply separately to each shared field; cleared means suppression, not fallback.
if (choice.state === "selected") return choice.value;
if (choice.state === "cleared") return clearedValue;
return capturedValue ?? profileValue ?? operationalFallback;
```

This code is a per-field algorithm, not a new public generic helper; date/duration and endpoint rules use their canonical validators. Clear semantics strip matching structured facts/constraints as well as top-level fields. Profile-derived values remain unselected and source-labelled; fallback budget must not masquerade as a user preference.
- [ ] **4. Verify.** Run projection, capture corpus/entry parity, trip-interests, travel-profile-interests and journey-endpoints suites plus typecheck. Inspect serialized structured payload and mention order, not only rendered labels. No canonical trip/recovery writes in this task.
- [ ] **5. Commit.** Stage Task 5 paths; commit `feat: project homepage modes into canonical handoff intent`.

### Task 6: Preserve intake snapshots and reserve idempotent handoffs

**Files:** Modify handoff/private-browser-context owners; create `tests/homepage-input-preservation.test.ts`; extend fixtures. Inspect owner cleanup in `storage.ts` before adding keys; reuse its scope rules.

**Interfaces:** In `private-browser-context.ts`, add `homepageInputStorageKey(ownerId: string | null): string` using its existing private scope. In handoff owner:

```ts
export type HomepageHandoffReceipt = {
  version: 1; ownerId: string | null; handoffId: string;
  inputFingerprint: string; tripId: string;
};
export type StoredHomepageInput = {
  snapshot: HomepageInputSnapshot; receipt?: HomepageHandoffReceipt;
};
export function readHomepageInput(value: unknown, ownerId: string | null): StoredHomepageInput | null;
export function homepageSubmissionFingerprint(draft: HomeTripDraft): string;
export function reusableHomepageReceipt(
  stored: StoredHomepageInput, draft: HomeTripDraft,
): HomepageHandoffReceipt | null;
```

Versioned handoff metadata also carries optional `receipt`. Fingerprint only the effective active-mode semantic payload and provenance, not timestamps, request IDs, revisions, inactive input or display state. Receipt reserves the future canonical trip ID before navigation; it stores no trip document. Reuse that ID during hydration (Task 7), including retries after partial failure.

- [ ] **1. Write failing codec/idempotency tests.**

```ts
const snapshot = emptyHomepageInput("owner-a");
assert.equal(readHomepageInput({ snapshot }, "owner-b"), null);
assert.equal(readHomepageInput({ snapshot: { ...snapshot, version: 99 } }, "owner-a"), null);
assert.deepEqual(readHomepageInput({ snapshot }, "owner-a")?.snapshot, snapshot);
```

Also test unknown types, invalid enums/dates/coordinates, duplicate occurrence IDs, nonfinite/out-of-range numbers, oversize prompt and owner changes. Two accepted handoffs with identical semantic content reuse the receipt trip ID; changing effective input does not. Changing inactive text or revision alone does not create a duplicate. Receipt owner/ID mismatch rejects. Legacy `HomeTripDraft` still uses its own compatibility reader and must not silently adopt an owner.
- [ ] **2. Observe failure.** Run `node --experimental-strip-types --test tests/homepage-input-preservation.test.ts`; expect missing codec.
- [ ] **3. Implement bounded validation/bookkeeping.** Validate nested fields before returning a typed value, preserve complete selected canonical metadata and distinguish missing receipt from invalid receipt. Serialize via existing owner-scoped storage conventions:

```ts
const key = homepageInputStorageKey(stored.snapshot.ownerId);
const serialized = JSON.stringify(stored);
// Validate before replacing a prior snapshot; callers catch storage failures.
if (!readHomepageInput(JSON.parse(serialized), stored.snapshot.ownerId)) {
  throw new Error("Invalid homepage intake");
}
storage.setItem(key, serialized);
```

This is the storage-call body used by the controller/transfer owner, not an additional persistence service. Preserve receipt when a later edit stores a new snapshot; the fingerprint decides whether it is reusable. Keep snapshot after handoff consumption. On storage failure retain in-memory input and report failure before navigation; do not claim cloud/recovery saved. Extend existing explicit account/privacy cleanup paths only for the new scoped key if they currently enumerate keys. Guest-to-account intake adoption must use established explicit promotion semantics, not a generic owner rewrite. No new conflict dialog.
- [ ] **4. Verify.** Run new suite with `tests/private-session-boundary.test.ts`, `tests/trip-browser-storage.test.ts`, `tests/state-preservation-torture.test.ts`, typecheck. Use injected failing storage and ensure the prior intake remains recoverable. These are pure support changes; do not alter builder or enable writes in the homepage yet.
- [ ] **5. Commit.** Stage Task 6 paths; commit `feat: preserve owner-scoped homepage intake and handoff identity`.

### Task 7: Reconcile canonical builder hydration and durable acknowledgement

**Files:** Modify `app/journey/new/trip-builder.tsx`, `lib/easyt/home-trip-handoff.ts`; create `tests/homepage-builder-hydration.test.ts`; extend `tests/journey-capture-corpus.test.ts`, `tests/journey-endpoints.test.ts`, `tests/builder-persistence-acceptance.test.ts` and `tests/trip-builder-layout.test.ts`.

**Dependency gate:** Wait for/reconcile unified-builder Task 2/3. Re-read their actual diff; its instruction to preserve hydration “exactly as today” cannot prohibit the approved occurrence/source/receipt additions. Do not recreate its editor, view helper, state owner or route map.

**Interfaces:** Keep `initialHandoffRouteStops` and `removeHomeTripDraftIfDurable` as existing boundaries. Extend `mergeHandoffLocationChoice` with optional fourth `occurrenceId?: string` so versioned calls enrich the mapped occurrence, while legacy callers retain their existing behaviour. Add:

```ts
export function homepageHandoffMatchesTrip(draft: HomeTripDraft, trip: EasyTTrip): boolean;
```

This compares the initial accepted versioned handoff to the canonical document before cleanup; it is not a permanent constraint preventing later builder edits.

- [ ] **1. Write failing canonical tests.** Build a valid `EasyTTrip` using existing `tripFromBuilder` fixture patterns. Assert:

```ts
assert.equal(homepageHandoffMatchesTrip(draft, trip), true);
assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, stops: [trip.stops[0], trip.stops[1]] }), false);
assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, stops: [...trip.stops].reverse() }), false);
```

Here `draft` is the Task 5 projected a/b/c Tokyo/Kyoto/Tokyo handoff and `trip` is materialized with those same IDs, endpoint/source values and Task 6 receipt trip ID. Add blank-prompt structured durability, newer handoff not deleted, pending geocode not acknowledged, repeated hydrate same ID, failed recovery write keeps handoff, clear/endpoints preserved, and missing coordinates do not delete occurrences.
- [ ] **2. Observe failure.** Run new hydration suite, corpus, endpoints and builder-persistence-acceptance. New ID/blank-prompt assertions should fail before extension; record pre-existing failures separately.
- [ ] **3. Implement in the canonical owner.** Validate versioned owner/handoff discriminator before hydration. Use `receipt.tripId` before any recovery/save effect can observe a random replacement ID. After validated owner/receipt checks, existing hydration assigns the reserved identity:

```ts
if (homeDraft.homepage?.receipt) setTripId(homeDraft.homepage.receipt.tripId);
```

Keep the existing hydration-ready gate closed until the complete document is populated. Receipt and matching existing canonical document must resume existing trip hydration instead of replaying old intake over it. Reuse direct destination IDs; enrich by explicit mention→occurrence mapping, never names. Areas/anchors use existing clarification, with their original required-order position preserved when bases are chosen. Never apply endpoint name-filtering to a separately selected direct occurrence. Use current `TripBuilderDocument` setters/complete-document preparation and existing build invariant; no second controller. Populated skeleton enters unified route view; areas-only enters clarification/no-empty-map. After existing recovery storage reports success, compare exact handoff then remove only the matching slot; leave intake receipt so back/reload resumes canonical state. Existing trip ID hydration wins over stale homepage input.
- [ ] **4. Verify.** Run named suites and `npm run test:builder-gate`, `npm run test:persistence`, typecheck. Render real builder hydration for direct places, area-only and Describe; assert canonical trip ID/order/endpoint identity from recovered storage, not UI text alone. Confirm unified-builder atomic edits and drag/Route Check tests remain green on the reconciled tree.
- [ ] **5. Commit.** Stage Task 7 paths; commit `feat: hydrate homepage handoffs without losing occurrence identity`.

### Task 8: Propagate budget choices and clears into real planning context

**Files:** Modify `trip-builder.tsx`, `lib/easyt/trip.ts`, `structured-trip-brief.ts`, `trip-copilot.ts`; create `tests/homepage-budget-propagation.test.ts`; extend `tests/trip-copilot.test.ts` and preservation fixtures.

**Dependency gate:** Requires Tasks 5/7 and reconciliation with unified-builder Task 3 budget/details commit. Do not make preference explicitness depend on a disclosure being open.

**Interfaces:** Add optional `budgetPreference` to the existing canonical brief and optional matching `BuilderTripInput` field, using this exported `TripBudgetPreference` type in `trip.ts`:

```ts
export type TripBudgetPreference = {
  source: "explicit" | "capture" | "profile" | "fallback" | "cleared";
  value?: "value" | "mid" | "high";
};
```

The handoff owner resolves this provenance from Task 5 choices/capture/profile; selected sources require a band, cleared has no value, fallback identifies only the operational band. Carry it through `tripFromBuilder`/saved hydration and the unified details commit; preserve absent metadata for legacy documents. Keep required legacy `BudgetBand` for compatibility. Explicit clear suppresses structured budget evidence and user-preference projection, even when the legacy operational band has a fallback. `buildTripCopilotProjection` is the actual verified consumer; its current context must distinguish cleared preference from fallback rather than always reporting fallback as chosen.

- [ ] **1. Write failing round-trip tests.** For each band assert projection→hydration→`tripFromBuilder`→serialization/recovery→copilot request retains it. In a cleared fixture, assert:

```ts
assert.equal(trip.brief.structuredBrief?.budget, undefined);
assert.equal(trip.brief.structuredBrief?.softPreferences.some(p => p.type === "budget"), false);
```

Use the existing `buildTripCopilotProjection`/`buildTripCopilotOpenAIRequest` test fixture in `tests/trip-copilot.test.ts` to assert the outgoing AI context does not present clear/fallback as selected:

```ts
assert.equal(buildTripCopilotProjection(trip).trip.preferences.budget, null);
```

Keep `TripCopilotProjection.trip.preferences.budget` as its existing `string | null`; no extra UI or new AI projection schema is needed just for a provenance label. Test explicit selection overrides late profile, untouched capture overrides profile, explicit clear suppresses both, and unrelated interests/endpoints remain unchanged.
- [ ] **2. Observe failure.** Run new budget suite and trip-copilot suite; current missing handoff budget/clear-source propagation must be exposed.
- [ ] **3. Implement narrow wiring.** Apply resolved budget after profile hydration and keep local `budget`, `effectiveIntent`, persisted brief and structured facts coherent. Strip budget soft preferences and budget fact on clear; preserve independent exact-budget unsupported warnings where still relevant to the original prompt rather than erasing unrelated evidence. The existing operational fallback does not become selected UI state. In the existing `preferenceProjection` owner, compute budget once for both structured/legacy branches:

```ts
const preference = trip.brief.budgetPreference;
const projectedBudget = preference
  ? preference.source === "cleared" || preference.source === "fallback"
    ? null : preference.value ?? null
  : structured
    ? structured.budget?.value ?? null
    : trip.brief.intent?.preferences.budgetSensitivity ?? trip.brief.budgetBand;
```

Use `budget: projectedBudget` in both existing returned objects, retaining all other fields. This preserves legacy behaviour for absent metadata and makes source/clear truthful. Do not claim or add general stay/activity price ranking, cheapest results or live availability.
- [ ] **4. Verify.** Run new suite, `npm run test:trip-copilot`, preservation/structured-brief suites and typecheck. Compare actual outgoing AI request context for value/mid/high/cleared fixtures. If another consumer is claimed to react to budget, identify and test it before the claim; no unrelated ranking redesign.
- [ ] **5. Commit.** Stage Task 8 paths; commit `fix: retain homepage budget intent through canonical planning`.

### Task 9: Connect submission and protect template starts with existing recovery UX

**Files:** Modify `home-trip-starter.tsx`, its stories, `home-trip-handoff.ts`, `storage.ts`, `app/journey/routes/[slug]/route-plan-link.tsx`; create `tests/homepage-submission.test.ts`; extend `tests/public-route-handoff.test.ts`, `tests/journey-capture-entry-parity.test.ts`, `tests/trip-browser-storage.test.ts`.

**Dependency gate:** Requires 5–8 and verified builder hydration. No new Continue/separate choice. If existing recovery/status UX cannot complete a safe handoff, stop for separate design approval instead of inventing UI.

**Interfaces:** Keep `createLatestJourneyCaptureRequestGate`, `requestJourneyCapture`, `beginNewTripNavigation` and `HomeTripStarter` as owners. Add a narrowly scoped transfer helper in handoff owner with injected existing preservation callback:

```ts
export async function commitHomepageHandoff(input: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  stored: StoredHomepageInput; draft: HomeTripDraft;
  isCurrent: () => boolean;
  preserveAndBegin: () => boolean;
}): Promise<{ ok: true; href: string } | { ok: false; reason: "stale" | "storage" | "preservation" }>;
```

`stored.receipt` must be prepared/validated before this call for a new versioned transfer. The helper stages input/receipt/handoff, verifies preservation, and returns a destination; caller alone navigates. It does not save canonical trips or display UI. Use an opaque `handoff` query discriminator validated in Task 7, never raw input in URLs.

- [ ] **1. Write failing submission/preservation tests.** Inject memory storage with failures on every write/remove and a cancelable preservation callback. Assert cancel causes no navigation/current-pointer loss; stale returns before mutation; double submit calls capture/transfer once; changing mode/input/owner invalidates capture; unchanged accepted receipt resumes the existing trip; changed input never writes the old canonical trip. Example:

```ts
let calls = 0;
const result = await commitHomepageHandoff({
  storage, stored, draft, isCurrent: () => false,
  preserveAndBegin: () => { calls++; return true; },
});
assert.deepEqual(result, { ok: false, reason: "stale" });
assert.equal(calls, 0);
```

`storage`, `stored`, `draft` are the Task 5/6 deterministic fixtures, with a valid receipt. Extend the existing memory-storage fixture rather than inventing a storage model. Test template start from Route Detail when no builder listener is mounted, expired auth, guest/account scopes, storage unavailable, old global handoff versus `inspire`, Ctrl/Meta-click/new tab and recovery retry.
- [ ] **2. Observe failure.** Run new submission and public-route-handoff/entry-parity/storage suites. The direct `clearActiveTrip` path and lack of revision guard should be represented by failing assertions.
- [ ] **3. Implement minimal connected flow.** `HomeTripStarter` stores snapshot on edits and on navigation; shared callbacks bump revision/cancel current request. Use a ref latch set synchronously before async work plus the existing request gate. The controller's submit entry follows this ordering (refs belong to `HomeTripStarter`, not a new orchestration owner):

```ts
if (submitInFlightRef.current) return;
submitInFlightRef.current = true;
const submittedRevision = snapshotRef.current.revision;
const submittedOwner = snapshotRef.current.ownerId;
const request = captureRequestGateRef.current!.begin();
const isCurrent = () => request.isCurrent()
  && snapshotRef.current.revision === submittedRevision
  && snapshotRef.current.ownerId === submittedOwner;
```

Every completion/error/finally branch checks ownership; only the matching request may release its latch/loading state. Cancel releases the matching latch after invalidating the request, so an old finally cannot unlock a newer submission. Stops mode projects directly; Describe calls canonical capture then projects overrides. Load profile only into untouched same-owner inputs using current state. Render existing feedback for capture/network/storage errors, preserve input and focus associated fields.

Prepare/verify snapshot+reserved receipt and prior handoff backup before invoking a preservation callback that may clear the current pointer. Recheck owner/revision before each externally visible action; no asynchronous gap between final recheck and the synchronous storage/preservation commit. On failure retain the new input and prior handoff recoverably; if restoration fails, expose existing recovery feedback rather than masking success. Reserve IDs before any clear, so retry cannot create a new document after a partial failure.

At Route Detail, reuse existing local cache/recovery loaders to prove current work is durable before `beginNewTripNavigation`; its event alone is insufficient when the builder is absent. Remove direct `clearActiveTrip` usage. Preserve prior input/handoff before overwriting the shared slot; template identity from `inspire` must not consume another submission. Modifier/new-tab activation must not mutate the source tab: let the destination run the same guarded template bootstrap before creating a document. Regular compact cards never call this helper.
- [ ] **4. Verify.** Run named suites, `npm run test:persistence`, typecheck, Storybook plays. Exercise back/forward/reload, failed request then retry, storage failures, guest and account switching. Verify one real trip per accepted handoff in canonical storage and preserved previous-trip recovery. Keep navigation component unchanged.
- [ ] **5. Commit.** Stage Task 9 paths; commit `feat: connect homepage planning through guarded canonical handoffs`.

## Phase C — Local integration and regression verification

### Task 10: Activate the connected homepage and remove temporary preview branches

**Files:** Modify `immersive-home.tsx`, `route-chapters.tsx`, `immersive.module.css`, `immersive-home.stories.tsx`, `components/easyt/morrovia-homepage.tsx` only if prop composition requires it, `tests/immersive-homepage.test.ts`, `tests/homepage-canonical-route.test.ts`, `tests/homepage-dual-entry-presentation.test.ts`, `docs/design-system.md` if owner mapping changed.

**Interfaces:** Final `ImmersiveHome({ routes, initialIndex })` keeps its existing public API. Remove temporary `presentation`, `plannerSlot` and `showIntroduction`; wide connected `HomeTripStarter` is now the sole planner. `RouteChapters` always renders its retained story/children, no original large introduction. Stories render actual connected owners with deterministic mocked capture/provider boundaries.

- [ ] **1. Write failing final-composition assertions.**

```ts
const source = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
assert.doesNotMatch(source, /presentation\?:|plannerSlot\?:/);
assert.match(source, /<HomeTripStarter/);
assert.match(source, /<HomepageRouteInspiration/);
assert.match(source, /<HomepageHowItWorks/);
```

Keep tests for original canonical `/` ownership, existing navigation destinations and publication truth. Rendered assertions require one nav/form/submit and one of each anchor. Do not broadly delete old tests just because their source strings changed.
- [ ] **2. Observe failure.** Run composition/immersive/canonical-route suites against preview candidate; temporary props should fail final assertions.
- [ ] **3. Activate and narrow.** Remove preview-only branches after B passes; route selection remains `index` in `ImmersiveHome`. The final order in its existing return is:

```tsx
<HomepageRouteInspiration routes={routes} />
<HomepageHowItWorks />
<RouteChapters routes={routes} index={index} onChange={setIndex} quiet={systemQuiet}>
  {(selected, change) => <><ProductDemo route={selected} routes={routes} change={change} /><AffiliateChapter routeKey={selected.key} /></>}
</RouteChapters>
<ClosingChapter />
```

The existing hero/nav above these nodes renders only connected `HomeTripStarter`. Remove only obsolete tall-introduction pinning/CSS, preserve story alternatives, demo selection, credits, affiliate and closing. Keep `#routes` scroll cue targeting compact section; preserve `#route-story`, `#product`, `#booking-support`, `#closing`, single `#start-building` and new `#how-it-works`. Update route-change default anchor to retained story where appropriate. No card handler or focus/hover route mutation. Update canonical design-system map for extracted shared capture ownership without introducing global restyles.
- [ ] **4. Verify.** Run new/existing homepage/navigation/publication suites, typecheck, build-storybook, strict UI audit. Repeat Phase A transition comparison with live planner and retained story. Materially disconnected/duplicative story still requires design review, not automatic removal. Check unchanged lower demo/affiliate links and real template action.
- [ ] **5. Commit.** Stage Task 10 paths; commit `feat: activate the connected dual-entry homepage`.

### Task 11: Verify the exact local candidate and record review evidence

**Files:** Extend existing tests only for uncovered failures within scope; create `docs/qa/2026-09-16-homepage-dual-entry-verification.md` as a concise evidence record during implementation. Screenshots/logs go under ignored `output/homepage-dual-entry/`; do not version generated media by default.

**Interfaces:** No new product API. Consumes final A/B/C candidate and unified-builder regression suites. Produces exact commit/tree, command results, screenshot locations and unresolved manual checks for implementation review.

- [ ] **1. Define outstanding failing acceptance scenarios before fixes.** Add regression assertions only when the connected scenario exposes a gap. Minimum browser assertion on every specified size:

```js
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) throw new Error('Homepage has horizontal page overflow');
const hero = await page.locator('#hero').boundingBox();
if (!hero || hero.height < viewport.height) throw new Error('Hero lost viewport minimum');
```

`page` and `viewport` are the existing authorized browser-automation page/viewport fixture; use equivalent supported browser calls if its API differs. Do not add Playwright/Vitest as a package dependency merely to run this plan. Existing Storybook native-DOM plays can throw on failed assertions; build does not execute/validate those plays automatically. If no runnable browser harness is available, record that rendered check as blocked rather than inventing a passing run.
- [ ] **2. Run connected scenarios.** Intercept capture/geocode with deterministic fixtures for errors, timeouts, ambiguity and out-of-order response. Inspect real canonical recovery documents for both modes and receipt reuse. Then smoke available real services locally and record unavailable external services. Test area-only, mixed area/stops, repeated visits, long names, endpoints sharing stop name, all preference sources/clears, duration, explicit/empty dates, changed restored input, duplicate click/Enter, route browsing and template preservation. Guest and authenticated/expired/mismatched scopes must preserve their own work. New user-facing conflict UX is not an authorized fix.
- [ ] **3. Run exact-tree quality gates.** Resolve actual filenames on the integrated tree; do not treat missing suites as passing:

```bash
npm run typecheck
npm run build:check
npm run build-storybook
npm run audit:ui
npm run test:builder-gate
npm run test:persistence
npm run test:trip-copilot
node --experimental-strip-types --test tests/homepage-dual-entry-presentation.test.ts tests/homepage-destination-entry.test.ts tests/homepage-inspiration.test.ts tests/homepage-input-projection.test.ts tests/homepage-input-preservation.test.ts tests/homepage-builder-hydration.test.ts tests/homepage-budget-propagation.test.ts tests/homepage-submission.test.ts tests/homepage-routes.test.ts tests/homepage-canonical-route.test.ts tests/immersive-homepage.test.ts tests/navigation-information-architecture.test.ts tests/journey-capture-entry-parity.test.ts tests/journey-capture-corpus.test.ts tests/journey-endpoints.test.ts tests/trip-interests.test.ts tests/travel-profile-interests.test.ts tests/public-route-handoff.test.ts tests/route-editorial-imagery.test.ts tests/state-preservation-torture.test.ts
git diff --check
```

Also run the now-implemented unified-builder order, view, document-commit, route-preview, reorder and Route Check tests. For lint, inspect the installed Next/ESLint configuration and use the repository-supported invocation; report the legacy `next lint` script failure if it is unsupported, never silently skip a required gate. Do not run a hosted release gate or deploy.
- [ ] **4. Complete visual/accessibility comparison.** Capture after evidence at 1920×1080, 1440×900, 1366×768, 768×1024, 390×844, 320px and 200%/400% browser zoom. Compare supplied current screenshot for unchanged nav/full-height/photo and final mockup for approved composition. Inspect keyboard tabs, focus rings, autocomplete selection, removal/reordering announcements, date dialog Escape/focus restoration, tour close focus, Spanish, reduced motion, loading/validation/failure, photo failure, empty eligible routes, open details and no page overflow. Review transition to independently selected Route Story; card focus/hover/click must not imply ownership of it. Build success is not visual acceptance.
- [ ] **5. Record and commit evidence.** Write exact candidate SHA/tree, commands with pass/fail results, affected shared components/stories, screenshot locations and any incomplete service/manual checks to the QA Markdown. Commit `docs: record homepage dual-entry verification`. Recheck clean status and `git diff --check` for the final commit range. Return local commits and request implementation review; no push/merge/deployment.

## Plan self-review and completion conditions

Coverage map: spec visual/navigation/photo decisions → 1/3/4/10/11; component reuse → 1–4/10; input precedence → 2/5; canonical handoff → 5–9; restoration/idempotency/template protection → 6/7/9; budget effect → 8; lower-story ownership and transition gate → 3/4/10/11; unified-builder integration order → 7/8/9 and dependency table; all acceptance viewports/accessibility → 4/11.

Planning self-review must check placeholders, internal consistency, scope, ambiguity, symbol/type consistency and unified-builder dependencies. No proposed symbol is assumed to exist already. Test fragments use Node `assert`/`test`, imports from their named owner and fixture helpers defined in Tasks 2/5; complete them within those named suites, not a duplicate test model. Browser cases exercise production components, not story-only imitations.

Known implementation gates remain the approved ones: unified-builder hydration/atomic editing reconciliation, structured occurrence-safe durability, reliable intake/template preservation and clear/source budget propagation. The current screenshot is not a blocker. A material staging/screenshot discrepancy, misleading retained-story transition, proven need for new conflict UX, or unavailable required runtime evidence is a review/verification stop condition, not permission to broaden scope. This planning pass does not claim tests or screenshots for unimplemented code.

Stop for implementation-plan review. Do not begin Task 1 until execution is authorized.

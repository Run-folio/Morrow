# Adaptive Visual Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved Australia journey from broad intent through visual directions, 20+ evidenced places, a durable shortlist, review, and explicit canonical Builder handoff.

**Architecture:** Extend the existing #321 capture, canonical place, structured brief, clarification, and Builder mutation owners. Add small pure evidence, direction, draft, projection, review, and commit modules; render one modal journey using the existing focus shell and shared map foundations. Australia is the complete first content/product slice; other geographies receive contract fixtures and retain existing clarification fallbacks.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Node test runner with `--experimental-strip-types`, Storybook 10, MapLibre 6 through the existing map runtime, existing trip repository/recovery and consented PostHog analytics.

**Spec:** `docs/superpowers/specs/2026-09-24-adaptive-visual-discovery-design.md` at `02918019d562a68c70ac255a6cb4663be4cf6b6c`.

## Global Constraints

- **Exact implementation code base:** `02918019d562a68c70ac255a6cb4663be4cf6b6c`; create a separate execution worktree from this SHA. This plan commit is documentation only; read this file from the plan worktree if the execution worktree starts at the spec SHA. Do not start from plain `origin/staging`.
- **Ancestry at plan authoring:** `origin/staging` and the remote `staging` head both equal `1b762d19ebb9eb6f65cc7f84d7b35e046a0a888c`; the approved spec head is six commits ahead, with no staging-only commits. It includes `a1dcd8f` dashboard P0, `1941435` map selection/detail restoration, `13d878e` mobile Map drawer, `59d9281` homepage demo itinerary polish, and two spec commits. Do not merge, rebase, push, or change refs as part of this plan.
- Keep original mentions, fixed plans, explicit additions/removals, country/parent containment, and existing route stops authoritative. Do not invent travel, access, duration, availability, or image facts from mockups or generated prose.
- Australia requires **at least 20 distinct displayed canonical places** with valid coordinates/containment and reviewed visitor-relevance evidence. Some may be browse-only; incomplete route, overnight, or access evidence blocks overnight commitment. Do not fill the threshold with weak sources.
- One modal shell; internal Back changes only the visible step. Only explicit Add, Remove, Change direction/base, or Reset changes choices. No per-step browser-history entries, nested dialogs, second place resolver, or second route optimizer.
- A pin/card highlight is transient and cannot mutate or persist route truth. Only explicit final confirmation may call Builder's canonical Add stop/visit path. Reuse existing stops and their nights. Partial failure stays recoverable.
- Use `app/journey/journey-design.css`, `docs/design-system.md`, `EasyTButton`, existing loading/feedback/photo-credit components, current Journey surfaces, and Storybook. English and Spanish cover every new UI state. Mobile has one vertical content scroll owner and safe-area clearance; do not recreate the mobile Map drawer's former fixed-footer problem.
- Follow test-first red → green for every task. Before every commit run the task commands and `git diff --check`; before calling the whole slice complete run `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, and the focused suites below. Browser automation remains opt-in under `AGENTS.md`; do not silently launch it.

## Review Focus

Five highest-risk real-user inputs beyond the sunny Australia path; the named owning tasks contain their regression tests.

1. A traveller explicitly clears every default, reloads, and sees the shortlist still empty rather than regenerated (Task 2).
2. A traveller goes Back after choosing a direction and a base, then returns to review with both choices intact (Tasks 2 and 4).
3. A traveller selects a scenic park with no verified overnight/access evidence; review allows exploration but cannot submit it as a stay (Tasks 1, 3, and 8).
4. A traveller already has Sydney with manual nights; confirmation reuses that stop, and a retry after a later failure cannot add it twice (Task 8).
5. A traveller on a 320 px phone opens Discovery with a map failure or no photo; cards, credit/fallback, Back, and Continue remain readable and reachable without a covered final card (Tasks 5, 6, and 9).

---

## File and interface map (lock these boundaries before coding)

| Owner | Exact files | Responsibility |
| --- | --- | --- |
| Canonical identity and evidence | Modify `lib/easyt/place-catalog.ts`; create `lib/easyt/discovery-content.ts`, `lib/easyt/australia-discovery-content.ts`; modify `public/journey/immersive/destination-inventory.json` only for licensed assets actually acquired; create `tests/discovery-content.test.ts` | Catalogue remains identity/containment only. Australia evidence overlay owns reviewed visitor reason, action eligibility, region/experience tags, bilingual factual summaries, source references, and image key or intentional no-image state. Photo records continue through `lib/easyt/route-images.ts`; never duplicate license fields in a component. |
| Directions and projection | Create `lib/easyt/discovery-directions.ts`, `lib/easyt/discovery-projection.ts`, `tests/discovery-projection.test.ts` | Stable direction/group IDs and pure browse/rank projection. Existing `country-discovery.ts` remains available for unconverted geographies; no global six-item cap on the Australia browse collection. |
| Versioned draft | Create `lib/easyt/discovery-draft.ts`, `tests/discovery-draft.test.ts`; modify `lib/easyt/structured-trip-brief.ts`; extend `tests/structured-trip-brief.test.ts`, `tests/builder-persistence-acceptance.test.ts` | Per-mention, versioned draft with migration from `countryDiscoveryChoices`. Route stops and `PlaceSelection` remain separate canonical truth. |
| Entry and review | Create `lib/easyt/discovery-entry.ts`, `lib/easyt/discovery-review.ts`, `lib/easyt/discovery-commit.ts`, `tests/discovery-entry.test.ts`, `tests/discovery-review.test.ts`, `tests/discovery-commit.test.ts` | Entry/skip classification, reviewed proposal, and idempotent adapter boundary. It consumes existing route/night/validation results, never computes a new route. |
| Modal | Create `components/easyt/builder-clarification-shell.tsx`, `components/easyt/discovery-modal.tsx`, `components/easyt/discovery-steps.tsx`, `components/easyt/discovery-modal.module.css`, `components/easyt/discovery-modal.stories.tsx`; modify `components/easyt/builder-clarification-dialog.tsx`, `app/journey/new/trip-builder.tsx`; create `tests/discovery-modal-contract.test.ts` | Extract existing focus/Escape/return-focus shell, compose Australia steps in focused components, and keep Builder wiring thin. The old clarification path remains functional. |
| Map preview | Create `components/easyt/discovery-map.tsx`, `lib/easyt/discovery-map-target.ts`, `tests/discovery-map-target.test.ts`; modify `components/easyt/discovery-modal.tsx`, `components/easyt/discovery-modal.stories.tsx` | Controlled `highlightedPlaceId` shared by cards and map. Reuse `morrovia-map-runtime.ts`, `morrovia-map-presentation.ts`, marker activation and basemap attribution; do not present browseable places as numbered itinerary stops. Dynamically import this component only when a map view is requested. |
| Locale, analytics, visual gates | Modify `lib/easyt/i18n.ts`, `lib/analytics.ts`, `docs/product/jtbd-analytics.md`, `components/easyt/discovery-modal.stories.tsx`; create `tests/discovery-localization.test.ts`, `tests/discovery-analytics.test.ts`, `tests/discovery-performance.test.ts`; extend `tests/ui-convergence.test.ts` | Typed EN/ES copy and consented, privacy-safe funnel events. Storybook and build/static checks own viewports and performance guards. |

### Shared signatures and invariants

These are the names each task must implement and later tasks must consume. Use actual `ResolvedPlaceMention`, `PlaceSelection`, `StructuredTripBrief`, `EasyTTrip`, and `KnowledgeSource` types from the repository; avoid duplicate identity models.

```ts
type DiscoveryActionability = "overnight-base" | "visit" | "browse-only";
type DiscoveryStep = "directions" | "places" | "bases" | "review";
type DiscoveryDraft = {
  version: 1; step: DiscoveryStep; directionId: string | null;
  shortlistIds: string[]; baseByIntentId: Record<string, string>;
  visitBaseByIntentId: Record<string, string>; removedIds: string[];
  reviewState: "editing" | "ready" | "confirmed";
};
type DiscoveryPlace = {
  id: string; name: string; country: string; coordinates: [number, number];
  placeType: PlaceTypeLiteral; groupIds: string[]; actionability: DiscoveryActionability;
  relevance: { en: string; es: string; sources: readonly KnowledgeSource[] };
  stayEvidence: readonly KnowledgeSource[]; accessEvidence: readonly KnowledgeSource[];
  imageKey: string | null;
};
type DiscoveryDirection = { id: string; titleKey: string; placeIds: string[]; imageKey: string | null };
type DiscoveryProjection = {
  places: DiscoveryPlace[]; directions: DiscoveryDirection[];
  visiblePlaceIds: string[]; recommendedIds: string[]; totalEligible: number;
  counts: { source: number; eligible: number; ranked: number; displayed: number };
};
type DiscoveryDraftAction =
  | { type: "set-step"; step: DiscoveryStep }
  | { type: "change-direction"; directionId: string | null }
  | { type: "add-shortlist" | "remove-shortlist"; placeId: string }
  | { type: "choose-base" | "choose-visit-base"; intentId: string; baseId: string }
  | { type: "mark-review-ready" | "mark-confirmed" | "reset" };
type DiscoveryReview = {
  newBaseIds: string[]; reusedStopIds: string[];
  visits: Array<{ intentId: string; baseId: string }>;
  blockedIds: string[]; warningCodes: string[];
  primaryAction: { kind: "confirm-selected-places" | "resolve-choices"; count: number };
};
type DiscoveryCommitPorts = {
  findExistingStop: (canonicalPlaceId: string) => { id: string } | null;
  addBase: (canonicalPlaceId: string) => Promise<{ id: string } | null>;
  linkVisit: (intentId: string, baseStopId: string) => Promise<boolean>;
  persist: () => Promise<boolean>;
  completeMention: () => void;
};
type DiscoveryCommitResult = { ok: boolean; committedIds: string[]; pendingIds: string[] };

createDiscoveryDraft(): DiscoveryDraft;
readDiscoveryDraft(brief: StructuredTripBrief, mentionId: string):
  { draft: DiscoveryDraft; status: "new" | "current" | "migrated" | "unsupported-version" };
reduceDiscoveryDraft(draft: DiscoveryDraft, action: DiscoveryDraftAction): DiscoveryDraft;
projectDiscovery(input: {
  mention: ResolvedPlaceMention; draft: DiscoveryDraft;
  context: { durationDays?: number; interests: string[]; existingPlaceIds: string[] };
}): DiscoveryProjection;
discoveryPlaceScore(place: DiscoveryPlace, context: { durationDays?: number; interests: string[]; existingPlaceIds: string[] }): number;
discoveryEntryForBrief(brief: StructuredTripBrief, existingPlaceIds: string[]):
  { kind: "skip" | "clarification" | "continent" | "country" | "landmark" | "natural-area"; mentionId?: string };
buildDiscoveryReview(input: { mention: ResolvedPlaceMention; draft: DiscoveryDraft;
  projection: DiscoveryProjection; trip: EasyTTrip }): DiscoveryReview;
commitDiscoveryReview(review: DiscoveryReview, ports: DiscoveryCommitPorts): Promise<DiscoveryCommitResult>;
selectCanonicalSearchResult(draft: DiscoveryDraft, result: { canonicalPlaceId: string; country: string }, eligiblePlaces: readonly DiscoveryPlace[]): DiscoveryDraft;
availableActions(place: DiscoveryPlace): Array<"explore" | "shortlist" | "stay-here" | "visit-from-base" | "choose-base">;
renderDiscoveryReason(language: "en" | "es", place: DiscoveryPlace): string;
```

`DiscoveryPlace` is a read-only projection of catalogue identity plus reviewed evidence, not a second catalogue row. `DiscoveryReview` contains `newBaseIds`, `reusedStopIds`, `visits`, `blockedIds`, and existing warning codes; `DiscoveryCommitPorts` binds to Builder's existing `addGuidedPlanningPlace`, `confirmAttractionVisit`, persistence, and completion actions. The review/commit module never imports `trip-builder.tsx`. A browse-only item can be shortlisted but never included in `newBaseIds`. Direction changes retain explicit shortlist IDs and flag out-of-group items for review. `set-step`/Back changes only `step`.

Test examples below assume local `node:test` fixtures. Define `mention(name)` with `resolvePlaceMentions(name).mentions[0]` and an assertion that it exists, as in `tests/country-discovery.test.ts`. For the Task 8 Sydney fixture, use `tripFromBuilder` as in `tests/builder-persistence-acceptance.test.ts`, with an `existing-sydney-stop` carrying canonical ID `sydney`, a manual-night stop ID, and an explicit night allocation. Synthetic Kruger camp/gateway fixtures are typed contract data and never published destination content.

## Task 1: Canonical Australia evidence and 20+ coverage

**Files:** Modify `lib/easyt/place-catalog.ts`; create `lib/easyt/discovery-content.ts`, `lib/easyt/australia-discovery-content.ts`, `tests/discovery-content.test.ts`; modify `public/journey/immersive/destination-inventory.json` and add licensed `public/journey/immersive/discovery-au-east-960.webp`, `discovery-au-south-960.webp`, `discovery-au-tasmania-960.webp`, `discovery-au-west-960.webp`, `discovery-au-north-960.webp` only when their source/license/credit records are verified. No image is preferable to an unattributed image.

**Interfaces:** Produces `DiscoveryPlace`, `DiscoveryActionability`, `discoveryPlaceForId(id): DiscoveryPlace | null`, and `australiaDiscoveryPlaces(): DiscoveryPlace[]`. Consumes `findCatalogPlaceById`, `routeDestinationPhoto`, `routeImageCredit`, `KnowledgeSource`, and country containment. The evidence file stores `imageKey: null` intentionally when no licensed image exists.

- [ ] **Step 1: Write failing content tests.** Use the repository Node test style. The first example must fail on the current seven-source/one-eligible Australia state:

```ts
const places = australiaDiscoveryPlaces();
assert.ok(places.length >= 20);
assert.equal(new Set(places.map(p => p.id)).size, places.length);
for (const p of places) {
  const catalog = findCatalogPlaceById(p.id);
  assert.equal(catalog?.parentCountries.includes("Australia"), true);
  assert.ok(p.coordinates.every(Number.isFinite) && p.relevance.sources.length > 0);
  assert.ok(p.relevance.sources.every(source => source.url?.startsWith("https://") && source.reviewedAt && source.supports.trim()));
  assert.ok(p.relevance.en.trim() && p.relevance.es.trim());
  assert.ok(p.imageKey === null || routeEditorialPhoto(p.imageKey));
  if (p.actionability === "overnight-base") {
    assert.ok(["city", "town", "transport_gateway"].includes(p.placeType));
    assert.ok(p.stayEvidence.length > 0);
  }
}
assert.equal(discoveryPlaceForId("uluru-kata-tjuta")?.actionability === "overnight-base", false);
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-content.test.ts`; expected failure: module/20-place threshold absent. Audit 26 candidate identities as a **review queue**, not automatically publishable facts: Sydney, Melbourne, Hobart, Adelaide, Brisbane, Cairns, Airlie Beach, Byron Bay, Gold Coast, Noosa, Port Douglas, Townsville, Darwin, Alice Springs, Uluru–Kata Tjuta, Kakadu, Perth, Fremantle, Margaret River, Broome, Esperance, Launceston, Freycinet, Cradle Mountain, Kangaroo Island, Great Ocean Road. For each published item inspect an official destination/park source, record exact URL, fact supported, reviewer date, coordinates/containment, role, and EN/ES relevance; omit failures and research replacements until at least 20 pass. Route-family `needs-review` is not independent visitor proof.
- [ ] **Step 3: Implement the smallest data overlay.** Add canonical rows and coordinates to `place-catalog.ts`, keeping identity separate from visitor appeal. Add per-place reviewed evidence and actionability in `australia-discovery-content.ts`; `discovery-content.ts` joins it to canonical rows and validates coordinates, parent country, duplicate IDs, source dates, and image attribution. Parks/natural areas remain `visit` or `browse-only` without a verified base/access relationship. Use existing photo inventory helpers; encode five optional hero keys only after licensed image records exist. Do not silently downgrade missing evidence into an overnight base.

```ts
const catalog = findCatalogPlaceById(row.id);
if (!catalog || !catalog.coordinates || !catalog.parentCountries.includes("Australia") || !row.relevance.sources.length) return null;
const actionability = row.stayEvidence.length && ["city", "town", "transport_gateway"].includes(catalog.placeType)
  ? "overnight-base" : row.accessEvidence.length ? "visit" : "browse-only";
```
- [ ] **Step 4: Run green and commit.** `node --experimental-strip-types --test tests/discovery-content.test.ts tests/destination-knowledge.test.ts tests/place-intelligence.test.ts`; `npm run typecheck`; `git diff --check`. Commit `feat(discovery): curate evidenced Australia collection`. Reviewer can reject this task independently if any of the 20+ rows lacks source support.

## Task 2: Versioned draft, migration, and durable empty choices

**Files:** Create `lib/easyt/discovery-draft.ts`, `tests/discovery-draft.test.ts`; modify `lib/easyt/structured-trip-brief.ts`, `tests/structured-trip-brief.test.ts`, `tests/builder-persistence-acceptance.test.ts`.

**Interfaces:** Produces `DiscoveryDraft`, `DiscoveryDraftAction`, `readDiscoveryDraft`, `reduceDiscoveryDraft`, and optional `StructuredTripBrief.discoveryDraftByMentionId?: Record<string, DiscoveryDraft>`. Consumes legacy `countryDiscoveryChoices`, `placeMentions`, existing brief merge, Builder recovery serialization. No trip schema bump unless a tested reader rejects the optional JSON field; `repository.ts` stores `brief` as JSONB and `builderDocumentFingerprint` already includes `structuredBrief`.

- [ ] **Step 1: Write failing migration/reducer tests.** Test absent legacy versus explicit empty, one-time migration, unsupported version, and Back:

```ts
const brief = extractStructuredTripBrief("Australia");
const mentionId = "mention-australia";
assert.deepEqual(readDiscoveryDraft({ ...brief, countryDiscoveryChoices: { [mentionId]: [] } }, mentionId).draft.shortlistIds, []);
assert.equal(readDiscoveryDraft({ ...brief, countryDiscoveryChoices: { [mentionId]: [] } }, mentionId).status, "migrated");
assert.notEqual(readDiscoveryDraft(brief, mentionId).status, "migrated");
const chosen = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "sydney" });
assert.deepEqual(reduceDiscoveryDraft(chosen, { type: "set-step", step: "directions" }).shortlistIds, ["sydney"]);
const migrated = readDiscoveryDraft({ ...brief, countryDiscoveryChoices: { [mentionId]: [] } }, mentionId);
assert.equal(readDiscoveryDraft({ ...brief, discoveryDraftByMentionId: { [mentionId]: migrated.draft } }, mentionId).status, "current");
assert.equal(readDiscoveryDraft({ ...brief, discoveryDraftByMentionId: { [mentionId]: { ...chosen, version: 99 } as unknown as DiscoveryDraft } }, mentionId).status, "unsupported-version");
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-draft.test.ts tests/structured-trip-brief.test.ts tests/builder-persistence-acceptance.test.ts`; expected new module/field assertions fail. Add a test that an explicitly removed ID is retained through JSON stringify/parse and `mergeStructuredTripBrief`, and a saved draft never recomputes legacy defaults on reload.
- [ ] **Step 3: Implement.** Freeze version at `1`; define actions `set-step`, `change-direction`, `add-shortlist`, `remove-shortlist`, `choose-base`, `choose-visit-base`, `mark-review-ready`, `mark-confirmed`, `reset`. Persist `removedIds` on explicit removal. `set-step` changes no other property; `change-direction` preserves shortlist/base/visit data but marks out-of-group items for review later. On read: current draft wins; otherwise migrate an own-property legacy array once, including `[]`; absence creates a new draft. Unknown/newer versions preserve raw brief and return an unsupported status that routes to ordinary clarification, never a reset. Write new state only to `discoveryDraftByMentionId`; keep legacy arrays readable without dual writes.

```ts
if (action.type === "set-step") return { ...draft, step: action.step };
if (action.type === "remove-shortlist") return {
  ...draft,
  shortlistIds: draft.shortlistIds.filter(id => id !== action.placeId),
  removedIds: [...new Set([...draft.removedIds, action.placeId])],
};
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run typecheck`, `npm run test:persistence`, `git diff --check`; commit `feat(discovery): persist versioned per-mention draft`.

## Task 3: Deterministic directions, grouping, ranking, and contract fixtures

**Files:** Create `lib/easyt/discovery-directions.ts`, `lib/easyt/discovery-projection.ts`, `tests/discovery-projection.test.ts`; extend `tests/country-discovery.test.ts` only where shared #321 behaviour must be protected.

**Interfaces:** Produces `DiscoveryDirection`, `DiscoveryProjection`, `projectDiscovery`. Consumes Task 1 evidence, Task 2 draft, `ResolvedPlaceMention`, interests, existing canonical stop IDs. `places` is the full evidenced browse collection; `visiblePlaceIds` is a bounded progressively exposed group/page; `recommendedIds` is a separate conservative proposal. No suggested shape is a route commitment.

- [ ] **Step 1: Write failing projection tests.** Use real Australia evidence plus small synthetic fixtures for shared architecture:

```ts
const australia = projectDiscovery({ mention: mention("Australia"), draft: createDiscoveryDraft(), context: { interests: [], existingPlaceIds: [] } });
assert.ok(australia.places.length >= 20);
assert.ok(australia.directions.length >= 4);
assert.ok(australia.directions.every(direction => direction.placeIds.length >= 3));
assert.ok(australia.visiblePlaceIds.length < australia.places.length);
assert.ok(australia.recommendedIds.length < australia.places.length);
assert.ok(australia.places.some(p => p.id !== "sydney" && p.actionability === "overnight-base"));
const noDuration = projectDiscovery({ mention: mention("Australia"), draft: createDiscoveryDraft(), context: { interests: [], existingPlaceIds: [] } });
assert.ok(!JSON.stringify(noDuration).includes("fits the current plan"));
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-projection.test.ts tests/country-discovery.test.ts`; expected Australia 20+, directions, and new projection fail. Add data-driven count assertions for source ≥20 → eligible ≥20 → ranked ≥20 → first displayed bounded, with explicit reasons for any rejected row. Test no duration, 6-day and 24-day contexts, Sydney alone, Sydney+Melbourne, fixed non-Australia anchors, nature/coast interests, and explicit removal: the browse count stays broad while recommendation fit changes. Test stable sort and no `route-base:` ID leaks.
- [ ] **Step 3: Implement.** Define curated, geography/experience group IDs in `discovery-directions.ts` (east/coast, southern cities/coast, Tasmania/nature, west, north/interior are editorial group labels, not feasible route claims). A direction filters presentation only; selected out-of-group IDs remain in the shortlist. Rank by explicit anchor, reviewed interest tag, evidence strength, and geographic diversity with stable ID tie-breaks. A direction can highlight places but cannot add stops. Preserve `country-discovery.ts` behaviour for other countries while Australia consumes this new projection; avoid a worldwide migration.

```ts
const places = australiaDiscoveryPlaces().filter(place => place.country === "Australia");
const ranked = [...places].sort((a, b) => discoveryPlaceScore(b, context) - discoveryPlaceScore(a, context) || a.id.localeCompare(b.id));
const visiblePlaceIds = ranked.filter(place => !draft.directionId || place.groupIds.includes(draft.directionId)).slice(0, 6).map(place => place.id);
// Keep draft.shortlistIds unchanged when directionId changes.
```
- [ ] **Step 4: Add architecture contract fixtures.** `tests/discovery-projection.test.ts` must prove an Africa direction does not silently select a country; Taj remains an anchor while Agra is a base candidate; Kruger park and camp/gateway IDs remain different; Lake Atitlán visit and base differ; a precise route yields no discovery projection. Fixtures may use typed synthetic evidence where production coverage is incomplete and must not publish those examples as travel facts.
- [ ] **Step 5: Run green and commit.** Run the red command, `npm run typecheck`, `git diff --check`; commit `feat(discovery): project evidenced directions and places`.

## Task 4: Entry rules and one reusable modal step shell

**Files:** Create `lib/easyt/discovery-entry.ts`, `tests/discovery-entry.test.ts`, `components/easyt/builder-clarification-shell.tsx`, `components/easyt/discovery-modal.tsx`, `tests/discovery-modal-contract.test.ts`; modify `components/easyt/builder-clarification-dialog.tsx`, `app/journey/new/trip-builder.tsx` only to share the shell and call the entry classifier. Defer visual step bodies to Task 5.

**Interfaces:** Produces `discoveryEntryForBrief` and `DiscoveryModal` props `{ open, mention, projection, draft, onAction, onConfirm, onClose }`. Consumes Task 2 draft and Task 3 projection. Extracts the existing focus trap, Escape, body scroll lock, and focus return from `BuilderClarificationDialog`; its legacy contents/commands remain unchanged.

- [ ] **Step 1: Write failing entry and shell tests.** Examples:

```ts
assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Australia"), []).kind, "country");
assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Africa"), []).kind, "continent");
assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Taj Mahal"), []).kind, "landmark");
assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Lake Atitlán"), []).kind, "natural-area");
assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Kruger National Park"), []).kind, "clarification");
assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Sydney then Melbourne, 10 days"), ["sydney", "melbourne"]).kind, "skip");
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-entry.test.ts tests/discovery-modal-contract.test.ts tests/builder-clarification-followup.test.ts`; expected new owner assertions fail. In `tests/discovery-modal-contract.test.ts`, assert one `role="dialog"`, no nested dialog, Escape closes, return focus is preserved, internal Back emits only `{type:"set-step"}`, and no `history.pushState`/`popstate` integration. Use the existing Storybook/modal source-contract style where DOM simulation is unavailable.
- [ ] **Step 3: Implement.** Route an actionable precise route directly to Builder. For resolved continent, country, landmark, and park/natural area return a typed entry, but open the new step UI end-to-end only for Australia. Currently unresolved Kruger returns `clarification` until canonical park evidence exists; the classifier must not invent that identity. Other entries keep the current #321 clarification until their evidence is ready; the pure classifier and fixtures establish extensibility without a five-geography rollout. Extract shared modal mechanics rather than growing the 352-line dialog. The new shell renders one scroll owner and one step slot; the Builder file only selects entry, passes callbacks, and retains existing resume state. Do not touch page/router history.

```tsx
return <BuilderClarificationShell open={open} onDismiss={onClose} title={title}>
  <DiscoverySteps projection={projection} draft={draft} onAction={onAction} onConfirm={onConfirm} />
</BuilderClarificationShell>;
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run typecheck`, `npm run build:check`, `git diff --check`; record the `/journey/new` initial JS route size and modal-opening baseline before image/map work, then commit `refactor(discovery): share clarification shell and classify entry`.

## Task 5: Visual Australia directions, places, shortlist, and locale

**Files:** Create `components/easyt/discovery-steps.tsx`, `components/easyt/discovery-modal.module.css`, `components/easyt/discovery-modal.stories.tsx`, `tests/discovery-localization.test.ts`; modify `components/easyt/discovery-modal.tsx`, `lib/easyt/i18n.ts`, `tests/discovery-modal-contract.test.ts`. Reuse `EasyTButton`, `MorroviaPhotoCredit`, `MorroviaMapLoading`, and current status controls; do not invent parallel primitives.

**Interfaces:** `DiscoveryModal` consumes Task 3 projection and Task 2 draft. `DiscoverySteps` emits `DiscoveryDraftAction`; bilingual factual place summaries come from Task 1 evidence, while UI grammar/labels and recommendation categories come from `easytCopy` and typed presentation helpers in `i18n.ts`.

- [ ] **Step 1: Write failing UI/copy tests.** Assert a direction opens the place group without calling `onConfirm`, selecting/clearing shortlist emits explicit actions, a browse-only card has no Stay action, and EN/ES include direction copy, types, roles, shortlist, review labels, sparse/error labels, and accessible names:

```ts
assert.equal(easytCopy.en.builder.visualDiscovery.actions.shortlist, "Add to shortlist");
assert.equal(easytCopy.es.builder.visualDiscovery.actions.shortlist, "Añadir a la selección");
assert.match(renderDiscoveryReason("es", place), /\S/);
assert.equal(place.actionability === "browse-only" && availableActions(place).includes("stay-here"), false);
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-modal-contract.test.ts tests/discovery-localization.test.ts tests/country-discovery-localization.test.ts`; expected new story/copy/action contracts fail.
- [ ] **Step 3: Implement.** Build image-led direction cards, progressively revealed place cards, clear selected treatment and emerging shortlist, contained search entry, evidence/source disclosure, intentional no-photo state, loading/sparse/error states. Use source-linked photo credits and asset variants; lazy-load place imagery and never request 20 full-resolution assets at once. Do not render English factual reasons directly in JSX. Build Storybook states for Australia directions, dense collection, selected shortlist, browse-only, reused stop, no photo, sparse evidence, review, and English/Spanish. Use 320/390/430/768/1024/1440/1680 viewport parameters.

```tsx
<EasyTButton aria-pressed={draft.shortlistIds.includes(place.id)} onClick={() => onAction({
  type: draft.shortlistIds.includes(place.id) ? "remove-shortlist" : "add-shortlist", placeId: place.id,
})}>{copy.actions.shortlist}</EasyTButton>
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run build-storybook`, `npm run audit:ui`, `npm run typecheck`, `git diff --check`; commit `feat(discovery): render visual Australia exploration`.

## Task 6: Controlled map ↔ card preview

**Files:** Create `lib/easyt/discovery-map-target.ts`, `components/easyt/discovery-map.tsx`, `tests/discovery-map-target.test.ts`; modify `components/easyt/discovery-modal.tsx`, `components/easyt/discovery-modal.stories.tsx`. Reuse `components/easyt/morrovia-map-presentation.ts`, `components/easyt/morrovia-map-runtime.ts`, `lib/easyt/map-surface-policy.ts`, and `bindMapMarkerActivation` from `lib/easyt/map-spatial-context.ts`; do not mutate trip-map result selection or render browse items as numbered trip stops.

**Interfaces:** `DiscoveryMap({ places, highlightedPlaceId, onHighlight, onUnavailable })` is controlled. `discoveryMapTarget(placeId, places)` returns exact canonical coordinates or `null`. Parent owns `highlightedPlaceId`; map has no shortlist/route callbacks. The map module is dynamically imported when desktop context is visible or the mobile Map view is opened, not on `/journey/new` initial load.

- [ ] **Step 1: Write failing map tests.** Examples:

```ts
assert.deepEqual(discoveryMapTarget("sydney", places), { id: "sydney", coordinates: sydney.coordinates });
assert.equal(discoveryMapTarget("unknown", places), null);
assert.equal(discoveryMapTarget("melbourne", places)?.id, "melbourne");
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-map-target.test.ts tests/map-surface-policy.test.ts tests/map-camera-and-icons.test.ts`; expected new exact-target tests fail. Add modal source-contract assertions that card and pin both set the same `highlightedPlaceId`, pin click reveals/focuses the exact card, and no map handler references `addStop` or `onConfirm`.
- [ ] **Step 3: Implement.** Render preview pins from canonical IDs/coordinates using shared basemap, marker activation, camera, attribution and selected-marker styling. A pin action focuses the matching card; a card action focuses the pin. Map failure/unavailable falls back to cards with a localized status. Mobile Map view is optional and returns to the same highlighted card; no drag gesture is required. Do not persist the highlight, create a second selected-place store, or infer route lines from visual proximity.

```ts
const target = discoveryMapTarget(place.id, places);
if (target) bindMapMarkerActivation(markerElement, () => onHighlight(target.id));
// The matching card's focus handler calls the same onHighlight(place.id).
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run typecheck`, `npm run build-storybook`, `git diff --check`; commit `feat(discovery): link exact map pins and cards`.

## Task 7: Explicit place actions, search fallback, and resume wiring

**Files:** Modify `components/easyt/discovery-steps.tsx`, `components/easyt/discovery-modal.tsx`, `app/journey/new/trip-builder.tsx`, `lib/easyt/discovery-draft.ts`; create `tests/discovery-actions.test.ts`; extend `tests/builder-persistence-acceptance.test.ts`, `tests/discovery-modal-contract.test.ts`. Keep canonical provider search through the existing `app/journey/new/trip-builder.tsx` search props and `place-intelligence.ts` containment helpers.

**Interfaces:** All actions dispatch the Task 2 reducer. `search` selection resolves through the existing canonical lookup, then dispatches the same `add-shortlist`/`choose-base`/`choose-visit-base` action as a card. No direct Add stop from search or card. `PlaceSelection` retains the original mention and base/visit relationship at final commit.

- [ ] **Step 1: Write failing action/resume tests.** Include Add/Remove, Stay here only for an evidenced settlement, Visit from base, Choose/Change base, Split stay only when supported, Search for somewhere specific, and Reset. The search path must yield the same draft as a card selection:

```ts
const byCard = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "melbourne" });
const bySearch = selectCanonicalSearchResult(createDiscoveryDraft(), { canonicalPlaceId: "melbourne", country: "Australia" }, australiaDiscoveryPlaces());
assert.deepEqual(bySearch.shortlistIds, byCard.shortlistIds);
assert.deepEqual(reduceDiscoveryDraft(byCard, { type: "set-step", step: "directions" }).shortlistIds, ["melbourne"]);
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-actions.test.ts tests/discovery-draft.test.ts tests/builder-persistence-acceptance.test.ts`; expected new action/search assertions fail. Add close/reload/resume tests using the existing owner-scoped recovery fixtures: explicit deselection stays removed; saved step/direction/base/visit restore; a blocked local save shows recovery feedback and does not claim durable success.
- [ ] **Step 3: Implement.** Wire Builder hydration and structural snapshot to `discoveryDraftByMentionId` without another local key. Australia uses the new draft as its only write owner; legacy `countryDiscoveryChoices` callbacks remain solely for the unconverted #321 path. The same owner/trip identity and existing save/recovery path handles drafts. On resume revalidate IDs against current content, flag missing evidence, retain the original mention, and never silently replace choices. Back changes step only. A search result must pass canonical containment and actionability gates before entering the draft. No direct route mutation from the modal before Review confirmation.

```ts
const place = eligiblePlaces.find(item => item.id === result.canonicalPlaceId && item.country === result.country);
if (!place) return draft;
return reduceDiscoveryDraft(draft, { type: "add-shortlist", placeId: place.id });
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run test:persistence`, `npm run typecheck`, `git diff --check`; commit `feat(discovery): preserve explicit place choices and resume`.

## Task 8: Review, existing route intelligence, and idempotent Builder confirmation

**Files:** Create `lib/easyt/discovery-review.ts`, `lib/easyt/discovery-commit.ts`, `tests/discovery-review.test.ts`, `tests/discovery-commit.test.ts`; modify `components/easyt/discovery-steps.tsx`, `app/journey/new/trip-builder.tsx`; extend `tests/country-discovery-builder.test.ts`, `tests/builder-persistence-acceptance.test.ts`.

**Interfaces:** `buildDiscoveryReview` consumes Task 3 projection, Task 2 draft, current `EasyTTrip`, and **existing** route candidate, country continuity, night allocation, and validator outputs. `commitDiscoveryReview` invokes `DiscoveryCommitPorts` backed by Builder's existing `addGuidedPlanningPlace`, `confirmAttractionVisit`, `completePlanningArea`, and persisted trip mutation boundary. It receives only review-approved canonical base/visit IDs; it cannot infer a base from a park coordinate.

- [ ] **Step 1: Write failing review/commit tests.** One review must show original Australia intent, direction, new bases, visit-only places, existing Sydney, unresolved browse-only park, and existing route/time warnings. Example:

```ts
const review = buildDiscoveryReview({ mention: mention("Australia"), draft, projection, trip: tripWithSydneyManualNights });
assert.deepEqual(review.reusedStopIds, ["existing-sydney-stop"]);
assert.ok(review.blockedIds.includes("uluru-kata-tjuta"));
assert.ok(!review.newBaseIds.includes("uluru-kata-tjuta"));
assert.equal(review.primaryAction.kind, "confirm-selected-places");
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-review.test.ts tests/discovery-commit.test.ts tests/country-discovery-builder.test.ts tests/route-candidates.test.ts tests/plan-validator.test.ts`; expected new review/commit assertions fail. Add explicit tests for double-confirm, existing Sydney with manual nights, partial failure after one added stop then retry, old #321 chosen IDs, visit linked to base without a park overnight stop, and a fixed non-Australia anchor. Assert no commit method is called by a direction, pin, card highlight, or Back.
- [ ] **Step 3: Implement.** Build a read-only review from current Builder route intelligence and `#335` country continuity; carry warning codes and uncertain fit, never claim feasibility from straight-line distance. Primary CTA enumerates the actual new base/visit actions and disables if all choices are unresolved. Confirm sequentially checks current canonical stop IDs before each Add, reuses existing stops/nights, links visits via `PlaceSelection`, records completed IDs only after durable success, and leaves the parent open on partial failure. On retry skip already committed IDs. Only final explicit confirmation calls route mutation ports; all preceding steps are draft-only.

```ts
const appliedIds: string[] = [];
for (const canonicalId of review.newBaseIds) {
  const stop = ports.findExistingStop(canonicalId) ?? await ports.addBase(canonicalId);
  if (!stop) return { ok: false, committedIds: [], pendingIds: review.newBaseIds };
  appliedIds.push(canonicalId);
}
for (const visit of review.visits) {
  const base = ports.findExistingStop(visit.baseId);
  if (!base || !await ports.linkVisit(visit.intentId, base.id)) return { ok: false, committedIds: [], pendingIds: review.newBaseIds };
}
if (!await ports.persist()) return { ok: false, committedIds: [], pendingIds: review.newBaseIds };
ports.completeMention();
return { ok: true, committedIds: appliedIds, pendingIds: [] };
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run test:night-allocation`, `npm run test:persistence`, `npm run typecheck`, `git diff --check`; commit `feat(discovery): review and confirm canonical Builder choices`.

## Task 9: Mobile, accessibility, analytics, and performance guardrails

**Files:** Modify `components/easyt/discovery-modal.module.css`, `components/easyt/discovery-modal.tsx`, `components/easyt/discovery-modal.stories.tsx`, `lib/easyt/i18n.ts`, `lib/analytics.ts`, `docs/product/jtbd-analytics.md`, `tests/ui-convergence.test.ts`; create `tests/discovery-analytics.test.ts`, `tests/discovery-performance.test.ts`; extend `tests/discovery-localization.test.ts`, `tests/discovery-modal-contract.test.ts`.

**Interfaces:** New typed events use `trackEvent` and existing consent gating. Suggested minimal events: `discovery_shown`, `discovery_direction_selected`, `discovery_place_choice_changed`, `discovery_review_reached`, `discovery_confirmed`, `discovery_closed_or_resumed`, each with only categorical entry/action, counts, and optional opaque trip ID; no prompt, destination name, coordinates, URL, or raw image/source text.

- [ ] **Step 1: Write failing guard tests.** Assert typed payloads contain no raw prompt or place name, event emission only on deliberate transitions, and no duplicate `shown` on effect replay. Assert the modal CSS has a single `.body` overflow owner, sufficient `env(safe-area-inset-bottom)` clearance, no nested scroll/fixed drawer footer, and reduced-motion support. Add a module-boundary test ensuring `/journey/new` initial bundle does not statically import `discovery-map.tsx`/MapLibre and that card imagery uses lazy loading:

```ts
assert.doesNotMatch(builderSource, /from ["']@\/components\/easyt\/discovery-map/);
assert.match(modalSource, /dynamic\(|import\(/);
assert.doesNotMatch(JSON.stringify(event), /rawPrompt|destinationName|coordinates|sourceUrl/);
```

- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-analytics.test.ts tests/discovery-performance.test.ts tests/discovery-localization.test.ts tests/discovery-modal-contract.test.ts tests/ui-convergence.test.ts`; expected new guards fail. Compare the `/journey/new` initial JS route artifact against Task 4's baseline after dynamic imports and document the delta in the task commit message. Add `performance.mark`/`performance.measure` around modal open-to-first-useful-card and a local 1,000-run `projectDiscovery` measurement; record results rather than inventing a universal millisecond threshold. Browser timing capture is conditional on the `AGENTS.md` opt-in rule.
- [ ] **Step 3: Implement.** Use `100dvh`/safe-area layout with one content scroll owner and a compact action area that never overlays the last card; provide bottom padding, keyboard focus visibility, announcements, reduced motion, no-photo and map-failure alternatives. Add complete EN/ES labels. Add only the minimal funnel events to `LaunchAnalyticsEventMap` and `jtbd-analytics.md`, respecting consent and first-reached rules. Lazy-load MapLibre behind Task 6's dynamic map and image variants as cards enter view; memoize candidate projections and avoid rerendering all 20+ cards when highlight changes.

```tsx
const DiscoveryMap = dynamic(() => import("./discovery-map").then(module => module.DiscoveryMap), { ssr: false });
<div className={styles.body}>{stepContent}</div>
<div className={styles.actions}>{primaryAction}</div>
```
- [ ] **Step 4: Run green and commit.** Run the red command, `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, `git diff --check`; commit `feat(discovery): harden responsive accessible funnel`.

## Task 10: Whole-slice acceptance and independent review

**Files:** Create `tests/discovery-acceptance.test.ts`; modify `components/easyt/discovery-modal.stories.tsx` only if final state fixtures expose a gap. No new product feature is introduced in this task.

**Interfaces:** Exercises Tasks 1–9 end to end through pure projection/draft/review/commit ports and the Builder handoff contract. Retains the existing #321/Tajikistan and map test suites as regression gates. A future reviewer evaluates the whole branch after focused task gates.

- [ ] **Step 1: Write failing whole-slice acceptance tests before final wiring adjustments.** The matrix includes no duration, short and long trip, Sydney, Sydney+Melbourne, non-Australia fixed anchors, interests, explicit deselection, reload/resume, search/card parity, map/card exact ID, browse-only park, existing stop reuse/manual nights, partial retry, EN/ES and unknown-version fallback. Assert 20+ content and source → eligible → ranked → displayed counts with a bounded initial display. Assert shared fixtures: Africa no silent country, Taj separate from Agra, Kruger park separate from camp/gateway, Lake Atitlán visit separate from base, precise route skips.

```ts
test("Australia remains broad in browse and conservative at confirmation", () => {
  const draft = createDiscoveryDraft();
  const projection = projectDiscovery({ mention: mention("Australia"), draft, context: { interests: [], existingPlaceIds: [] } });
  assert.ok(projection.counts.source >= 20);
  assert.ok(projection.counts.eligible >= 20);
  assert.equal(projection.counts.ranked, projection.places.length);
  assert.ok(projection.counts.displayed < projection.counts.ranked);
  assert.ok(projection.recommendedIds.length < projection.counts.displayed);
});
```
- [ ] **Step 2: Run red.** `node --experimental-strip-types --test tests/discovery-acceptance.test.ts`; expected the first missing integration assertion fails. Resolve only the failing integration boundary in its existing owner; do not create a new planner or broaden the content rollout.
- [ ] **Step 3: Run complete green gate.** `node --experimental-strip-types --test tests/discovery-*.test.ts tests/country-discovery.test.ts tests/country-discovery-builder.test.ts tests/country-discovery-localization.test.ts tests/structured-trip-brief.test.ts tests/builder-persistence-acceptance.test.ts tests/map-result-selection.test.ts tests/mobile-map-drawer.test.ts`; then `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, `git diff --check`. Inspect all exit codes. Run `MORROVIA_BUILDER_BROWSER_TESTS=1 node --experimental-strip-types --test tests/country-discovery-browser.test.ts` only if a later execution request explicitly authorizes browser-level validation under `AGENTS.md`; otherwise record `MANUAL HOSTED VERIFICATION REQUIRED` rather than silently launching a browser.
- [ ] **Step 4: Visual and accessibility acceptance.** Compare actual Storybook states side by side with the two approved mockups as hierarchy/interaction references at 320, 390, 430, 768, 1024, 1440, and 1680 px. Verify one scroll owner, last-card clearance, focus trap/return, Escape, Back preservation, pin/card keyboard operation, image credits, map failure, reduced motion, and EN/ES. Founder visual acceptance is required before declaring UI complete; no mockup travel fact becomes production content. Record any difference and its reason in the review summary, not as a silent styling exception.
- [ ] **Step 5: Independent whole-branch review and commit.** A fresh reviewer checks evidence, migration, mutation boundaries, route/night reuse, performance, and Storybook/live consistency. Address findings in their owning task files, rerun affected gates, then commit `test(discovery): lock Australia journey acceptance`. Do not push, merge, or deploy without the later execution instruction.

## Requirement trace and release gates

| Approved requirement | Owning task and proof |
| --- | --- |
| Australia 20+ canonical, reviewed, typed, geographically valid places and image provenance/fallback | Task 1 content audit/test; Task 10 threshold |
| Directions, groups, broad browsing, conservative proposal, unknown-duration honesty | Task 3 projection matrix; Task 5 UI |
| Versioned draft, absent versus empty migration, explicit removals, reload/Back preservation | Task 2 reducer/migration; Task 7 recovery; Task 10 integration |
| Continent/country/landmark/park/precise-route entry with Australia rollout only | Task 4 classifier; Task 3 contract fixtures |
| Editorial desktop and full-screen mobile single-scroll UI, EN/ES and Storybook | Tasks 5 and 9; Task 10 visual gate |
| Exact map/card preview, no map mutation, map failure | Task 6 controlled ID tests; Task 10 |
| Base versus visit versus browse-only, canonical search fallback | Tasks 1, 7, 8 |
| Review, #335 continuity, night/route validation, explicit idempotent commit and recovery | Task 8; Task 10 acceptance |
| Consent-safe funnel measurement and initial-load/opening performance | Task 9 typed event and build/module-boundary tests |
| Africa/Taj/Kruger/Lake architecture proof without full content rollout | Tasks 3, 4, and 10 fixture contracts |

**Release gate:** The Australia slice is not complete if fewer than 20 displayed places pass evidence checks, Sydney remains the only eligible candidate, a browse-only item can be committed as an overnight stop, defaults replace explicit choices, Back changes a choice, a pin mutates a route, confirmation duplicates an existing stop/night, mobile cards are covered by actions, or the founder visual review is outstanding. These are acceptance failures even when typecheck/build pass.

## Execution recommendation

**Subagent-driven execution** is recommended for the later implementation request: content evidence, migration, projection, UI/map, and canonical handoff have distinct review risks, while the shared signatures above define their dependency order. Use a fresh implementer/reviewer gate per task and a final whole-branch review. This is a recommendation for future execution, not authorization to begin it now.

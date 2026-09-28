# Explore empty and retry presentation

**Status:** Approved visual direction, behavioural specification for review. No product implementation in this document.

**Starting points:** Accepted category simplification `d18a9c17384e794f13859ecabd623176f7261f83` on `codex/explore-category-simplification`; [skim-first review](../../product/skim-first-mockup-review.md), sections F, G and H. The accepted branch is a read-only dependency for this spec, not a branch to merge or modify here.

## Traveller job and scope

When discovery has no matching ideas or a source fails, a traveller needs to know which happened and what useful action is available for the destination and category they selected. The response should take little space while retaining saved ideas and any valid results. This scope changes Explore presentation and retry behaviour only. The four accepted categories remain **For you, Must-see, Food and Tours**, in the existing single horizontal scrollable strip with 44px targets.

## Existing owners to extend

- `TripExploreWorkspace` owns selected destination/category, organic and commercial request lifecycles, source status, result presentation, saved-idea mutations and the current route-stop track. Reuse it; do not add another Explore state owner.
- `exploreResultsPresentation` and `filterExploreResults` own the distinction between results, loading, unavailable and empty, and filter by selected stop/category. `streamExploreDiscoveryLane` and the abortable effect scope own provider result streaming and stale-request cancellation.
- `MorroviaSectionStatus`, `EasyTButton`, shared tokens and the existing Explore Storybook stories provide the compact visual pattern. Do not add a new status component family.
- The accepted `explorePrimaryCategories` and strip styling own category taxonomy and geometry. Existing provider, photo, attribution and trip persistence paths remain authoritative.

## States and actions

| Selected-scope state | Presentation | Action |
| --- | --- | --- |
| Request pending without usable results | Existing compact loading state; no false zero count | Wait for the current request |
| Completed with no usable results and no total provider failure | Compact **No ideas found** | If category differs, **Try For you** changes category while retaining the exact selected stop. If already For you, offer a named canonical stop only when a useful alternative is supported; otherwise show no action. |
| All required sources for the selected scope failed and no valid results exist | Compact **Couldn’t load ideas**; no “0 ideas” or routine save reassurance | **Try again** reruns the same canonical destination ID and category without clearing saved ideas |
| One source failed while usable selected-scope results remain | Keep those result cards and their existing actions; no whole-panel error or misleading zero count | No redundant retry panel over the results |

The destination track and category strip carry context. Do not repeat destination/category in multiple headings. A result count may appear only for an actual result collection, never as “0 ideas” while loading or failed. A different stop’s cached cards must never be labelled as the current stop.

**Try again** is an explicit retry trigger inside `TripExploreWorkspace`. It restarts the existing request plan for the same selected stop/category, cancels or ignores obsolete requests, and changes status to loading for that attempt. It does not change taxonomy, create a provider path, save a trip mutation, or promise that results will arrive. If another destination/category is selected while retry is pending, its old response cannot become current.

**Try For you** sets only the selected category to For you; the current canonical stop ID is preserved. If already For you, this action is absent. A named alternative such as **Explore Cusco** uses an existing `exploreDestinationOptions` entry and changes to that exact stop ID only after click. The label does not guarantee inventory; if the available data cannot substantiate a useful alternative, omit the action. Repeated place names must use stop identity, not a name match. The current selected stop remains visible until the click.

Saved ideas remain derived from the working trip and keep their existing save/schedule/remove state. A discovery read failure must not be framed as a failed save. Partial provider failure retains all valid current-scope results and saved states, with existing source/affiliate/attribution details. No unrelated destination results fill the gap.

## Acceptance evidence for implementation planning

- Focused tests: genuine empty Tours, empty For you without a no-op, all-source failure, successful retry, failed retry, partial failure with valid selected-scope results, saved idea retained, stale response after scope switch, and repeated same-name stop IDs.
- Prove **Try again** keeps destination/category; **Try For you** keeps destination; named alternative changes only after click and only to the chosen canonical stop. No action claims future inventory.
- Production-component Storybook states at 390px and 430px plus desktop show one horizontal category row, compact statuses, 44px targets and no page overflow. Check provider failure without “0 ideas” and partial failure without a whole-panel error.
- Relevant Explore tests, typecheck, `audit:ui`, Storybook build if shared UI changes, and `git diff --check` are local verification gates. No UI audit baseline is weakened.

## Boundaries

No new provider, category, taxonomy, fallback, persistence or image owner. Do not replay the accepted category simplification or other skim-first proposals. This spec proceeds to its own implementation plan only after review.

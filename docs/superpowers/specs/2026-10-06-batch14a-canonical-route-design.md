# Batch 14A: canonical route contract (review draft)

## Purpose and scope

Help a traveller turn an origin, places they want to visit, dates and constraints into a route they can trust, then edit without losing their choices. This specification covers the canonical route model, conversion of existing saved trips, and the contract consumed by the later homepage and Builder work. It is a review draft; product-code implementation and its detailed plan require their own written approval. The initial 14A deliverable is this diagnosis and specification.

### Hard UI boundary

Shaun's approved focus is the homepage planner/search area and the Builder's top controls, plus the model, save/autosave and targeted invalidation logic required to support them. Reuse the existing surrounding product.

| Surface | Permitted work | Preservation requirement |
| --- | --- | --- |
| Homepage | `app/journey/home/home-trip-starter.tsx`, `home-destination-editor.tsx`, and their planner-specific styles/stories; compose existing trip capture, endpoint, date and shared control components. | Background imagery/behavior, logo, navigation, current hero titles and subtitle, page chapters and surrounding layout stay exactly as implemented. `home/immersive/immersive-home.tsx`, the hero/navigation selectors in `immersive.module.css`, and `components/easyt/morrovia-homepage.tsx` are read-only references. |
| Builder | Top control block/state in `app/journey/new/trip-builder.tsx`, narrowly scoped top-control selectors in its CSS module, and associated stories; connect to existing canonical commit, order and recovery helpers. | Retain `TripBuilderRouteWorkspace`, its table and map, row structure, transport/nights interactions, selection/drag behavior and responsive layout. Do not replace `trip-builder-route-workspace.tsx`, add a sidebar or redesign the outer page. Necessary data wiring into the existing workspace is permitted; visual restructuring is not. |
| Shared product | Compose `EasyT` controls, `MorroviaTripCapture`, existing place search/date controls and recovery feedback. | `app/journey/easyt-navigation.tsx`, logo components, `app/journey/journey-design.css`, map renderers, TripShell and surrounding Overview/Itinerary layout remain existing owners. A small safe shared control extension needs representative Storybook coverage; no new navigation, route table, map or page primitive. |
| Model/persistence | `lib/easyt/trip.ts`, route-intent adapter/validation, `home-trip-handoff.ts`, canonical Builder commit/order helpers, `storage.ts`, `repository.ts`, stop-reference remapping, and focused tests. `planner.ts`, `cascade.ts` and replan helpers may receive narrow authority/dependency checks. | Retain the current routing engine, place identity system, account scope, compare-and-swap writes and recovery machinery. API/import readers may receive compatibility conversion only. No broad refactor or new database infrastructure. |

This is a bounded file/component allowance, not permission to edit every listed file. The implementation plan must name each actual edit and its dependency. Any change outside the allowance returns for scope review.

### Approved visual references: pixels inspected

Shaun supplied these three files directly with the statement **“These are the 3 visuals we approved.”** Their local bytes, dimensions and Library identities were verified, and all three were viewed in this session. They supersede exploratory mockups in [Simplify Trip Builder UX](https://chatgpt.com/g/g-p-6a8ccd5a04948191bba06d23d69addef-morrovia/c/6ac4ed08-5fcc-83e8-b76c-60647c882cae).

| Exact Library identity | Local supplied filename | Viewed reference and approved focus |
| --- | --- | --- |
| `libfile_bd581a0362388191ae9f7f9749084432` | `image(1).png` (1448 × 1086) | Builder One way: toggle, distinct origin, unnumbered destination chips, one Add destination, dates/travellers/budget and collapsed Personalize; existing table/map beneath. |
| `libfile_f40c7764a3408191821ca16325bf4c83` | `image(2).png` (1400 × 1123) | Builder Return to start: same top control grouping, return relationship, existing table/map. The later written decision removes its numbered intent chips; the actual ordered table keeps numbers. |
| `libfile_2df67bc6600c81918b3f69c8f9838e9b` | `image(3).png` (1672 × 941) | Homepage planner: existing Plan with stops / Describe my trip modes, return/one-way toggle, origin, unordered chips and one Add destination, dates, Personalize and Plan my trip. |

Local images live in `/Users/shaun/Documents/Codex/2026-10-06/task-2/batch14-approved-visuals/`. Generated sample titles, navigation, background, table styling, illustrative transport facts, counts and explanatory copy do not authorize surrounding changes. Apply the current design system and skim-first guidance to retained copy. Accepted edits automatically save and update their necessary dependent legs, dates and endpoints. The images' Update route action must not gate those updates; its approved role is an optional deliberate broader optimization proposal, as recorded below. Autosave is never permission to silently optimize an authoritative order.

The accepted staging base is `a3ab161e7ea97229f851423bc81fb0f67271560c`. The first ten hosted diagnostics were 8 pass, 2 fail across mixed SHAs, so they are evidence rather than a release signoff. A06 lost unresolved Mostar and 2 requested nights; A09 lost unresolved San Pedro de Atacama and 3 requested nights. Cases 11–20 remain pending on [Trello #394](https://trello.com/c/nuEkw4U6/394-builder-engine-hardening-20-route-regression-pack).

## Current-state diagnosis

- `lib/easyt/trip.ts` schema v1 has `brief.origin`, optional `brief.journeyEnd` (`unknown`, `same_as_start`, `explicit`), `brief.intent`, and ordered `stops` with occurrence `id`, canonical place ID, `order` and `nights`. `tripFromBuilder` derives stops from the current Builder array. Neither the persisted document nor `TripIntent` says whether order was optimizable, explicitly requested, or manually edited.
- `lib/easyt/home-trip-handoff.ts` preserves homepage entries and capture mentions through a local handoff, but entry order and capture order flow into stop seeds. `handoffRouteStops` retains only routable mentions. A failed or ambiguous resolution therefore needs a separate durable intent record before the stop projection is built.
- `lib/easyt/planner.ts` can compare alternative stop orders. `lib/easyt/cascade.ts` reschedules the ordered stops and reports conflicts. Reuse these; the route-order authority check belongs before applying a suggested reorder.
- `lib/easyt/repository.ts` stores a JSONB document at schema v1 and normalized relational stop/leg/item projections. Authenticated writes use `updatedAt` compare-and-swap; local recovery and cloud acknowledgement in `lib/easyt/storage.ts` already guard against lost drafts. Autosave must use those guards rather than bypass them.

## Alternatives considered

1. **Recommended: extend the existing versioned `brief.intent` with a route-intent contract.** Persist origin, trip type, destination intents, their base/stay mappings, resolution, requested nights and order authority; keep `TripStop[]`, legs and itinerary as the ordered projection. Use one canonical intent owner and compatibility projections for old consumers. Adapt v1 documents on read and write v2 only after an edit. This preserves proven routing and existing consumers, while making unresolved intent durable.
2. **Reuse only `TripIntent.hardConstraints` and infer the rest from `stops`.** Smallest schema change, but an unresolved place has no stop and explicit order still cannot be distinguished from entry order. It cannot satisfy A06/A09 or manual-order authority reliably.
3. **Replace stops, legs and projections with one new graph.** Could unify state long term, but would disturb itinerary, booking, schedule and relational projections without a demonstrated need. Reject for Batch 14.

## Canonical v2 contract

The v2 document extends the existing `TripIntent` to version 2 with `brief.intent.route` as the canonical route-input owner. Existing `brief.origin`/origin metadata and `brief.journeyEnd` become compatibility projections, updated from that owner in one conversion/commit function. They must not become independently writable state. Keep the existing `JourneyEndSelection` semantics; remove conflicting duplicate intent values during normalization. No additional top-level route store or backend graph is introduced.

The conceptual types below describe the contract; the implementation plan will pin signatures and conversion functions against the reviewed semantics.

```ts
type RouteIntent = {
  version: 1;
  origin: JourneyEndpointPlace | null;
  tripType: "return_to_start" | "one_way" | "unknown_legacy";
  // Existing journeyEnd is the only v1 explicit endpoint representation.
  journeyEnd: JourneyEndSelection;
  destinations: DestinationIntent[];
  orderAuthority: "optimizable" | "explicit" | "manual" | "legacy_preserved";
  explicitIntentIds: string[] | null; // ordered original intents, when supplied
  orderedStopIds: string[]; // the current ordered stay occurrences, including manual order
  projectionInputKey: string | null; // dependency key of inputs used for the current route projection
};
type DestinationIntent = {
  id: string; // stable entry/mention intent ID, separate from geographic identity
  sourceText: string;
  kind: "overnight_place" | "planning_area";
  selectedPlace: JourneyEndpointPlace | null;
  resolution: "pending" | "resolved" | "needs_base" | "ambiguous" | "unresolved" | "unavailable";
  requestedNights: number | null; // null means unspecified, 0 is explicit
  routeMembership: "required" | "optional";
  stopIds: string[]; // one stay for a direct place; zero or more chosen bases for an area
};
```

Invariants:

1. `origin` is a gateway, distinct from overnight destinations. It becomes a stop only if the traveller separately asks for an overnight occurrence there. An explicit finish may likewise be an overnight occurrence or only a gateway; neither case duplicates a stay.
2. Normal homepage destination chips are unordered intents. Their visual/entry sequence does not set `orderAuthority: explicit`. The optimizer may sequence only `optimizable` intents, subject to dates, commitments and endpoint constraints. It must not erase an occurrence to obtain a feasible route.
3. An explicitly requested sequence in a free-text brief sets `explicit`: arrows, first/then/finish phrasing or a clearly supplied stop-by-stop itinerary establish order. Country/city chips and an ordinary wish list do not. If interpretation cannot safely distinguish a requested itinerary from a wish list, retain the source sequence and ask before reordering. An accepted Builder reorder sets `manual`. Both defeat later automatic reordering, save, reload and downstream recomputation. A suggested reorder is a proposal until the traveller accepts it.
4. Intent IDs, geographic IDs and stay occurrence IDs have distinct jobs. A direct overnight intent maps to one stop occurrence. A country/region intent may map to several traveller-selected or accepted overnight bases; it must remain alongside those bases rather than masquerade as a city. Base replacement/enrichment preserves the parent intent ID and relevant requested-night budget. POIs remain activity intent through the existing capture model, not overnight destinations. Repeated visits have distinct intent and stop IDs even when canonical place IDs match. Reuse current `TripStop.id` as the occurrence identity and the existing remapper for every nested durable reference, including new intent-to-stop mappings.
5. Unresolved destinations remain in `brief.intent.route.destinations` with original text and requested nights. They are shown through existing clarification/status owners and cannot be silently removed, reassigned, counted as a verified map stop or treated as a confirmed transfer. The generated route is provisional until required destinations resolve or the traveller explicitly removes them. A provider timeout/error is `unavailable`; a completed empty lookup is `unresolved`; ambiguity and a region/lake/island needing a base are separate states. A city with verified identity but missing transport evidence remains a city; unknown travel timing stays truthful.
6. A `return_to_start` route projects origin → ordered destinations → origin; `one_way` projects origin → ordered destinations, with a separate explicit endpoint when genuinely supplied. V1 does **not** add `endingAt` or `finishConstraint` fields, nor a normal homepage Finish field. Keep the existing explicit `journeyEnd` capability for free-text and legacy trips. A trip type change must not silently discard a conflicting explicit endpoint: surface the conflict for review.
7. Route intent and projected stops are reconciled before a durable save. A successful save/reload must not change order authority, occurrence identity, requested nights, endpoint or unresolved state. The Builder, Overview and Itinerary read the same canonical document.
8. Requested nights are hard traveller input, separate from generated allocation and dates. Hold unresolved requests in the time budget: available nights = allocated resolved nights + held unresolved requested nights + genuinely unallocated nights, unless there is a visible over-allocation conflict. Do not call Mostar's 2 nights or San Pedro's 3 nights unallocated. A planning area's requested nights are one parent total distributed over its chosen bases, not copied onto each child. Invalid partial text stays in the input draft and cannot overwrite a valid canonical number. Explicit removals release that intent's nights without automatically reallocating them.
9. Origin and trip-type edits do not infer a stop's creation/removal from a matching label. A separate explicit origin/finish stay survives. An explicit endpoint must remain visible in an existing route summary or risk treatment even though there is no normal Finish input, so a hidden constraint cannot surprise the traveller.
10. Necessary dependent updates run automatically after accepted edits, with revision guards, and resume after reload if interrupted. Compare the stored `projectionInputKey` with a deterministic key of the relevant canonical inputs: endpoint identities/type, destination identities/resolution/base mappings, requested nights, order authority, dates and binding commitments. A mismatch identifies pending or failed necessary reconciliation; it does not require an Update route click. Use the edit's dependency scope to recompute affected legs/dates/endpoints automatically while preserving unaffected data and authoritative order. Unresolved required intent additionally makes the route provisional. The key excludes presentation labels and save timestamps. Update it only after successful validation/reconciliation of the affected projection, never merely on save. Legacy conversion preserves the existing projection with an unknown key and legacy provenance; it cannot claim fresh optimization or force an unrelated rewrite on read. Existing feedback distinguishes saved edits from dependent updates in progress, failure or conflict; Overview and Itinerary must not treat old transfers, dates or completeness as validated against new inputs. The detailed plan will pin the key function and each consumer's guard. Optional broader optimization is separate and cannot block this automatic reconciliation.

## Legacy read and migration rules

Use a pure, idempotent v1-to-v2 adapter at local and cloud read boundaries, then persist schema v2/intent v2 on the first authorized edit/save. A read cannot change stored bytes, `updatedAt`, owner or recovery acknowledgement. Preserve the source's server compare-and-swap token during in-memory conversion; only a winning repository write issues a new token. Keep the original local source intact until the new document is durably acknowledged. Avoid a database-wide rewrite; JSONB `document` and integer `schema_version` already support a versioned document. All local, cloud, list, import, duplication, promotion and mutation paths must accept/convert supported v1 documents before v2 writes are enabled. Unknown newer versions fail visibly and preserve recovery rather than being discarded by a filter.

| V1 evidence | V2 interpretation |
| --- | --- |
| `journeyEnd: same_as_start` | `return_to_start`; preserve origin and existing stop order. |
| `journeyEnd: explicit` | `one_way` with the existing explicit endpoint; preserve any distinct overnight occurrence at that place. |
| End absent or `unknown` | `unknown_legacy`, with no guessed return or one-way assertion. Ask only when an endpoint decision is needed. |
| Existing ordered stops | Preserve their exact order/IDs/nights. Reuse saved capture parent relationships only if verifiable; otherwise create one direct intent per saved occurrence with `legacy_preserved` authority. Do not merge repeated names or infer a country parent. Current allocated nights are preserved; label them as requested only where manual/captured provenance proves that. |
| Captured unresolved mention or night request outside stops | Retain source text, mention/occurrence identity and requested nights as unresolved destination intent. If v1 never stored the mention or nights, do not invent them; report the information is unavailable. |
| Existing stop-bound state | Preserve stop IDs, allocations, fixed commitments, plan items, authored notes, booking references, selected places, locks and statuses. Reconcile only references affected by an explicit later edit. |

Legacy conversion must tolerate duplicated canonical places, malformed optional metadata and an interrupted prior local/cloud save without dropping the original recovery copy. Deterministic IDs derive from existing entry/mention/stop IDs, not labels, array indexes after edits, random IDs on each read or guessed geographic identity. A v2 document read twice produces the same value. Preserve the legacy stop projection, including nullable geography, until a deliberate affected edit validates a replacement. Unresolved new intent lives in JSONB and is not inserted as a fake verified relational stop. Relational stop/leg/item projections are replaced only in the same successful guarded transaction as their canonical document. Deploy compatible readers before switching writers; downgrade/rollback must preserve v2 bytes rather than feed them to a v1-only writer.

## Save and edit rules for 14C consumers

Maintain three distinguishable states: editable input draft, validated canonical document (which may truthfully contain unresolved intent), and last durably acknowledged document. Partial typing and in-progress interpretation are recoverable input, not evidence that a new route is validated. Local recovery may say “saved on this device” only after its own write succeeds. Account saved state requires acknowledgement of the exact document/revision. On failure or conflict, keep the newer draft and provide retry or recovery; never replace it with a late cloud response. Scope local recovery by owner and trip. Every async interpretation, geocode, optimization and save response must carry owner/trip/input revision and intent/occurrence identity as applicable, and be ignored if any is stale. Serialize cloud writes per trip, coalesce pending edits, and retain newer recovery when an older revision is acknowledged. Accepted edits automatically save and trigger necessary dependent updates without a primary Save or Update route action. Apply deterministic endpoint changes immediately; run affected async calculations automatically and durably save their accepted results. Debounce where appropriate without losing the latest edit. Pending/failed dependent work remains visible and recoverable even when the input edit itself has been saved. The approved optional Update route action requests deliberate broader optimization separately from edit/save/reconciliation. It must never silently override explicit/manual order; a proposal changing authoritative order requires traveller acceptance.

Invalidate only dependent data, with explicit review of fixed commitments and confirmed bookings:

| Edit | Preserve | Automatic necessary updates and dependent review |
| --- | --- | --- |
| Change a destination's label/provider resolution for the same verified place | Occurrence ID, requested nights, order authority, authored items | Refresh changed place evidence/map pin and only legs or suggestions whose evidence changed. A presentation-only rename does not invalidate route geometry or dates. |
| Replace a destination with a different place | Other occurrences and authored content | Automatically reconcile that occurrence's place-bound suggestions, adjacent legs, affected dates and route assessment; flag its existing booked/itinerary items for review. |
| Add/remove a destination | All other IDs, explicit nights and order | Automatically reconcile adjacent legs, schedule and route assessment; removed nights become an explicit released amount, never automatic redistribution. Required unresolved additions remain provisional through the existing resolution flow. |
| Reorder | IDs, per-stop nights and authored items | Automatically recalculate affected legs, dates/day assignments and route assessment; respect locks and bookings. Set authority to `manual`. |
| Change nights/dates | Places and order | Automatically recalculate downstream flexible dates, schedule and affected day suggestions; fixed commitments and bookings are reviewed, not silently moved. |
| Change trip type/origin/explicit endpoint | Destination occurrences and requested nights | Automatically derive accepted endpoints/return anchor and recalculate gateway legs, feasibility and affected dates; show endpoint conflicts before accepting. |
| Change travellers, budget, interests or transport preference | Route membership, manual/explicit order, authored choices and bookings | Automatically refresh only dependent costs, recommendations and travel evidence; changes are not authority to rearrange the route. |

Retain authored itinerary items/notes and confirmed bookings by stable occurrence IDs. Dates may be recalculated for flexible generated rows; dated commitments and bookings remain at their authored dates and report conflicts. If removing/replacing a stop leaves authored items without a valid binding, keep them as existing reviewable/unassigned content and ask for a move/removal rather than deleting them. Refresh route-leg decisions by existing endpoint identity; do not carry a selected transport option onto a different pair of stops merely because its array index matches.

## A06/A09 recovery requirements

The accepted evidence classifies both first failures as canonical-place resolution failures, not general route ordering failures. A09's recorded lookup returned HTTP 200 with no candidates; Mostar's exact provider failure still requires tracing. The canonical-model repair alone cannot establish that either place now resolves.

Capture the complete intent and nights before asynchronous lookup. Preserve contextual country/region evidence; retry through the current bounded resolver/providers, distinguish empty/ambiguous/unavailable outcomes, and permit existing explicit search selection to replace the original pending intent in place. Selection preserves intent and stop identity, explicit order, nights and commitments. A canceled or late lookup cannot append the stop again or overwrite a newer selected place. Neither case passes until all six intended places and requested nights resolve and survive save/reload. Provider/data recovery is a focused follow-on fix under this contract, not a route-specific hardcoded rewrite.

## Verification and rollout sequence

**14A after written-spec approval, then detailed-plan approval:** implement the v2 route-intent types, adapter, invariants and save/read boundary behind focused unit/integration tests. Keep the existing route engine and UI behavior unless an invariant requires a visible clarification through the current owner. Tests must cover absent end as unknown; explicit finish with/without an overnight stay; duplicate occurrence identities; explicit/manual/legacy order; unordered country chips expanding to several bases; unresolved and planning-area requested nights; empty/error/timeout lookup followed by in-place selection; idempotent migration; cloud compare-and-swap; owner change and newer local recovery; import/promotion/duplication; nested stop references; authored itinerary and commitments. Reproduce the A06/A09 failure class locally and classify resolver failure separately from preservation of unresolved intent.

**14B after 14A review:** homepage controls `Return to start | One way`, distinct origin, unordered “Places you want to visit” chips and one Add destination; retain both input modes, dates and advanced fields. Use viewed image(3) only for the planner area. Reuse shared controls, existing Journey navigation/tokens and relevant stories under the hard boundary above.

**14C after 14B visual/product review:** retain the Builder table and map, simplify only top controls, and use the save/recovery and invalidation contract above. Verify accepted edits automatically save and update affected legs/dates/endpoints without Update route, including interrupted calculations resumed after reload and visible failures/conflicts. Add responsive/Storybook coverage if a shared UI pattern changes.

**14D after 14C review:** verify Homepage → planner → Builder → Overview → Itinerary → local/cloud reload, including conflicts and adversarial rapid edits. Then rerun all 20 [authoritative checklist cases](https://trello.com/c/nuEkw4U6/394-builder-engine-hardening-20-route-regression-pack) against one accepted SHA. Judge route rows, canonical IDs and saved payload, not incidental map copy. A03/A05 need reliable persisted-payload readback. A06/A09 remain failures until canonical resolution and nights both pass; do not mark the pack complete early.

Run focused tests, typecheck, lint, `build:check`, UI audit and `git diff --check` where applicable. Hosted acceptance requires a separately approved staging candidate; no production push is part of this spec.

### Visual preservation acceptance for 14B/C

- Compare the current base and candidate with identical viewport, locale, trip data, route selection, save status and scroll position at desktop and 390/430px mobile widths. Keep an entire-page comparison plus a planner/top-control crop so retained surroundings can be checked.
- Homepage: verify exact existing background assets/behavior, logo, navigation, hero title/subtitle and chapters in source and matched images. Planner height may change naturally; no new global padding, hero layout or typography changes may compensate for it.
- Builder: verify the same existing table/map component owners, table columns/row controls, map behavior, width, mobile composition and surrounding navigation. Only top controls and necessary existing feedback content differ. Long names and Spanish labels stay readable; keyboard order, accessible names and 44px targets remain.
- Use current Storybook fixtures and UI audit/build checks first. Shared UI changes require Storybook build. Browser acceptance follows the repo's opt-in rule; if still required, report `MANUAL HOSTED VERIFICATION REQUIRED` with the specific comparison, without claiming screenshot parity from source alone.

### Diagnosis verification completed

On the isolated `a3ab161` base, `node --experimental-strip-types --test tests/journey-endpoints.test.ts tests/trip-builder-order.test.ts tests/trip-stop-remap.test.ts tests/trip-builder-document-commit.test.ts` passed **63/63**. This supports retention of current endpoint, occurrence, nested-reference and commit behavior; it does not validate the proposed v2 model or constitute hosted acceptance. No product code has changed.

## Settled product decisions and architecture review

The settled decisions remain: preserve unknown legacy endings; retain explicit finish through existing `journeyEnd`; keep required unresolved intent/nights; respect explicit/manual order; omit normal Finish input and numbered intent chips; reuse surrounding UI; automatically save accepted edits and update necessary dependent legs/dates/endpoints. They are not questions to re-open.

**Approved starting state:** use Return to start for the untouched structured-input mode, consistent with approved image(3). In Describe my trip, clearly captured explicit endpoint/one-way intent wins over an untouched default. A traveller-selected toggle remains authoritative and conflicts are surfaced. This is implementation of the approved starting visual, not a generic unresolved choice.

**Approved clarification — deliberate broader optimization (6 October 2026):** Update route is an optional deliberate optimization action, not a save or reconciliation action. Normal accepted edits autosave and automatically update their necessary dependent legs, dates and endpoints. Update route may request a broader optimization proposal. It must never silently override explicit or manually established route order; any proposal that changes authoritative order requires traveller acceptance. This clarification is settled and does not require another product decision.

The Update route clarification above is approved. Review the written canonical ownership and bounded migration before creating the detailed implementation plan. The plan will then receive a separate review before product-code changes, as required by the requested architecture gates and the brainstorming workflow.

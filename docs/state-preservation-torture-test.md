# Canonical trip state-preservation audit

This audit treats a saved `EasyTTrip` as one owner-scoped, revisioned document. An edit may change only the requested fields and the deterministic consequences named below. Generated route-review output may be rebuilt; traveller-authored state may not be inferred to be disposable.

## Canonical state inventory

| State | Canonical location | Identity / preservation rule |
| --- | --- | --- |
| Trip and owner identity | `id`, `ownerId` | Immutable across an edit; every cloud read, preview and write remains owner scoped. |
| Revision / CAS | `updatedAt` | Opaque repository-issued revision token. Unknown/stale revisions are never rebased by another tab. |
| Lifecycle | `status`, `archivedFromStatus` | Past/archived trips reject conversational mutation; archive restore retains the previous status. |
| Route stops | `stops[]` | Surviving `id` and `canonicalPlaceId` stay stable; `order`, dates and nights change only for route/schedule consequences. |
| Geographic identity | stop `canonicalPlaceId`, country/provider fields and coordinates | Reorder/replan retains the existing identity; resolver replacement is outside this mutation ticket. |
| Visit/base relationships | `brief.structuredBrief.placeSelections` and destination `placeMentionId` / stop ID | Reorder retains the relationship. Removing an attached base removes the stale relationship and restores the original attraction to review; unrelated stops remain. |
| Dates and nights | trip dates, stop dates/nights, `dayAllocations`, `nightAllocations`, `nightAllocation` | Schedule cascade is deterministic. Locked arrivals are retained with an explicit conflict. Locked or stay-booked stop-night edits now fail closed. |
| Itinerary | `planItems[]` plus authored `brief.customActivities` / `dayNotes` | Plan rows are derived day containers. Authored activities/notes follow the same surviving item or nearest surviving day at the same stop. |
| Map additions | `brief.mapPins`, `customActivities`, plan-item notes | Stable pin IDs make add/remove idempotent; pins follow their authored day during cascades. |
| Bookings / accommodation | `brief.bookings` | Never rewritten by cascade/reorder/preference edits. Direct night edits to a stay-booked stop fail closed. |
| Prep / traveller state | `travellers`, `brief.checklist` | Byte-equivalent for route, nights and preference changes unless explicitly edited elsewhere. |
| Preferences | legacy brief fields, `brief.intent`, `brief.structuredBrief` | Preference-only edits update the corresponding preference representation plus derived recommendations; stops, bookings and authored itinerary stay unchanged. |
| Locks and decisions | `brief.scheduleLocks`, `decisionSelections` | Retained; locks constrain mutation rather than being silently deleted. |
| Provenance / captured intent | `capturedIntent`, `structuredBrief`, curated route | Retained across incremental edits; route-derived assessment may be recomputed. |
| Readiness / review | `recommendations`, route assessment, cascade status | Derived canonical output may change when its inputs change. Saved checklist, bookings and completion facts remain canonical. |
| Device recovery | owner/trip/write-scoped recovery record | A canonical response resolves only its exact recovery handle or a canonically equivalent baseline. |
| Cloud persistence | owner/trip document in repository | Transactional full-document write guarded by owner, trip ID and exact revision. |

## Mutation matrix

| Mutation | Current contract | Protected-state evidence |
| --- | --- | --- |
| Add city/town/visit through conversational co-pilot | Unsupported; fails closed until canonical add semantics exist | `conversational-replan-gauntlet`, `state-preservation-torture` |
| Remove first/final/content/booked/base stop through conversational co-pilot | Unsupported; fails closed rather than orphaning dependencies | `conversational-replan-gauntlet`, `state-preservation-torture` |
| Adjacent/reverse/edge/substantial reorder | Supported for contiguous stop groups; stable stop/place IDs, bookings and authored day state retained | `trip-replan`, `state-preservation-torture` |
| Return to an earlier base in day order | Fails to `needs-route-edit`; source trip is unchanged | `trip-replan` |
| Increase/decrease one stop's nights | Supported with explicit extend/shorten/redistribute alternatives and deterministic cascade | `trip-copilot-actions`, `state-preservation-torture` |
| Change nights on a locked or stay-booked stop | Rejected before preview/apply | `trip-copilot-actions`, `state-preservation-torture` |
| Shift dates / set fixed commitment through conversational co-pilot | Unsupported; fails closed | `conversational-replan-gauntlet`, `state-preservation-torture` |
| Edit dates/reorder/remove through saved-trip Builder | Supported; rebuilt planner output retains authored canonical state, while confirmed stop removal deletes only its disclosed stay/day dependencies | `state-preservation-torture`, `builder-gate` |
| Pace/budget/accommodation/transport preference | Supported; bounded preference diff plus derived review only | `trip-copilot-actions`, semantic diff test |
| Add/remove Map place | Supported and idempotent; unrelated bookings and days retained | `map-place-itinerary`, `state-preservation-torture` |
| Visit/base add, reorder, base removal | Supported at structured-brief boundary; stale relationships are reconciled, original intent is retained for review | `attraction-intent`, `trip-replan` |
| Preview/apply/retry | Base revision + full-state hash + mutation hash; stale and cross-owner apply rejected; repeated apply idempotent | `trip-copilot-actions` |
| Rapid queued saves | Known-revision three-way merge; unknown revision reaches repository CAS unchanged | `trip-mutation-persistence` |
| Cloud/device reload | Equivalent recovery retires; meaningful divergence remains protected | `trip-browser-storage`, `trip-sync-recovery` |

## Destructive failures found and corrected

### 1. Queued full-document overwrite

- Before: revision R1 with no Map activity.
- Requested: save A adds an activity; queued save B, also based on R1, changes an unrelated field.
- Expected: R3 contains both A and B.
- Previous destructive diff: `/brief/customActivities` reverted when B's whole body was submitted with only R2's token substituted.
- Root cause: the queue rebased only `updatedAt`, not the authored change set.
- Correction: retain known canonical revision snapshots and perform a three-way merge of R1 → B onto R2. Unknown revisions are not rebased and still fail repository CAS.

### 2. Authored day state drift after night reduction

- Before: a Kyoto activity, note and pin attached to a Kyoto day.
- Requested: reduce Kyoto by one night and shorten the trip.
- Expected: authored state remains on a surviving Kyoto day.
- Previous destructive diff: the generated plan row disappeared while day-keyed authored state stayed on the same number, now belonging to Hiroshima.
- Root cause: plan coverage reconciled derived rows without remapping the separate traveller-authored sidecars.
- Correction: map by stable plan-item ID, falling back only to the nearest surviving day at the same stable stop; remap activities, notes and pins together.

### 3. Authored day state drift after route reorder

- Before: the Map reorder handler remapped day sidecars to the reordered plan rows.
- Requested: reorder contiguous stop groups.
- Expected: sidecars remain attached after the route schedule cascade.
- Previous destructive diff: cascade moved the same plan item a second time, leaving the sidecar at the intermediate day number.
- Root cause: route replan did not reconcile authored sidecars after cascade.
- Correction: the same shared authored-day reconciliation now runs after route and night cascades.

### 4. Locked/booked stop accepted as night-edit target

- Before: a stop protected by `scheduleLocks.stopIds` or a saved stay.
- Requested: change that stop's nights (or use it as a redistribution donor).
- Expected: structured, atomic rejection.
- Previous behavior: the target could reach preview/apply; only alternative-donor discovery filtered protected stops.
- Root cause: protection was applied during candidate enumeration, not at the mutation boundary.
- Correction: validate both requested and redistribution stops immediately before mutation. The input document remains unchanged.

### 5. Saved-trip Builder rebuilt away canonical state

- Before: a saved trip containing bookings, completed Prep items, Map pins, authored activities/notes and change history.
- Requested: reopen Builder and change dates, nights or route order.
- Expected: the Builder rebuilds derived schedule/legs while preserving unrelated canonical state.
- Previous destructive diff: `/brief/bookings`, `/brief/checklist`, `/brief/mapPins`, `/brief/customActivities`, `/brief/dayNotes` and `/changeHistory` were absent from the rebuilt document. The stop-removal dialog consequently inspected an empty booking list.
- Root cause: hydration populated Builder controls but retained no canonical source document for fields outside those controls.
- Correction: retain the exact hydrated canonical document, merge its authored state into the rebuilt document, then run the shared day-state reconciliation. A confirmed stop removal deletes only that stop's disclosed stay and day-scoped content; unrelated bookings and Prep state remain.

## Multi-step and adversarial sequences

The executable gauntlet covers:

1. itinerary addition → booking → reorder → night increase → JSON reload → pace change → reload;
2. three consecutive preference edits with reloads;
3. attraction/base relationship → reorder → serialization round-trip;
4. locked schedule → incompatible edit → unchanged canonical state;
5. R1 edits in separate tabs → A saves → B receives CAS conflict;
6. two queued R1 edits → R2/R3 with both independent changes;
7. independent additions to the same authored array without duplication;
8. failed repository apply → pending preview restored and canonical state unchanged;
9. stale preview after cloud mutation → no write;
10. repeated apply → one canonical write and identical result;
11. provider/Map place add twice → one pin/activity, remove twice → stable result;
12. recovery save → canonical-equivalent cloud hydration → no false conflict;
13. meaningful recovery divergence → preserved device copy;
14. guest promotion retry → same trip ID and no duplicate cloud trip.

## Unsupported mutation boundary

Conversational add/remove stop, direct date shifting and fixed-commitment creation remain intentionally unsupported. They reject without mutation rather than pretending to succeed. The Builder's established canonical editing flows remain separate. Supporting these through the co-pilot later requires explicit dependency contracts for bookings, visit/base relationships, legs and day-state placement; it must not be implemented as whole-trip regeneration.

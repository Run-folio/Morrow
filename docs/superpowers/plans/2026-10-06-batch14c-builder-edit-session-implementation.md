# Batch14C Builder controls and connected edits implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan natively, task by task, followed by parent-managed independent whole-branch review. Do not create another implementer. Steps use checkbox syntax for tracking.

**Goal:** Give travellers the approved simple Builder controls, automatically save accepted edits and reconcile their necessary dependencies, while preserving the existing table/map and traveller-established route authority.

**Architecture:** Keep `brief.intent.route` as the sole canonical route-input owner. A bounded Builder edit session distinguishes recoverable input, validated canonical edits, necessary projection work and exact durable acknowledgements; it reuses existing document guards, local recovery, serialized mutation queue, route/leg/cascade engines and proposal acceptance. No new route engine, database infrastructure or parallel canonical store.

**Tech stack:** Existing Next15/React19/TypeScript, EasyT/Morrovia controls and tokens, Node tests, existing Playwright fixtures and Storybook. No dependency installation. Preserve the native execution configuration supplied by the coordinator; no claim of model/Fast changes.

**Spec:** [Approved complete14A contract](../specs/2026-10-06-batch14a-canonical-route-design.md), especially canonical invariants7–10, Save/edit rules and14C visual boundaries. This plan is a review draft, not product-code authorization.

## Approval, source and boundaries

- Product base: visually accepted14B `518f53e1c2a86f989746d3ee9be651c6092a0c67`, same isolated Batch14 branch. Owner thumbs-up on the exact corrected-screenshot question was verified by the coordinator, `messageSentinel_eb011d20673081918095df01b63be04d`. No Batch13 edits.
- Actual Builder images were opened again: One way `libfile_bd581a0362388191ae9f7f9749084432`, local `image(1).png`,1448×1086; Return `libfile_f40c7764a3408191821ca16325bf4c83`, `image(2).png`,1400×1123. Their grouping is type/origin/intents, dates/travellers/budget, collapsed Personalize and optional Update route, above the existing table/map. Written decisions supersede numbered intent chips and explanatory mock copy. Table row numbers remain.
- Update route is optional broader optimization, never a save/reconciliation gate. Accepted ordinary edits automatically save and reconcile affected legs/dates/endpoints. Explicit/manual/legacy order and ambiguous source order cannot be silently rearranged. Every order-changing optimization remains a proposal until accepted.
- Preserve route occurrence IDs, parent intent IDs, canonical place identities, requested/held nights, explicit legacy finish and distinct endpoint stays. Required unresolved intent is provisional and durably retained. Unknown legacy ending remains unknown until a relevant traveller decision.
- Retain `TripBuilderRouteWorkspace`, its columns/rows/night/transport/move/drag/selection controls and responsive table/map composition. Retain navigation, backgrounds, hero/title, page widths, map renderers, TripShell and Overview/Itinerary layout. Data guard wiring is allowed; visual restructuring is not.
- One top Add destination owner replaces the duplicate normal below-table Add-a-stop entry while these top controls are mounted. The below-table entry is an input affordance, not a route row. Preserve its canonical add/clarification handlers and existing Discovery flows; preserve all actual row controls. Fresh direct New Trip intake remains Builder-owned and retains its current starter before the top controls are relevant.
- The accepted14B destination field becomes a shared presentation owner without changing homepage pixels or handlers. No copied chip/button/input primitive. Use canonical controls, Storybook and `docs/design-system.md`; no unrelated Spanish/summary polish.
- No push, staging/production deployment,14D or20-case execution. Mostar/San Pedro provider recovery remains separately open; retention is not successful provider resolution.

## Current implementation evidence

`trip-builder.tsx` currently builds `activeTripDocument` from several UI slices with `tripFromBuilder` and `preserveBuilderCanonicalState`. Device recovery is debounced450ms; `persistGeneratedTrip` performs account persistence primarily through Build. `TripBuilderDetailsEditor` explicitly applies draft fields using Save changes. Transfer resolution posts the whole baseline leg array, has an AbortController and local transfer key, but does not expose durable necessary-work failure. Night allocation/rebalancing runs from current slices. Structural Undo restores a slice snapshot; route-intent authority is not included in that snapshot.14A already supplies `routeProjectionInputKey`, `commitAcceptedRouteProjection`, held-night accounting, route-order guards and consumer review flags. Existing `createTripMutationPersistenceQueue` already serializes exact CAS ancestry and supports intentional local inverse edits.

Retain these proven owners rather than rebuilding the engine or adopting the TripShell hook wholesale. The Builder needs its own small adapter because it also owns partial intake, legacy unverified projections, pending interpretation and a draft→planned transition. Stop the old duplicate device/cloud writers only after equivalent protections are wired into this adapter.

## Review focus and concrete design items

1. **Legacy null key versus interrupted accepted edit.** Both currently look unverified. Add a small optional necessary-work marker under existing `brief.cascadeStatus`, not another route-input owner. A pure read without this marker must not rewrite legacy projections; an accepted-edit marker resumes automatically even when the last validated key is null. Task2 tests both.
2. **Edit B/Undo while save A is in flight.** A may advance trusted CAS ancestry but cannot replace B, clear B's recovery/draft or display B as account-saved. Coalescing must preserve the last local inverse, not optimize it away. Task3 tests exact write IDs, queue rebasing and owner rotation.
3. **Same-place enrichment versus different occurrence or endpoint pair.** One name/coordinate update must not invalidate every leg or assign a sibling Tokyo/transport choice by array index. Tasks1/2 test IDs, changed evidence and endpoint-bound choices.
4. **Fixed dates and booked/authored content.** Generic cascade currently re-dates plan containers. The adapter must move only flexible generated containers, preserve explicit dated commitments/bookings and retain orphaned authored content for review. Task2 tests conflict and preservation; no engine rewrite.
5. **Shared top field versus canonical route intent.** Legacy intents need tag display without fabricating an autocomplete suggestion/type; country-parent chips must survive child-base edits. Shared presentation accepts labels/status and editor slots independently of canonical suggestions. Task4 tests legacy/area/repeated intents and14B pixel preservation.

These are implementation decisions to review, not reopened product choices. In particular, the optional necessary-work marker below is a proposed compatibility-safe representation of already-approved interrupted reconciliation. If review rejects this representation, revise Task2 before implementation; do not silently substitute a fake projection key or force legacy optimization on read. There are no outstanding product questions about Update route, ending fields, ordered chips or autosave.

## Files and interfaces

**New bounded owners:**

- `lib/easyt/trip-builder-input-draft.ts`: versioned owner/trip-scoped unaccepted input codec and synchronous device write/read guards; never canonical/cloud route truth.
- `lib/easyt/trip-builder-edit.ts`: pure accepted-edit adapter and dependency scope; canonical validation and compatibility endpoint projection.
- `lib/easyt/trip-builder-reconciliation.ts`: targeted necessary projection and scoped response merge, reusing existing engines.
- `lib/easyt/trip-builder-edit-session.ts`: small framework-independent session coordinator with injected storage/provider callbacks and clocks, reusing the existing cloud queue. This is Builder orchestration, not a generic persistence framework.
- `app/journey/new/use-builder-edit-session.ts`: thin React subscription/lifecycle adapter.
- `app/journey/new/trip-builder-top-controls.tsx`, its scoped CSS and `.stories.tsx`: approved top-control composition and separate save/projection feedback.
- `components/easyt/morrovia-destination-field.tsx`, scoped CSS/stories: shared field/tag presentation extracted from the accepted14B editor, with caller-owned autocomplete/selection/focus. No canonical place fabrication.

**Narrow modifications:** `trip-builder.tsx`; top-only selectors in `trip-builder.module.css`; `trip.ts`/`trip-document.ts` for the optional typed work marker; `trip-route-intent.ts` for its status/key guards; `cascade.ts`/`trip-builder-preservation.ts`/`trip-authored-day-state.ts` only where red preservation/metadata tests demand; `home-destination-editor.tsx`/CSS only for shared presentation extraction with output/handler parity; relevant generated Storybook inventory. Existing readiness/facts selectors may receive targeted scope guards through `tripProjectionNeedsReview`; their layouts remain unchanged.

**Read/reuse without planned behavioral edits:** `repository.ts`, DB migrations, storage/CAS and promotion APIs, `trip-mutation-persistence.ts`, TripShell persistence hook, planner/resolver algorithms, route-workspace/map renderers, navigation/global design files,14B homepage route-choice/handoff logic. A demonstrated need to edit these returns for scope review with a failing probe.

Pin these shared types in `trip.ts`, so persisted metadata does not depend on a React/module cycle:

```ts
type RouteReconciliationScope = {
  legIds: string[]; scheduleStopIds: string[]; recommendationStopIds: string[];
  endpointChanged: boolean; routeAssessment: boolean;
};
type TripRouteReconciliation = {
  version: 1; inputKey: string;
  phase: "pending" | "failed" | "conflict";
  scope: RouteReconciliationScope; // sorted stable IDs, never array positions
};
// Add only: TripCascadeStatus.routeReconciliation?: TripRouteReconciliation
type BuilderEditScope = { ownerId: string | null; tripId: string; inputRevision: number };
```

Marker describes outstanding work, contains no alternate origin/intents/order or save timestamp, and is excluded from `routeProjectionInputKey`. Preserve it through interim cascades/rebuilds/merge/recovery. Clear it only after successful guarded affected reconciliation. A failed provider response cannot mark work current. Errors use existing feedback and truthful leg/intent evidence; no raw provider payload is stored in this marker.

`BuilderAcceptedEdit` is a discriminated union owned by `trip-builder-edit.ts`: origin selection/clear; type selection with an explicitly accepted endpoint replacement; add/remove/replace/resolve destination by intent ID and existing occurrence mappings; nights by stop ID; dates; travellers/budget/preferences; accepted ordered stop IDs; transport choice by leg/evidence identity; existing structural inverse. Each arm carries only its owned value, not a whole independently writable route snapshot.

```ts
prepareAcceptedBuilderEdit(current: CanonicalEasyTTrip, edit: BuilderAcceptedEdit,
  expectedFingerprint: string):
  | { ok: true; trip: CanonicalEasyTTrip; scope: RouteReconciliationScope; releasedNights: number }
  | { ok: false; reason: "stale-source" | "invalid-input" | "endpoint-conflict" | "binding-conflict" };
reconcileBuilderDependencies(current: CanonicalEasyTTrip, scope: RouteReconciliationScope):
  | { ok: true; trip: CanonicalEasyTTrip }
  | { ok: false; trip: CanonicalEasyTTrip; reason: "conflict" | "unavailable" };
mergeBuilderProjectionResponse(current: CanonicalEasyTTrip, response: {
  scope: BuilderEditScope; inputKey: string; legs: TripLeg[];
}, expected: BuilderEditScope): { ok: true; trip: CanonicalEasyTTrip } | { ok: false; reason: "stale" | "invalid" };
```

Add Task2's synchronous `prepareBuilderNecessaryProjection(current: CanonicalEasyTTrip, scope: RouteReconciliationScope): { ok: true; trip: CanonicalEasyTTrip } | { ok: false; reason: "invalid-bindings" }`. It creates coherent accepted endpoint/stop/leg/child references, truthful unknown affected leg evidence and pending metadata before any first durable write. Task1's computed edit is an intermediate candidate; Task3 runs this deterministic prefix and validates the full document before installing/saving it. Removing a stop cannot persist old incident legs or child rows referencing that removed stop: move authored orphan content into existing reviewable fields, preserve all authored values, and remove only obsolete generated child bindings. This prevents a transient invalid relational projection while asynchronous provider work remains pending.

Input draft envelope: version1, ownerId/tripId/inputRevision, `basedOnFingerprint`, only unaccepted origin text, intent-bound destination text, stop-bound partial night text, partial dates and pending conflicting type. Canonical selected values remain in the trip. Scope its existing private-key convention as `easyt-private:<guest|owner-ID>:builder-input:<encoded-trip-ID>` via a named key helper in the draft module. Codec limits reuse homepage limits; malformed/future envelopes preserve original bytes and block unsafe replacement. No document recovery record is created from partial text. Explicit clear/remove is an accepted edit, not an inferred consequence of empty typing.

Session interface: `createBuilderEditSession({initialTrip, getOwnerId, readDraft, writeDraft, saveRecovery, acknowledgeRecovery, persistAccount, reconcile, now, schedule})` returns `getSnapshot()`, `subscribe(listener)`, `updateDraft(patch)`, `accept(edit, expectedInputRevision)`, `resumeNecessaryWork()`, `retrySave()`, `flush(): Promise<boolean>`, `dispose()`. Inject existing functions rather than copy their guards. React adapter returns the same actions/snapshot. Snapshot owns current validated trip, inputRevision/draft, save state (`device-saving|local|cloud-saving|cloud|error`) and independent projection state (`legacy-unverified|pending|current|provisional|failed|conflict`). Proposal preview stays outside validated trip until accepted.

Pin revision ownership: increment `inputRevision` for meaningful raw-source changes and accepted edits; retain `acceptedRevision` identifying the latest validated document. An async interpretation/proposal checks current inputRevision; necessary work rejected after raw typing resumes under the new revision against the same accepted canonical key without consuming or clearing that draft. Account acknowledgement checks acceptedRevision plus exact document/owner/write ID, may advance trusted CAS ancestry, and never acknowledges unaccepted text. While raw draft is dirty, visible feedback identifies input retained on device rather than implying that text is account-saved. Restoring an interrupted draft never increments server `updatedAt`.

## Dependency and acknowledgement policy

| Accepted edit | Automatic affected work | Retain |
| --- | --- | --- |
| Display label only, same verified identity/evidence | Display refresh; no route-key/leg/date work | Entire projection, IDs, authority, nights/authored data |
| Same verified place, changed provider/geometry evidence | That pin/evidence and incident legs whose dependency identity changed | Occurrence/parent IDs, order, requested nights; unaffected legs/options |
| Different destination place, add/remove/base resolution | Changed occurrence/parent bindings, predecessor→successor bridge or incident legs, flexible downstream schedule, affected place suggestions/assessment | Other IDs, explicit nights/order; orphan content retained; removal releases nights without redistribution |
| Accepted manual order/Undo | Changed adjacent pairs, downstream flexible dates/assessment | IDs/night amounts/authored state; authority restored by the actual inverse snapshot, not labels |
| Nights/dates | Flexible downstream dates/day suggestions/assessment and timing-dependent affected leg evidence | Geography/order; dated commitments/bookings unchanged, conflicts visible |
| Origin/type/explicit endpoint | Accepted gateway/return endpoints, affected gateway legs/feasibility/dates | All destination occurrences and requested nights, including a separately requested endpoint stay |
| Travellers/budget/interests | Only dependent costs/place/day recommendations | Route membership, authoritative order, authored choices/bookings and unrelated leg evidence |
| Transport preferences/choice | Only matching leg/evidence and travel-day consequences; downstream flexible timing as needed | Other pairs/selected options, all route authority and places |

Use `routeProjectionInputKey` as the actual canonical input fingerprint, never a job token. Extend its binding-commitment dependency only for explicit dated/confirmed booking bindings needed for schedule validation; exclude booking title/labels, status timestamps and presentation-only text. Add targeted key tests before any extension. Costs/recommendation-only pending work must not make unrelated route geometry or itinerary completeness stale: status guards use the marker's affected scope. Existing `tripProjectionNeedsReview` remains the downstream route/timetable guard, and unknown transfer evidence still prevents false usable-time/bookable claims.

Accepted edit: validate current scope/fingerprint → atomically derive canonical route/endpoints and truthful pending/unknown dependencies → successful immediate local recovery write → install accepted document → schedule affected work and cloud save. Partial draft writes are synchronous and separately labelled; storage failure preserves the in-memory draft, keeps the last valid canonical document and never claims device durability. Necessary deterministic endpoint/date work does not await cloud. Async requests use owner/trip/revision/inputKey plus exact intent/leg occurrence identity; merge no broader response than the requested affected IDs. Required unresolved intent remains provisional even after all other work settles.

Reload resumes interrupted `pending` work automatically. Persisted `failed`/`conflict` work remains truthful with the existing targeted Retry/review action; do not repeatedly hammer a completed failed lookup on every render. A completed empty place lookup is unresolved, whereas a completed transport assessment with no verified mode is a valid unknown-evidence result, not a fabricated duration or permanent network failure. Transport unknown still blocks false usable-time/bookable claims through existing selectors. Neither case permits erasing required destination intent.

Serialize account saves through `createTripMutationPersistenceQueue(saveTripRecoveryToEasyT)` and exact recovery handles. Coalesce only not-yet-submitted accepted documents using the existing450ms debounce; keep at most one in-flight and one latest pending snapshot. Immediate device writes retain every accepted latest edit, including the final local Undo. Known preceding acknowledgements advance the queue's CAS ancestry; only an exact current document/revision/owner/write-ID acknowledgement can update visible cloud-saved state or retire its matching recovery. On conflict/auth/network/validation failure pause retries, preserve local truth, show existing recovery actions and never replace the current draft with a late account copy. Build/navigation flush the same controller; they must not start a competing direct cloud writer. Guest→account promotion remains an explicit existing ownership transition.

## Task1: Accepted canonical edits and recoverable partial input

**Files:** create draft/edit modules and `tests/trip-builder-input-draft.test.ts`, `tests/trip-builder-accepted-edit.test.ts`; reuse document/endpoint/order/remapping guards. No JSX yet.

**Interfaces:** consumes `CanonicalEasyTTrip`, `builderDocumentFingerprint`, `prepareBuilderDocumentCommit`, `projectCanonicalRouteEndpoints`, existing order/transport helpers; produces the accepted-edit/draft contracts above for Tasks2–4.

- [ ] **Write failing tests:** `partial_night_text_does_not_replace_canonical_requested_nights` pins raw `"2x"` versus canonical2; `same_name_repeated_stop_edits_by_intent_and_stop_id` changes one Tokyo only; `type_change_conflict_requires_explicit_replacement_acceptance` rejects Return with Rome until accepted and retains a separate Rome stay; `area_base_resolution_retains_parent_total_and_identity` preserves one parent budget; `legacy_unknown_is_not_default_return` retains unknown; `explicit_remove_releases_nights_without_redistribution` preserves other allocations; `future_or_foreign_draft_preserves_original_bytes` blocks replacement. Include pure copy/no-mutation assertions and compatibility/canonical endpoint equality.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/trip-builder-input-draft.test.ts tests/trip-builder-accepted-edit.test.ts`; record actual failure on missing behavior.
- [ ] **Implement** exact contracts with one coherent canonical edit, current fingerprint guard, stable mappings and last validated key retained. Update accepted requested-night provenance separately from generated allocation; never resolve or create a stop from a name match. Reject stale/type/binding conflicts before local canonical installation.
- [ ] **Run GREEN:** new tests plus existing `trip-document-migration`, `trip-route-intent`, `trip-builder-document-commit`, `trip-stop-remap`, `journey-endpoints` and homepage input preservation/projection tests. No opt-in skip is counted as interaction coverage.
- [ ] **Commit:** `feat: accept scoped builder edits without losing input drafts`.

## Task2: Targeted necessary reconciliation and durable interrupted work

**Files:** new reconciliation module/`tests/trip-builder-reconciliation.test.ts`; optional marker type/codec/status/key checks in `trip.ts`, `trip-document.ts`, `trip-route-intent.ts`; narrow cascade/preservation fixes only justified by tests; `tests/trip-route-projection.test.ts`, `tests/trip-document-storage.test.ts`, readiness/facts tests.

**Interfaces:** consumes Task1 trip/scope; existing `buildCanonicalTripLegs`, `cascadeTripSchedule`, `preserveBuilderCanonicalState`, `reconcileAuthoredDayState`, `commitAcceptedRouteProjection`, `routeNightBudget`; produces necessary-work marker and guarded merge above. Current same-order automatic reconciliation uses `reason:"necessary_reconciliation"`; row reorder acceptance uses `reason:"manual_order"` only at deliberate acceptance.

- [ ] **Write RED:** `legacy_null_key_read_does_not_schedule_or_write`; `accepted_legacy_edit_marker_resumes_on_device_and_cloud_reload`; `origin_change_updates_only_gateway_legs`; `presentation_rename_keeps_geometry_key`; `removed_stop_reconnects_neighbors_and_retains_orphan_content`; `accepted_removal_has_valid_child_references_before_first_save`; `night_change_keeps_booked_dates_and_reports_conflict`; `provider_error_empty_and_ambiguity_remain_distinct`; `completed_unknown_transport_is_not_fabricated_or_permanent_network_failure`; `old_leg_response_cannot_target_a_new_pair`; `budget_work_does_not_invalidate_itinerary_geometry`; `pending_or_failed_marker_cannot_be_cleared_by_save`. A marker roundtrip/future-version test preserves source on invalid metadata.
- [ ] **Run RED:** new reconciliation tests plus projection/storage/key tests; expected missing marker/scope/response guards fail.
- [ ] **Implement** changed-pair diff and per-scope work. Rebuild/merge only affected legs; keep untouched leg IDs, evidence, transport selections and authored content byte-equivalent. Run flexible schedule cascade after explicit commitment guards; retain conflicts/unknown data without stamping a validated projection key. Preserve unrequested free nights on removal and reserve held Mostar2/SanPedro3 nights before allocation. Do not auto-reorder any established route for ordinary edits; first projection of fresh optimizable unresolved intake may use the existing optimizer only when authority permits. Clear/stamp after validated successful affected projection through14A commit helper; keep marker through failure/reload. Do not declare provider resolution successful from retention.
- [ ] **Run GREEN:** projection/cascade/authored state/remap/night-budget/transport selection/readiness/facts/storage tests. Assert Overview/Itinerary selectors cannot expose stale route times/dates as current after changed inputs, while recommendation-only work preserves unaffected route readiness.
- [ ] **Commit:** `feat: reconcile only dependencies affected by builder edits`.

## Task3: Exact device/account autosave session

**Files:** create session module/React adapter, `tests/trip-builder-edit-session.test.ts`; narrowly wire Builder hydration/device/build persistence blocks after controller tests. Existing queue/storage/repository remain owners.

**Interfaces:** uses Tasks1/2; `saveTripRecovery` with exact replacement handle; `saveTripRecoveryToEasyT`, `acknowledgeTripBuildSave`/canonical-cache acknowledgement and `createTripMutationPersistenceQueue`; produces session snapshot/actions for Tasks4–6. Use monotonic local inputRevision, not server `updatedAt` as the edit identity.

- [ ] **Write RED with deferred real orchestration callbacks:** `accepted_edit_is_device_durable_before_debounce`; `A_ack_does_not_replace_B_or_retire_B_recovery`; `latest_coalesced_B_uses_A_acknowledged_CAS_ancestry`; `edit_then_undo_while_A_in_flight_saves_the_inverse`; `owner_rotation_discards_old_feedback_and_projection_response`; `failed_storage_keeps_draft_and_last_valid_trip`; `retry_keeps_exact_trip_owner_and_write`; `build_flush_uses_one_writer_for_latest_revision`; `interrupted_projection_resumes_after_reload_without_update_route`; `partial_typing_during_reconciliation_preserves_draft_and_resumes_same_canonical_key`. Test saved inputs/projection-pending and completed projection/cloud-pending as separate states, and ensure a canonical account acknowledgement never clears or claims durability for unaccepted text.
- [ ] **Run RED:** `node --experimental-strip-types --test tests/trip-builder-edit-session.test.ts tests/trip-mutation-persistence.test.ts tests/trip-sync-recovery.test.ts`; observe missing controller behavior.
- [ ] **Implement** bounded coordinator and thin lifecycle hook, one queue per trip/owner, immediate recovery then450ms cloud coalescing, exact acknowledgement, cancellation/resume and error protections. Preserve hydration source/recovery classification and old receipt ownership. Suppress old competing effects only after parity assertions; canonical render state consumes accepted session documents rather than rebuilding stale intent over them. Apply required Builder presentation slices together via one `applyAcceptedBuilderDocument` function including route intent/authority, IDs/allocations/locks, dates/endpoints and acknowledged CAS metadata. Derived UI memos may read those values; they cannot silently commit route changes.
- [ ] **Run GREEN:** session/queue/recovery/promotion/Builder persistence tests; replay two accepted edits plus Undo, sign-out/auth expiry, storage failure and new-trip navigation. Repository integration stays passed at14A unless persistence guards/writer semantics actually change.
- [ ] **Commit:** `feat: autosave accepted builder edits through the guarded queue`.

## Task4: Approved top controls and existing row handler alignment

**Files:** top-controls component/CSS/stories; shared destination field/tag extraction/stories; homepage editor presentation adaptation; `trip-builder.tsx`/top-only CSS; layout/details/inline-add/reorder test expectations; `tests/trip-builder-top-controls.test.ts`. Do not edit table/map component layout.

**Interfaces:** top control receives session trip/draft/status and callbacks, not separately writable origin/end/stops. Shared presentation contract `MorroviaDestinationField({label, children, addAction, status})` and `MorroviaDestinationTag({id,label,editor,onEdit,onRemove,disabled,removeDisabled,ref})` renders the accepted14B DOM/control arrangement. Callers own autocomplete, canonical status and focus. Stable ID refs remain functional; no autocomplete selection is invented for legacy tags.

- [ ] **Write RED:** `builder_has_two_type_options_without_normal_finish_input`; `legacy_finish_summary_visible_without_losing_stay`; `top_chips_unordered_table_rows_numbered`; `one_top_add_destination_reuses_existing_add_flow`; `partial_origin_typing_is_not_canonical_until_selected`; `selected_origin_autosaves_without_save_button`; `table_nights_transport_move_and_drag_keep_handlers`; `shared_field_preserves_homepage_focus_ids_and_pixels`. Pin dates/travellers/budget and collapsed Personalize with existing interests/pace/style/transport/constraints; unknown legacy has neither toggle falsely selected.
- [ ] **Run RED:** focused presentation and actual Storybook play tests where authorized. A source regex alone is not visual/layout acceptance.
- [ ] **Implement** shared extraction and top composition. Use accepted14B field, EasyT segments/buttons, canonical place search, date picker, quantity/budget and existing Personalize content. Origin selection, valid dates/numbers and choices call session accept; raw text calls draft storage. No Save changes or Build-as-save message. Keep existing risk/confirmation notices; explicit finish/unknown ending appear when decision-critical. Wire row add/remove/replace/nights/order/transport and structural Undo through the same accepted-edit adapter; extend the existing inverse snapshot to include canonical route/authority/requested-night/mapping state, without a new undo system. Disable stale/foreign/recovery-blocked commits, not all editing during unrelated async work. Single top Add opens the existing intake/clarification machinery; suppress only its duplicate normal below-table input while top controls are visible.
- [ ] **Run GREEN:** top/stories/layout/inline-add/order/mouse drag/clarification tests. Preserve one direct NewTrip owner,14B review/receipt behavior and source-bound endpoint conflict acceptance. Add English/Spanish/long-name/legacy/area/provisional/device/cloud/failure fixtures; prove44px targets and keyboard/focus behavior.
- [ ] **Commit:** `feat: align builder top controls with the approved route inputs`.

## Task5: Optional Update route proposals

**Files:** existing Builder route-recommendation/proposal handlers and top action; pure proposal guards in edit/reconciliation modules; `tests/trip-builder-route-proposal.test.ts` and existing order/preview tests. Reuse planner scoring/candidate engine, existing route-check comparison/Apply order/Keep order and preview UI.

**Interfaces:** proposal envelope `{id,ownerId,tripId,inputRevision,inputKey,projectedTrip}` is immutable and separately displayed. `acceptBuilderOptimization(current,proposal,expectedScope)` checks exact source and delegates `commitAcceptedRouteProjection(...reason:"accepted_optimization")`; acceptance establishes manual authority. No new automatic order authority mode.

- [ ] **Write RED:** `ordinary_edit_reconciles_without_update_route`; `update_route_click_does_not_save_or_apply_order`; `explicit_manual_legacy_and_ambiguous_orders_require_acceptance`; `stale_proposal_after_nights_or_endpoint_edit_is_rejected`; `cancel_and_keep_leave_canonical_bytes_unchanged`; `accepted_proposal_autosaves_once_and_preserves_nights_commitments`. A no-improvement/provider-unavailable result retains current route and truthful evidence.
- [ ] **Run RED:** proposal/order/preview/projection/session tests.
- [ ] **Implement** request→preview→deliberate acceptance, using existing latest-request cancellation pattern and source key. Computing a proposal cannot rewrite canonical route or trigger a save status. Any changed route order, including optimizable existing routes, goes through visible acceptance; an unchanged result reports no improvement. Necessary dependency retry remains its own error action; Update route cannot serve as Retry save or reconciliation. Keep normal Build progression independent and existing downstream navigation protected.
- [ ] **Run GREEN:** proposal/authority/reload/queue tests and actual Apply/Keep/Escape/focus interactions. Verify accepted manual route remains stable through later budget/date/origin updates.
- [ ] **Commit:** `feat: separate optional route proposals from autosave and reconciliation`.

## Task6: Local integration, preservation and review evidence

**Files:** new `tests/trip-builder-edit-session-app-browser.test.ts`, focused helper extensions under `tests/helpers/` only; relevant existing Browser/Node tests and evidence report. No extra product architecture or14D work.

- [ ] **Pin real browser RED cases before any necessary correction:** ordinary selected origin/type/date/night edit saves and updates its necessary legs/dates without Update route; exact delayed account acknowledgement under rapid B/Undo; interrupted transfer/provider failure/reload resumes with saved/projection statuses separated; partial input reload preserves last canonical trip; explicit/manual route proposal needs acceptance; direct NewTrip correction never touches homepage envelope. Stub provider/account boundaries with exact request/response payloads, trusted `updatedAt` CAS and delayed responses; generic malformed200 fixtures are forbidden. Use current guest/disposable contexts or explicitly authorized existing QA accounts; never reset real drafts or invent credentials.
- [ ] **Execute focused Node coverage:** new edit/draft/reconciliation/session/top/proposal tests plus `trip-route-intent`, `trip-route-projection`, `trip-document-migration`, `trip-document-storage`, `trip-builder-document-commit`, `trip-builder-order`, `trip-stop-remap`, `cascade`, `night-allocation`, `trip-replan`, `trip-mutation-persistence`, `trip-sync-recovery`, `trip-promotion`, `builder-persistence-acceptance`, `trip-readiness-summary` and relevant homepage input/handoff preservation. Report every failure/skip. Run targeted capture/clarification regressions when handler wiring changed, not route-specific provider claims.
- [ ] **Run checks:** `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, `git diff --check`. Attempt existing lint once and report its known configuration prompt if unchanged; add no tooling to bypass it. Run meaningful existing project test commands for touched owners; there is no general `npm test` script.
- [ ] **Execute opt-in local browser evidence only after this plan's implementation/browser authorization:** `MORROVIA_BUILDER_APP_BROWSER_TESTS=1 node --experimental-strip-types --test tests/trip-builder-edit-session-app-browser.test.ts tests/trip-builder-row-drag-app-browser.test.ts`; `MORROVIA_BUILDER_BROWSER_TESTS=1 node --experimental-strip-types --test tests/homepage-builder-hydration.test.ts tests/trip-builder-inline-add-stop-browser.test.ts`; applicable enabled homepage handoff tests verify shared extraction. Add exact flags consistent with existing helpers rather than silently skipping a new suite. Actual mouse drag must retain interruption behavior; programmatic order mutation is insufficient.
- [ ] **Capture matched base/candidate desktop and390/430 full-page/top crops:** same trip, locale, authority/order, resolved/provisional intent, save/projection phase, selected row and scroll. Open actual OneWay/Return references and combined comparisons. Verify the same table columns/row controls/map owner/navigation/surroundings; no global compensation styles. Check Spanish/long names/focus44px. Capture unchanged14B homepage states to prove shared extraction parity. Save individually labelled actual screenshots and QA/evidence to Library, preserving prior identities/version history where they represent the same artifact. Until executed, say exactly which browser/hosted verification remains required.
- [ ] **SQL evidence decision:** reuse `/Users/shaun/Documents/Codex/2026-10-06/task-3/sql14a-7fa832c1/RESULT.md` and actual1pass/0skip proof at accepted14A `34f71bd554ed161df17858a50e995e818cd0546e`. Optional JSONB marker roundtrip is covered locally. If a failing test requires repository/CAS/promotion/child-transaction guard changes, stop for that scope review and repeat the actual isolated SQL scenario for the resulting candidate; never claim old SQL proof verifies changed guards.
- [ ] **Commit evidence and return exact candidate** for independent whole-branch technical/product/pixel review before14D. The20-case regression pack and unresolved live Mostar/SanPedro recovery are separate later gates, not local mock-suite passes.

## Self-review and handoff

Coverage: approved visuals/boundaries→Task4/6; canonical inputs/legacy endings/repeated/area IDs→Task1; held nights/commitments/targeted invalidation/consumer honesty→Task2; draft/canonical/durable states/owner/CAS/queue/reload→Task3; optional proposals/authority→Task5; independent local evidence and later gates→Task6. The five review-focus conditions have named tests in their owner tasks. No new `endingAt`, `finishConstraint`, route graph or database rewrite is proposed.

Review the optional work-marker representation, the single top Add owner and shared extraction parity, the no-competing-writers transition and the fixed/authored-date preservation guard. They are the main implementation risks. Native execution method is already supplied; do not ask for an execution-method choice again. Stop at this written-plan review. No14C product code has been changed.

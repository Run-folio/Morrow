# Batch 14A Canonical Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve traveller route intent, authority, identities and nights through every supported trip read/write path without replacing Morrovia's routing engine or UI.

**Architecture:** Extend the existing trip document to schema v2 and `brief.intent` to version 2, with `brief.intent.route` as the single route-input owner. Pure adapters convert supported v1 documents in memory; existing ordered stops, legs, itinerary and relational projections remain. Install compatible readers first, then protect and enable canonical writes using existing owner checks, compare-and-swap and recovery machinery.

**Tech Stack:** TypeScript, Next.js 15/React 19, Node's existing `--experimental-strip-types --test` runner, existing Neon/Postgres JSONB and browser storage.

**Spec:** [Approved canonical route specification](../specs/2026-10-06-batch14a-canonical-route-design.md), Library `libfile_9c545518eb5c8191ae2ebe3df70969d6`, version 2. The full corrected specification was approved after the Update route clarification: Shaun's answer to the explicit full-spec/plan question was “yes continue and keep going as you see fit” on 6 October 2026. This plan still requires its separate review before product code.

Library read verified `version_id: "2"`, file `file_0000000061a082308efa5343c034e699` and 29,795 bytes during the subsequent plan review. That is the current approved source; an older review context referring to version 1 does not supersede it. The spec itself is unchanged by these plan clarifications.

## Global Constraints

- Base: `a3ab161e7ea97229f851423bc81fb0f67271560c`; isolated checkout `/Users/shaun/Documents/Codex/2026-10-06/task-2/Morrovia-batch14`, branch `codex/batch14-route-spec`. Never edit Batch13.
- Execution remains native in this thread; do not create another implementer. Use executing-plans after plan approval. The header's subagent recommendation does not override this instruction.
- “Existing `brief.origin`/origin metadata and `brief.journeyEnd` become compatibility projections, updated from that owner in one conversion/commit function.”
- “Normal homepage destination chips are unordered intents.” Explicit textual order, manual order and preserved legacy order are authoritative; no label/order inference overrides them.
- “V1 does **not** add `endingAt` or `finishConstraint` fields, nor a normal homepage Finish field.” Preserve existing explicit `JourneyEndSelection` capability.
- “A read cannot change stored bytes, `updatedAt`, owner or recovery acknowledgement.” No bulk migration, storage-key rotation, dependencies or database infrastructure.
- “Requested nights are hard traveller input, separate from generated allocation and dates.” Hold unresolved requests once; zero is explicit; removal does not redistribute nights.
- Accepted edits automatically save and update necessary dependent legs, dates and endpoints. Update route is an optional broader optimization proposal; changing authoritative order requires traveller acceptance. 14A supplies the model contract and guards; the new autosave controller and automatic async reconciliation lifecycle belong to 14C.
- Hard phase boundary: 14A implements canonical model/migration/read-write protection, projection/invalidation primitives and narrow data bridges only. It does not implement the new autosave controller, Builder controls, scheduling/retry lifecycle or final Update route interaction. Model proposal/acceptance tests are not a claim that those interactions are implemented.
- Preserve the Batch13 diagnostic baseline: 8 of 10 pass and 2 fail across mixed SHAs, not release signoff. Keep the existing routing engine architecture; these changes preserve intent and add boundary guards, not a routing-engine rewrite.
- No homepage visuals, Builder controls/JSX, CSS, navigation, table, map, surrounding layout or shared UI changes in 14A. Only narrowly identified Builder data bridges below are permitted.
- Preserve user drafts, authored itinerary, bookings, fixed commitments and account isolation. No resets, deletion of legacy source, new QA credentials, staging, push or deployment in this step.
- No browser automation for this model work. Source and focused automated tests are the default; hosted verification follows the separately approved candidate gate.

## Review Focus

1. An old tab saves schema v1 after another tab has saved v2, even with a matching token: reject inside the database transaction and preserve newer route metadata. Task 5: `v1_client_cannot_overwrite_v2_even_with_matching_token`.
2. A legacy trip visits the same city twice with a finish at that city: retain separate stay identities and the endpoint, with no name-based night/commitment binding. Tasks 1/3: `repeated_city_finish_and_ambiguous_commitment_are_preserved`.
3. A provider returns empty/error/timeout, then an explicit selection wins before a late response: retain the original intent and held nights; ignore the stale response. Task 2: `empty_timeout_error_then_selection_retains_original_intent`.
4. Reload encounters a future document version while an older cache exists: surface unsupported data and preserve both sources; never present the old cache as the current canonical trip. Task 4: `future_cloud_version_does_not_fall_back_to_stale_cache`.
5. A concurrent merge combines accepted route order with an unrelated edit: validate order bindings as one unit; no split merge of `orderedStopIds`, stop order and authority. Task 6: `concurrent_order_and_preference_merge_is_atomic`.

---

## Scope and file ownership

I1–I10 below refer to the numbered invariants in the approved specification. These are actual planned files; an additional production path needs an explained invariant and review if it exceeds the spec allowance.

| Files | Responsibility / invariant |
| --- | --- |
| `lib/easyt/trip.ts` | Existing types and factories accept legacy and canonical documents; canonical intent owns compatibility endpoints. I1–I9. |
| **New** `lib/easyt/trip-route-intent.ts` | Pure identity, authority, night budget and projection dependency helpers; no providers or storage. I1–I6, I8–I10. |
| **New** `lib/easyt/trip-document.ts` | Supported-version decode, idempotent migration, canonical write validation and typed unsupported-version errors. I4–I8, I10. |
| `lib/easyt/home-trip-handoff.ts` | Capture all meaningful destination intents before filtering to routable stops; retain frozen input receipt and async identity guards. I2–I5, I8. |
| `lib/easyt/trip-promotion.ts` | Remap stop references, canonical equivalence, owner promotion and duplication. I4, I7–I9. |
| `lib/easyt/storage.ts` | Local/cache/recovery and HTTP response boundaries; read-only legacy fallback, exact acknowledgement. I5, I7–I10. |
| `lib/easyt/repository.ts` | Read/list/archive/restore/copy/gift decoding and protected canonical JSONB/projection writes. I4–I10. |
| `lib/easyt/trip-persistence-error.ts` | Safe version/validation failure classification using existing error feedback. I7. |
| `app/api/easyt/trips/route.ts`, `app/api/easyt/trips/[tripId]/route.ts`, `app/api/easyt/trips/[tripId]/promote/route.ts` | Read/write version compatibility; retain raw incoming schema for old-client protection. I7. |
| `app/api/journey-booking-readiness/route.ts`, `lib/easyt/trip-copilot-previews.server.ts` | Decode supported request/stored documents without silent future-version loss. I7. |
| `lib/easyt/spreadsheet-import.ts`, `lib/easyt/imported-trip-hydration.ts`, `lib/easyt/public-route-handoff.ts` | Import/editorial factories retain reviewed order and unknown endings; existing spreadsheet repair stays narrow. I3–I9. |
| `lib/easyt/trip-builder-preservation.ts`, `lib/easyt/trip-builder-document-commit.ts`, `lib/easyt/trip-builder-order.ts`, `lib/easyt/trip-builder-route-preview.ts` | Preserve canonical route through rebuild, fingerprint changes, validate accepted order and keep previews non-mutating. I3–I10. |
| `lib/easyt/trip-replan.ts`, `lib/easyt/trip-copilot-actions.ts`, `lib/easyt/trip-mutation-persistence.ts` | Existing accepted model mutations preserve/update authority, requested nights and coherent projection bindings. I3–I10. |
| `app/journey/new/trip-builder.tsx` | Data wiring only: hydrated intent, document-constructor input and accepted-order source. No new controls/state machine/JSX/CSS or save-effect replacement. I3–I8. |
| `tests/fixtures/batch14-route-documents.ts` and tests named in tasks | Legacy/canonical fixture corpus and behavioral evidence for the relevant invariants. |

Read-only references include `planner.ts`, `cascade.ts`, booking candidate mutations, copilot hashing, current design-system files and all three approved mockups. Do not modify these unless a named failing invariant requires a narrow additional adapter and the allowance already covers it; record that deviation before editing. No SQL migration is planned: `schema_version` is already an integer and `document` JSONB.

## Shared interfaces and version rules

Put the spec's exact `RouteIntent` and `DestinationIntent` types in `trip.ts`. Keep `EasyTTrip.schemaVersion: 1 | 2` and a legacy-compatible `TripIntent` union/common shape so deliberate v1 fixtures and old clients remain representable. Add `CanonicalEasyTTrip` narrowing to schema 2, intent 2 and required `route`. V2 does not keep an independently writable `intent.journeyEnd`; its endpoint owner is `intent.route.journeyEnd`, projected to `brief.journeyEnd`. `tripIntentForTrip` must understand both versions; it must not fall back merely because intent is v2.

The following signatures are fixed for task handoff; use type-only imports from `trip-route-intent.ts` into document helpers to avoid a runtime cycle:

```ts
// trip-document.ts
type TripDocumentIssue = {
  code: string;
  path: string;
  severity: "warning" | "blocking";
};
type TripDocumentReadResult =
  | { kind: "readable"; trip: CanonicalEasyTTrip; sourceSchemaVersion: 1 | 2;
      issues: TripDocumentIssue[] }
  | { kind: "unsupported"; sourceSchemaVersion: number }
  | { kind: "invalid"; issues: TripDocumentIssue[] };
readTripDocument(value: unknown): TripDocumentReadResult;
requireReadableTripDocument(value: unknown): CanonicalEasyTTrip;
prepareTripDocumentForWrite(trip: EasyTTrip): CanonicalEasyTTrip;
class TripDocumentReadError extends Error {
  readonly code: "unsupported_trip_version" | "invalid_trip_document";
}

// trip-route-intent.ts
routeIntentFromLegacyTrip(trip: EasyTTrip): RouteIntent;
routeIntentFromHandoff(draft: HomeTripDraft, stops: readonly TripStop[]): RouteIntent;
routeProjectionInputKey(trip: EasyTTrip): string;
routeProjectionStatus(trip: CanonicalEasyTTrip):
  "legacy_unverified" | "current" | "pending" | "provisional";
routeOrderReviewIssue(trip: CanonicalEasyTTrip): TripDocumentIssue | null;
routeNightBudget(trip: CanonicalEasyTTrip, availableNights: number | null): {
  allocated: number; held: number; unallocated: number | null;
  overallocated: number; issues: TripDocumentIssue[];
};
type RouteProjectionCommit = {
  basedOnInputKey: string;
  projectedTrip: EasyTTrip;
  reason: "necessary_reconciliation" | "manual_order" | "accepted_optimization";
};
commitAcceptedRouteProjection(current: CanonicalEasyTTrip,
  commit: RouteProjectionCommit):
  | { kind: "accepted"; trip: CanonicalEasyTTrip }
  | { kind: "rejected"; reason: "stale_inputs" | "authoritative_order" | "invalid_projection" };
```

`requireReadableTripDocument` throws the typed error; callers may not convert it to missing or silently drop it. `isEasyTTrip` remains a supported-shape guard for compatibility, not a substitute for the decoder at durable boundaries. Preserve unknown unrelated fields by copying original document/brief metadata, not reconstructing a minimal document. V1 optional malformed metadata produces an issue and remains available in the retained source; required-shape corruption cannot become an empty successful trip. A malformed v2 route is invalid, not silently migrated as v1.

The legacy adapter preserves IDs/order/nights and has `projectionInputKey: null`. It does not stamp a fresh key or run routing. An accepted input edit may retain the previous projection/key while necessary work is pending; validation verifies current bindings and truthful pending status, not fresh transfer evidence. Only successfully reconciled, validated projection commits set the matching key. A null legacy key remains `legacy_unverified`; it is not permission to run an unrelated optimization on read.

**Ambiguous parsed order:** Do not call an uncertain interpretation `explicit`, `manual` or `legacy_preserved` to obtain a reorder lock. For a new ambiguous parsed brief, retain the source sequence, keep `explicitIntentIds: null`, and use `orderAuthority: "optimizable"` only together with a blocking derived `routeOrderReviewIssue` (`code: "route_order_requires_clarification"`, `path: "brief.intent.route.orderAuthority"`, `severity: "blocking"`). Optimizable authority is necessary, not sufficient, for automatic reordering: that issue blocks automatic order changes while permitting unrelated necessary leg/date/endpoint reconciliation in the preserved sequence. A deliberate optimization proposal may be previewed; changing the sequence still requires current traveller acceptance. Confirming/establishing an order through the existing accepted-order path sets manual authority; confident explicit provenance alone sets explicit authority.

Derive and re-derive the issue after reload from retained `structuredBrief.source.rawPrompt`, destination provenance and `capturedIntent.originalBrief`/`routeHints`; place-resolution confidence is not order confidence. Keep those existing capture fields through conversion. Feed the issue to the existing validation/review feedback owner through the narrow data bridge, preserving source/recovery; exact clarification choices and the final interaction remain 14C. No new persisted ambiguity flag, enum value or falsely confident provenance is authorized. If execution finds that the existing metadata cannot preserve/reproduce a detected ambiguity or the existing feedback owner cannot expose it without additional UI, report that exact case for contract/scope review before adding a field or control.

The projection key uses stable serialization of canonical place identities/coordinates, endpoint selection/type, intent/base membership and resolution, requested nights, order authority/explicit order/current stay order, trip dates and binding fixed commitments/locks. Serialize the unordered destination-intent set by stable ID; moving a wish-list chip cannot create order authority or invalidate an unchanged route. Exclude presentation labels, owner, save timestamps, generated suggestions and transport-provider response timing. When no verified place identity exists, include the normalized unresolved source text and retained geographic context: changing the intended place is a semantic edit even before resolution. Transport preference changes invalidate travel evidence through existing mechanisms without giving route-order authority. Status is derived: required unresolved intent → provisional; otherwise null key → legacy_unverified; unequal key → pending; matching key → current. Existing failure/conflict fields remain their owners; do not introduce a second async job store in 14A.

## Task 1: Pure canonical document decoder and legacy migration

**Files:** Modify `lib/easyt/trip.ts`; create `lib/easyt/trip-route-intent.ts`, `lib/easyt/trip-document.ts`, `tests/fixtures/batch14-route-documents.ts`, `tests/trip-document-migration.test.ts`.

**Interfaces:** Produces types, `readTripDocument`, `requireReadableTripDocument`, `prepareTripDocumentForWrite`, `routeIntentFromLegacyTrip`, `routeProjectionInputKey`, `routeProjectionStatus`, `routeNightBudget`. Task 2 supplies `routeOrderReviewIssue`; Task 6 consumes it before applying any automatic order change. Consumes existing `JourneyEndSelection`, occurrence IDs and brief provenance.

- [ ] Add fixtures and failing tests `v1_migration_is_pure_idempotent_and_keeps_cas_token`, `absent_end_remains_unknown_legacy`, `explicit_finish_is_distinct_from_overnight_occurrence`, `repeated_city_finish_and_ambiguous_commitment_are_preserved`, `malformed_optional_metadata_keeps_source_and_reports_issue`, `future_version_is_unsupported_not_empty`, `v2_intent_is_not_replaced_by_default`.
  Assert deep equality of source before/after; unchanged owner/createdAt/updatedAt; twice-converted document equality; absent endpoint → `unknown_legacy`; same_as_start → return; explicit → one way with original explicit endpoint. Repeated geographic IDs retain distinct occurrence/intent IDs, night counts and authored references. An ambiguous repeated-name commitment remains unchanged with a blocking binding issue, never assigned to the first name match.
- [ ] Run `node --experimental-strip-types --test tests/trip-document-migration.test.ts`; confirm behavioral red failures, with no environment/provider dependency.
- [ ] Implement the types and decoder. Keep the existing factory write-version constant at 1 until Task 6; the decoder/read model accepts 1 and 2 now. For legacy stops without verifiable parent capture evidence, create direct intents keyed deterministically from the existing occurrence IDs; preserve `legacy_preserved` order. For unresolved legacy mentions without IDs, derive once from immutable original source occurrence position, never from mutable labels. Reuse proven structured mention IDs and night provenance; do not bind ambiguous repeated labels or claim generated allocation was requested.
- [ ] Implement the key/status and derived budget helpers. Count an area's requested budget once: held amount is the positive remainder of parent request after allocation to its mapped bases. Keep excess visible as conflict. Distinct direct unresolved requests remain held; null request has no invented budget; zero remains zero. If existing allocated nights are unknown or bindings ambiguous, return `unallocated: null` with an issue instead of advertising free nights. `routeNightBudget` is a view over existing fields, not another persisted ledger.
- [ ] Add/run `requested_area_budget_is_not_copied_per_base`, `zero_requested_nights_remain_explicit`, `unknown_dates_do_not_invent_available_nights`, `unknown_allocated_nights_do_not_report_false_free_budget`, `label_and_timestamp_do_not_change_projection_key`, `unresolved_source_change_invalidates_projection_key`, `relevant_input_change_marks_projection_pending`. Confirm migration tests plus existing endpoint/remap tests pass; inspect the focused diff. No staging or commits without the subsequent execution authorization.

**Reviewable result:** A pure decoder and explicit authority/identity/budget model; no storage, provider or UI side effects.

## Task 2: Capture unresolved intent before the stop projection

**Files:** Modify `lib/easyt/home-trip-handoff.ts`, extend `lib/easyt/trip-route-intent.ts`; create `tests/trip-route-intent.test.ts`; extend `tests/handoff-progressive-resolution.test.ts`, `tests/homepage-input-preservation.test.ts`.

**Interfaces:** Produces `routeIntentFromHandoff(draft, stops)`, `routeOrderReviewIssue(trip)` and optional canonical route metadata on `HomeTripDraft`; consumes frozen homepage receipt, structured mention IDs, existing `handoffStopOccurrenceId` and `handoffOutcomeIsCurrent`. No new parser/provider API.

- [ ] Write failing tests `chip_sequence_does_not_set_explicit_authority`, `explicit_itinerary_sets_authority_without_reordering`, `ambiguous_order_preserves_source_without_explicit_provenance`, `ambiguous_order_review_survives_reload`, `planning_area_keeps_parent_and_selected_bases`, `poi_stays_in_activity_capture`, `empty_timeout_error_then_selection_retains_original_intent`, `removed_or_selected_intent_ignores_late_resolution`.
  Assert normal chips are optimizable with no inferred explicit order; confident explicit arrows/first-then evidence preserves requested sequence. Ambiguous sequence retains source order, has no confident explicit provenance or `explicitIntentIds`, and returns the blocking derived review issue before and after round-trip decoding; no new persisted flag is added. A country intent remains `planning_area`, its selected city bases map through stop IDs, and no POI becomes an overnight stay. Empty lookup → unresolved; timeout/error → unavailable; multiple matches → ambiguous; region lacking a base → needs_base. A current explicit selection replaces the original pending intent in place, preserving its ID/nights/commitments; an older revision cannot overwrite it or append a duplicate.
- [ ] Run `node --experimental-strip-types --test tests/trip-route-intent.test.ts tests/handoff-progressive-resolution.test.ts tests/homepage-input-preservation.test.ts` and inspect expected red failures.
- [ ] Implement intent extraction before `handoffRouteStops`' routable filter and the pure `routeOrderReviewIssue` helper described above. Use source IDs, explicit capture provenance and exact occurrence mappings, not entered chip order or duplicate labels. Preserve the existing input snapshot/version, origin/end precedence, frozen receipt and ambiguity-bearing source metadata. Carry optional route metadata through handoff without changing visible homepage controls or introducing the new default toggle here.
- [ ] Add stubbed A06/A09 fixtures: Mostar with 2 requested nights and San Pedro de Atacama with 3. Simulate five resolved stops plus one failed resolution, save/read through the pure decoder, then explicitly resolve the sixth in place. Assert six durable destination intents, five verified stays before selection, held 2/3 nights, six verified stays after selection and exact retained requested nights. Add `mostar_retention_is_not_resolution` and `san_pedro_empty_lookup_holds_three_nights`.
- [ ] Run the same focused command plus `npm run test:trip-capture`; confirm passing and review changes to frozen input/async guards.

**Reviewable result:** Lost-place failure class reproduced locally and preserved. This does not demonstrate that live Mostar or San Pedro resolves; provider recovery and hosted acceptance remain later work.

## Task 3: Stable remapping, promotion, duplication and factory parity

**Files:** Modify `lib/easyt/trip-promotion.ts`, `lib/easyt/spreadsheet-import.ts`, `lib/easyt/imported-trip-hydration.ts`, `lib/easyt/public-route-handoff.ts`; extend `tests/trip-stop-remap.test.ts`, `tests/trip-promotion.test.ts`, `tests/spreadsheet-import.test.ts`, `tests/imported-trip-hydration.test.ts`, `tests/public-route-handoff.test.ts`.

**Interfaces:** Consumes Task 1 decoder/validator and Task 2 intent adapter. Existing exports `remapTripStopReferences`, `tripStopReferenceInvariantIssues`, `canonicalTripForOwner`, `tripBuildDocumentsCanonicalEquivalent`, `duplicateTripDocument`, `canonicalTripFromSpreadsheetProposal` retain their call contracts and return supported canonical documents at the boundary.

- [ ] Add failing tests `promotion_remaps_route_stop_bindings_but_not_intent_or_place_ids`, `duplicate_preserves_unresolved_intents_nights_and_authored_items`, `representation_only_migration_is_canonically_equivalent`, `route_authority_or_requested_nights_change_is_not_equivalent`, `reviewed_spreadsheet_order_is_authoritative_with_unknown_end`, `public_route_handoff_retains_editorial_order_and_end_semantics`.
  Assert remapping includes `destinations[].stopIds`, `orderedStopIds`, all existing nested stop references and endpoint identities; it never remaps destination-intent IDs, `explicitIntentIds` or geographic provider IDs. Duplicates have new trip/stop/leg/item identities, source-independent buffers, unchanged nights/commitments and correct copied route bindings. The resulting projection key is recomputed only when a verified equivalent projection was remapped; pending/null source stays pending/unverified.
- [ ] Run `node --experimental-strip-types --test tests/trip-stop-remap.test.ts tests/trip-promotion.test.ts tests/spreadsheet-import.test.ts tests/imported-trip-hydration.test.ts tests/public-route-handoff.test.ts` and confirm the intended failures.
- [ ] Extend the existing remapper explicitly for route-intent stop references; avoid its generic route-stop-shape heuristic touching intent IDs. Normalize both supported documents before canonical-equivalence comparison, keeping semantic route differences significant. Preserve owner/CAS conventions and already-canonical promotion behavior.
- [ ] Wire reviewed spreadsheet/curated route factories through canonical conversion with their proven order provenance. Do not apply the new structured-input Return default to imported/legacy documents. Keep `repairEligibleSpreadsheetV1Trip` eligibility unchanged and preserve unrelated route metadata through repair.
- [ ] Run the same command and `npm run test:persistence`; inspect retained repeated-city, explicit-finish and authored-item fixtures.

**Reviewable result:** Every copied/promoted/imported occurrence remains correctly bound without a name-based merge or implicit return.

## Task 4: Read-only local migration and recovery-safe HTTP decoding

**Files:** Modify `lib/easyt/storage.ts`, `lib/easyt/trip-persistence-error.ts`; create `tests/trip-document-storage.test.ts`; extend `tests/trip-browser-storage.test.ts`, `tests/trip-sync-recovery.test.ts`, `tests/signed-in-trip-persistence-regression.test.ts`.

**Interfaces:** Consumes `TripDocumentReadResult`, typed read errors and normalized canonical equivalence. Existing load/cache/recovery/save exports keep existing success contracts; unsupported/invalid reads throw a typed error through current feedback. Existing immutable recovery handles remain the acknowledgement identity.

- [ ] Add failing tests `all_local_read_paths_decode_v1_without_storage_writes`, `retained_legacy_key_never_shadows_newer_scoped_recovery`, `future_cloud_version_does_not_fall_back_to_stale_cache`, `late_ack_keeps_newer_recovery_and_owner_scope`, `http_success_and_conflict_payloads_decode_supported_documents`, `unavailable_cloud_still_allows_existing_offline_recovery`.
  Use a spy MemoryStorage with raw-byte snapshots; exercise active/local/requested/cached/current recovery/list reads. Assert no setItem/removeItem from schema conversion or old-key fallback; no timestamp/owner/ack changes; both raw source and newer recovery remain. For unknown schema 3, assert typed unsupported error rather than missing/offline fallback. For actual network unavailability, retain the existing scoped fallback. An older exact acknowledgement cannot clear a newer writeId or another owner's draft.
- [ ] Run `node --experimental-strip-types --test tests/trip-document-storage.test.ts tests/trip-browser-storage.test.ts tests/trip-sync-recovery.test.ts tests/signed-in-trip-persistence-regression.test.ts` and inspect red failures.
- [ ] Replace read-triggered `migrateLegacyTripFromStorage` writes/deletion with a read-only decoded fallback. Keep existing keys/envelope versions unchanged. Decode cache/recovery records through one boundary and retain raw bytes; choose scoped newer records before retained legacy source. No legacy key removal is needed in 14A, including after acknowledgement.
- [ ] Decode load, success, promotion and 409 existing-canonical payloads. Separate typed unsupported/invalid documents from genuine unavailable responses in `loadRequestedTrip`; do not catch them as ordinary offline recovery. Keep existing explicit cloud-cache writes and acknowledgement flows, but never acknowledge simply because v1 and v2 representations compare equivalent.
- [ ] Run the same command plus `npm run test:persistence`. Verify storage write failure retains recovery status and current authentication/conflict behavior remains intact.

**Reviewable result:** Local reads cannot retire drafts; future schema cannot be mistaken for a missing trip; exact durable acknowledgement remains protected.

## Task 5: Server readers and protected canonical writes

**Files:** Modify `lib/easyt/repository.ts`, the five API/stored-preview adapters listed in the manifest and `lib/easyt/trip-persistence-error.ts`; create `tests/trip-document-server-boundaries.test.ts`, `tests/trip-document-repository.integration.test.ts`, `tests/helpers/batch14-repository-loader.mjs`, `tests/helpers/batch14-repository-db.ts`; extend `tests/signed-in-trip-persistence-regression.test.ts`, `tests/trip-status.test.ts`.

**Interfaces:** Consumes `readTripDocument`/`prepareTripDocumentForWrite`. Extend `saveTripForOwner` with an optional third input `{ sourceSchemaVersion: 1 | 2 }`; server-internal callers default from the incoming document before conversion. API adapters must pass the actual decoded request's source version, not its normalized v2 version. Retain existing save/promotion return structures and conflict documents. Stored unsupported versions produce `unsupported_trip_version` with HTTP 503 on reads; unsupported/invalid client requests receive 400; a v1 overwrite of stored v2 receives existing conflict status 409 and canonical document. Do not disclose raw documents through generic errors.

- [ ] Write failing boundary tests `list_get_archive_restore_gift_and_preview_decode_v1_v2`, `unsupported_stored_document_is_visible_not_filtered`, `post_put_promote_keep_incoming_source_version`, `v1_client_cannot_overwrite_v2_even_with_matching_token`, `cas_loser_cannot_replace_relational_projections`, `promotion_is_insert_only_and_owner_safe`.
  Exercise list/get, archive/restore, duplicate/gift-copy decoding, preview result and booking-readiness input. Assert unknown versions are reported, not discarded by `.filter(isEasyTTrip)` or changed to null. Add `legacy_copilot_preview_invalidates_safely_after_representation_change`: existing persisted hashes may safely reject an old preview after normalization, but must preserve canonical trip and recovery and require a fresh preview; do not rewrite a hash to force acceptance. Existing gift behavior is tested without sending a gift. Compatibility POST and missing-owned-row promotion keep current auth/deleted-trip checks. Two same-token saves produce one winner; rejected writers change neither JSONB nor child stops/legs/items.
- [ ] Run `node --experimental-strip-types --test tests/trip-document-server-boundaries.test.ts tests/signed-in-trip-persistence-regression.test.ts tests/trip-status.test.ts`; confirm behavior fails before implementation. The existing account harness is a client/server simulation, not proof of Postgres transaction execution.
- [ ] Install the supported decoder at every repository read/result guard and at the API request guards. Preserve all current ownership checks, transport normalization, archive state and insertion-only promotion. `schema_version` must match the actual saved document. First edited v1 document writes v2 while retaining its original CAS token until a winning write returns the next token.
- [ ] Add the source-version condition **inside the existing locked save transaction**: stored schema >=2 cannot be replaced by incoming source schema 1, even if timestamps match. Continue the existing `updatedAt` compare-and-swap and winner-only child projection writes. Return existing canonical conflict state for rejection. Do not perform a separate preflight check that races the write.
- [ ] Run the focused command plus `npm run test:persistence`. Record a reader-compatible checkpoint only after all local/cloud/import/copy readers pass; do not ship any intermediate task as a release.
- [ ] Implement/run isolated transaction integration tests using the existing `pg` dependency and actual migration schema on an explicitly disposable test database. The runner must require `MORROVIA_TEST_DATABASE_URL` and `MORROVIA_TEST_DATABASE_DISPOSABLE=1`, never fall back to `DATABASE_URL`, staging or production. Use a uniquely named isolated schema and fixture accounts. `tests/helpers/batch14-repository-loader.mjs` replaces `getEasyTDatabase` with the helper adapter, `server-only` with an empty module and server transfer resolution with an identity stub; it resolves existing relative extensionless imports for the Node test process only. `tests/helpers/batch14-repository-db.ts` implements the existing tagged-query/transaction contract with `pg`: build parameterized queries lazily, execute them sequentially on one connection between BEGIN/COMMIT, and set the isolated search_path on every connection. The parent test spawns the real repository test process with this loader; no production database injection/refactor. Apply only the existing migrations needed by repository trip/projection operations in the disposable schema, with extension prerequisites already present; do not install extensions or mutate another schema. Assert row and child projection state after winner/loser and old-client attempts; remove only the isolated test schema in finally.
  Run `node --experimental-strip-types --test tests/trip-document-repository.integration.test.ts` when the disposable fixture is available. Otherwise explicitly report `MANUAL HOSTED VERIFICATION REQUIRED: actual repository CAS/source-version transaction not executed`; a skip is not a pass and v2 release remains gated on this verification. Do not create accounts/credentials or request database resets.

**Reviewable result:** Supported readers cover all durable boundaries; canonical writes retain CAS and block older clients from erasing v2 data. Hosted transaction evidence is reported separately from simulated client evidence.

## Task 6: Connect existing factories and accepted model edits

**Files:** Modify `lib/easyt/trip.ts`, `lib/easyt/trip-route-intent.ts`, `lib/easyt/trip-builder-preservation.ts`, `lib/easyt/trip-builder-document-commit.ts`, `lib/easyt/trip-builder-order.ts`, `lib/easyt/trip-builder-route-preview.ts`, `lib/easyt/trip-replan.ts`, `lib/easyt/trip-copilot-actions.ts`, `lib/easyt/trip-mutation-persistence.ts`, and the three data regions of `app/journey/new/trip-builder.tsx`; create `tests/trip-route-projection.test.ts`; extend `tests/trip-builder-document-commit.test.ts`, `tests/trip-builder-order.test.ts`, `tests/trip-replan.test.ts`, `tests/trip-copilot-actions.test.ts`, `tests/trip-mutation-persistence.test.ts`.

**Interfaces:** Produces `commitAcceptedRouteProjection(current, commit)`; consumes Task 1 key/status/validator and Task 2 handoff route. Add optional `routeIntent?: RouteIntent` to existing `BuilderTripInput`; `tripFromBuilder` now emits `CanonicalEasyTTrip`. Reuse existing order-source values (`move-menu`, `mouse-drag`, `route-check`) and commit validation; a route-check proposal is not accepted merely because a preview exists.

- [ ] Add failing tests `automatic_reconciliation_cannot_change_authoritative_order`, `ambiguous_order_blocks_automatic_reorder_but_allows_necessary_dependencies`, `accepted_order_resolves_review_without_invented_parsed_provenance`, `manual_and_explicit_order_survive_save_reload`, `accepted_optimization_requires_current_input_key`, `preview_does_not_mutate_canonical_authority`, `builder_rebuild_preserves_unresolved_intent_and_requested_nights`, `endpoint_edit_never_creates_label_matched_stay`, `concurrent_order_and_preference_merge_is_atomic`.
  Assert necessary reconciliation may update affected legs/dates/endpoints but cannot change explicit/manual/legacy stop order or a source sequence awaiting order clarification. The derived review issue reaches the existing validation feedback model, survives reload and blocks automatic reorder; unchanged-order dependent updates remain possible. Manual accepted reorder sets manual authority; a current explicitly accepted optimization proposal can change order and establishes manual authority, resolving the order-review guard without relabeling the original parse as explicit. Stale input key rejects. Country/chip entry order does not become explicit. Mere save/preview cannot stamp a matching projection key. A three-way merge retains one coherent order/authority/stop binding unit or reports conflict; it never independently merges those arrays into inconsistent data.
- [ ] Run `node --experimental-strip-types --test tests/trip-route-projection.test.ts tests/trip-builder-document-commit.test.ts tests/trip-builder-order.test.ts tests/trip-replan.test.ts tests/trip-copilot-actions.test.ts tests/trip-mutation-persistence.test.ts` and inspect intended failures.
- [ ] Implement projection acceptance and extend the existing factory. Generate compatibility origin/end fields solely from canonical route; preserve existing origin metadata when identity is unchanged. Derive missing route metadata from proven handoff/legacy evidence, not a rebuilt current array. Validate current occurrence membership, night/commitment constraints, order authority and `routeOrderReviewIssue` before setting a fresh key. Automatic order change requires optimizable authority with no blocking order-review issue; reject blocked changes using `authoritative_order`. Switch `EASYT_TRIP_SCHEMA_VERSION` to 2 only now, with constructor and all readers ready.
- [ ] Wire the existing Builder's hydrated canonical intent, active-document constructor and `commitStopOrder` source into these helpers. Retain effective structured mention identities and unresolved route entries through `preserveBuilderCanonicalState`; retain booked/authored state even if a binding needs review. Do not add controls, change render structure or replace save effects. Existing accepted model edits continue using existing cascade/recovery behavior; 14C introduces the new automatic async lifecycle.
- [ ] Update existing replan/copilot mutation paths: accepted day-order edits set manual authority; a stop-specific accepted night change updates only its bound intent request; explicit copilot alternatives can change another stop only when that alternative was accepted. Do not infer binding from repeated names. Booking-only mutations preserve route intent. After three-way mutation merges, validate canonical route bindings and reject inconsistent order merges via existing conflict/recovery behavior.
- [ ] Add `authored_items_and_bookings_survive_replacement_for_review`, `night_edit_keeps_place_and_authority`, `remove_intent_releases_nights_without_redistribution`, `gateway_edit_invalidates_only_gateway_dependencies`, `same_place_label_edit_preserves_projection_key` and run the focused command plus `npm run test:state-preservation`. Confirm unchanged-stop authored data and confirmed commitments survive, with existing visible review/conflict semantics rather than deletion or silent reassignment.

**Dependency scope contract:** Label-only identity-preserving edits leave geometry/dates current. Place replacement invalidates its adjacent leg identities/evidence, bound suggestions and affected flexible schedule; keep authored/booked content for review. Add/remove invalidates neighboring connections/schedule and releases only that request. Reorder invalidates changed neighbor pairs and flexible dates, preserving per-stop nights. Night/date changes invalidate schedule/day suggestions, preserving membership/order. Origin/type/end changes invalidate gateway/return legs and endpoint conflicts, preserving stays. Preferences invalidate dependent evidence/costs/recommendations, preserving order. Tests assert both changed and untouched data. This task pins the model behavior; it does not build a second invalidation engine or the 14C scheduler.

**Reviewable result:** Current factories and accepted edits produce coherent v2 documents; authoritative order stays protected. All existing UI owners remain in place.

## Task 7: Cross-boundary acceptance, rollback evidence and handoff

**Files:** Create `tests/batch14a-route-roundtrip.test.ts`; extend `tests/builder-persistence-acceptance.test.ts`; update this plan's execution checklist/evidence only after execution. No additional production files.

**Interfaces:** Consumes all prior tasks; tests public factory, handoff, decoder, storage, promotion, duplication and existing mutation APIs. No release/deployment operation.

- [ ] Add a parameterized test `every_supported_path_preserves_route_contract` over v1 absent end, explicit finish, repeated city, manual/explicit order, country-with-bases, unresolved Mostar/San Pedro, authored itinerary and locked nights. Traverse local recovery → cloud harness → reload, import → promotion → duplicate, and Builder accepted mutation → Overview/Itinerary canonical input. Assert identity/order/nights/end/held budget/authoritative order, source token continuity and nested reference invariants. This checks the document consumers, not visual or hosted page parity.
- [ ] Add `reader_checkpoint_can_read_both_versions`, `old_client_write_is_blocked_after_v2_exists`, `migration_does_not_modify_source_without_ack`, `failed_dependent_work_remains_pending_on_reload`, `rollback_preserves_v2_without_downserializing`. Rollback target is a compatible-reader revision retaining the source-version write guard; accepted base `a3ab161` alone is **not** a safe writer rollback after v2 exists. Retain v2 documents and raw legacy local source; never downconvert or mass-rewrite to roll back. Test unknown future versions, conflict/error responses, owner switch and delayed acknowledgement in the same matrix.
- [ ] Run `node --experimental-strip-types --test tests/batch14a-route-roundtrip.test.ts tests/builder-persistence-acceptance.test.ts`, then the focused tests from Tasks 1–6; confirm passing or list specific blocked integration evidence.
- [ ] Run `npm run test:persistence`, `npm run test:trip-capture`, `npm run test:state-preservation`, `npm run typecheck`, `npm run build:check`, `npm run audit:ui` and `git diff --check`. Run `npm run lint` and record the actual outcome; the current script is `next lint` on Next 15, and no ESLint config was found in the inspected checkout. If the baseline command is unavailable/invalid, report that concrete limitation separately instead of changing lint infrastructure under 14A. Shared UI is unchanged, so no new Storybook build is required.
- [ ] Review the final changed-file manifest against the allowance; compare Builder render regions and CSS/table/map owners to the base to prove no UI implementation slipped in. Record test commands/counts, actual SQL evidence or explicit limitation, unresolved bindings and pending provider investigations. No mixed-SHA pack signoff.
- [ ] Return 14A completion for review before 14B. Do not automatically proceed into homepage/Builder redesign, run paused cases 11–20, stage, push or deploy. The final parent report must distinguish passing retention tests from unresolved live provider resolution and actual hosted verification.

## Acceptance boundaries and remaining risks

The existing baseline command passed 63/63 on the accepted base: endpoint, order, nested remapping and Builder commit tests. No proposed test in this plan has been implemented or run yet; those 63 checks do not validate v2.

The largest implementation risk is an overlooked document reader or writer. During execution, run `rg -n 'isEasyTTrip|schemaVersion|saveTripForOwner|tripFromBuilder' lib/easyt app/api app/journey` and account for durable boundaries against this manifest; do not bulk edit fixtures or unrelated display guards. Readers must be compatible before releasing writers. Actual SQL rejection/winner behavior needs transaction evidence, not a simulated API harness.

Mostar's precise live failure is still untraced; San Pedro's recorded failure was HTTP 200 with no candidates. 14A prevents their intent/night loss and tests explicit in-place recovery. Neither case is resolved until all six places, canonical IDs and requested nights survive live save/reload. Keep these failures visible for 14D rather than hiding them with the redesign.

There are no reopened product choices. Potential implementation blockers are concrete unsupported legacy bindings or missing disposable database test access; report evidence and preserve source rather than inventing a mapping. New architecture or scope outside this contract requires review.

The later sequence stays 14B homepage planner → visual/product review → 14C Builder top controls/autosave/targeted async reconciliation → review → 14D integration, adversarial edits and all 20 authoritative cases on one accepted SHA. The three approved visuals and existing table/map are preserved boundaries throughout.

## Plan self-review

Specification coverage maps: canonical ownership/endpoints/order/IDs → Tasks 1–3/6; pure legacy migration and every durable read/write path → Tasks 1/3–5/7; unresolved/night retention and in-place recovery → Tasks 1–2/6–7; projection key, authoritative order and edit dependency scope → Tasks 1/6–7. The 14C autosave lifecycle and 14B/C visuals are deliberately deferred, not claimed complete. All five Review Focus risks have named behavioral tests. Cross-task signatures and file ownership were checked; no production code or deployment is part of writing this plan.

# Batch14A independent whole-branch review

Reviewed on 6 October 2026 against accepted base `a3ab161e7ea97229f851423bc81fb0f67271560c`, branch `codex/batch14-route-spec`, initial HEAD `69bf4d30864ff9c45127cbf3f8c44ca82e70c11f`, including the uncommitted Task7 decoder/roundtrip/helper/outline work present during review. This is a review of the complete branch, not hosted acceptance. Implementation continued concurrently; the findings below describe independently reproduced defects in the reviewed snapshot. Their resolution requires fresh evidence against the final candidate.

Read the checkout's `AGENTS.md`, approved v2 canonical-route specification and implementation plan. No product files were edited by this reviewer; no browser, database provisioning, push, deployment or Batch13 work occurred.

## Findings

### R1 — P1: A valid projection key does not protect newer authored data

**Location:** `lib/easyt/trip-route-intent.ts:345` (`commitAcceptedRouteProjection`, surrounding validation at lines 305–347).

The accepted result spreads the entire `projectedTrip`, including its bookings, authored notes, itinerary ideas and plan items, before stamping a matching projection key. The semantic key deliberately excludes ordinary authored content, so a calculation based on an earlier snapshot can overwrite later traveller work without failing the input guard. The existing checks protect owner, occurrence permutation, places, requested nights and some locks; they do not preserve or reject changes to these unrelated authored paths.

**Independent reproduction:** Use `requireReadableTripDocument(canonicalRouteFixture())`, construct its canonical legs with `buildCanonicalTripLegs`, add a confirmed hotel to `brief.bookings` and `brief.dayNotes = {1: ["Authored note"]}`. Clone that document into a proposal and set `proposal.brief.bookings = []`, `proposal.brief.dayNotes = {}`, and `proposal.planItems = []`. Call the helper with `basedOnInputKey: routeProjectionInputKey(current)` and `reason: "necessary_reconciliation"`. Result: `kind: "accepted"`, empty bookings/notes/plan items, `routeProjectionStatus(result.trip) === "current"`. An equivalent stale calculation is possible because adding those authored fields leaves the key unchanged.

**Required outcome:** Apply only validated dependent projection changes onto current canonical traveller state, preserving authored/booked data, or reject proposals that change protected state. Test a newer authored edit arriving after a projection started. This is the approved 14A projection contract, not the deferred 14C scheduler.

### R2 — P1: Retained legacy bytes override acknowledged cache and current-trip selection

**Location:** `lib/easyt/storage.ts:1057` (`loadLocalTripFromStorage`) and `lib/easyt/storage.ts:1071` (`loadActiveTripFromStorage`).

Read-only migration now intentionally retains `EASYT_ACTIVE_TRIP_KEY`. The local loader checks that retained source before the acknowledged cache; the active loader returns it before consulting the current-trip pointer. The former copy-first branch assumed successful migration removed the key. That assumption no longer holds. Once scoped recovery is acknowledged and retired, an offline/local reopen returns the older legacy document; opening another trip cannot change which trip the active loader returns.

**Independent reproduction:** Seed a memory store's legacy key with `legacyRouteFixture()` titled `Old legacy`. Call `cacheCanonicalTripWithRecoveryToStorage` with the same ID's v2 document titled `Acknowledged new`, with a newer `updatedAt`. The cache returns `{stored: true, recoveryResolved: false}` but `loadLocalTripFromStorage` returns `Old legacy`. Cache a second trip (`id: "other-trip"`): `currentTripStorageKey(owner)` correctly contains `other-trip`, while `loadActiveTripFromStorage` still returns `batch14-trip`.

**Required outcome:** Preserve unacknowledged legacy recovery, but distinguish retained source bytes from current acknowledged state. Reads must stay write-free. Cover exact acknowledgement followed by recovery retirement and local reopen, and explicit selection of another current trip. The existing same-trip newer-recovery test does not cover either case.

### R3 — P2: Malformed optional v1 metadata breaks the pure/idempotent adapter contract

**Location:** `lib/easyt/trip-document.ts:144` (legacy intent merge through final return); `lib/easyt/trip-route-intent.ts:70` (unchecked constraint provenance).

The v1 path spreads malformed optional nested intent values over the defaults and returns a canonical document without checking whether its v2 required shapes are valid. Its optional structured-brief check also misses malformed constraint entries subsequently dereferenced by the adapter.

**Independent reproductions:**

- Set `legacyRouteFixture().brief.intent.hardConstraints.fixedCommitments = "broken"`. `readTripDocument` returns `readable` with `issues: []`; reading its returned v2 trip returns `invalid`.
- Set a legacy trip's `structuredBrief` to `captureJourneyBrief("Tokyo and Kyoto").structuredBrief`, then replace `hardConstraints` with `[{type: "fixed-commitment", value: "Tokyo stay", place: {name: "Tokyo"}, fixedNights: 2}]`. Missing provenance produces a raw `TypeError: Cannot read properties of undefined (reading 'kind')` from `readTripDocument`.

**Required outcome:** Normalize/skip malformed optional evidence for inference, report it, preserve the original source metadata, and return a canonical value that is readable/idempotent. Required corruption must return the typed invalid result rather than throw an incidental runtime error. Existing malformed-optional coverage tests a broken destinations container only.

### R4 — P1: Clearly requested three-stop sequences can silently become optimizable

**Location:** `lib/easyt/trip-route-intent.ts:16` (`orderInterpretation`, lines 8–22).

Every inter-destination connector must match arrows, `then`, `followed by` or `next`. When the last connector is `finally` or `finish in`, the helper classifies an otherwise explicit sequence as unordered. There is no derived clarification issue unless the prompt also contains the limited material-hint phrases. The approved contract expressly protects first/then/finish phrasing.

**Independent reproduction:** Three source destination mentions for Tokyo, Kyoto and Hiroshima, all with destination roles; call `routeIntentFromHandoff` with either `First Tokyo, then Kyoto, finally Hiroshima` or `First Tokyo, then Kyoto, finish in Hiroshima`. Both return `orderAuthority: "optimizable"`. Reconstruct a canonical trip with these source texts and captured prompt: `routeOrderReviewIssue` returns `null`. The arrow control `Tokyo -> Kyoto -> Hiroshima` returns `explicit`.

**Required outcome:** Preserve confidently requested sequences; if uncertain, block automatic reordering through the approved derived issue. Add three-or-more destination cases with terminal sequencing language, while retaining the unrelated-first/then wishlist counterexample. This requires bounded authority interpretation, not an engine rewrite.

### R5 — P2: Namespace stripping can collapse distinct legacy occurrence IDs

**Location:** `lib/easyt/trip-route-intent.ts:168` (`routeIntentFromLegacyTrip`).

Fallback intent IDs strip the trip stop prefix. Distinct valid saved occurrence IDs can therefore map to the same intent ID. The v1 path reports the result readable, but its next v2 read rejects the duplicate intent IDs. This violates distinct occurrence identity and idempotent migration even though source stop IDs are unique.

**Independent reproduction:** Append a repeat Tokyo stop with `id: "batch14-trip-stop-tokyo"`, `order: 3` to `legacyRouteFixture()`, whose existing Tokyo occurrence ID is `tokyo`. The first read returns `readable` with destination IDs `["legacy-stop:tokyo", "legacy-stop:kyoto", "legacy-stop:hiroshima", "legacy-stop:tokyo"]`; the next read returns `invalid`.

**Required outcome:** Derive collision-free, stable intent identities from distinct occurrences while preserving normal promotion/remapping equivalence. Add this mixed raw/namespaced repeated-occurrence fixture and verify read twice, authorized write preparation and duplication.

### R6 — P1: Legacy capture-only unresolved requests lose source nights

**Location:** `lib/easyt/trip-route-intent.ts:199` (captured-intent fallback, especially line 208).

The fallback for an unresolved `capturedIntent` mention always assigns `requestedNights: null`, even when its immutable original brief explicitly contains the request. This was first identified by the implementation owner and independently reproduced here: remove `structuredBrief` from `legacyRouteFixture()`, set captured original text to `Tokyo 4 nights, Kyoto 3 nights, Mostar 2 nights`, and include an unresolved stop mention for Mostar. The migrated destination retains Mostar but has `requestedNights: null`, releasing its two nights from the held budget. Source-bound, unambiguous nights must survive this older capture representation; ambiguous or absent evidence must not be guessed.

### R7 — P1: A planning-area parent disappears when its mapped bases are replaced

**Location:** `lib/easyt/trip-route-intent.ts:91` (previous-intent retention through line 106).

Only previous intents with no original `stopIds` are retained without current capture mentions. A planning-area intent whose former bases all disappear is discarded rather than preserved with its parent identity and requested-night budget. First identified by the implementation owner and independently reproduced: take the canonical fixture, replace its destination intents with one resolved Japan area (`id: "area"`, requested nights 12, mapped to all current stops), then call `routeIntentFromHandoff({routeIntent: priorRoute}, stopsWithReplacementIds)`. The result contains three new direct intents with null requested nights and no Japan parent. Retain the parent and budget through explicit base replacement; if no reliable new binding is supplied, preserve it in a truthful unresolved/base-selection state rather than inventing the mapping.

### R8 — P1: Transport-dependent changes do not invalidate projected evidence

**Location:** `lib/easyt/trip-route-intent.ts:241` (`routeProjectionInputKey`).

The key omits transport preferences and the avoid-driving constraint. First identified by the implementation owner and independently reproduced: take a canonical fixture's key, change `brief.intent.preferences.transportModes` to `["train"]` and `brief.intent.hardConstraints.avoidDriving` to `true`; the key remains exactly equal. A projection can therefore accept an older transfer calculation or remain current after a relevant transport edit. Include canonical transport dependencies needed by the approved necessary-evidence refresh while keeping presentation-only changes excluded.

## Reviewed contracts and scope

- Canonical endpoints have one route owner; the decoder rebuilds compatibility endpoint fields and removes the second intent-level endpoint owner. Required unresolved intent and requested nights remain separate from verified stop rows. Area budgets are represented once through the parent and derived held-night remainder.
- SQL save includes owner, deletion, CAS token, source-version and future-version conditions in the UPDATE. Save/promotion child projection statements require transaction-local winner markers; promotion remains insert-only. These source checks are useful evidence but do not establish PostgreSQL execution correctness.
- Occurrence remapping explicitly preserves destination intent and selected geographic identities, remaps new route occurrence bindings and regenerates a formerly current projection key after namespacing. Exact recovery handles and version-sensitive retirement have focused coverage, subject to R2.
- The new route/stops merge unit rejects conflicting concurrent route edits and preserves unrelated preferences in the focused test. Projection acceptance requires the stronger authored-data boundary in R1.
- Builder changes are imports and narrow handoff/order/document data bridges. No JSX/render-region, CSS, route-workspace table, map, shared navigation or control implementation changed in the reviewed product diff. Selector guards in `can-build-trip`, `trip-facts`, `trip-readiness-summary` and `trip-overview-readiness` are recorded deviations in the execution ledger and enforce approved feedback/staleness contracts.
- Removed-stop authored content is retained using existing idea/pin/bookings representations and a review conflict. Existing consumer surfacing of orphan content needs explicit 14C verification; retention alone does not prove a usable move/removal workflow. No new interface was required by this review.

## Verification evidence and blockers

Independently ran:

```sh
node --experimental-strip-types --test tests/trip-document-migration.test.ts tests/trip-route-intent.test.ts tests/trip-route-projection.test.ts tests/trip-document-storage.test.ts tests/trip-document-repository.integration.test.ts tests/trip-document-server-boundaries.test.ts tests/batch14a-route-roundtrip.test.ts
git diff --check
```

The focused run had **67 tests: 65 passed, 1 failed, 1 skipped**. The failing test was the concurrently added malformed-JSON API regression (500 versus expected 400), already identified by the implementation owner; it needs a final rerun after its fix. The skipped test explicitly requires disposable real SQL access. The log is `/tmp/batch14-independent-tests.log`. `git diff --check` passed at that snapshot. The findings above use independent inline Node reproductions, not browser observations.

**Actual SQL verification remains a release evidence blocker:** `MORROVIA_TEST_DATABASE_URL` plus `MORROVIA_TEST_DATABASE_DISPOSABLE=1` were unavailable. No database was provisioned and no dependencies/extensions were installed. **MANUAL HOSTED VERIFICATION REQUIRED** (or the authorized disposable SQL runner): exercise actual winner/loser transactions, source-version/future-version rejection, owner isolation, rollback and child-projection atomicity. Extend the scenarios to compare winner document/projection content, not merely success counts; the current runner mostly snapshots loser nonmutation and does not assert post-winner projected rows match all changed content.

The implementation owner's persistence, capture, state-preservation, typecheck, build and UI-audit results are supporting evidence reported separately; this reviewer did not rerun those broader commands. Missing ESLint configuration is a recorded tooling limitation. Build-generated `next-env.d.ts` changed `.next-dev` to `.next-check` during review and should be excluded/restored before the final changed-file manifest.

The imported hydration transport test is a confirmed accepted-base failure and is not attributed to this branch. Mostar and San Pedro live resolution failures remain unresolved: retention fixtures establish intent/night preservation only. The 20-case authoritative pack remains 14D work on one accepted SHA. New autosave orchestration, automatic async resumption and the final Update route interaction remain 14C; they are not claimed by 14A unit coverage.

## Task7 re-review

The implementation owner added focused regressions and bounded corrections in the approved modules. A second independent run of the same focused command recorded **86 tests: 85 passed, 0 failed, 1 actual-SQL skip**, with log `/tmp/batch14-independent-rereview-tests.log`. The final independent focused re-review added `tests/trip-stop-remap.test.ts` to that command and recorded **101 tests: 100 passed, 0 failed, 1 actual-SQL skip**, with log `/tmp/batch14-independent-final-review-tests.log`; `git diff --check` passed. HEAD remained `69bf4d3` with uncommitted Task7 corrections. This verifies the reviewed working candidate, not a later committed or hosted candidate; the implementation owner must rerun required full checks and identify the final SHA.

| Finding | Re-review evidence/status |
| --- | --- |
| R1 | **Resolved in reviewed working candidate.** Projection copies current traveller metadata, protects authored containers and retains current PlanItem fields except reconciled date/dayNumber. Tests cover erased metadata, stale time/booking-link response, impossible calendar and empty generated-day reduction. |
| R2 | **Resolved in reviewed working candidate.** Exact immutable recovery captures raw legacy source; ACK marker stores canonical owner and original source owner. Same-owner reopen, current selection, changed bytes, late ACK, guest promotion and next-account isolation regressions pass without read-time mutation or source deletion. |
| R3 | **Resolved in reviewed working candidate.** Corrupt required saved constraints return typed invalid without source mutation; malformed optional structured/captured evidence is retained with warnings and skipped for inference. Missing provenance, sourceText/order/countries/geometry and capture-only nonstring source tests pass, including repeated reads. |
| R4 | First/then/finally and first/then/finish now establish explicit authority; ordinal/incomplete sequencing hints require derived review. Focused regressions passed. |
| R5 | **Resolved in reviewed working candidate.** Migration IDs are distinct; owner conversion reserves candidate IDs, keeps existing canonical IDs, computes collision mappings in sorted original-ID order and validates output. Mixed namespace read → owner conversion → duplicate and remapping tests pass. The final five-ID collision case independently passes all 120 route permutations with identical occurrence mappings and preserved authoritative output order. |
| R6 | Legacy capture-only Mostar's explicit two nights now survive; repeated source occurrences retain separate two/three-night requests. Focused regressions passed. |
| R7 | Area parents/budgets survive lost former bases as `needs_base` with no guessed replacement binding. Focused regression passed. |
| R8 | Sorted transport modes plus avoid-driving now affect the semantic dependency key. Focused regressions passed. |

The first projection fix briefly rejected removal of **every** former day container, including an empty generated day after a valid night reduction. Independent reproduction shortened Tokyo from four to three nights and removed empty `japan-day-4` after a valid cascade; the helper rejected it. The subsequent correction protects authored day state rather than all generated IDs; `necessary_schedule_can_remove_an_empty_generated_day_after_accepted_night_reduction` passes in the final focused re-review. This was a correction to R1's fix, not a new controller requirement.

### Follow-up reproductions corrected during re-review

- **R3:** Set `capturedIntent` to `{originalBrief: "Mostar 2 nights", regions: [], routeHints: [], mentions: [{sourceText: 42, canonicalName: "Mostar", order: 0, role: "stop", status: "unresolved", placeType: "city"}]}`. `readTripDocument` threw `TypeError: source.trim is not a function`. The source-mention filtering excludes the malformed entry, but the later captured-mention iteration still processes its truthy nonstring source. Preserve/report malformed optional capture and skip unsafe inference.
- **R5:** Migrate valid v1 occurrences `tokyo` and `batch14-trip-stop-tokyo`, then call `canonicalTripForOwner("owner-a", migrated)`. The output contains two occurrences both named `batch14-trip-stop-tokyo` by ID; `readTripDocument(output)` is `invalid`. This is inherited namespacing behavior, but remains an accepted-contract writer gap for the newly supported migration fixture. Ensure injective deterministic remapping or report a typed preserved-source binding blocker, rather than emitting an invalid canonical value.

**R5 final permutation reproduction (resolved):** Use five distinct source IDs `tokyo`, `batch14-trip-stop-tokyo`, `batch14-trip-stop-occurrence-tokyo`, `tokyo-1`, `batch14-trip-stop-tokyo-1`. The earlier suffix allocator changed identities when the source array was reversed. The final correction precomputes mappings in sorted original-ID order and retains the authoritative route array during remapping. Independent verification ran every one of the **120 permutations**, asserting equal source-to-canonical identity mappings, five distinct IDs, unchanged route order and matching canonical `orderedStopIds`; all passed.

The final small delta also passed an independent migration/remap/promotion/roundtrip run: **54 tests passed, 0 failed, 0 skipped**, log `/tmp/batch14-independent-final-id-review.log`. `git diff --check` passed. Exact reviewed working candidate: HEAD `69bf4d30864ff9c45127cbf3f8c44ca82e70c11f` plus the tracked `app lib tests` diff whose SHA-256 is `31f31117f1b5078ef8a477316a20382df9ec7819df9efec8dc99c314f7bb3262`, and untracked `tests/batch14a-route-roundtrip.test.ts` SHA-256 `af58892d51624430e8956a565005c61652e49c1391d56c739eefb44ca026ad25`. These fingerprints identify the reviewed uncommitted product/test delta; they exclude generated build files and this review document. The next commit SHA must still be recorded by the implementation owner.

### R9 — P1: A booked stay can become inconsistent without a projection conflict

**Location:** `lib/easyt/trip-route-intent.ts:351` (commitment/booking validation and accepted projection); existing cascade's limited booking-date check is the underlying dependency.

Independent reproduction: canonical fixture with `brief.bookings = [{id: "stay-tokyo", type: "stay", title: "Tokyo hotel", date: "2026-10-11", confirmation: "paid", url: null}]`. Build a Kyoto → Tokyo → Hiroshima proposal using the existing cascade and canonical legs, then accept it as `manual_order`. Result is accepted/current; Tokyo arrives on 13 October while its confirmed stay is still dated 11 October, with no cascade/review conflict. Existing cascade checks only global trip dates and matching transport rows, so it misses a known stay occurrence's date outside that occurrence. Retaining the booking bytes alone does not establish the required visible review. Reject or retain truthful pending/conflict state for this known binding; no engine rewrite is necessary.

**Resolution:** The projection helper now rejects known `stay-${stop.id}` booking dates outside that stay, including an end date after its departure. `projection_cannot_stamp_current_after_moving_known_booked_stay_outside_booking_dates` passes. Other unbound legacy/imported booking relationships still require truthful review where their occurrence binding cannot be verified; this correction does not invent those bindings.

### R10 — P1 contract gap inherited from the accepted base: planned-status protection defeats child projection writes

**Location:** `lib/easyt/repository.ts:382` (status-preserving UPDATE through line 391) and the child guards starting at line 409.

This is source-based SQL reasoning, **not executed SQL evidence and not a new branch regression**. A stored `planned` trip submitted as `draft` is correctly kept planned by the winning UPDATE. However, transaction-local `morrovia.save_document` still contains the submitted draft status. Each child write compares the stored effective document against that unchanged candidate, which cannot be equal. The parent document can win and change while stop/leg/item projections are all skipped. Winner flags alone do not fix the mismatch. The disposable runner's draft-to-draft race does not cover it. Compare guards against the exact effective winning document and add planned-row/draft-candidate changed-child assertions; actual SQL execution remains required separately.

**Resolution:** The winning SELECT now updates transaction-local `morrovia.save_document` to the exact returned effective document. Source-shape assertions pass, and the disposable SQL scenarios now include planned-status preservation with changed stop/day projections, matching winner content, rollback, owner rejection and future-version nonmutation. **Actual PostgreSQL execution remains blocked**; this code correction is not represented as executed transaction proof.

## Disposition

The original snapshot was blocked by R1–R8; the re-review also identified the corrected follow-ups and R9/R10. **No unresolved concrete code finding remains in the exact working candidate identified above.** All independently reproduced issues now have bounded corrections and passing focused regression evidence, including the final collision permutation case. The actual SQL evidence blocker remains: do not label the SQL runner's skip a pass or claim transaction certification. Required full checks and the final accepted SHA are the implementation owner's remaining local completion steps. Hosted resolver/pack acceptance, unbound-content review interactions and the new async controller stay within the documented 14C/14D boundaries. No staging/push/deploy approval is implied.

# Batch14A local implementation and review handoff

Local canonical-model implementation is complete on `codex/batch14-route-spec`, isolated checkout `/Users/shaun/Documents/Codex/2026-10-06/task-2/Morrovia-batch14`, from accepted base `a3ab161e7ea97229f851423bc81fb0f67271560c`. Full-spec and detailed-plan review gates were satisfied before implementation; Shaun authorized local work/commits, relayed by the parent at 16:36:45 UTC on 6 October 2026. This is a local review candidate, **not release or hosted signoff**. No push/deployment, external reports, QA resets, new credentials, browser automation or Batch13 edits occurred.

## Deliverables and contract

- [Approved v2 specification](../specs/2026-10-06-batch14a-canonical-route-design.md): current-source diagnosis, three architectural options, bounded migration recommendation, data contract, edit invalidation scopes, migration/recovery requirements and14A–14D phase gates. Latest actual planning discussion and approved mockup pixels were read during diagnosis; no new visual/UI validation is claimed here.
- [Executed implementation plan](../plans/2026-10-06-batch14a-canonical-route-implementation.md): Tasks 1–7, reader-before-writer sequencing, tests and manifest; actual SQL execution explicitly unchecked.
- [Independent whole-branch review](2026-10-06-batch14a-independent-review.md): initial findings, follow-up reproductions, narrow fixes and independent re-review. Parent additionally commissioned a review of the frozen Task6 commit; its findings F1–F7/B1 are dispositioned below.

Schema 2/intent 2 now owns route input in `brief.intent.route`; ordered stop occurrences, existing legs and itinerary remain projections. Pure supported-v1 decoding retains owner, source timestamp/CAS token, raw recovery and unknown legacy endings. Required unresolved intentions and night requests survive capture/rebuild; geographic identity never merges repeated occurrences. Planning-area totals stay on their parent. Normal destination entries remain optimizable; explicit/manual/legacy order remains authoritative. Optional **Update route** is a broader proposal primitive, with traveller acceptance before changing authoritative order. Saving never stamps a successful reconciliation key.

Readers, import/copy/promotion/remapping, API boundaries and guarded repository writes accept supported versions. Unsupported future documents remain visible errors. Exact durable acknowledgements cannot erase newer recovery. Projection acceptance preserves current traveller-owned content, validates existing calendar/locks/commitments and known stay bookings, protects pair-bound transport edits, and stamps only a valid current input key. Pending/provisional projection guards reach existing Builder feedback, Overview and Itinerary selectors.

## Verification against final local product code

| Check | Result |
| --- | --- |
| Focused canonical/migration/handoff/storage/server/roundtrip/accepted-edit group |183 tests: **181 passed, 0 failed, 2 skipped** |
| `npm run test:persistence` |169 passed, 0 failed |
| `npm run test:trip-capture` |145 passed, 0 failed |
| `npm run test:state-preservation` |49 passed, 0 failed |
| `npm run typecheck` |Passed |
| `npm run build:check` |Passed |
| `npm run audit:ui` |Passed with existing accepted debt baseline |
| `git diff --check` |Passed |
| Independent focused re-review |101 tests: 100 passed, 0 failed, 1 actual SQL skip; final identity delta 54/54 and 120 permutations passed |
| `npm run lint` |Not completed: existing Next 15 `next lint` asks interactively to configure absent ESLint. No lint infrastructure changed. |
| `tests/imported-trip-hydration.test.ts` |Known accepted-base failure:11 pass / 1 fail; explicit planning leg remains `unknown`. Reproduced independently on `a3ab161` before branch changes. |

Counts overlap across commands and are not a unique-test total. The focused skips are the existing opt-in public-route inventory and **actual PostgreSQL integration**, not passes. Logs and RED→GREEN evidence are retained in ignored `.superpowers/sdd/2026-10-06-batch14a-canonical-route-implementation/`. Build-generated `next-env.d.ts` was restored; no generated build/config churn is included.

Focused command:

```sh
node --experimental-strip-types --test --test-reporter=tap tests/trip-document-migration.test.ts tests/trip-route-intent.test.ts tests/trip-stop-remap.test.ts tests/trip-promotion.test.ts tests/spreadsheet-import.test.ts tests/public-route-handoff.test.ts tests/trip-document-storage.test.ts tests/trip-document-server-boundaries.test.ts tests/trip-document-repository.integration.test.ts tests/trip-route-projection.test.ts tests/trip-builder-document-commit.test.ts tests/trip-builder-order.test.ts tests/trip-replan.test.ts tests/trip-copilot-actions.test.ts tests/trip-mutation-persistence.test.ts tests/batch14a-route-roundtrip.test.ts tests/builder-persistence-acceptance.test.ts
```

## Review disposition

| Reproduced finding | Repair and focused regression evidence |
| --- | --- |
| ParentF1 / R2: acknowledged source shadows cache | Exact immutable recovery retains source bytes; exact scoped durableACK records source-specific evidence without deletion. Same-owner reopen, current selection, late/changed source, guest promotion and next-account tests pass. Arbitrary normalized cache cannot acknowledge legacy input. |
| ParentF2 / R6: capture-only unresolved nights lost | Source-occurrence-bound requests retained, including repeated Mostar 2/3-night mentions with distinctIDs. Unknown/ambiguous evidence remains unknown. |
| ParentF3 / R7: area parent lost on base replacement | Preserve parentID/text/total as `needs_base` when bindings disappear; bind replacements only with explicit selection evidence. |
| ParentF4 / R8: stale transport preferences | Canonical transport modes and avoidDriving participate in dependency key; accepted changes preserve authoritative order and invalidate old evidence. |
| ParentF5 / R4: terminal/ordinal order unprotected | Supported first/then/finally/finish sequences explicit; uncertain ordinal hints derive review. Ordinary chips and unrelated first/then instructions remain unordered. |
| ParentF6 / R1: failed schedule stamped current | Validate existing cascade dates/conflicts, non-null stay dates and date-bound commitments. Empty generated-day shrink allowed; authored content and known booked-stay bindings protected. |
| ParentF7: contradictory parent night total | Accepted bound-base delta updates parent total once; same-parent redistribution preserves total, between-parent alternative updates each once. Excess hard budget surfaces blocking issue. |
| ParentB1: provider edit moves to a different pair | Concurrent pair change and transport edit uses existing conflict/recovery behavior; no positional transport-choice reassignment. |
| R1: late proposal overwrites authored data | Copy current traveller metadata and complete current PlanItem fields, changing only reconciled date/dayNumber. Erasure, newer notes/times/booking-link regressions pass. |
| R3: optional metadata throws / core migration non-idempotent | Required corruption typed invalid; optional malformed structured/captured source retained and warning-bearing, skipped for inference. Missing provenance/sourceText/order/country/geometry tests pass. |
| R5: namespace collision through migration/save | Stable distinct intentIDs; injective owner namespacing with permutation-stable collision allocation, retained canonical occurrence IDs, nested remapping and output validation. Read→owner→duplicate/reload tests pass. |
| R9: booked stay displaced without conflict | Known occurrence booking dates outside projected stay rejected; booking bytes untouched. |
| R10: planned status defeats winner child guard (inherited) | Winning SQL SELECT sets transaction-local comparison to exact effective returned JSONB. Source/process assertion passes; planned/draft child scenario added to actualSQL runner. Execution is still unverified. |
| Malformed request JSON returns500 | POST/PUT/promotion validation path returns400, with retained recovery behavior. |

Initial review regression group had13 observed assertion failures before repairs; additional follow-up RED cases were reproduced before their corrections. Broad green checks do not substitute for these reproduced adversarial contracts.

## Scope and remaining gates

Builder source diff is **11 added / 1 removed lines**, all imports, handoff/canonical factory wiring, accepted-order state and dependency-array updates. No JSX, controls, stylesheet, shared components, navigation, table/map workspace or homepage changed. No recurring shared UI/Storybook change was introduced. Pure selector additions are documented bounded bridges required by the approved pending-projection/order-review contract.

**Actual SQL execution remains blocked.** No `MORROVIA_TEST_DATABASE_URL`/`MORROVIA_TEST_DATABASE_DISPOSABLE=1`, Postgres or container runtime is available. The parent requested permission to install/provision an isolated local test database; approval was still pending at handoff. Nothing was installed/provisioned. The runner never falls back to `DATABASE_URL`, staging or production; uses a unique disposable schema, actual relevant migrations and real repository code. It requires pre-existing pgcrypto and tests winner/loser child content, matching-token old-client rejection, planned/draft effective-document writes, owner/future rejection, rollback, promotion and lifecycle. Simulated adapters/source inspection are not SQL execution proof. Run the actual test after the separate approval/configuration gate.

Imported-hydration's accepted-base failure, capture duration parsing edge cases, A06 Mostar andA09 San Pedro resolver recovery remain open. Retention tests do not resolve or sign off their provider outcomes. The authoritative 20-case pack remains intact; cases 11–20 and the all 20 on a single accepted SHA/adversarial run belong to 14D. Batch 13's 8/10 mixed-SHA diagnostics remain non-release evidence.

14B homepage planner, 14C Builder control redesign/new autosave-reconciliation controller and final Update route interaction have **not** been implemented. Builder table/map remain. Hold the next phase for 14A review disposition and remaining SQL evidence; no staging/push/deploy authorization is implied. A safe rollback must retain compatible v2 readers and source-version writer protection; acceptedbase alone is not a safe v2 writer rollback. **MANUAL HOSTED VERIFICATION REQUIRED** at the later approved integration gate.

## Final changed-file manifest

### Production data/model and boundary files

- `app/api/easyt/trips/[tripId]/promote/route.ts`
- `app/api/easyt/trips/[tripId]/route.ts`
- `app/api/easyt/trips/route.ts`
- `app/api/journey-booking-readiness/route.ts`
- `app/journey/new/trip-builder.tsx`
- `lib/easyt/can-build-trip.ts`
- `lib/easyt/home-trip-handoff.ts`
- `lib/easyt/public-route-handoff.ts`
- `lib/easyt/repository.ts`
- `lib/easyt/spreadsheet-import.ts`
- `lib/easyt/storage.ts`
- `lib/easyt/trip-builder-document-commit.ts`
- `lib/easyt/trip-builder-order.ts`
- `lib/easyt/trip-builder-preservation.ts`
- `lib/easyt/trip-builder-route-preview.ts`
- `lib/easyt/trip-copilot-actions.ts`
- `lib/easyt/trip-copilot-previews.server.ts`
- `lib/easyt/trip-document.ts`
- `lib/easyt/trip-facts.ts`
- `lib/easyt/trip-mutation-persistence.ts`
- `lib/easyt/trip-overview-readiness.ts`
- `lib/easyt/trip-persistence-error.ts`
- `lib/easyt/trip-promotion.ts`
- `lib/easyt/trip-readiness-summary.ts`
- `lib/easyt/trip-replan.ts`
- `lib/easyt/trip-route-intent.ts`
- `lib/easyt/trip.ts`

### Tests and fixtures

- `tests/batch14a-route-roundtrip.test.ts`
- `tests/dashboard-reconciliation.test.ts`
- `tests/fixtures/batch14-route-documents.ts`
- `tests/helpers/batch14-repository-db.ts`
- `tests/helpers/batch14-repository-loader.mjs`
- `tests/helpers/batch14-repository-scenarios.ts`
- `tests/helpers/batch14-server-fixtures.ts`
- `tests/helpers/batch14-server-scenarios.ts`
- `tests/helpers/discovery-fixture.ts`
- `tests/itinerary-combined-acceptance-app-browser.test.ts`
- `tests/legacy-transport-compatibility.test.ts`
- `tests/public-route-handoff.test.ts`
- `tests/signed-in-trip-persistence-regression.test.ts`
- `tests/spreadsheet-import.test.ts`
- `tests/state-preservation-torture.test.ts`
- `tests/trip-browser-storage.test.ts`
- `tests/trip-builder-order.test.ts`
- `tests/trip-document-migration.test.ts`
- `tests/trip-document-repository.integration.test.ts`
- `tests/trip-document-server-boundaries.test.ts`
- `tests/trip-document-storage.test.ts`
- `tests/trip-route-intent.test.ts`
- `tests/trip-route-projection.test.ts`
- `tests/trip-stop-remap.test.ts`

### Specification, plan and review evidence

- `docs/superpowers/plans/2026-10-06-batch14a-canonical-route-implementation.md`
- `docs/superpowers/reviews/2026-10-06-batch14a-execution-evidence.md`
- `docs/superpowers/reviews/2026-10-06-batch14a-independent-review.md`
- `docs/superpowers/specs/2026-10-06-batch14a-canonical-route-design.md`

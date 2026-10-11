# Physical Land Refinement Implementation Plan

**Goal:** Allow accepted coastal endpoints strictly inside the same verified physical land component to reach bounded road assessment when coarse geometry is unproven.

**Architecture:** A pinned offline importer verifies OSM relation11105712 and all coastline dependencies, then emits a separately licensed immutable physical-component dataset. Shared land classification consults strict component containment only for coarse unproven results. Existing geographic, crossing and provider gates remain authoritative.

**Tech stack:** TypeScript, existing physical-island geometry validator, Node offline generation, static JSON and Node tests.

**Spec:** Delegated conditional local GO and task-10/qa-baseline/znz-topology-plan.md. Native implementation authorized; independent review follows commit.

## Constraints

No runtime OSM calls, snapping, threshold changes, pair whitelist, frozen benchmark changes, services or duration claims. Keep coarse separate-land. Pin raw hash/source URL/capture time/relation/member/node versions and generated output hash. No simplification. Reject nested dependencies. OSM-derived database released under ODbL with static access to source/derivative/notice/license; preserve other sources.

## Tasks

1. Test exact accepted ZNZ/Nungwi and city/Nungwi topology/provider contracts against base; record expected red. Add importer and strict component tests for source/hash/version/dependency/physical tags, ring failures, holes/boundary/sea/disconnected/overlap; no duration oracle.
2. Implement `compilePinnedPhysicalLandSource` with existing strict geometry validator and component keys from retained outer member way identities. Copy pinned public capture and approval metadata, generate no-loss derivative JSON plus static ODbL data-sharing files and checksums reproducibly.
3. Add `refineUnprovenLandConnection` to shared classifier; coarse same/separate unchanged. Attach existing warnings/attribution metadata for a provider result using refined physical continuity, without inventing service facts or new UI.
4. Run new tests plus geographic readiness, physical geometry/island snapshot, road/multimodal and crossing controls, typecheck and diff checks. Report inherited failures individually; do not regenerate snapshots. Commit in isolated branch for review.

## Review focus

Nested/admin/maritime geometry rejected; raw selected-identity guard unaffected; same relation with separate shells never connected; refinement overlap and holes remain uncertain; source licenses and publicly accessible database sharing remain explicit.

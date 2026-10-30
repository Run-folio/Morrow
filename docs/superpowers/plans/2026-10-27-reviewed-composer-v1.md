# Reviewed transport composer V1 Implementation Plan

> For agentic workers: use superpowers:executing-plans inline, with one independent final review.

Goal: add a generic, side-effect-free evidence composer to the existing resolver, preserving previous patches and admitting complete labelled planning estimates without requiring live availability.
Architecture: independently admitted physical endpoints and directional component evidence feed a bounded composer. Complete candidates use existing segment/choice structures; incomplete evidence remains diagnostic, not selectable. This first slice implements the shared contract and resolver boundary; evidence rollout/UI presentation remain separately measurable, not silently populated by guessed corridors.
Tech stack: TypeScript, existing Node test runner and transport model.
Spec: ../builder-ack-alias-repair-20261026/coverage-audit/TRANSPORT-PLANNING-REVIEW-BRIEF-20261027.md (task-root relative); latest user clarification permits complete defensible estimates without dated schedules.

## Constraints
No commits, builds, external calls, owner-browser actions, deployments, saved-data rewrites, provider integrations or guard removal. Existing candidates remain immutable. No bus-as-driving. Partial non-selectable. At most two main services/one connection, with bounded access/egress. Source freshness and date scope are distinct from availability.

## Isolation and rulings
A disposable exported source snapshot combines the existing21-file save repair and28-file Transport patches. One shared test helper retains BOTH completedTransferResolutionLeg and comparison adapter additions. No app-file overlaps. Native Git worktree would omit these uncommitted isolated snapshots; archive isolation follows existing workflow and preserves originals. No install or build; dependencies/data read-only symlinks. No commits despite skill default.

## Review focus
Malformed/stale identity or temporal evidence; missing timing versus complete estimates; broken internal gateway continuity; selected/booked and owner state preservation; unknown evidence treated as a selectable success.

## Task1: shared composer and resolver integration
Files: create lib/easyt/reviewed-journey-composer.ts, tests/reviewed-journey-composer.test.ts; modify lib/easyt/multimodal-transfer-resolution.ts only at candidate/diagnostic/option boundaries.
- [ ] RED integration test: real resolver ignores a qualified template before implementation; assert expected reviewed_composition candidate absent/fails. Keep real guards and controlled road fixture.
- [ ] Implement composeReviewedJourney(leg, template, context) returning complete(candidate), partial(reasons) or unqualified(reasons). Strict geography/physical identity, sourced date freshness, one/two services, exact connection continuity, bounded components and independent timing. No network/writes.
- [ ] Add optional reviewedJourneyTemplates/context to existing resolver boundary, including explicit comparison and batch callers. Empty/default input preserves released behavior; sources are supplied by trusted internal evidence adapters, never unvalidated API payloads.
- [ ] Add cross-mode/region contract tests, complete estimate without timetable, unknown timing, stale/date-bound source, mutations, exclusions, preserved chosen/booked sources, JSON reload and original input unchanged.
- [ ] Run focused resolver/choice/comparison/protection tests and typecheck. Record baseline failures separately; no assertion weakening.

## Task2: evidence pilot and compatibility record
- [ ] Document registry/source owner (Morrovia maintainer), review/expiry responsibilities, actual primary evidence gaps, no claimed global feed. Existing data remains unchanged until edge-level support can satisfy contract; no test source becomes production evidence.
- [ ] Independent review exact diff and tests; address safety findings with regression tests. Produce manifest/patch and coverage limits; do not claim full Builder/hosted readiness from pure checks.

## Separate Omio plan (not implemented)
Current buildOmioRouteSearchLink has no returnDate and omioBookingActionForLeg is called per leg. Parent verified official redirect supports returnDate with FLIGHT. Preserve existing Impact wrapper and encode through URLSearchParams. Add optional returnDate only after strict validation against outbound date. Recognize only an explicit compatible origin/end return intent and uniquely reversed qualified physical flight endpoints, valid future dates, neither leg booked, compatible selected effective modes. Preserve both legs/IDs; one shared return SEARCH action references both. Do not pair open-jaw, multi-city or names alone. Ambiguity retains separate actions. Tests must cover true return, repeated visits, different airports, partial/booked pair, ended outbound and tracking/encoding. Landing/attribution requires separately authorised manual check; no one-ticket/PNR guarantee.

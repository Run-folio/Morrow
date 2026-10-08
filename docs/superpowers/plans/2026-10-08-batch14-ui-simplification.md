# Batch14 beta planner simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans as the already authorized sole native implementer. No subagent dispatch.

**Goal:** Apply Shaun's approved simpler beta planner presentation while retaining canonical trip data and safe autosave/optimisation.
**Architecture:** Bounded composition/removal in the existing capture and Builder components. Keep all canonical writers, migrations, retained storage and route proposal acceptance unchanged.
**Tech Stack:** Next/React/TypeScript, current shared Morrovia controls, node:test/esbuild/Playwright mounted fixtures.
**Spec:** `docs/superpowers/specs/2026-10-08-batch14-ui-simplification.md`

## Global Constraints

Keep table/map and shared tokens; no additional implementer, schema/config/credential changes, reset/delete, new publication or engine rewrite. Hide controls without clearing stored preferences/instructions/bookings. Preserve parent/stay IDs, requested/held nights, authored bytes and authoritative order. Update route remains optional; authoritative order changes require traveller acceptance. Existing user approval covers this bounded correction; review/publication gates remain separate.

## Review Focus

- A no-proposal/unavailable optimisation result must not reveal retired days or write.
- Hidden saved interests/transport/no-driving constraints must survive budget/night edits and reload.
- A grouped destination must show actual mapped bases without duplicating/flattening its parent or changing repeated IDs.
- Necessary dependent failure/recovery must retain its scoped retry without a general review interface.
- Mobile composition and explicit/stale route proposals must remain accessible and safe.

### Task 1: Remove general review and simplify Builder controls

Files: `app/journey/new/trip-builder.tsx`, `trip-builder-top-controls.tsx`, its CSS/stories; tests `batch14-ui-simplification-app-browser.test.ts`, existing top-controls/proposal mounted tests.
Interface: consume current mountedBuilder snapshot and canonical intent; reuse unchanged onUpdateRoute/onEditIntent/onRemoveIntent and proposal acceptance. Optional inline outcome is ReactNode by existing Update route action; mapped base label derives orderedStopIds filtered by intent.stopIds.

- [x] Write/observe RED mounted flows: no general review; retained data preserved on accepted edit/reload; no-improvement/unavailable stay inline and write0; grouped parent includes chosen bases once; hidden preferences remain intact.
- [x] Remove review state/button/modal/retained cards; put genuine no-proposal feedback at Update route and real failed-unit retry at the affected stop/connection/endpoint/date control. Keep blocking date/night feedback scoped to relevant controls/actions and actual proposal acceptance unchanged.
- [x] Remove optional Builder preferences panels; show mapped bases in existing parent tag; suppress duplicate mounted summaries; remove scoped form/day-count tint. Update canonical stories and obsolete UI assertions without weakening preservation/proposal tests.
- [x] Run mounted simplification/top-controls/proposal/pin suites; expect no skipped enabled tests or page errors.

### Task 2: Remove optional capture interests consistently

Files: `components/easyt/morrovia-trip-capture.tsx`, its stories, simplification mounted tests.
Interface: keep existing interests/onInterestsChange props and captured/stored payloads; remove rendered interest controls/summary claims from both homepage and fresh/manual capture, keep budget/travellers/dates.

- [x] Write/observe RED actual Capture Personalize/details flows with saved interests; no interest or transport preference controls, budget/travellers/dates usable, saved payload unchanged.
- [x] Remove only control rendering/unused UI state; update summaries and representative stories.
- [x] Run mounted Capture/Builder flows and input/persistence/projection coverage; expect saved fields retained.

### Task 3: Verify exact new local candidate and review handoff

- [x] Run applicable broad tests, UI audit/typecheck/build and build-storybook; report inherited failures by name rather than masking them.
- [x] Capture/view real local desktop1440/mobile390 neutral top form, grouped area/base field, budget/date/traveller controls, no-proposal inline result and genuine proposal comparison; assert overflow/page errors and stored data/reload behavior.
- [ ] Commit bounded changes locally; create exact-SHA evidence/review handoff. Preserve separate c1 deployment/QA checkpoint and all failed runner attempts. Stop for independent review and separate publication approval.

## Current verification and gates

Mounted flows: 66 passing cases plus the updated retired-day calendar case passing independently (67 current cases); a prior obsolete review assertion timed out and remains in its original log. The final scoped retry/preservation rerun passes 9/9. Broad contracts: 269 pass, 2 inherited assertion failures, 99 opt-in browser skips; the browser group was separately enabled. Both inherited failures reproduce unchanged on exact c1. Typecheck/build/UI audit and Storybook pass. Ten real local production-CSS screenshots at 1440/390 have measured 12px/600/mixed-case labels and 16px inputs/prompt, no page overflow or page errors. Compact label cascade mismatch discovered in the first pixels was corrected; earlier receipts remain.

No new homepage arrangement is included. Shaun's further Describe-without-Start-from/top-right-type proposal is awaiting visual mockup selection; retain canonical origin and the current origin input until that gate is resolved. Independent review and separate publication approval remain pending. Frozen c1 hosted pack is separately on RELEASE HOLD for geography findings (13 reviewed passes, 3 geography failures, 4 geography review cases); it does not qualify this unpublished candidate.

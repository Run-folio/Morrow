# Photo-led itinerary implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt the existing itinerary to the two approved concepts: a photo-led desktop weekly calendar and a mobile agenda with a date strip, route heading, photo, travel, day parts, stay and Add plan.

**Architecture:** Preserve the current itinerary composition, selection, mutation and recovery state machines. Add a reviewed-only option to the pure image selector and one resilient, attributed image presentation shared by day detail and calendar. Compose existing controls and planner; do not add provider lookups or change persisted trip data.

**Tech Stack:** Existing Next/React, CSS Modules, Lucide and Morrovia controls/tokens.

**Spec:** Approved Library references libfile_dd7a110a063c8191aeca3c6ddb698c27 (desktop week) and libfile_51eb3d5e8ad0819195fdf54703fc0da1 (mobile agenda); implementation authorized in parent delegation.

## Constraints

- Preserve bottom navigation exactly: components, labels, ordering, destinations, styling and behavior. Explicit user restriction on 2026-11-05.
- Keep title fix f77be29 and all existing editing, travel/stay detail, draft and recovery behavior.
- Use reviewed destination imagery; repeated relevant images and honest no-photo states are valid.
- No new source acquisition, provider-photo reuse, booking claims or deployment.
- Reuse EasyTButton, JourneyRouteStopTrack, MorroviaPhotoCredit, ResilientImage, TripMobileSheet and RichItineraryDayPlanner.
- Keep mobile native dialog focus and desktop drag/drop behavior intact.

## Review focus

- Missing or failed photos must not remove labels or block editing.
- Long titles, multiple activities and 320px screens must remain readable without page overflow.
- Date/day navigation must preserve keyboard focus and scope identity.
- Travel days and selected stays must remain discoverable, with saved versus booked status intact.
- 84-day trips must avoid per-day API requests and eager full-resolution downloads.

## Tasks

1. Add failing tests for reviewed-only source selection and responsive day-photo metadata; implement without changing default selector behavior. Verify image selection tests.
2. Add a browser regression for desktop calendar thumbnails, compact date strip and mobile order (heading/photo/travel/plans/stay/Add plan), keyboard day navigation and broken-photo fallback. Observe expected failure.
3. Add reusable itinerary photo presentation and compose it into calendar/day detail. Adjust existing CSS hierarchy and place the existing stay context after the planner on mobile. Preserve existing event callbacks and semantic controls.
4. Run focused image, composition, calendar, day-part, editing and recovery tests; browser checks at 1440/1024/768/390/320; typecheck, UI compliance and Storybook build. Compare screenshots to both approved references and record design QA.
5. Request independent review; fix material findings; commit isolated changes and hand back screenshots, exact verification and remaining gaps. No deployment.


## Execution record — 2026-11-05

- Tasks 1–3 completed in preserved WIP 9a7785d; title fix f77be29 retained.
- User selected the new rendered mobile direction and required bottom navigation to remain unchanged. Source diff and runtime baseline comparison confirm this.
- Independent review found two P2 issues: visual/keyboard stay ordering and credit loss for two variants of one image. Both were reproduced RED and verified GREEN in browser tests; stay now follows planner in DOM, and credit ownership follows actual normalized source.
- Visual comparison found stay title/status competing horizontally. A failing geometry check was added and the existing stacked identity wrapper restored.
- Final: 149 focused tests, six new browser checks, two existing mobile calendar checks and ten retained-recovery checks pass. Typecheck, strict UI audit, convergence and Storybook build pass. Broad source-assertion selection has nine unchanged baseline failures (191/200 pass), recorded in design-qa.md and output/qa.
- Current QA report is prepended to design-qa.md while retaining all prior QA history. Comparison and screenshot artifacts are local under output/playwright.
- Ruling: keep the existing design-system fonts, colors, navigation and action styles rather than copying concept chrome; the user approved the rendered adaptation, and requires existing navigation unchanged.
- Ruling: reuse a relevant reviewed destination cover when distinct assets are unavailable; no per-day sourcing or provider-photo reuse introduced.
- No merge, push, deployment, production SQL/OAuth save or hosted acceptance performed. Branch and isolated checkout preserved for parent integration.


## Integration qualification follow-up

- All nine stale presentation contracts reconciled with exact current owner boundaries; no implementation behavior relaxed. Independent reviewer confirmed no lost assertions.
- Added immutable canonical endpoint/date/mode checks and visible airport-assumption disclosure to reconcile two extra baseline expectations exposed by expanded behavior suites.
- 242 domain/presentation tests and 16 mounted browser checks pass. Added an opt-in loopback-only production smoke for built photo calendar, actual navigation current state, title-line rename and durable reload.
- The unconfigured local build's offline-marker failure was traced to empty build provenance. The candidate build must use its exact COMMIT_REF; the offline guard remains enforced.
- No shared staging mutation, merge, push or deployment. Candidate remains a separate local branch for the coordinating release task.

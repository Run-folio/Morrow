# Calendar workspace review

Base: `329db3aa6fd7db23dc7a1d6bcff0a07a50335137`. Isolated branch: `codex/calendar-full-trip`.

## Scope and implementation

The accepted calendar structure is composed from the current Morrovia workspace, not the generated reference styling. The three supplied Library images were materialized using the current Library helper and inspected as readable pixels in this executor.

- Day by day remains the fresh-entry default. Existing explicit URL orientation restoration remains intact.
- Calendar renders the existing pure full-trip week projection. Dated weeks keep Monday–Sunday columns; undated groups do not invent weekdays.
- Desktop places the selected-day planner on the right and the existing suggestions in a horizontal tray below the grid. Mobile retains continuous compact seven-column weeks, followed by the selected-day planner, ideas, and contextual map. The existing route timeline remains available.
- Cells show at most four non-accommodation previews with the exact remaining count, plus a separate overnight stay summary. More selects and focuses the existing full-day planner without leaving Calendar.
- Selected-day details reuse `RichItineraryDayPlanner`, `SelectedDayStayContext`, the existing booking/detail owners, and the existing map preview. Additional dated stay bookings are accessible through the existing booking-detail owner; stay/date association semantics are unchanged.
- Activity details reuse `ItineraryActivityIdentity` and `ResilientImage`: existing activity image first, category icon when missing or failed, with equal fixed-size media slots. Compact calendar previews use icons. No providers, stock-photo substitution, tokens, theme, or shared primitive changes were introduced.
- Drag, Add, Move, reorder, cancel and Undo continue through the existing canonical parent handlers. No mutation domain, save hook, persistence, authentication, or nights allocation file changed.

## Validation approach

The frozen baseline's 71 calendar, composition and mutation tests passed before implementation. Presentation checks were updated only where the accepted arrangement replaces the old selected-week layout. Calendar Storybook plays now require their controls and assert complete trip-day coverage, dense-day accessibility, Add results and a completed drag result. The existing ClickAddAutomaticallyPlaced play now asserts a canonical result as well.

The new browser regression file uses isolated Storybook trip fixtures, following the repository's existing browser-test entry point. It checks 320/390/430/768/1024/1440/1920 widths, all 65 trip days, continuous weekday columns, selection parity across views, no page overflow, twelve activity IDs and accessible reordering, multiple stays, loaded/missing/failed image slots, completed/cancelled drag, non-drag Move/cancel equivalence, and touch selection/Back focus.

Final gate results and evidence filenames are recorded below after the final run.

## Baseline exceptions and verification limits

- `audit:ui --strict` fails on the frozen base and this branch because `raw-color` in `components/easyt/trip-overview-workspace.module.css` fell from 9 to 8 without a corresponding baseline reduction. This calendar change adds no reported UI debt. The unrelated baseline was not modified.
- `tests/storybook-visual-system.test.ts` fails on the frozen base and this branch because its double-quote-only title regex rejects the existing single-quoted Builder route proposal title. The unrelated story and guard were not modified.
- Account acknowledgement, hosted authentication and production reload were not exercised. The existing local mutation/recovery tests cover reload, queued writes, stale revisions and item-scoped undo. No production or real-user trip was mutated.
- Map tiles and provider-backed suggestions can be unavailable in isolated Storybook. Existing loading/failure/retry and attribution UI remains visible; no provider settings changed.

No push, deploy, merge, migration, credential or provider change was performed. Workspace TSX/CSS overlap future itinerary changes and should be integrated by the coordinating parent after independent review.

## Final results

- PASS: 71 focused calendar, presentation, composition and mutation tests.
- PASS: 6 executed browser acceptance tests on the final static Storybook build, with no skips (14.65 seconds). Keyboard reordering preserves all twelve IDs; Move and drag reach the same target without duplicates, and both cancellations preserve canonical state.
- PASS: `npm run typecheck`, `npm run build:check`, `npm run build-storybook`, and `git diff --check`.
- BASELINE FAILURE: strict UI audit and the unrelated Storybook title guard described above. Including that guard, the extended source run is 79 pass / 1 baseline failure.
- Local production pixels were inspected through built Storybook, including unchanged Day by day and Calendar. Loaded/missing/error imagery uses the existing shared activity identity on both desktop and mobile.
- The final responsive screenshots for every tested width and full 65-day overview are retained at `/tmp/morrovia-calendar-evidence-reviewed`. A smaller review set and complete gate logs are committed in `docs/product/calendar-workspace-evidence/`.

Validation used only synthetic Storybook trip IDs. Earlier development-server and interrupted-build browser attempts were superseded by the final completed static-build run; their failed checks are not represented as passing. No hosted account-save or production-reload claim is made.

## Changed production and test files

- `components/easyt/trip-itinerary-workspace.tsx`: layout composition, full-trip calendar input, selected-day reuse, preview/stay separation, keyboard focus, additional dated stay visibility.
- `components/easyt/trip-itinerary-workspace.module.css`: desktop/right-detail layout, mobile continuous weeks, visible route timeline and horizontal ideas tray, existing-token treatments.
- `components/easyt/trip-itinerary-workspace.stories.tsx`: updated Calendar arrangement play, completed drag and Add outcome assertions, dense/multiple-stay/image fixtures.
- `tests/itinerary-calendar-presentation.test.ts`: replaces obsolete selected-week/full-day-switch and mobile one/two-column assertions.
- `tests/itinerary-calendar-full-trip-browser.test.ts`: executed responsive and interaction acceptance coverage.
- `components/easyt/storybook/morrovia-visual-inventory.generated.json`: generated Storybook inventory refresh.
- This review report and its synthetic local evidence/logs.

Shared production dependencies (`RichItineraryDayPlanner`, activity identity/image component, TripShell, route track, controls, map preview, calendar projection, mutation/persistence hook) were reused without edits. Some existing Storybook TripShell navigation mocks highlight Overview even while rendering the itinerary fixture; production navigation owners were not changed.

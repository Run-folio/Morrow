> Current implementation: mobile Calendar day details use an explicitly opened bottom sheet below 1100px. The inline mobile detail arrangement described in earlier implementation notes is superseded by the approved sheet contract below. Desktop keeps its right panel; Day by day remains the fresh default.

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

## Independent review follow-up

Both reported mobile regressions were reproduced against the original committed static Storybook build (two failing tests). Calendar selection now focuses and immediately scrolls to the matching inline day details below 1100px; desktop day-cell selection keeps focus on its cell. A pending focus request checks the rendered day ID before acting. Back to calendar focuses and immediately reveals the selected cell, including reduced-motion mode.

The DOM now contains calendar, selected-day details, ideas and contextual map in that order, with one planner and one ideas owner. Mobile CSS follows that reading order. Shared mutation/save owners remain unchanged. Committed evidence logs were normalized to remove trailing whitespace and extra EOF blank lines; the full diff from frozen candidate329 passes whitespace checking.

Follow-up validation: 71 focused tests pass; all 8 browser acceptance tests pass with no skips, including touch/keyboard selection at 320/390px with both motion preferences, desktop focus preservation, and forward Tab from the final calendar cell through day controls before ideas. Typecheck, production build:check and static Storybook build pass. Final desktop/mobile pixels were inspected. The same unrelated strict UI audit baseline failure remains; no unrelated audit or story-title guard was changed. Follow-up logs are saved in the committed evidence directory with the review-fixes prefix.

## Approved mobile day sheet (supersedes inline detail navigation)

The sheet opens on explicit calendar click/touch/Enter/Space. Initial load, URL restoration and passive date navigation leave it closed. The same mounted planner, ideas and contextual map adapt between the desktop panel and the mobile native dialog. Busy days scroll inside the sheet; the named sticky heading, Close and Back to day remain above item content and clear device safe areas. Existing activity imagery uses stable icon fallbacks; image/provenance/actions remain owned by the existing presentation components.

MorroviaContentDialog now supports an inline presentation for the same mounted content owner, calendar-specific return focus, and native-child event guards. When an already-visible desktop panel adapts with a child dialog open, its native child is restored above the new modal while keeping its mounted draft and focus. Existing explicit child/item intent carries into the compact sheet. Item/logistics details use embedded presentation within that surface, retaining their actions; Escape returns to the day before closing the sheet. Add, Move and Remove keep their existing modal and mutation owners. No mutation/save/persistence implementation was edited.

Closing restores the selected calendar date and recorded calendar position. The selected control uses the existing sticky-content-offset token for clearance; acceptance tests assert focus, viewport visibility and actual element hit-testing. The 900px presentation and 1100px layout boundaries are preserved.

Validation on the final source: 12 browser acceptance tests pass with zero skips; 89 focused calendar/composition/mutation/persistence tests pass with zero skips; typecheck, production build:check, and Storybook build pass. Browser coverage includes 320/390 touch and keyboard, a 65-day overview at 320x844, passive restoration/navigation, twelve activities, multiple stays, image loading/fallback/internal scrolling, Add cancellation/confirmation and draft/focus retention while crossing 899/900/901 and 1099/1100/1101, item-detail Escape, Move/Remove Escape, desktop-first item-detail adaptation, sticky-header/return hit-tests, and desktop 1440/1920 coverage. Canonical drag, non-drag Move, cancellation, reorder and persistence assertions remain intact.

Independent read-only source/pixel review found and then verified fixes for desktop-first child-flow adaptation/cancellation and embedded item stacking above the sticky header. The final 320px item and 390px image-card screenshots have no remaining blocking review findings.

Baseline limits: strict UI audit still fails only for the unrelated Overview raw-color baseline reduction. A broader adjacent presentation run has 61 passes and 7 stale source-guard failures, reproduced with identical names/counts against pre-sheet f51c7c1; these were subsequently reconciled in the follow-up below. The separately documented Storybook title guard remains an existing failure. Production account acknowledgement, hosted authentication and real-user reload were not run; canonical local persistence/recovery tests passed. No production trip was mutated.

Commands used: npm run typecheck; npm run build:check; npm run build-storybook; npm run audit:ui -- --strict; node --experimental-strip-types --test with the five focused calendar/composition/persistence/mutation test files; MORROVIA_STORYBOOK_URL=http://127.0.0.1:6018 node --experimental-strip-types --test tests/itinerary-calendar-full-trip-browser.test.ts. Logs and pixels use the mobile-sheet prefix in the evidence directory; the complete responsive screenshot set remains at /tmp/morrovia-calendar-sheet-evidence. Earlier interrupted or superseded attempts are not represented as passing.


## Presentation guards and native detail-planner drag (latest)

All seven stale presentation guards are reconciled while retaining their semantic checks: canonical Add/day-part routing; deferred map selection and interactions; rendered order in both views; full-trip/one-planner/right-detail/mobile-sheet ownership and stays; title/date/timeline and accessible selected heading; conditional practical facts; and fine-pointer drag/ref/cancellation/canonical-mutation ownership. The combined eleven-file source suite now passes 157 tests, with zero failures or skips.

Two added browser tests preserve the preceding twelve tests. Rendered Day by day and Calendar retain identical activity IDs, trip title/date/timeline, one planner, and the intended ideas/context order. Native Playwright dragTo starts from the actual right-detail grip: cancellation records dragstart/dragend without changing placement; completion records a native drop, moves the activity into Morning, and preserves every ID exactly once in both views. Touch retains accessible non-drag controls. A scoped five-line CSS override exposes the existing grip in narrow desktop Calendar panels only for a fine pointer, retaining the planner's existing eligibility rules and mobile controls. No TSX, shared dialog, mutation, save or persistence implementation changed in this follow-up.

Final results: 14 browser tests pass with zero failures/skips; 157 source tests pass; typecheck, production build:check, and static Storybook build pass. Native detail drag uses 1440x1600 to keep endpoints unobscured; existing responsive tests retain 1440x1000 and 1920 coverage. Strict UI audit still reports only the pre-existing unrelated Overview raw-color baseline reduction. The unrelated Storybook title guard was not rerun in this follow-up; its earlier baseline result remains documented above. No hosted save/authentication or real-user mutation was run.

Final logs and selected current pixels use the guard-review prefix in the evidence directory. Complete current screenshots are in /tmp/morrovia-calendar-final-reviewed. Interrupted and superseded attempts are excluded from passing results. The coordinating parent owns staging integration; no push or deployment was performed.

Independent read-only final source and pixel review found no blocking findings. Desktop drag grips fit beside controls with readable images/titles; 320px Back/Close remain visible and the returned selected date clears navigation, without horizontal clipping.

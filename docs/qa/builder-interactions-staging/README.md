# Builder interaction review against staging 662a42e

This replaces the earlier `fac3b9b` integration recommendation. The earlier branch is preserved, but **do not apply that patch to current staging**: the mounted Builder, search and persistence architecture changed substantially.

Current implementation is on isolated branch `codex/builder-interactions-staging` in `/Users/shaun/Documents/Codex/2026-11-03/task/morrovia-candidate`, based directly on `662a42e520d4db67ee644a2e35973d002c42f89d`. No production checkout, account data, recovery data, credentials, push or deployment was changed.

## Independent review and fixes

A fresh read-only reviewer compared the original feature and staging, then rechecked the port. Confirmed findings addressed:

1. Touch/pen release outside the route, over a blocked row, or over another reorder surface previously committed the last legal preview. The hook now rechecks the release target, clears invalid previews and limits hit testing to the originating surface. Lost capture cancels the gesture.
2. Original per-control success announcements happened before async acceptance. The mounted hook now announces applying, accepted movement, or rejection accurately. It prevents duplicate dispatch while one acceptance is pending and does not say Escape cancelled an already submitted edit.
3. A gesture could survive an owner/trip scope change when IDs matched. Gesture scope is captured and validated before preview/drop. Completion notices are also scoped; stale notices disappear immediately.
4. Top destination chips only used ordinary stop locks, while canonical acceptance also protects arrival dates, booked stays and commitments. The parent now passes its exact `protectedBuilderStopIds`, alongside the existing chronology guard, to the mounted top controls.
5. Async menu completion could steal focus after the user moved elsewhere. A shared interaction helper restores the summary only while that same menu still owns focus and the trip scope is current. Earlier/Later use guarded `aria-disabled` instead of native disabled state so the invoked action stays focusable during acceptance. Escape closes the menu and restores its summary.
6. Current mounted route allocation status—not the dormant legacy table—uses the quieter supporting-body token. Semantic allocation warnings remain visible. Night calculations, locks, rebalance and persistence code are unchanged. Map-to-stop scrolling respects reduced motion.
7. Search retains staging's completed lookup, geographic acceptance, tuple identities, attribution, map and research features. Provider AND completed results are gated by current query/context. Hidden options cannot be selected with Enter, IME confirmation is ignored, and Escape is consumed only by an open popup. Late old-context work cannot leave the new Search button busy. Blur no longer uses a delayed callback that can reopen a just-dismissed search.

The final reviewer reports no remaining important static findings. Real browser/device correctness remains unverified.

## Integration boundary

- `app/journey/new/use-builder-stop-reorder.ts`: interaction state, acceptance notices, scope/capture guards and focus completion helper.
- `trip-builder-route-workspace.tsx`: live route rows, guarded move controls, human-readable live region, reduced-motion map handoff.
- `trip-builder-top-controls.tsx`: live destination chips, same protected IDs and scoped notices.
- `trip-builder.tsx`: **one prop addition only**, passing existing protected IDs. `commitStopOrder`, async edit dispatch and save/recovery owners are preserved.
- Builder CSS: quiet status heading, grip target sizing and disabled semantics styling.
- Current canonical autocomplete and shared key helper; existing result identity/provider acceptance is preserved.
- New actual-hook and actual-component regressions; small updates to existing test harnesses for new state fields/native-event data.
- Existing route allocation Storybook owner gains accepted, rejected, protected-arrival and 320px review examples. All examples are synthetic and memory-only. Generated visual inventory is refreshed.

No itinerary, task handoff or trip-name changes are included. No duplicate reorder implementation from the obsolete patch is carried into staging.

## Evidence

- Actual-hook suite: **10/10 passing**. Executes the production hook via the repository's isolated hook-runner style. Covers release hit testing, protected barriers, lost capture, duplicate dispatch, rejection/throwing acceptance, stale scopes, honest pending Escape and focus retention.
- Actual autocomplete component review suite: **4/4 passing**. Covers hidden Enter, IME, completed-result context changes and stale busy state.
- Current selected regression run: **100 tests; 84 passed, 16 browser-dependent tests skipped; 0 failed**. Includes layout/order/top-controls, pure keyboard helper, hook, autocomplete request lifecycle and actual component tests.
- Wider selected regression run: **295 tests; 283 passed, 9 failed, 3 browser tests skipped**. All nine failures exactly reproduce on a pristine detached `662a42e` baseline. Baseline-only and candidate-only failure sets are both empty. This wider run preceded the final fourth search regression; the current selected run covers the final changed interaction code.
- `npm run audit:ui`: passed, with no new UI debt.
- `git diff --check`: passed.
- Full `npm run typecheck`: unavailable as a green gate in this dependency environment: 282 errors confined to existing browser tests, including missing `playwright` declarations and dependent implicit-any errors. No missing browser dependency was installed and no browser test was enabled.
- Production-scoped TypeScript gate: **passed**, exit 0 with no diagnostics.
- Static Storybook build on final code: **passed**, Vite build 23.34s.
- Final patch applicability check against pristine `662a42e`: **passed**, `git apply --check` exit 0.

The production-scoped config includes app, components, lib, hooks, types, auth and the changed TypeScript unit tests; it excludes test-only browser entry points. This is explicitly narrower than the full repository typecheck. The local config is retained as `tsconfig.interaction-review.json`, outside the commit, for reproducing the command.

### Existing wider-suite failures

- actual fixed commitment keeps raw input until held true acceptance
- actual fixed commitment preserves label during accepted persistence
- actual fixed commitment preserves date during accepted persistence
- actual fixed commitment preserves label-before-render during accepted persistence
- actual fixed commitment preserves date-before-render during accepted persistence
- actual fixed commitment label A to B to A cannot clear a later scope
- actual fixed commitment date A to B to A cannot clear a later scope
- native body with existing input domain completes healthy route work for guest
- native body with existing input domain completes healthy route work for isolated-account

Reproduced using `tests/builder-fixed-commitment-async.test.ts` and `tests/builder-input-domain-projection.test.mjs` in `/Users/shaun/Documents/Codex/2026-11-03/task/morrovia-staging-baseline`. These failures are release-gate concerns, not fixed by this interaction patch. Exact assertions are in the local evidence logs.

## Apply and release

Fetch this isolated branch from its local clone, then cherry-pick its final feature commit into an isolated integration checkout at staging 662a42e. Alternatively apply `builder-interactions-staging.patch`. The feature commit's parent is exactly staging 662a42e; no snapshot commit from the earlier patch is required. If staging moves, inspect conflicts in the reorder hook, top controls, route workspace and autocomplete; preserve the new canonical commit/lookup owners.

Run the current release gates in an environment with complete dependencies. Do not deploy merely because the static checks below pass. Resolve or explicitly adjudicate the nine existing failures and complete manual QA first.

## Remaining browser/manual QA

Earlier socket binding and IAB file navigation restrictions were respected. No socket, file-URL, alternate-browser or raw-browser workaround was attempted during this review. Hook/component runners substitute React scheduling and native DOM; they are not browser, hydration, native focus or visual evidence.

- At 320/390px and desktop, check night label wrapping, long/repeated names, 44px target separation, last-row menu clipping, map/list scrolling and no horizontal overflow. New 320px Storybook example is compiled but unviewed.
- Real touch and pen: pick up, move, release over valid/blocked/same/foreign/blank targets, lost capture, multi-touch and cancellation. There is no touch edge auto-scroll; keyboard/menu alternatives remain available.
- Keyboard: Space/Enter pickup, arrows, Enter apply, Escape cancel only before submission. Confirm names and positions are announced once after accepted movement. Rejected writes must not announce success.
- Hold acceptance pending: move focus to a different field; it must remain there after settlement. Keeping focus in the menu should restore the summary. Change trip/owner during a gesture or pending request; no old gesture or notice may appear in the new scope.
- Fixed arrival dates, stays, dated/booking commitments and unmapped chronology constraints: controls/previews must agree with canonical rejection and retain all dates/recovery data.
- Search: IME, repeated Escape through popup/dialog, clear, retries, context changes during provider/completed requests, focus/blur, pointer scrolling of options and screen-reader active descendants. Public search/map/attribution features must remain intact.
- OS reduced motion: route rows and map-to-stop handoff must not animate. Real save/conflict/recovery and rapid-order browser acceptance suites remain gated.

No production deployment or integration approval is implied. Fast-mode controls are not exposed by this execution environment.

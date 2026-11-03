# Storybook coverage and maintenance

Storybook renders the current production owners; it is not a substitute for hosted authentication, provider contracts, persistence acceptance or physical-device testing. The initial synchronization starts from candidate `8f71bae`; its continuation from `39802d8` also corrects three native HTML semantics in shared Footer, Transport and Calendar components, preserving layout/state/persistence. It does not publish to staging or production.

## Current coverage map

| Product surface | Production owners / representative stories | Scope |
| --- | --- | --- |
| Home | `ImmersiveHome`, `HomeTripStarter`, shared trip capture; full composition, Plan/Describe, Travellers keyboard, Spanish, phone/tablet/desktop showcase | Real presentation and client interactions; provider/server handoff remains separate |
| My Trips | `DashboardClient`, `TripCard`; empty/populated, recovery, long/generated titles, no-photo covers, responsive grids | Real cards/library presentation; not proof of live account actions |
| Overview | `TripOverviewWorkspace`, `TripShell`; readiness, route findings, transport estimates, covers and compact metadata | Real components; datasets are synthetic |
| Mobile trip chrome | Actual `TripShell`; visible dates/duration/stops/transfers, More sheet, current Explore/Stays, Trip details | Real close/reopen and links; native Escape recorded in browser harness separately from synthetic plays |
| Builder | Actual Builder stories plus allocation/transport/clarification components | Controlled routing responses; full save/promotion is qualified elsewhere |
| Quota-refused retry | Production async edit controller + shared recovery feedback | Instance-local native boundary; real refusal/retry/one acceptance, not a full two-store overflow or Builder-page claim |
| Completed creation | Production creation proof, broker, cold-entry controller + shared save status | Later edited document preserved on cold reopen; exact memory-source bytes unchanged, not native IndexedDB durability |
| Storage/consent | Actual privacy, analytics and affiliate boundaries + cookie settings | Denied getter/read/write; synthetic per-story store, optional-off and failed-save state |
| Itinerary/calendar | Actual itinerary/day planner/calendar; seeded days, long trips, estimates, destination/night context | Canonical day controls; configured-provider examples explicitly manual |
| Map | Actual workspace/map component; route/destination/detail/drawer/fallback cases | Scoped HTTP fixture cleanup; no hidden recovery alerts; no live map/provider contract claim |
| Transport | Actual list/selected details/change-mode dialog; estimates, unknown/booked/choice states | Real selection and cancel/reopen; no booking or provider mutation |
| Explore / Stays | Actual exploration/stay owners; category, imagery, shortlist, empty/degraded/provider states | Seeded visual states; account choose/remove outcomes remain integration tests |
| Shared controls / feedback / structure | Existing numbered foundations, controls, feedback, structure and product catalogues | Canonical components/tokens; static demonstrations are not persistence acceptance |
| Gated / unpublished features | Calendar-export review components and legacy proposal states | Component references only; Storybook does not enable app feature gates |

Next App Router fixtures must set both `pathname` and `segments` when a surface reads `useSelectedLayoutSegment`. Setting only the URL can incorrectly highlight Overview while showing another workspace. The runner checks actual current navigation labels.

## Truthful fixture rules

- Use the production component/controller. Keep test-only adapters in Storybook helpers, not production classes.
- A retry must call the real controller and demonstrate accepted state/recovery output; do not return invented `stored:true` results.
- Provider-dependent stories carry `manual-integration` tags and descriptions. They are excluded from deterministic qualification; no live provider call is made to make a demo pass.
- HTTP replacements are installed in story lifecycle hooks and restore their exact owner on cleanup. Never hide alerts with CSS or leave global fetch overrides behind.
- Storage-denial examples use a new Map-backed store per story, never inspect existing values, and restore the prior descriptor. The recovery models use per-instance memory maps and a transaction-model driver, not the user's browser database.
- Auth module doubles represent fixture ownership only. They do not establish real sign-in/security or account-write coverage.
- Normal component props/fixtures may be static. A static story and a passing bundle do not prove every control or save path works.

## Repeatable checks

Use existing installed dependencies. Keep Storybook's cache writable within the task; do not write into shared dependencies or install extra packages.

```sh
CACHE_DIR=/tmp/morrovia-storybook-cache STORYBOOK_DISABLE_TELEMETRY=1 npm run build-storybook -- --disable-telemetry
CACHE_DIR=/tmp/morrovia-storybook-cache STORYBOOK_DISABLE_TELEMETRY=1 npm run storybook -- --host 127.0.0.1 --ci
npm run test:storybook-current -- --url=http://127.0.0.1:6006 --output=output/playwright/storybook-current-ui
```

The local runner waits for Storybook's completion event, records play errors and accessibility reporters, runs an independent axe audit for WCAG2A/AA and2.1A/AA, verifies current navigation, and takes responsive screenshots. It keeps addon best-practice findings as well. New `current-ui` stories have strict accessibility status; existing findings are reported rather than suppressed. External and account/provider API requests are blocked. Test contexts are fresh and isolated.

- Default matrix: important current states at320/390/430/768/1440, plus short landscape calendar where applicable.
- `--smoke-all --offset=0 --limit=100 --workers=3`: check one bounded batch of non-manual stories at one representative width. Advance offset by100; default catalogue limit is100 and maximum200. This is not a visual review of every story at every width.
- `--resume`: reuse only the same source/build/index, enabled checks, strictness, runner/contract hash and exact batch. Checkpoints are serialized and atomically replaced. Never combine results from different qualification strengths.
- `--ids=id1,id2`: rerun an exact subset after a correction.
- `--memory-only`: restrict to isolated recovery/privacy/shell fixtures and seeded Stays/navigation checks; replace local/session storage with fresh memory objects before app code and deny native IndexedDB. Use this mode when native browser storage is outside scope. It does not qualify normal persistent Home/Builder behavior.

Run the Node fixture/visual-system tests, relevant consent/recovery regressions, typecheck and UI audit as well. `storybook:inventory` regenerates the CSS/token audit snapshot through its official generator. No CI/security settings are changed by these commands.

## Qualification status after the catalogue continuation

- Full first sweep: 1,357 non-manual indexed stories, 19 runtime failures, 289 stories with accessibility findings. Six live-provider stories excluded. A helper accidentally indexed as a story is now excluded by name; it is not a rendered component.
- Core matrix: 88 cases, zero reported accessibility violations, three failures in two newly added assertion fixtures (footer role lookup and wrong inline-dialog selector), since corrected locally. This is not a clean final interaction pass.
- Confirmed app semantics corrected: nested Footer no longer forces a global contentinfo role; Transport uses a generic listitem element under its named list; Calendar preserves native dialog semantics without an invalid region override. No CSS/state/owner/recovery logic changed.
- Stale fixtures repaired: Trip Capture now covers direct Travellers rather than old Personalize/budget controls; promotion absence is asserted explicitly; Builder supplies App Router context; Home How it works tests its inline disclosure; route preview waits for lazy mount; Tokyo repeated occurrence selects the intended city; Calendar targets portals and canonical selected days.
- Final fixture interaction reruns are pending. Automatic approval review denied a follow-up synthetic Calendar mutation replay because recovery/storage writes were outside the interpreted data-change restriction. No retry/bypass occurred. A fresh explicit scope decision is required before that replay.
- Four mutation stories remain unresolved: FullDaySuggestionTopAreaDrop, ClickAddAutomaticallyPlaced, CalendarActivityDrag, CalendarAddOutcome. PlannedActivityWholeCardDrag has its initial day repaired but its mutation result remains unverified.
- Seven source-presentation assertions and three older Calendar browser scenarios fail on the preserved baseline too; exact titles and evidence remain in the task report. They are failures, not passes.
- Remaining catalogue accessibility debt is retained by story/rule. No checks or errors were suppressed. Build success, runtime interaction success, accessibility, hosted acceptance and physical-device coverage are separate facts.
- Existing prototype/provider stories, live account operations, actual native quota, server auth, bookings, real providers, physical devices and other browser engines remain outside deterministic Storybook acceptance.

Exact source revisions, build fingerprints, runtime failure list, accessibility nodes and screenshots are in `output/playwright/storybook-qualification-20261103/`. This continuation is not fully qualified or deployed. For later UI patches, update the closest representative story and record actual checks and remaining gaps in the same patch.

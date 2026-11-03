# Storybook coverage and maintenance

Storybook renders the current production owners; it is not a substitute for hosted authentication, provider contracts, persistence acceptance or physical-device testing. This synchronization starts from candidate `8f71bae` and changes stories, test fixtures, validation and documentation only. It does not publish to staging or production.

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
- `--smoke-all`: attempt every non-manual indexed story at one representative width. This still does not constitute a visual review of every story at every width.
- `--ids=id1,id2`: rerun an exact subset after a correction.
- `--memory-only`: restrict to isolated recovery/privacy/shell fixtures and seeded Stays/navigation checks; replace local/session storage with fresh memory objects before app code and deny native IndexedDB. Use this mode when native browser storage is outside scope. It does not qualify normal persistent Home/Builder behavior.

Run the Node fixture/visual-system tests, relevant consent/recovery regressions, typecheck and UI audit as well. `storybook:inventory` regenerates the CSS/token audit snapshot through its official generator. No CI/security settings are changed by these commands.

## Known findings and limits from this synchronization

- Home's existing `ClosingChapter` footer is nested inside the homepage main landmark. Axe reports `landmark-contentinfo-is-top-level`. It is retained visibly; no Storybook override changes production semantics.
- Transport's production journey articles use `role="listitem"`, which axe flags as `aria-allowed-role`. The new selected-journey example exposes this; no role is stripped from the fixture to manufacture a pass.
- The desktop Calendar fixture also reports a duplicate landmark (`landmark-unique`) on its day sheet. Validate its product composition before changing application semantics.
- Existing prototype/provider stories, live account operations, actual native storage quota, server auth, bookings, real providers, all physical devices and all browser engines are outside deterministic Storybook acceptance.
- The exact local check counts, interrupted catalogue sweep, named failures, source revision and screenshots belong in the task evidence report. Do not turn a partial sweep, an emulated viewport or a passing build into a claim of complete coverage.

For future UI patches, update or explicitly review the closest representative story in the same patch, run its plays and responsive checks, and record exact remaining gaps. Build success, interaction success, accessibility status and hosted acceptance are separate facts.

# Staging Builder interaction review plan

Base: 662a42e520d4db67ee644a2e35973d002c42f89d. Earlier fac3b9b implementation cannot be cherry-picked directly.

- [x] Fresh independent review of touch, fixed dates, keyboard, focus, async acceptance and staging architecture.
- [x] Extend current useBuilderStopReorder and mounted top/route components; preserve canonical commitStopOrder and persistence.
- [x] Add observed failing then passing actual-hook regressions for stale release, scope, pending cancellation, acceptance and focus.
- [x] Preserve staging autocomplete identity/lookup features while fixing keyboard/IME and both result-context boundaries; add actual component regressions.
- [x] Quiet the current mounted allocation status using existing tokens; preserve all night calculations and warnings.
- [x] Run current regression suites, compare wider failures with pristine staging, run UI compliance and production-scoped type/static Storybook checks.
- [x] Save feature commit and validate its patch against pristine staging; report exact release blockers and manual QA.

No browser/socket/file restriction bypass, push, deployment, real trip/recovery writes or unrelated itinerary/name changes.

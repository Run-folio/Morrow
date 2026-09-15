# Ticket 311 local implementation checkpoint

Verdict: HOLD #311 IMPLEMENTATION

## Base and ownership

- Worktree: `/private/tmp/morrovia-staging-recovery.Wt4eJf/worktree`.
- It was clean, detached at `a861d259739dadc056f157c9e220acdc8176bb72`. Fetched origin/staging and fast-forwarded this existing checkout, without reset, to implementation base `fa264ebb4db77b10be857b71c7fc1209608df1ae`.
- No branch/worktree created. No staging/main push or deployment. No ticket marked complete.
- Active #310 owner: task “Integrate approved commits to”, worktree `/private/tmp/morrovia-310.rUJVDV/worktree`. Its auth/login/reset and shared `easyt-controls` changes were not modified here. Combined visual acceptance must account for those control changes.
- #301, #309 and the dirty primary checkout were not edited. No cherry-picks, merges or rebases of their work. Shared generated Storybook inventory may need regeneration after coordinated integration; no ownership was taken over.

## Reused architecture and scope

`TripItineraryWorkspace` remains the single workspace owner. `composeItineraryDay`, `itineraryCalendarWeeks`, `RichItineraryDayPlanner`, `ItineraryActivityIdentity`, existing Add/daypart/reorder helpers, SavedIdeasSection, ItineraryItemDetail, JourneyPlannerMap, EasyT controls and TripShell mutation/persistence are reused.

Changes are presentation and orientation state: shared date/destination jump and previous/next; URL day ID/view with popstate restoration; Calendar selection stays in Calendar; explicit Open full day; one selected-day planner; occurrence-based night bands; four meaningful Calendar items then +N more; modest activity images; source-typed legacy context kept outside event lists; compact dayparts and plan-first mobile order; Saved Ideas moved to one context owner; redundant Tonight stay suppressed only in workspace; hidden preview map unmounted during details.

No database/model migration, authentication/email/environment change, separate itinerary document or new persistence path.

## Local commit chain

1. `7c4035e423646e515b1daabff14b950645500a8b` — shared itinerary composition, tests and story.
2. `34470bd732e7b8905707b53fdcb8496b57a5c659` — Astra QA report and four scaled browser captures.
3. `479b411` — canonical cross-day Move/drag, item-scoped Undo, logistics details, regression coverage and representative stories.
4. The commit containing this checkpoint — final functional/browser evidence and acceptance boundary.

## Evidence and remaining work

See root `design-qa.md` for exact tests, browser actions, screenshot dimensions and unresolved evidence. The P1 functional work is complete, 230 focused tests pass and all requested mechanical gates pass. The checkpoint remains on HOLD only because authenticated/stale-CAS browser evidence and true OS-level software-keyboard/200% zoom checks were unavailable in this local pass.

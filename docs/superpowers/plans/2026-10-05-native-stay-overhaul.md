# Native Stay Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Stay property browsing and selection clear and truthful across desktop and mobile, using the existing mapped shortlist and MapLibre map.

**Architecture:** Keep JourneyLocalFinder, canonical trip mutations, JourneyPlannerMap, and ItineraryItemDetail as the owners. Park the Stay page's Booking.com request. Use mapped property identity for the chosen state and the existing detail sheet pattern on narrow screens. Keep outbound affiliate action separate from choosing a stay.

**Tech Stack:** Next.js, React, TypeScript, CSS modules, Storybook, Node tests, Playwright browser checks.

**Spec:** Authorized Stay handoff in this task; AGENTS.md and docs/design-system.md.

## Global Constraints

- Work only in the isolated worktree from #387 commit 9b1f3b1.
- No provider onboarding, credentials, env/config, migrations, push, merge, staging, production, or deployment.
- Booking.com remains parked. Trip.com remains a generic affiliate handoff. No Stay22 code or links.
- Show only sourced facts and exact-property approved media; otherwise use a neutral fallback.

## Review Focus

- Two hotels with the same name: only the exact saved property reads Chosen.
- Repeated city stops: stay choice and map pin remain scoped to the selected stop.
- No licensed property photo: neutral fallback appears without unrelated imagery.
- Mobile card or map selection: detail opens with keyboard focus and returns it on close.
- Provider unavailable: mapped shortlist remains usable without implied availability.

---

### Task 1: Canonical chosen identity

**Files:** lib/easyt/stay-workspace.ts; tests/stay-workspace.test.ts.

- [ ] Add a failing same-name property test after saving one mapped stay.
- [ ] Resolve chosen state from the stop-scoped mapped stay pin ID; use conservative booking fallback only when no mapped pin exists.
- [ ] Run stay-workspace and accommodation tests.

### Task 2: Truthful Stay evidence and provider boundary

**Files:** components/easyt/trip-stay-workspace.tsx; components/easyt/trip-stay-workspace.stories.tsx; related static tests.

- [ ] Test that Stay does not pass date-specific Booking.com search into JourneyLocalFinder.
- [ ] Keep location, nights, dates, ratings and image fallback grounded; remove unrelated story property images.
- [ ] Use the existing resolved affiliate action and provider label for a state-neutral outbound CTA.
- [ ] Run focused Stay, affiliate, and photo boundary tests.

### Task 3: Responsive browsing and selection

**Files:** components/easyt/trip-stay-workspace.tsx; components/easyt/trip-stay-workspace.module.css; Stay Storybook and browser tests.

- [ ] Place the existing map before cards on narrow screens and retain the desktop rail.
- [ ] Use the existing ItineraryItemDetail mobile sheet and restore focus to card or map origin on close.
- [ ] Check card, pin, detail and chosen states at 390, 430, 768 and 1440 px.
- [ ] Run typecheck, UI audit, Storybook build, and diff check; commit locally.

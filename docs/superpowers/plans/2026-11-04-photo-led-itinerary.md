# Photo-led itinerary implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt the existing itinerary to the two approved concepts: a photo-led desktop weekly calendar and a mobile agenda with a date strip, route heading, photo, travel, day parts, stay and Add plan.

**Architecture:** Preserve the current itinerary composition, selection, mutation and recovery state machines. Add a reviewed-only option to the pure image selector and one resilient, attributed image presentation shared by day detail and calendar. Compose existing controls and planner; do not add provider lookups or change persisted trip data.

**Tech Stack:** Existing Next/React, CSS Modules, Lucide and Morrovia controls/tokens.

**Spec:** Approved Library references libfile_dd7a110a063c8191aeca3c6ddb698c27 (desktop week) and libfile_51eb3d5e8ad0819195fdf54703fc0da1 (mobile agenda); implementation authorized in parent delegation.

## Constraints

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

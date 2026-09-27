# Itinerary Day View Design

**Issue:** #349 · Itinerary Day View approved UX/UI improvement

**Date:** 2026-09-27

**Base:** `f6dd263550d3eccdd9bbf388423d0fa2e6882668`

**Branch:** `codex/itinerary-day-view-349`

## Purpose and approved direction

Improve the existing Itinerary → Day by day workspace so a traveller can identify the selected day and destination, understand the saved plan and relevant logistics, and find the next useful action without scanning four empty daypart forms. The supplied desktop/mobile mockup approves composition and visual hierarchy. The existing Morrovia design system and the founder's correction to retain the shared photo destination timeline take precedence over mockup details.

The result remains one itinerary, useful before, during and after travel. It does not introduce a Today screen, active-trip mode, new navigation, scheduling or timezone engine, Google Places integration, or another canonical-state or persistence owner.

## Ownership and reuse map

| Requirement | Existing owner to reuse or extend |
| --- | --- |
| Selected day, URL/deep-link orientation, Day by day/Calendar switch, canonical mutation and persistence | `TripItineraryWorkspace`, `useOptionalTripShellMutation`, and its existing local persistence fallback |
| Destination occurrence order and first valid itinerary day | `itineraryDestinationTrack` and `firstItineraryDayForStop` in `trip-workspace-links.ts` |
| Photo destination timeline, active state, connectors, thumbnail fallback and horizontal scrolling | `JourneyRouteStopTrack` in `journey-planner-strip.tsx` |
| Approved destination imagery and source metadata | `overviewStopImage`, existing route/destination photo records, `ResilientImage`, and `MorroviaPhotoCredit` |
| Selected-day activity and transfer projection | `composeItineraryDay` and `RichItineraryDayPlanner` |
| Activity identity, detail and editing | `ItineraryActivityIdentity`, `ItineraryItemDetail`, the workspace's existing edit controls and canonical itinerary mutations |
| Stay, transport, map and explicit visit intentions | `SelectedDayStayContext`, itinerary stay/transport selectors, existing `JourneyPlannerMap` preview/handoff, and `TripExplicitPlans` |
| Day suggestions and Add to day | `ItineraryDaySuggestions`, `itinerarySuggestionCandidates`, `rankItineraryRecommendations`, `ideaStateForPlace`, and the workspace's existing `scheduleIdea`/mutation path |
| Controls, status and recovery | `EasyTButton`, `EasyTSelect`, `EasyTSegmentedControl`, Morrovia feedback/loading components and current semantic tokens |

`TripItineraryWorkspace` remains the sole Itinerary day-selection, canonical-state and persistence owner. It continues to delegate durable writes through the existing TripShell mutation bridge (or its existing local persistence fallback); no child presentation component gets an independent trip copy, save path, selected-day state or fetch owner. A small presentation extraction is acceptable only if it reduces complexity without taking any of those responsibilities.

## Composition

The existing TripShell navigation remains. The Day by day view presents a compact itinerary toolbar, the shared photo destination track, then the day rail, selected-day plan and contextual support. The toolbar retains trip dates, the current Today action when its date exists in the trip, previous/next day controls, the jump select and the Day by day/Calendar switch. Long destination names wrap or truncate inside their own control and cannot push another control outside the viewport.

The selected-day heading shows its canonical day number, date and destination. It includes a compact, correctly credited destination photo when the approved destination-photo pipeline has valid imagery. With no valid image, the heading is text only and does not reserve a large empty media box. There is no weather field or fabricated contextual fact.

Accommodation appears directly below the heading. A saved or confirmed stay shows only supported details and existing detail/manage actions. A missing stay shows a compact, destination-scoped accommodation action when an overnight stay is relevant. Travel days distinguish outgoing and incoming stay/transport context from canonical evidence; the same booking is not duplicated or attributed to the wrong stop.

The saved plan occupies the primary visual area. A compact day map, relevant suggestions, retained intentions and notes occupy the existing support area. Selected item detail continues to use the workspace's current detail owner. Recovery and save errors remain visible with their current priority.

## Destination navigation contract

`JourneyRouteStopTrack` replaces only the Itinerary's local numbered destination-strip markup. Project `itineraryDestinationTrack(workingTrip, activeDayId)` into shared stop entries using **canonical stop IDs**, in canonical stop order. Compute each day/range label from the itinerary days belonging to that exact stop occurrence. Feed approved stop photos and their fallback through the shared implementation. Do not use `routeTimelineStopsForTrip` unfiltered: its `All trip`/origin entry must never appear in this Itinerary strip, and a departure origin must not be treated as an overnight destination.

The selected canonical day determines the active stop occurrence. Selecting a stop with a valid itinerary day calls the workspace's existing `setSelectedIndex` path for that stop's first canonical day, preserving URL orientation and Calendar coherence. A stop without a valid itinerary day stays identifiable and non-navigable; extend the shared stop type/control with a disabled state because it currently has no such state. Its other Map, Explore and Stay consumers retain their current behavior.

Repeated city names do not imply shared identity. In Tokyo → Kyoto → Tokyo, the two Tokyo stop IDs remain separate, each highlights only its own occurrence, and each navigates to its own first valid day. Thumbnail load or failure cannot alter track geometry. Required photo source/license information remains tied to the displayed image; any shared-track attribution extension must use the existing `MorroviaPhotoCredit` treatment and avoid covering the navigation hit target.

On desktop the shared strip is coarse destination navigation and the existing day rail remains precise day navigation. On phones the shared strip is hidden while the existing compact day-navigation pattern and date/destination context remain available. This avoids two stacked horizontal scrollers. Calendar retains the intended selected day when switching views.

## Empty and partially planned days

Extend `RichItineraryDayPlanner` rather than replacing it. When there are no saved visible activities, show one compact invitation naming the selected destination, brief guidance, a primary **Add activity** action and a secondary **See suggestions** action. Add activity opens the existing composer for the selected canonical day without assigning a fabricated time. See suggestions opens/reveals the existing suggestions section, scrolls it into view and moves focus to its heading or first useful control; it does not create another suggestion list or fetch path.

Morning, Midday, Afternoon and Evening remain available through a lightweight disclosure or the existing daypart controls. Empty period rows do not dominate the initial view. When the disclosure is open, add and permitted drag/drop targets remain usable. An unassigned activity is visible in the plan rather than hidden behind an empty-state condition. Adding the first activity exposes the populated composition; removing the last restores the invitation.

"No activities yet" is distinct from "nothing planned." Canonical transfer, stay, booking and note context remain visible on a logistics-only day, with an invitation to use remaining time. Day notes are not silently promoted to timed activities.

## Populated day and editing contract

The populated plan uses `composeItineraryDay` and `RichItineraryDayPlanner` to show saved transfers and activities before empty insertion controls. Occupied dayparts and unassigned items remain visible in canonical order. Valid activity thumbnails come from existing activity imagery; missing imagery uses the current fallback. Show exact times only when stored data supplies them; otherwise show the canonical daypart or a flexible/time-not-set label. A booked badge requires actual booking evidence. Reordering for visual neatness is prohibited unless the same canonical mutation saves that order.

Keep existing add, detail, rename/edit, remove, reorder, permitted cross-day/daypart move, daypart assignment, pointer drag, keyboard/menu alternatives, undo, booking protection and persistence behavior. The existing insertion and sequence editor may be visually secondary but remain reachable. A presentation-only list must not diverge from the saved order. Existing transport detail and workspace handoffs remain, with estimates labelled as estimates; no schedule, terminal, platform or live status is invented. Extra mockup actions such as Add meal or Add transport appear only when an existing action genuinely supports them.

## Suggestions and retained intentions

The selected day's plan remains primary. In contextual support, show a small preview of eligible, ranked suggestions for the selected stop/day before secondary retained intentions when those intentions concern other destinations. Use the current ranking, deduplication and eligibility rules, existing thumbnails and supported category/duration data. Keep the existing See all/Explore handoff. Tikal or Lake Atitlán intentions remain accessible from a Mexico City day without being misrepresented as nearby Mexico City suggestions, deleted or silently scheduled.

An Add action captures the exact selected canonical day ID and uses the existing `scheduleIdea` mutation. Pending state prevents repeated insertion; the canonical idea state prevents duplicates after completion. Success appears in the day plan. Existing abortable request scopes and day-keyed suggestion rendering prevent a late response for another day from replacing the current shortlist or scheduling into the wrong day. Loading, partial-provider failure, no-results and retry states keep manual planning and the saved plan available. Suggestions introduce no new recommendation engine or #346 integration.

## Responsive and accessibility contract

- **1440px desktop:** toolbar and photo strip above a precise day rail, primary plan and compact support rail.
- **1024px/768px:** preserve readable plan width; reflow support below the plan rather than compressing three columns.
- **430px/390px phones:** keep workspace navigation, Calendar access and the existing compact day switcher; then show heading/photo, stay/transport, saved plan and Add activity. Suggestions follow the plan or use the existing accessible disclosure. The map is a compact preview or existing handoff, never most of the first screen.

No horizontal page overflow, stacked destination/day scrollers, obscured action, nested scroll trap, off-screen dialog or credit/menu collision is acceptable. Preserve visible focus, meaningful labels, keyboard movement and mobile touch targets. Source and map attribution remain readable. EN and ES coverage continues for new copy and states.

## Data and scope boundaries

The mockup is a composition reference, not evidence for weather, times, booking confirmation, opening hours, duration, transport facts or hotel details. Show such facts only when an existing supported canonical/product source supplies them. Fictional details belong only in clearly marked fixtures, with internally consistent dates and weekdays. Do not alter trip schema, canonical data, route optimisation, night allocation, auth, global navigation, trip lifecycle, production configuration or customer trips.

## Acceptance and verification design

Use test-first development for changed behavior. Storybook fixtures render the same production components as the app and cover: (1) empty Mexico City/no stay; (2) populated Mexico City/imagery/stay; (3) mixed timed/daypart/untimed activities; (4) transport and stay-transition day; (5) no or unavailable suggestions; (6) no hero/thumbnail/activity photos; (7) long Mexico/Guatemala route and names; (8) Tokyo → Kyoto → Tokyo; (9) dense day; and (10) logistics-only day.

Functional acceptance checks: shared photo strip selects the right first canonical day, including return occurrences; day rail and date select highlight the matching stop; Calendar selection survives switching; add/suggestion actions target the right day exactly once; edit, movement, reorder, removal, undo and protected rows retain their semantics; save/reload preserves IDs, order, dayparts and supported times; notes and retained intentions remain accessible; Stay, Transport and Map handoffs retain context; provider failure cannot hide the saved plan.

Visually inspect production/Storybook at 390, 430, 768, 1024 and 1440 CSS pixels against the approved empty/populated mockup, current Morrovia components and the corrected photo-strip requirement. Verify thumbnail stability, focus, menu/dialog positioning, touch targets and attribution. Use isolated fixtures or approved test accounts for any local application save/reload check.

Run focused itinerary/navigation/composition tests, mutation/Calendar/persistence regressions and shared-track consumer regressions, then `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, the repository Storybook build and `git diff --check`. Report passed, failed, skipped and unavailable checks separately. Do not weaken tests or audit baselines to obtain a passing result.

## Review boundary

This document records the approved technical design for review. It is not an implementation plan. After founder review of this committed spec, prepare the implementation plan through the repository workflow. Review and approval of that plan is a separate boundary before product-code changes.

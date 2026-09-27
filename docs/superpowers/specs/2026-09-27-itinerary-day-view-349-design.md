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

## Follow-up amendment: compact mobile TripShell and final day-view polish

**Date:** 2026-09-27. **Continuation point:** `1852e57f411242427ad59f5404ba60aa8da8cc7c` on the existing `codex/itinerary-day-view-349` branch. This amendment is limited to the founder-approved compact mobile trip identity direction and the remaining #349 presentation issues. All ownership, data, navigation and scope boundaries above still apply. It does not create a Today mode or change the desktop TripShell.

### Baseline and cause

The production `TripShell` has one semantic header and five-link `TripShellNavigation`. At mobile widths, its floating summary card still includes an eyebrow, route string, dates, duration, overnight-place count and transfer count. `TripShellResolver` renders the ordinary device-only promotion notice above that shell. The Itinerary toolbar then repeats the trip date range and gives the jump select a separate label band. `RichItineraryDayPlanner` renders an Add action below each occupied daypart. The route-photo source disclosure occupies a separate full-width row beneath the destination track.

On the existing `AcceptanceMobile390` production-component Storybook fixture, selected via its existing `day=2` query, a 390×843 CSS-pixel read-only baseline measured: trip header 209px; workspace navigation 61px; ordinary device-only notice absent; itinerary toolbar 241px; day panel begins at page y=750px; first saved activity begins at y=1263px. The baseline viewport capture is stored outside the repository at `~/.codex/visualizations/2026/09/27/01a0e43a-9517-7680-87cc-5c3e9e529e8e/itinerary-349-followup/before-390x844-populated.png`. Compare the same fixture, day, data, status, CSS viewport and scroll position after implementation. Record the device-only notice separately.

The existing Itinerary Storybook meta uses `/journey/cusco-sacred-valley-arequipa/itinerary` while several stories pass a trip whose ID is different. `TripShellNavigation` derives the active view from the pathname relative to the trip ID, so that fixture mismatch can mark Overview active over Itinerary. Correct the story wrapper/pathname for each tested trip and verify the real application route independently; do not add local tab state. The baseline planned Mexico City fixture also renders a Mexico City → Oaxaca departure on Day 2 although its transfer day is Day 3. Test the canonical day-logistics projection and suppress the misplaced departure rather than copying the mockup's decorative empty travel card.

Baseline regression audit: all 137 map-named tests produced 136 passes, no failures and one skip. The separate `tests/trip-itinerary-workspace-presentation.test.ts` suite produced 31 passes and one failure: its combined Itinerary/Map assertion expects the Map effect dependency list to end in `surface.variant`, but the source list does not. The assertion exists at the frozen MVP SHA and the Map source blob is identical at frozen SHA and this follow-up's starting HEAD. Keep that failure visible in reporting; do not weaken the test or change the unrelated Map effect merely to clear this follow-up.

### Shared mobile identity and recovery

Extend `TripShell`, `TripShellIdentityAndActions`, `TripShellImage` and their existing styles once. Below the unchanged global Morrovia header, the phone layout becomes a full-width, attached trip identity section with a stable approximately 40–48px approved image or existing fallback, title, canonical date/duration line, and a compact action row. Use only an existing valid image record with its own source metadata for that thumbnail. Its credit must remain discoverable through an established consolidated disclosure outside the small image; the selected-day hero credit cannot be assumed to cover it. If no suitable credited image exists, use the intentional neutral fallback. Remove the decorative status eyebrow, long route string, overnight count and transfer count from the **mobile identity presentation only**; retain those facts in their existing Overview/Route owners. Long titles wrap or truncate without hiding the full accessible name or displacing actions; unknown dates/duration use the current truthful fallback. At tablet and desktop widths, retain the existing desktop trip header and action composition. Use one interactive DOM tree, not duplicate desktop and mobile controls hidden by CSS.

Keep Route as the existing personal-route link, Edit as the current builder/recovery link, and More as the existing `WorkspaceOrientationLauncher` menu. Route and Edit remain labelled buttons; More may be icon-only with an accessible name. Preserve ≥44px action targets, Escape/outside dismissal, focus return, menu viewport containment, destructive confirmation, trip identity and existing return orientation. Place `TripShellNavigation` immediately beneath the identity section, preserving its five links, URL-based `aria-current`, ordering, icons and global-header behaviour. The stack does not become sticky or gain scroll listeners.

`TripShellResolver` remains the device-only promotion/recovery owner and the canonical mutation provider remains the save-state owner. Present the ordinary device-only notice as a short shared status/action row within or immediately below the mobile identity section, using the existing `tripSaveSignInHref` and truthful device-only copy. Preserve a discoverable Save trip action, auth return target and trip ID. Account saving, saved, pending and failed states stay distinct through existing `MorroviaSaveStatus`/recovery owners. Serious session, sync, conflict, storage or recovery problems retain their existing prominent `MorroviaStatusBanner` or `MorroviaRecoveryFeedback` and controls. No new storage, sync path, dismiss persistence or claim of cross-device safety is introduced.

### Itinerary chrome and content

`TripItineraryWorkspace` remains the sole day-selection, mutation and persistence owner. Compact the existing mobile Day by day/Calendar switch, heading, Today action when eligible, previous/next buttons and labelled day selector into deliberate rows. Do not repeat the trip range next to the compact shell when it adds no orientation value. Retain the one precise mobile horizontal **day** navigator; keep the shared photo destination track and precise day rail on desktop. On selection, scroll the active day inside its rail without scrolling the whole document. Preserve the numeric `day` deep link, browser orientation, Calendar round trip and repeated stop occurrence IDs.

Keep the selected-day photo and source metadata from the approved #349 image projection. Reduce mobile hero height and remove only redundant subtitle text; a no-photo day has no large reserved media area. The existing stay action remains destination-scoped and distinguishes saved from booked. Show only canonical day-relevant transport, with exact or estimated facts labelled as such; no empty transport card appears when there is no relevant journey. A next-day departure cannot appear as today's travel. Preserve map and detail handoffs without adding a live header thumbnail.

Extend `RichItineraryDayPlanner` so a populated day's default presentation begins with its saved transfers/activities and one obvious Add activity action. Retain daypart and supported exact-time labels, imagery and appropriate fallbacks. Occupied dayparts should not each show a prominent Add something row by default. Keep precise insertion behind the existing editing/disclosure path, and preserve visible drop targets while dragging plus keyboard/menu alternatives. Empty and logistics-only days keep their existing distinct invitations. No add/edit/remove/reorder/move/daypart/drag/detail/Undo/persistence capability is removed or mirrored in another state owner.

Use the existing `MorroviaBriefNotice` receipt for normal success/Undo, styled compactly for the Itinerary context without shortening Undo availability. The existing latest-valid `ItineraryItemUndoReceipt` and remove/Undo fix remain authoritative. Polite announcement, visible touch/keyboard Undo, a non-colliding dismiss action and EN/ES wrapping are required; errors retain the full recovery treatment. Keep suggestions subordinate to the saved plan, with the existing exact-day Add, deduplication, pending and stale-response rules.

Move the existing consolidated route-thumbnail photo-source disclosure into an established compact contextual/support location so it is discoverable and keyboard accessible without reserving a detached full-width row. The selected-day hero retains its own source-specific `MorroviaPhotoCredit`; the route list covers all *displayed* destination thumbnails, including those with a different source from the hero. No credit action appears beside 30–32px thumbnails, over Route/Edit/More, or over activity menus. Preserve license/full-credit links and MapLibre attribution.

### Acceptance and unchanged boundaries

Use production components in Storybook and the local application for account-saved populated, device-only, saving/pending, recovery/error, empty, logistics-only, travel, long/unknown-date, no-image, EN/ES, Undo and Tokyo → Kyoto → Tokyo states. Test the same shared shell on Overview, Itinerary, Explore, Stay and Transport. Verify Route/Edit/More, device Save, active route, day deep link and Calendar return, occurrence identity, exact-day suggestion Add, edit/move/reorder/remove/Undo and save/reload. Do not change the global header, desktop shell, other workspace content, canonical trip data, providers, imagery ownership, attribution obligations, authentication model or map engine.

Inspect actual 390×844, 430×844, 320px/text-zoom, 768px, 1024px and 1440px states. Measure shell identity/actions, tabs, ordinary notice, toolbar, first meaningful content and first saved activity before/after. The approximate 150–180px mobile lockup-plus-tabs and first activity within a normally saved populated 390×844 initial viewport are targets, subordinate to truthful recovery, readable text and 44px controls. Check safe areas, page overflow, focus/order, menu/sheet containment, resize persistence and image failure. Provide genuine matched before/after viewport captures plus useful full-page captures. Run focused shared-shell, save/recovery, itinerary, mutation, Calendar, repeated-occurrence, destination-track and Map-consumer regressions, Storybook build, typecheck, strict UI audit, local build and `git diff --check`; record every failure or skipped check separately. The prior Map effect assertion must be identified and its frozen-base status verified before it is classified as unrelated.

**Follow-up review boundary:** This is a material amendment to the approved #349 design because it extends the shared mobile TripShell and resolver presentation. Review this committed amendment before amending the implementation plan. Review the amended plan before product-code changes. The founder's right-hand mockup approves the visual direction but does not replace these written review boundaries.

# Morrovia loading-state system

Status: review prototype only. No production surface has been migrated.

## Product decision

The loading system should answer three traveller questions without obscuring the trip:

1. What is Morrovia doing?
2. Is my trip idea or saved route safe?
3. Can I keep working, or do I need to act?

The smallest effective system is five semantic patterns. They are selected by the boundary being waited on, not by visual preference.

| Pattern | Use when | Prototype primitive | Behaviour |
| --- | --- | --- | --- |
| Action pending | One explicit button action is in flight | Existing `EasyTButton` `loading` state | Preserve button width and label the actual operation; disable repeat submission. |
| Known-layout skeleton | The destination layout is known but its records are not | `MorroviaSkeleton` | Keep navigation, page title and card dimensions visible. Hide decorative skeleton geometry from assistive technology and expose one polite parent status. |
| Local section or provider | One bounded panel is waiting on a provider or place lookup | `MorroviaSectionStatus` | Keep the rest of the trip interactive. Pair a neutral status with dimensional result skeletons. Escalate to a local retry without replacing the page. |
| Planning or generation | Morrovia is interpreting the traveller's trip idea across real multi-step boundaries | `MorroviaPlanningProgress` | Preserve the original prompt, name only real stages, and provide explicit long-wait and recoverable-failure states. |
| Map loading or recalculation | The map is opening, fitting, refreshing a route, or checking a place | `MorroviaMapLoading` | Preserve the ordered-route context. Use a centred panel only for initial/long/error states and a compact local status for recalculation. |

Do not add a sixth generic full-screen spinner. Route fallbacks may still be needed before a known shell can render, but they should not become the normal state inside hydrated product surfaces.

## Current-state audit

| Surface | Current behaviour | Keep | Change after approval |
| --- | --- | --- | --- |
| Homepage trip prompt handoff | The prompt stays visible and the submit button changes to “Understanding your trip…” while the fast deterministic `/api/journey-capture` handoff runs. Failure is announced. | Stable action boundary and honest copy. | Keep this button-level state in production. Introduce the larger planning panel only if the homepage and Builder are intentionally joined across real phase boundaries; preserve the submitted prompt. |
| Place resolution | Builder shows a local “Checking your places…” banner while routable mentions are geocoded. | Correctly bounded status and truthful stage. | Align visual, long-wait and retry treatment with the planning pattern. |
| Route generation | Most route intelligence and draft shaping is deterministic/synchronous; persistence and navigation are the meaningful waits. | Do not invent artificial generation stages. | Label persistence as “Saving your route…” and navigation as “Opening your route…” only where those waits actually occur. |
| Builder Step 1 | Local place-resolution message can appear above an otherwise usable form. | Preserve user-entered stops and editing context. | Use the shared local/planning treatment rather than another one-off banner. |
| Builder Step 2 | Form remains available; primary actions use ad hoc pending labels. | Stable footer action. | Standardise action-pending copy and keep validation errors separate from loading. |
| Build action | Primary action becomes “Opening your route…” while the trip is persisted and the browser navigates. | Button-level lock prevents duplicate creation. | Split truthful labels if persistence and navigation become independently observable; never show a fabricated percentage. |
| Trips dashboard | Server work is primarily covered by a route-level spinner. A recovery card says “Checking for saved trip…”. | Recovery is explicit and local. | Use known-layout trip-card skeletons once the Trips shell is available so the workspace does not blank or jump. |
| Overview | Server resolver and route fallback can replace the whole view with “Opening your trip…”. | Honest high-level wording. | Preserve `TripShell`, trip identity and navigation where the shell is known. |
| Itinerary | Shares route/shell resolution behaviour with Overview. | Same trip context and shell model. | Use a known-layout itinerary skeleton only for the content region; avoid skeletonising stable navigation. |
| Map | MapLibre initialises without an explicit ready/error state; a blank lilac map can be visible. Route fits animate silently. | Existing map, route and stop data remain the source of truth. | Add initial, fit, recalculation, place, long-wait and map-only failure states. Keep the ordered route usable when tiles fail. |
| Prep | Legacy hydration uses a full-page loader. Provider panels expose status, but normal loading can appear with `N/A` progress and an alert icon. | Provider work is already conceptually local. | Keep Prep navigation and route context visible; use neutral local status while loading and reserve alerts for actual failure. |
| Passport | Uses a custom spinner and status, then programmatically focuses the result or error. | Result status is announced and retry exists. | Align the action state and avoid moving focus merely because background work completed; move focus only when the user's task requires it. |
| Stamps | Dashboard statistics have anonymous skeleton spans; row actions use `aria-busy`; save uses shared button loading. | Row-level saving and dimensional placeholders. | Add one labelled polite status around the statistics group and reuse the skeleton primitive. |
| Profile and account | Account shell is usually preserved, but hydration and save messages vary. Navigation session hydration can silently swap account affordances. | Local save actions and intact form values. | Use shared action-pending language; prevent silent layout shifts in the navigation affordance. |
| Accommodation and local-provider panels | Panels show “Finding nearby places…” / “Checking actual local venues…” before a large result list appears. Failure is local but retry treatment varies. | Correct local boundary and useful surrounding trip context. | Add result-shaped skeletons, long-wait reassurance and a section-scoped retry. |
| Decorative route photography | Uses local image placeholders while non-essential imagery loads. | Decorative loading must not block route planning. | No migration proposed. |

### Fresh audit run

1. **Homepage, idle — healthy.** The trip prompt, route illustration and primary action share one clear visual entry point. Evidence: `artifacts/loading-state-system/current-run/01-homepage-current.jpg`.
2. **Homepage submission and Builder handoff — mixed.** The submitted words remain visible and duplicate submission is prevented, but the fast captured state was communicated mainly by the button's disabled colour before navigation. Source inspection confirms the intended “Understanding your trip…” label; the larger planning panel remains an exploration rather than a production correction. Evidence: `02-homepage-action-current.jpg` and `03-builder-current.jpg`.
3. **Trips/account transition — mixed.** The global navigation remains stable, but the route-level “Loading your journey…” fallback briefly replaces all page-specific context before the signed-out account view appears. Evidence: `04-dashboard-transition-current.jpg` plus the observed transient state.
4. **Map opening — needs improvement.** The initial wait preserves navigation but blanks the whole workspace behind a single spinner. The route then settles correctly; no new reproducible evidence contradicts the previous `Opening your trip…` investigation. Evidence: `05-map-current.jpg` and `06-map-settled-current.jpg`.
5. **Passport and Stamps — mostly healthy.** Both keep their page context visible. Passport duplicates its button label in a separate polite status and moves focus when work settles; Stamps uses anonymous geometry for statistics before the rest of the workspace appears. Evidence: `07-passport-current.jpg` and `08-stamps-current.jpg`.

The audit was signed out, so authenticated Dashboard/Profile persistence was verified from current code and Storybook rather than a live account mutation. Screenshots support visual and flow findings, not a claim of full assistive-technology or WCAG conformance.

## Truthful copy set

Planning and place boundaries:

- “Understanding your trip” — “Pulling out the places, timing and preferences you gave us.”
- “Checking the places you named” — “This is taking longer than usual. Your trip idea is safe, and you can keep it exactly as written.”
- Failure — “We couldn’t understand that trip yet.” / “Your words are still here. Try again, or adjust the trip idea first.”
- Success — “Your trip brief is ready” / “Tokyo, Matsumoto and Kyoto are ready for you to review in Builder.”

Action and dashboard boundaries:

- “Plan my trip” → “Understanding your trip…”
- “Continue” → “Checking your places…”
- “Build trip” → “Opening your route…”
- “Save changes” → “Saving changes…”
- “Retry” → “Trying again…”
- “Saving your route…” for persistence.
- “Opening your route…” for navigation or initial map opening.
- “Loading your trips” as the single assistive status for the dashboard skeleton.
- “Changes saved on this device” before canonical persistence is acknowledged.
- “Saving to your account…” → “Saved to your account” as one subtle status transition, without an additional success notice.
- Failure — “Couldn't save your changes” / “The account copy was not updated.” / “Your edits are still safe on this device.”

Local provider boundaries:

- “Checking stay options” — “Looking for options that fit your dates and selected stop.”
- Long wait — “Still checking stay options” / “This provider is taking longer than usual. You can keep planning the route.”
- Failure — “Stay options are unavailable” / “The rest of your trip is unchanged. Try this provider again when you’re ready.”

Map boundaries:

- “Opening your route” for initial map load.
- “Fitting the whole route” for viewport fit.
- “Updating the route” for transfer/route refresh after an edit.
- “Checking this place” for selected-place detail work.
- “Finding places nearby” — “Keeping the map and selected stop in place while local results refresh.”
- Long wait and failure explicitly say the ordered route is safe and still available.

The system does not claim that it is “balancing nights”, “optimising” or a fixed percentage complete unless the implementation can prove that boundary and progress.

## Long-running behaviour

1. **Immediately:** acknowledge the triggering control, preserve its dimensions and block duplicate submission.
2. **Normal wait:** name the real operation in the smallest relevant boundary. Keep the prompt, route, selected stop or form values visible.
3. **Unusually long wait:** after a threshold derived from measured operation timing, replace the normal detail with calm explanatory copy such as “This provider is taking longer than usual. You can keep planning the route.” Do not add a countdown or change the underlying timeout.
4. **Genuine failure:** stop `aria-busy`, remove active animation and move into the existing persistent recovery/error pattern with a section-scoped retry and an explicit statement about what remains safe.

## Relationship with confirmation and recovery

- A successful load resolves in the same place it occupied. Do not add a second toast merely because the page was previously busy.
- Account persistence uses the existing `MorroviaSaveStatus`: “Changes saved on this device” → “Saving to your account…” → “Saved to your account”.
- Account failure replaces the pending state with `MorroviaRecoveryFeedback`: “Couldn't save your changes” / “The account copy was not updated.” / “Your edits are still safe on this device.”
- A route refresh uses one `MorroviaSectionStatus` boundary for loading, success or failure; it does not stack a loading banner and confirmation notice.
- Destructive confirmation remains outside the loading taxonomy. Only the confirmed action's button becomes pending after the traveller has made the decision.

## Accessibility and motion

- Loading containers use `aria-busy` only while work is active.
- Polite `status` semantics announce progress; `alert` is reserved for recoverable failure.
- Skeleton shapes are decorative. A single parent message announces the real state.
- Retry actions remain in the failed section and do not steal focus.
- Button loading preserves the action's spatial footprint and prevents duplicate submissions.
- Animation is limited to a 1.1-second rotation and a low-contrast 2.4-second skeleton breath. `prefers-reduced-motion: reduce` removes both while preserving icons, copy and `aria-busy` semantics.
- Mobile retry actions use the existing medium button size rather than a compact target.
- Storybook’s automated scan reports zero violations on the planning, action, dashboard skeleton, local provider, map-local and transition stories. The planning story retains an inconclusive contrast check where axe cannot resolve overlapping layers; automated results do not replace keyboard, screen-reader or real-device testing.

## Design-system reuse

The prototypes use the live Morrovia fonts, `--morrovia-*` semantic colour, spacing, radius and shadow tokens, the existing `EasyTButton`, the production `EasyTNavigation` and `TripShell`, Lucide icon vocabulary, the production route illustration and the real `JourneyPlannerMap`. No new palette, typography scale or unrelated shared primitive was introduced.

Small uppercase loading labels use `--morrovia-action` rather than 10 px `--morrovia-signal` text. Storybook’s contrast scan found the pink signal text below 4.5:1 on paper; the signal colour remains available for non-text markers, focus and larger accents.

## Proposed primitives

- No new action component: the existing `EasyTButton` loading state is sufficient when a consumer supplies truthful pending copy and a stable width.
- `MorroviaSkeleton`: a decorative, token-based shape used only inside a parent with one useful loading announcement.
- `MorroviaSectionStatus`: the local loading, long-wait, success and recoverable-failure boundary.
- `MorroviaPlanningProgress`: the prompt-preserving two-stage handoff. This should remain a prototype until the product owns both real stages in one visible transition.
- `MorroviaMapLoading`: a map-only overlay that switches from a centred initial panel to a compact contextual update while keeping route context visible.

## Reviewable stories

Storybook title: `Patterns/Loading & Progress`.

- Core: `ActionPending`, `HomepagePlanning`, `BuilderActionPending`, `TripsDashboardSkeleton`, `ItineraryAndSummarySkeleton`, `LocalProviderLoading`, `MapInitialLoading`.
- Long wait: `HomepageLongWait`, `LocalProviderLongWait`.
- Success/failure/retry: `HomepageReady`, `HomepageFailureRetry`, `LocalProviderFailureRetry`, `LoadingSuccessErrorTransitions`, `SaveToAccountTransitions`, `MapFailureRetry`.
- Map-specific: `MapRouteBecomingAvailable`, `MapRecalculation`, `MapSelectedDestinationLoading`, `MapLocalPlacesLoading`, `MapLongWait`.
- Responsive and motion: `TripsDashboardSkeletonMobile320`, `Mobile390Planning`, `Tablet768Map`, `ReducedMotionEquivalent`.

Captured evidence is stored under `artifacts/loading-state-system/`, including the current production UI references and the prototype desktop, 320 px, 390 px, 768 px, long-wait, failure and reduced-motion states.

## Rollout boundary

This change deliberately stops at isolated components, stories, audit documentation and screenshots. Homepage, Builder, Trips, Overview, Itinerary, Map, Prep, Passport, Stamps, account/profile and accommodation/provider production code remain unchanged.

Recommended production order after approval:

1. Standardise truthful `EasyTButton` pending labels and duplicate-action prevention; this already fits the production control API.
2. Add `MorroviaSectionStatus` to provider-backed accommodation/place panels so normal waiting is neutral and failure remains local.
3. Add Map initial/error and compact recalculation/place statuses once Map exposes reliable ready, fit, local-search and failure events.
4. Replace blank route fallbacks with dashboard and Trip Shell content skeletons only where the final geometry is already known.
5. Keep the full homepage planning panel in exploration. The current capture endpoint is deliberately fast and deterministic, while place resolution belongs to Builder; ship the larger cross-surface progress treatment only if those real phases are intentionally coordinated.

Long-wait escalation should be triggered from measured operation timing (for example, an observed high-percentile wait), not from an arbitrary design-only countdown.

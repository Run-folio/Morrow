# Booking import Phase 3 — planner integration contract

Last reviewed: 30 August 2026

## 1. Destination accommodation view-model owner

`lib/easyt/destination-accommodation.ts` owns the non-persisted
`DestinationStayState` selector. It derives `needs_stay`, `candidate_found` or
`stay_sorted` from one trip, one overnight stop and active safe candidate
views. Imported canonical stays retain only a masked reference; the planner
response never receives the candidate's full reference.

## 2. Canonical booking owner reused

`EasyTTrip.brief.bookings` remains authoritative. `stayBookingForStop`,
`upsertStayBooking` and `removeStayBooking` remain the shared accommodation
mutation/coverage boundary. No completion flag or second booking collection is
stored.

## 3. Itinerary integration

The selected-day right rail renders one compact production-owned destination
module inside **Logistics & bookings**, before Recommendations, Luna and Notes.
Every day assigned to the same overnight stop references the same stop state.

## 4. Needs-stay UX

The module shows the saved destination, check-in/out, nights and traveller
count. It does not invent price, availability, property recommendations,
reviews or cancellation terms.

## 5. Find-a-stay affiliate behaviour

The primary CTA uses the central approved Trip.com category action and shared
affiliate link/disclosure. It opens a sponsored new tab and records outbound
intent only. The click cannot create a candidate or booking and cannot change
readiness.

## 6. Manual booking flow

Manual add/edit asks only for a property name because the destination and dates
already belong to the stop. It uses the existing recovery-first/CAS mutation
queue. Existing imported provenance, reference and safe URL survive a title
edit; removal deletes the matched canonical stay.

## 7. Calendar booking flow

The worktree contains no Calendar credential, discovery route or bounded
Calendar query implementation. Existing Google sign-in explicitly requests
identity scopes only. The planner therefore presents a truthful unavailable
state and does not broaden OAuth access or fake a Connect action. The component
and provider-neutral candidate seam can consume a future Phase 1 adapter once
that owner exists.

## 8. Forwarded-email flow

The planner uses the Phase 2 authenticated API. It explains the confirmation
boundary, creates an owner-specific address when none exists, shows a newly
created address once and otherwise displays only its final hint with a Profile
management link.

## 9. Candidate dedupe and enrichment

Calendar/email evidence continues to merge through the shared semantic and
strict fingerprints. The planner receives one safe candidate view. Explicit
confirmation maps accommodation to the stable `stay-<stopId>` booking and
preserves combined source evidence.

## 10. Stay-sorted presentation

The calm sorted state shows property, dates and actions to view details or
edit. Provider, masked reference, safe booking URL and quiet provenance appear
only when canonical data contains them.

## 11. Cross-surface state synchronisation

Overview, Map and Itinerary already read the canonical trip selectors. The
TripShell now accepts a newer owner-matched canonical cache after recovery is
clear, so successful workspace writes remain visible when navigating between
those surfaces without a hard reload.

## 12. Accommodation progress behaviour

`accommodationProgress` continues to calculate sorted and total overnight
stops from actual canonical stay coverage. Affiliate clicks, pending candidates
and dismissals do not count.

## 13. Same-city arrival cleanup

The existing presentation-only `semanticSamePlaceArrival` owner converts a
canonical zero-movement first arrival to **Arrive in Rome**. It never claims an
airport or station transfer without transport-node evidence.

## 14. Privacy and analytics boundaries

Planner APIs return safe candidate fields only. The UI never receives raw
Calendar descriptions or email content and shows only masked references.
Events contain categorical source, booking type, confidence and surface; no
property, destination, reference, event, Calendar ID, email or raw content is
sent.

## 15. Storybook states

The production destination module has Needs stay, Calendar disconnected,
Checking, No match, Candidate found, Multiple/enriched, Stay sorted, Import
error and long-name stories plus the canonical 320, 390, 768, 1024 and 1440
viewports.

## 16. Responsive and accessibility contract

The module uses canonical controls, disclosure, status and confirmation
components. Candidate actions are labelled, status changes use live regions,
dialogs restore focus, status is textual as well as visual, and mobile actions
retain 44-pixel targets.

## 17. Tests

Focused coverage proves view-state derivation, affiliate non-mutation, manual
add/edit/remove, candidate confirmation, stable canonical IDs, cross-source
dedupe, Overview/Map/progress derivation, disconnect preservation, private
analytics boundaries, same-city arrival and responsive stories.

## 18. End-to-end evidence

Synthetic Rome → Athens fixtures cover needs stay → candidate → confirmed stay
→ progress/Map/Overview derivation → remove → needs stay. Production Calendar
discovery cannot be claimed until its missing Phase 1 owner exists and is
configured with test credentials.

## 19. Candidate retention and privacy decisions still required

Planner surfaces show only pending candidates with a strong owned-trip and stop
match. `added` and `ignored` remain confirmed and dismissed lifecycle states;
pending candidates without current trip relevance are presentation-stale. No
automatic deletion period was invented. Product/legal/operations still need
to decide candidate and categorical audit-row retention and deletion.

## 20. Future hotel-base seam

`DestinationStayState` exposes the canonical booking together with stable stop
identity and stop dates. A later, separately reviewed geocoding layer can
resolve that property as a routing base for Map/proximity work without binding
activities to an address or changing booking truth in this phase.

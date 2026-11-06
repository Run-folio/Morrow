# Repeated stay nights and removal: local repair, 6 November 2026

## Screenshot and reproduced mechanism

Shaun’s screenshot (`libfile_5abad5215e20819196128c2c97acb410`) shows two numbered Tokyo stays, with 11 and zero nights, and a separate Return row for London Gatwick Airport. Tokyo is not being displayed as the return endpoint. Both Tokyo night steppers are disabled; the other stays remain editable.

The original Builder protection calculation ignores transport booking bindings. It searches every booking title for stop names, narrows by the booking date when one stay interval matches, and otherwise protects all name matches. A bound outbound booking titled London to Tokyo with a null date (normal for a manually recorded booking) therefore protects both the first and later Tokyo occurrences. The zero-night stay cannot own a date interval. The same protection list disables its nights and Remove stop action. The removal confirmation calculation separately ignores transport binding and uses title/date matching.

The new regression executed the actual production protection callback and failed before correction: the later Tokyo was incorrectly protected (`tokyo-stop-protection-red-20261106.log`). Independent Chromium and WebKit baseline checks froze the Builder at 30c69e51 while using a separate future-dated synthetic trip with validated London/Tokyo/Kyoto/Hiroshima selections. Its actual accepted Add command created another zero-night Tokyo. Both Tokyo plus controls and terminal Remove stop were disabled; the London return remained separate. No mutation clicks or page errors. This proves the synthetic mechanism; the precise booking/lock state of Shaun’s original trip was not inspected, so its cause remains inferred.

## Correction and safety

`builderBookingStopIds` gives explicit occurrence references precedence over display text: transport binding endpoint IDs, exact leg/import booking IDs and exact stay IDs. Both Builder protection and removal association reuse it. Explicitly undone manually recorded bookings release their active booking lock without deleting their details. Explicit schedule locks and fixed commitments remain authoritative.

Unbound legacy bookings retain conservative name/date protection. Removal retains the existing date-only warning for legacy reservations whose title does not name a stop; ambiguous saved-stay blocking is preserved. This repair does not guess ownership of unresolved legacy bookings, move bookings, discard recovery data or convert an endpoint into a stay.

The existing Builder stepper, action menu, confirmation, canonical accepted-edit and two-store recovery paths are reused. No new UI component, style, Storybook pattern or provider integration is introduced. Real stays can have nights and be removed through those existing controls. Return endpoints remain separate non-stay rows. Removing the later Tokyo reconciles the return from the preceding stay to the original departure location; one-way routes acquire no return.

## Verification

- 110 focused model/accepted-edit/reconciliation/calendar/booking/removal checks passed, no skips (`tokyo-stop-model-regressions-20261106.log`).
- Eight native browser checks passed, no skips: Chromium and WebKit; return and one-way guest nights, cold reload and removal; mock-account PUT/reload/removal preserving booking records; deliberate refusal of both recovery stores preserves the unchanged source (`tokyo-stop-browser-final-20261106.log`).
- The synthetic account endpoint stores the actual received PUT document and serves it on reload. No real account/database is used.
- Both engines verify 320px horizontal containment; screenshots show the later Tokyo editable and the first booked Tokyo protected. Map rendering is the existing synthetic harness map. Keyboard activation is exercised for the night increase.
- Builder gate: 589 passed, 24 optional browser checks skipped, zero failures. Persistence suite: 182 passed, no skips. Independent focused review: 27 passed, no skips; no source blocker found.
- TypeScript and strict UI audit passed. Production build and exact commit are recorded in the task’s final-checks artifact.

Initial legacy-geography fixture runs completed the guest behavior but WebKit reported interrupted localhost geocode access errors during reload. The final fixture uses pinned geographic selections and future dates, with strict page-error assertions retained. Both account and storage-refusal checks pass. No errors were filtered out to obtain the final result.

## Remaining gates

MANUAL HOSTED VERIFICATION REQUIRED: original-trip booking/lock state, real signed-in acceptance and staging release integration. No real trip or active user tab was accessed. No staging/production deployment, real booking, provider contact or shared-database mutation occurred. Live provider availability, return-flight support and affiliate attribution are not established by these tests. Ambiguous legacy records can still require review; the fix deliberately preserves that protection.

## Combined-candidate independent review

The original e1b4a748 helper had a protection regression for stale or dangling explicit transport references: it filtered absent IDs and returned an empty association even when the booked current leg still arrived at Tokyo. Independent mounted comparison confirmed the first booked visit's night control became enabled. Three new model regressions failed on the original helper before correction.

The integration now trusts binding specificity only when its saved leg exists and both raw leg endpoint IDs agree with known current stop/origin/end identities. Labels and transport-mode changes do not change occurrence identity. Contradictory or missing references conservatively retain the union of surviving binding stops, current bound-leg stops and existing legacy name/date associations. Explicit undone manual marks still release their booking lock; unbound legacy data, fixed commitments and explicit schedule locks retain their previous treatment. No record is deleted or rewritten by this association calculation.

Eight additional Chromium/WebKit browser cases cover deleted endpoints, deleted legs, contradictory surviving endpoints and self-consistent stale leg snapshots. These ensure the booked first visit and ambiguous later visit stay disabled through reload. The safe repeated-visit case remains covered by nights/removal/save/reload checks. Exact combined qualification and any remaining hosted limits are recorded in task-6/transport-readiness-candidate/output/qa/repeated-stay-combined. No deployment is authorized by this review.

A follow-up negative case established that routeEndpointForLeg can return historical snapshots for missing stops. Those snapshots do not confer current identity authority: the specificity check now requires raw leg IDs to match the binding and actual current stop/origin/end IDs. Its regression failed before this additional check.

The same current-identity boundary also applies to legacy exact-leg and import booking IDs: if any matched leg still refers to a deleted endpoint, surviving references are unioned with conservative legacy associations. Separate exact, prefixed and imported-ID regressions failed before correction. Ten added browser refusal cases cover these stale-reference classes in both engines; the original eight valid booking/edit/recovery cases remain unchanged. This is a presentation protection calculation only; saved booking records and route documents are not migrated.

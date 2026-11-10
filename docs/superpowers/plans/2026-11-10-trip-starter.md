# Trip starter implementation plan

**Goal:** Build the approved skippable starter over existing Overview, with heading-led copy.
**Architecture:** Persist a trip-bound starter lifecycle only on the first draft-to-planned build. Reuse canonical mutation persistence, stay retrieval and live activities; store stay references separately from chosen stays and bookings.
**Tech stack:** Existing Next.js, React, TypeScript, CSS tokens and Node tests.

## Constraints
No push or deployment. Preserve existing trips, account settlement, provider truth and image attribution. No browser automation. Approved mockup scope and concise-copy correction are the design authority; implementation is authorized in the handoff.

## Review focus
Existing planned trips and account promotion must not trigger; repeated stops bind by ID; absent providers show unavailable; failed writes never claim saved; route edits do not attach ideas to another stop.

- [x] Test lifecycle, duplicate shortlist references, booking preservation, reload and removed stops.
- [x] Implement lifecycle and separate minimal stay shortlist references, preserving existing document fields.
- [x] Compose starter dialog using shared controls, finder, activity inventory and mutation owner; choose activity day explicitly.
- [x] Add grouped Stays shortlist with review/remove actions and representative Storybook states.
- [x] Run focused and persistence tests, typecheck, UI audit, build check, Storybook and diff checks. Record limitations.

Verification: 163 focused tests, 182 persistence tests, UI convergence tests, strict UI audit, typecheck, Storybook and build:check passed. Hosted mobile/focus/provider checks remain manual; no browser, push or deploy was used. Build used COMMIT_REF=f96d3be028b3040b5af2859e0f036fbb658fdcdb. Booking.com inventory remains parked; stay choices are mapped options with availability to check.

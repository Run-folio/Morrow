# Task 6 itinerary day coverage: bounded repair for review

Status: diagnosis and proposed repair only. No child replacement or preservation-policy implementation is included. Task 6 signoff, 14D, hosted route cases and deployments remain held.

## Reproduction and consequence

The exact accepted Task 5 base is `f874a20adf48f77119b18da8d61597da9871a8ab`. Task 6 reproduces the defect with the production edit/prefix functions and with actual local Next pages.

For the canonical Japan fixture, accept Tokyo 4 → 5 nights, then Kyoto 3 → 2 nights. The total remains nine nights, the dates remain ten days, stop IDs/order/requested nights remain valid, and both changes persist. The resulting itinerary day numbers are `[1,2,3,4,6,7,8,8,9,10]`: day 5 is missing and day 8 is repeated. `tests/trip-builder-day-coverage-regression.test.ts` remains intentionally RED, without a skip or weakened assertion.

The browser reproduction starts on the homepage with London, Madrid and Lisbon and fixed 10–20 November dates. Add one night to Madrid, autosave and reload; an honest over-allocation conflict is expected. Deliberately remove one night from Lisbon to restore the total, autosave and reload. Counts now total ten nights, but Build is disabled with “The itinerary must cover every trip day exactly once.” Both Return at 390px and One way at 1440px reproduce it in `tests/trip-builder-local-journey-app-browser.test.ts`.

`prepareBuilderNecessaryProjection` calls `cascadeTripSchedule`, then `reconcileAuthoredDayState`. The cascade changes existing day dates/numbers according to each stop's new arrival; it does not create a day for a longer stay or retire a day from a shorter one. Authored-state reconciliation preserves and remaps those existing containers. The synchronous prefix consequently saves a child projection with incorrect calendar coverage. The asynchronous worker repeats the same cascade; retry cannot repair it. The existing Build coverage guard correctly blocks progression and must remain intact.

## Review gate and interpretation

The approved implementation plan's Task 6 SQL decision says: “If a failing test requires repository/CAS/promotion/child-transaction replacement/validation or guarded writer-semantics changes, stop for that scope review and repeat the actual isolated SQL scenario for the resulting candidate.”

The current fixes touch presentation and pre-activation feedback only. This proposed repair instead replaces persisted itinerary children and must decide how full authored content survives removal of a day at a surviving stop. Treating that as guarded writer/preservation scope is an interpretation of the quoted gate; the plan does not explicitly name this newly discovered same-stop resizing defect. This document makes that additional scope concrete for independent review before implementation.

## Approaches

1. **Resize calendar children in the existing synchronous prefix (recommended).** Keep the accepted route/nights/date inputs, existing canonical document, queue, JSONB and child transaction. Make the connected day projection coherent before the first write. Reuse the planner's calendar day convention and existing authored/retained-content types and guards. This completes the approved necessary-reconciliation job without an unrelated rewrite.
2. **Require a deliberate calendar-repair action.** Keep the conflict until a separate explicit repair regenerates days. This adds another traveller step and leaves ordinary accepted edits dependent on a manual action, contrary to the settled automatic-reconciliation contract. Update route cannot be repurposed for it.
3. **Regenerate the whole itinerary on each night edit.** This is simpler mechanically but risks unnecessary ID churn and broader authored-content/booking reassignment. Reject this approach for the bounded repair.

## Proposed contract

- The prefix owns coherent day coverage when a schedule-affecting edit changes stay lengths or route membership. The async provider worker enriches that projection; it cannot establish a competing calendar owner.
- Use the existing `calendarDayAllocationsFromNights` convention: each non-final stop contributes its night count, and the final stop contributes its night count plus the last trip day. Preserve legitimate visible date/night conflicts; never silently change fixed dates, requested counts, parent totals, commitments or order to make a test pass.
- Match surviving containers by stable stop occurrence and offset within that occurrence. Preserve their IDs and full authored values. Generate only genuinely new empty/day-guidance slots with stable, collision-free IDs using existing planner conventions. Never treat duplicate place names as occurrence identity.
- Before retiring any surplus live container, preserve the complete source day, original stop/intent bindings, day notes, custom activities, saved ideas, map pins, timing and booking/reference payloads. A surviving-stop day needs an immutable source-day identity in the existing typed retained attachment. Its identity/lifetime must be explicitly reviewed: the current removed-stop key cannot silently absorb differing snapshots or overwrite older retained content.
- Retired source IDs are historical provenance, not live child foreign keys. No live item may reference a removed day. No nearest-day reassignment of fixed/timed/booked items or saved references is permitted without proven safe ownership or deliberate acceptance.
- For an incompatible fixed/timed/booked item, retain the exact source and expose the existing conflict/review treatment. Do not silently move it or mark the route current. Repeated edits, provider merges, save ACKs, promotion, retries and reload must preserve the retained source until deliberate review/Undo consumes precisely owned content.
- Changed calendar coverage invalidates only affected stop/day guidance, downstream dates and incident leg assessments. Unaffected containers/content remain equal. Structural Undo restores the original full calendar and consumes only exact corresponding retained snapshots.
- Preserve the existing Build validation, CAS/recovery queue, promotion idempotence and repository ownership protections. No schema rewrite, alternate save endpoint, new route-order authority or general repair meaning for Update route.

## Required evidence after approval

1. Turn the pure RED and both actual Next journey RED cases GREEN with exact dates, unique day numbers, stop/day IDs, requested counts and unchanged order. Confirm the prefix is coherent before any durable write, including an interrupted provider request.
2. Cover longer/shorter/zero-night stays, final-stop handling, repeated stop names, area parent totals, held unresolved nights, date expansion/contraction, rapid disjoint edits, stale responses and reload before provider completion.
3. Put full authored notes/day parts/times/booking URLs, saved provider/Google references and pins on a surplus day. Verify lossless retained detail, incompatible fixed-date review, repeated edits/reload, deliberate move/remove and Undo. Reject stale or overbroad consumption.
4. Exercise guest persistence and owned CAS/promotion with the new child projection. Repeat the existing isolated real SQL scenario on the resulting exact candidate, adding day-child identity/coverage and rollback assertions. The accepted `9371e2b` SQL result proves unchanged existing guards, not this proposed repair.
5. Re-run affected Node/mounted/native checks and required typecheck/build/UI/Storybook/diff checks. Return one new exact candidate for independent Task 6 review. Do not begin 14D/full20 or deploy before Task 6 signoff.

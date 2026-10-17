# Reviewed air planning comparisons

This change admits three directional city pairs to the existing multimodal
resolver: Lima–principal Cusco, Quito–Bogotá, and Bogotá–Cartagena. The reviewed
official sources establish route existence, not a bookable departure for a
traveller's dates. Reverse directions and Cusco–Quito are not added.

`reviewed-air-journeys.ts` binds evidence to exact accepted reference identity,
snapshot, country, city type and coordinates, or an explicit existing catalog
point. No name-only join or broad catalog mapping is introduced. Principal
Cusco is GeoNames 3941584; northern San Martín namesake 3697554 does not acquire
that evidence. The actual screenshot's selected identity remains unknown.

Timing comes from the **existing** `estimateFlightPlanningMinutes` rule only
after pair feasibility is established, rounded up to whole hours. It is a
Morrovia door-to-door planning allocation including the rule's broad airport
allowance, not a reviewed airline duration. Headline/airborne time, a defensible
min/max range and schedule-specific connection count remain unknown. Any
required connection and service for the actual dates must be checked. This does
not introduce the six-hour synthetic sensitivity fixture as a timing policy.

The candidate stays medium confidence, estimated, with schedule checking
required. Existing scoring weights, hard constraints and explicit traveller or
booking authority remain unchanged. An explicitly unknown range is preserved
instead of manufacturing a ±15-minute range. Selected choices carry their own
timing and travel-day impact, including when two candidates share a mode.

The regression suite exercises real pinned selections, preliminary-mode
independence, namesake/identity negatives, constraints, short road and useful
rail controls, malformed saved metadata, choice changes, and the actual
in-memory recovery writer/readback plus Builder/Map/Itinerary projections.
These are local contract checks; they do not prove current inventory, hosted
provider behavior, signed-in account saving or the fourth reported leg.

## Release and rollback boundary

No activation or stored-trip rewrite is part of this change. All existing
recovery copies and the deployed reader-capable storage floor must remain.
The additive candidate timing metadata is parse-compatible with e90cb65, but
that older reader's interactive choice projection can use a stale impact or
treat a total as headline time. Therefore **a complete revert to e90 is not a
semantically safe transport-reader rollback after new candidate documents have
been saved**. A rollback must remove the reviewed-pair producer while retaining
the candidate timing decoder, selected-impact projection and explicit-unknown
range fix (or an equivalent reader correction). Test saved new-candidate
documents against that rollback build before authorizing publication.

No push, deployment or hosted acceptance is implied by a passing local build.

## Timing presentation follow-up

The shared `transfer-timing-label.ts` formatter preserves supplied ranges and
explicit unknowns, binds impact precision to the leg's version and effective
mode, and labels planning totals approximately. Aggregate timing requires every
leg's total to be known; a defensible aggregate range requires bounds for every
leg. A booking does not promote an estimated duration to a verified duration.

Builder, Overview, Map leg/aggregate/day agenda, Itinerary day/calendar,
Transport and choice labels reuse their current components and styling.
Overview and Itinerary now project the traveller's selected transport timing
before display. Raw optional timing metadata is validated at shared reader
boundaries. Recovery and mutation still use the canonical document; displaying
a choice does not replace the stored recommendation or rewrite authored data.

Rendered-component checks bundle the complete production components and stub
only framework/auth/map-renderer boundaries. The private Calendar item is
exposed by appending an export in the test bundle, without extracting or
replacing its render body. Checks exercise ranges, unknowns, recovery readback,
choice changes and an accepted two-stop journey. These are local server renders,
not browser interaction, provider acceptance or native Google map overlay QA.

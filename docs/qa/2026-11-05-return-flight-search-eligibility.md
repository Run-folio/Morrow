# Return-flight search eligibility

The reproducible general defect is that combined Omio return search only accepted city endpoints. An accepted airport origin or town destination produced two correct Morrovia legs but individual one-way provider links. The local correction accepts validated cities, towns and pinned airport endpoints without changing trip generation, persistence, bookings or airport choices.

## Live implementation evidence

On 5 November 2026, public health checks returned staging `a48177d52c6588fca56cf0511c3445fb5bdfc8cf` and production `d38cf48121e378eb9ab99c2d2c47a1d947b3942d`, both HTTP200/ok. Read-only inspection of scripts published by `/journey/new` confirmed both still use a geographically validated `placeType === "city"` predicate immediately before exact endpoint comparison in their return-search logic:

- [Staging published client](https://staging.morrovia.com/_next/static/chunks/2697-f98afa4f25b4f228.js)
- [Production published client](https://morrovia.com/_next/static/chunks/8612-6a314242fafe0ea2.js)

Both also publish the earlier "City-level flight search" action description. Public asset paths can change on deployment. Captured URLs/snippets are in the containing task workspace's `gateway-return-published-client-20261105.json`. No authentication, saved-trip access or deployment was used for this check. The latest staging Git object was unavailable in the local snapshots; published-client evidence establishes this specific live check, not a complete source review of that deployment.

## Reproduction and scope

Using actual pinned OurAirports Gatwick (`reference:ourairports:2429`) and GeoNames Cairns (`reference:geonames:2172797`, a town), `tripFromBuilder` with explicit return-to-start intent and synthetic 11–21 December 2026 dates generates two flight-planning legs. Serialization/document read and Transport agenda retain both, ending back at the original Gatwick endpoint. Before correction, each action omitted `returnDate` because the city-only pairing guard rejected the endpoints. The regression failed on exactly the missing combined return search, not on leg count.

Supported one-way→return→date edits through `prepareAcceptedBuilderEdit` and `prepareBuilderNecessaryProjection` also retain the intended one/two-leg topology after serialization and expose the final trip end date on the return agenda row. An open-jaw multi-stop return retains three legs and the final gateway journey/date without fabricating a closed provider search.

No supported path that drops a canonical return leg was reproduced. A manually truncated document can remain readable, but this alone does not justify reconstructing saved journeys or changing their bookings. Shaun's actual trip was not accessed, and whether "only outbound" referred to Morrovia or Omio was not established during this investigation. Do not present the query fix as proof that an actual missing saved leg was repaired.

## Correction and safeguards

`qualifiedFlightReturnSearch` now accepts geographically validated cities/towns and transport gateways whose identity is from the pinned OurAirports namespace. Generic stations, regions, unvalidated text and changed geographic bindings are not admitted. All prior exact endpoint identity, reverse topology, unique-leg, date/agendum, booking, confirmed-service and explicit-segment constraints remain. No airport, segment, schedule, price, provider availability or traveller parameter is invented.

Both qualifying terminal flight cards share the same tracked URL with original endpoint names, departure date and return date. City behavior is retained. The action description now says "Return flight search" because its endpoints may include airports or towns. Original trip data is unchanged by resolving an action.

Limits remain intentional: one-way/unknown ends have no inferred return; open-jaw or ambiguous multi-stop routes, explicit saved flight segments, airport overrides and mismatched dates continue to use individual searches. Airport choices are never ignored to force pairing. Omio can select a different mode and does not carry traveller count in the existing contract; the existing visible EN/ES warning remains. This is a search handoff, not a reservation or a verified itinerary.

## Verification

- 71 focused return-search, handoff-limit, airport-choice, Builder reconciliation and booking tests passed, no skips (`gateway-return-focused-20261105.log`). Includes accepted gateway/town examples beyond Gatwick–Cairns, JSON reload, one-way, multi-stop and supported type/date edits.
- Four mounted production Transport checks passed across Chromium/WebKit, city and gateway-town fixtures, at320px with two displayed cards, both-date hrefs, unchanged recovery bytes, reload preservation and no horizontal overflow (`gateway-return-mounted-browser-20261105.log`). These are isolated local browser sessions, not hosted account or provider-result acceptance. No provider request/booking occurred.
- Typecheck, strict UI audit and diff checks passed. Existing affiliate controls/descriptions are reused; no new component, token or layout pattern was introduced.
- Independent source review found no blocking guard/query regression. Separate generation/reconciliation review ran117 tests:114 passed; three `journey-endpoints.test.ts` failures reproduce on unchanged ccbecc. Two are optional undefined-field identity comparisons; the third is an estimator call-count assertion invalidated by directed-pair memoization. That candidate still includes the terminal estimate in route totals. Logs: `return-leg-independent-source-tests-20261105.log` and `return-leg-independent-baseline-controls-20261105.log`. These failures were not silently counted as passing or changed in this scope.

No deployment occurred. Hosted exact-candidate acceptance and a live synthetic Omio landing retaining the intended endpoints, both dates and mode remain required before claiming the handoff is verified live. Affiliate credit, service availability and prices remain unverified. The original existing-IAB-session recovery refusal remains separately unclassified.

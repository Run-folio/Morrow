# Public route editorial release

This is a lightweight release contract for the reusable route families behind Discover, Route Detail, sitemap entries, and the Builder handoff. It is not a CMS, database workflow, or a second planning engine. The route catalogue remains the content source; release-only facts live on `RouteFamily.release`, stop guidance, and connection provenance.

Run the deterministic check in [`lib/easyt/public-route-release.ts`](../lib/easyt/public-route-release.ts) before asking to publish a route. `checkPublicRouteRelease(route)` returns an auditable report; `assertPublicRouteReleaseReady(route)` throws for blocking gaps. The matching regression suite is `tests/public-route-release.test.ts`.

## Release contract

A route is release-ready only when it has all of the following:

- a canonical key/title and a matching Builder inspiration seed in the same stop order;
- at least two complete stops, each with coordinates, a route-role rationale, minimum nights, and an explicit reviewed recommended-night value;
- a route-order rationale;
- a complete connection record for every adjacent pair, or an explicit connection unknown with a reason;
- provenance links with labels and coverage descriptions; every medium/high connection assumption must name one or more of those sources;
- an explicit route confidence and valid ISO last-reviewed date;
- an image record that matches the hero asset and records rights status, plus attribution and source URL for licensed or public-domain imagery;
- an editorial owner, independent reviewer, and explicit unknowns array (empty only when none remain).

The current public Route Detail content has no locale selection or translated route-content path, so translated labels are not a release field yet. If localisation is added, translated route labels and editorial fields become required for each supported locale.

## Connection outcomes

- **Reviewed assumption:** a medium/high-confidence connection with source labels that resolve to route provenance.
- **Needs verification:** a `needs-review` connection with evidence, or an explicitly recorded unknown. It remains visibly uncertain and is never treated as a verified timetable or service claim.
- **Blocking:** a missing adjacent connection, a confidence claim without evidence, or a `needs-review` claim not represented as an explicit unknown.

## Audit snapshot — 2026-08-25

The catalogue contains 74 route families. Eighteen currently pass the existing Discover/Route Detail eligibility boundary: `japan-slow`, `taiwan-rail`, `andean-highlands`, `portugal-atlantic`, `italy-table`, `south-korea`, `malaysia-singapore`, `mexico-yucatan`, `costa-rica-wild`, `spain-rail`, `france-south`, `scotland-islands`, `morocco-rail`, `usa-canada-west`, `usa-southwest`, `india-golden-triangle`, `italy-greece`, and `portugal-spain`.

None passes this new release contract yet. This is deliberate: the checker reports missing metadata rather than inventing it or changing current route visibility.

Japan, Andean Highlands, and Portugal Atlantic already have canonical identities, valid Builder handoffs, complete ordered stops with minimum nights, route-level provenance, confidence, and valid review dates. They are incomplete because they lack explicit recommended nights, route-order rationale, connection-level provenance (and an explicit unknown for Andean Highlands’ flight allowance), an unknowns ledger, editorial owner/reviewer, and image rights/attribution. Their hero assets exist, but rights are not represented.

Across the broader currently exposed catalogue, the same owner/reviewer, explicit-unknowns, explicit recommended-night, route-order rationale, and image-rights fields are absent. Four exposed routes have a mapped hero asset but no rights record; the other fourteen also lack an assigned hero asset. Five have connection records but no connection-level source labels; thirteen have no connection records or explicit unknowns. Existing source links, confidence classifications, review dates, stops, and Builder handoffs are retained as-is.

## Editorial workflow

1. Author or update the route family and matching Builder seed.
2. Add provenance links, then attach relevant source labels to each practical connection claim.
3. Review the route order, minimum and recommended nights, pacing, and every connection; record a connection unknown rather than guessing.
4. Review hero imagery rights, attribution, and source.
5. Set the review date, editorial owner, reviewer, and explicit unknowns ledger.
6. Run the public-route release check and resolve every blocking issue.
7. Publish only after the check reports `ready` or `ready-with-verification`; the latter must retain its documented uncertainty.

# Route PDP discovery enrichment design

**Ticket:** #328 (absorbs #317)
**Accepted staging:** `845e2eac630e4a077a0ffa4a817de940ec9b6d82`
**Status:** Approved for implementation

## Job to be done

Before creating a trip, an independent traveller planning a complex route needs
to understand what the journey feels like, why its order works, what each stop
contributes, and which practical constraints matter. The public Route Detail
must make that judgment easy while preserving one clear conversion action:
**Plan this route**.

## Scope

Implement the first three delivery phases from the accepted #328 audit:

1. Add a deterministic discovery projection over existing canonical route data
   and reviewed editorial imagery.
2. Replace the database-like Route Detail hierarchy with:
   Hero → Why this route → Trip highlights → Journey and geography →
   Explore this route → Practical context → Plan this route.
3. Coordinate stop sequence, pacing, connections and map selection in one
   journey treatment, with a deliberately shorter mobile composition.

Apply the reviewed-first rich treatment only to the eight routes already owned
by `routeEditorialImagery`. Other published routes remain factual and concise.
This ticket does not enrich the full 25-route catalogue.

## Truth and readiness boundaries

- Canonical route facts remain owned by `lib/easyt/route-catalog.ts` and the
  public projection in `lib/easyt/public-route.ts`.
- The discovery projection may select, deduplicate and label existing facts; it
  must not generate new travel claims.
- Reviewed visuals must resolve through the existing local, attributed image
  inventories. Image credits remain visible through `MorroviaPhotoCredit`.
- A route receives rich highlights only when it has an explicit reviewed
  editorial-imagery record, at least three reviewed editorial moments, and
  attributed coverage for every canonical stop. Highlights contain 6–10
  reviewed items. Japan may reuse one reviewed stop photograph for a distinct
  reviewed moment because its accepted inventory has five stops/five photos;
  no unreviewed or homepage-only asset may be promoted to close that gap.
- Routes that fail readiness omit the highlight grid and any image placeholder.
  Their page remains a concise factual Route Detail.
- Additions/detours remain empty unless an existing reviewed routing/time claim
  supports them. No such new claims are introduced in this implementation.
- No Wikidata, CMS, new content owner, or broad generated travel prose.

## Interaction contract

- Preserve canonical slugs, publication gates, route order, duration and night
  allocations, and the serialized Builder draft.
- Preserve the current hash-based map-selection architecture. A stop's heading
  is the single integrated selection action; remove separate “See on map” and
  duplicate whole-route controls.
- Keep map markers and stop selection keyboard operable with clear focus.
- Preserve `route_started` analytics and its coarse route/placement payload.
- Hero and final CTA use the same Builder handoff owner; there is no middle CTA.
- Keep sources/provenance available without turning them into a competing
  discovery section.

## Responsive contract

- Desktop uses a coordinated journey list and sticky map region.
- At 390/430, the journey reads linearly, the map has a bounded height and
  appears once, media is reduced, and no desktop-only local navigation is
  reproduced vertically.
- No horizontal scrolling; the CTA remains obvious at the beginning and end.

## Reuse

- Reuse `EasyTLinkButton`, `EasyTSelect`, `MorroviaPhotoCredit`,
  `RoutePlanLink`, `RouteMapSummary`, and the existing route/map tokens.
- Extend the existing Route Detail production owner and its Storybook story;
  do not add parallel page, card, button, map, or attribution primitives.

## Non-goals

- Enriching all 25 routes.
- Changing canonical route facts or Builder semantics.
- A POI ingestion pipeline, external knowledge graph, content authoring UI, or
  new persistence model.
- Push, merge, deploy, or modification of the user's existing checkout.

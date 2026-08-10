# EasyT content engine plan

Last updated: 8 August 2026

## Product goal

EasyT should plan complex, multi-destination trips with a clear point of view while keeping every important decision editable. It should explain why a route works, show the practical cost of moving between places, warn when a plan is too ambitious, and be honest when information needs checking.

The engine is not a generic destination list and it is not a booking engine. Curated route logic is the backbone. Live data is used for volatile details only.

## Current status

### Shipped

- `RouteFamily`, `RouteConnection`, confidence, review date, source links, and seasonal-note types.
- Four structured route families in `lib/easyt/route-catalog.ts`:
  - Japan, one good day at a time
  - Taiwan by train
  - Andean highlands, gently
  - The Atlantic reset
- Basic route scoring by region, interests, and available days.
- `/api/journey-routes` endpoint for filtered route recommendations.
- Existing deterministic itinerary planner with visible transfer assumptions and pacing recommendations.

### Iteration two

- Add Vietnam/Cambodia, Colombia/Ecuador, Italy, and Balkans route families.
- Add richer connection metadata: frequency, booking lead time, border complexity, altitude impact, and transfer friction.
- Add route-family metadata to the builder and route overview UI.

### Not yet built

- OpenStreetMap, Wikidata, UNESCO, GTFS, and official tourism ingestion jobs.
- Live-data adapters for transit, weather, opening hours, and venue availability.
- Editorial review dashboard.
- Image-rights and attribution workflow.
- Translation review workflow.
- Profile-aware route ranking and route alternatives.
- Content freshness monitoring and beta feedback loop.

## Canonical data model

### Place

Every place needs:

- Stable EasyT ID and external IDs where available.
- Name, local name, translated names, country, region, and place type.
- Coordinates and map bounds where relevant.
- Travel value tags: food, nature, culture, coast, nightlife, hiking, wildlife, family, budget.
- Altitude, seasonality, typical stay range, and accessibility notes.
- Source links, source type, owner, last reviewed date, confidence, translation status, and image-rights status.

Place types include city, town, region, national park, island, heritage site, airport, station, border crossing, and accommodation base.

### Connection

Every connection needs:

- Origin and destination place IDs.
- Mode: rail, bus, ferry, flight, road, walk, or mixed.
- Planning duration and a door-to-door allowance.
- Typical frequency, booking lead time, border/visa complexity, and transfer friction.
- Seasonal limitations and disruption notes.
- Provider/source links, last reviewed date, confidence, and review owner.

### Route family

Every reusable route needs:

- Title, editorial promise, region, countries, and interests.
- Configurable start and end points.
- Ordered candidate stops with minimum, ideal, and maximum nights.
- Connections between candidate stops.
- Suggested trip-length range.
- Pacing rules and warnings.
- Seasonal alternatives.
- Explanation for why each stop is included.
- Alternatives for fewer moves, lower cost, more food, more nature, and more culture.
- Source and editorial metadata.

### Source record

All external content should be traceable:

- Provider: OSM, Wikidata, UNESCO, GTFS, tourism authority, government, or editorial.
- URL or dataset identifier.
- What the source supports.
- Retrieved/reviewed timestamp.
- Licence and attribution requirements.
- Confidence and review status.

## Source hierarchy

| Need | Preferred source | Usage rule |
| --- | --- | --- |
| Coordinates, place types, nearby venues | OpenStreetMap | Use for geographic facts and nearby discovery; retain attribution. |
| Multilingual place facts and relationships | Wikidata | Use structured IDs and labels; do not use it as fuzzy search. |
| Heritage and significant landmarks | UNESCO World Heritage data | Use for heritage context and verified significance. |
| Transit schedules and disruptions | Official GTFS and GTFS Realtime | Static schedules for planning; realtime only for volatile alerts. |
| Entry rules and safety | Official government sources | Display review date and country scope. |
| Destination character and pacing | EasyT editorial content | Human-reviewed, opinionated, and clearly labelled. |

## Planning logic

The planner should calculate:

1. Route shape and candidate stops.
2. Minimum viable nights per stop.
3. Estimated transfer time and mode.
4. Pacing health: recovery days, one-night stays, long transfers, altitude jumps, and excessive hotel moves.
5. Profile fit: pace, interests, budget, hotel-change preference, and trip length.
6. Alternatives when the traveller changes one constraint.
7. Confidence and freshness for every volatile claim.

Every recommendation returned to the UI should include `reason`, `evidence`, `checkedAt`, `confidence`, and an editable action. The AI layer may explain or suggest, but deterministic checks remain the authority for timing and route health.

## Live-data boundary

Curated data owns:

- Route order.
- Editorial promise.
- Minimum nights.
- Pacing philosophy.
- Why a stop belongs.

Live or frequently refreshed data owns:

- Transit disruptions and departures.
- Weather-sensitive ideas.
- Opening hours and timed-entry requirements.
- Nearby restaurants and stays.
- Availability and prices, when integrations are available.

Live data must never silently rewrite the traveller's saved route. It can suggest a change and show the source, timestamp, and confidence.

## Editorial quality system

Build an internal review dashboard with queues for:

- New places and connections.
- Stale records.
- Low-confidence route legs.
- Missing translations.
- Missing source links.
- Missing image rights or attribution.
- Conflicting source values.

Required statuses: draft, needs-review, approved, stale, archived.

Required ownership: editor, reviewer, last reviewed date, next review date.

## Route-family rollout

### Wave one: initial coverage

- Japan slow rail
- Taiwan by train
- Andean highlands
- Portugal Atlantic coast

### Wave two: current iteration

- Northern Vietnam and Cambodia
- Colombia to Ecuador
- Italy between tables
- Balkans overland

### Wave three

- Thailand, Laos, and northern Vietnam
- Patagonia edges
- Morocco by rail and road
- Central America: Guatemala, Belize, and Mexico
- Spain and Portugal rail/coast variants
- Southern Africa wildlife circuit

Target: 15–20 route families before broad worldwide coverage.

## Delivery milestones

### Milestone A: catalogue foundation

- [x] Define route, place, connection, and source concepts.
- [x] Add first route families and recommendation endpoint.
- [ ] Add richer practicality metadata.

### Milestone B: engine integration

- [ ] Rank route families from profile and trip length.
- [ ] Feed route-family connections into itinerary generation.
- [ ] Return reasons, evidence, confidence, and freshness in planner responses.
- [ ] Add alternatives for pace, budget, interests, and fewer moves.

### Milestone C: source enrichment

- [ ] Add OSM place and nearby-venue adapter.
- [ ] Add Wikidata identity and translation adapter.
- [ ] Add UNESCO heritage enrichment.
- [ ] Add official GTFS static and realtime adapters by priority region.

### Milestone D: editorial operations

- [ ] Build admin review queues.
- [ ] Add source, rights, translation, and freshness checks.
- [ ] Add route preview and publish workflow.

### Milestone E: beta learning loop

- [ ] Track route opened, route personalised, stop removed, stop added, day moved, warning dismissed, and trip saved.
- [ ] Invite a small beta across Asia, Europe, and South America use cases.
- [ ] Review failed searches and edits weekly.
- [ ] Promote only routes that produce useful first drafts and low correction effort.

## Definition of done for a route family

A route is ready for production when it has at least three viable bases, practical connections, minimum/ideal/max nights, a pacing rationale, seasonal guidance, source links, an editorial owner, a review date, translated labels, image rights, and an explanation for every major recommendation.

## Immediate next build

1. Finish the four wave-two route families.
2. Add practicality fields to connections.
3. Connect route-family data to the builder's inspiration and route overview pages.
4. Add route-specific pacing checks to the planner.
5. Start the editorial review dashboard with stale and needs-review queues.

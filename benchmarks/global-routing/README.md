# Global routing intelligence benchmark

This is Morrovia's full-trip integrity gate. It composes existing production boundaries instead of introducing another parser or route model:

- validated `SemanticTripIntent` and deterministic mention coverage;
- the existing compact place-provider taxonomy;
- `StructuredTripBrief` projection;
- origin-inclusive canonical `TripLeg` construction and integrity validation;
- Trip Health gating;
- Map and Luna projections of the same canonical legs.

The 51 journeys cover every required world region, ambiguous names, country/region intent, anchors and bases, origin variants, islands/ferries, long overland legs, unsupported transfers and non-geographic preference language. Each fixture records the prompt, expected semantic roles, required destinations, ambiguity, origin behavior, anchor/base relationships, transport constraints, allowed uncertainty and forbidden outcomes.

## Deterministic CI mode

```sh
npm run benchmark:global-routing
npm run test:global-routing
```

CI replays controlled, source-grounded semantic intent and provider facts through the real capture, route, health and projection code. It never calls OpenAI, Nominatim or another network provider. A hard failure—especially the P0 London/Mexico/Guatemala/Belize fixture—always fails the run regardless of aggregate score. Snapshot changes also fail until reviewed.

An intentional baseline change is double-gated:

```sh
MORROVIA_GLOBAL_ROUTING_ACCEPT=yes npm run benchmark:global-routing -- --accept
```

Do not accept a baseline merely to make a change green. The runner refuses a baseline containing hard failures.

## Live intelligence mode

Live mode is manual and explicit. It uses GPT-5.6 Luna plus the current Nominatim provider, runs through the same harness, and reports only aggregate latency, token and estimated cost metadata. It does not log prompts, provider payloads or secrets.

```sh
MORROVIA_GLOBAL_ROUTING_LIVE=yes npm run benchmark:global-routing:live -- --limit=3
MORROVIA_GLOBAL_ROUTING_LIVE=yes npm run benchmark:global-routing:live -- --fixture=p0-london-mexico-guatemala-belize
```

Normal CI never depends on OpenAI or Nominatim uptime. Live results are observational and never rewrite the deterministic baseline.

## Outcome rules

- `PASS`: all integrity checks pass with complete supported facts.
- `PASS WITH EXPECTED UNCERTAINTY`: integrity passes and unresolved/base-required geography or unknown transfers remain honestly gated.
- `WARNING`: a non-catastrophic scored expectation changed and needs review.
- `HARD FAILURE`: intent, geography, route, transfer or truthfulness integrity failed.

Capability scores remain visible for semantic understanding, geographic resolution, route integrity, transfer integrity and product truthfulness. An average can never mask a hard failure.

## Relationship to existing suites

- `benchmarks/place-intelligence`: 53 prompt-level deterministic place/taxonomy cases.
- `benchmarks/prompt-engine`: 16 raw-prompt cases plus replay/live semantic review.
- `benchmarks/engine-v2`: resolved-stop routing, scoring and night allocation.
- constraint, realism and uncertainty gauntlets: narrow stress boundaries.

This suite fills the orchestration gap between those component benchmarks. It does not replace them.

## Audit findings

- `place-intelligence` is a 53-prompt, fixture-based, deterministic taxonomy and mention-preservation suite. Provider behavior is controlled; it does not exercise a live geographic service.
- `prompt-engine` is a 16-prompt deterministic capture suite with separate replay and opt-in semantic-shadow tooling. That is the existing live-Luna boundary, but it stops before a complete canonical trip.
- semantic-intent tests protect the strict Responses request, source-grounded response validation, model tiering and safe telemetry behavior.
- engine-v2, constraint, realism and uncertainty suites exercise resolved-stop sequencing, allocations, confidence and narrow adversarial cases. They do not begin with open-world trip language.
- trip-leg, route-assessment and Trip Health tests protect origin-inclusive canonical legs, plausibility invalidation and readiness gating. Builder, Overview, Map, Itinerary, Shape the day and Luna tests protect individual consumers.
- before this suite, no permanent benchmark composed semantic intent, mention coverage, global place resolution, canonical route/leg construction, health and downstream projections for one globally diverse journey corpus. There was also no single opt-in path that paired live Luna with the current Nominatim provider while keeping CI offline.

Existing failure taxonomies are retained rather than renamed: semantic validation/coverage issues, place-resolution issues, canonical-leg integrity issues, route/health findings and cross-surface projection mismatches are grouped into the five capability layers in this report.

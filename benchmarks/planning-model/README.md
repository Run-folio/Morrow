# Planning model routing and rollout evidence

This suite is the evidence gate for high-value planning model changes. It uses
the existing semantic intent and canonical place boundaries; it does not test
or replace transfer, geocoding, night allocation, persistence or UI logic.

## Pre-change model audit

| Task/path | Before this ticket | Authority and fallback |
| --- | --- | --- |
| Homepage/New Trip semantic intent extraction | Luna, low reasoning, one strict Responses call in active mode | Deterministic capture inventory and provider-backed place resolution remain authoritative; timeout/invalid/provider failure falls back to provider-enriched deterministic capture. |
| Structured Trip Brief | Deterministic projection from canonical place resolution | No model-authored trip schema. |
| Free-text destinations, broad areas, landmarks, natural areas and interests | Deterministic parser plus the Luna extraction above | Canonical catalogue/open-world providers validate identity. |
| Broad-area suggestions and route shapes | Reviewed route catalogue, place catalogue and provider-backed nearby/search results | Traveller explicitly selects and finishes shaping. |
| Ambiguous-place clarification | Deterministic/provider-backed candidates | No model. |
| Route ordering and repair | Deterministic route candidates, scoring and validation | No model-authored transport facts. |
| Night allocation | Deterministic allocation/rebalancing | No model. |
| Road, rail, flight and multimodal transfer resolution | Canonical deterministic/provider engine | No model. |
| Luna trip co-pilot | Luna, low reasoning, strict response/tool contract | Read-only answer or deterministic mutation preview; traveller review required. Luna is the product persona and is not renamed. |
| Planner shadow review | Development-only Groq `openai/gpt-oss-120b` reviewer | Observational benchmark/shadow output only; never reconciled into the trip. |
| Semantic shadow and live benchmark tools | Luna | Development-only sanitized comparison telemetry. |
| Internal OpenAI smoke check | Luna | Operational model/configuration check only. |

The existing gateway supplied a shared OpenAI client, timeouts, strict parsing,
safe provider error categories, usage/cost estimates and sanitized aggregate
logs. Terra existed in configuration as an unused escalation tier.

## Current strategy

`lib/easyt/model-task-router.ts` owns task-to-model decisions. Broad geography,
visit intent without a base, recommendation language, unresolved meaningful
geography, interacting constraints and short geographically dispersed routes
are general deterministic complexity signals. Explicit routes with no such
signal remain on Luna.

High-value capture uses one Terra planning response containing the existing
semantic intent contract, up to six advisory place names and a bounded
coherence assessment. Place names then pass through the existing open-world
provider, overnight-base capability and geographic containment checks. Only
validated compact canonical suggestions reach the existing Builder
clarification UI, and they are never selected automatically.

Fallback order is: Terra; one safe retry for empty/malformed planning output;
Luna semantic extraction; provider-enriched deterministic capture. A 30-second
hash-keyed in-flight cache prevents duplicate server calls without retaining
the raw prompt as a cache key or permanently caching personalized planning.

Telemetry records task, complexity, selected model, routing reason, status,
latency, aggregate usage/cost, fallback and validation issue classes. It does
not record prompts, trip text, canonical coordinates, account data or analytics
identifiers.

## Running

- `npm run benchmark:planning-model:luna` records the current production Luna
  extraction behavior.
- `npm run benchmark:planning-model:terra` runs the Terra candidate plus
  provider-backed canonical validation.
- `npm run test:model-routing` runs deterministic routing, schema, fallback and
  boundary tests without a network call.

Live runs require the repository's server-only `OPENAI_API_KEY`. The frozen
artifacts contain aggregate metrics and reviewed findings, never prompts or
credentials.

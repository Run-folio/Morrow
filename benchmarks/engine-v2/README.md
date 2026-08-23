# Engine V2 benchmark harness

This 23-trip phase-one suite measures the existing deterministic route-intelligence boundary. It does not alter planning behavior and does not call geocoding, external APIs, or an LLM.

- `trips.ts` keeps the original ten trips as `ENGINE_V2_BASELINE_BENCHMARKS`, adds 13 distinct regional and traveller cases in `ENGINE_V2_EXPANSION_BENCHMARKS`, and exports the combined suite. Every fixture contains fixed resolved destination facts, hard requirements, expected qualities, unacceptable failures, useful warnings, acceptable variations, coverage tags, and qualitative review questions.
- `harness.ts` runs machine-verifiable checks against the production engine, exposes score confidence, rejects unsupported schedule certainty, checks realistic door-to-door impact, measures night allocation through invariants rather than one exact split, and audits the final plan with the bounded independent critic.
- `baseline.json` remains the immutable pre-candidate snapshot for the original ten trips.
- `phase-1-baseline.json` records the 23-trip current-engine snapshot established by this coverage-only expansion.
- `run.ts` prints the whole suite, reports historical and phase-one improvements/regressions by dimension, and gates against the preserved phase-one snapshot. The only accepted delta is the documented transport-feasibility change that replaces two hard no-driving failures with explicit unknown-route warnings; any further difference fails the gate.

Run `npm run benchmark:engine`. Add future scenarios to `ENGINE_V2_BENCHMARKS`; no evaluator rewrite is required.

The route assessment, transfer estimates, and machine checks are deterministic. Destination resolution is deliberately fixed in the fixture so network and model variance cannot create false regressions. Contradictory fixtures declare the exact structured conflicts they expect; they never pass by accepting a hard-invalid route. Questions about experiential balance, worthwhile transfers, ferry operations, actual price, accessibility, and overall usability remain `qualitativeReview` items and are not presented as machine truth.

No weather-sensitive case is machine-scored yet because the route boundary does not have sufficient dated, deterministic closure or weather facts. Add one only when a curated fact can support a stable expectation.

Both snapshots intentionally compare qualitative route outputs and finding counts, while richer scoring, transfer-impact, night-allocation, and repair details remain available in the full runtime result. Do not edit either snapshot merely to make a changed engine green: document the expectation or engine change first.

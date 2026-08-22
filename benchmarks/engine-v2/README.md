# Engine V2 benchmark harness

This suite measures the existing deterministic route-intelligence boundary. It does not alter planning behavior and does not call geocoding, external APIs, or an LLM.

- `trips.ts` contains realistic prompts, fixed resolved destination facts, expected qualities, unacceptable failures, acceptable variations, and qualitative review questions.
- `harness.ts` runs machine-verifiable checks against the production `assessRouteIntelligence` and `estimateLeg` functions.
- `baseline.json` is the recorded pre-Engine-V2 snapshot.
- `run.ts` prints the current result and exits non-zero when it differs from the recorded baseline.

Run `npm run benchmark:engine`. Add future scenarios to `ENGINE_V2_BENCHMARKS`; no evaluator rewrite is required.

The route assessment, transfer estimates, and machine checks are deterministic. Destination resolution is deliberately fixed in the fixture so network and model variance cannot create false regressions. Questions about experiential balance, worthwhile transfers, and overall usability remain `qualitativeReview` items and are not presented as machine truth.

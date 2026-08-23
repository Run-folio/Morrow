# Place Intelligence benchmark

This deterministic 53-prompt suite measures the boundary between traveller wording and Morrovia’s canonical `StructuredTripBrief`. It is deliberately separate from `benchmarks/engine-v2`: the engine benchmark begins with resolved stops, while this suite tests whether place intent survives long enough to reach that boundary.

The fixtures cover eight cohorts:

1. existing exact-place regressions;
2. regions and planning areas;
3. islands and archipelagos;
4. aliases and multilingual/common names;
5. nested and overlapping geography;
6. ambiguity and context;
7. roles and negation;
8. partial unknowns and graceful degradation.

Every fixture records the prompt, exact expected phrase boundaries, canonical identity or unresolved state, place type, role, country containment, routability, unacceptable failures, acceptable variations, and one qualitative review question. Machine findings measure:

- place-mention recall;
- phrase-boundary accuracy;
- place-type accuracy;
- alias canonicalization;
- role and negation accuracy;
- ambiguity honesty;
- region preservation;
- protection against false city/base collapse;
- downstream `StructuredTripBrief` projection;
- exact-place regression safety;
- unsupported-claim avoidance.

The harness calls the production `resolvePlaceMentions(prompt)` resolver and independently calls `extractStructuredTripBrief(prompt)` to verify the canonical projection. It does not call a live geocoder, model, mapping service, or transport provider. Catalog and contextual resolution therefore stay reproducible for the same code and fixtures.

Run:

```sh
npm run benchmark:place-intelligence
npm run test:place-intelligence
```

`accepted-baseline.json` is a checked-in snapshot of normalized resolver output, projected identities, structured issues, and finding statuses. The CLI exits non-zero when the current result differs. Do not update the baseline merely to make a change green: first inspect whether the delta is an intended improvement, an honest increase in uncertainty, or a regression such as dropped regional intent or false precision.

After reviewing and confirming an intentional delta, refresh the baseline through the benchmark CLI:

```sh
npm run benchmark:place-intelligence -- --accept
```

Qualitative questions are intentionally not machine-scored. They cover whether a clarification is useful, whether a regional issue gives the traveller a short path forward, and whether a resolved result still communicates the traveller’s own wording. Provider-specific IDs are not required in unsupported fixtures; curated identities are fixed where Morrovia owns a stable catalog ID.

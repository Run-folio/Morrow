# Prompt Engine Stress Harness

This suite begins with raw traveller language and evaluates the existing deterministic capture, StructuredTripBrief and route-assessment boundaries. It is deliberately separate from the 50+ prompt Place Intelligence benchmark and Engine V2's resolved-destination benchmark.

Each case records hard facts, acceptable variation, prohibited outcomes, expected warnings or conflicts, and unscored reviewer notes. Cases with an operational route use recorded, fixed stop facts; cases involving regions, ambiguity or unknown places are intentionally plan-gated. No test calls a model, geocoder or network provider.

Scores are 0 or 2 for each of seven dimensions: intent, constraints, route, time realism, state preservation, uncertainty and explanation. The 15-case baseline is 196/210. `baseline.json` is a regression contract, not a target to edit when behavior changes.

Run `npm run benchmark:prompt-engine` for the score and dimension deltas, or `npm run test:prompt-engine` in CI. Add new entries to `fixtures.ts`; no harness rewrite is needed as the suite grows toward 40–60 cases. Keep subjective judgment in `reviewNotes` and deterministic facts in the machine-checked fields.

# #207 typography and colour convergence evidence

This folder preserves the read-only inventory captured before production edits and the same inventory regenerated after the reviewed migration.

| Measure | Initial | Final | Delta |
| --- | ---: | ---: | ---: |
| Raw colour declarations | 2,300 | 2,017 | -283 |
| Unique raw literals | 755 | 735 | -20 |
| Singleton literals | 509 | 506 | -3 |
| Literals used 2–3 times | 148 | 147 | -1 |
| Exact canonical duplicates | 9 | 3 | -6 |
| Near-canonical literals | 414 | 401 | -13 |
| No clear canonical equivalent | 73 | 73 | 0 |
| Direct page-local font roles | 405 | 0 | -405 |

Each JSON record includes the literal value, declaration count, source files, CSS properties, sampled declaration contexts, closest canonical token and distance, visual-similarity classification, inferred semantic role, and `MIGRATE`, `KEEP / INTENTIONAL`, or `REVIEW` recommendation.

## Reviewed migrations

- Direct framework font variables now use `--morrovia-display`, `--morrovia-ui`, or `--morrovia-meta` without changing size, weight, line height, or hierarchy.
- Fallback literals were removed only where the named Morrovia variable is globally defined.
- Exact paper and tint duplicates moved to their semantic tokens.
- Reviewed legacy ink, action, signal, and success families moved to canonical roles on product UI surfaces.

## Intentionally retained

- Intentional white surfaces pending a dedicated semantic surface-token decision.
- Map route, pin, provider, geography, and data-visualisation colours.
- Artwork and illustration palette values.
- Alpha overlays and shadows whose opacity is part of the visual treatment.
- Status colours without a proven semantic match.
- Undefined local fallback variables such as `--morrovia-surface` and `--morrovia-warning-line`.

The checked-in UI audit baseline was lowered only after focused convergence and presentation tests passed.

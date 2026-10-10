# Batch 15 local review checkpoint

## Scope and identity

- Branch: `codex/batch15-trust-photos-places`; preserved base: `0dda85d0e7f145719157f0dd9014a4560964e855`.
- The task-2 checkout was read-only in this executor. This task-4 checkout is a local clone with the complete original uncommitted diff and three untracked files applied before further changes. The original checkout was not edited.
- No staging, main or production deployment was made.
- The 22-file reference snapshot is `699b595afdba9be6994e`; its source and file checksums are in `data/place-reference/manifest.json` and `data/place-reference/islands/manifest.json`.

## Reconciliation

- Preserved work already supplied the checksum-pinned administrative names, five distinct Xi’an options, stable-ID recovery for older stops, occurrence-specific district persistence, destination photo scoring, provider-error distinction, and directed-leg caches.
- Authored Manila and GeoNames Manila have different coordinates. The existing suggestion deduplication uses a reviewed cross-source identity mapping; proximity alone is not used to merge them. This mapping is currently in code and merits independent source review.
- The local 33-case browser inventory includes Africa at both viewport widths and uses the original `<2500 ms` per-add assertion. The two historical CI run artifacts were unavailable in this executor, so their exact test-name inventories could not be compared beyond the verified 33/32/1 counts supplied in the handoff.

## Additional changes in this checkout

- Added a shared neutral country-flag fallback for Overview place cards and the trip cover, with a Storybook specimen. It shows the validated country name and does not stretch the flag into a photo.
- Restricted Commons image URLs to its actual commons upload/thumbnail paths.
- Included place name, country, administrative context, type and point in photo cache keys. The cover lookup now sends the same canonical identity and administrative context as the Overview card.
- Preserved all existing destination-specific photo selections and attribution paths; no country photo has been added without visual and licence review.

## Local verification

- Focused pre-change preserved candidate: 84 passed, 0 failed, 0 skipped.
- Final relevant focused group: 112 tests, 110 passed, 2 failed, 0 skipped. Both failures are in `tests/transfer-realism-benchmark.test.ts` and reproduce identically on pristine `0dda85d`: 18 correct / 10 clearly wrong against the frozen 28/0 expectation. This is a pre-existing baseline failure, not a successful transport qualification.
- Core browser: 33 passed, 0 failed, 0 skipped. Africa add acceptance: 382.5 ms at 1440 px and 329.8 ms at 390 px, under the unchanged 2500 ms limit. Evidence: `/tmp/morrovia-batch15-core/multi-area-{1440,390}-timing.json` and corresponding captures.
- Transport browser: 9 passed, 0 failed, 0 skipped with `MORROVIA_BUILDER_BROWSER_TESTS=1`.
- `npm run typecheck`, `npm run build:check`, strict `npm run audit:ui`, `CACHE_DIR=/tmp/morrovia-batch15-storybook-cache npm run build-storybook`, reference audit and `git diff --check` passed.
- Reference audit: 224,603 settlements, 11,290 airports, 33,323,690 reference bytes, +109 client bytes, all budgets passed. Report: `/tmp/morrovia-batch15-reference-audit/report.json`.

## Acceptance still open

- Country-level photos have not been editorially selected or pixel-reviewed. The validated flag now supplies the truthful fallback, including Cuyo, when there is no accepted destination image. This does not prove the full approved country-photo rung.
- Actual rendered provider imagery and attribution for Manila, Cebu, Coron, Cuyo, Denver, Big Bear Lake, Portland and Gatwick have not been captured or inspected on their exact canonical identities. Provider coverage and hosted cache behavior remain unverified.
- The requested Ketapang–Gilimanuk and Copenhagen–Malmö source-backed crossing fixtures are not present. The existing Coron–Cuyo, Denpasar–Surabaya and Rome–Venice guards pass, but do not establish the missing crossing evidence.
- The benchmark baseline failures mean broad transport acceptance is not complete. Independent source and product review should decide which frozen cases require bounded evidence versus explicit unknown states.
- Hosted verification and Shaun’s acceptance must use one exact reviewed candidate before any main or production action. No deployment is authorized by this checkpoint.
- During shutdown, the local Next server logged repeated `Could not find the module .../transport/page.tsx#default in the React Client Manifest` errors. The transport browser suite mounts its fixture directly, so its nine passes do not resolve this route-level runtime error. Investigate on the exact candidate before hosted acceptance.

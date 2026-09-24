# Task 9 report — Mobile, accessibility, analytics, performance

Implementation commit: `d1b934c` (`feat(discovery): harden responsive accessible funnel`), based on `ce6f05f`.
Independent-review fix commit: `8f6587c` (`fix(discovery): align funnel events and preserve map state`).

## Changes

- Reused the shared `BuilderClarificationShell`, `EasyTButton`, `MorroviaSkeleton`, and `MorroviaStatusBanner`. The Discovery mobile dialog now uses `100dvh`, one content `.body` scroll owner, a compact static footer, and safe-area padding below the last card. No new shared component or design token was introduced.
- Added six typed Discovery funnel events through the existing consent-gated `trackEvent`. Payloads contain only `entry_kind`, counts, and categorical `action`. They contain no prompt, place name, coordinates, URL, image credit, or other source text. `discovery_shown` and `discovery_review_reached` are guarded against effect replay for a mention's open session. `discovery_confirmed` now records durable completion only.
- Added browser Performance marks for modal mount and first useful card. Kept the existing dynamic import boundary for `discovery-map` and lazy card imagery. Projection and map identities are memoized on their content inputs.
- Added a Storybook save-error state. Existing stories cover 320, 390, 430, 768, 1024, 1440, 1680, Spanish, no photo, loading, map, sparse, and Review cases. Corrected stale EN/ES localization expectations to the current Review recovery copy.

## Red → green

The new analytics, modal timing, Storybook error, and mobile scroll guards failed before implementation. The requested focused command passed after implementation: 23 tests, 0 failures. The broader Discovery plus analytics group passed: 113 tests, 0 failures.

`npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, and `git diff --check` passed. Storybook's established large-chunk advisories remain; they did not fail the build.

## Measurements and browser checks

An Australia projection with 24 reviewed places was run 1,000 times locally: p50 **13.6 ms**, p95 **14.9 ms**, maximum **38.9 ms**. The `discovery-mounted-to-first-card-paint` browser measure is emitted once a card in the active modal appears. The browser inspection surface did not expose Performance entries, so an observed opening duration is not reported.

Task 4's recorded `/journey/new` baseline was **90.2 kB route / 1.13 MB First Load JS**. The initial Task 9 build reported **88.9 kB route / 511 kB First Load JS**; the review-fix build reports **89.4 kB route / 511 kB First Load JS**. The delta spans Tasks 5–9 and cannot be attributed to Task 9 alone. The initial Builder module still has no static Discovery Map import; MapLibre remains behind the Discovery step's dynamic import.

In a browser at the requested 320 px viewport override, the Discovery body was the only element with `overflow-y: auto` (478 px client height, 2,770 px content height before expansion); the footer was statically positioned outside it, and there was no horizontal document overflow. After expanding all Australia cards and scrolling to the last card, the card bottom cleared the footer by **33 px**. The shared shell's existing Escape, focus trap, focus return, and loading dismissal lock were preserved and covered by the contract and Storybook interaction tests. Full viewport and accessibility matrix remains with Task 10.

## Remaining limit

Browser timing capture requires a performance-entry-capable inspection session; this browser's read-only evaluation omitted the Performance API. The instrumentation and card milestone are present, but no unsupported universal timing threshold or latency claim is made.

## Independent-review follow-up

After review, completion moved to Builder's durable `commitDiscoveryReview` success path. Accepted dismissal is now `discovery_dismissed` after Builder's recovery gate; the former close-or-resume name was removed because the event never represented reopening. Draft choice events now compare actual before/after selections, use the resulting count, suppress no-ops, and include eligible canonical search. Behavioral helper tests cover accepted/partial/failed outcomes and duplicate choices.

Builder now memoizes Discovery projection on content inputs that affect its results; shortlist/base edits and unrelated renders preserve candidate identity. A separate ordered map marker key keeps MapLibre mounted across remove/re-add while still changing when a direction changes the map collection. Place cards are memoized with stable callback props, so highlight changes update the focused card without rendering every revealed card. The browser measure is scoped to a card inside the active modal and renamed `discovery-mounted-to-first-card-paint` to state its narrower boundary; projection work occurs before this mark.

The review follow-up adds Storybook interactions asserting the same MapLibre canvas survives shortlist add/remove and that an unrelated card outside an empty modal does not complete the timing measure. A populated story asserts one first-card paint measure. At a 320×360 viewport override, the original body had 167 CSS px of browseable height; the short-height compact header/footer raised this to 266 CSS px while keeping 44px action targets and the footer outside the one scroll body. The browser reports CSS dimensions scaled by its viewport override; the before/after comparison uses the same session and scale.

The follow-up behavioral tests first failed on the pre-fix code and now pass: focused Discovery analytics/performance/modal tests **28/28**, broader Discovery plus analytics tests **118/118**. `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, and `git diff --check` passed after the fix. Browser Storybook interaction inspection showed the scoped timing and map persistence scenes without new application errors after their test selectors were corrected.

# Route PDP discovery enrichment implementation plan

**Goal:** Turn public Route Detail into a reviewed-first discovery surface while
preserving canonical facts, map/hash state, Builder handoff, attribution and
analytics.

**Spec:** `docs/superpowers/specs/2026-09-22-route-pdp-discovery-enrichment-design.md`

**Architecture:** Add a pure discovery projection beside the existing visual
presentation projection. Compose the real Route Detail from those projections,
and narrow the existing map summary controls rather than introducing a second
map state owner. Keep page-specific layout in the existing CSS module and real
owner stories in the existing Storybook file.

**Global constraints:** Work sequentially and test-first. Do not change route
catalogue facts, public publication eligibility, image inventories, Builder
draft construction or analytics schemas. Do not enrich routes outside the
eight explicit editorial-imagery owners.

---

## Task 1: Deterministic reviewed-content projection

**Files:**
- Create: `tests/route-detail-discovery.test.ts`
- Modify: `app/journey/routes/[slug]/route-detail-presentation.ts`

**Interfaces:** Produces `RouteDiscoveryPresentation` for Tasks 2–4. Consumes
only `PublicRouteDetail`, `routeFamilyByKey`, `routeEditorialImagery`, and
existing attributed photo resolvers.

1. Write failing tests proving the eight reviewed routes qualify, India and
   Portugal degrade without placeholders, highlight items resolve attribution,
   additions remain empty, and canonical/public objects are not mutated.
   Expected: new tests fail because the discovery projection does not exist.
2. Implement the smallest pure projection and explicit readiness predicate.
   Expected: new tests pass.
3. Run the public-route, imagery and new projection suites.
   Expected: all pass with canonical facts and publication boundaries intact.
4. Commit: `feat(routes): add reviewed discovery projection`.

## Task 2: Discovery hierarchy and #317 simplification

**Files:**
- Modify: `tests/public-route-presentation.test.ts`
- Modify: `app/journey/routes/[slug]/route-detail-view.tsx`
- Modify: `app/journey/routes/[slug]/route-overview.module.css`

**Interfaces:** Consumes Task 1's projection. Preserves `RoutePlanLink` and
`MorroviaPhotoCredit`; Task 3 will refine the journey/map composition.

1. Add failing source-contract tests for the ordered section IDs and removal of
   `A starting point`, local section navigation, middle CTA, related-route
   cards, photo placeholders, and standalone “See on map” controls.
   Expected: assertions fail on the accepted implementation.
2. Recompose hero, why, highlights, explore, practical, sources and final CTA
   using existing controls and attribution. Keep sections conditional when
   reviewed content is absent.
   Expected: source-contract and projection tests pass.
3. Run public-route, handoff and analytics suites.
   Expected: all pass and analytics payload contracts are unchanged.
4. Commit: `feat(routes): reshape detail around discovery`.

## Task 3: Coordinated journey and geography

**Files:**
- Modify: `tests/public-route-presentation.test.ts`
- Modify: `app/journey/routes/[slug]/route-detail-view.tsx`
- Modify: `app/journey/routes/[slug]/route-map-summary.tsx`
- Modify: `app/journey/routes/[slug]/route-overview.module.css`

**Interfaces:** Uses existing `#route-map-stop-N` hashes and
`initialMapSelection`; Task 4 consumes the finished responsive DOM.

1. Add failing tests requiring one journey section, integrated stop selection,
   one map selection system, and no duplicated whole-route button.
   Expected: accepted map toolbar/stop markup fails the assertions.
2. Merge stop reason, nights and onward connection into sequenced journey rows;
   make stop headings the existing hash selection action; keep map marker and
   select keyboard behaviour.
   Expected: presentation tests pass without changing selection identifiers.
3. Run map/hash, public-route and Builder handoff tests.
   Expected: all pass.
4. Commit: `feat(routes): coordinate journey with route map`.

## Task 4: Mobile and Storybook verification states

**Files:**
- Modify: `tests/public-route-presentation.test.ts`
- Modify: `app/journey/routes/[slug]/route-detail-view.stories.tsx`
- Modify: `app/journey/routes/[slug]/route-overview.module.css`

**Interfaces:** Exercises the final view from Tasks 1–3 without creating a
parallel responsive component.

1. Add failing tests for Japan, India, Vietnam–Cambodia, Balkans and Portugal
   story states and named 390/430 responsive review parameters.
   Expected: required stories/parameters are absent.
2. Add representative rich/factual/selected-stop stories and mobile-specific
   layout rules: bounded map, compact journey media, two-column scannable
   highlight grid where viable, and no overflow.
   Expected: story/source tests pass.
3. Run focused tests, typecheck, lint/UI compliance where available, production
   build and Storybook build. Record any environment-only limitation exactly.
4. Commit: `test(routes): cover discovery detail states`.

## Final verification

Verify:
- Japan and the seven other explicit editorial routes show ready highlights.
- India and Portugal remain useful without highlight placeholders.
- Vietnam–Cambodia and Balkans preserve reviewed content and attribution.
- Builder payload parity, publication boundaries, route facts, analytics,
  hash/map state and keyboard behaviour remain green.
- Storybook covers 390/430 plus desktop representative states.

## Review focus

- Accidental travel claims derived from weak data.
- Any route outside the eight editorial owners receiving rich content.
- Duplicate map or CTA interaction systems after the restructure.
- Loss of photo credit, hash compatibility, keyboard focus, route analytics or
  Builder draft fidelity.
- Mobile page length, map dominance and horizontal overflow.

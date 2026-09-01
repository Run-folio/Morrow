# #89 Product hardening: measured performance and accessibility

Audit date: 2026-08-29

Scope: Homepage, Builder, Dashboard, Overview, Itinerary, Map, Routes/Route
Detail, Stamps, Passport, About, Help, auth/account and public navigation.

## 1. Baseline measurements

The production candidate was rebuilt before measurements so stale `.next`
output did not affect the baseline.

| Route | Route JS | First-load JS |
| --- | ---: | ---: |
| Homepage | 16.3 kB | 305 kB |
| Builder | 62.1 kB | 950 kB |
| Dashboard | 18.6 kB | 319 kB |
| Overview | 18.4 kB | 870 kB |
| Itinerary | 5.75 kB | 883 kB |
| Map | 2.95 kB | 985 kB |
| Passport | 23.0 kB | 308 kB |
| Stamps | 14.5 kB | 537 kB |
| Help | 8.96 kB | 299 kB |
| About | 1.39 kB | 291 kB |
| Route detail | 5.60 kB | 290 kB |
| Routes/discover | 5.87 kB | 290 kB |

Shared first-load JS was 102 kB. The two named shared chunks were 46.0 kB and
54.2 kB. The largest raw production chunks on disk were 740, 548, 404, 376 and
352 KiB.

No hydration or runtime warnings appeared while traversing the production
candidate. Storybook development emitted an existing Next 16 deprecation
warning for `next/config`; the production build did not, and the warning does
not identify a current user-path regression. The available browser runtime did
not expose reliable Performance API/Web Vitals data, and Lighthouse is not
installed, so no synthetic timing or Core Web Vitals numbers are claimed.

The concrete image defect was the below-fold closing homepage illustration: a
2,075,041-byte PNG with no intrinsic dimensions or explicit loading strategy.

Baseline Storybook accessibility results:

| Representative state | Baseline result |
| --- | --- |
| Overview, 320 | 12 contrast nodes |
| Itinerary long content, 390 | invalid `tabpanel` role owner, 22 contrast nodes, MapLibre attribution warning |
| Map composition, 390 | four contrast nodes, duplicate/unnamed landmark findings, MapLibre attribution warning |
| Stamps, 390 | 15 contrast nodes and one heading-order failure |
| Help, 390 | seven contrast nodes |
| Account, narrow | two contrast nodes |
| Dashboard keyboard-focus | zero violations; 22 passes; one inconclusive |
| Shared controls focus/validation | zero violations; 20 passes |

## 2. P0/P1/P2/P3 findings

- P0: none reproduced.
- P1: repeated small-text contrast failures across core planning, public and
  account surfaces. This was systemic rather than one local colour misuse.
- P2: 40 px mobile navigation trigger; 38 px Stamps map controls; invalid
  `article[role=tabpanel]`; selected-country heading skip; unnamed Map context
  landmark; Storybook-only duplicate Map main wrapper; and the 2.08 MB
  below-fold homepage PNG.
- P3: large Storybook chunks, MapLibre attribution-link warning, and production
  MapLibre/shared-map bundle cost. These were measured but do not justify a
  risky architecture change in this pass.

## 3. Performance fixes made

- Converted the closing homepage PNG to a visually equivalent 100,302-byte
  WebP.
- Added intrinsic `1942 × 809` dimensions, `loading="lazy"`, asynchronous
  decoding and low fetch priority.
- Kept the homepage route bundle unchanged by using the pre-optimised static
  asset rather than adding client-side image-component code.

## 4. Accessibility fixes made

- Hardened the repeated signal, muted, success and warning semantic token
  pairings to WCAG AA for the surfaces on which compact text uses them.
- Raised the reproduced mobile targets to 44 px.
- Replaced the invalid Itinerary `article[role=tabpanel]` with a valid `div`.
- Corrected the selected Stamps country heading from `h3` to `h2`.
- Named the live Map context complementary landmark.
- Replaced a Storybook-only Map `main` wrapper with a neutral `div` so the story
  does not manufacture duplicate production landmarks.

## 5. Bundle and image findings

The production route sizes are unchanged after the pass. MapLibre remains the
dominant production cost on Map-owning routes, while Storybook separately emits
large-chunk advisories for MapLibre (972.05 kB raw / 252.16 kB gzip), axe
(579.35 kB raw / 158.45 kB gzip), countries data (758.19 kB raw / 243.74 kB
gzip) and Storybook runtime chunks. Axe and the Storybook runtime are not
production costs.

The existing homepage destination frames retain intentional eager loading for
the above-fold Japan/Angkor assets and lazy loading for later Rome/Sydney
assets. No duplicate requests or third-party scripts entering the critical path
were reproduced.

## 6. Keyboard and focus findings

The production Tour was exercised with the keyboard:

1. focus entered the Close control when the dialog opened;
2. `Shift+Tab` from the first control wrapped to Skip;
3. `Escape` closed the dialog;
4. focus returned to the “How it works” opener.

Dashboard stretched links expose one independent accessible card link plus
separate Edit/action controls; its keyboard-focus story has zero violations.
Shared form controls, Help disclosures, Passport controls, Stamps icon buttons,
Map controls and Itinerary actions expose accessible names in inspected states.
No focus trap outside a dialog or unreachable high-value control was
reproduced.

## 7. Semantic and ARIA findings

Named navigation, page/main ownership, native disclosures, dialog semantics,
form labels, segmented states, live feedback, external-link names and card
names were retained. Two defects were fixed with valid HTML (tabpanel owner and
heading level); ARIA was added only for the otherwise unnamed Map
complementary landmark.

## 8. Contrast findings

The canonical token pairings now measure at least 4.5:1 for compact text on the
production paper/lilac and status-soft surfaces. This is a system correction
for failures reproduced across six representative surfaces, not a response to
one local brand use. Pink remains the signal family and indigo remains the
primary action family.

## 9. Touch-target findings

Production checks at the available 389 px browser width found the compact
navigation trigger at 40 × 40 px and the Stamps Zoom in, Zoom out and Fit world
controls at 38 × 38 px. They now have 44 × 44 px minimums. The other inspected
Homepage, Builder, Passport, Help, About and auth controls already met the
established minimum. Exact 320 and 390 fixture coverage remains in Storybook.

## 10. Reduced-motion findings

The shared Journey foundation already collapses animations and transitions,
restores automatic scrolling and provides static loading equivalents under
`prefers-reduced-motion: reduce`. The Product Tour also removes backdrop blur.
No missing static equivalent was reproduced, so no motion code changed.

## 11. Before/after metrics

| Metric | Before | After |
| --- | ---: | ---: |
| Closing homepage illustration | 2,075,041 B PNG | 100,302 B WebP |
| Illustration transfer reduction | — | 95.2% |
| Homepage JS / first-load JS | 16.3 / 305 kB | 16.3 / 305 kB |
| Overview 320 automated findings | 12 contrast nodes | MapLibre attribution warning only |
| Itinerary 390 automated findings | invalid role + 22 contrast nodes + provider warning | provider warning only |
| Map 390 automated findings | contrast + duplicate/unnamed landmarks + provider warning | provider warning only |
| Stamps 390 automated findings | contrast + heading order | zero violations |
| Help 390 automated findings | seven contrast nodes | zero violations |
| Account narrow automated findings | two contrast nodes | zero violations |

## 12. Deliberate non-fixes

- MapLibre was not replaced, duplicated or moved. Overview/Itinerary previews
  and Map depend on the canonical implementation, and no safe marginal split
  was demonstrated.
- The MapLibre attribution link warning remains provider-owned; changing its
  mandated rendering is riskier than the accessibility gain claimed by axe's
  `link-in-text-block` heuristic.
- Storybook chunk warnings were not treated as production regressions. The
  production cost was reported separately.
- Storybook's `next/config` deprecation warning was left as P3 dependency/tooling
  cleanup because it is not emitted by the production build and is unrelated to
  a reproduced user-path failure.
- No server/client boundaries, routing, persistence, state library or animation
  architecture changed.
- No Lighthouse/Web Vitals result is claimed because the tooling was not
  reliably available.

## 13. Responsive evidence

The production browser pass covered public navigation and the Homepage,
Builder, Passport, Stamps, Help, About, Routes/Route Detail and auth at the
available 389 px mobile width with no horizontal overflow. Storybook exercised
the exact 320 Overview state and 390 Builder, Dashboard, Itinerary, Map, Stamps,
Help and Account states; the existing responsive acceptance matrix also covers
768, 1024 and 1440 for the composed workspaces. The changed 44 px controls fit
without dock or canvas collision. Final screenshots are in
`artifacts/product-hardening-89/after/`.

## 14. Validation results

- Storybook axe scans: passed for Stamps, Help, Account, Builder, Dashboard,
  shared controls and Product Tour; Overview, Itinerary and Map retain only the
  documented MapLibre provider warning.
- Focused presentation/regression tests: 50/50 passed.
- New hardening invariants: 4/4 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run build-storybook`: passed; large Storybook chunk advisories retained
  as documented evidence.
- `npm run audit:ui`: passed with no new unaccepted debt.
- `git diff --check`: passed.

# Editorial-system rollout QA

## Comparison target

- **Source visual truth:** the approved Morrovia homepage and builder editorial references supplied on 14–15 August 2026: indigo editorial display type, pale paper/lilac surfaces, pink mono labels, restrained rounded panels and practical content hierarchy.
- **Implementation:** `http://localhost:3010/journey/plan-next`, `http://localhost:3010/journey/routes/japan-slow`, `http://localhost:3010/journey/prep`, and `http://localhost:3010/journey/passport`.
- **Viewports:** desktop browser viewport for the route, prep empty state and passport tool. Existing mobile CSS breakpoints and app-specific controls were retained; no interaction or data model was replaced.

## Evidence

- Route detail: verified the live Japan route hero retains its photograph, route facts and working primary action inside the editorial frame.
- Passport: verified the public checker retains passport/destination selects and the requirements CTA, now with the shared typography, borders and calm result surface.
- Trip prep: verified the no-trip state retains its actionable empty state and adopts the same display hierarchy.
- Map planner: review was limited to the existing state-preserving visual scope because there was no saved trip available in this browser session. The implementation changes only its outer framing selectors; map rendering, stop selection, decisions and tabs are untouched.
- Browser console: no errors on the tested route and prep pages.

## Required fidelity surfaces

- **Typography:** display headings use the Morrovia editorial serif; controls preserve their readable product UI type.
- **Colour and surfaces:** deep indigo, signal pink, paper/lilac backgrounds and fine lilac rules are now shared across all four surfaces.
- **Information hierarchy:** route evidence and personalised entry checks remain primary; prep remains practical; passport remains a fast public tool; map controls remain map-first.
- **Interaction integrity:** no links, selections, live-map components, dynamic route imagery, readiness components or passport data calls were removed.
- **Responsive integrity:** existing responsive breakpoints remain active; the shared rules only alter visual tokens and panel geometry.

## Findings

No P0, P1 or P2 issues found in the tested pages.

- [P3] A populated saved-trip visual pass is still worthwhile for map planner and prep: it will validate long stop names, 4–6-stop maps and full booking-readiness content in the new frame.

## Checks completed

- [x] Production build, type and lint checks.
- [x] Route-detail visual and console review.
- [x] Passport checker visual review.
- [x] Trip-prep empty-state visual and console review.
- [x] Shared map-planner selectors scoped without touching functionality.

## Comparison history

1. Homepage and builder established the editorial visual vocabulary.
2. Map planner, route detail, trip preparation and passport now consume the same tokens and hierarchy in that order.
3. Functional route and public-checker screens were verified in-browser; no console errors found.

**final result: passed**

# Homepage fidelity follow-up QA

## Comparison target

- **Source visual truth:** the homepage screenshots supplied on 16 August 2026: contained prompt controls, generous visual framing, full-width route photography, complete decision illustrations, and a padded closing banner.
- **Implementation:** `http://localhost:3000/journey/home`.
- **Viewport:** desktop browser viewport. The new prompt footer stacks at the existing mobile breakpoint.

## Evidence

- Prompt: verified a shorter, explicitly illustrative prompt example; controls remain inside a single bounded prompt panel.
- Prompt suggestions: verified a selected suggestion exposes `aria-pressed=true`; the selected values are appended to the capture payload at submit time without overwriting the traveller's typed brief.
- Route photography: verified all three route-image elements have active Unsplash backgrounds and measure 377px within 379px route cards (effectively full width).
- Decision illustrations: verified all three source illustrations fit their panels rather than being vertically clipped.
- Closing banner: verified its copy area retains visible bottom space rather than sitting against the banner edge.
- Option 1 hero emphasis: verified the prompt composer is the dominant action, with a wider field, taller writing area, and contained primary button.
- Hero composition: desktop proportions now follow the selected mock more closely: a broad left composer column, larger supporting route illustration, and a single contained route strip beneath it.
- Hero illustration: verified it remains supportive on the right without overlapping the prompt or route section below.
- Shape-plan controls: verified the chips remain inside the composer so selections are visible before route creation.

## Required fidelity surfaces

- **Prompt hierarchy:** label, free text, optional shape choices and submit action sit in one clear reading order.
- **Photography:** the image frame is a real full-width card area, with `cover` framing rather than a content-width strip.
- **Illustration framing:** triptych panels render at the panel aspect ratio so their intended scenes remain legible.
- **Interaction integrity:** no routes or prompt capture flow was removed; suggestion choices are additive structured context.
- **Responsive integrity:** prompt footer becomes a vertical, full-width-action layout at the existing narrow breakpoint.

## Findings

No P0, P1 or P2 issues found in the tested homepage.

- [P3] A slow-network visual pass would be useful to observe the initial route-photo loading state before Unsplash responses arrive.

## Checks completed

- [x] Production build, type and lint checks.
- [x] Desktop homepage visual review.
- [x] Prompt-suggestion selection state.
- [x] Route-photo width measurement and loaded-image verification.
- [x] Decision-illustration and closing-banner frame verification.
- [x] Option 1 hero prominence and containment review.

## Comparison history

1. The updated homepage preserves the editorial visual vocabulary.
2. The prompt is now an interaction-first unit rather than an overlapping text area and button.
3. Image and illustration framing has been constrained at the component level, so it does not depend on old homepage CSS ordering.

**final result: passed**

---

# Canonical Map Planner reference-match QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 20, 2026, 07_43_08 PM.png`.
- **Implementation:** `http://127.0.0.1:3008/journey/plan?trip=trip-ba678a2d-8461-4e9d-bd41-d4adc828c06b`.
- **States compared:** populated Lisbon trip; Plan and Stay; selected accommodation result; desktop, tablet and phone compositions.
- **Captured evidence:** `/private/tmp/morrovia-map-planner-final-1077.png` and `/private/tmp/morrovia-map-planner-final-390.png`.

## Required fidelity surfaces

- One compact journey strip replaces the previous stacked trip title, action toolbar and daily strip.
- The destination rail remains compact while Shape the day occupies the left side of the local map.
- The map remains the dominant canvas, with a concise Trip Health summary on the right.
- Plan, Stay, Eat and See share one responsive workspace; mobile uses the same workspace as a bottom sheet.
- Stay results and map markers share selection state in both directions.

## Comparison history

1. The first rendered pass retained late-loading dock rules, leaving Shape the day bottom-centred and the right rail visually detached. The dock geometry was replaced with the reference's upper-left sheet and compact right summary.
2. The first responsive pass exposed an overly broad `[class*="planner-map"]` selector that sized accommodation markers like the full map canvas. The selector now targets only the map root, restoring compact markers at 768px, 390px and 320px.
3. The initial finder merge produced duplicate hotel rows and construction-category results. Candidate normalisation now deduplicates results, removes unsuitable Stay categories and selects the strongest named property without changing save or booking plumbing.
4. Final desktop and mobile passes verified local Lisbon framing, internally scrolling content, tab switching, selected-result marker focus and zero page-level horizontal overflow.

## Findings and limitations

- No P0 or P1 visual or interaction defect remains in the tested canonical planner states.
- The current local-search response does not provide hotel photography, ratings or live prices. The implementation deliberately shows only reliable existing data instead of fabricating the richer commercial content present in the reference.
- Map tiles can take several seconds to settle after a cold local reload; the existing map canvas remains available and no error state is shown during that provider load.

## Checks completed

- [x] Desktop composition and proportions visually compared with the supplied reference.
- [x] 768px shared bottom-sheet composition.
- [x] 390px and 320px tab layout, map underlay and horizontal-overflow checks.
- [x] Plan / Stay / Eat / See tab switching.
- [x] Stay result to map selection and map marker to Stay result selection.
- [x] Existing trip, booking, readiness and persistence handlers retained.
- [x] Typecheck, focused trip tests, production build and diff checks.

**final result: passed**

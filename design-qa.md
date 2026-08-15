**Findings**

- No actionable P0, P1, or P2 differences for the requested change.
  Scope: homepage hero at `/journey/home`.
  Evidence: the source hero pairs a left-side prompt with a Portugal–Spain–Morocco route visual and an itinerary strip; the browser-rendered implementation uses the same composition, a Lisbon → Seville → Marrakech illustrated route, and a three-stop transfer/nights strip.
  Accepted implementation difference: the mock's static chips are a functioning free-text trip prompt. This keeps the existing prompt-first creation flow rather than replacing it with non-functional visual controls.

**Open Questions**

- The source mock uses a simplified public-navigation header. The implementation preserves the existing signed-in-aware navigation, language control, Trips and Stamps access. This is intentionally outside the requested hero-only scope.

**Implementation Checklist**

- [x] Add a destination-specific illustrated route asset rather than a generic product screenshot.
- [x] Add stop order, nights, transfer duration and transport mode beneath the illustration.
- [x] Reframe hero copy around route confidence and trade-offs.
- [x] Keep the homepage prompt and route links functional.
- [x] Verify browser rendering and check console errors.

**Follow-up Polish**

- [P3] If the public-navigation redesign is approved, align the primary navigation with the lighter mock header while retaining language and signed-in account access.

---

### QA evidence

- **Source visual truth:** `/Users/shaun/Documents/Moro design/Codex Image Aug 15, 2026, 08_19_02 AM.png`
- **Implementation screenshot:** `/Users/shaun/Documents/Morrovia/homepage-implementation.png`
- **Implementation URL:** `http://localhost:3010/journey/home`
- **Viewport:** default in-app-browser desktop viewport, `1280 × 720 CSS px`, device scale factor `1`.
- **Source pixels:** `1487 × 1058`; **implementation pixels:** `1280 × 720`. No density adjustment was required for the visual review; comparison focused on the above-the-fold hero region rather than browser chrome or the mock's full-page crop.
- **State:** English homepage, default empty prompt, desktop.
- **Full-view comparison:** checked hero hierarchy, two-column layout, map placement, itinerary strip and CTA.
- **Focused region comparison:** checked the hero illustration and stop strip; the source's Lisbon, Seville and Marrakech route is represented by a purpose-built route illustration rather than a placeholder or code-drawn substitute.
- **Primary interaction checked:** prompt is present and the `Shape my route` CTA is enabled; multi-country route link is present.
- **Console errors checked:** none.

### Fidelity surfaces

- **Fonts and typography:** implementation uses a large serif display heading and compact uppercase pink eyebrow to match the source hierarchy; functional prompt copy stays legible at standard UI sizing.
- **Spacing and layout rhythm:** implementation keeps a balanced desktop two-column hero, roomy hero margin and a separate, bordered itinerary strip beneath the map.
- **Colors and visual tokens:** deep indigo, pale lilac background, restrained pink accents and low-contrast borders match the supplied visual direction.
- **Image quality and asset fidelity:** the map is a dedicated raster illustration with Portugal, Spain, Morocco, markers and intercity route; it is not a gradient/placeholder substitute.
- **Copy and content:** hero wording now communicates the route-and-trade-off proposition; the supplied map's stops and journey data are mirrored in the route strip.

### Comparison history

1. Initial implementation review: no P0/P1/P2 issues found within the requested right and bottom hero scope; no visual-fidelity iteration was required.

**final result: passed**

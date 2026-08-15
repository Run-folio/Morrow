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
- **Mobile follow-up:** rendered at `390 × 844 CSS px` after the wordmark update. The hero is a single-column flow; the prompt CTA remains visible and reachable, the illustration scales to the content width, and the fixed mobile dock does not obscure the primary action. Evidence: `/Users/shaun/Documents/Morrovia/homepage-mobile-after-logo.png`.

### Fidelity surfaces

- **Fonts and typography:** implementation uses a large serif display heading and compact uppercase pink eyebrow to match the source hierarchy; functional prompt copy stays legible at standard UI sizing.
- **Spacing and layout rhythm:** implementation keeps a balanced desktop two-column hero, roomy hero margin and a separate, bordered itinerary strip beneath the map.
- **Colors and visual tokens:** deep indigo, pale lilac background, restrained pink accents and low-contrast borders match the supplied visual direction.
- **Image quality and asset fidelity:** the map is a dedicated raster illustration with Portugal, Spain, Morocco, markers and intercity route; it is not a gradient/placeholder substitute.
- **Copy and content:** hero wording now communicates the route-and-trade-off proposition; the supplied map's stops and journey data are mirrored in the route strip.

### Comparison history

1. Initial implementation review: no P0/P1/P2 issues found within the requested right and bottom hero scope; no visual-fidelity iteration was required.
2. Mobile + wordmark follow-up: replaced the legacy wave mark with the serif Morrovia wordmark and pink sparkle. At 390px the header reduces to the wordmark and the existing dock supplies navigation; no P0/P1/P2 issues found.
3. Full landing-page follow-up: a new Southeast Asia illustration initially retained the Iberia stop strip. **[P1] Content mismatch:** the geographical illustration and route metadata described different trips. Fixed by changing the strip to Bangkok → Hoi An → Siem Reap with matching flight legs and nights. Post-fix browser evidence: `/Users/shaun/Documents/Morrovia/homepage-full-redesign-preview.png`.

### Landing-page follow-up evidence

- Public desktop navigation now presents How it works, Routes, Passport guide and Sign in, while the existing language/account submenu remains available through Menu.
- The live homepage prompt remains the same `HomeTripStarter` component: it retains prompt parsing, structured handoff and all existing analytics. A local API request to `/api/journey-capture` returned HTTP 200 for a three-country prompt.
- Generated hero illustration: `/Users/shaun/Documents/Morrovia/public/journey/illustrations/southeast-asia-route-hero.png`.

### Full reference-page fidelity follow-up

- Reworked the homepage into the reference page's complete content sequence: editorial route hero, prompt, route strip, benefits rail, multi-country route cards, decision-process illustrations, useful-before-book cards, closing illustrated CTA and footer.
- Replaced generic visual panels with the dedicated triptych assets in `public/journey/illustrations/route-card-triptych.png`, `decision-triptych.png` and `prep-triptych.png`.
- Header and main content now share a verified 1180px desktop grid: both the wordmark and hero begin at `50px` in the 1280px review viewport.
- Mobile review at `390 × 844` confirmed that the hero changes to a single column: copy and working prompt appear before the illustration, with no map overlap.
- Prompt behaviour remains functional: the free-text capture endpoint, structured local-storage handoff, analytics and builder navigation were preserved. Only its label and CTA were brought into line with the supplied reference.
- Build verification: `npm run build:check` completed successfully after these changes.

**final result: passed**

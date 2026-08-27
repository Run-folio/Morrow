# Map workspace composition refinement QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/Screenshot 2026-08-27 at 12.51.22 PM.png` (2047 × 980), `/Users/shaun/Downloads/Screenshot 2026-08-27 at 12.53.29 PM.png` (2048 × 1053), and `/Users/shaun/Downloads/Screenshot 2026-08-27 at 12.56.02 PM.png` (686 × 422). These are current-state/problem evidence rather than a literal visual clone target.
- **Implementation:** deterministic `Composition*` stories under `Components/Trip map workspace` at `http://localhost:6010`.
- **Browser-rendered evidence:** `artifacts/map-composition-refinement/desktop-destination-selected.png`, `tablet-768.png`, and `mobile-390.png`; the desktop content-normalized crop is `desktop-left.jpg` (1821 × 1133).
- **Combined comparison evidence:** `http://localhost:6010/qa/comparison.html` and `artifacts/map-composition-refinement/source-to-refinement-comparison.png` place the supplied current-state screenshot and refined implementation in one comparison input.
- **Viewport and density:** desktop was exercised at 1821 × 1133 CSS px, tablet at 768 × 1024 CSS px, and mobile at 391 × 867 CSS px. The in-app Browser capture controller reported `devicePixelRatio: 0.75` and returned host-scaled rasters (2428 × 1511, 1024 × 1365, and 520 × 1155 respectively); visual judgments use the reported CSS geometry and content-normalized desktop crop rather than treating host density/canvas padding as product drift.
- **State:** Golden Triangle fixture with selected destination, provider-backed hotel/restaurant/place no-image fallbacks, Stay results, short/long Shape the day, keyboard focus, fullscreen, tablet, and mobile states.

## Required fidelity surfaces

- **Fonts and typography:** current Morrovia display, UI, and metadata roles remain unchanged. Panel relocation does not alter heading scale, optical weight, compact labels, wrapping, or truncation.
- **Spacing and layout rhythm:** wide desktop now has three stable tracks—selected detail on the left, uninterrupted map in the centre, and content-driven Shape the day on the right. Whole route sits with Fullscreen and overflow in the stop strip. Panel max-heights keep long content inside internal scrolling instead of expanding the map workspace.
- **Colors and visual tokens:** all new hover, pressed, focus, border, shadow, and filled next-day treatments use existing `--morrovia-*` semantic tokens. The canonical pink route and indigo actions remain unchanged.
- **Image quality and asset fidelity:** destination imagery continues to use existing provider-backed assets and attribution. Current accommodation and local-place response contracts expose no verified property/place photo, so hotel, restaurant, and provider-place states deliberately render their existing no-image fallback rather than inventing or misattributing imagery.
- **Copy and content:** canonical stop, route, day, provider, booking, and map copy remains intact. The Next footer retains `Next`, date, and destination while gaining a clearer filled action affordance.

## Interaction, responsiveness, and focused evidence

- Whole route uses the existing overview camera reset and reports `aria-pressed`; it is keyboard reachable beside Fullscreen and overflow.
- Destination/place context, Shape the day, zoom, pin, co-pilot, transfer, persistence, camera, and MapLibre behavior remain on the existing architecture.
- The long-day story measured a 613px internal plan viewport with 650px scroll content and `overflow-y: auto`; the short-day panel remains content-driven.
- The provider hotel story rendered the selected provider heading with zero contextual images, confirming the explicit no-image state.
- The 768px story retains the existing contextual-card/day-launcher adaptation; the 391px story retains the mobile destination sheet. Fullscreen still renders both selected detail and Shape the day.
- Focused regions did not require separate image crops because panel type, controls, and provider fallback details were directly readable in the live deterministic stories; the browser DOM/geometry probes supplemented the full-view comparison for focus, scrolling, image absence, and responsive behavior.

## Findings

- No actionable P0, P1, or P2 visual, interaction, accessibility, or responsive mismatch remains in the reviewed composition states.
- Accepted data limitation: `/api/journey-accommodation-search` and `/api/journey-local-search` do not currently return verified image URLs. Property/restaurant imagery therefore remains absent until those provider contracts expose attributable assets.
- P3: the in-app Browser's host-scaled captures include extra canvas padding at some controller sizes. CSS viewport measurements and content crops confirm this is capture tooling, not product overflow.

## Comparison history

1. The supplied current state showed Shape the day competing with selected destination/place cards on the left and Whole route floating over the map. The refinement moved the selected detail left, Shape the day right, and Whole route into the existing top action cluster.
2. The first live desktop inspection confirmed both panels were present but the host capture initially clipped the right side. DOM geometry and a density-normalized re-capture confirmed the requested three-track hierarchy without product overflow.
3. Tablet, mobile, fullscreen, long-content, keyboard-focus, Stay-results, and provider-no-image stories were then reviewed. No post-comparison P0/P1/P2 product fix was required.

**final result: passed**

---

# Remaining legacy Map capabilities restoration QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Desktop/Screenshot 2026-08-27 at 11.10.45 AM.png` for the branded wide-map composition, `/Users/shaun/Desktop/Screenshot 2026-08-27 at 11.17.23 AM.png` for the complete Add pin composer, and `/Users/shaun/Desktop/Screenshot 2026-08-27 at 11.17.10 AM.png` for the rich destination treatment.
- **Implementation:** deterministic restoration stories under `Components/Trip map workspace`, led by `InitialBrandedOverview`, `AddPinNameLocation`, and `RichDestinationFullscreen`, served from `http://localhost:6010`.
- **Browser-rendered evidence:** `artifacts/map-capability-restoration/01-branded-overview.png`, `02-detailed-basemap.png`, `03-add-pin-composer.png`, `04-rich-fullscreen.png`, `05-mobile-overview.png`, `06-mobile-pin-composer.png`, and `07-mobile-rich-fullscreen.png`.
- **Combined comparison evidence:** `http://localhost:6010/qa/overview.html`, `http://localhost:6010/qa/pin.html`, and `http://localhost:6010/qa/rich.html` place the supplied references and browser-rendered implementation together for the final visual judgment.
- **Viewport and normalization:** desktop evidence used a 1707 × 960 CSS viewport at density 1. Mobile was reviewed at 390 × 844 CSS px; the Browser output is 693 × 1500 device pixels because of its approximately 1.777 capture density. Mobile judgments use the reported CSS layout and same-state render rather than treating device-pixel density as a visual mismatch.

## Required fidelity surfaces

- **Map language and transition:** at route overview zoom the single MapLibre canvas now renders white land, light-grey water and fine lavender country outlines with the canonical pink route, transport markers and destination image card. CARTO street detail fades in progressively between regional and local zooms; there is no second map or lifecycle handoff.
- **Layout and hierarchy:** the current TripShell, stop strip, Shape the day, Trip Health, route inspection and Luna co-pilot remain intact. Fullscreen uses the recovered destination editorial panel beside Shape the day, while the closed state deliberately contracts to the current compact context card.
- **Add pin workflow:** the compact entry point is always reachable in the planning Map. Choose location, map click, draft marker, category selection, naming, save, selected-pin context, rename and delete all reuse the original hierarchy and copy. Competing destination and leg cards are suppressed only while the composer is active.
- **Typography and tokens:** current Morrovia display, UI and metadata roles remain unchanged. Spacing, borders, focus treatment, indigo/pink states, shadows and surface colours use the existing semantic tokens rather than reintroducing historical EasyT styling.
- **Images and copy:** the rich destination panel uses the trip's real provider-backed destination image, attribution, concise description, facts and transfer context. The missing-description story verifies the panel remains useful without fabricated fallback prose.
- **Responsive behaviour:** the branded overview, detailed map, pin composer and rich destination states were checked at 390px. The rich fullscreen panel becomes one intentional modal sheet, and the active composer removes collisions with map previews and contextual cards.

## Interaction, persistence and accessibility evidence

- Map controls, destinations, transfer markers, pins and compact launchers remain keyboard-reachable native controls with meaningful labels and visible focus treatment.
- A saved pin is written to `trip.brief.mapPins` through the existing trip update path, participates in device recovery and cloud-save feedback, survives the deterministic reload story, and can be renamed or deleted without altering the canonical route.
- The single MapLibre instance retains the canonical route/order, transport inspection, current stop selection and zoom/camera behaviour. Detail-to-overview reset collapses fullscreen destination context without replacing the map.
- The focused presentation suite covers the one-instance invariant, branded layers and zoom interpolation, original pin add/update/remove persistence calls, fullscreen destination states, escape/focus cleanup, responsive rules and preserved spatial context.
- A clean final story navigation produced no new browser error. The only current console entry is the existing Storybook warning that Next.js runtime config is deprecated; it is unrelated to this restoration.

## Comparison history

1. Pass 1 found a P2 overview-framing mismatch: the restored regional camera was too tight. The overview cap was tested at 4.6 and settled at 5.2, balancing legacy continental context with leg and marker separation for geographically close routes.
2. Pass 1 found a P2 composer collision: a destination preview could remain visible behind Add pin. Destination, transfer and right-context previews are now suppressed while pin placement or naming is active.
3. Pass 2 compared the same three capability states together with their references. No actionable P0, P1 or P2 visual, interaction, accessibility or responsive mismatch remains.

## Findings

- All three requested legacy capabilities are restored inside the current TripShell and current design system.
- Accepted difference: the Golden Triangle fixture uses route-aware regional framing rather than reproducing the Taiwan source geography; this preserves the source capability while keeping the canonical route legible.
- Story-only state inputs exist solely to make acceptance renders deterministic. Production state continues to come from the live trip, MapLibre interactions and the existing persistence pipeline.

**final result: passed**

---

# Map spatial-intelligence restoration QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Desktop/Screenshot 2026-08-27 at 8.10.03 AM.png` for the persistent Shape-the-day + Map hierarchy and `/Users/shaun/Desktop/Screenshot 2026-08-27 at 8.12.40 AM.png` for the route-attached transport and destination-card treatment.
- **Implementation:** static acceptance story `Components/Trip map workspace/GoldenTriangle` at `http://localhost:6010/iframe.html?id=components-trip-map-workspace--golden-triangle&viewMode=story`.
- **Browser-rendered evidence:** `artifacts/map-restoration/whole-route-desktop.jpg`, `transport-selected.jpg`, `destination-highlighted.jpg`, `destination-detail.jpg`, `copilot-open.jpg`, `mobile-390.jpg`, `mobile-390-transport.jpg`, and `mobile-390-shape-day.jpg`.
- **Combined comparison evidence:** `artifacts/map-restoration/comparison-whole-route.jpg` and `comparison-transport.jpg`. Each sheet places the supplied old screenshot and the browser-rendered implementation in the same visual input.
- **Viewport and normalization:** the desktop pass used a 1600 × 1000 effective CSS viewport and the mobile pass used 390 × 844 CSS px. The in-app Browser returned a host-scaled canvas with the populated workspace in the top-left portion; final evidence crops that visible workspace and resamples it to the declared CSS comparison size without changing product content. Raw captures remain beside the final evidence.

## Required fidelity surfaces

- **Layout and hierarchy:** the default desktop state retains the canonical TripShell, stop strip, persistent left Shape-the-day workspace, central spatial route and compact co-pilot entry. The cleaned architecture intentionally omits the old permanent Trip Health column.
- **Route and state colour:** every mapped canonical stop is joined by the same pink route with a white casing and dashed planning overlay. Indigo hover/selection halos preserve route context while distinguishing the active leg.
- **Transport and icons:** train markers sit on the corresponding route midpoints; the selected state opens a dark-indigo spatial card with canonical mode, headline time, route, distance, door-to-door time and planning provenance. Production icons come from Lucide; no custom or substitute SVG art is used.
- **Imagery and content:** only the featured, focused or selected stop exposes its destination card. The explicit Jaipur detail state uses the real trip image plus provider-backed concise copy, Wikipedia description attribution, Wikimedia image attribution, Google Maps and valid Learn More actions.
- **Typography and surfaces:** existing Morrovia display/UI/meta roles, semantic indigo/pink tokens, borders and shadows remain the source of truth. The spatial cards use tighter corners and elevation than generic inspector panels, matching the old Map's information hierarchy without restoring its older styling wholesale.
- **Responsive behavior:** at 390px, the route, stop sequence and transport markers remain readable; destination preview cards are suppressed to avoid control collisions. Transfer facts move to one intentional sheet and Shape the day opens from a compact day control.

## Interaction and accessibility evidence

- Route-leg and stop markers are native buttons with meaningful labels; click/tap, focus and hover expose equivalent spatial states.
- Focus on Jaipur exposed the correctly associated image card without opening rich detail; click then opened the Jaipur-specific detail state.
- Selected transfer, selected destination/place and co-pilot states suppress competing contextual cards; Escape cleanup and focus restoration remain covered in the Map presentation tests.
- The mobile transfer sheet retained canonical facts and the mobile Shape-the-day trigger exposed `aria-expanded`, its controlled sheet, tabs and canonical Day 1 content.
- No visible auth alert, duplicate compass, permanent Add Pin control, duplicate Trip Health panel or overlapping destination card remained in the acceptance story.

## Comparison history

1. The first reopened render exposed a genuine runtime failure: MapLibre controls loaded, but the GeoJSON route did not because the default worker URL returned 404. A public MapLibre worker bundle and explicit worker URL restored the vector layers.
2. With the route visible, MapLibre marker DOM was offset from the vector canvas because later CSS changed marker buttons to relative positioning. Restoring absolute marker positioning aligned stops and transport markers with the route.
3. The first exact-390 pass exposed the desktop destination preview beneath mobile zoom controls. Mobile now hides that progressive preview and keeps the route/transport hierarchy clean; the explicit destination state remains available by tap.
4. The final combined comparison confirms the restored implementation matches the old experience in function and hierarchy: trip-planning workspace, spatially connected route, route-attached transport, destination imagery and directly inspectable context.

## Findings

- No actionable P0, P1 or P2 visual, interaction, accessibility or responsive mismatch remains in the reviewed states.
- P3 accepted difference: the Golden Triangle route is framed more tightly than the old Europe-wide reference because all three canonical stops are geographically close; this materially improves sequence legibility while preserving route-first camera behavior.
- The static provider fixture exists only to make the provider-backed detail state deterministic in Storybook. Production continues to use `/api/journey-place` and its independent image/summary provider fallbacks.

**final result: passed**

---

# Stamps reliability and country-marking QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/Screenshot 2026-08-25 at 8.12.36 AM.png` (2048 × 1304 px) for the current Morrovia desktop shell, map, summary and filters; `/Users/shaun/Downloads/WhatsApp Image 2026-08-07 at 15.08.43 (2).jpeg` (600 × 1332 px) for the continent and exposed row-action interaction.
- **Implementation:** Storybook `Morrovia/Stamps/EstablishedTraveller` at `http://localhost:6006/iframe.html?id=morrovia-stamps--established-traveller&viewMode=story`.
- **Browser-rendered evidence:** `artifacts/stamps-reliability/implementation-1440.png`, `implementation-768.png`, `implementation-390.png`, and `implementation-320.png`.
- **Combined comparison evidence:** `artifacts/stamps-reliability/comparison-desktop.png` and `comparison-mobile-actions.png`.
- **Viewport and density:** 1440 × 1000, 768 × 900, 390 × 844, and 320 × 780 CSS px. The in-app Browser reported DPR 2 while returning CSS-sized PNGs with the page drawn at half scale; `*-normalized.png` files crop the populated top-left half and resample it to the reported CSS capture size solely for visual comparison.
- **State:** established signed-in fixture with visited, want-to-visit and memory data; responsive geometry was also checked at the required empty widths through the existing stories.

## Required fidelity surfaces

- **Fonts and typography:** existing Morrovia display, UI and metadata fonts remain unchanged. Continent headers use the established display role; row copy uses the existing compact UI hierarchy.
- **Spacing and layout rhythm:** the current map/workspace proportions remain intact, with the explorer widened to 450px on wide desktop and 410px before the stacked breakpoint. Rows retain a compact rhythm while preserving 44 × 44px action targets.
- **Colors and visual tokens:** active Visited uses `--morrovia-success`; active Want to visit uses `--morrovia-action`; inactive controls, focus rings, warnings and errors use existing semantic tokens.
- **Image quality and assets:** the production world-atlas map and Unicode country flags are preserved. No reference imagery, logo or non-standard icon was replaced by drawn CSS/SVG art; row actions use the project’s existing Lucide icon dependency.
- **Copy and content:** every row exposes flag, country, Not yet/Visited/Want to visit, Visited toggle and Want-to-visit toggle. Active accessible labels explain removal.

## Full-view and focused comparison evidence

- The desktop combined comparison confirms the existing hero, summaries, map, selected-country card, filters and scrollable explorer remain the dominant composition; the intentional changes are the wider explorer and grouped rows.
- The mobile focused comparison confirms the previous design’s continent summary plus visible circular check/plus actions are restored inside the current Morrovia filters and navigation.
- Focused responsive geometry found no page-level horizontal overflow at 320, 390 or 768px. The explorer precedes the map below 900px, and row action buttons measure exactly 44 × 44 CSS px at 320 and 390px.

## Interaction and accessibility evidence

- Continent disclosure changes `aria-expanded` and hides/shows its controlled list.
- Search for Japan automatically exposed the matching Asia section.
- Clicking active Want to visit returned Japan to Unmarked; clicking again restored Want to visit.
- Region and status filters continued to reduce the canonical country set without empty groups.
- Row controls are native buttons with `aria-pressed`, active/remove labels, tooltips, visible focus treatment and a labelled status group.
- Browser console contained no implementation errors; only Storybook’s existing Next.js runtime-config deprecation warning appeared.

## Comparison history

1. The starting implementation used a flat 197-country list and a hidden status select, while a failed composite load displayed cached counts/map state as current.
2. The first implementation restored continent grouping and exposed actions, separated primary stamp-state loading from secondary memories, added stale-data disclosure, and rolled failed writes back.
3. Responsive inspection confirmed the 450px desktop panel, list-first stacked order, 44px mobile targets, bottom list padding and zero horizontal overflow. No post-capture P0/P1/P2 fix was required.

## Findings

- No actionable P0, P1 or P2 visual or interaction mismatch remains.
- P3: at 320px, long country names intentionally ellipsize to preserve status text and both 44px primary actions.
- Environment limitation: signed-in staging could not be replayed because no staging credential or `.env.staging` connection is available in the workspace; production was not accessed or modified.

**final result: passed**

---

+# Homepage fidelity follow-up QA

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

# Approved illustrated homepage hero QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 22, 2026, 07_12_30 AM.png` (1680×934).
- **Implementation:** `http://127.0.0.1:3008/journey/home`.
- **Captured evidence:** in-app Browser captures from this implementation task; the Browser API did not expose a filesystem path.
- **Viewport states:** 1680×934 desktop, 1280px laptop, 768px tablet and 390px phone.

## Required fidelity surfaces

- The desktop hero uses the approved 37/63 editorial-to-illustration balance, with the headline held to exactly two lines.
- The prompt is one compact interaction card with voice, dates, travellers, interests and the existing submission behavior preserved.
- The watercolor route remains a free-floating illustration rather than a rectangular image card and includes four numbered route markers.
- The overlapping route strip keeps every stop name visible and presents the approved nights, transfers, country and stop summary.
- The existing public navigation and the remainder of the homepage remain unchanged.

## Comparison history

1. The first like-for-like render was too narrow, wrapped the headline to three lines and left the route art and strip visually secondary. The hero width, column balance, type scale and illustration sizing were corrected.
2. A fractional-grid typo compressed the illustration at laptop width. The grid now uses `37fr / 63fr`, preserving the approved emphasis at desktop and laptop sizes.
3. The initial phone pass exposed 19px of document overflow. The homepage now clips only incidental horizontal artwork overflow while the content width remains 390px.

## Checks completed

- [x] Desktop visual comparison at the source's 1680×934 CSS viewport.
- [x] 1280px, 768px and 390px responsive layout and horizontal-overflow checks.
- [x] Exact two-line headline and visible pink underline treatment.
- [x] Full Bangkok → Siem Reap → Phnom Penh → Ho Chi Minh City route content.
- [x] Date and interest controls open correctly; no browser-console errors.
- [x] Typecheck, production build and diff checks.

**final result: passed**

---

# Homepage hero v2 route QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 22, 2026, 06_54_03 AM.png`.
- **Implementation:** `app/journey/home/home-hero-tools.tsx`, `app/journey/home/home-trip-starter.tsx`, and `app/journey/home/home.module.css`.
- **Route artwork:** `public/journey/illustrations/southeast-asia-route-hero-v2.png`.

## Checks completed

- [x] Restored the illustrated, two-column “Complex trips, made simple.” composition instead of the photographic destination hero.
- [x] Updated the route to Bangkok → Siem Reap → Phnom Penh → Ho Chi Minh City, with Angkor Wat visually central in the watercolor illustration.
- [x] Added all four stops, three transfer labels, and the 11 nights / 3 transfers / 3 countries / 4 stops summary to the route strip.
- [x] Kept date, traveller and interest controls inside the existing trip prompt and preserved the existing builder-draft handoff.
- [x] Restored the matching three-value benefit rail and applied mobile route-strip stacking rules.
- [x] Typecheck, production build and diff checks passed.

**final result: passed**

---

# Homepage cinematic hero refinement QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 21, 2026, 06_32_52 PM.png` (1536 × 1024 px).
- **Implementation:** `http://127.0.0.1:3009/journey/home`.
- **Browser-rendered evidence:** `/private/tmp/morrovia-home-1440.png` (1778 × 1234 px), `/private/tmp/morrovia-home-768.png` (948 × 1263 px), and `/private/tmp/morrovia-home-390.png` (481 × 1041 px).
- **Responsive states:** large desktop, standard laptop, 768px tablet and 390px phone. The in-app browser applies host display scaling (reported DPR 0.9), so CSS geometry and overflow were also read from the rendered page rather than inferred from capture pixels alone.
- **State:** English guest homepage with the trip starter collapsed and the example itinerary visible.

## Required fidelity surfaces

- **Typography:** the requested two-line editorial headline is materially closer to the concept and no longer creates the prior oversized four-line block.
- **Spacing and layout:** the hero now uses a taller cinematic frame, a compact trip starter and a larger itinerary preview positioned inward from the right edge.
- **Colours and tokens:** existing Morrovia indigo, signal pink, neutral glass surfaces, focus treatment and restrained shadow tokens are retained.
- **Image quality:** the existing high-resolution Asia dawn asset is preserved; the crop keeps the central mountain and boat visible while a narrower, softer left fade supports copy readability.
- **Copy:** eyebrow, headline, body and three benefit labels match the requested content.

## Comparison history

1. The starting implementation used an oversized four-line headline, a broad opaque fade and a smaller right-edge itinerary card, which reduced the photograph to a background treatment.
2. The refinement changed the headline to two lines, narrowed the readability fade, increased the hero and itinerary scale, compacted the starter, and moved the preview inward.
3. The post-fix browser captures confirm that the mountain, water and boat remain visible on desktop, while tablet and mobile use a single stacked flow with no page-level horizontal overflow.

## Focused evidence

- The desktop full-view capture was sufficient to read headline wrapping, hero crop, trip-starter density, itinerary scale and lower-rail placement together.
- Tablet and phone captures were used as focused responsive evidence for the stack, crop, sticky navigation and mobile-dock relationship.

## Checks completed

- [x] Sticky production navigation retained at desktop, tablet and phone widths.
- [x] Exact requested English hero copy and two-line headline treatment.
- [x] Trip starter remains functional; opening Add dates exposes the existing two date inputs.
- [x] Date, traveller, interest, voice and submit controls remain present.
- [x] Example itinerary remains a coherent single journey preview.
- [x] No horizontal overflow at 1440-class desktop, 1280-class laptop, 768px tablet or 390px phone.
- [x] Browser console checked with no errors in the tested state.
- [x] Typecheck, production build and diff checks passed.

## Accepted differences

- The production navigation and control geometry remain the existing live Morrovia components rather than the looser illustrative treatment in the concept.
- Tablet and phone stack the itinerary below the starter so the photography and controls do not compete; this intentionally differs from the desktop overlay composition.

**final result: passed**

---

# Discover corrected-reference QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 21, 2026, 07_10_39 PM.png` (1128 × 1408 supplied desktop composition).
- **Implementation:** `http://127.0.0.1:3009/journey/discover`.
- **Browser-rendered evidence:** Codex in-app Browser full-page desktop capture at a 1600px CSS viewport and mobile viewport capture at a 433px effective CSS width.
- **States compared:** default curated Discover view, expanded See-all route view, selected filter state, and mobile stacked hero.

## Required fidelity surfaces

- **Typography:** Morrovia display and UI roles preserve the reference hierarchy, including the compact editorial section headings and italic pink-underlined “sense”.
- **Spacing and layout:** the framed hero, two-row filter bar, five-card quick picks, dominant story, three supporting stories, shallow style rail, six collection tiles and slim closing banner follow the corrected reference’s dense editorial rhythm.
- **Colour and tokens:** existing Morrovia ink, signal, line, tint, paper, action and focus semantics are used throughout.
- **Image quality:** existing production route photography remains the data-backed source; the hero uses the strongest available warm Japanese evening street image rather than fabricating a pagoda photograph.
- **Copy and content:** the approved Discover headline, route copy, filters, section labels and featured-route details remain intact.

## Comparison history

1. Replaced the previous oversized marketing composition with the corrected reference’s compact framed editorial hero and smaller far-right featured card.
2. Tightened route, story, style and collection cards to match the source density and varied section proportions.
3. Collapsed the full route catalogue behind the existing “See all” controls so the default page ends at the compact collections and pink banner, while preserving access to every route.
4. Switched the hero to the warmer existing Japanese evening image and verified the mobile card stacks beneath the hero copy without page-level horizontal overflow.

## Interaction and responsive evidence

- Region, feeling and country filters remain interactive and backed by the existing route set.
- “See all” reveals the complete filtered route catalogue; route links and CTAs retain their production destinations.
- Desktop rendered without horizontal overflow at 1600px.
- Mobile rendered without horizontal overflow at the effective 433px browser viewport; navigation, hero actions, featured card, filters and mobile dock remain reachable.
- The existing development server logged a recoverable stale-module SSR/HMR error and switched to client rendering; the optimized production build completed successfully and the rendered Discover interactions remained functional.

## Findings

- No actionable P0, P1 or P2 mismatch remains.
- P3: the available production hero photograph is a warm Japanese old-town street rather than the reference’s exact sunset pagoda composition; retaining a real existing asset avoids introducing unsupported or fabricated imagery.

**final result: passed**

---

# Discover editorial redesign QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 21, 2026, 06_32_52 PM.png` (1536 × 1024, used for Morrovia art direction and hierarchy rather than Discover information architecture).
- **Implementation:** `http://127.0.0.1:3009/journey/discover`.
- **Browser-rendered evidence:** `/private/tmp/morrovia-discover-desktop.png` at a 1440 × 1000 CSS viewport and `/private/tmp/morrovia-discover-mobile.png` at a 390 × 844 CSS viewport, device scale 1.
- **States compared:** default filters, Asia filter selected, desktop hero/filters/quick picks and mobile hero/featured-route stack.

## Required fidelity surfaces

- **Typography:** current Morrovia display, UI and metadata roles are preserved; the headline and section hierarchy match the approved editorial direction.
- **Spacing and layout rhythm:** the desktop hero protects the photograph and moves the featured route to the far right; mobile stacks the feature card below the copy and actions.
- **Colours and tokens:** deep ink, action blue, pink signal, paper, line, tint and focus styles resolve through existing `--morrovia-*` semantics.
- **Image quality:** the existing Takayama street photograph provides the requested Japanese street direction with a soft white copy gradient; route cards use the existing curated/live photo pipeline.
- **Copy and content:** required hero, feature-card, section and closing-banner copy is present. Existing route data remains the source for route descriptions and metadata.

## Full-view and focused comparison evidence

- The source and rendered desktop hero were reviewed together in the same comparison input. The implementation intentionally translates the source homepage aesthetic into Discover rather than reproducing its homepage planner controls.
- Focused mobile review confirmed the underline treatment, CTA hierarchy, featured-card stack, public header and persistent dock all remain readable without horizontal overflow.
- Focused filter review confirmed the real route count changes from 74 to 19 when Asia is selected and returns correctly when Everywhere is restored.

## Comparison history

1. The first desktop composition allowed the hero's declared width and horizontal padding to add together. `box-sizing:border-box` was applied to keep the featured card within the approved far-right boundary.
2. The post-fix pass measured document and hero bounds at 390, 768 and 1440 pixels; all three matched their viewport width without horizontal overflow.
3. Final visual review found no remaining actionable P0, P1 or P2 issue. The source's warmer panoramic landscape differs intentionally because the Discover brief explicitly requests a Japanese pagoda/street direction.

## Interaction and console checks

- Public navigation and route-link destinations remain unchanged.
- Region, feeling and country filters remain keyboard-operable native controls.
- Horizontal browsing rails preserve touch scrolling and scroll snapping.
- No application console error was observed in the reviewed default and filtered states.

**final result: passed**

---

# Map Planner visual and interaction refinement QA

## Comparison target

- **Source visual truth:** `/var/folders/gb/_l8hxm017mv0z46jd1lprhwr0000gn/T/TemporaryItems/NSIRD_screencaptureui_xMpZOW/Screenshot 2026-08-21 at 6.56.10 PM.png`.
- **Implementation:** `http://127.0.0.1:3009/journey/plan?trip=trip-a6c4aa4d-b600-4ae1-bdf9-7667fe706d20`.
- **Captured evidence:** `/private/tmp/morrovia-map-planner-1440.png`, `/private/tmp/morrovia-map-planner-390.png`, and `/private/tmp/morrovia-map-planner-comparison.png`.
- **Viewport and state coverage:** populated Cusco trip at 1440×900, 768×900, 390×844 and 320×700; Plan and Stay; selected Stay marker; compact and expanded Trip Health.

## Required fidelity surfaces

- The approved journey strip, compact destination rail, Shape-the-day geometry, local map and right-side Trip Health placement remain structurally unchanged.
- Shared Morrovia display, UI, metadata, action, focus, status and surface tokens continue to define the workspace.
- Stay markers use one compact map-specific language: white unselected surfaces with a pink bed icon and a clearly selected pink marker with a restrained halo.
- The basemap stays geographically useful while reducing contrast and saturation behind planner content.
- Trip Health rows expose one contextual detail surface, including keyboard focus and Escape handling; mobile reuses the existing trip-status entry and overlay rather than duplicating the summary.

## Comparison history

1. The first refinement pass gave Trip Health rows disclosure affordances and contextual details but left the existing compact status summary hidden on small screens. The existing mobile trip-status trigger now opens that same summary and detail state.
2. A temporary mobile trigger created two visible status entry points. It was removed from the closed state, leaving only the established Shape-the-day status entry; the in-panel control is shown only as the close affordance while the overlay is open.
3. The original mobile status overlay occupied only the narrow map gap above Shape the day. It now uses the existing overlay layer above the mobile dock, remains internally scrollable and introduces no document-level overflow.
4. The final side-by-side review confirms the approved composition remains intact while marker hierarchy, map quietness, typography and actionable Trip Health are more coherent.

## Checks completed

- [x] Desktop comparison with the supplied current implementation.
- [x] 768px, 390px and 320px layout, touch-target and horizontal-overflow checks.
- [x] Result-to-marker and marker-to-result selected-state plumbing retained.
- [x] Trip Health Accommodation detail, focus restoration target and Escape close behavior.
- [x] Single mobile trip-status entry, shared detail content and dock-safe overlay.
- [x] Typecheck, trip-health tests, booking-readiness tests, production build and diff check.

**final result: passed**

---

# Homepage hero redesign QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 21, 2026, 06_32_52 PM.png`.
- **Implementation:** `http://127.0.0.1:3008/journey/home`.
- **Captured evidence:** `/private/tmp/morrovia-home-hero-1440.png`, `/private/tmp/morrovia-home-hero-390.png`, and the side-by-side comparison `/private/tmp/morrovia-home-hero-comparison.png`.
- **Viewport states:** desktop (1440px) and mobile (390px).

## Required fidelity surfaces

- Atmospheric travel photography keeps the strongest landscape detail to the centre and right, with a calm light-reading surface behind the copy.
- The editorial headline uses only the final word for the Morrovia pink organic underline treatment.
- The conversational trip brief remains the primary conversion interaction; speech, dates, travellers and interests all remain available before submission.
- The example itinerary is a lightweight, non-transactional Bali → Krabi → Kyoto preview rather than a fake route drawn on the photograph.
- The lower three-column rail explains the traveller benefit without repeating the hero benefit language.

## Comparison history

1. Replaced the isolated, geographically misleading route illustration with a real generated Southeast Asian landscape asset and a left-to-right readability gradient.
2. Reframed the hero around the primary task: describe a trip, optionally add context, then start planning.
3. Compared the reference and implementation side-by-side at the desktop hero state; verified the new hierarchy, restrained preview card and route-free travel imagery.
4. Verified the 390px stack has no horizontal overflow and preserves the public mobile navigation, prompt controls and example itinerary as consecutive touch-friendly sections.

## Checks completed

- [x] Desktop and mobile visual comparison against the supplied direction.
- [x] Headline, eyebrow, supporting copy and non-fabricated social-proof copy.
- [x] Primary prompt, voice input, date controls, traveller controls and interest toggles.
- [x] Homepage draft carries dates, travellers and interests into the existing builder handoff.
- [x] Example itinerary content, photo thumbnails, bordered translucent card and transfer footer.
- [x] Complementary lower benefits rail.
- [x] Typecheck, production build and diff checks.

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

---

# Itinerary design QA

- Source visual truth: `/Users/shaun/Downloads/Morrovia Cusco Itinerary Dashboard.png`
- Implementation screenshot: `/private/tmp/morrovia-itinerary-qa/itinerary-implementation-desktop.png`
- Focused comparison: `/private/tmp/morrovia-itinerary-qa/itinerary-design-comparison.png`
- Mobile evidence: `/private/tmp/morrovia-itinerary-qa/itinerary-implementation-mobile-320.png`
- Legacy evidence: `/private/tmp/morrovia-itinerary-qa/itinerary-legacy-verification.png`
- State: day 1 selected, shell itinerary presentation; legacy presentation checked separately
- Source dimensions: 1536 × 1024 px at supplied density
- Implementation dimensions: 1306 × 900 px, 1306 × 900 CSS viewport, device scale factor 1
- Normalization: the approved itinerary body (source x 50, y 299, 1436 × 617) was scaled to the implementation body width and stacked with the implementation crop in the focused comparison.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: Morrovia's current Georgia display face and Geist UI/meta faces reproduce the approved serif/UI hierarchy. The selected-day title, eyebrow, rail labels, and metadata weights now align closely with the mock.
- Spacing and layout rhythm: the desktop composition preserves the approximate 31/69 day-rail/content split, restrained selected surface, wide image, compact detail rows, and bottom day navigation. The body is intentionally self-contained beneath TripShell.
- Colors and tokens: all new shell styling uses current `--morrovia-*` semantic indigo, pink, lilac, line, radius, and focus tokens.
- Image quality: the story uses the existing Peru route image fixture; production prioritizes the saved plan-item image, then the existing Morrovia editorial media pack, then the existing place-image endpoint, with a no-image fallback.
- Copy and content: all itinerary titles, summaries, notes, stop names, dates, and transfer durations come from the canonical trip. The mock's `Day options`, row expanders, and `Add day` are not reproduced because the current production itinerary has no equivalent capability and this task forbids inventing new editing behaviour.

## Interaction and responsive evidence

- Day 4 selection rendered `Travel to Sacred Valley` and the existing 1h 15m incoming transfer.
- Next moved to `Explore Sacred Valley`; Previous returned to day 4.
- No document overflow at 320, 390, 430, 768, or 1306 CSS px.
- Mobile uses the existing compact direction: a horizontally scrollable day selector above the selected-day content.
- Shell, mobile, and legacy Storybook previews reported no console errors.

## Comparison history

1. Initial pass found a P1 mobile intrinsic-width overflow: the single-column grid retained desktop min-content width and clipped the page. Fixed with a `minmax(0, 1fr)` responsive track plus explicit width/min-width constraints. Post-fix evidence shows viewport and document widths equal at all requested breakpoints.
2. Initial desktop pass found P2 density drift: the selected-day image and detail rows were taller than the approved body. Reduced the desktop image to a wide 205px maximum, tightened detail rows, and adjusted the display-title scale. The second focused comparison shows the main regions and vertical rhythm aligned.

## Follow-up polish

- P3: production image subject and crop will vary with the traveller's saved itinerary; this is expected and preferable to hard-coding the mock's Cusco photograph.
- P3: the implementation omits mock-only editing controls until an existing production behavior can be reused safely.

final result: passed

---

# Product-wide visual design-system drift audit — 2026-08-27

## Scope and baseline

Checked the current coded Morrovia foundation in `app/journey/journey-design.css`, the foundations and controls Storybook stories, and the production-facing Homepage, Tour, Trips dashboard, Overview, Itinerary, Map, Prep, Passport, Stamps, and Profile/auth surfaces. The baseline is: display (`--morrovia-display` + `--morrovia-ink`), UI/body (`--morrovia-ui`), muted (`--morrovia-muted`/`--morrovia-ink-soft`), meta (`--morrovia-meta` + `--morrovia-signal`), paper/lilac surfaces, line dividers, and the shared action/control tokens.

## Evidence and findings

- Homepage and route collection: the final visible layer mixed direct near-match ink/pink/muted values and direct Georgia declarations with the semantic values used by the hero and shared controls.
- Trips dashboard: card, divider, metadata, display-heading, and muted-text roles used undefined local aliases with fallback values rather than the corresponding shared tokens.
- Profile/auth and Prep: the established layouts had legacy final overrides for paper, rail, heading, meta, and border roles. The relevant visible auth/Prep roles could be normalized without moving markup or changing controls.
- Tour, Passport, Stamps, Overview, Itinerary, and Map: the current production components already resolve display/UI/meta typography, paper/card/rail surfaces, dividers, statuses, and CTA variants through the shared Morrovia layer. No low-risk code change was needed.
- The local authenticated trip workspace remained on its `Opening your trip…` loading state during a 5.5-second direct-URL check, so the existing static/component audit was used for Overview/Itinerary/Map role coverage and the runtime loading state is recorded separately below. This is not treated as a visual-token pass.

## Low-risk fixes applied

- Homepage route collection now maps eyebrow/meta, display headings, secondary copy, action links, card borders, and image fallback surfaces to existing Morrovia semantic tokens.
- Dashboard now maps border/divider, strong-border, muted body, display, and meta roles to the existing Morrovia semantic tokens; intentional white card surfaces remain unchanged.
- Profile/auth and Prep now map their visible paper, display, meta, muted, border, panel, and action roles to the existing Morrovia tokens without structural changes.
- Builder Step 1 and Step 2 continue to share the same `stepHero` and `BuilderSummaryRail` semantic token layer: display ink, UI/muted text, signal meta labels, paper/lilac surfaces, line dividers, and shared controls. No per-step matching rule remains.

## Deferred design work

- Define an explicit shared white-card/surface token before removing the dashboard's intentional `#fff` panel fallbacks. Reusing paper there would visibly alter the elevation hierarchy, and introducing a new token is outside this low-risk pass.
- Give dark rails an explicit on-ink text token and audit the Prep rail's inherited heading contrast as a focused accessibility/design task. No existing on-ink semantic token is available, so this pass did not invent one.
- Consolidate the long legacy CSS layers in Homepage, Account, and Prep after a component-level visual regression pass; the visible final roles are normalized, but broad cleanup would be structural work.
- Investigate the authenticated workspace's persistent production `Opening your trip…` state before taking a final visual capture of Overview, Itinerary, and Map. The audit did not change that state or its loading logic.

## Result

No redesign was introduced. Equivalent visible roles now use the same existing Morrovia typography, colour, border, and action tokens where a safe direct substitution existed; broader token-model and rail-contrast work is explicitly deferred.

---

## Builder identity and visual-system QA — 2026-08-27

### Scope and references

- Builder Step 1 reference: `artifacts/builder-qa/reference-step1.png`
- Builder Step 2 reference: `artifacts/builder-qa/reference-step2.png`
- Step 1 comparison: `artifacts/builder-qa/step1-reference-after-comparison.png`
- Step 2 comparison: `artifacts/builder-qa/step2-reference-after-comparison.png`
- Responsive captures: `builder-step1-390-after.png`, `builder-step2-390-after.png`

### Iteration 1

1. **P1 · content/trust · Step 1 geography review duplicated confirmed stops.** The reference showed Marrakech and Fes as both confirmed route stops and review cards, while Chefchaouen was incorrectly unresolved despite reviewed route coordinates. Root cause: public-route handoff passed operational stop strings and coordinates without the canonical IDs used by Place Intelligence, then rendered every captured mention in the review section. Fix: canonical Morocco identities now travel through public-route handoff and review is derived only from attention states.
2. **P1 · layout/system · Step 1 and Step 2 used separate summary-rail markup and typography overrides.** Fix: both steps now render one `BuilderSummaryRail`, and the shared step hero uses the Morrovia display/meta/UI tokens.
3. **P1 · behavior/accessibility · Starting point and Stops accepted raw strings without an inspectable canonical choice.** Fix: both fields now use one catalog-backed combobox with contextual labels, listbox semantics, visible focus, Arrow Up/Down, Enter and Escape handling, loading/no-result states, duplicate rejection, and 44px-plus mobile result rows.
4. **P2 · responsiveness · a stop suggestion menu could become unusable if clipped by the review card at narrow widths.** Fix: the menu is anchored to the field with an overlay layer, bounded viewport height, and scroll. At 320px its measured bounds were left `45.7`, right `274.3`, bottom `491.6` within a `320 × 800` viewport.

### Iteration 2 verification

- Step 1 and Step 2 were compared side by side against the supplied references at desktop size after the shared hierarchy and canonical-state fixes.
- Browser geometry at 320, 390, 768, 1024 and 1440 CSS pixels reported document width equal to viewport width, with no horizontal scrolling.
- The Morocco route now renders Marrakech, Fes and Chefchaouen as confident canonical stops; the geography-review section disappears without leaving an empty band.
- Faro origin selection and Lisbon stop selection were exercised in the rendered combobox; keyboard selection and Escape closure behaved as labelled.
- Step 1 and Step 2 retain the same shell, rail order, copy roles and bottom action layout; the rail hides at the established tablet breakpoint.
- Focused Builder, Place Intelligence, curated/public route and persistence suites passed. Typecheck, production build, Storybook build and `git diff --check` passed.

### Findings

No actionable P0, P1 or P2 visual, identity or interaction mismatch remains in the tested states.

**final result: passed**

---

# Builder Step 2 — Dates and nights QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 26, 2026, 01_22_16 PM.png` (1448 × 1086 px, expanded route/timing state) and `/Users/shaun/Downloads/ChatGPT Image Aug 26, 2026, 01_46_51 PM.png` (1448 × 1086 px, compact warning state).
- **Implementation:** `http://localhost:3000/journey/new?homeDraft=1`, backed by `app/journey/new/trip-builder.tsx` and `app/journey/new/trip-builder.module.css`.
- **Browser-rendered evidence:** `artifacts/builder-time-step-approved/after-320.png`, `after-390.png`, `after-768.png`, `after-1024.png`, `after-1440.png`, and `warning-expanded-1440.png`.
- **Combined comparison:** `artifacts/builder-time-step-approved/design-comparison.png`; both source and implementation were normalized into 720 × 540 cells. The implementation cells use the populated builder frame rather than the in-app Browser's unused host-canvas area.
- **Responsive viewports:** 320 × 812, 390 × 844, 768 × 1024, 1024 × 900, and 1440 × 900 CSS px. The Browser host captured a larger DPR-scaled canvas, so `after-*-focused.png` files crop the tested viewport only; layout decisions were checked against semantic DOM and rendered CSS geometry, not inferred from PNG dimensions.
- **States:** truthful three-stop draft; default factual state with route insights expanded; disclosures collapsed/reopened; blocking zero-night conflict expanded and focused; restored valid allocation; return to Places and back to Dates and nights with state preserved.

## Capability and product-truth boundary

- Dates, travellers, budget preference, stop order, night allocation, locks/constraints, scored route candidates, transfer estimates, usable time, persistence, and final validation come directly from existing builder/planner data.
- Average transfer, total usable days, flagged backtracking count, and candidate improvement are safely derived from those existing values.
- Live fares, live timetables, and unvalidated alternative routes are unavailable and are not shown. When no scored, constraint-safe candidate can be applied, the warning offers **Review route** back to Places instead of fabricating an alternative.

## Required fidelity surfaces

- **Typography and copy:** exact STEP 2 OF 2 lockup, source-aligned display headline scale, exact supporting sentence, Morrovia display/UI/meta roles, and no decorative underline or period.
- **Layout and rhythm:** shared two-step shell, compact dates/travellers/budget row, allocation line, compact four-column nights table, expandable route intelligence, warning disclosure, persistent footer, and desktop trip-at-a-glance rail.
- **Colors and components:** existing Morrovia semantic ink, signal, action, line, tint, warning, success, focus, button, icon, radius, and shadow tokens remain the implementation source.
- **Data and imagery:** no decorative illustration was introduced. Every visible route claim is grounded in the current draft or existing planner output.
- **Responsive behavior:** desktop keeps the reference's main/rail split; tablet stacks the rail after the main content; 320/390 use stacked controls and stop rows with visible transfer, night, usable-time, and reorder affordances. Night and reorder controls retain 44 px touch targets.
- **Accessibility:** semantic table roles and column headers, specific night-control labels, keyboard stop reordering, disclosure state, blocking alert focus, native control semantics, and text labels independent of color were verified.

## Full-view and focused comparison evidence

- The combined desktop comparison confirms the source hierarchy: completed Places step, active Dates and nights step, compact data controls, allocation status, dense nights table, route insight disclosure, contextual warning, trip rail, and footer action.
- The blocking comparison intentionally differs in content because the tested draft has no validated alternative candidate; it shows the required truthful **Review route** fallback and disables Build trip.
- Focused 320, 390, 768, 1024, and 1440 captures confirm there is no page-level horizontal overflow, clipped table content, overlap between the footer and builder content, or inaccessible mobile control.

## Interaction and browser evidence

- Opened and dismissed the date picker; changed travellers 2 → 3 → 2; opened and dismissed budget choices.
- Collapsed and reopened Route insights.
- Reordered stops with ArrowDown and restored them with state intact.
- Returned to Places and then Dates and nights; starting point, stops, dates, nights, travellers, and budget state remained intact.
- Set Edinburgh to zero nights: the blocking warning expanded, received focus, displayed the existing validator reason, exposed Review route, and disabled Build trip. Restoring nights removed the warning and re-enabled Build trip.
- The rendered page showed no Next.js runtime error overlay or browser-visible application error during the checked states.

## Comparison history

1. The first implementation comparison found a P2 desktop typography mismatch: the headline was materially larger than the approved source. Its clamp was reduced to the source-aligned 42–48 px range.
2. The first 390 px pass found a P2 mobile hierarchy issue: a legacy flex `order` moved allocation status below the table and narrow grid tracks cramped night controls. The Step 2 responsive rules now restore reading order and reserve explicit width for 44 px night/reorder controls.
3. The refreshed combined and responsive comparisons show no remaining actionable P0, P1, or P2 visual, interaction, state, or accessibility mismatch.

## Findings

- No actionable P0, P1, or P2 issue remains.
- Accepted state difference: evidence uses the real three-stop local draft instead of the reference's illustrative five-stop Spain draft.
- Accepted capability difference: the warning does not invent or display unvalidated alternatives when the existing route engine has none it can safely apply.

final result: passed

---

# Homepage two-column hero restoration QA

## Comparison target

- **Source visual truth:** `/var/folders/gb/_l8hxm017mv0z46jd1lprhwr0000gn/T/TemporaryItems/NSIRD_screencaptureui_FxUear/Screenshot 2026-08-26 at 1.19.07 PM.png` (2994 × 1450 px, Retina desktop capture).
- **Implementation:** `http://localhost:3000/journey/home`.
- **Before evidence:** `artifacts/home-hero-two-column/before-single-column.png` (1132 × 1294 px), showing the route illustration and practical trip strip absent from the hero.
- **After evidence:** `artifacts/home-hero-two-column/after-desktop-1440.png` (1408 × 900 capture from a 1440 × 900 CSS viewport), `after-tablet-768.png`, `after-mobile-390.png`, and `after-mobile-320.png`.
- **Combined comparison:** `artifacts/home-hero-two-column/comparison-source-after-desktop.png` places the approved screenshot and final browser render in one image.
- **State:** English guest homepage, default empty trip prompt, desktop and responsive navigation states.

## Full-view and focused comparison evidence

- The combined desktop comparison confirms the source hierarchy is restored: compact prompt-led left column, free-floating four-stop watercolor route on the right, and a practical itinerary strip below the illustration.
- The focused 390px capture confirms the same two content sides are preserved as a deliberate stack. The route artwork, all four cities, nights, transfers, countries and stop totals remain readable without document overflow.
- Browser geometry reported document width equal to viewport width at 1440, 768, 390 and 320px. The right-side illustration and strip remain fully inside their responsive container.

## Required fidelity surfaces

- **Fonts and typography:** existing Morrovia display, UI and metadata fonts remain unchanged. The headline retains its two-line wrap, pink underline and current production copy.
- **Spacing and layout rhythm:** desktop uses the approved 37/63 prompt-to-route balance. The prompt was returned to compact field, pill and footer proportions so it no longer competes with or pushes below the route preview.
- **Colors and visual tokens:** existing Morrovia ink, signal, action, paper, line, lilac and shadow tokens are retained.
- **Image quality and asset fidelity:** the existing high-resolution `southeast-asia-route-hero-v3.png` asset is restored without regeneration, stretching or CSS approximation. It uses intrinsic aspect-ratio sizing and remains sharp at each tested width.
- **Copy and content:** Bangkok, Siem Reap, Phnom Penh and Ho Chi Minh City plus 11 nights / 3 transfers / 3 countries / 4 stops match the supplied reference and localized copy model.
- **Interaction and accessibility:** voice, date, traveller, interest and shared primary-button behavior are unchanged. Add dates exposes two date inputs with `aria-expanded`; the typed prompt remains editable. Browser console reported no errors.

## Comparison history

1. **P1:** the initial build rendered only the oversized editorial left column because the previous commit removed the route markup and all `.heroRoute*` layout rules. The existing watercolor asset remained in `public/` but had no consumer. Restored the shared hero route structure, stop strip and icon-backed totals.
2. **P2:** the first restoration retained the single-column Figma prompt scale, leaving an excessively tall field and oversized pills beside the route. Restored the compact homepage prompt geometry while retaining the shared Storybook button component and all form behavior.
3. The final browser pass confirms the two-column source composition at desktop, a complete stacked composition at 768/390/320, zero horizontal overflow, working prompt controls and no console errors.

## Findings

No actionable P0, P1 or P2 mismatch remains. The production navigation and live homepage sections below the hero intentionally remain unchanged from the current Morrovia application.

final result: passed

---

# Homepage prompt → Builder Step 1 handoff design QA

- Approved visual source: `/Users/shaun/Downloads/ChatGPT Image Aug 26, 2026, 12_40_36 PM.png`
- Current-state evidence: `/Users/shaun/Desktop/Screenshot 2026-08-26 at 11.31.55 AM.png`
- Local implementation: `http://localhost:3000/journey/new?homeDraft=1`
- Final desktop capture: `/Users/shaun/Documents/Morrovia/artifacts/builder-handoff-approved/after/desktop-1440.png`
- Final 390px capture: `/Users/shaun/Documents/Morrovia/artifacts/builder-handoff-approved/after/mobile-390.png`
- Combined comparison input: `/Users/shaun/Documents/Morrovia/artifacts/builder-handoff-approved/comparison/approved-vs-implemented.png`
- Additional responsive evidence: `/Users/shaun/Documents/Morrovia/artifacts/builder-handoff-approved/after/mobile-320.png`, `/Users/shaun/Documents/Morrovia/artifacts/builder-handoff-approved/after/tablet-768.png`, and `/Users/shaun/Documents/Morrovia/artifacts/builder-handoff-approved/after/tablet-1024.png`
- State evidence: `advanced-fixed-plan-1440.png`, `route-recommendation-1440.png`, `blocking-place-1440.png`, and `direct-new-trip-390.png` in the same `after` directory
- Source dimensions: 1446 × 1087 px
- Desktop implementation viewport: 1440 × 1087 CSS px; capture is 1408 × 1087 px because the in-app browser reserves 32 px for its own surface chrome
- Verified viewports: 320, 390, 768, 1024, and 1440 CSS px
- Primary state: homepage prompt handoff, English, Lisbon origin, four Spain stops, two travellers, 18-day preference, resolved place review, healthy route

## Findings

No actionable P0, P1, or P2 typography, layout, token, image, responsive, accessibility, or interaction issue remains.

- Typography and hierarchy: Step 1 uses the approved heading and supporting copy, with the title lockup above the first review control. The homepage handoff no longer repeats intake messaging.
- Layout and rhythm: the compact stepper, individual Starting point and Stops cards, compact optional preference treatment, collapsed Advanced row, quiet Route Check, illustration band, saved state, CTA, and concise rail follow the approved composition.
- Responsive behavior: document width equals viewport width at every verified size. At 320px all stop names remain fully legible, touch controls remain at least 36 × 44 px, and the interaction order remains origin → stops → preferences → Advanced → Route Check → CTA → summary.
- Asset quality: `builder-route-watercolor.png` is a 1881 × 836 raster export rendered with intrinsic aspect ratio and `object-fit: cover`; it is never stretched. It contains a generic Morrovia route landscape, four route markers, and no landmark-specific promise.
- Shared behavior: direct New trip, refresh, curated route entry, fixed plans, route-order choices, unresolved-place gating, persistence messaging, and Step 2 use the existing canonical state and mutations.

## Interaction, accessibility, and state evidence

- Homepage submission was exercised through the live prompt and arrived at `/journey/new?homeDraft=1`; no raw prompt is repeated on the review screen.
- Advanced exposes `aria-expanded`, is collapsed by default, preserves a saved fixed plan, and changes the route status to `Your fixed plans are protected.`
- Healthy routes show exactly `Your route flows well.`; a deliberately inefficient route exposes both `Use this order` and `Keep my order`.
- Ambiguous Granada evidence remained visible and disabled `Set dates & nights` until the place was resolved.
- The enabled CTA advanced to the existing Step 2 `Make the time feel right.` surface.
- Direct `/journey/new` and refresh each rendered one `Tell us the shape` heading above the prompt at desktop and 390px.
- The curated `?route=morocco-rail` entry retained the standard Builder presentation rather than receiving homepage-handoff styling.
- No horizontal overflow was found at 320, 390, 768, 1024, or 1440px.

## Comparison history

1. The legacy handoff reused the full Step 1 editor, including a second intake-style header, dense geography presentation, oversized route-decision surface, persistent footer, and long summary rail. It was replaced with a state-scoped review presentation while retaining the same canonical mutations and gates.
2. The first responsive pass kept stop names from clipping but truncated them at 320px. The redundant mobile drag glyph was removed, move controls were compacted, and all four names now render in full.
3. The generic Builder tablet breakpoint stacked and centered Route Check. The homepage handoff now restores the approved horizontal status treatment through 768px and retains the stacked action layout only on narrow phones.
4. The final side-by-side comparison tightened the desktop headline and shortened the homepage-only rail to `Dates next` and city-only stop labels.

## Validation and accepted differences

- Focused Builder gate/layout tests, homepage route tests, browser persistence tests, analytics tests, typecheck, production build, and `git diff --check` passed.
- The generated illustration is intentionally not a pixel clone of the approved artwork. It follows the same global watercolor route concept without inventing a recognisable destination or making the screen feel like a country-specific campaign.
- The final evidence has an 18-day preference chip because it was derived from the real homepage prompt; the approved mock's example state omitted preferences.
- The resolved Granada stop is appended after resolution by existing canonical place logic, so the evidence order differs from the illustrative mock while interaction and route validation remain truthful.

final result: passed

---

# Approved homepage hero QA — Codex ready

## Comparison target

- **Source visual truth:** `/var/folders/gb/_l8hxm017mv0z46jd1lprhwr0000gn/T/TemporaryItems/NSIRD_screencaptureui_xVUyid/Screenshot 2026-08-26 at 10.56.40 AM.png` (1132 × 1294 px), supplied as the approved export of the Figma frame “Homepage - Morrovia” on the “Codex ready” page.
- **Implementation:** `http://localhost:3000/journey/home`.
- **Browser-rendered evidence:** `artifacts/homepage-hero-figma/after/desktop.png`, `390.png`, `320.png`, and `768.png`.
- **Combined comparison evidence:** `artifacts/homepage-hero-figma/comparison-desktop.png` and `comparison-form.png`.
- **Viewport and density:** 1132 × 1294 desktop, 768 × 1024 tablet, 390 × 1000 phone, and 320 × 900 phone at reported DPR 1. The in-app Browser returned CSS-sized screenshots with the page rasterized at half scale in the top-left; normalized files crop that populated half and resample it to the reported CSS viewport solely for like-for-like visual comparison. Rendered CSS geometry is recorded in `artifacts/homepage-hero-figma/after/render-metrics.json`.
- **State:** English guest homepage, empty prompt, voice support available, attribute panels closed.

## Required fidelity surfaces

- **Fonts and typography:** the existing Morrovia display, UI and metadata fonts are preserved. The two-line 140px desktop display lockup, 1.02 line height, negative tracking and pink underline match the reference hierarchy and wrapping; mobile scales to the same two-line hierarchy without overflow.
- **Spacing and layout rhythm:** the desktop hero is 956px wide and left aligned within the frame; the trip card is 916 × 578px. Eyebrow, title, lede and card starts align with the approved composition. The prompt is 846 × 252px against the 848 × 252px reference region.
- **Colors and visual tokens:** ink, soft ink, signal pink, action indigo, paper and line colors use the current Morrovia semantic tokens.
- **Image quality and assets:** the approved hero contains no raster imagery. Existing Lucide calendar, traveller, heart, microphone and arrow icons are retained; no replacement CSS or handcrafted SVG art was introduced.
- **Copy and content:** eyebrow, headline, supporting copy, prompt guidance, label, pills and primary action match the approved English frame. Morrovia retains the requested emphasis.

## Full-view and focused comparison evidence

- The desktop side-by-side comparison confirms the approved single-column hero replaces the previous two-column route illustration, while preserving the rest of the homepage below the hero.
- The focused form comparison confirms the label, prompt frame, two-line guidance, Speak placement, attribute pills and right-aligned primary action follow the approved structure.
- The primary action intentionally uses the existing Storybook `EasyTButton` large variant without local visual overrides, as explicitly required. Its label/arrow order is adjusted structurally, not through a new button style.

## Interaction and accessibility evidence

- Date, traveller and interest controls open and close at 390px without horizontal overflow; the form expands to 523px, 452px and 468px respectively in the tested states.
- A real homepage submission with “Ten days in Japan, Tokyo and Kyoto, relaxed pace.” navigated to `/journey/new?homeDraft=1`; Step 1 rendered and the builder exposed Tokyo and Kyoto in the understood route.
- Voice control, native textarea label, loading/disabled state, focus treatment, analytics calls and draft persistence remain wired through their existing components and handlers.
- Browser console reported no errors in the final homepage state.

## Comparison history

1. **P1:** the starting hero was a dense two-column layout with a route illustration and a generic multi-part prompt, materially different from the approved frame. Replaced it with the approved single editorial column and focused trip-entry card while preserving behaviour.
2. **P2:** the first form pass placed the prompt and controls 8–16px too low and left the Speak control and pills materially smaller than the source. Reduced the card’s top rhythm, fixed the prompt to 252px, and matched Speak/pill dimensions and positions.
3. **Post-fix:** desktop region starts, card size, prompt size, Speak placement and pill dimensions now align with the source. Responsive checks at 320, 390, 768 and desktop report no horizontal overflow.

## Findings

- No actionable P0, P1 or P2 visual or interaction mismatch remains.
- Accepted constraint: the primary action keeps the existing Storybook large-control geometry instead of introducing a one-off Figma-only button treatment.
- The named Figma page/frame was not queried directly because no node-specific Figma URL was supplied; the attached approved frame export was used as the exact visual source.

final result: passed

---

# Hostile cloud/provider follow-up verification

- Scope: post-P0/P1 regression verification only; no product or trip-data mutation was performed.
- Cloud/session fixture matrix: 76 persistence, ownership, session-expiry, deep-link return, retry, conflict, lifecycle and readiness cases passed.
- Shared visible-facts matrix: 9 hostile cases passed, including empty plans, invalid/missing/reversed dates, repeated stops, unknown transport, no-driving, transfer severity, coverage and shared Trip Health projections.
- Live provider probes: one read-only request per route returned usable configured Unsplash image/context metadata and OpenStreetMap results; stay fallback correctly reported check-only availability and no live inventory claim.
- Responsive local checks: Dashboard sign-in boundary plus Map, Prep, Passport and Stamps were checked at 320, 390, 768 and desktop widths. All had zero page-level horizontal overflow. Dashboard correctly redirected an unauthenticated request to login.
- Image fallback: route-image parsing/fallback tests passed; malformed and unavailable provider responses settle without fabricating imagery.

## Remaining hardening

- P2: repeat the visual signed-in production pass once the connected-browser control path is stable. A production Morrovia tab was available, but read-only control timed out before it could be claimed; fixture coverage was used for authenticated session expiry, exact return targets, cloud/local conflicts, and ended/current/future lifecycle states. Do not work around this by clearing cookies, logging out a real account, or mutating a cloud trip.
- P3: add a reusable browser-level image-error fixture for each image-bearing surface (Map, itinerary, Stamps) so broken remote-image rendering is exercised alongside the existing route-photo provider parsing coverage.
- P3: retain the current bounded provider timeouts and fallback semantics; if provider observability is expanded, record aggregate source/fallback/timeout counts only, never query text, account data, booking data, or full trip documents.

final result: passed with P2 production-browser follow-up

---

# Routes / Route Detail premium refinement design QA

## Comparison target and evidence

- Source visual truth: `/Users/shaun/Downloads/ChatGPT Image Aug 23, 2026, 02_33_05 PM.png`.
- Browser-rendered implementation: `http://127.0.0.1:3001/journey/routes/andean-highlands`.
- Desktop evidence: `/Users/shaun/Documents/Morrovia/artifacts/route-detail-premium/route-detail-1440.png` and `/Users/shaun/Documents/Morrovia/artifacts/route-detail-premium/route-detail-1440-full.png`.
- Responsive evidence: `/Users/shaun/Documents/Morrovia/artifacts/route-detail-premium/route-detail-1728.png` and `/Users/shaun/Documents/Morrovia/artifacts/route-detail-premium/route-detail-390.png`.
- Combined same-input evidence: `/Users/shaun/Documents/Morrovia/artifacts/route-detail-premium/comparison-top.png` and `/Users/shaun/Documents/Morrovia/artifacts/route-detail-premium/comparison-full.png`.
- State: English, signed-out public route; analytics declined; live route map and all nine requested route/stop/attraction image surfaces loaded.
- Source dimensions: 1122 × 1402 supplied pixels.
- Implementation CSS viewports: 1440 × 1000, 1728 × 600, 768 × 800, and 390 × 844. The 1440 document measured 1440 × 2709 CSS px.
- Capture normalization: the in-app browser reported device scale 0.9 and fit the emulated page into its host pane. The live 800 × 556 desktop stage was normalized to the declared 1440 × 1000 CSS viewport; the 800 × 1505 document stage was normalized to 1440 × 2709. The mobile 217 × 469 live stage was normalized to 390 × 844. No page geometry was inferred from the normalized bitmap alone: rendered DOM width, height, section bounds, scroll width, and overflow were read from the page.

## Full-view and focused comparison findings

- Typography and hierarchy: the implementation preserves the reference's compact navigation, pink editorial eyebrow, three-line serif title, concise proposition, restrained metadata, and dominant primary CTA.
- Spacing and layout: the final desktop hero measures 432 px high at 1440, followed by the map/glance split, connected stop sequence, compact itinerary, attractions, planning notes, and closing CTA in the approved order.
- Colours and tokens: all surfaces resolve through the current Morrovia paper, ink, signal, action, line, tint, focus, radius, and typography tokens. No legacy EasyT visual language was reintroduced.
- Images and maps: the live route photograph, destination-specific stop imagery, correctly associated attraction imagery, MapLibre basemap, ordered markers, route line, attribution, and source credits render without placeholder art or fabricated logos.
- Copy and factual integrity: unsupported save behavior, ratings, review counts, partners, prices, certifications, expert claims, and exact transfer promises are absent. The yellow `Worth knowing` panel is intentionally additional to the mock because the reviewed Andean route contains a real uncertainty.
- Density normalization: the source compresses the complete story into a shorter editorial board. The implementation keeps the same information architecture while retaining production-readable body type, real provenance notes, warnings, and source links, so its full document is longer. The like-for-like top comparison shows the approved hero/map proportions directly; the full comparison verifies sequence and section parity.

## Interaction, accessibility, responsive, and route-state evidence

- The guest `Plan this route` CTA navigated to `/journey/new?homeDraft=1&inspire=andean-highlands` and the real builder retained Cusco → Sacred Valley → Arequipa, 9 days, route pacing, interests, and the Sacred Valley base-selection requirement.
- Live map zoom-in and zoom-out controls were exercised successfully. The ordered textual route list remains available alongside the map.
- The final route page produced no browser-console errors. Development-only warnings were limited to Fast Refresh and Next.js's existing smooth-scroll advisory.
- Document width equalled viewport width at 390, 768, 1440, and 1728 CSS px. No page-level horizontal overflow was found.
- Portugal and Japan rendered at 768 without overflow. The four-stop Vietnam/Cambodia route rendered at 1440 with its incomplete/uncertain state disclosed and without invented transfer detail.
- Headings, landmarks, button/link names, focus-visible treatment, image labels, map region/status semantics, source-link labels, and non-colour warning text remain explicit.

## Comparison history

1. The first browser comparison found a 578 px desktop hero caused by a two-row metadata grid and oversized title. The title scale and vertical rhythm were tightened and the supported facts were moved into the reference's four-column desktop structure, reducing the hero to 432 px.
2. The second same-input comparison found the two longest metadata values clipping. Icon columns, gaps, padding, and fact type were tightened without changing the responsive two-column layout.
3. The final top and full comparison inputs found no remaining actionable P0, P1, or P2 typography, layout, token, imagery, copy, responsive, or interaction mismatch.

## Priority findings and accepted differences

- P0: none.
- P1: none.
- P2: none.
- P3: the production hero uses the strongest supported Morrovia route photograph rather than the exact generated concept landscape.
- P3: `Save route` is deliberately omitted because no persisted public-route save capability exists.
- P3: authenticated visual QA was not performed with a signed-in browser session; the CTA itself has no auth branch, and canonical-ID promotion/continuity is covered by the 21 passing persistence tests.
- P3: existing repository warnings remain for multiple lockfiles/module-type inference and generic Storybook chunk size. Route Detail keeps MapLibre out of its initial 274 kB first-load bundle through a viewport-gated dynamic import.

final result: passed

---

# Trip Map workspace final refinement QA

- Source visual truth: `/Users/shaun/Downloads/Cusco Trip Planning Map Dashboard.png` and `/Users/shaun/Desktop/Screenshot 2026-08-23 at 12.12.47 PM.png`
- Before evidence: `artifacts/map-workspace-refinement/before-1024.png`, `artifacts/map-workspace-refinement/before-1440.png`, `artifacts/map-workspace-refinement/before-wide.png`, `artifacts/map-workspace-refinement/before-tablet.png`, and `artifacts/map-workspace-refinement/before-mobile.png`
- After evidence: `artifacts/map-workspace-refinement/after-1024.png`, `artifacts/map-workspace-refinement/after-1440.png`, `artifacts/map-workspace-refinement/after-wide.png`, `artifacts/map-workspace-refinement/after-tablet.png`, and `artifacts/map-workspace-refinement/after-mobile.png`
- Route-overview evidence: `artifacts/map-workspace-refinement/after-1440-route-overview.png`
- Source dimensions: 1672 × 941 px reference and 4332 × 2208 px production-style baseline
- Browser capture dimensions: 1263 × 1111 px at the requested 1024 viewport, 1778 × 1234 px at 1440, 2370 × 1358 px at wide desktop, 948 × 1263 px at tablet, and 481 × 1041 px at mobile. The in-app browser applies host display scaling, so CSS geometry was measured from the rendered page as well as reviewed from the captures.
- State: active planning trip, Map tab, Plan mode, Cusco selected; Sacred Valley selection and full-route overview exercised separately

## Findings

No actionable P0, P1, or P2 differences remain.

- Layout and spacing: the useful desktop Map workspace now caps at 1760px with the existing 24px page-gutter rule. Shape the day remains 360–390px, Trip Health remains 260–280px, and both share the same 14px internal top inset. The toolbar, map and panels read as one bordered surface rather than separate floating regions.
- Viewport rhythm: the desktop shell now resolves between 720px and 860px high. The integrated stop toolbar is 64px on desktop, leaving more vertical room for planning while keeping its stop, add-stop, fullscreen and overflow controls intact.
- Local framing: TripShell detail mode opens at zoom 12 and offsets the selected geography 56px toward the usable center between the unequal side panels. Selecting Sacred Valley updated the active stop and Shape-the-day context while retaining the local detail map.
- Route framing: `View trip overview` switches to the existing route overview and exposes the existing fit-all-destinations control; Cusco, Sacred Valley and Arequipa all remain represented in that fitted route context.
- Focused Map preservation: the integrated `Fullscreen map` link still resolves to `/journey/plan?trip=cusco-sacred-valley-arequipa`. Focused presentation keeps its previous initial zoom and camera behavior.
- Responsive integrity: tablet and mobile retained their exact pre-refinement workspace geometry: 72px toolbar, 720/680px shell rules, and existing bottom sheet. No panel redesign or compact-breakpoint override changed.
- Tokens and visual language: existing Morrovia surface, line, radius, shadow, display, UI, metadata, signal and focus semantics remain unchanged. No new asset, icon system, provider, or fabricated map treatment was introduced.

## Comparison history

1. The baseline allowed the useful workspace to grow to 2200px even though the two panel widths topped out at 390px and 280px. The shell breakout now tops out at 1760px and centers within the existing page gutters.
2. The original desktop shell used a 72px strip and a 640–820px viewport. The final pass uses a denser 64px integrated toolbar and a 720–860px planning viewport, without touching the ≤980px rules.
3. The original local camera used the focused planner's 210px offset and zoom 11. TripShell now uses a panel-balanced 56px offset and zoom 12; the focused/fullscreen Map retains its original camera defaults.
4. The final reference/implementation comparison found the requested containment, panel balance, toolbar continuity and map-height direction present. Dynamic tile labels and route geometry continue to reflect the selected persisted trip rather than the illustrative reference.

## Interaction, accessibility, and console checks

- Stop-selector buttons remain semantic buttons with active-step state; the Sacred Valley stop was selected successfully.
- Full-route and local-detail controls remain labelled and keyboard-reachable.
- Fullscreen Map remains a normal link, preserving browser navigation behavior.
- Browser console review found no runtime errors. The only warning was the project's existing Next.js runtime-config deprecation notice.
- Relevant workspace tests, typecheck, optimized Next.js production build, Storybook production build, and diff checks passed.

## Follow-up polish

- P3: exact basemap labels, route lines and visible place density vary with the persisted trip and live CARTO/OpenStreetMap tiles; the workspace framing is deterministic around those dynamic map contents.

final result: passed

---

# Trip Workspace integration and visual refinement design QA

- Source visual truth: `/Users/shaun/Desktop/Screenshot 2026-08-23 at 8.20.11 AM.png`, `/Users/shaun/Desktop/Screenshot 2026-08-23 at 8.20.25 AM.png`, `/Users/shaun/Desktop/Screenshot 2026-08-23 at 8.20.35 AM.png`, `/Users/shaun/Desktop/Screenshot 2026-08-23 at 8.20.43 AM.png`, and `/Users/shaun/Downloads/Screenshot 2026-08-23 at 8.22.35 AM.png`
- Before captures: `/private/tmp/morrovia-trip-refinement/pre/overview-1440.png`, `/private/tmp/morrovia-trip-refinement/pre/itinerary-1440.png`, `/private/tmp/morrovia-trip-refinement/pre/map-1440.png`, and `/private/tmp/morrovia-trip-refinement/pre/prep-1440.png`
- After captures: `/private/tmp/morrovia-trip-refinement/post/overview-1440.png`, `/private/tmp/morrovia-trip-refinement/post/itinerary-1440.png`, `/private/tmp/morrovia-trip-refinement/post/map-1440.png`, `/private/tmp/morrovia-trip-refinement/post/map-1920-viewport.png`, and `/private/tmp/morrovia-trip-refinement/post/prep-1440.png`
- Side-by-side comparison inputs: `/private/tmp/morrovia-trip-refinement/compare/overview.png`, `/private/tmp/morrovia-trip-refinement/compare/itinerary.png`, `/private/tmp/morrovia-trip-refinement/compare/map.png`, and `/private/tmp/morrovia-trip-refinement/compare/prep.png`
- Responsive evidence: `/private/tmp/morrovia-trip-refinement/post/map-320.png`, `/private/tmp/morrovia-trip-refinement/post/prep-390.png`, `/private/tmp/morrovia-trip-refinement/post/overview-430.png`, `/private/tmp/morrovia-trip-refinement/post/itinerary-768.png`, `/private/tmp/morrovia-trip-refinement/post/map-1024.png`, and `/private/tmp/morrovia-trip-refinement/post/prep-1440.png`

## Findings

No actionable P0, P1, or P2 visual differences remain.

- Cohesion: all four views now share the same denser shell rhythm, deterministic presentation title, navigation spacing, border language, typography, and semantic token usage without changing their underlying jobs.
- Map: the integrated planner escapes the normal shell content cap on desktop while retaining the shell header above it. The map canvas owns the remaining width between a 360–390 px Shape the day panel and a 260–280 px Trip Health panel, and a `ResizeObserver` keeps MapLibre synchronized with container changes.
- Prep: the progress module is roughly one quarter shorter, the repeated context card is removed, urgent and accommodation tasks carry stronger hierarchy, and the practical groups retain a compact readable flow at desktop and mobile widths.
- Itinerary: the hero is about one sixth shorter on desktop and duplicate transfer route/door-to-door copy is suppressed only when the canonical incoming leg already communicates the same facts.
- Accessibility and responsiveness: shell tabs remain at least 56 px tall on the verified desktop/tablet layouts and 60 px on narrow layouts. Browser geometry checks found no document-level horizontal overflow at 320, 390, 430, 768, 1024, 1440, or the wide desktop state.
- Data integrity: user-authored trip titles are preserved. Only the exact legacy generated title shape is converted to the concise origin/ordered-stop presentation title, with case-insensitive duplicate place names removed.

## Interaction and state evidence

- The Map Stay deep link selected Sacred Valley and the Stay tab, and browser Back restored that same contextual state.
- Overview Trip Health links resolved to the canonical affected itinerary day; route cards resolved to days 1, 4, and 6 for their respective stops.
- Prep's primary accommodation action resolved to `/journey/[tripId]/map?stop=sacred-valley&mode=stay` without exposing the stop identifier in visible copy.
- Invalid or stale map/day query values use deterministic first-stop/first-day fallbacks, covered by focused unit tests.
- A fresh Storybook tab rendered the Map canvas with no runtime errors after excluding MapLibre from Vite dependency pre-optimization. The remaining console warning is the project's existing Next.js runtime-config deprecation notice.

## Comparison history

1. The initial comparison confirmed the overall Morrovia direction was already correct but showed an unnecessarily boxed Map, an oversized Itinerary hero, repeated transfer facts, and excess empty space in Prep.
2. The first implementation pass widened the Map, reduced the hero and progress module, removed the redundant Prep context card, and introduced contextual links and deterministic titles.
3. Responsive review found the wide Map transform needed explicit phone compensation; the final CSS keeps the planner flush to the viewport at 320–430 px while returning to normal shell flow below the desktop breakout.
4. The final comparison and interaction pass found no remaining P0/P1/P2 layout, typography, spacing, token, imagery, content, or state issue.

## Follow-up polish

- P3: Map tile labels, route geometry, and crop vary with the live MapLibre tile response and selected trip state.
- P3: the in-app browser's wide screenshot stitching can repeat transformed breakout content outside the first viewport; direct DOM geometry, viewport captures, and responsive screenshots confirm one canvas and no horizontal overflow.

final result: passed

---

# Full Trip Workspace integration QA

- Audit date: 2026-08-22
- Surfaces: Overview, Itinerary, Map, Prep, and shared TripShell
- Browser evidence: `/private/tmp/morrovia-trip-workspace-audit/`
- Viewports: 320, 390, 430, 768, 1024, and 1440 CSS px
- Persisted-data evidence: read-only lookup of two owner-accessible trips plus a trip owned by a different account

## Findings and fixes

- The legacy `trip=` value and persisted repository ID are both canonical `trip-<uuid>` identifiers. No alias or remap layer exists; owner-scoped cloud lookup is exact on `easyt_trips.id`, followed by an exact-ID browser-local fallback for legacy local-only trips.
- Removed a redundant client API retry after the server layout had already completed the owner-scoped cloud lookup. The resolver now performs only the canonical local fallback before returning the Journey not-found state.
- Kept sibling workspaces synchronized after supported Map edits by publishing and consuming a same-document active-trip change event. The event validates the canonical trip shape and exact trip ID before updating shared context.
- Added roving keyboard navigation and tab/panel relationships to Itinerary day tabs and Map planning tabs.
- Added progressbar semantics to Prep and raised undersized mobile day, task, finder-tab, and Map control targets to 44 CSS px.
- Wrapped Overview and Itinerary stories in the complete TripShell so future Storybook review exercises shared composition, navigation, and links rather than isolated bodies only.

## Evidence

- All four complete shell stories rendered with the correct active tab, exact edit link, and same-trip fullscreen Map link.
- No document-level horizontal overflow was found on any of the four workspaces at 320, 390, 430, 768, 1024, or 1440 CSS px.
- Empty, ready, urgent, missing-date, missing-image, long-copy, travel-day, and legacy-presentation states remained usable.
- The signed-out real-route smoke test reached the existing authentication gate for all four deep links. The available in-app browser had no authenticated session, so an authenticated persisted-trip click-through remains the only browser evidence gap.
- Typecheck, 126 deterministic Node tests, Storybook production build, Next production build, and `git diff --check` passed.

## Verdict

`READY WITH MINOR ISSUES`: no blocking integration, responsive, data-model, or accessibility defect remains in the audited code. Keep dashboard entry points unchanged until one authenticated production smoke test covers two persisted trips, the known local-only trip, and an inaccessible trip.

final result: passed with an authenticated-browser evidence caveat

---

# Trip Prep visual-polish design QA

- Source visual truth: pre-polish browser capture at `/private/tmp/morrovia-trip-prep-polish/desktop-before.png`
- Browser-rendered implementation: `/private/tmp/morrovia-trip-prep-polish/desktop-after.png`
- Responsive evidence: `/private/tmp/morrovia-trip-prep-polish/mobile-320-exact.png`, `/private/tmp/morrovia-trip-prep-polish/mobile-390-exact.png`, `/private/tmp/morrovia-trip-prep-polish/mobile-430-exact.png`, `/private/tmp/morrovia-trip-prep-polish/tablet-768-exact.png`, and `/private/tmp/morrovia-trip-prep-polish/desktop-1280.png`
- Viewport and state: normal planning state at 999 × 1271 CSS px for the matched before/after comparison; responsive checks at exact 320, 390, 430, and 768 CSS-pixel widths; desktop state also checked at 1278 CSS px
- Source dimensions: 1109 × 1734 px; implementation dimensions: 1109 × 1636 px
- Density normalization: both matched desktop captures used the same 999 CSS-pixel viewport and browser density (approximately 1.11 output pixels per CSS pixel). Responsive captures used the same density; no resampling was needed.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the existing Morrovia serif/sans/metadata hierarchy remains intact. The percentage is still prominent but no longer dominates the module; card summaries use two concise lines and retain readable contrast.
- Spacing and layout rhythm: the progress surface reduced from 184px to 160px, its internal elements now read as one composition, Must-do cards shed unnecessary padding and blank space, and the page is visibly shorter without becoming cramped.
- Colors and tokens: progress and primary actions remain indigo/purple; lilac supports progress and the detail surface; pink remains limited to accents and urgency; green and amber retain their semantic completion/in-progress roles. No royal blue or pink progress treatment was introduced.
- Image quality: the existing `/journey/illustrations/prep-triptych.png` travel-bag artwork remains sharp, proportionate, and supportive. No generated, placeholder, CSS-art, or new asset was added.
- Copy and content: presentation-only summaries were shortened for passport, insurance, flight, connectivity, and activity cards. Canonical task guidance, readiness source data, legal/safety detail surfaces, and action contracts remain unchanged.
- Icons and controls: the existing Lucide family remains optically consistent. Primary mobile task actions measure 44px high; compact desktop actions measure 40px and retain surrounding spacing.

## Interaction, state, and responsive evidence

- Normal/low-progress rendered 13%; urgent rendered the four-day state; mostly complete rendered 80%; fully ready rendered 100% and `You're ready to go.`; missing dates rendered the existing explicit missing-date message; long-copy and missing-optional states remained overflow-free.
- The next important task stayed compact and selected the existing deterministic passport/traveller priority in normal and urgent states.
- Detailed preparation guidance opened and closed from its strengthened secondary surface; the unchanged detailed Prep modules remained behind the disclosure.
- Exact-width checks at 320, 390, 430, and 768 CSS px plus desktop found no document-level horizontal overflow. The existing mobile order remains progress → next task → Must/Good/Nice → departure → Prep context → details.
- A fresh final browser tab reported zero console errors.

## Comparison history

1. Baseline comparison found a P2 density issue: the progress module was 184px tall with loose percentage/bar/illustration/stat spacing. It is now 160px with tighter tracks, a smaller supporting illustration, and 36px stat rows; the same real progress values and indigo bar remain.
2. Baseline comparison found P2 task-card bulk and text density. Cards now use reduced padding/gaps, two-line presentation summaries, and accessible action heights while preserving status and actions.
3. Baseline comparison found a P2 redundant right-rail summary. Dates, stops, and route metadata were removed; the module now focuses on traveller count, traveller-detail status, remaining Prep tasks, and detailed guidance access.
4. Baseline comparison found a P2 detached detail row. The disclosure now has a Prep-details eyebrow, stronger title, lilac supporting surface, directional affordance, and a clearly separated expanded body.
5. Post-fix desktop, state, interaction, and responsive comparisons found no remaining P0/P1/P2 typography, spacing, token, imagery, copy, behavior, accessibility, or overflow issue.

## Follow-up polish

- P3: the exact number of card rows varies with real task count and available workspace width; the auto-fitting grid intentionally prioritizes readable card widths over forcing a fixed row.
- P3: browser screenshot output density is approximately 1.11 rather than 1; before/after and responsive comparisons were normalized by using the same browser surface and recorded CSS widths.

final result: passed

---

# Trip Map integration design QA

- Source visual truth: `/Users/shaun/Downloads/Cusco Trip Planning Map Dashboard.png`
- Implementation screenshot: `/private/tmp/morrovia-trip-map-qa/desktop-default.png`
- Focused-route evidence: `/private/tmp/morrovia-trip-map-qa/focused-1440x1000.png`
- Responsive evidence: `/private/tmp/morrovia-trip-map-qa/mobile-320x900.png` and `/private/tmp/morrovia-trip-map-qa/tablet-768x1000.png`
- State: Cusco selected, integrated TripShell presentation, Plan mode active; focused presentation checked separately
- Source dimensions: 1672 × 941 px at supplied density
- Implementation dimensions: 1422 × 800 px, 1422 × 800 CSS viewport; browser reported device scale factor 1.8 while returning a CSS-pixel screenshot
- Normalization: source and implementation share a 1.777 aspect ratio and were reviewed together in one comparison input. The reference's site navigation is outside TripShell and therefore outside the component story.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the current Morrovia Georgia/Geist hierarchy reproduces the reference's editorial trip title, serif workspace heading, uppercase eyebrows, and compact UI metadata without clipping or awkward wraps.
- Spacing and layout rhythm: the route timeline remains a shallow top rail, the map dominates the workspace, Shape the day is contained at upper-left, and Trip Health is a compact right rail. The implementation deliberately uses the production panel density instead of reproducing mock-only commercial result rows.
- Colors and tokens: the selected stop uses a quiet white/lilac treatment with indigo focus, while pink remains reserved for accents and semantic signals. Integrated overrides reuse existing `--morrovia-*` tokens.
- Image quality: stop and trip imagery use existing saved/editorial media. The current local-search records do not include hotel photography, so no provider, fabricated image, CSS art, or placeholder photography was introduced.
- Copy and content: timeline names, nights, dates, route details, plan items, accommodation state, health status, and recommendations all derive from the canonical trip and review model.

## Interaction, state, and responsive evidence

- Selecting Sacred Valley updated the map, route summary, nights, and Shape the day context together.
- Plan, Stay, Eat, and See all switched through the existing production workspace. Storybook showed the existing safe fallback when its local venue endpoint was unavailable.
- Trip Health opened its existing accommodation detail state and remained tied to canonical health calculations.
- The integrated rail exposes `Fullscreen map` back to `/journey/plan?trip=…`; the focused Storybook state retained its original full-canvas composition.
- Warning, missing-imagery, focused, 320, 390, 430, and 768 Storybook states are present. Browser checks found no document-level horizontal overflow at the requested breakpoints.
- Browser console review found no runtime errors; the only warning is the project's existing Next.js runtime-config deprecation notice.

## Comparison history

1. The extraction pass initially inherited the fixed full-screen dock geometry. Shell-only CSS now contains the canvas and positions the destination rail, Shape the day panel, Trip Health, map controls, assistant, and mobile sheets inside TripShell without changing focused-route classes.
2. The selected destination initially inherited the focused route's solid indigo state. The integrated presentation now uses the approved soft white/lilac selected surface with an indigo outline and shadow.
3. Responsive review confirmed the existing bottom-sheet direction at phone/tablet widths and no horizontal overflow. No follow-up P0/P1/P2 fix was required.

## Follow-up polish

- P3: the supplied mock shows a live, photo-rich Stay result while the deterministic Storybook review uses the Plan state and the existing venue-unavailable fallback. Production can display richer provider data when the existing endpoint supplies it; the integration does not fabricate it.
- P3: exact map labels, route geometry, and tile crop vary with live MapLibre tiles and the selected trip state.

final result: passed

---

# Trip Overview design QA

- Source visual truth: `/Users/shaun/Downloads/Morrovia Sacred Valley Trip Dashboard.png`
- Implementation screenshot: `/private/tmp/morrovia-overview-desktop-raw.jpg`
- Side-by-side comparison: `/private/tmp/morrovia-overview-comparison.jpg`
- Responsive evidence: `/private/tmp/morrovia-overview-mobile-390.jpg`, `/private/tmp/morrovia-overview-320.jpg`, `/private/tmp/morrovia-overview-430.jpg`, and `/private/tmp/morrovia-overview-768.jpg`
- State evidence: `/private/tmp/morrovia-overview-missing-state.jpg`
- State: active planning trip with a complete seven-day itinerary, one of three stays sorted, and one of four saved prep tasks complete
- Source dimensions: 1449 × 1086 px at supplied density
- Implementation dimensions: 1450 × 1000 px, 1450 × 1000 CSS viewport, device scale factor 1
- Normalization: the source and browser-rendered implementation were aspect-fit into equal 725 × 560 panels for the combined comparison; no density resampling was required.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the current Morrovia display, UI, and metadata faces preserve the reference's editorial headline, restrained uppercase eyebrows, and compact product copy hierarchy. Long stop names wrap without clipping at 320, 768, and desktop widths.
- Spacing and layout rhythm: the reference's primary-action/health pairing, compact progress cards, and connected route strip are retained. Mobile uses the required next action → health → progress → route order without horizontal overflow.
- Colors and tokens: indigo remains the primary action and progress color; pink is limited to signal/eyebrow accents; semantic success, warning, danger, lilac, line, radius, surface, and focus values use existing `--morrovia-*` tokens.
- Image quality: production uses saved trip imagery and the existing Morrovia editorial media helper. The missing-image state uses the established icon system and quiet lilac fallback rather than introducing a provider or fabricated photography.
- Copy and content: the next action, health signals, itinerary count, accommodation count, prep count, stop names, nights, and leg durations all derive from the canonical trip. No departure countdown, document total, booking claim, or readiness percentage is invented.

## Interaction and state evidence

- Active planning selected `Find a stay in Sacred Valley` and linked to the existing Plan stay workflow.
- Blocking route state selected the existing route review with the canonical eight-hour road-transfer signal.
- Early/incomplete state selected `Finish shaping the itinerary` with the real 2-of-7 day count.
- Ready state appeared only after itinerary, overnight stays, health, and the saved prep checklist were all covered.
- Missing-image and long-copy fixtures remained legible without broken crops or overflow.
- Sibling links resolved to `/journey/[tripId]/itinerary`, `/journey/[tripId]/map`, and `/journey/[tripId]/prep`; the stay action retained the existing `/journey/plan?trip=…&stay=…` workflow.
- Storybook rendered all tested states without its runtime error UI; typecheck, Storybook production build, and the Next.js production build completed successfully.

## Comparison history

1. The first implementation review found that an incomplete itinerary action still pointed to the legacy builder query rather than the new sibling workspace. The action now resolves directly to `/journey/[tripId]/itinerary`.
2. The first route grid assumed exactly three stops. It now uses an auto-fitting minimum track so two-to-six-stop trips can wrap without page-level horizontal scrolling.
3. The final combined comparison found no remaining P0/P1/P2 typography, spacing, token, image, or copy differences. The implementation intentionally omits the reference's departure/sidebar modules because this brief calls for a concise four-part command centre and existing TripShell already owns the trip context above it.

## Follow-up polish

- P3: image variety depends on the traveller's saved plan imagery; repeated editorial fallbacks in synthetic fixtures are preferable to hard-coded destination photos.
- P3: the desktop Overview body is verified independently in Storybook because TripShell itself already has separate shell visual coverage.

final result: passed

---

# Trip Prep integration design QA

- Source visual truth: `/Users/shaun/Downloads/Morrovia Trip Prep Dashboard(2).png`
- Browser-rendered implementation: `/private/tmp/morrovia-trip-prep-qa/desktop-default.png`
- Responsive evidence: `/private/tmp/morrovia-trip-prep-qa/mobile-390.png` and `/private/tmp/morrovia-trip-prep-qa/tablet-768.png`
- State: normal incomplete trip, 32 days before departure, one of three stays sorted, empty traveller profile, one saved checklist task complete
- Source dimensions: 1448 × 1086 px at supplied density
- Implementation dimensions: 1422 × 800 px, 1422 × 800 CSS viewport; browser reported device scale factor 1.8 while returning a CSS-pixel screenshot
- Normalization: the full reference and implementation were reviewed together in one comparison input. A same-ratio top-view comparison used the 1448 × 815 source region and 1422 × 800 implementation capture; Storybook intentionally omits the site-wide navigation above TripShell.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: current Morrovia display, UI, and metadata faces retain the reference's serif page/progress headings, compact status text, and clear task hierarchy. Long-task Storybook content remains readable without clipping.
- Spacing and layout rhythm: desktop preserves the main progress/tasks column with a compact countdown/next-task rail. Must-do cards are prominent; Good-to-do and Nice-to-have items are denser. Mobile stacks progress → next task → priority groups → secondary context.
- Colors and tokens: progress and primary actions use indigo/purple; pink is limited to active navigation, small accents, and urgent semantics; completion and in-progress use existing green and amber tokens.
- Image quality: the progress module reuses `/journey/illustrations/prep-triptych.png`, cropped to its real travel-bag artwork. No external image dependency, generated placeholder, CSS drawing, or handcrafted SVG was introduced.
- Copy and content: percentages, counts, statuses, accommodation coverage, next task, dates, travellers, and countdown are derived from canonical trip/readiness state. Unsupported mock modules such as a document store, money checklist, or fabricated packing feature are not claimed.

## Interaction, state, and responsive evidence

- The compact next task deterministically selected passport/traveller details ahead of accommodation, insurance, flights, practical actions, and optional checklist items.
- Detailed guidance expanded the unchanged plan-quality, accommodation, booking-readiness, and traveller-readiness surfaces. Traveller profile inputs remained available and saving notifies the shared shell summary state.
- Missing-date story rendered `Add dates to see your departure countdown.` rather than a fabricated count.
- Fully-ready story rendered `100%`, `5 of 5 tasks complete`, and `You're ready to go.` without manufacturing new tasks.
- Urgent, mostly-complete, fully-ready, missing-date, long-copy, missing-optional, legacy-body, 320, 390, 430, and 768 stories are present.
- Browser checks found no document-level horizontal overflow at 320, 390, 430, 768, or desktop widths and no console errors in the verified shell state.

## Comparison history

1. The first browser pass found the directive question was visually larger than the approved page title and pushed task content down. It was replaced with the reference-aligned `Trip prep` heading and compact subtitle.
2. The first pass used a pink metadata-style progress eyebrow. The progress label now uses the reference's dark serif treatment while the bar remains indigo/purple.
3. The initial next-task selector preferred an in-progress accommodation task over required traveller details. The deterministic priority now orders urgent issues, passport/traveller readiness, accommodation, insurance, flights, practical actions, then optional tasks.
4. Post-fix comparison found no remaining P0/P1/P2 typography, layout, token, imagery, content, responsive, or interaction issue.

## Follow-up polish

- P3: the approved mock uses a bespoke backpack illustration; the implementation uses Morrovia's existing watercolour travel-bag artwork to avoid adding an external or one-off asset dependency.
- P3: exact progress differs from the mock's illustrative 64% because the implementation deliberately reports the real derived state.

final result: passed

---

# Stamps / Travel Identity refinement design QA

- Source visual truth: `/Users/shaun/Downloads/image-gen-3(6).png`
- Browser-rendered desktop implementation: `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/after-established-1440.png`
- Combined comparison input: `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/reference-vs-implementation-1440.png`
- Responsive evidence: `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/after-established-390.png`, `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/after-established-768.png`, and `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/after-empty-390.png`
- Before evidence: `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/before-1440.png` and `/Users/shaun/Documents/Morrovia/artifacts/stamps-refinement/before-390.png`
- Verified Storybook implementation: `http://localhost:6011/iframe.html?id=morrovia-stamps--established-traveller&viewMode=story`
- State: authenticated established traveller, France selected as Visited, three visited countries, two want-to-visit countries, and two countries with notes or imagery
- Source dimensions: 1448 × 1086 px at supplied density
- Implementation dimensions: 1440 × 1086 CSS px; browser device scale factor 1
- Responsive viewports: 320, 390, 430, 768, 1024, 1440, and 1600 CSS px
- Normalization: the source and browser-rendered implementation were aspect-fit into equal 1448 × 1086 panels in one vertically stacked comparison image.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the current Morrovia display and UI faces preserve the source's editorial headline, compact navigation, uppercase eyebrow, and dense country-list hierarchy. The desktop headline remains on one line and long country names remain legible.
- Spacing and layout rhythm: the 1260 px desktop shell, 690 px workspace, map/explorer split, lower-left country card, map controls, scrollable country list, and footer legend reproduce the source's primary composition without letting the full 197-country list stretch the page.
- Colors and tokens: indigo identifies primary and want-to-visit states, green identifies visited, pink is limited to brand and memory signals, and neutral/unmarked state is explicit. Existing `--morrovia-*` tokens and shared navigation patterns are reused.
- Image quality: the production world topology remains crisp across the verified sizes. Traveller imagery is optional, local, and never replaced with fabricated photography.
- Copy and content: the title and supporting statement follow the approved direction. Counts derive from persisted status and memory records. Unsupported visit dates, completed-trip claims, connected-trip totals, and an about-to-visit state are omitted.

## Interaction, accessibility, and state evidence

- Map zoom in, zoom out, and reset changed and restored the map transform.
- Country selection, explicit Unmarked / Visited / Want to visit changes, search, region filtering, empty-filter reset, note editing, save, cancel, close, and Escape dismissal were exercised in the production-backed Storybook fixture.
- Escape restored focus to the originating country-row control. Inputs and controls expose visible labels, native focus behavior, and clear status text instead of relying on color alone.
- Guest and authenticated fixtures, empty and established travellers, selected visited and want-to-visit countries, a note, missing imagery, long country names, 390 px, and 768 px states are represented in Storybook.
- The document width matched the viewport at 320, 390, 430, 768, 1024, 1440, and 1600 px; no page-level horizontal overflow was found.
- Browser console review found no application errors. The isolated Storybook runtime emitted only its existing framework/runtime configuration warning.

## Comparison history

1. The initial implementation used fabricated seed status and memory data. It now starts from persisted traveller records and renders truthful zero states.
2. The first desktop browser pass found that the 197-country explorer stretched the workspace beyond 10,000 px and vertically displaced the map. The workspace now has the source-aligned 690 px desktop height and its explorer list scrolls independently.
3. The next comparison found a wrapped desktop headline, loose card geometry, and non-alphabetical filtered results. Shell, type, card, and explorer geometry were tightened and country results now sort canonically by display name.
4. The post-fix combined comparison found no remaining P0, P1, or P2 typography, spacing, token, imagery, state, responsive, or interaction issue.

## Validation and accepted differences

- Clean isolated Stamps validation passed typecheck, targeted analytics tests, targeted Stamps tests, and the Next.js production build. A dedicated production Storybook build also passed.
- The visible 3 / 2 / 2 totals intentionally differ from the source's illustrative 67 / 23 / 12 / 4 because Morrovia reports fixture or persisted state rather than promotional data.
- Trips connected, visit dates, trip-completion inference, and about-to-visit are deliberately absent because the current canonical model cannot prove them.
- Guest status records can be claimed after sign-in; guest notes and local imagery remain local rather than being silently moved into an account.

## Follow-up polish

- P3: optional photo data uses the existing local-memory path and remains subject to browser storage quota.
- P3: country status migration is automatic after sign-in, while note/photo migration should remain an explicit future consented workflow if the product adds it.
- P3: the production map topology supports the canonical catalogue, but very small island states remain easier to select from the explorer than directly on the map.

final result: passed

---

# Passport design QA

- Source visual truth: `/Users/shaun/Downloads/ChatGPT Image Aug 23, 2026, 02_58_03 PM (2).png`
- Implementation: `http://localhost:3008/journey/passport`
- Final implementation screenshot: `/private/tmp/morrovia-passport-final-top-v3.png`
- Final side-by-side comparison: `/private/tmp/morrovia-passport-comparison-final-v3.png`
- Focused result capture: `/private/tmp/morrovia-passport-desktop-final-lower.png`
- Responsive captures: `/private/tmp/morrovia-passport-768.png`, `/private/tmp/morrovia-passport-390-top.png`, `/private/tmp/morrovia-passport-320-after-change.png`
- Source pixels: 1024 × 1536. The source top region was cropped to the matching 16:9 viewport and normalized to 1280 × 720.
- Implementation pixels/CSS viewport: 1280 × 720 at reported DPR 2; browser capture output is CSS-pixel normalized at 1280 × 720.
- State: English, United Kingdom passport, Guatemala destination, successful Passport Index result, official-source handoff visible.

## Full-view comparison evidence

The final side-by-side comparison confirms the same editorial hierarchy, three-line hero rhythm, Morrovia navigation, paired controls, privacy line, primary action, and beginning of the result surface. The implementation intentionally uses longer cautionary copy and replaces unsupported mock claims with supported Passport Index fields and explicit confirmation guidance.

## Focused region evidence

The focused result capture verifies the result heading, three fact cards, confidence treatment, official-source strip, and beginning of grouped considerations at readable scale. Icons use the existing Lucide family; no source illustration was replaced with CSS or handcrafted SVG art.

## Required fidelity surfaces

- Typography: current Morrovia display/UI/meta fonts and weights retained; final hero width reproduces the source's three-line wrap.
- Spacing/layout: 1180px desktop frame, source-like hero/form rhythm, consistent 18px result spacing, and no horizontal overflow.
- Colors/tokens: Morrovia ink, signal pink, action indigo, semantic success/warning, paper, line, lilac and tint tokens used throughout.
- Image/asset quality: the source contains only brand/navigation and simple line icons; implementation uses the live brand/navigation plus one consistent icon library.
- Copy/content: source hierarchy retained while unsupported visa certainty, passport-validity claims, onward-ticket claims, prices and guarantees are omitted.
- Accessibility/behavior: labelled controls, semantic headings/regions, live loading/error output, result/error focus, 52px controls, reduced-motion handling, and immediate stale-result invalidation verified.

## Comparison history

1. P1 — A legacy wildcard selector applied the page width to nested hero/result classes, compressing the headline and creating horizontal overflow. Removed the obsolete Passport overrides from `surface-editorial.module.css`; post-fix captures show zero overflow.
2. P0 — Production interaction could discard a current fast response because its request ID was captured inside a deferred state updater. Moved IDs to an explicit monotonic ref and added a regression test; production browser checks now return and focus the result in English and Spanish.
3. P2 — The desktop hero was materially wider than the source and wrapped the second line differently. Iteratively reduced the title measure to 450px; the final side-by-side capture matches the source's three-line composition.

Post-fix responsive evidence: 768 × 900, 390 × 844 and 320 × 720 all report document width equal to viewport width, zero overflowing elements, visible results, and 52px select/button heights. Changing destination at 320px cleared the previous result immediately. Final production console check reported no errors or warnings.

## Findings

No actionable P0, P1 or P2 findings remain. The longer implementation intro is an intentional trust/data-boundary difference from the visual mock.

## Follow-up polish

No blocking follow-up. A future real-device pass may compare native select rendering across iOS and Android.

final result: passed

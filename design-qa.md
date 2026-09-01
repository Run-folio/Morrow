# Morrovia Help page QA

## 2026-08-29 content-composition implementation

### Comparison target and evidence

- **Source visual truth:** `/Users/shaun/Downloads/ChatGPT Image Aug 29, 2026, 06_32_55 PM.png` (1122 × 1402 px). Per the implementation brief, it is authoritative for content hierarchy, search/topics/questions/support grouping and relative whitespace only; it is not visual authority for the shell, controls, panels, typography, colour, spacing or responsive chrome.
- **Browser-rendered implementation:** `artifacts/help-page/help-production-1024-top.jpg`, `artifacts/help-page/help-production-1024-support.jpg`, `artifacts/help-page/help-production-390-top.jpg`, `artifacts/help-page/help-production-390-expanded.jpg`, `artifacts/help-page/help-390-search-result.jpg` and `artifacts/help-page/help-390-no-results.jpg`.
- **Viewport, dimensions and density normalization:** desktop evidence is 1024 × 900 CSS px and raster px; mobile evidence is 390 × 844 CSS px and raster px. The approved 1122 × 1402 source combines desktop and mobile compositions in one image, so comparison uses its corresponding composition regions rather than treating the combined raster as a single browser viewport. Browser geometry separately verified 320, 390, 430, 768, 1024, 1440 and 1680 CSS px with document width equal to viewport width.
- **State:** public `/journey/help` route with the production Morrovia navigation and footer; default, expanded topic, filtered search and empty-result states; signed-out shell.

### Full-view and focused comparison evidence

- **Full hierarchy:** the final page preserves the approved sequence: functional hero and search, scannable topic grid/rows, popular-question disclosures, then the grouped support and travel-information panel. The 1024 top/support and 390 top/expanded captures together cover every major region at readable scale.
- **Focused interactions:** the 390 expanded capture verifies compact rows and natural disclosure expansion. Search-result and no-result captures verify immediate filtering, clear state and the understandable empty result. Browser interaction checks also passed Escape clearing, Enter/Space disclosure activation and live result status.
- **Responsive geometry:** zero page-level horizontal overflow at every required width. Topic layout resolves to one column at 320/390/430, two at 768 and three at 1024/1440/1680. Mobile topic actions are 64px high; the support block stacks and the canonical mobile dock remains unobstructed.
- **Accessibility and runtime:** semantic h1/h2/h3/h4 hierarchy, labelled search, `aria-expanded`/`aria-controls`, visible canonical focus treatment, decorative image/icon hiding and descriptive destinations are present. The final production-browser pass reported no console errors or warnings.

### Comparison history

1. The initial implementation used native `details`/`summary` disclosures. Browser accessibility inspection exposed a P2 state-contract gap, and keyboard activation was inconsistent in the test surface. The final implementation composes the canonical `EasyTButton`, adds explicit `aria-expanded`/`aria-controls` and handles Enter and Space directly; the production-browser retest passed both keys.
2. The first local visual capture was blocked by a stale service-worker cache on port 3000, which served old/empty development CSS. Verification moved to a fresh origin, and the final evidence was recaptured from the clean production build on port 3002 with no browser errors.
3. Final comparison found no actionable P0, P1 or P2 issue. The remaining differences from the source are intentional design-system decisions required by the brief.

### Conceptual reuse and deliberate differences

- **Reused conceptually from the mockup:** Help-centre eyebrow/title/lede, prominent real search, topic-grid concept, compact mobile topic rows, popular-question disclosures, and the grouped Still stuck?/travel-information ending.
- **Production/Storybook implementations used instead:** `EasyTNavigation`, the layout-owned `MorroviaFooter`, `EasyTField`, `EasyTButton`, `EasyTLinkButton`, current Lucide icon treatment, `--morrovia-*` tokens, canonical public width/focus/mobile dock and the existing `global-route-confirm.png` illustration.
- **Deliberate visual differences:** the live header, logo, auth/language controls, compact menu, mobile dock and footer replace the mock shell; Morrovia field/button/panel typography, colours, radii and borders replace screenshot styling; the support surface uses the existing lilac token; invented footer columns, social links, newsletter, support address and “See all” destination are omitted.
- **New components:** no new shared UI family or Storybook-only copy was created. `HelpCenter`, `TopicDisclosure` and `QuestionDisclosure` are Help-page-specific composition components because Storybook contains no canonical Help/accordion owner; all actionable controls compose the existing canonical controls.

### Verification

- Focused Help/About shell tests: passed (7/7).
- `npm run typecheck`: passed.
- `npm run build`: passed; `/journey/help` prerendered successfully.
- `npm run build-storybook`: passed with Help default, 390px, expanded, search-result and no-result stories.
- `npm run audit:ui`: passed with no new design-system debt or local exception.
- `git diff --check`: passed.

**final result: passed**

---

# Morrovia About page QA

## 2026-08-29 approved-mockup implementation

### Comparison target

- **Approved source:** `/Users/shaun/Downloads/ChatGPT Image Aug 29, 2026, 06_14_19 PM.png` (1122 × 1402 px), with `/Users/shaun/Downloads/ChatGPT Image Aug 29, 2026, 05_55_00 PM.png` used as secondary composition context.
- **Browser-rendered implementation:** `artifacts/about-page/about-1440-final-2.jpg`, `artifacts/about-page/about-390-final.jpg`, and `artifacts/about-page/about-320-final.jpg`.
- **Focused evidence:** `artifacts/about-page/about-1440-sections.jpg` and `artifacts/about-page/about-1440-lower.jpg` cover the middle and lower editorial regions at readable scale.
- **Viewport and density:** desktop was exercised at 1440 × 1000 CSS px, mobile at 390 × 844 and 320 × 720 CSS px. The in-app Browser returned host-scaled rasters of 1600 × 1111, 433 × 938, and 356 × 800 respectively; judgments use the measured CSS geometry rather than treating host capture density as product drift.
- **State:** public About route with the canonical landing navigation, current Overview workspace screenshot, reusable Morrovia illustration assets, primary trip-planning CTA, and canonical global footer.

### Required fidelity surfaces

- **Composition and hierarchy:** the approved editorial sequence is retained: promise and product proof, why Morrovia exists, four core capabilities, real-travel principles, four-step process, and scenic closing CTA. The copy leads the product screenshot on mobile.
- **Typography:** existing Morrovia Georgia display, Geist UI, and Geist Mono metadata roles remain authoritative. The desktop promise resolves to the approved two-line rhythm; smaller viewports wrap naturally without clipping.
- **Spacing and color:** section rhythm, grids, borders, actions, pink signals, indigo text, lilac surfaces, and focus treatment use existing `--morrovia-*` tokens and shared primitives.
- **Images and product truth:** the page reuses the current Morrovia decision, preparation, and scenic illustration assets. Product proof uses the current Overview / Map / Itinerary workspace with before-you-go work consolidated into Overview; the obsolete Prep tab shown in the concept was not reproduced.
- **Content and actions:** approved About copy is preserved. About is current in desktop and compact navigation, the footer About destination is real, and the primary CTA uses the canonical `EasyTLinkButton` to start a trip.
- **Responsive behavior:** browser geometry at 320, 390, 430, 768, 1024, 1440, and 1680 CSS px reported document width equal to viewport width. Four- and three-column regions collapse cleanly, and mobile actions retain at least the canonical 44px target.

### Findings and comparison history

1. The first desktop comparison found a P2 hierarchy mismatch: the hero promise wrapped to four lines and visually overpowered the product proof. The text column, display size, and deliberate line grouping were refined so the final 1440px render matches the approved two-line hierarchy.
2. The final full-view and focused comparisons found no actionable P0, P1, or P2 visual, responsive, interaction, accessibility, or content-integrity issue.
3. Intentional differences are production decisions: the live Morrovia header/footer and existing scenic art replace unsupported mock-only links, social icons, and invented imagery; the product screenshot reflects the current three-tab workspace rather than restoring obsolete Prep navigation.

**final result: passed**

---

# Storybook visual-system catalogue QA

## 2026-08-29 audit and documentation pass

- **Scope:** Storybook and audit documentation only. No production component, page layout, product logic, Map/Itinerary behavior or persistence path was redesigned or migrated.
- **Information architecture:** all stories now live under the explicitly sorted `Morrovia / 01 Foundations` through `06 Audit` hierarchy. Empty placeholder categories were not added.
- **Evidence model:** the catalogue represents 27 recurring semantic families through 38 audited implementation records: 20 canonical, 6 duplicate/migration candidates, 8 intentional exceptions and 4 undecided. Page-bound patterns that cannot be isolated safely are documented instead of recreated.
- **Generated foundations:** repository-local deterministic inventory covers 755 grouped raw colours, 76 observed spacing values, 56 grouped raw radii, 182 grouped raw shadows, 6 font-family groups and 41 breakpoint values, alongside canonical Morrovia tokens.
- **Responsive evidence:** Storybook 10 viewport globals now apply actual 320, 390, 768, 1024 and 1440 widths. Current-run browser probes at each width rendered the representative Itinerary/TripShell stories without page-level horizontal overflow; the 390 story iframe measured exactly 390px.
- **Current-run screenshots:** `artifacts/storybook-visual-system-audit/08-audit-summary-desktop.jpg` and `artifacts/storybook-visual-system-audit/11-itinerary-390-verified.jpg`. The desktop evidence shows the ordered hierarchy and audit totals; the mobile evidence shows Storybook's real 390px viewport, not a fake device frame.
- **Highest-value review areas:** page-local action controls; raw colour/radius/shadow concentration in `journey.module.css`, Homepage, Builder and account styling; page-owned heading scale; status-chip taxonomy; and card radius/elevation differences.
- **Accessibility review support:** stories expose focus, disabled, loading, selected, status and semantic control states through the existing Storybook accessibility addon. No new accessibility dependency was introduced.

**audit result: passed; migration deliberately not started**

---

# Overview Prep consolidation QA

## 2026-08-29 cleanup and regression pass

- **Canonical ownership:** preparation status, tasks, actions and grouping are derived in `lib/easyt/trip-prep.ts`; provider/profile lifecycle lives in `components/easyt/use-trip-prep-readiness.ts`; the shared task/editor presentation lives in `components/easyt/trip-preparation.tsx`; Overview composes progress and information hierarchy in `components/easyt/trip-overview-workspace.tsx`.
- **Standalone Prep removal:** the old page client, workspace, duplicate preparation/readiness cards, stories and page-local styles were removed. Both legacy Prep routes are redirect-only and the trip shell exposes exactly Overview, Map and Itinerary.
- **State evidence:** deterministic stories cover incomplete/complete and partial readiness, missing optional data, provider failure, minimal/long trips, today/future departure and zero/multiple health findings. Focused tests cover the same derivation boundaries.
- **Responsive evidence:** current-run browser geometry at 320, 390, 768, 1024, 1440 and 1680 CSS px reported no page-level horizontal overflow. Mobile action targets are at least 44px; the progress strip, preparation tasks and route content remain readable.
- **Regression evidence:** the canonical Map story retained one MapLibre canvas and its existing route behavior; the Itinerary story retained direct timeline editing and contextual rail behavior. Browser evidence is in `artifacts/overview-prep-cleanup/`.

**cleanup result: passed**

## Comparison target

- **Approved Option A reference:** `/var/folders/gb/_l8hxm017mv0z46jd1lprhwr0000gn/T/TemporaryItems/NSIRD_screencaptureui_lhHSZb/Screenshot 2026-08-29 at 11.21.43 AM.png` (1562 × 1592 px).
- **Browser-rendered implementation:** `artifacts/overview-prep-consolidation/desktop-1440.png` and `artifacts/overview-prep-consolidation/mobile-390.png`.
- **Combined comparison inputs:** `artifacts/overview-prep-consolidation/comparison-full.png` and `artifacts/overview-prep-consolidation/comparison-focus.png` place the reference and implementation side by side.
- **Preview:** `http://localhost:6006/?path=/story/components-trip-overview-workspace--active-planning`.
- **State:** deterministic Cusco, Sacred Valley and Arequipa fixture using canonical trip, booking-readiness, traveller-profile and saved-checklist data. Provider-unavailable behavior has a separate Storybook fixture.

## Required fidelity surfaces

- **Preserved areas:** the current trip identity header, Next Step / Trip Health section and Your Route retain their existing component structure and visual treatment. The shell now exposes exactly Overview, Map and Itinerary.
- **Planning Progress:** the existing progress strip now projects seven truthful categories—itinerary, accommodation, transport, passport and traveller details, insurance, connectivity and saved checklist—from existing domain logic. Incomplete categories expose their established action only when one exists.
- **Before You Go:** the compact Must do / Good to do layout reuses the canonical Prep task cards, details disclosure, provider actions, local confirmation and error handling. Completed tasks are omitted from the compact summary but remain available through detailed preparation guidance.
- **Typography and tokens:** current Morrovia display, UI and metadata roles, semantic surfaces, borders, status colors, radii and focus rings remain authoritative. No parallel card, button, chip or status primitive was introduced.
- **Responsive behavior:** the seven-category strip resolves to 7 / 4 / 2 / 1 columns across wide desktop, tablet and mobile; Before You Go resolves from two groups to one stacked column. The page has no horizontal overflow at 320, 390, 768, 1024, 1440 or 1680px.

## Interaction and accessibility evidence

- The legacy per-trip `/prep` route performs a server redirect to the trip Overview; primary navigation and account navigation no longer advertise Prep.
- Internal Prep handoffs now target `#before-you-go`; useful Prep derivation, provider actions and detailed guidance remain reusable.
- Provider actions remain real links with external-destination labels; local tasks retain canonical completion behavior. Loading and provider failures stay scoped to readiness content.
- Native links, buttons and details controls remain keyboard reachable with visible focus. The browser check confirmed three shell tabs, local details expansion, no page-level overflow and no route-changing side effect from the guidance disclosure.

## Comparison history

1. The first comparison confirmed the approved information architecture but showed the compact Prep cards denser than Option A.
2. The final refinement retained the two Must do / Good to do groups while presenting one scannable full-width task row per group, matching the reference hierarchy without copying unsupported task data.
3. Final side-by-side inspection found no actionable P0, P1 or P2 visual, responsive, interaction, accessibility or content-integrity issue. Trip names, health findings and completion states differ intentionally because the implementation uses its deterministic canonical fixture rather than the reference screenshot's sample data.

**final result: passed**

---

# Trip Itinerary interactive-workspace redesign QA

## Comparison target

- **Approved reference:** `/Users/shaun/Downloads/ChatGPT Image Aug 29, 2026, 10_54_31 AM.png` (1672 × 941 px).
- **Browser-rendered implementation:** `artifacts/itinerary-workspace/itinerary-desktop-1440.png` (1440 × 1166 px) and `artifacts/itinerary-workspace/itinerary-mobile-390.png` (390 × 844 px).
- **Combined comparison input:** `artifacts/itinerary-workspace/reference-vs-implementation.png` places the approved reference and final browser render side by side.
- **Preview:** `http://localhost:6007/iframe.html?id=components-trip-itinerary-workspace--default&viewMode=story`.
- **State:** canonical seven-day Cusco, Sacred Valley and Arequipa fixture with real trip dates, stops, legs, authored activities, booking, note, recommendation and saved place. The local map correctly shows its existing missing-key fallback rather than fabricated tiles.

## Required fidelity surfaces

- **Shell and composition:** the existing global navigation, TripShell identity, metadata and Overview / Map / Itinerary / Prep tabs are reused unchanged. Only the area below the tab bar becomes the requested day rail, selected-day timeline and context rail.
- **Typography and tokens:** current Morrovia display, UI and metadata roles remain intact. The selected-day hierarchy, active pink marker, indigo actions, lilac surfaces, borders, radii and focus treatment use existing semantic tokens and shared controls.
- **Content integrity:** dates, locations, transfers, door-to-door timings, plan items, bookings, notes, recommendations and saved ideas come from the trip model. Unsupported weather, progress, reservation states and travel facts from the concept were deliberately omitted.
- **Actions and map:** Ask Morrovia reuses the existing trip co-pilot. Add note, Find ideas, Shape day and insertion points deep-link into the canonical Map workspace with the selected stop and exact day. The compact map uses the existing `JourneyPlannerMap` in explicit preview mode; the primary Map default remains unchanged.
- **Responsive behavior:** 320 and 390 use a horizontally scrollable day strip, stacked timeline and accordion context sections. 768 stacks to one column, 1024 uses a two-column workspace with the context below, and 1440 / 1680 retain all three regions.

## Interaction and verification evidence

- Browser geometry at 320, 390, 768, 1024, 1440 and 1680 reported document width equal to viewport width with no page-level horizontal overflow.
- All seven day tabs were selected in turn and exposed their canonical date, location, plan summary and full day content. Day 4 exposed the real Cusco → Sacred Valley transfer and three exact-day Map links.
- Mobile Day map details collapsed and reopened through the native summary control. The empty-itinerary story retained the complete TripShell and rendered the existing no-days state without overflow.
- The canonical Golden Triangle Map story still rendered one interactive map, three interactive stop controls and zero preview markers, with no console error.
- No browser console errors were produced. The only browser diagnostic was the existing Storybook warning about deprecated Next.js runtime config.
- Focused presentation tests, Map presentation tests, affiliate-link tests, TypeScript, strict UI convergence audit, Storybook production build and the Next.js production build all passed.

## Comparison history

1. Pass 1 established the requested three-region workspace using canonical trip content and existing Map/co-pilot/control primitives. Unsupported concept facts were removed rather than simulated.
2. Pass 2 strengthened selected-day contrast, tightened timeline spacing and density, clarified context grouping, increased mobile accordion targets and deduplicated saved ideas by normalized title.
3. The final source-to-implementation comparison found no actionable P0, P1 or P2 visual, responsive, interaction, accessibility or content-integrity issue. Remaining differences are intentional canonical-data differences: this trip has fewer backed bookings and recommendations than the concept, and the local map has no configured tile key.

**final result: passed**

---

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

# Product Tour landscape-proof QA

## 2026-08-31 focused presentation repair

### Comparison target

- **Problem evidence:** the five supplied Tour screenshots from `/Users/shaun/Desktop/Screenshot 2026-08-31 at 12.32.17 PM.png` through `/Users/shaun/Desktop/Screenshot 2026-08-31 at 12.32.38 PM.png` show portrait phone frames, weak screenshot scale, large unused areas and inconsistent product proof.
- **Browser-rendered implementation:** `artifacts/product-tour-landscape/desktop-slide-01.png` through `desktop-slide-05.png`, plus `mobile-slide-04.png`.
- **Combined comparison input:** `/private/tmp/tour-before-after-comparison.png` placed every supplied desktop state and all five final deterministic Storybook states into one visual review.
- **Viewports and state:** all five slides were inspected at 1440 × 1000, 1024 × 900 and responsive mobile size. The in-app Browser separately measured the mobile document width equal to its inner width. The fixture is one privacy-safe eight-day Peru trip for two: Lima arrival, Cusco (3 nights), Sacred Valley (2), Arequipa (2), food and culture interests, three stays, route legs, practical tasks and a populated Cusco day.

### Required fidelity surfaces

- **Layout:** desktop and tablet use the existing Tour dialog as a restrained landscape split, with the product proof occupying the larger track. Mobile retains the established stacked dialog and uses dedicated 3:4 crops inside the existing compact frame.
- **Typography and tokens:** the current Morrovia display, UI and metadata roles, paper/lilac/ink/signal/action tokens, canonical border, radius, shadow and focus treatments remain authoritative.
- **Product truth:** Trip Capture, current route review, Overview, Map and Itinerary are sourced from deterministic Storybook states. Overview uses current Overview/Map/Itinerary IA; Map is map-dominant; Itinerary is a populated Morning/Midday/Afternoon/Evening day with activities and day navigation. No Prep-era UI, auth recovery banner, placeholder text or private account data appears in the final assets.
- **Copy:** all five English slide labels, titles and bodies match the approved concise wording. Back, Next, Done, Skip, close, progress and five-step order remain unchanged.
- **Asset dimensions:** desktop assets are exactly 1600 × 1000 (16:10); mobile assets are exactly 750 × 1000 (3:4). Each is an intentional feature crop rather than a shrunken full-page screenshot.

### Interaction, accessibility and responsive evidence

- The existing dialog role, labelling, focus entry/return, Tab trap, Escape close, overlay close and Back/Next/Done/Skip behavior remain present and covered by focused tests.
- Deterministic Storybook slide stories expose all five final states without changing production defaults. Desktop 1440 and 1024 comparison montages retain the landscape media/copy hierarchy on every slide.
- Mobile media stacks before copy; the mobile grid and content tracks have explicit zero-min-width constraints. Browser geometry reported document `scrollWidth` equal to `innerWidth`, and the normalized mobile evidence shows both action buttons fully contained.
- Final static Tour images contain no browser banners, Storybook error panels, loading states or runtime error copy. The isolated Storybook runtime continues to emit the repository-wide Next.js `next/config` deprecation warning only.

### Comparison history

1. The supplied state used a desktop phone bezel and tall page captures, making useful UI small and leaving most of the frame empty. The final desktop state removes that metaphor and uses a 16:10 editorial product-proof surface.
2. The first coherent fixture exposed an invalid canonical origin endpoint and unstable Itinerary map pins. The endpoint was corrected through the canonical trip model, and the unnecessary preview pins were removed; the populated production Itinerary then rendered cleanly.
3. The first narrow Chrome artifact clipped the dialog because of Chrome's minimum headless layout width. Browser geometry confirmed no page overflow; the mobile grid was still hardened with explicit zero-min-width sizing, and the final evidence was normalized from an unclipped responsive render.
4. The final source-to-implementation comparison found no actionable P0, P1 or P2 visual, responsive, interaction, accessibility or content-integrity issue.

final result: passed

---

# AI and speech transparency refinement QA

- Source visual hierarchy: `/Users/shaun/Documents/Morrovia/artifacts/design-system-audit/16-homepage-tokenized.png`
- Refined default capture: `/Users/shaun/Documents/Morrovia/artifacts/ai-speech-transparency/after-1440.png`
- Mobile disclosure evidence: `/Users/shaun/Documents/Morrovia/artifacts/ai-speech-transparency/speech-first-use-390.png`, `/Users/shaun/Documents/Morrovia/artifacts/ai-speech-transparency/ai-disclosure-390.png`
- Verified Storybook surface: `http://127.0.0.1:6006/?path=/story/morrovia-05-product-patterns-trip-capture--compact-default-hierarchy`
- Responsive widths checked: 320, 390, 768, 1024 and 1440 CSS px.

## Findings

The established Homepage capture and the refined Storybook implementation were reviewed together. The default composition again reads as prompt, Speak, trip attributes and primary action. The added speech-info icon and `AI-assisted` trigger are quiet, contextual, and do not compete with `Plan my trip`. No persistent explanatory paragraph remains in the normal card flow.

The first mobile comparison exposed a clipped speech panel above the 390 px viewport. The shared disclosure now becomes a fixed compact bottom panel below 520 px. Final 320/390 checks show no horizontal overflow; the speech and AI panels stay fully within the viewport. Desktop remains an anchored popover without layout reflow.

Interaction checks verified first-use opening, Privacy links, explicit `Start speaking`, Escape dismissal with focus return, outside-click dismissal, later info-trigger reopening, AI disclosure opening, and typed text preservation. The disclosure is a labelled non-modal dialog; its trigger exposes expanded/controls state and uses native buttons with visible focus.

The default filled capture measures approximately 306 px high at 768 px and wider, 323 px at 390 px, and 396 px in the true 320 px Storybook viewport. The source visual and implementation retain the same compact conversion hierarchy; no P0, P1 or P2 visual discrepancy remains.

## Validation

- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run audit:ui` — passed.
- Focused AI/speech and canonical-control tests — 18 passed.
- `npm run build-storybook` — passed with existing bundle-size/plugin-timing warnings only.

final result: passed

---

# Help page refinement design QA

- Composition target: `/Users/shaun/Downloads/morrovia-help-mockup.png`
- Current-state evidence: `/Users/shaun/Downloads/Screenshot 2026-08-29 at 7.17.35 PM.png` and `/Users/shaun/Downloads/Screenshot 2026-08-29 at 7.17.45 PM.png`
- Browser-rendered desktop implementation: `/Users/shaun/Documents/Morrovia/artifacts/help-refinement/help-1440.png`
- Selected-topic evidence: `/Users/shaun/Documents/Morrovia/artifacts/help-refinement/help-selected-topic-1440.png`
- Mobile evidence: `/Users/shaun/Documents/Morrovia/artifacts/help-refinement/help-390.png`
- Verified Storybook implementation: `http://localhost:6106/iframe.html?id=morrovia-05-product-patterns-help-page--desktop-default&viewMode=story`
- Desktop implementation viewport: 1440 CSS px; capture output is 1600 px wide at the in-app browser's capture density.
- Mobile implementation viewport: 390 × 844 CSS px; capture output is 433 × 938 px at the same capture density.
- Responsive viewports: 320, 390, 430, 768, 1024, 1440, and 1680 CSS px.
- Normalization: the supplied composition target and final desktop/mobile captures were inspected together. The production Morrovia navigation, footer ownership, type roles, tokens, controls, and responsive shell remained authoritative where the target differed.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the current Morrovia display, UI, and metadata roles remain unchanged. The editorial hero and section headings retain their serif hierarchy while topic and question labels use the compact UI role.
- Spacing and layout rhythm: the desktop page keeps one concise hero, a three-column 11-topic grid, a single full-width selected-topic detail surface, a two-column popular-question list, and a compact two-part support/disclaimer finish. Mobile reduces topics to one-line rows and places detail content below the full list.
- Colors and tokens: page surfaces are white/paper with restrained line borders. Pink is limited to the existing signal eyebrow and small icon treatments; indigo marks selection and actions. The large lilac topic expansions, empty state, and support block were removed.
- Image quality: the page reuses the single existing `/journey/illustrations/global-route-confirm.png` asset at desktop/tablet sizes. No new generated asset, CSS drawing, inline SVG, or placeholder imagery was introduced.
- Copy and content: Help content fell from 1,619 to 1,020 words, a 37% reduction. Every topic has two or three questions, no selected topic exceeds 120 visible words, the six popular questions have concise answers, and passport, booking, saving, Trip Health, analytics, and official-source boundaries remain explicit.

## Interaction, accessibility, and responsive evidence

- Selecting a topic exposes exactly one related detail panel below the grid. Selecting the active topic again or using its labelled close control clears it; selection uses text, border, `aria-pressed`, `aria-expanded`, and `aria-controls`, not color alone.
- Popular answers use native button disclosure behavior and expose `aria-expanded`/`aria-controls`. The redundant manual Enter/Space handler on native buttons was removed, eliminating its double-toggle risk.
- Search filters topic names, questions, and answer text; Escape clears a populated search; the no-results state offers a canonical Clear search action. Browser checks exercised matching results, no results, reset, topic selection, topic replacement, and popular-question expand/collapse.
- The document width matched the viewport at 320, 390, 430, 768, 1024, 1440, and 1680 px. Topic columns resolve to one, one, one, two, three, three, and three, with no page-level horizontal overflow. Mobile topic rows measured at least 59 CSS px high.
- Semantic inspection found no duplicate IDs, unlabeled buttons, broken images, or application console errors. The isolated Storybook runtime emitted only the existing Next.js runtime-config deprecation warning.
- The real support route remains `mailto:sw@shaunwhiting.com`; the disclaimer continues to link to the production Passport information page. Navigation and footer source files were not changed.

## Storybook and validation

- Production-backed stories now cover desktop default, 390 px default, selected topic, popular question expanded, search results, and no results.
- Focused Help, public navigation, and About-shell tests passed; typecheck, strict UI convergence audit, Storybook production build, and Next.js production build passed.
- The repository-wide copy test remains red on 14 pre-existing em dashes in the trip co-pilot and Storybook catalogue/audit files. No Help file appears in that failure list and the Help-specific copy test passes.
- Strict UI audit debt is unchanged: Help adds no native-control, raw-color, raw-radius, raw-shadow, raw-font, inline-style, or page-width debt.

## Accepted differences

- The target's custom header/footer and line illustration are directional only. The implementation deliberately keeps Morrovia's production navigation, shared footer ownership, canonical controls, and existing illustration asset.
- The target does not show the required Popular questions block. The implementation keeps the requested six concise questions without recreating a second content library.
- The existing compact mobile navigation remains unchanged and can overlap a full-page screenshot during capture; normal viewport behavior has no horizontal overflow or clipped Help controls.

final result: passed

# Shared Homepage / New Builder trip-capture design QA

- Source visual truth: `/Users/shaun/Desktop/Screenshot 2026-08-29 at 6.57.54 AM.png`
- Replaced Builder reference: `/Users/shaun/Desktop/Screenshot 2026-08-29 at 6.57.46 AM.png`
- Homepage implementation: `http://127.0.0.1:3021/journey/home`
- New Builder implementation: `http://127.0.0.1:3021/journey/new`
- Homepage browser capture: `/private/tmp/morrovia-trip-capture-home-final.png`
- Builder browser capture: `/private/tmp/morrovia-trip-capture-builder-final.png`
- Combined comparison: `/private/tmp/morrovia-trip-capture-comparison.png`
- Implementation: `components/easyt/morrovia-trip-capture.tsx` with one scoped CSS module and shared Storybook coverage.

## Full-view and focused comparison evidence

The source Homepage screenshot and both production-route captures show the same compact trip-capture anatomy: pink eyebrow, large prompt, overlaid Speak control, date/traveller/interest chips, and right-aligned `Plan my trip` action. Runtime measurements report the same 560px component width and approximately 305px component height on Homepage and Builder. The old Builder-only eyebrow, heading, explanatory copy, Continue action, and extraction hint no longer render.

## Required fidelity surfaces

- Typography and copy: both routes consume the same component and therefore the same type tokens, labels, placeholder, voice affordance, and CTA text.
- Spacing and layout: both routes consume the same CSS module; desktop browser measurements differ by less than one pixel in height and are identical in width.
- Colours and tokens: the component uses Morrovia semantic tokens and existing shared controls rather than page-local colour values or parallel primitives.
- Assets: the capture contains no raster artwork; controls reuse the established Lucide and voice-control implementations.
- States: empty, filled, loading, error, and 390px mobile states are covered in `Morrovia/Trip capture` Storybook stories.
- Responsive rules: the component is fluid below its 560px maximum, wraps its option/action row at 720px, stacks the primary action at 430px, and tightens compact controls at 340px. The in-app browser viewport capability did not change its reported 1326px CSS viewport during this pass, so exact 320/390/768/1024/1440 browser screenshots could not be captured. Static breakpoint inspection, the mobile Storybook state, Storybook production build, and shared single-implementation architecture provide the responsive evidence for this change.

## Interaction and pipeline evidence

- Typing enables the existing primary action; disabled, loading, and error states remain controlled by each route wrapper.
- Homepage and Builder retain the existing date range, traveller quantity, interest selection, speech input, and submit handlers.
- Submitting `Denver, Dallas, Puerto Vallarta and Oaxaca, starting from Paris.` through the New Builder reached the existing review flow with Paris as origin and all four destination intents retained; no resolver or planner behavior was changed.
- Production browser console review found no application errors on either route.

## Comparison history

1. Before extraction, Homepage and Builder rendered separate capture surfaces with different hierarchy, copy, CTA, and spacing.
2. The first convergence pass extracted the smallest controlled shared component and moved both route-specific state wrappers onto it.
3. The compliance pass replaced native chip buttons with the established shared button primitive, documented the textarea/voice composite exception, and reduced the UI-convergence baseline.
4. The post-fix browser comparison found no remaining actionable P0, P1, or P2 visual, state, interaction, or pipeline issue.

## Validation and residual gap

Typecheck, production build, Storybook build, Builder gate, trip-capture suite, Homepage route/layout checks, UI audit, UI-convergence tests, and whitespace validation all pass. Exact responsive browser screenshots remain a P3 tooling gap because the in-app viewport override did not take effect; no implementation defect or horizontal-overflow signal was found.

final result: passed

---

# Homepage Angkor edge QA

- Implementation: `http://localhost:3010/journey/home`
- Final 1440 px capture: `artifacts/homepage-hero-refinement/angkor-fade-final-1440-capture.jpg`
- Focused right-edge capture: `artifacts/homepage-hero-refinement/angkor-edge-final-1440.jpg`
- Root cause: the opaque Angkor source canvas extended 96 px beyond the hero while the original radial mask was still partially opaque at the hero's clipping boundary.
- Correction: the existing radial watercolor mask is intersected with a scene-specific right-edge feather that reaches full transparency immediately before the approved clip boundary. Position, scale, route geometry, content, and blending are unchanged.
- Final visual check: the right-side sky and watercolor cloud dissolve progressively into the page background with no detectable rectangular source-image boundary.
- Focused homepage hero tests and `git diff --check` passed.

final result: passed

---

# Homepage hero route-strip removal and illustration blending QA

- Approved reference: `/Users/shaun/Downloads/ChatGPT Image Aug 28, 2026, 05_54_08 PM.png`
- Production implementation: `http://localhost:3010/journey/home`
- Before capture: `artifacts/homepage-hero-refinement/before-1536.png`
- Final 1536 × 1024 capture: `artifacts/homepage-hero-refinement/after-1536.png`
- Side-by-side comparison: `artifacts/homepage-hero-refinement/reference-vs-implementation.png`
- Responsive captures: `artifacts/homepage-hero-refinement/after-320.png`, `after-390.png`, `after-768.png`, `after-1024.png`, `after-1440.png`, and `after-1728.png` in the same directory.

## Comparison findings

- P1 resolved: the sample Bangkok → Siem Reap → Phnom Penh → Ho Chi Minh City route strip no longer competes with the real trip prompt. Browser inspection confirms no route-strip element is rendered.
- P1 resolved: all four destination scenes now use individually tuned radial feather masks, varied scale, and asymmetric positioning. Their pale canvas edges dissolve into the page instead of reading as four equal rectangular tiles.
- P2 resolved: removing the route strip leaves deliberate negative space between the prompt and the lower Rome/Sydney scenes; the benefits row remains immediately below the complete hero composition.
- P2 resolved: the decorative route paths were made less symmetrical while retaining the existing production SVG, Morrovia action token, and four canonical pin positions.
- P2 resolved: the mobile composition retains all four scenes in a compact decorative band below the primary prompt instead of discarding half of the approved journey frame.

## Responsive and interaction evidence

- At 320, 390, 768, 1024, 1440, and 1728 px, `documentElement.scrollWidth` equals `clientWidth`; no page-level horizontal overflow was found.
- All checked widths render exactly four destination scenes and zero route-strip elements.
- The live homepage form, speech control, dates, traveller and interests actions, and Plan my trip CTA remain unchanged and above the decorative layer.
- Decorative images, dotted route, and pins remain hidden from assistive technology through the existing `aria-hidden` frame. No new interactive or duplicate live-region surface was introduced.

## Accepted differences

- The reference integrates navigation and hero artwork inside one rounded concept frame. The production page intentionally retains Morrovia's existing shared navigation and page shell, as required by this scoped refinement.
- The production prompt retains its real input sizing, loading behavior, and responsive controls rather than using the concept's static representation.

No actionable P0, P1, or P2 visual, responsive, or interaction finding remains in the requested scope.

final result: passed

---

# Routes discovery refinement design QA

- Source visual truth: `/Users/shaun/Downloads/ChatGPT Image Aug 28, 2026, 07_02_53 PM.png`
- Browser-rendered desktop implementation: `/Users/shaun/Documents/Morrovia/artifacts/routes-refinement/after-1440-viewport-v2.png`
- Combined comparison input: `/Users/shaun/Documents/Morrovia/artifacts/routes-refinement/reference-vs-implementation-final.png`
- Responsive evidence: `/Users/shaun/Documents/Morrovia/artifacts/routes-refinement/after-320-final.png` and `/Users/shaun/Documents/Morrovia/artifacts/routes-refinement/after-390-final.png`
- Viewports verified: 320, 390, 768, 1024, 1440, and 1680 CSS px
- State: published route catalogue, default filters, English UI

## Findings

No actionable P0, P1, or P2 visual, responsive, content-integrity, or interaction issue remains.

- Composition: the page retains one homepage-family scenic hero, compact filters, four featured journeys, one iconic-place row, one travel-style row, a calm next-step banner, and the shared footer.
- Content integrity: every iconic-place card targets a published route that contains the named attraction; every style card derives its results from the published route interest taxonomy.
- Visual hierarchy: the final desktop pass tightened the hero, route cards, supporting rows, and section gaps after the first comparison so the page reads as a curated catalogue rather than a content portal.
- Responsive behavior: the document width matched the viewport at every required breakpoint. Mobile card rows scroll within their section without creating page-level overflow, controls retain usable targets, and the CTA stacks cleanly.
- Interaction: route and wonder cards keep canonical Route Detail links, travel-style cards reveal their real filtered result set, and the shared Builder CTA keeps the existing `/journey/new` handoff.

## Accepted differences

- The approved mock illustrates six iconic places. Production currently surfaces four because Angkor Wat, Tikal, Cappadocia, Petra, and other mock examples do not all have a compatible published route in the current catalogue; empty or unsupported entries are intentionally omitted.
- The production CTA uses the shared Morrovia primary button treatment rather than creating a one-off pink button variant.

final result: passed

---

# Homepage four-destination hero design QA

- Source visual truth: `/Users/shaun/Downloads/ChatGPT Image Aug 28, 2026, 05_54_08 PM.png`
- Implementation: `http://localhost:3010/journey/home`
- Before captures: `artifacts/homepage-four-destination/before-1440.png`, `artifacts/homepage-four-destination/before-390.png`
- Final captures: `artifacts/homepage-four-destination/after-1440.png`, `artifacts/homepage-four-destination/after-wide.png`, `artifacts/homepage-four-destination/after-390.png`
- Final side-by-side comparison: `artifacts/homepage-four-destination/reference-vs-implementation.png`
- Tested state: English homepage, default two travellers, planner prompt entered, production Builder handoff completed.

## Visual comparison evidence

The final comparison confirms the approved central hierarchy: the existing Morrovia eyebrow, headline, lede, and live planner are centered inside four editorial destination scenes. Japan, Angkor Wat, Rome, and Sydney use one coherent watercolor treatment; pink pins and a dotted indigo route stay behind the product surface and outside the benefit row. The retained route summary remains visible below the planner because it is existing homepage content, but it no longer competes with or overlaps the submit action.

## Responsive and interaction evidence

- Wide desktop browser evidence reports a 1707 px document and viewport width with no horizontal overflow. A normalized 1440 px delivery capture is included for direct review.
- The live 391 px browser evidence reports document width equal to viewport width, no horizontal overflow, readable headline/planner controls, and a deliberate two-fragment mobile artwork treatment. The route line and two secondary scenes are omitted below 760 px.
- CSS breakpoints retain the complete four-scene frame through desktop/tablet, reduce scene scale and edge exposure at 1024/768, and use the simplified fragment band at 390/320.
- Add dates, traveller, and interests controls remained visible and enabled. A real prompt submission navigated to `/journey/new?homeDraft=1` and preserved Tokyo, Kyoto, Osaka, ten-day intent, two travellers, and the Builder handoff state.
- Decorative imagery and route marks are excluded from the accessibility tree; real planner controls and existing focus/keyboard behavior were not replaced.

## Findings and accepted differences

1. The first implementation inherited the old split-hero grid columns, placing the centered composition in the left column. The final hero explicitly resets to one centered grid column.
2. The retained route summary initially inherited absolute positioning and covered the submit button. It now follows the planner with a measured 20 px gap.
3. Mobile artwork initially collapsed because an inherited cross-axis rule gave the decorative frame zero width. The frame now stretches to the content width and renders two intentional fragments.
4. The reference uses one continuous painted canvas. Production uses four independently optimized WebP scenes with soft edge masks so assets remain maintainable and responsive while preserving the same editorial composition.

No actionable P0, P1, or P2 visual, overflow, interaction, or accessibility issue remains in the implemented hero scope.

final result: passed

---

# Builder spacing, route-copy and canonical-footer QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Downloads/Screenshot 2026-08-28 at 5.30.50 PM.png` (2048 × 1416 px). This is current-state evidence for the cramped navigation gap, zero-padding Stops field, redundant healthy-route copy and page-local footer.
- **Implementation evidence:** `artifacts/builder-refinement/builder-step1-1440.png` (1920 × 1659 px), `builder-step2-1440.png`, `builder-step1-320.png` (427 × 2149 px), `builder-step1-390.png` (520 × 2037 px), and `footer-short-page-1440.png`.
- **Combined comparison evidence:** `artifacts/builder-refinement/source-vs-implementation.png` (1920 × 830 px) places the supplied source and browser-rendered Step 1 state together. Both inputs were normalized to 960px width; the source became 960 × 664 and the implementation 960 × 830.
- **Viewport and density:** browser geometry was verified at 320, 391, 768, 1024, 1440 and 1600 CSS px. Host-scaled captures use approximately 1.333 output pixels per CSS pixel; layout conclusions use the browser-reported CSS geometry, not raster density.
- **State:** source and implementation both use a three-stop healthy-route Step 1. The implementation uses London → Tokyo → Takayama → Kyoto so Step 2 can also be exercised; the source's starting-point label differs and is not a visual acceptance target.

## Required fidelity surfaces

- **Fonts and typography:** the existing Morrovia display, UI and metadata roles are unchanged. No Builder heading, stepper or footer type style was modified.
- **Spacing and layout rhythm:** the navigation-to-Builder gap is now owned by the page boundary and measures 32px desktop/wide, 28px tablet and 22px mobile. Internal stepper-to-content spacing remains untouched. The Stops field computes to 9px vertical and 10px horizontal padding with an 8px chip gap.
- **Colors and visual tokens:** existing paper, ink, line, signal and action tokens remain unchanged. No new local control styling or card treatment was introduced.
- **Image and asset quality:** this refinement does not add, remove or replace any visible image or icon asset.
- **Copy and content:** the healthy state now retains only `ROUTE CHECK` and `Your route already flows well.` The reviewed-route facts, reorder reassurance and generic road-transfer trade-off are absent; coverage-change, fixed-commitment and avoid-driving warnings remain available.

## Interaction and responsive evidence

- Step 1 and Step 2 each measured a 32px navigation-to-Builder gap at 1440px.
- At 320px the three stop chips wrap to three rows; at 391px they wrap to two. Every chip remains within the Stops field bounds and the field's `scrollWidth` equals its `clientWidth`.
- Document width equals viewport width at 320, 391, 768, 1024 and 1600px, with one production footer in every checked state.
- The shared Journey shell uses a column flex layout; a short login page placed the single footer at the viewport bottom, while the long Builder continued to scroll naturally.
- Browser DOM and screenshots confirm `REVIEWED ROUTE FACTS`, the reorder reassurance and generic road-transfer sentence are not rendered in the healthy state.

## Comparison history

1. The supplied source showed an approximately 8px top margin from the Builder's own shell, zero Stops-field padding and a multi-paragraph healthy Route Check. The implementation moves the gap to the page boundary, sets the requested compact field padding and removes only redundant healthy copy.
2. The first responsive pass confirmed 22px mobile spacing and clean chip wrapping with no horizontal overflow. No post-capture P0/P1/P2 fix was required.
3. Footer consolidation was verified after moving the exact production `MorroviaFooter` to the Journey layout and removing page-local mounts. The Storybook production build includes `morrovia-footer.stories` importing that component directly.

## Findings

No actionable P0, P1 or P2 mismatch remains within this focused scope. The fixed mobile action dock appears at its viewport anchor in full-page screenshots; browser geometry confirms it does not create horizontal overflow or alter Stops-field containment.

final result: passed

---

# Trip Overview correction-pass design QA

- Approved source: `/Users/shaun/Downloads/ChatGPT Image Aug 28, 2026, 09_57_30 AM (3).png`
- Detailed acceptance crop: `/Users/shaun/Desktop/Screenshot 2026-08-28 at 10.51.43 AM.png`
- Previous implementation evidence: `/Users/shaun/Desktop/Screenshot 2026-08-28 at 10.47.09 AM.png`
- Corrected 1440 capture: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-correction-1440.png`
- Corrected 768 capture: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-correction-768.png`
- Corrected 390 captures: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-correction-390.png`, `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-correction-390-route.png`
- Direct comparison: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-correction-comparison.jpg`

## Blocking acceptance checks

- Planning Progress now has explicit summary, track, and footer rows. Browser geometry measured a consistent 10px gap and zero overlap between every track and its status/action at 390, 768, and 1440.
- Route cards use one 178px image-led geometry, compact circular sequence numbers, an in-card `Journey origin` label, simple directional chevrons, and a one-line transfer beneath each applicable step. The expanded `From` pill and connector panels are gone.
- Destination media resolves in canonical order: persisted plan media, the existing itinerary media catalogue, then the existing `/api/journey-place` resolver. Marrakech returned a provider-backed Unsplash image in runtime verification; no destination-specific mapping was added.
- The compact map is the existing `JourneyPlannerMap` MapLibre component in a non-interactive preview mode. It consumes canonical origin/stop coordinates plus `mapRouteLegsFromTrip`, fits the whole route, exposes no planning controls, and links to the canonical Map workspace.
- `Why this order` is one shallow banner with one canonical rationale and the existing detailed-itinerary action.
- The accommodation endpoint returned `{ configured: false, properties: [] }` locally, so the compact fallback is correct. No hotel facts were fabricated or discarded.
- Page overflow measured 0px at 390, 768, and 1440. The map remains beside the journey at 1440 and moves beneath it at 768/390.

## Visual comparison result

The direct comparison materially closes the composition gap: the readiness strip follows the reference rhythm, the journey is image-led rather than connector-led, the map and route now read as one composition, and the rationale no longer resembles an engine-debug card. Differences in stop count, geography, route shape, imagery, and provider inventory are canonical data differences rather than visual defects.

No actionable P0, P1, or P2 visual findings remain.

final result: passed

---

# Trip Overview presentation refinement design QA

- Current-state source: `/Users/shaun/Desktop/Screenshot 2026-08-28 at 9.43.47 AM.png`
- Approved visual direction: `/Users/shaun/Downloads/ChatGPT Image Aug 28, 2026, 09_57_30 AM (3).png`
- Browser-rendered desktop implementation: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-after-1440-top.png`
- Browser-rendered route implementation: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-after-1440-route.png`
- Combined comparison input: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-design-comparison.png`
- Responsive evidence: `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-after-320.png` and `/Users/shaun/.codex/visualizations/2026/08/27/01a044c5-35e1-7000-ba42-9341bab36af7/overview-after-390.png`
- Production-backed QA state: guest trip built through the real public-route → Builder → Dates & nights → Build trip flow, with Cusco origin, Cusco / Ollantaytambo / Arequipa stops, nine days, three canonical legs and two travellers.
- Comparison caveat: the approved reference depicts a seven-stop Georgia trip while the browser QA trip depicts a three-stop Peru trip. The comparison therefore evaluates hierarchy, grouping, density, typography, imagery behavior and action presentation rather than false pixel/content equivalence.

## Findings

No actionable P0, P1 or P2 visual, responsive, content, interaction or accessibility findings remain within the requested Overview scope.

- Accommodation: the primary Trip.com action remains central. Overview asks the existing Booking Demand endpoint for at most one date- and coordinate-qualified property and validates the response before rendering factual name, address, rating or total. The QA environment returned no provider-confirmed property, so the implementation correctly used the compact destination-image fallback and Map Stay handoff rather than reproducing the mock's unsupported hotel, price, rating, reviews or amenities.
- Trip Health: canonical headline, detail, severity and issue destinations remain intact. Two bordered issue rows are shown, and `Showing the 2 highest-priority of 3 checks` explains the relationship to the full count before the review action.
- Planning progress: itinerary, stay and checklist percentages still come from the existing coverage/readiness functions. The section is now a compact three-column strip with existing small link-button actions rather than a second dashboard of isolated cards.
- Route: the title now uses canonical date, stop and country facts. Stops use the first real persisted image for the stop before the existing destination resolver, retain number/name/nights and canonical transfer labels/timings, and fall back to an icon treatment only when no image exists. No duplicate map was introduced; the existing Open map handoff remains explicit.
- Typography, color and shape: current Morrovia display/UI/meta faces, semantic tokens, Lucide icons, borders, radii and focus-ring treatment are retained. No new visual primitive or one-off asset system was added.

## Responsive and accessibility evidence

- Browser checks covered 320, 390-class (391 reported by the browser scale), 430-class (431), 768, 1024 and 1440 CSS px.
- Document width equalled viewport width at every checked size; no page-level horizontal overflow was found.
- The route changes to full-width 337 × 73 px stop rows at the 390-class viewport. At 768 px the desktop route strip has a contained 30 px internal overflow; at all other checked widths it has no overflow.
- The Trip.com action, Map Stay handoff, health review and incomplete progress actions are 44 px high at 320/390/430. Native links preserve keyboard behavior and visible focus rings; the route list is labelled and focusable when its contained desktop overflow is present.
- Browser console review found no application errors.

## Comparison history

1. The first pass only considered the first itinerary day when resolving a stop image, leaving useful persisted imagery unused. The resolver now prefers any real imaged day for that stop before using the existing destination-media fallback.
2. The first mobile pass inherited the shared small-control height for health/progress actions. The Overview now overrides the shared control variable to 44 px only at the mobile breakpoint.
3. Post-fix captures confirmed the approved hierarchy: decisive next step plus supporting visual, compact actionable Trip Health, reduced planning-progress strip and image-led route summary.

## Accepted differences

- The mock's named hotel, room photograph, recommendation label, price, review count, cancellation and breakfast claims are illustrative and intentionally absent unless the existing provider returns the corresponding factual fields. The current provider contract does not return a hotel image, review count, breakfast metadata or a Morrovia recommendation signal.
- The mock's compact route map is intentionally omitted because Overview has no existing safe shared map-preview component. The canonical Map workspace remains the single map implementation.
- Exact issue count, progress, route title, stop images, nights and transfer durations derive from the QA trip rather than the Georgia reference.

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

---

# Dashboard design-system convergence QA

- Source evidence: `/var/folders/gb/_l8hxm017mv0z46jd1lprhwr0000gn/T/TemporaryItems/NSIRD_screencaptureui_ZttcVH/Screenshot 2026-08-29 at 6.52.03 PM.png`
- Browser-rendered desktop implementation: `/Users/shaun/Documents/Morrovia/artifacts/dashboard-convergence/dashboard-1440.png`
- Mobile evidence: `/Users/shaun/Documents/Morrovia/artifacts/dashboard-convergence/dashboard-390.png`
- Keyboard-focus evidence: `/Users/shaun/Documents/Morrovia/artifacts/dashboard-convergence/dashboard-390-card-focus.png`
- Verified Storybook implementation: `http://localhost:6106/iframe.html?id=morrovia-05-product-patterns-trips-dashboard--active-trips&viewMode=story`
- State: authenticated active-trip library with four trips, a long multi-stop title, missing imagery, two visited countries, and one want-to-visit country
- Source dimensions: 1864 × 2138 px at supplied density
- Desktop implementation viewport: 1440 × 1100 CSS px; captured output is 1778 × 1358 px at the in-app browser's reported capture density
- Responsive viewports: 320, 390, 430, 768, 1024, 1440, and 1680 CSS px
- Normalization: the supplied current-state screenshot and the final 1440 px Storybook capture were reviewed together in one comparison input. Content and fixtures differ intentionally; the comparison targeted the specified control, lifecycle, Stamped, continuation, card-resilience, and interaction changes rather than pixel-cloning the old Dashboard.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the current Morrovia display, UI, and metadata roles remain intact. Long trip titles clamp to four lines, route summaries clamp to two, and neither pushes readiness or actions outside the card.
- Spacing and layout rhythm: the existing Continue / Stamped / library information architecture and responsive card-grid behavior are preserved. The Stamped summary now balances its real statistics and existing artwork without becoming a second Stamps workspace.
- Colors and tokens: Active uses the canonical action/lilac family, Planned and Archived use subdued semantic tokens, and genuine critical route state retains danger color, icon, and text.
- Image quality: saved trip imagery and the existing global-route illustration are reused. Missing trip imagery becomes a labelled real `3 stops` metadata surface rather than an unexplained decorative circle or fabricated image.
- Copy and content: lifecycle counts, stop totals, Stamped totals, dates, itinerary coverage, stay coverage, and route warnings remain derived from canonical trip and Stamps data.

## Interaction, accessibility, and responsive evidence

- Continue, Stamped, and each trip card expose a self-closing stretched link with a descriptive accessible name. Explicit Open, Edit, and native overflow disclosure controls remain sibling interactions above the overlay, so the DOM contains no nested controls.
- The keyboard-focus story visibly rings the whole card. Mobile Open and overflow targets measure 44 px; desktop Open/Edit use the canonical compact control while overflow remains 44 px.
- The Active / Planned / Archived control exposes one pressed option and truthful counts. Planned and Archived stories select their corresponding state, while the empty filter state remains useful.
- Search filtered the card list to the long Gatwick trip; clearing restored all four; sort changed to Title through the canonical select.
- The document width matched the viewport at 320, 390, 430, 768, 1024, 1440, and 1680 px. The grid resolved to one, one, one, two, three, four, and four columns respectively, with no page-level horizontal overflow.
- The production-backed Storybook stories render through an authenticated Storybook-only module double. Production auth, routing, persistence, lifecycle, CAS/recovery, readiness, Stamps data, and analytics paths are unchanged.
- Browser console review found no Dashboard errors. The isolated Storybook runtime emitted only the repository's existing Next.js runtime-config deprecation warning.

## Comparison history

1. The first static Storybook pass exposed that full Dashboard stories stopped at the signed-out boundary. A Storybook-only authenticated module double now keeps representative production stories inspectable without changing production auth behavior.
2. The old page-local pink filter surface was removed in favor of `EasyTSegmentedControl`; its shared mobile presentation was extended to a 44 px target rather than recreating a Dashboard variant.
3. The old lifecycle chip used the same pink signal family as critical states. Active, Planned, and Archived now have distinct non-danger token roles while critical Route remains visibly dangerous.
4. The final width sweep, independent-hit-area inspection, keyboard-focus capture, and combined visual comparison found no remaining P0/P1/P2 issue.

## Follow-up polish

- P3: the non-interactive grid-view indicator remains page-local because there is no current view toggle or canonical semantic control to invoke.
- P3: the isolated Storybook runtime's Next.js `next/config` deprecation warning is repository-wide and unrelated to this Dashboard pass.

final result: passed

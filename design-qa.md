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

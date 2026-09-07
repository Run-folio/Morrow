# Immersive homepage implementation

Status: **homepage-focused checks and builds pass, but the approved four-route experience is not release-ready. Keep the current homepage.** No staging deployment, publication change, main-branch change or production flag change was made.

Branch: `codex/immersive-homepage`. Candidate: `http://127.0.0.1:8873/journey/home`. Flag-off comparison: `http://127.0.0.1:8870/journey/home`.

## Parity checklist (written before implementation)

| Capability | Production owner to preserve | Verification |
| --- | --- | --- |
| New trip, account, Routes, language, mobile dock | EasyTNavigation | existing component retained; language/nav checked, authenticated pass pending |
| Text/speech, AI disclosure, dates, travellers, interests | HomeTripStarter → MorroviaTripCapture | capture parity tests + browser controls/handoff pass; microphone pending |
| Origin/end/same-as-start and canonical suggestions | JourneyEndpointsEditor | existing callbacks retained |
| Submission/error/retry/latest-request protection | HomeTripStarter | existing capture request gate retained |
| Homepage → Builder | createHomeTripDraft / HOME_TRIP_DRAFT_KEY | existing handoff retained |
| Reviewed route → Builder | RoutePlanLink / routePlannerPayload | no replacement handoff |
| Route availability | publicRoutePublishedFamilies / release workflow | unpublished routes excluded |
| Demo views | isolated reducer using public route detail | no storage, fetch or TripDocument writes |
| Affiliates and attribution | getCurrentPartnerAction / MorroviaAffiliateLink | canonical click owner only |
| Privacy, consent, legal | existing app shell / MorroviaFooter | retained |
| Motion and keyboard | local Quiet view + system media query | static endpoint; explicit controls |
| Responsive hero | scoped composition around canonical capture | 320/390/430 and desktop review |


## 1. Architecture used

The existing server-rendered `/journey/home` selects the new composition only when `IMMERSIVE_HOMEPAGE_V2` is exactly `true` and at least one eligible canonical example is available. The server selects the initial example using the existing Fisher–Yates helper and serializes its index. The client never re-randomizes it. Page-specific chapters share a selected-route controller; the product sample uses a separate in-memory reducer.

## 2. Files added and changed

The main additions are `app/journey/home/immersive/`, `app/journey/home/loading.tsx`, `lib/easyt/immersive-homepage-{config,routes}.ts`, `lib/easyt/homepage-{navigation,demo,affiliate-imagery}.ts`, `public/journey/immersive/`, and `tests/immersive-homepage.test.ts`. The existing server page and staging environment example gain the switch. Shared navigation and link-button types gain an optional prefetch control; existing callers retain their behavior. Storybook gains an immersive-navigation example and its generated inventory update. Evidence is in `artifacts/immersive-homepage/`.

## 3. Prototype-only code excluded

No simulated AI response, fake receipt, prototype voice handling, fake affiliate URLs, hard-coded stop/night/transport fixture catalogue, prototype persistence, navigation replacements, or new prototype application routes were imported. Unresolved prototype background binaries were excluded. Local QA instrumentation lives outside production source and is not included in the build.

## 4. Production components reused

`HomeTripStarter`, `MorroviaTripCapture`, `JourneyEndpointsEditor`, `EasyTNavigation`, `EasyTButton`, `EasyTLinkButton`, `EasyTSegmentedControl`, `MorroviaQuantitySelector`, `ResilientImage`, `RoutePlanLink`, `MorroviaAffiliateLink`, and the existing footer/consent owners are reused. The map composes `JourneyPlannerMap` in its existing whole-route preview mode with the existing overview preview CSS. Stop selection remains available through the adjacent accessible stop list. It does not reproduce the full interactive planning map or Builder.

Shared extensions are limited to nonvisual navigation prefetch control. The new scatter/align chapter and chapter layouts are unique homepage composition. Existing Georgia/UI fonts, tokens, controls and rounded geometry remain authoritative. The six documented raw indigo values are narrow photographic scrim exceptions; they are not a second UI palette.

## 5. Route-data ownership and publication blocker

`homepageEligibleRouteCards()` and `publicRouteDetailFor()` own admission and handoff data. Stops, countries, coordinates, durations, minimum nights and the journey title come from canonical records. Approved short places-chapter labels are presentation copy; they do not define routes. Destination media joins to canonical place/country names through a rights inventory.

The current eligible subset is **Japan: Tokyo → Takayama → Kyoto**. Japan is not the approved five-stop sequence. `balkans-overland`, `vietnam-cambodia` and `iceland-ring-road` remain `needs-review` and unpublished. The candidate truthfully shows `1 / 1`, disables previous/next and omits unavailable alternatives. It does not present four fabricated or unpublished examples.

The existing [editorial release workflow](public-route-editorial-release.md) requires “an editorial owner, independent reviewer, and explicit unknowns array”. It also requires recommended nights, route-order rationale, connection provenance and rights records. The legacy published Japan entry does not itself meet all new-release fields. Image licensing work here is not a substitute for route editorial review. Reviewer/provenance information was requested; it has not been supplied. No confidence flags or reviewer identities were invented.

## 6. Affiliate ownership

The four categories resolve through `getCurrentPartnerAction` and delegate all clicks to `MorroviaAffiliateLink`: current accommodation/Trip.com resolver, Viator, Omio and Saily. Existing fallback, attribution, consent, new-tab and sponsored/noopener/noreferrer behavior is retained. Category focus/hover/selection changes only the displayed illustration. Clicks never mark bookings or trip-readiness tasks complete. One compact commission disclosure is shown.

## 7. Asset provenance and loading

- [Generated asset inventory](../public/journey/immersive/asset-inventory.json): two original imagined hero/closing landscapes plus sixteen distinct route/category scenes. It records source generation IDs, rights/status, semantics and responsive files/bytes. The sixteen scenes derive from the four approved generated atlases, with technical extraction/resizing only.
- [Destination inventory](../public/journey/immersive/destination-inventory.json): sixteen named destination photographs with author, source, licence URL, derivative notice and measured responsive dimensions. These records cover current and prospective canonical examples; unused images are not eagerly loaded. Osaka still needs its final image association if a reviewed five-stop Japan record is published.
- [Public credits](../public/journey/immersive/credits.html): source and licence attribution. Hero and closing images are explicitly imagined landscapes. Affiliate scenes are illustrations, not provider inventory or booked services.

The hero is the only eager photograph in the measured candidate. Named destination pictures are responsive/lazy. The map mounts only near its chapter. Affiliates request the active image and then one adjacent category progressively, honoring Save Data for that prefetch. They do not load all sixteen files at first paint.

## 8. Visual parity

Preserved: immersive hero; large mixed hierarchy; embedded real prompt; portrait scatter→align with the approved 45vh travel; separate places and photographic explanation chapters; Map-first canvas with view controls attached and journey selector below; large affiliate chapter; final immersive CTA. Licensed/generation-provenance replacements preserve the photographic composition but are not pixel-identical to the prototype.

The three-stop/one-route publication subset is a visible parity gap. Full four-route visual approval is not claimed. The actual map uses the canonical numbered whole-route preview and accessible adjacent selection, rather than copying the prototype map rendering. See the [responsive contact sheet](../artifacts/immersive-homepage/responsive-contact.jpg), [places](../artifacts/immersive-homepage/places-1440.jpg), [journey](../artifacts/immersive-homepage/journey-1440.jpg), [map](../artifacts/immersive-homepage/map-1440.jpg), [affiliates](../artifacts/immersive-homepage/affiliates-1440.jpg) and [closing](../artifacts/immersive-homepage/closing-1440.jpg).

## 9. Functional parity

A real local submission reached `/journey/new?homeDraft=1` with Tokyo, Takayama, Kyoto, ten days, two travellers, Food and Culture. Builder used its real interpretation/review UI, including its existing remaining Japan-area clarification; no fake completed plan was shown. See [handoff evidence](../artifacts/immersive-homepage/real-capture-handoff.txt).

Browser checks exercised dates, traveller quantity, interests, AI disclosure, canonical London origin suggestions, same-as-start, English/Spanish switching and final-CTA focus. The sample increased Tokyo from three to four nights; Map retained the total and Itinerary showed Takayama on day five. Reset restored nine nights. All four active-route affiliate image states were checked. The canonical Start with this route CTA also reached Builder with all three stops and ten days. Its existing ending-place confirmation still gates continuation, so a full route-to-completed-Builder pass is not claimed. See [route handoff](../artifacts/immersive-homepage/route-handoff.txt). No sample mutation reached real-trip storage or analytics. Authenticated account flows and real microphone transcription remain staging/device checks; their production owners were retained.

## 10. Mobile results

Captured 320×740, 390×667, 390×844, 430×932, 768×1024, 1024×900, 1440×1000 and 1920×1080. The 1920 viewport was displayed at 80% in a QA iframe, then exported at its CSS dimensions. Captures use exact iframe widths, not a scaled desktop layout. At 320 and 390, document width matched viewport width. The prompt uses natural content height, side-by-side endpoints at compact widths, wrapping attribute controls and readable 16px input text. The measured 390px form was approximately 470px tall rather than the old ~1043px surface.

On short screens the real mobile navigation dock is retained; scrolling is necessary to reach all form controls. Traveller/date/interest/disclosure controls were exercised at 320px. The initially inherited white dock text was corrected. Physical mobile keyboard, dictation and low-end device behavior remain unverified.

## 11. Reduced motion

Quiet view and system reduced motion disable image transitions, pointer depth and scatter transforms. Quiet view removes the extra sticky travel and stops scroll work. A media-query listener reattaches desktop progression correctly after resizing. Mobile has no scatter scroll listener. Final CTA focus/scroll is immediate, with no timer-driven focus steal. The existing map preview uses its static preview behavior. Quiet view was exercised in the browser; a physical OS setting/device pass is still required.

## 12. Performance before/after

| Measurement | Existing homepage | Candidate |
| --- | ---: | ---: |
| Next production first-load JS (reported compressed estimate) | 344 kB | 355 kB |
| Image bytes observed before scrolling, 390×844 | 3,530,730 | 61,040 |
| Image bytes observed before scrolling, 1440×1000 | 3,761,864 | 178,034 |
| Initial CLS, 390×844 | 0.309 | 0 |
| Initial CLS, 1440×1000 | 0.108 | 0 |
| Local LCP, 390×844 | 1,276ms, consent paragraph | 752ms, hero image |
| Local LCP, 1440×1000 | 668ms, original hero illustration | 788ms, hero image |

These are single local browser observations, not field Core Web Vitals, cold-network benchmarks or low-end CPU results. The original mobile run included first-visit consent, so its LCP element is not directly comparable. The desktop original-tree measurement was repeated using the flag-off comparison build; the 344kB JS baseline came from the pre-change build. Responsive candidate selections were 768w at mobile and 1536w at desktop; other device pixel ratios can select different files.

A temporary local proxy injected PerformanceObservers and exposed measurements in a hidden DOM output; this code is not shipped. Raw JSON evidence is in the artifacts directory. The server loading fallback now reserves the viewport so the footer cannot flash before streamed content. Navigation prefetch is disabled only for the new homepage, reducing initial observed script requests from 43 to 19. The temporary dual-homepage bundle accounts for the small first-load increase.

The demo map chunk (`7884…js` in this build), MapLibre/shared worker and related chunks were absent at first paint and appeared when the sample was reached. Nearby route-CTA prefetch can also request Builder dependencies after scrolling into the story. The maximum observed event duration during sample interactions was 104ms; session CLS after lazy content and interactions was 0.015. This is an event-timing observation, not a validated INP score. Low-end-mobile map cost remains a staging acceptance item.

## 13. Accessibility

DOM checks confirmed one H1, H2 chapters, H3/H4 sample hierarchy, labelled controls, current-route live status, pressed-state view controls, keyboard equivalents for route controls and image focus, meaningful destination alt text and decorative landscapes. The AI disclosure opens its labelled dialog and receives focus. The final action focuses the existing labelled textarea. Functional text uses canonical token pairs; photography uses localized scrims. The map has an equivalent text stop list.

This is not a complete screen-reader or automated contrast certification. Keyboard/speech/OS-motion behavior across Safari, mobile browsers and authenticated states remains part of staging approval. Shared control touch sizes were not reduced to fit the composition.

## 14. Analytics

The real `HomeTripStarter` retains prompt-start request gating and submission events. `RoutePlanLink` retains `route_started`. Affiliate clicks have exactly one canonical owner. The sample adds no real-trip events, persistence calls or new taxonomy. There is no client randomization or hydration effect issuing route impressions. Existing consent/privacy gates remain unchanged. Relevant analytics/privacy and commercial-boundary tests passed; live consented event delivery is a staging check.

## 15. Tests and validation

134 focused/relevant tests passed: immersive homepage, existing hero layout, route selection/publication/handoff/release, navigation architecture, capture entry parity, endpoint editing, analytics, affiliate commercial/surface boundaries and consent/privacy runtime. `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, production Storybook build and `git diff --check` passed. No ESLint configuration was introduced.

Unit coverage verifies deterministic injected selection, four-item wraparound, local scroll correction, reducer continuity/minima/reset/nonmutation, publication exclusion, real-owner wiring, sixteen image states/fallback, named-photo attribution and Quiet-view/focus behavior. Four-route browser switching cannot be honestly verified until those routes are published. The broader `npm run test:public-routes` run finished with 33 passes and three failures in `curated-route-trust.test.ts` (Japan, Andean Highlands, Portugal). All three reproduce in an isolated archive of starting commit `a523c75`: the expected arrival-leg source is `canonical-endpoint-identity`, but the actual source is `curated-route`. No involved route/trip owner was changed in this task. These baseline failures remain unresolved and are an additional acceptance item. No application hydration error was observed. An early temporary QA observer syntax error was corrected; it was not production code.

## 16. Feature flag and rollback

`IMMERSIVE_HOMEPAGE_V2` is absent/default-off, with `false` documented in `.env.staging.example`. No browser override exists. Rollback is setting/removing the server variable and redeploying through the existing host environment mechanism. The original component tree remains present and was checked in the flag-off local server. No main/production default was changed.

## 17. Staging readiness

**Hold staging rollout.** The homepage-focused tests and build checks pass; the broader route suite has three confirmed baseline failures, and the approved four-route content and full acceptance matrix remain incomplete. The user’s staged rollout was conditional on all stages being green. No staging or production environment, database, route publication or deployed application was mutated. The next rollout remains: reviewed canonical content → local four-route parity checks → staging deploy flag-off → confirm fallback → enable staging flag → real functional/device/performance QA → user review.

## 18. Remaining gaps

1. Canonical reviewed five-stop Japan content, and publication-ready Balkans, Vietnam/Cambodia and Iceland records with required editorial provenance/reviewer. Do not fill this gap with homepage fixtures.
2. Browser verification of all four route states, stable random coverage and journey-section switching at the same scroll position once those records exist.
3. Full staging hero/route handoff, consented analytics delivery, authenticated account behavior, real microphone/keyboard, OS reduced motion, contrast/screen-reader review, and low-end mobile performance.
4. Resolve the three baseline route-trust persistence test failures and review the existing route-handoff ending-place confirmation.
5. Final five-stop Japan image association (including Osaka) and full four-route visual review against the approved prototype.

The current one-route candidate is reviewable locally, but is not represented as the approved complete homepage.

IMMERSIVE HOMEPAGE IMPLEMENTATION NOT READY — KEEP CURRENT HOMEPAGE

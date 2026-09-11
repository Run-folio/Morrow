# Immersive homepage implementation

> **Current status, 2026-09-08:** the approved four-route homepage, canonical route publication, Builder `journeyEnd` repair and image-backed semantic footer are on `staging`. The immersive composition is now the canonical `/journey/home` implementation and needs no environment selection. This cleanup has not been pushed or deployed. See [route publication](immersive-route-publication.md) and [footer verification](immersive-footer-integration.md).

The staging review below records the earlier incomplete state at commit `b5f6cd8` and is retained as historical implementation evidence. Its default-on setting, content blockers and acceptance totals have been superseded by the current reports above.

## 1. Starting SHA and branch

Starting staging SHA: `a523c7558694af745844b1b7cd37a0ec89009762`. The worktree was clean. A fresh fetch confirmed `origin/staging` at that SHA, local `main` at the same SHA, and `origin/main` (`ed5913abff3d2eeb34b873eb60464a07d3ba323d`) already in its ancestry. Staging was then fast-forwarded through the six existing homepage commits ending at `846f3f3`; subsequent refinements were made directly on staging.

## 2. Files changed

The [complete file manifest](../artifacts/immersive-homepage/changed-files.txt) lists changes against the starting SHA. Main groups:

- `app/journey/home/page.tsx`, `loading.tsx`, and `immersive/`: page composition, real capture integration, route chapters, isolated product sample, affiliate chapter, final CTA, responsive styling and language hook.
- `lib/easyt/immersive-homepage-{config,routes}.ts`, `homepage-navigation.ts`, `homepage-demo.ts`, `homepage-affiliate-imagery.ts`: request choice, canonical route DTOs, selection helpers, in-memory sample and asset mapping.
- Shared navigation and its Storybook story; optional prefetch forwarding in `EasyTLinkButton`.
- `lib/analytics.ts`, its documentation/tests, homepage tests and `.env.staging.example`.
- `public/journey/immersive/`: rights-cleared responsive imagery, provenance inventories and public credits.
- `docs/immersive-homepage-route-review.md` and `artifacts/immersive-homepage/`: review record, screenshots, measurements and validation evidence.

## 3. Architecture and composition

Hero → places → journey → Map/Builder/Itinerary → booking support → immersive final CTA. The real app footer follows. Large desktop chapters use viewport scale where useful; mobile chapters follow content height. The homepage does not introduce another planning engine, trip store or endpoint model. The old homepage remains available through the explicit server-side fallback switch.

## 4. Production owners reused

`HomeTripStarter` composes `MorroviaTripCapture`, `JourneyEndpointsEditor`, date/traveller/interest controls, speech and AI disclosure. Its real request gate and `createHomeTripDraft` handoff remain unchanged. `EasyTNavigation`, `EasyTButton`, `EasyTLinkButton`, `EasyTSegmentedControl`, `MorroviaQuantitySelector`, `ResilientImage`, `JourneyPlannerMap`, `RoutePlanLink`, the canonical affiliate owner and `MorroviaFooter` are reused.

Shared extension: optional link prefetch control, used by immersive navigation to avoid eager Builder loading. Storybook includes the real immersive navigation state. No new shared primitive was created. The page-specific scatter composition, atmospheric scrims and demo layout are intentional editorial exceptions; control semantics/tokens stay shared. Scoped disclosure positioning keeps the existing dialog clear of the device safe area and neighbouring chapters, with a 44px close target.

## 5. Route-data source

`homepageEligibleRouteCards()` → `publicRouteDetailFor()` owns admission and content. Stops, coordinates, countries, nights, range, summary and Builder draft are derived from canonical records. Editorial headings/themes are presentation copy. The available subset is currently only `japan-slow`; the UI truthfully displays `1 / 1`, disables previous/next and omits unpublished alternatives.

## 6. Japan five-stop implementation/source

**Not complete.** Canonical Japan remains Tokyo → Takayama → Kyoto. The requested Tokyo → Kanazawa → Takayama → Kyoto → Osaka sequence has not been smuggled into a homepage fixture. The [content-review record](immersive-homepage-route-review.md) identifies the canonical catalogue/Builder seed changes, connection replacements, night guidance, reviewer and image association required. The [machine-readable release report](../artifacts/immersive-homepage/route-release-status.json) records every current blocker. No independent reviewer identity, reviewed-night value or confidence upgrade has been invented.

## 7. Randomisation

The server reuses the existing Fisher–Yates selection and serializes one initial index. One client selected-route state is initialized from it. Rerenders, language changes, focus, sample edits and hydration do not rerandomize. Four-way selection cannot currently be demonstrated because three requested families remain unpublished.

## 8. Two-stage route interaction

Places and journey remain separate chapters. Desktop photographs settle from stagger/rotation into an ordered line over 45svh of ordinary scrolling. Hover/focus emphasis does not reflow the page. Quiet view/mobile use the static ordered state. Route changes use the same owner and compensate only the active chapter’s offset; journey changes focus its heading without scrolling back to places. Approved mixed headings and route-character labels are restored.

## 9. Product demo isolation

Map starts active. Map/Builder/Itinerary controls attach directly to the canvas; the journey selector sits below. A reducer stores nights, selected stop and current view in memory only. Adding a night changes subsequent itinerary day numbering and map totals. Reset restores the canonical seed. No account creation, storage writes, mutation API, TripDocument or real-trip analytics are used by the sample. Route changes retain the view and update the shared homepage route, including hero and affiliates.

## 10. Map lazy loading

The sample imports its Map component dynamically after an IntersectionObserver reaches the chapter (300px margin). It uses the production `JourneyPlannerMap` whole-route preview, real coordinates, numbered order and selected-stop state. Connections are labelled illustrative/subject to confirmation; this is not a timetable claim. MapLibre was absent from initial-page script requests and appeared only on reaching the sample. Existing `RoutePlanLink` may prefetch Builder dependencies near the journey chapter; that is separate from first-paint Map loading.

## 11. Affiliate resolver integration

Every outbound action uses `getCurrentPartnerAction` and `MorroviaAffiliateLink`: current Trip.com accommodation owner, Viator, Omio and Saily. Existing fallback, consent, analytics, sponsored/noopener/noreferrer and new-tab behaviour remain in that owner. Image/category interaction never marks bookings or readiness complete. One commission disclosure is shown.

## 12. Affiliate image mapping

Sixteen distinct route/category scenes cover four route keys × accommodation/activities/transport/connectivity. Hover, keyboard focus and category selection change only the current illustration. Changing the shared journey substitutes that route’s corresponding scene. The active scene loads near the viewport, then one likely adjacent category warms opportunistically, respecting Save Data. These are separate from itinerary destination photographs; they are not provider inventory.

## 13. Image provenance

[Generated inventory](../public/journey/immersive/asset-inventory.json), [destination inventory](../public/journey/immersive/destination-inventory.json), and [public credits](../public/journey/immersive/credits.html) record source, rights, intended use, semantics and responsive variants. No unresolved prototype photo was shipped. The final Japan hero is an explicitly labelled imagined Japanese-Alps landscape generated for this task; it preserves the approved open landscape composition. Other prospective route heroes resolve credited destination images. Closing imagery is an imagined coast. Generated affiliate scenes do not imply availability or exact listings. Osaka’s final production association remains part of the five-stop content task.

## 14. Mobile implementation

Verified at 320×740, 390×667, 390×844, 430×932, 768×1024, 1024×900, 1440×1000 and 1920×1080. Document width matched each target. The final 1440px capture was displayed at 80% and the 1920px capture at 60% to fit the review window, then exported at their CSS dimensions. Other captures use their native iframe dimensions. At 390px the real form measures about 437px tall, versus the original approximately 1043px; at 320px it is about 493px. AI disclosure shares the planning-action row. Text remains 16px with canonical internal field padding; endpoints use two columns; attributes wrap rather than shrinking touch targets. On short screens, scrolling is still needed. The existing mobile navigation and safe-area spacing are retained. Physical keyboard/microphone testing remains outstanding.

## 15. Reduced motion

Quiet view and `prefers-reduced-motion` disable pointer depth, image transitions and scatter transformations. Images appear ordered immediately; extra sticky dwell and scroll listeners are removed. Desktop listeners reattach after viewport changes. Closing CTA focuses the real textarea immediately without a delayed focus steal. Quiet view was browser-tested; a physical OS reduced-motion/device pass remains unverified.

## 16. Accessibility

One hero h1, chapter h2s and sample h3s; real labelled capture controls; explicit previous/next controls and live current count; focusable photographs; pressed-state segmented controls and example selection; descriptive affiliate new-tab labels; visible focus and legal disclosure links. No gesture-only control. Browser checks exercised AI disclosure, Escape dismissal/focus return, keyboard focus and closing CTA. A 320px layering defect was found and fixed: disclosure remains clear of bottom safe-area controls and the route chapter, with its full text/link visible. This is not a full screen-reader or automated contrast certification.

## 17. Analytics

Existing hero prompt/submit/request gating, `route_started`, pageview/Routes path and canonical affiliate click events remain unchanged. Added only `homepage_route_viewed` with public `route_id`, `selection` (initial/change) and `stop_count`. A ref guard ignores effect replay and repeated same-route selections. It attempts one initial event per mounted homepage entry and one per changed selection. The central consent owner may drop events before consent; they are not replayed later. Demo night/view interactions emit no real-trip product events. Consent/coarse-payload and duplicate-selection tests pass; live provider delivery is unverified.

## 18. Performance before/after

Original Next first-load estimate: **344kB**. Final estimate is recorded in [build output](../artifacts/immersive-homepage/build.log) (approximately 356kB). Original image bytes before scrolling: 3,530,730 at 390px and 3,761,864 at 1440px. The earlier generated-Andes candidate measured 61,040 / 178,034 bytes; those are historical measurements, not the final Japan asset. Final measurements are in `performance-staging-390.json` and `performance-staging-1440.json` and show **50,464 bytes at 390px / 165,676 bytes at 1440px**, **CLS 0** at both widths, and local LCP observations of **364ms / 456ms**. Initial image transfer is approximately 98.6% / 95.6% lower than the original. Each final initial request set contained 19 scripts; the map stayed deferred.

All timings are single local browser observations without CPU/network throttling, not field Core Web Vitals. Earlier baseline CLS was 0.309 mobile / 0.108 desktop; candidate initial CLS was 0. Lazy-map interaction testing previously observed a maximum 104ms event duration (not a validated INP score). Low-end-device performance remains an acceptance item.

## 19. Visual comparison

The latest prototype `src/App.jsx`, final CSS and `review.html` were read directly before production refinements. The approved large mixed typography, spatial portrait geometry, 45svh pacing, separate journey chapter, attached product tabs, larger product/affiliate headings, sixteen affiliate states and closing invitation are retained. [Responsive contact sheet](../artifacts/immersive-homepage/responsive-contact.jpg) and chapter captures are in the evidence directory. Production navigation and real form controls intentionally retain their owners. The missing five-stop/four-route content remains a material visual-parity gap; no four-route browser approval is claimed.

## 20. Tests

**137 focused tests pass** across immersive homepage, navigation, homepage layout/randomisation, public routes/handoff/release, capture/endpoint parity, analytics, affiliate commercial boundaries and privacy. Coverage includes deterministic selection helpers, scroll-offset correction, shared view/night continuity, isolation, sixteen image mappings, canonical click delegation, reduced-motion/final focus wiring and consent-safe route-view deduplication.

Broader `npm run test:public-routes`: **33 pass, 3 fail**. The same failures were independently reproduced on starting SHA `a523c75`: Japan, Andean and Portugal curated-evidence tests expect `canonical-endpoint-identity` but receive `curated-route`. The affected endpoint/route model owners were not changed. Logs are in the evidence directory. This broader check is not green.

## 21. Build/typecheck/audit

`npm run build:check`, `npm run typecheck`, `npm run audit:ui`, Storybook build and `git diff --check` pass after final refinements. Generated Next environment/config churn is restored to the repository baseline. No ESLint configuration was introduced. Storybook’s generated visual inventory reflects the actual scoped rules and shared navigation story.

## 22. Remaining gaps

1. Canonical five-stop Japan authoring/review and publication of Balkans, Vietnam–Cambodia and Iceland. See the precise release report and content-review record.
2. The three confirmed baseline route-trust test failures.
3. Full four-route production/browser randomisation, transitions, sample continuity and image-state matrix, which cannot be truthfully exercised before publication.
4. Authenticated/device, real speech, screen-reader/contrast and low-end performance acceptance. Existing owners are preserved; these passes are not claimed.

## 23. Staging readiness and intended deployment steps

**Not ready to deploy. No push/deploy performed.** The local default-on implementation is for review, not a release approval.

After the gaps above are resolved and the user explicitly requests deployment:

1. On `staging`, check `git status --short`, fetch `origin main staging`, verify the approved SHA and main ancestry, and commit the reviewed diff if needed. Do not include unrelated changes.
2. Re-run the focused suites, `npm run test:public-routes`, `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `npm run build-storybook`, `npm run release:gate` and `git diff --check`.
3. Verify the existing isolated staging deploy and its environment against [staging-e2e.md](staging-e2e.md). Confirm the staging-only host/database/auth configuration and `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=preview`. No provider secrets or production environment values should be copied as part of this homepage change.
4. Only with explicit deployment authorization, `git push origin staging`, then trigger/confirm the existing protected staging branch deployment at the reviewed SHA. Repository documentation specifies a Netlify staging deployment; this task did not verify a live site ID or change host configuration.
5. Run `npm run staging:preflight` using staging-only configuration, then the homepage functional/consent/device matrix at `https://staging.morrovia.com/journey/home`. Confirm the canonical immersive presentation. Do not seed/reset data unless that separate QA workflow is authorized.
6. Record deployed SHA, checks and screenshots for review. Roll back by redeploying the last approved staging SHA. Do not merge to main or deploy production as part of this staging step.

## Capability parity checklist

| Capability | Result / owner |
| --- | --- |
| Morrovia wordmark/navigation | Retained: EasyTNavigation |
| New trip | Retained canonical entry |
| About | Retained navigation/footer |
| Routes / View all routes | Retained `/journey/discover` |
| Stamps | Retained navigation/mobile dock |
| Passport info | Retained navigation/mobile dock |
| How it works / Tour | Retained live navigation owner |
| Account / sign-in | Retained session-aware navigation; authenticated browser pass pending |
| Language | Retained EN/ES owner; checked |
| Natural-language prompt | Real MorroviaTripCapture |
| Speech | Real voice owner; physical microphone pass pending |
| Starting point | Real endpoint editor/autocomplete |
| Ending point | Real endpoint editor/autocomplete |
| Same-as-start | Real canonical callback; checked |
| Dates | Real date picker; checked |
| Travellers | Real quantity control; checked |
| Interests | Real selection control; checked |
| AI transparency | Real disclosure, compact row, layering fixed |
| Plan my trip | Real submit/request gate |
| Homepage → Builder | Real home draft handoff; local submission checked |
| Route → Builder | Real RoutePlanLink; current three-stop handoff checked |
| Route discovery | Current publication boundary and real Routes destination |
| Analytics | Existing owners plus consent-gated homepage-only impression |
| Affiliate disclosure/clicks | Canonical resolver/link, state-neutral |
| Privacy/legal/footer | Existing app shell and MorroviaFooter |
| Keyboard/accessibility | Explicit controls/focus retained; full assistive-tech pass pending |
| Responsive/mobile | All requested widths captured; no horizontal overflow |
| Quiet/reduced motion | Static ordered layout; controls retained |

No useful production capability was intentionally removed. Content publication and unverified acceptance cases are explicitly called out above rather than treated as completed parity.

HISTORICAL STAGING REVIEW — SUPERSEDED BY THE 2026-09-08 LOCAL MERGE STATUS ABOVE

# Morrovia performance and cleanup audit

Audit date: 2026-08-30

Scope: measurement and inventory only. No production component, route, provider,
data model, or asset was changed. Measurements describe the current working
tree and local production build; they are not field Core Web Vitals.

## Executive answer

**Is Morrovia currently too slow for private beta? NO.** The local production
candidate rendered the public homepage, Builder, and Map without a reproduced
blocking defect. The main planning routes are nevertheless carrying an
avoidable roughly 0.5 MB compressed map stack on first load, and the homepage
still references roughly 5.4 MB of unoptimised CSS-background artwork. Those
are worthwhile P1 launch improvements, not reasons to hold a small private
beta.

## Ranked plan

| Priority | Finding | User impact | Evidence | Estimated effort | Risk | Recommended action |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | MapLibre and the 50 m world atlas are in Overview, Itinerary, and Builder initial bundles | Slower parse/download on three core screens even when the traveller is not using the Map | `TripOverviewWorkspace` and `TripItineraryWorkspace` statically import `JourneyPlannerMap`; Builder statically imports the entire Itinerary workspace. The common map payload is about 515 kB gzip before route code. | 1–2 days | Medium | Create one lazy map-preview boundary. Load the full map only when its preview becomes visible/active; lazy-load the built Itinerary view in Builder. Keep the actual Map route eager. |
| P1 | PostHog is an eager dependency of every Journey route | About 82.6 kB gzip is downloaded even when consent is absent and no event is sent | `lib/analytics.ts` imports `posthog-js` at module scope; navigation and the homepage starter import analytics. | 0.5–1 day | Low–medium | Dynamically import PostHog after consent and queue the first permitted event/identity call until initialisation completes. Preserve current consent semantics. |
| P1 | Homepage CSS backgrounds remain large PNG transfers | Slower first/early scroll on mobile networks; up to about 5.4 MB raw across the current hero/proof/preparation artwork | `morrovia-asia-dawn.png` 2.25 MB, `decision-triptych.png` 1.46 MB, and `prep-triptych.png` 1.86 MB are CSS backgrounds, so they bypass Next Image. | 0.5 day | Low | Produce dimension-appropriate WebP/AVIF equivalents and use CSS `image-set()` with the PNG fallback. Confirm the route-card fallback is really visible before retaining it. |
| P1 | The public navigation imports the full trip storage module | Public pages inherit a 76.7 kB gzip product-domain chunk containing storage, recovery, and planning helpers | `easyt-navigation.tsx` imports `beginNewTripNavigation`, `forgetRememberedOwner`, and `rememberLastOwner` from the broad `lib/easyt/storage.ts` module; the resulting `8127` production chunk is on every Journey route. | 1 day | Medium | Move only the three small shell-facing operations behind a narrow module/boundary or dynamically load the new-trip preservation path on intent. Do not rewrite recovery semantics. |
| P1 | Map eagerly requests place media for every stop | Provider/network work competes with the map on first entry even when canonical trip media may already be sufficient | `journey-map-planner-workspace.tsx` runs parallel `/api/journey-place` calls for all context stops on mount. | 0.5–1 day | Low–medium | Prefer existing canonical/cached media and request only missing selected/visible stop media; retain parallelism and provider fallbacks. |
| P2 | Overview travel-readiness can request once with the empty profile and again after local profile hydration | Duplicate provider work for returning travellers; it does not block the Overview header | `use-trip-prep-readiness.ts` starts with the default profile, then its local-storage effect can update `profile`, retriggering `/api/journey-readiness`. | 0.5 day | Low | Gate the first readiness request until local profile hydration has completed. Keep booking-readiness and travel-readiness requests parallel. |
| P2 | Builder prefetches discovery for every resolved stop | Avoidable provider calls before the traveller opens detailed itinerary discovery | `trip-builder.tsx` calls `/api/journey-discover` for each stop as soon as hydrated coordinates exist. | 0.5–1 day | Low | Fetch on the first screen that consumes discovery, or use a bounded idle prefetch after the first route is accepted. |
| P2 | Map owns a second trip/persistence state machine inside TripShell | Higher maintenance and regression risk; some duplicated session/recovery work | TripShell provides the canonical trip, but `JourneyMapPlannerWorkspace` copies it into `customTrip`, subscribes to auth, and owns another recovery/persistence queue. | 2–4 days | High | After beta, make the shell presentation consume the shared mutation owner. Retain the focused legacy/demo presentation until explicitly retired. |
| P2 | 24 tracked files/assets are high-confidence unused | Repository/build context noise; 31.4 MiB of unused product imagery | 16 Morrovia assets have no production/story/runtime reference; eight CSS modules have no imports. | 0.5 day | Low | Delete in a separate cleanup PR after visual-owner confirmation. The exact inventory is below. |
| P2 | Four declared packages have no source import | Install/security/update surface without production value | `@react-three/drei`, `@react-three/fiber`, `mammoth`, and `xlsx` appear only in package manifests/lockfiles. | 0.25 day | Low | Remove one at a time and rebuild. Keep `three`; portfolio routes still import it. |
| P2 | Two API routes have no in-repository caller | Possible obsolete endpoints, but external callers cannot be disproved statically | `/api/journey-routes` and `/api/journey-plan` have no app/component/test caller. The former is described in an old engine plan; the latter is a planner-shadow endpoint. | 0.25 day investigation | Medium | Check deployment logs/external consumers, then either document and test or remove. Do not infer deadness from import search alone. |
| DO NOT DO | Replace MapLibre or rewrite the Map workspace before beta | High regression risk for little proven beta benefit | The local Map canvas appeared in about 0.53 s on a warm local run; the defect is where the dependency is loaded, not the chosen map provider. | Large | High | Isolate loading first. Re-evaluate provider choice only with field data. |
| DO NOT DO | Broad server-component conversion of Builder, Map, or Itinerary | Risks persistence, drag/drop, focus, and recovery behavior | These surfaces are genuinely interactive; the large files alone do not prove a server/client defect. | Large | High | Extract only proven static islands or deferred features. |
| DO NOT DO | Remove legacy redirects, webhook/internal routes, or recovery code from static analysis alone | Could break saved links, providers, deployment health checks, or unsaved trips | Dynamic routes and external callbacks do not have reliable in-repository reference evidence. | — | High | Keep until traffic/log and compatibility evidence exists. |

There is no P0 finding in this audit.

## Current production route weight

`npm run build` reports 102 kB of shared first-load JS. Delta compares with
`docs/product-hardening-89.md` from 2026-08-29.

| Journey | Route | Route JS | First-load JS | Baseline first-load | Delta |
| --- | --- | ---: | ---: | ---: | ---: |
| Homepage | `/journey/home` | 15.2 kB | 327 kB | 305 kB | +22 kB |
| New trip / Builder | `/journey/new` | 60.6 kB | 974 kB | 950 kB | +24 kB |
| Dashboard | `/journey/dashboard` | 17.1 kB | 323 kB | 319 kB | +4 kB |
| Trip Overview | `/journey/[tripId]` | 15.9 kB | 876 kB | 870 kB | +6 kB |
| Trip Map | `/journey/[tripId]/map` | 3.02 kB | 990 kB | 985 kB | +5 kB |
| Trip Itinerary | `/journey/[tripId]/itinerary` | 6.19 kB | 903 kB | 883 kB | +20 kB |
| Routes / Discover | `/journey/discover` | 5.88 kB | 293 kB | 290 kB | +3 kB |
| Route Detail | `/journey/routes/[slug]` | 6.53 kB | 309 kB | 290 kB | +19 kB |
| About | `/journey/about` | 1.41 kB | 294 kB | 291 kB | +3 kB |
| Help | `/journey/help` | 9.17 kB | 302 kB | 299 kB | +3 kB |

The route-local sizes mostly fell or stayed flat while first-load totals grew.
That points to shared/import-chain growth rather than ten independent page
regressions.

## Largest production contributors and import chains

| Contribution | Production evidence | Import chain / scope |
| --- | ---: | --- |
| `world-atlas/countries-50m.json` | 756,548 B raw / 236,328 B gzip | `JourneyPlannerMap` → Overview, Itinerary, Map; Builder → Itinerary |
| MapLibre split 1 | 560,892 B raw / 139,024 B gzip | `JourneyPlannerMap` → same routes |
| MapLibre split 2 | 410,463 B raw / 110,799 B gzip | `JourneyPlannerMap` → same routes |
| PostHog client | 254,333 B raw / 82,568 B gzip | `lib/analytics.ts` → navigation/home/workspaces → every Journey route |
| Broad product storage/planning chunk | 259,934 B raw / 76,699 B gzip | `easyt-navigation.tsx` → `lib/easyt/storage.ts`; also core planning routes |

MapLibre itself is about 971 kB raw / 250 kB gzip across its two production
splits. Together with the atlas, the static preview import costs about 486 kB
gzip before `JourneyPlannerMap` and related route code. The production manifest
confirms that About, Help, Discover, Dashboard, and Homepage do not inherit
MapLibre. Route Detail correctly uses a dynamic `import("maplibre-gl")` in
`route-live-map.tsx`. Overview, Itinerary, and Builder do inherit it and are the
isolation defect.

Other dependency findings:

- `d3-geo`/`topojson-client` are confined to Map/Globe and Stamps experiences.
- `framer-motion` is used by the full Map workspace and portfolio animation;
  it is not the dominant planning-route cost.
- Lucide imports are named and tree-shaken; no whole-package icon import was
  found.
- Three.js is confined to non-Morrovia portfolio routes/components.
- OpenAI, Neon, and provider SDKs inspected here remain server-only.
- No Storybook or axe import was found in production app/component modules.
- No charting library or client-side date library was found in these journeys.

## Client-boundary opportunities

| Boundary | Evidence | Estimated benefit | Assessment |
| --- | --- | --- | --- |
| Builder | `trip-builder.tsx` is 3,093 lines/224 kB source and statically imports the 1,535-line Itinerary workspace | Avoid the roughly 0.5 MB gzip map stack plus inactive built-itinerary code on initial Builder | Highest-confidence split: load the built Itinerary only after a route is built/accepted. Do not server-render the form state machine. |
| Overview | Entire 574-line workspace is client code and directly imports `JourneyPlannerMap` for one preview | Roughly 0.5 MB gzip deferred; server/static extraction beyond that is likely modest | Lazy the preview first. Static summary extraction is optional P2 because the trip can mutate in the shell. |
| Itinerary | Entire 1,535-line editor is client code and directly imports `JourneyPlannerMap` | Roughly 0.5 MB gzip deferred; optional drawers could reduce more | Keep the editor client-side. Lazy its map preview, Copilot, discovery, and accommodation drawers by activation where UX permits. |
| Map | 2,268-line workspace is genuinely interactive | Small server split; dependency remains required | Do not optimise by file size alone. Post-beta, separate shell persistence from focused/demo state. |
| Dashboard | Server page already loads canonical data; 684-line client owns filters and actions | Likely 15–30 kB route JS, not a top beta issue | Server-render trip-card presentation and island only filters/actions if later field data supports it. |
| Public shell | 254-line navigation owns session, language, admin lookup, menu, sign-out, storage, and Tour | 76.7 kB broad storage chunk plus smaller auth/shell code can leave public routes | Split static links/logo from account/language/mobile actions; first narrow the storage import. |
| TripShell | Server wrapper already passes a canonical trip into a scoped provider | No proven wholesale saving | Keep. Its provider correctly owns live trip/recovery context; remove duplicate ownership from Map later. |

## Data-fetch and provider audit

### Dashboard

- Server order is sensible: authenticate, ensure the user, then load trips,
  preferences, and stamps with one `Promise.all`.
- `DashboardClient` subscribes to `authClient.useSession()` even though the
  server already supplied `ownerId`. This is a duplicated server/client session
  boundary, although Better Auth may deduplicate subscribers in the browser.
- Recovery sync is intentionally client-only and does not block server-rendered
  trip cards.

### Trip shell and Overview

- The authenticated layout fetches trip and preferences in parallel after its
  user/session checks. The resolver explicitly avoids repeating a known cloud
  miss and owns only the browser recovery fallback.
- Overview starts booking-readiness and travel-readiness in separate effects,
  so they are parallel rather than a waterfall.
- Returning-user profile hydration can retrigger travel-readiness, producing a
  default-profile request followed by the real-profile request.
- Overview also requests place images for all missing candidates in parallel
  on mount. They do not block the header, but should use canonical/cache data
  or visibility before provider work.

### Map

- The canonical trip is server-loaded through TripShell, but Map copies it into
  `customTrip` and repeats auth/recovery/persistence ownership.
- Place-media requests for every stop and geocoding requests for genuinely
  missing coordinates are parallel. The latter is justified; the former is
  over-eager when canonical media exists.
- Local-search/accommodation requests are interaction-driven and should remain
  so.

### Itinerary

- Current shell presentation does **not** run the old legacy all-day image
  enrichment effect; that effect is guarded by `presentation === "legacy"`.
- Discovery is requested when its suggestions surface mounts, not as a global
  server waterfall.
- Server-loaded TripShell data is reused, but the page still subscribes to the
  client session through shared persistence concerns.

### Builder

- Homepage handoff geocoding uses bounded parallel resolution and explicitly
  does not block initial Builder rendering.
- Per-stop discovery starts automatically after stops have coordinates, even
  if detailed discovery is not visible. Defer or idle-prefetch it.
- Canonical catalogue suggestions correctly avoid provider requests; geocoding
  is used only when canonical coordinates are missing or the user types an
  unsupported place.

No sequential provider waterfall that blocks above-the-fold UI was reproduced.
The opportunities are duplicate/early requests and shared client ownership.

## Image and asset audit

### A. Intentionally current/large

- About hero, closing artwork, and current Map screenshot are referenced by the
  current About page. The two multi-megabyte PNG illustrations use Next Image.
- Help's 2,009,843 B wayfinding illustration uses Next Image with intrinsic
  dimensions.
- Current Product Tour shots are 22–48 kB each and have current Overview/Map/
  Itinerary references; no old Prep tour screenshot remains.

### B. Existing resilient/Next Image pipeline

- About and Help already use `next/image`; source recompression is P2 storage/
  image-generation hygiene, not the first runtime fix.
- Trip, itinerary, and route media use `ResilientImage` or the existing route
  photo cache. Preserve provider attribution/fallback behavior.

### C. Compress/resize

- `public/journey/hero/morrovia-asia-dawn.png` — 2,252,997 B; CSS hero
  background, current production reference.
- `public/journey/illustrations/decision-triptych.png` — 1,455,600 B; current
  proof-section CSS background.
- `public/journey/illustrations/prep-triptych.png` — 1,857,802 B; current
  homepage practical-tools CSS background despite its legacy-looking name.
- `route-card-triptych.png` — 2,530,371 B; still referenced in CSS but appears
  superseded by the later live route-photo rule. Verify computed loading/failure
  states before classifying it as removable.

### D/E. Unreferenced and old design/Prep-era assets

Sixteen product assets (32,911,047 B / 31.4 MiB total) have no current runtime
or Storybook reference and are **SAFE TO REMOVE after one visual-owner check**:

- About: `why-traveller-control.png`, `why-fragmented-planning.png`,
  `why-connected-plan.png`, `capability-before-you-go.png`,
  `capability-day-itinerary.png`, `capability-smart-nights.png`,
  `capability-route-planning.png`, `about-closing-coastal-journey.png`.
- Illustrations: `southeast-asia-route-hero.png`,
  `southeast-asia-route-hero-v2.png`, `iberia-route-hero.png`,
  `home-closing-banner-v2.png` (superseded by the 100,302 B WebP),
  `builder-route-watercolor.png`, and `japan-route-confirm.png`.
- Product shots: `map-plan-hero-clean.png` and
  `about-workspace-overview.png`.

`southeast-asia-route-hero-v3.png` is Storybook-only, not dead.
`prep-triptych.png` is current production artwork, not dead. No file was deleted.

## Legacy/dead-code inventory

### SAFE TO REMOVE (separate cleanup change)

- The 16 assets above.
- Eight imported-nowhere CSS modules (6,014 B total):
  `home/explorer-detail.module.css`, `home/home-polish.module.css`,
  `home/home-profile-signal.module.css`, `home/profile-onboarding.module.css`,
  `home/stamp-card.module.css`, `stamped/stamped-media.module.css`,
  `stamped/stamped-memory.module.css`, and
  `stamped/stamped-mobile-polish.module.css`.
- Unused declared packages: `@react-three/drei`, `@react-three/fiber`,
  `mammoth`, and `xlsx`; remove through package/lockfile validation, not by
  deleting installed folders.

High-confidence dead **files/assets count: 24** (16 assets + 8 CSS files).

### PROBABLY OBSOLETE — VERIFY

- `/api/journey-routes`: no repository caller; may be an old content-engine API
  or an external consumer.
- `/api/journey-plan`: no repository caller; may be retained for planner-shadow
  tooling or an external harness.
- `route-card-triptych.png`: CSS reference remains but appears superseded by
  live route photos.
- The focused `/journey/plan` presentation and embedded static
  `march2027Journey`/`journeyCalendar` model: still routed and used by Map code,
  so verify product/development use before retirement.

### KEEP — LEGACY COMPATIBILITY

- `/journey/prep` and `/journey/[tripId]/prep` are tiny server redirects to
  Dashboard/Overview. They preserve old links and add no client bundle.
- Historical `workspace_view: "prep"` remains accepted only for analytics
  normalisation.
- `trip-preparation.tsx`, `use-trip-prep-readiness.ts`, and `trip-prep.ts` now
  power Overview; their names are legacy but their code is current.

### KEEP — DYNAMIC/ROUTE REFERENCE

- Webhooks, inbound email, health, auth catch-all, internal smoke/sandbox, gift,
  and admin APIs may be called externally or operationally.
- MapLibre worker/shared files are runtime dependencies; the worker sets
  `/maplibre/maplibre-gl-worker.mjs` and imports the shared module.
- Next.js route files and dynamic route-detail Map imports are live even where
  static import counting cannot prove an inbound reference.

## Concrete duplicate ownership

- **Trip cache/recovery:** TripShell owns canonical live trip/recovery state;
  shell Map copies the trip and owns a second recovery/persistence queue. This
  is the clearest second owner.
- **Day composition/editing:** `TripItineraryWorkspace` is the current daily
  editor, while `JourneyMapPlannerWorkspace` also carries `PlanWorkspace`, day
  reorder, activity/note editing, and a static legacy journey model. Spatial
  editing is valid, but the underlying mutation/persistence owner should
  converge after beta.
- **Accommodation UI:** both `JourneyItineraryAccommodation` (Map) and
  `DestinationAccommodationModule` (Itinerary) present stay actions. They do
  share canonical `lib/easyt/accommodation.ts`, so this is presentation
  duplication rather than a second data model.
- **Affiliate action rendering:** `MorroviaAffiliateLink` plus
  `affiliate-click.ts` is canonical, but `JourneyItineraryAccommodation` and
  `JourneyLocalFinder` hand-roll anchors, disclosure, and analytics. Converge
  those call sites in P2; do not change partner semantics.
- **Readiness:** Overview categories, trip-prep tasks, and Dashboard summary are
  distinct projections over shared accommodation/trip facts. No second
  readiness source of truth was proven.
- **UI controls/tokens:** Map contains unique raw controls, but no second shared
  button/input package was found. Treat visual convergence separately.

## Local runtime observations

The browser runtime did not expose a reliable Performance API, consistent with
the prior hardening audit, so no Lighthouse or Web Vitals claim is made. A
production server on localhost produced these relative wall-clock observations:

| Path/state | Local observation |
| --- | ---: |
| Homepage navigation/rendered heading | 309 ms on the first measured visit |
| Map (`/journey/plan`) to MapLibre canvas | 531 ms after navigation |
| Builder (`/journey/new`) to initial textarea | 97 ms on the warm local run |

Dashboard redirected to sign-in in the available browser, so authenticated
Overview/Map/Itinerary transition timings could not be measured honestly.
Bundle manifests and current Storybook states were used for those comparisons.
The numbers above are localhost diagnostic evidence only; cache order and
machine speed make them unsuitable as user-facing budgets.

## Recommended sequence

1. Lazy-load PostHog after consent and verify event delivery.
2. Introduce one shared lazy `JourneyPlannerMap` preview boundary; apply it to
   Overview and Itinerary, then lazy-load Builder's built Itinerary state.
3. Narrow the public navigation's dependency on `storage.ts`.
4. Convert the three current CSS-background PNGs to WebP/AVIF fallbacks.
5. Gate Overview readiness on profile hydration and defer eager provider image/
   discovery requests.
6. Remove the 24 high-confidence files/assets and four unused packages in a
   separate, reviewable cleanup.
7. After beta, converge Map's shell state/persistence and legacy focused model.

## Final audit answers

1. **Too slow for private beta? NO.** No blocking runtime defect was reproduced.
2. **Top measured causes:** map/atlas inheritance (~0.5 MB gzip), eager PostHog
   (82.6 kB gzip), and the public shell's broad storage/planning chunk
   (76.7 kB gzip). The homepage's ~5.4 MB raw CSS artwork is the largest
   non-JS transfer concern.
3. **Safest high-impact improvements:** lazy map previews/Builder Itinerary,
   consent-gated dynamic PostHog, and CSS artwork conversion.
4. **Effort:** 1–2 days, 0.5–1 day, and 0.5 day respectively.
5. **High-confidence dead files/assets:** 24, plus four unused package
   declarations.
6. **Do not touch before beta:** Map provider choice, core persistence/recovery
   semantics, wholesale client/server boundaries, provider behavior, legacy
   redirects, or externally callable routes without traffic evidence.

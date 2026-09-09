# Routes final visual refinement — local staging

**Status: implementation and review complete.** The founder manually verified the Routes page in Chrome with DevTools → Rendering → `prefers-reduced-motion: reduce`. No automated reduced-motion capture is claimed.

Review the running product at http://127.0.0.1:3011/journey/discover. No push, deployment or main-branch change is part of this task.

## What changed

1. **Hero motion:** the approved mixed-type heading and photo collage remain. A short scroll span moves the photographs independently by at most 14px and settles their rotation by at most 1.2°. One queued animation frame updates CSS variables; the observer removes the scroll listener when the hero leaves view. No animation dependency, sticky sequence or scroll-driven React rendering was added.
2. **Photography:** neutral, local bottom scrims replace the indigo wash. The editorial photograph and rail thumbnails have no tint. The original licensed files and crops remain canonical.
3. **Attribution:** a small camera disclosure replaces the blue credit chips. Its 44px target supports keyboard and touch. Expanding reveals the exact author/licence credit, original source link and licence link. The full credits inventory remains linked.
4. **Editorial feature:** one fixed route, respecting the existing published/featured ordering, creates a text-led chapter between the controls and Gallery. It uses canonical `bestFor` copy, complete route sequence, duration, stop/country counts, character, one photograph and an Explore link. It disappears for filtered results and Map so discovery stays direct. It does not change with selection or trigger scrolling.
5. **Gallery:** the two asymmetric lead cards and compact subsequent rows remain. Natural photography and quieter attribution are the presentation changes.
6. **Map-card parity:** Gallery and Map both render `RouteItem`. Map retains the same photograph, complete sequence, title, countries, duration, stop count, character, provenance and direct detail link. Selected cards have an accent edge and pressed state.
7. **Canonical Map:** `morrovia-map-presentation.ts` now owns the existing Trip Map basemap and route paints. Its CSS module owns stop markers, zoom controls and attribution typography. Both actual production surfaces import these owners.
8. **Shared owners:** reused EasyT controls, segmented controls, feedback/loading owners, `ResilientImage`, `DiscoveryPhoto`, `RouteItem`, canonical detail and Start handoff. Added only the extracted Map presentation owner and two semantic presentation tokens. Storybook adds Map mobile, multi-country and unavailable-image specimens. The design-system map documents ownership and narrow geographic/style-API exceptions.
9. **Duplication:** the below-map route-summary block is removed. The toolbar retains Open route; every rail card retains Explore route. Gallery lead cards intentionally repeat routes also represented in the editorial feature because these sections serve explanation and comparison respectively.
10. **Responsive:** measured at 1920, 1440, 1024, 768, 430, 390 and 320 CSS pixels. Wide layouts give the canvas the majority of the available width. At tablet/mobile, the map precedes image-led cards. All 21 route identities remain available. A small arrow overflow and resize refit issue found in QA were corrected.
11. **Image performance:** no new photographs, providers or animation dependencies. Existing responsive image variants, image dimensions, lazy loading and the single priority hero remain. Map and route preview remain dynamically imported. The editorial image reuses the canonical cached image source.
12. **Reduced motion:** CSS immediately shows the composed collage; the effect schedules no scroll animation when the preference is active and responds to preference changes. Manual Chrome verification with `prefers-reduced-motion: reduce` confirmed that the settled hero rendered correctly, animated drift and rotation were suppressed, and Gallery and Map remained usable without disappearing or jumping content.
13. **Validation:** see the final validation record below and `route-identity.json` / `responsive.json`. Gallery–Map DOM comparison matches all 21 routes exactly, including image source and canonical link. Nine requested routes selected correctly with their complete ordered stop markers. Search plus multi-country returned the expected Italy–Greece route; reset, credit keyboard toggling, preview Escape, direct Detail and the existing Portugal Builder handoff were exercised.
14. **Git:** local `staging`, base `eea4381660e61c3e9de3f93464108f1da61dd70a`. Changes are uncommitted. Pre-existing Builder/layout/test and Storybook catalogue changes were preserved. The generated Storybook inventory reflects the current working tree; no user changes were reset.
15. **Release safety:** nothing pushed or deployed; main unchanged.

## Important provider finding

Chrome revealed an unauthenticated CARTO watermark that was not clear in the initial in-app capture. [CARTO now requires a Basemaps key](https://carto.com/basemaps/apikey/). The shared owner now keeps its bundled Natural Earth layer readable at all zoom levels when `NEXT_PUBLIC_CARTO_BASEMAP_KEY` is absent. This avoids watermarked tiles and remote requests. Detailed street tiles require the optional browser-safe Basemaps key and a rebuild; no account credential or new provider was introduced. The key has not been requested and no provider terms have been accepted on the user's behalf.

## Product distinction

- **Homepage:** introduces Morrovia and captures a traveller’s own trip idea.
- **Routes:** offers an editorial atlas of possible journeys, with a short explanatory spread and equivalent Gallery/Map discovery.
- **Route Detail:** tells the full, immersive story of one journey and leads into its canonical Start flow.

Explicit review answers: **yes** — Routes remains distinct from Homepage and Route Detail; photographs retain their natural colour; attribution is truthful and secondary; Gallery/Map preserve route identity; both Maps share actual production presentation; the bounded, text-led editorial chapter adds rhythm without becoming a second hero. Detailed basemap availability has the provider limitation described above.

## Evidence

The `before-*` files and `detail-reference.png` are the user-supplied screenshots. Final Chrome captures show the changed product without retouching. `route-identity.json` contains the exact 21-route comparison and nine selected-route stop sequences. `responsive.json` records measured CSS widths.

## Final validation record

| Check | Result |
| --- | --- |
| Public-route aggregate | 38/38 passed |
| Discovery, Detail, imagery, relevant Map and credential-fallback checks | 55/55 passed |
| UI convergence tests | 10/10 passed |
| Typecheck | Passed after the final production build |
| Production build (including lint/type validation) | Passed |
| UI audit | Passed; baseline reduced, no increased accepted debt |
| Storybook production build | Passed |
| git diff --check | Passed |
| All seven widths, Gallery and Map | No page overflow or clipped cards; selected markers stay inside the map |
| Production console / hydration | No observed application errors; Chrome emitted unrelated MetaMask extension messages |
| Reduced-motion behavior | Passed by manual Chrome verification with `prefers-reduced-motion: reduce`; settled hero rendered correctly, drift and rotation were suppressed, and Gallery and Map remained usable. No automated capture was made. |

## Review images

- [Before hero](before-hero.png) → [1440 hero](hero-1440.png) / [1920 hero](hero-1920.png) / [390 hero](hero-390.png)
- [Short hero settling state](hero-settling-1440.png)
- [Editorial spread and Gallery](gallery-full-1440.png)
- [Before Gallery](before-gallery.png) → [1920 Gallery](gallery-full-1920.png) / [390 Gallery](gallery-full-390.png)
- [Before Map rail and basemap](before-map.png) → [Selected Portugal map](map-1440.png) / [1920 Map](map-1920.png) / [390 Map](map-full-390.png)
- [Expanded truthful credits](credits-1440.png)
- [Canonical Trip Map using the shared owner](canonical-trip-map-1440.png)
- [Unchanged Route Detail reference supplied by the user](detail-reference.png)

The all-route identity comparison provides Gallery/Map equivalence for the same canonical route. Reduced-motion behavior was verified manually in Chrome; no automated reduced-motion screenshot is included.

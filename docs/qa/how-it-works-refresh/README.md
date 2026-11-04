# How it works refresh

Review branch: `codex/how-it-works-refresh`.
Base: GitHub main `d38cf48` (Merge qualified staging interactions and accessibility updates).
No deployment, push, real trip edits, Figma edits or route catalogue edits.

## Result

The five-step tour now explains both current entry modes, reviewing nights and
estimated transfers, Overview's next steps and practical prep, finding places on
Map, and shaping days with partner-site booking handoffs. English and Spanish
copy are updated. Examples are labelled; no live availability or automatic
booking is claimed. All ten desktop/mobile images are new captures of the
existing production components. Media uses contain rather than cutting controls
off. Progress is visible, changed copy is announced, and compact media keeps
mobile actions accessible. The short-desktop dialog retains its viewport limit.

## Visual sources

Captured locally from current Storybook, using the existing synthetic Peru
fixture (Cusco, Sacred Valley, Arequipa), not any user's trip:

- Start: `morrovia-05-product-patterns-homepage-trip-starter--first-visit`.
- Route review: `morrovia-05-product-patterns-builder-review--tour-capture`.
- Overview: `morrovia-05-product-patterns-trip-workspace-overview--tour-capture`.
- Map: `morrovia-05-product-patterns-trip-workspace-map--tour-capture`, Cusco selected.
- Itinerary: `morrovia-05-product-patterns-trip-workspace-itinerary--tour-capture`, Day 2 selected.

Assets live in `public/journey/product-shots/tour/current`. They are screenshots
of Morrovia's current UI, reusing its already-shipped fixture photography rather
than obtaining new third-party images. The Map captures preserve visible
OpenFreeMap, OpenMapTiles and OpenStreetMap attribution. Mobile itinerary is a
faithful crop of the populated day, not a composite or generated screenshot.
English screen captures are explicitly labelled in the Spanish tour.

## Reuse and stories

Reused `EasyTProductTour`, its portal/focus handling, existing action buttons,
tour media presentation, Morrovia colour/typography/focus tokens, and current
product capture stories. No new shared component or token. Added trigger and
Spanish specimens to the existing dialog catalogue. Map capture now uses the
current TripShell workspace instead of the obsolete focused planner. The UI
baseline is reduced by one raw colour after replacing the focus colour with its
token; generated Storybook inventory is refreshed.

## Verification

- Tour tests: 6/6 pass (`tour-tests.txt`).
- UI convergence: 7 enforcement and 4 UI tests pass (`ui-tests.txt`).
- Strict UI audit passes (`ui-audit.txt`).
- Storybook production build passes (`storybook-build.txt`).
- Complete TypeScript check passes with Playwright resolved to the exact
  package.json version 1.62.1 installed under `/tmp/morrovia-tour-tools`.
  The borrowed preinstalled node_modules lacks Playwright, so unmodified
  `npm run typecheck` reports missing-module/implicit-any errors in existing
  browser tests (`typecheck.txt`). The verification config inherits
  `tsconfig.typecheck.json`, adds the Playwright path and excludes generated
  `storybook-static`; it does not exclude tests. No package/lockfile changed.
- Browser: all five steps at actual CSS widths 320, 390, 430, 768 and 1440;
  25/25 loaded images and no dialog horizontal overflow (`responsive-checks.json`).
- All five Spanish steps checked at 320; first/final captures included.
- Keyboard: initial Close focus, Shift+Tab/Tab wrapping, Escape and restored
  trigger focus pass (`keyboard-checks.json`).
- Short desktop: actual 1440×500, dialog stays between y=20 and y=480;
  Close stays visible at y=39.5–83.5 (`short-desktop.json`).
- Reduced motion: existing preference override retained; static screenshots,
  no autoplay, automatic step changes or new animation.
- Independent review found the short-window override and stale Spanish alt;
  both corrected and evidence refreshed. No remaining critical finding.

## Existing failures and limits

The combined copy/navigation/tour run is 12/14. These same two failures reproduce
on unchanged d38cf48 (6/8 in `baseline-tests.txt`):

1. `Morrovia-controlled product copy does not introduce em dashes`: existing
   punctuation across unrelated surfaces.
2. `dashboard offers the map as contextual preview rather than a workspace tab`:
   existing dashboard source assertion.

These changes are reviewable, not release approval. No hosted release gate,
physical touch device or screen-reader session was run. The unchanged wider
failures remain outside this modal task. Spanish copy is translated; its product
screens remain the labelled English examples. Existing photography's licensing
has not been newly audited by this change.

Preview while the local server is running:
`http://localhost:6017/?path=/story/morrovia-04-structure-dialogs-overlays-and-navigation--product-tour-trigger`

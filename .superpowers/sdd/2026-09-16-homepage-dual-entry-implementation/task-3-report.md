# Task 3 report: compact route inspiration and How it works

## Result

Implemented the reviewable Task 3 components without activating them on the production root. `HomepageRouteInspiration` renders the canonical eligible `ImmersiveRoute[]` in order as ordinary Route Detail links, with canonical title, day range and complete stop count. It reuses responsive reviewed route photos, `ResilientImage`, the shared fallback treatment and sibling `MorroviaPhotoCredit` disclosures. Focus, hover and link browsing do not own or change a homepage route index.

`HomepageHowItWorks` renders the three approved EN/ES steps and uses `EasyTButton` to dispatch the existing `PRODUCT_TOUR_OPEN_EVENT`. The existing tour remains the only dialog owner and returns focus to this activating trigger after Escape.

Storybook covers seven, fewer and zero routes, 320px layout, the route-selection boundary, and tour focus restoration. Rendered evidence is under ignored `output/homepage-dual-entry/task-3/`.

## Test-first evidence

- RED: `node --experimental-strip-types --test tests/homepage-inspiration.test.ts tests/homepage-routes.test.ts` — five new checks failed because the Task 3 components, stories and CSS did not exist; the three existing homepage-route tests passed.
- GREEN: the same focused command — 8/8 passed.
- `npm run test:public-routes` — 39/39 passed.
- `npm run test:published-route-images` plus photo-credit and immersive-route-discovery suites — 40/40 passed.
- `npm run typecheck` — passed.
- `npm run build-storybook` — passed.
- `npm run audit:ui` — reported two pre-existing Phase A branch deltas in Task 2 files (`home-trip-starter.stories.tsx` native control and `home-destination-editor.module.css` circular radius); Task 3 introduced no reported audit delta.
- `tests/storybook-visual-system.test.ts` retained the known baseline Transport taxonomy failure; `tests/homepage-canonical-route.test.ts` passed 4/4.
- `git diff --check` — passed before commit.

Browser verification used the built Storybook at `localhost:6010` with headless Chrome. Seven/fewer/zero route stories had 7/3/0 canonical links, complete metadata and matching sibling credits; all had zero horizontal overflow. At 320px, all seven cards rendered in one readable column with a measured 288px card width and zero overflow. Focus and hover preserved the selected-story key. The existing tour opened, closed on Escape and restored focus to the How it works trigger.

## Files

- `app/journey/home/immersive/homepage-route-inspiration.tsx`
- `app/journey/home/immersive/homepage-how-it-works.tsx`
- `app/journey/home/immersive/homepage-inspiration.stories.tsx`
- `app/journey/home/immersive/immersive.module.css`
- `tests/homepage-inspiration.test.ts`

## Commit

Implementation: `5e418d7e6bddc9913ad6cc9e4c3cc304c0b32be5` (`feat: add compact homepage inspiration and tour steps`).

## Limitations

Task 3 intentionally does not compose these components into `ImmersiveHome`, remove the existing large route introduction, or change production root behavior; that belongs to Task 4. No route handoff, builder, primary checkout, remote, deployment or infrastructure files changed.

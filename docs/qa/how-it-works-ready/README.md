# How it works — staging-ready candidate

Date: 5 November 2026. Branch: `codex/how-it-works-ready`.
Implementation revision: `957e7c36b78847c09752b55cd59da0f35ffec57a`.
Staging base: `64adb5eb3de905604ba2ff73dddb0b7aee653bb1`, independently rechecked against GitHub after implementation.

Nothing deployed or pushed. Production and active staging are unchanged. Staging requires Shaun’s approval. This report supersedes the earlier QA evidence, now archived outside the candidate tree in `../how-it-works-historical-qa`. The older hosted draft is obsolete and has not been updated.

## Result and reuse

Five concise English and Spanish steps explain the actual two planning entry modes, reviewing stop order/nights/estimated transfers, Overview and practical prep, exploring the Map, and editing itinerary days with partner-site booking handoffs. Examples are labelled; Spanish explicitly identifies English product captures.

Reused the existing `EasyTProductTour` dialog, portal, keyboard handling, focus restoration, action styles, semantic typography/colour/focus tokens and responsive media. Images contain the full relevant product controls. Visible step count and polite copy announcements remain. No new shared component, token, autoplay or animation; existing reduced-motion behaviour remains. The short-window viewport limit is preserved.

Capture stories use current production components. Map uses TripShell with caching disabled for fixture isolation; story navigation now matches the fixture. Route review is the current builder route-allocation story. The route uses concrete, canonical overnight bases Cusco → Ollantaytambo → Arequipa, origin Lima, verified coordinates and future dates in August 2027. Fictional data only; no real traveller data or account mutation. Figma and route catalogue implementations were not edited.

## Fresh visuals and rights

All ten desktop/mobile images were recaptured against the staging base. No placeholders or generated screenshots. Three suitable photographs replace the unverified inherited fixture photograph:

- Cusco — [Azzedine Rouichi](https://unsplash.com/photos/a-view-of-a-city-from-a-high-point-of-view-g9U5KGu_m3Q).
- Sacred Valley — [Paul Daly](https://unsplash.com/photos/rocky-mountains-hQljmSHzn4E).
- Arequipa — [Mayur Arvind](https://unsplash.com/photos/a-panoramic-view-of-a-city-with-a-mountain-in-the-background-hpc4DFyjY40).

Each original provider page identifies the free [Unsplash License](https://unsplash.com/license). Source URLs, licence URL, author, verification date, alterations and SHA256 values are in `public/journey/product-shots/tour/source/manifest.json`. Captures and corresponding source stories/hashes are recorded in `current/manifest.json`. A visible Image credits link opens the local public credits page, including map/provider attribution. Map captures preserve attribution controls; expanded attribution is visible in the Map examples.

Overview and Map use only the three verified photographs. Entry and route review contain no photographs. The itinerary capture deliberately shows actual planning controls without photography, avoiding current canonical-photo derivatives with separate attribution obligations. This focused crop is the only visual limitation; all text/actions are real production UI.

## Local review

Built Storybook: http://localhost:6020/?path=/story/morrovia-04-structure-dialogs-overlays-and-navigation--product-tour-trigger

Direct open modal: http://localhost:6020/iframe.html?id=morrovia-04-structure-dialogs-overlays-and-navigation--product-tour-dialog&viewMode=story

The loopback server must be running. Restart with `python3 -m http.server 6020 --bind 127.0.0.1 --directory storybook-static`. This is a local static build, not staging.

Desktop proof: `review-desktop.jpg`. Responsive proof: `modal-<width>-<step>.jpg`. Spanish proof: `spanish-320-<step>.jpg`.

## Verification

- Focused tour/provenance tests: 7/7 pass (`tour-tests.txt`). Hash guards prevent silently replacing reviewed source photos or captures.
- Storybook production build passes (`storybook-build.txt`). The local cache was isolated from the original repository. No package or lockfile changes.
- Browser: all five steps at actual CSS widths 320, 390, 430, 768 and 1440, 25/25 loaded images, no dialog horizontal overflow (`responsive.json`).
- Spanish: all five steps at 320, loaded images and no overflow (`spanish.json`).
- Keyboard: Close initial focus, Shift+Tab to Skip, Tab wraps to Close, Escape closes and restores trigger focus (`keyboard.json`). Credits is included in the normal focus order.
- Short desktop: 1440×500; dialog y20–480, Close y39.55–83.54 (`short-desktop.json`, screenshot).
- Local credits page verified in the built preview.
- Independent source/licence and final visual review approved; no remaining critical/important findings (`review.txt`). The review caught scroll/crop framing and mobile map-camera issues; all corrected and re-reviewed.

Full release gate status is recorded below after completion. The first attempt used an abbreviated COMMIT_REF; production compilation passed but offline provenance correctly rejected the shortened identity. It is retained in `release-gate-short-ref.txt`; the rerun uses the full implementation SHA.

## Limits and approval

No physical touch-device or screen-reader session, authenticated hosted flow or hosted release verification was performed. These local checks do not approve a staging or production deployment. Ask Shaun before staging. There is no outstanding photo-rights blocker for the refreshed captures.

## Final gate result

Full `release:gate` exits 0 at implementation SHA `957e7c36b78847c09752b55cd59da0f35ffec57a`: strict UI audit, UI convergence, runtime health, two clean typechecks, prompt engine, planner shadow, builder gate, itinerary focus and production build all pass. 642 tests pass, 24 are skipped by the existing suite, zero failures. Client-reference check verifies 15 boundaries, zero failures; offline manifest reports the exact 40-character implementation identity and 228 assets. See `release-gate.txt` and `release-result.json`. Generated Next environment and offline-manifest working changes were restored after verification. `git diff --check` passes.

# Batch15 systemic photo correction — implementation report

Status: scoped local implementation complete and focused tests green. Source is on the original `codex/batch15-review-corrections` branch from frozen base `22b3c0f036e1dd2ee3c715d709c183635c020298`. Aggregate qualification, captured-pixel replay and independent review are controller-owned and pending this source commit. No deployment or upstream photo-provider qualification is claimed.

## Decisions and behavior

- Shared `scorePublishedRouteImageCandidate` now exposes `eligible`, `coverScore`, and `suitabilityConcerns`. Existing geography/independent caption constraints remain hard checks. Photo rights are explicitly required. The numeric identity score remains a metadata eligibility score; it is not a probability of editorial/visual quality. Verified pixel exclusions are suitability decisions rather than false geography failures.
- Both Commons and contextual Unsplash use the shared deterministic chooser. Commons retains at most the existing two queries / 12 hits per query, and stops early when two distinct suitable assets exist. A second query can promote a better scene or supply a distinct alternate. Chooser deduplicates normalized provider file identities before selection. Unsplash keeps its existing one query / eight hits. Stable ID and source URL tie breakers avoid response ordering differences. No speed budget, timeout, or paid-service change.
- Settlement civic scenes (skyline, architecture, public landmarks, streets) rank ahead of general wider scenery. A caption identifying only sunset/water/sky without explicit civic or wider-place scenery fails suitability. Explicit waterfront, harbour, coast, beach and panorama controls remain eligible, including night, distant boats and normal street traffic. Source filename words do not override an independently suitable caption. Gateways require airport/terminal/runway/airfield/aerial subject evidence after removing the exact canonical name; the follow-up query uses airport semantics.
- Explicit archival capture metadata (provider capture date or a caption explicitly saying photographed/captured/taken in an 18xx/19xx year, or archival photograph wording) demotes ranking only. It is not a hard pre-2000 cutoff. Upload dates are ignored; ordinary historic architecture remains viable. No dimension threshold, blur, watermark, exposure or useful scene-diversity classifier is asserted.
- Commons suitability failures advance to configured Unsplash, then existing labelled country imagery, validated flag and neutral empty UI. Provider presence/attempt/status/counts and scored rejection reasons are exposed without keys. A successful Unsplash result keeps a preceding Commons outage visible. A Commons second-query failure/timeout retains its already qualified first-pool asset while reporting `unavailable`; no fake completed no-result. Country fallback preserves the destination-provider diagnostics. Referral/download behavior remains owned by the original route.
- `referencePhotoPlaceContext` accepts only canonical normalized labels, aliases attached to the same pinned record, source airport codes, and the one reviewed Gatwick supplement. It still requires an active exact reference ID, country and saved coordinate tuple. It returns derived canonical name/type/admin context, used for Commons/Unsplash search without rewriting traveller labels, IDs, points, dates or edits. Cebu uses pinned GeoNames1717512 alias `Cebu`; no catalogue-point shortcut.
- One new 813-byte source evidence supplement, `lib/easyt/place-photo-aliases.server.ts`, binds `Gatwick` to OurAirports2429 / GB / transport_gateway / [-0.185739,51.148744] / LGW / EGKK / London Gatwick Airport. SHA256 `444808893629e691bd1a78e0aea978ecea40e01efe03f8b8fd66d1e039fdbb4d`. Budget: one record, one named alias. Runtime checks every bound field against the integrity-checked snapshot before accepting it. This is no equivalence crosswalk, name stripping, municipality inference or arbitrary alias admission. All installed reference snapshot files are unchanged.
- Cache policy advances from v7 to v8. Old positive selections are re-evaluated while trip storage, first-destination cover ownership, distinct-photo allocation and failed-image retry budgets retain their existing owners. Optional factual width/height/description/captureDate survive safe parsing.
- The featured dashboard photo/fallback, country label and loaded-image credit share `cardMediaFrame` composed with the height-only `currentPhotoFrame`. Identity is its sibling. Existing image height242px at <=520,220px at <=340 and desktop overlay are retained. The shared `MorroviaPhotoCredit`, 44px target, focus/dialog ownership, loaded-image gate and country flag treatment remain reusable owners. No new shared component, UI tokens or destination rendering workaround. Existing long-title, unavailable-media, normal/mobile and cover fallback Storybook cases are reused; no story changes needed.

## Recorded pixel provenance

The six exact source assets below are rejected by the approved frozen nine-image review, not by invented automated visual-quality proof. Original report: `/Users/shaun/Documents/Codex/2026-10-10/task-4/Batch15-fresh-photo-review-22b3c0f.md`. Original files live under `/Users/shaun/Documents/Codex/2026-10-10/task-4/batch15-fresh-photos-22b3c0f/`; original source/author/licence metadata is in its provider, canonical-label and dashboard-primary result files. Frozen files and evidence packages remain intact.

| Pixel file | SHA256 | Bound Commons source |
|---|---|---|
| `photo-0.img` | `73fe85dcf8a0df385beb20397e6c8b91ae2cecee6ebe00282e595f81b678e70a` | https://commons.wikimedia.org/wiki/File:Sunset,_Manila,_Philippines.jpg |
| `photo-1.img` | `6c40c55e0c597437b93486f99f172d91c730e790e01e6b5b7c70b65d4fa16caa` | https://commons.wikimedia.org/wiki/File:Coron_Palawan,_Philippines_06.jpg |
| `canonical-photo-0.img` | `dfe68b44bf7bdd17131e86ee40b96dd60e7e2119ab31cb0a75c7b0f1c9ab3389` | https://commons.wikimedia.org/wiki/File:Philippines-1981-39_hg.jpg |
| `primary-photo-1.img` | `8b52302cef586fa7fdaa867f7c62a3e33672eabb7e74b3ae6c327aeaf0519d0c` | https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_from_Mount_Lycabettus_(5987127852).jpg |
| `primary-photo-2.img` | `5091a0a7dadfb1bc28435b82a8c8981631f5ca628e30fdbd3b69018319e7c1cf` | https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_from_Mount_Lycabettus_(5986569199).jpg |
| `primary-photo-3.img` | `6fcf686de05b462cff9948bd50f6c689f55696752c22ceafa1083eebdeff14bf` | https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_view_from_Mount_Lycabettus_(5987127698).jpg |

Retain the frozen Milan skyline (`primary-photo-0.img`, SHA256 `a7767163a30fa073aff8ccb72b8db85d40c866f1b67405ecddd0254390935721`), Santa Cruz church (`primary-photo-4.img`, `01e3fd3260abbae91c1078a8a9169098cac749fde584c90bc762b8f8ec0e6826`) and explicitly country-labelled Cuyo fallback (`photo-2.img`, `a37b51817c82c0e4f019e410a769d8ba8cb140c53e033acd24b041f408f91d41`). No positive inventory or canonical identity binding was fabricated from the old name-only inventory. No inventories were rewritten.

Gatwick primary sources: https://www.gatwickairport.com/All_FAQs (operator question uses Gatwick and its answer London Gatwick; independently read during implementation), paired with https://ourairports.com/airports/EGKK/ (exact facility tuple verified by controller, documented in `batch15-systemic-photo-evidence/source-evidence.md`; this implementation's web fetch returned an internal tool error). Snapshot lookup tests confirm the exact tuple and codes. Review date2026-10-11.

## TDD and verification

Initial systemic red: 7/7 expected failures for missing separation/ranking/dedup/evidence, aliases, v7 retirement and photo-frame structure. Revised archival preference and exact pixel review regressions were observed failing before source changes. Provider diagnostics, later outage retention, gateway and rights checks, shared frame composition/editorial override constraints and visual exclusion semantics each have recorded red runs before their corresponding source changes. Initial outdated behavior tests were updated to the approved contract: one suitable Commons asset now permits a second query, the same source page is one asset despite multiple search hits, and persisted-empty cache tests use current v8. These are intentional behavior changes.

Final focused command:

```sh
node --experimental-strip-types --test tests/systemic-photo-selection.test.ts tests/journey-route-image-handler.test.ts tests/wikimedia-destination-photo.test.ts tests/route-photo-cache.test.ts tests/route-photo-api-cache.test.ts tests/batch15-photo-corrections.test.ts tests/batch15-photo-cache-lifecycle.test.ts tests/dashboard-cover-corrections.test.ts tests/photo-subject.test.ts tests/photo-credit-attribution.test.ts tests/photo-credit-presentation.test.ts tests/published-route-image-pipeline.test.ts tests/published-route-image-coverage.test.ts tests/route-editorial-imagery.test.ts tests/trip-overview-imagery.test.ts tests/journey-local-place-photo-lifecycle.test.ts tests/dashboard-ticket-281.test.ts tests/itinerary-presentation-images.test.ts
```

Result: **160 tests passed, zero failed,18files**. Includes14new systemic regressions and9actual-handler regressions; existing first-place/fresh/saved cover, async assignment, image-failure lifecycle, no-result/outage/cache and attribution controls also pass. `git diff --check` passed. Node emits the existing package `MODULE_TYPELESS_PACKAGE_JSON` warning; no package-wide module setting changed.

No default `npm test` script exists. Controller explicitly owns aggregate qualification, so typecheck/build/UI/Storybook, unchanged Core33 (original Africa2500ms) and Transport9 were not repeated by implementation. Browser use was not launched here; controller owns the explicit captured-pixel/links checks at390,519,520,521,1440. Tests and implementation logs are in `/Users/shaun/Documents/Codex/2026-10-10/task-4/batch15-systemic-photo-evidence/task1-batch15-*.log`; the bounded manifest is `task1-implementation-manifest.json`. Manifest records touched file hashes, test result, all six reviewed failures, retained control identities and alias budget.

## Changed files

- `app/api/journey-route-image/route.ts`
- `app/journey/dashboard/dashboard-client.tsx`
- `app/journey/dashboard/dashboard.module.css`
- `lib/easyt/photo-editorial-exclusions.ts`
- `lib/easyt/place-photo-aliases.server.ts`
- `lib/easyt/place-reference.server.ts`
- `lib/easyt/published-route-image-pipeline.ts`
- `lib/easyt/route-photo-cache.ts`
- `lib/easyt/wikimedia-destination-photo.server.ts`
- `tests/journey-route-image-handler.test.ts`
- `tests/route-photo-cache.test.ts`
- `tests/systemic-photo-selection.test.ts`
- `tests/wikimedia-destination-photo.test.ts`
- `.superpowers/sdd/batch15-photo-go/task-1-report.md` (this report).

## Remaining limits and handoff

- No fresh upstream photo-provider calls were made during implementation. Existing local Unsplash presence is absent; fixtures prove control flow only. Actual upstream Unsplash pixels/licences/provenance require the approved configured target; no credential setup/transfer was attempted.
- Metadata ranking cannot ensure sharpness, watermark absence, exposure, destination representativeness or composition diversity for unreviewed assets. Exact six captured failures are excluded; further assets may still fail editorial acceptance. The deterministic pool supplies asset diversity, not viewpoint diversity.
- Accepted frozen controls remain source-parseable and semantically eligible, but no unproved static canonical bindings were added. Existing inventory still supports only its verified legacy contexts.
- Controller must record captured-pixel before/after/credit results and complete aggregate qualification plus independent review before product acceptance. Hosted verification remains **MANUAL HOSTED VERIFICATION REQUIRED** under the separate final hosted gate.
- No provider credentials, provider additions, deployment, production pushes, source snapshot regeneration or frozen evidence modifications. Original untracked node_modules symlink and controller brief/task state remain untouched. Commit contains only the listed scoped source/tests/report paths.

## Round1 correction after controller qualification

Controller qualification at `e972d7ea878516a219e6a1152d57da5eefaf120b` found typecheck/build errors and one outdated exact-context expectation (219 focused tests,218pass/1fail). Independent review identified a real gateway-selection gap: Commons repeats the same caption in alt and description, so removing the canonical airport name once left a second airport keyword that could qualify an unrelated beach/landscape. Original controller logs are preserved as `typecheck-e972d7e.log`, `build-e972d7e.log`, and `focused-e972d7e.log` in the external evidence directory.

Corrections:

- Keep the asset-identity contract restricted to fields used by normalization while explicitly admitting the existing optional `sourceLabel` on literal callers. Scorer candidates without a label and legacy cache/dashboard callers now typecheck. No caller rewrites, broad index signatures, null widening, casts or suppression directives.
- In the three existing async cache test fixtures, convert nullable provider descriptions to `undefined`, matching the production adapter's cached-description contract. CachedRoutePhoto remains `description?: string`; provider descriptions remain nullable.
- Update the complete Shenzhen reference-context assertion to include verified derived `canonicalName: 'Shenzhen'` and `placeType: 'city'`. The pinned record was directly inspected; country, exact point, admin hierarchy, coordinate guard and requiresPhotoCoordinates checks remain asserted. No safeguards weakened.
- Remove every normalized canonical airport-name occurrence before gateway scenery checks, including duplicate alt/description/tag mentions. Added a failing regression using the actual live Commons shape: beach and coastal-panorama captions repeated in alt+description and canonical airport tags are rejected; a duplicated terminal-architecture caption succeeds. This changes the generic gateway predicate, with no destination-specific rendering exception.

TDD: the new live-shape gateway regression and old exact-context expectation were observed failing in `task1-batch15-round1-red.log` before source correction. After fixing the code and verifying the pinned fixture type, the focused command below passed96tests/8files, zero failures:

```sh
node --experimental-strip-types --test tests/systemic-photo-selection.test.ts tests/batch15-admin-context.test.ts tests/batch15-photo-corrections.test.ts tests/dashboard-cover-corrections.test.ts tests/journey-route-image-handler.test.ts tests/wikimedia-destination-photo.test.ts tests/route-photo-cache.test.ts tests/route-photo-api-cache.test.ts
npm run typecheck
git diff --check
```

Typecheck completed with exit0 (twice); final targeted tests and diff check passed. Logs are copied as `task1-batch15-round1-focused.log` and `task1-batch15-round1-typecheck.log`. Round1 fixes modify only `lib/easyt/route-photo-cache.ts`, `lib/easyt/published-route-image-pipeline.ts`, `tests/batch15-photo-corrections.test.ts`, `tests/batch15-admin-context.test.ts`, `tests/systemic-photo-selection.test.ts`, and this report. Controller-owned generated `next-env.d.ts` is deliberately unstaged and untouched by implementation.

Controller separately reports `pixel replay-e972d7e` PASS: captured actual Milan/Santa Cruz/labelled-country-Cuyo photos retained, six rejected captured covers fall back to flags, credit frames equal image bounds at390/519/520/521/1440,44px targets, and all three credit source/licence dialogs/links per width. This is captured-pixel replay of frozen assets, not new upstream-provider or hosted qualification. Controller owns remaining build/core/transport/aggregate checks and final independent review. Unsplash target validation and the visual-quality limitations listed above remain unchanged.

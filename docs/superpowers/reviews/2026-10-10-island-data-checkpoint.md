# Island data: local checkpoint and review fix receipt

2026-10-10. Scope: finish the already-started island task at a clean local checkpoint. No island push, deployment, new feature or subsequent qualification phase is authorized by this checkpoint. The user reports Fast is off; tools do not verify or control that setting.

## Behavior and scope

Covered Santorini, Crete, Tenerife and Gran Canaria use a bounded local physical-geography snapshot, preserving the existing exact settlement identity, coordinates and server verification before canonical edits. Canary group coverage is explicitly partial: Tenerife and Gran Canaria only. Uncovered islands retain the existing bounded live path. Political/maritime island identity geometry never substitutes for physical land. Existing trip order, requested nights, writer, owner/revision guards, autosave, durable ACK and recovery behavior remain authoritative.

The branch includes the independently qualified recovery base `13ef1f710481f955c6688ba67405671ab7098a81`, merged at `66110b7ac40834ac6e42298386b5ea111d0981f3`. Island changes must be assessed relative to 13ef, not the older 9dab staging base. Recovery staging qualification is unchanged; island staging readiness and MAIN/production remain HOLD.

## Independent review and the one local fix pass

The single fresh independent whole-branch source review is preserved verbatim in [the review](2026-10-10-island-data-independent-source-review.md). Its bound was HEAD 66110b7 plus 27 reviewed working-file hashes. It found four Important/P2 defects; no Minor findings. It did not review this later fix pass or qualify an exact release candidate. This receipt does not relabel that review as GO.

| Finding | Local correction | Failing-first proof |
| --- | --- | --- |
| Missing actual official Canary membership evidence | Retain actual official HTML, capture date, source URL, body/original-byte digests and exact member links; reject missing or contradictory evidence alongside the physical member proof. | `Canary state labels cannot establish membership without captured official supporting evidence` RED→GREEN. Contradictory member/group cases also pass. |
| Cross-component coastline topology escaped validation | Check all closed component segments jointly, retaining bounded work/deadline checks, then reject intersections, touches and nesting before selecting the unique component. | Separate closed-component crossing/touching/nested tests each RED→GREEN; both real Canary captures still pass. |
| Unchecked source digest claims | Validate every captured-body digest. Where original bytes exist, retain and validate their digest and parsed identity. Parsed-only legacy captures are labelled honestly without invented original-byte hashes. | `a retained original-byte digest cannot contradict the captured source response` RED→GREEN. |
| Duplicate physical identities/aliases could publish an ambiguous coverage index | Reject duplicate source identities and conflicting normalized alias/country/type keys before candidate publication. | `refresh rejects duplicate source identities and aliases under different internal keys before publishing` RED→GREEN, with no output created. |

Evidence files: `batch14-island-review-fixes-red.log`, `batch14-island-review-duplicate-red.log`, `batch14-island-review-fix-green.log`. The source-extracted provider-choice harness now supplies the production shared predicate; assertions remain intact. Its three initially introduced failures pass in the 19-test harness and final focused run.

## Actual final verification

- Focused five-file suite: **88/88 PASS**, no failures, cancellations or skips.
- Typecheck and `build:check`: PASS. Generated `next-env.d.ts` build-directory change restored before commit.
- UI audit and Storybook build: PASS. Reused existing `MorroviaPlaceDataCredit` and its existing visual pattern for OSM alongside GeoNames; no new shared primitives, styles, stories or visual exceptions.
- Final traced-asset audit: PASS, every payload and manifest included; browser graph includes only the **1,180-byte index**, with no server/source/geometry module.
- Final full suite: **4,080 tests: 3,611 pass, 111 fail, 358 skip, 0 cancelled**. It is **not green**. Every failing name also fails in the accepted immutable 13ef archive comparison; no introduced failing name remains. Raw baseline: 4,041 tests, 3,571 pass, 112 fail, 358 skip. Its extra country-identity failure was caused by the archive lacking `.git`; supplying read-only git objects made that three-test file pass. Raw logs remain unchanged. [Full comparison and failure names](2026-10-10-island-data-full-suite-comparison.json).
- Already-run local Transport mounted tests: **9/9 PASS**. The Core attempt targeted unavailable port3100 because the runner was given the wrong environment variable; preserve it as an invalid attempt, not a product result. Core verification of this candidate remains pending. No broad rerun was started to finish this checkpoint.
- `git diff --check`: required before checkpoint commit; final result recorded with the checkpoint evidence manifest.

Runtime snapshot **ce1f21a152ab** contains 4 islands, 1 partial group and 192 exact GeoNames bindings. Compressed payloads: **1,215,240 bytes**; inflated: **6,394,450**; deployed island assets/docs: **1,222,414**. Existing reference bytes remain **33,256,854**; combined declared runtime assets **34,479,268**. Incremental peak RSS **33,259,520 bytes**, cold all-covered load **652.03ms**, maximum warm batch **147.105ms**. All separate island budgets pass (2MiB deployed, 8MiB inflated, 128MiB incremental RSS, 2s cold, 500ms warm). The original reference budget was not raised.

Official membership was actually captured anonymously from `https://www.hellocanaryislands.com/` at **2026-10-10T13:30:50.626794+00:00**, HTTP200; 133,417 raw bytes, SHA256 `a1eb7b82612d60a4277c72e86f5e8cb7557ac477af3e6df82d38030b19649346`. It names and links both covered members. This dated bounded evidence does not claim worldwide coverage or perpetual provider freshness.

## Rulings and review exclusions

1. Canary membership uses exact captured Photon country/state plus actual official tourism membership evidence, rather than pretending the archipelago relation's way subset contains the full physical rings. Physical containment remains independently mandatory. Cost if wrong: group misclassification; evidence is pinned and validated.
2. Use separate explicit island budgets while keeping the accepted reference budget unchanged. Cost if wrong: host memory/deploy footprint; current measured budgets and traced assets pass.
3. Merge accepted recovery13ef into the saved island branch. Cost if wrong: unintended recovery delta; qualification remains bounded against13ef.
4. Pin the accepted manifest in the server build and return uncovered before opening bundled assets. Cost if wrong: a valid refresh requires a reviewed rebuild; that is intentional.
5. Reviewer's declined post-review fixes/new hashes/final release judgment: preserve the original HOLD and bind this author-run fix receipt to exact local files. Cost if wrong: treating local tests as independent release approval; no such approval is claimed.
6. Reviewer's declined hosted cloud/save/stale-response/CI/readiness judgment: leave these gates pending. Local verification cannot certify durable hosted saves. Cost if wrong: a source-correct change could fail integration; no publication occurs here.
7. Reviewer's declined source freshness/worldwide/unsupported-island/legal certification: the product gets dated captured evidence, explicit bounded partial coverage and the retained uncovered fallback, with existing license declarations. No fresh-worldwide or legal-certification claim. Cost if wrong: stale source or distribution obligations requiring separate assessment.
8. The skill's whole-suite-green finish condition is unmet because111 accepted-baseline failures persist. Finish only a local checkpoint, retaining release HOLD and the complete failing-name comparison; do not mark the implementation plan complete. Cost if wrong: name comparison can miss behavior differences; exact CI/hosted qualification remains necessary.
9. Preserve this plan's ignored workspace and ledger while hosted Task3 is unfinished instead of applying final-clean-review cleanup. Cost if wrong: leftover scratch files; preserving resumable evidence is appropriate for this expressly limited checkpoint.

Deferred minors: none reported.

## Remaining gates

**MANUAL HOSTED VERIFICATION REQUIRED.** Future authorized work must run correct-target Core/exact-candidate CI, verify actual staging deploy SHA, A11 normal Athens3/Chania7/Fira3 Build/save/reload, actual verification503/retry and stale response, cloud503/retry plus ACK/cloud/owned-cache/Overview/Itinerary parity; bounded Tenerife/Canary positive and negative journeys; non-island A12 integration; final release assessment. This checkpoint supplies no fresh all20 signoff. No staging/main/production promotion occurred for island work.

Full raw captures, review probes and logs remain in `/Users/shaun/Documents/Codex/2026-10-06/task-2/`. The external `batch14-island-checkpoint-evidence.json` binds exact files, supporting artifacts and the eventual local checkpoint commit.

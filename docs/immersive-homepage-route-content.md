> Historical audit, superseded by the [content-complete approval pack](immersive-four-route-editorial-approval.md). The earlier route gaps below describe the pre-completion state.

# Immersive homepage route-content decision — 2026-09-07

**Historical pre-publication review:** all four journeys were held at this point and no publication, push or deployment occurred. The three reported trust failures were stale endpoint assertions, corrected with stronger ordered-transfer and persistence checks. No route engine repair was necessary. This report superseded the unresolved trust classification in the homepage implementation report, but does not replace its visual acceptance work.

## 1. Starting state

Requested branch: `codex/immersive-homepage`. Starting SHA: `846f3f3e1ff20bd30dbe7ad0fa6120080056b582`. Clean checkout before work. The workspace initially pointed at `staging` (`b5f6cd8`); that branch was preserved. This task uses the requested six-commit feature candidate, not staging’s subsequent default-on change. Baseline: `a523c7558694af745844b1b7cd37a0ec89009762`.

## 2. Three trust failures

Exact suite: `node --experimental-strip-types --test tests/curated-route-trust.test.ts`. Repeated against the isolated baseline archive and unmodified feature branch: both 2 pass / 3 fail. Involved production owners and the test are identical between these commits.

| Test / fixture | Expected | Actual | First divergent layer | Pre-existing | Homepage impact | Classification / publication effect |
|---|---|---|---|---|---|---|
| `keeps curated evidence through handoff, save, and reload` / Japan | first leg source `canonical-endpoint-identity` | `curated-route` | Test assumes an origin→opening-stay leg after `buildCanonicalTripLegs` deduplicates the same place | Yes | Japan uses this path | Stale assertion; no corruption or publication blocker |
| Same / Andean Highlands | same | same | same | Yes | General shared path; not a target route | Stale assertion; no corruption |
| Same / Portugal Atlantic | same | same | same | Yes | General shared path; not a target route | Stale assertion; no corruption |

`trip-legs.ts:deduplicateAdjacentRouteEndpoints`, introduced before the baseline in `97114e0`, intentionally retains the opening stay’s stable ID and omits travel to the same place. The seed origin equals the first overnight base in all three fixtures. Thus Japan has Tokyo→Takayama→Kyoto, not Tokyo→Tokyo→Takayama→Kyoto. Owner normalization deliberately remaps stop IDs; this is not corruption either.

The corrected test verifies origin/first-place identity, every adjacent stop-ID pair, N−1 real movements, provenance on **every** transfer, fully-supported coverage, unchanged geographic/night/date facts after JSON reload, and correctly remapped saved leg references. Reorder/outside-route downgrade assertions are retained. All five now pass. No production expectation was weakened and no engine code changed.

## 3. Files changed

- `tests/curated-route-trust.test.ts`: correct stale arrival assumptions and strengthen ordered persistence assertions.
- `tests/immersive-route-content.test.ts`: eight content, handoff, hold, imagery and Paris rail/save controls.
- This report and `docs/immersive-route-imagery-audit.md`.
- `docs/immersive-homepage-implementation.md`: link to current route-content decision.
- `artifacts/immersive-route-content/`: baseline/current failure logs, release/payload audit JSON, HTTP results and validation logs.

No shared UI, Storybook, runtime configuration, canonical route data or persistence implementation changed.

## 4. Publication audit

Canonical facts: `lib/easyt/route-catalog.ts`; seeds: `inspiration.ts`; public projection/publication: `public-route.ts`; handoff: `public-route-handoff.ts`; release discipline: `public-route-release.ts` and `docs/public-route-editorial-release.md`. `publicRoutePublishedFamilies` is the existing legacy availability boundary. Passing that boundary does **not** mean a record passes the newer editorial release checker. None of the 18 legacy-public routes passes that checker; no gate was bypassed.

| Route | Current publication state | Canonical stops | Countries | Route data owner | Builder handoff | Nights evidence | Transfer evidence | Editorial provenance | Imagery/rights | Gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| Japan | Legacy public; release incomplete | Tokyo→Takayama→Kyoto | Japan | `route-catalog.ts:japan-slow` + explicit seed | Three-stop payload valid | Minimum 3/2/3; no reviewed recommendations; allocated 3/3/3 | Two legacy rail allowances, no linked connection sources | Review date 2026-08-08; owner/reviewer absent | Four licensed destination photos; Osaka missing; legacy hero rights unrecorded | Five-stop content, nights, provenance, review, hero |
| Balkans | Unpublished / needs-review | Dubrovnik→Kotor→Shkodër→Tirana | Croatia→Montenegro→Albania | `route-catalog.ts:balkans-overland`; derived seed | Four-stop draft structurally valid | Minimum 2/3/2/3; no reviewed recommendations; allocated 3/4/3/3 | Three allowances without source labels; first two needs-review | 2026-08-08; country context only; no owner/reviewer | Four attributed destination photos; no public hero | Reviewed pacing, sources/unknowns per leg, independent review, hero |
| Vietnam/Cambodia | Unpublished / needs-review | Hanoi→Hoi An→Ho Chi Minh City→Siem Reap | Vietnam→Cambodia | `route-catalog.ts:vietnam-cambodia`; derived seed | Four-stop draft structurally valid | Minimum 3/3/3/3; no reviewed recommendations; allocated 4/4/4/3 | Three flight allowances without linked evidence; final needs-review | 2026-08-08; destination/heritage context; no owner/reviewer | Four attributed destination photos; no public hero | Airport ground access, transfer evidence, pacing, review, hero |
| Iceland | Unpublished / needs-review | Reykjavík→Vík→Mývatn→Akureyri | Iceland | `route-catalog.ts:iceland-ring-road`; derived seed | Coordinates retained; three unresolved canonical IDs | Minimum 2/2/2/2; no reviewed recommendations; allocated 3/2/2/2 | No connections | 2026-08-09; Ring Road context only; no owner/reviewer | Four attributed destination photos; no public hero | Place resolution, seven-day minimum vs eight nights, long eastward leg, return west, review, hero |

Raw stop coordinates, sources, constraints, allocations, release blockers and payloads are in `artifacts/immersive-route-content/audit.json`.

## 5. Japan five-stop decision

**C — HOLD the five-stop proposal.** Prefer updating the existing family when the expanded route has completed editorial review; no evidence here justifies an additional near-duplicate family. Do not change the public three-stop family prematurely. The disabled immersive candidate displays the canonical three stops and never claims five.

All five names resolve to distinct production IDs: `tokyo`, `kanazawa`, `takayama`, `kyoto`, `osaka`, all Japan and directly routable. The approved sequence is geographically plausible. The existing knowledge store contains legacy Tokyo→Kanazawa and Kanazawa→Takayama allowances, but the latter explicitly mixes rail/bus and is not a timetable. These are not reviewed five-stop night guidance. Kanazawa and Osaka minimum/recommended nights, the full duration, added coordinate ownership and the four connections still need the release review. An end-to-end five-stop Builder claim is therefore **not** made.

For a reviewed expansion, use the existing family, seed, public editorial owner and curated knowledge pipeline together. Update the current Kyoto-ending summary/duration alongside the catalogue, retain existing stop IDs, add Kanazawa/Osaka IDs, and rerun coverage/order tests. Use “Rail likely · details to confirm” where service details remain unverified. Do not copy the prototype’s null nights into a supposedly reviewed route or infer recommendations from minimums.

## 6–8. Other route decisions

**Balkans — HOLD.** Sequence and country identities match the prototype. Border crossings are supported in principle, but country tourism pages do not establish the dated coaches or door-to-door allowances currently asserted. Record exact remaining leg unknowns, review minima/recommendations and owner/reviewer, and attach cleared hero rights before publication.

**Vietnam/Cambodia — HOLD.** The likely sequence in the brief exactly matches production. Hoi An requires ground access via Da Nang; a bare flight label is insufficient as a complete transfer explanation. The final international connection is unreviewed. Review current operators/airport access and actual allowances or explicitly retain uncertainty. Destination context is not evidence for all three durations.

**Iceland — HOLD.** Only Reykjavík currently resolves through `matchCatalogPlace`; Vík, Mývatn and Akureyri retain catalogue coordinates but have unresolved-place warnings in the draft. Mývatn’s region/base identity needs a deliberate decision. Four two-night minima require at least nine calendar days, contradicting the seven-day lower bound. The eastward Vík→Mývatn travel day and Akureyri→west completion are unreviewed. This task does not invent an intermediate base or return leg to force a Ring Road claim.

## 9. Source/provenance review

Research checked 2026-09-07 by this coding assistant; **not** recorded as an independent editorial sign-off or a refreshed route review date. Existing review dates remain unchanged. No reviewed-night source or named owner/reviewer was supplied.

| Source / owner | Supported coverage | What it does not establish |
|---|---|---|
| [Getting to Kanazawa](https://visitkanazawa.jp/en/getting-to-kanazawa), Kanazawa City Tourism Association | Tokyo rail access; Takayama rail via Toyama and bus options; connections toward Kyoto/Osaka | Four booked services, connection buffers, five-stop nights |
| [Takayama, Shirakawa-go and Kanazawa](https://www.japan.travel/en/au/guide/guide-takayama-shirakawa-go-kanazawa/), JNTO | Regional itinerary context and mixed transport choices | A new reviewed five-stop Morrovia itinerary |
| [Montenegro access](https://www.montenegro.travel/en/plan-your-stay-in-montenegro/how-can-you-journey-to-us/conditions-for-entering-montenegro), national tourism organisation | Road border crossings with Croatia and Albania | Passenger-specific entry eligibility, bus schedules or queue times |
| [Hoi An](https://vietnam.travel/places-to-go/central-vietnam/hoi-an), Viet Nam National Authority of Tourism | Hoi An destination context and Da Nang airport ground access | Current complete door-to-door durations or Cambodia flight availability |
| [Angkor](https://whc.unesco.org/en/list/668/), UNESCO | Heritage context | Night recommendations, flights, airport transfer times |
| [Ring Road](https://www.visiticeland.com/article/the-ring-road/), Business Iceland | National self-drive route context and road/weather references | Feasibility of the exact four-base proposal, nightly pacing or return completion |

The Hida access page could not be retrieved in this pass; it is not counted as verified evidence. A search surfaced an obsolete pandemic-era Vietnam entry page, which was not used. The catalogue label calling `tourismcambodia.com` “Official tourism context” is not independently established here and should be verified/replaced before release. Source reachability does not make every existing claim supported.

## 10. Images

See `immersive-route-imagery-audit.md` for all 16 destination records, 16 affiliate states, shared generated atmosphere and required hero gaps, with files, photographers, sources, licences and readiness. Local derivative existence passed. Existing attributed derivatives are usable subject to their recorded licences; no new legal approval is asserted.

The Osaka candidate’s [Commons record](https://commons.wikimedia.org/wiki/File:Osaka_Castle_03bs3200.jpg) confirms 663highland and a selectable CC BY 2.5 licence. This resolves the candidate source question, but there is no production derivative/attribution association yet. Japan’s legacy Route Detail hero remains uncleared; the other three have no canonical hero mapping. Generated atmosphere remains explicitly fictional and is not substituted for destination photography.

## 11. Route character/content

Existing `PublicRouteDetail.summary` and `interestLabel` remain the shared projection. No new homepage-only route facts or three competing descriptions were added. Proposed canonical character values for future release: Japan “Rail + pacing”; Balkans “Borders + ground connections”; Vietnam/Cambodia “Distance + mixed transfers”; Iceland “Driving + nightly pacing”. These describe planning concerns, not verified services. The five-stop Japan summary must replace the existing three-stop-specific summary when its route changes. No new published character is claimed while all four are held.

## 12. Builder handoffs

The real `routePlannerPayload(publicRouteDetailFor(key).planDraft)` pipeline was used with a fixed test date, not a parallel fixture generator. Japan 10 days / 9 nights; Balkans 14 / 13; Vietnam/Cambodia 16 / 15; Iceland 10 / 9. Names/order/countries/coordinates, unique stable stop IDs, start-at first stop, end-at last stop, no blocking parser fragments, and allocations matching the canonical detail all pass. No additional end stop was inserted. No real trip was persisted.

These are **structural draft** checks. Allocated nights come from the current algorithm, not reviewed recommendations; they do not satisfy editorial release. Iceland’s warnings remain. The approved five-stop Japan handoff is unavailable. Full interactive Builder completion for the held families is not asserted and publication validation was not bypassed.

## 13. Route Detail HTTP/render

Historical local optimized review server, `/journey/routes/<key>`:

- Japan: HTTP 200, real route identity and Builder CTA, no not-found marker; existing three-stop content only. Legacy hero rights remain a release gap.
- Balkans, Vietnam/Cambodia, Iceland: streamed HTTP 200 containing `NEXT_HTTP_ERROR_FALLBACK;404`, `noindex`, and no Builder CTA. These are **not-found pages**, not successful published details. The distinction is captured in `http-results.json`.

No visual redesign or new detail page was attempted. No four-route no-404 acceptance claim is made.

## 14. Catalogue

Public/discovery/SEO tests pass. Authoritative catalogue still contains the same 18 legacy eligible families; Japan is present, the other three are excluded from public discovery/sitemap/detail. All existing public families have three stops, so there is no existing four/five-stop replacement satisfying that preference. Homepage links continue through canonical slugs. No browse/search design changed.

## 15. Homepage integration

`immersiveRouteKeys` remains the four canonical IDs; route facts derive from public detail and catalogue. Actual admitted list remains Japan only. Existing tests cover deterministic server selection, four-item wraparound, demo reducer continuity across Map/Builder/Itinerary and affiliate mappings. These mechanism tests do not establish four real published route states or four-route browser hydration. Those checks remain pending publication; no fixture was admitted to make them appear green.

## 16–17. Holds and replacement

All four are HOLD under the release contract. Required reviewer and night guidance remain pending. A concrete next review must supply reviewed minima/recommendations and rationale for each stop, supported connection claims or explicit unknowns, an editorial owner and separate reviewer, and matching hero rights. Japan additionally needs the five-stop update; Iceland additionally needs resolved bases, duration consistency and a truthful completion decision.

**Replacement for Shaun’s consideration: `andean-highlands`**, if distinct geography is more valuable than retaining an unsupported Ring Road concept. Its altitude/road/flight complexity, existing public detail and curated handoff make it the strongest established alternative to the current Japan. It has only three stops and also lacks the newer release sign-off/hero rights fields, so it is **not a release-ready escape hatch**. No automatic replacement was made.

## 18–19. Validation

- Public-route aggregate: **36/36** (includes trust, release, detail, presentation, SEO, discovery, handoff and homepage routes).
- Focused homepage/content/endpoints/rail suite: **79/79**.
- Final content suite including added Paris→Brussels→Amsterdam rail/save control: **8/8** (seven overlap the 79; **116 unique tests** total).
- Paris exact order retains rail for both movements after owner normalization and JSON reload; Cancún opening stay/return, no same-place travel and saved itinerary regression controls passed.
- Typecheck, optimized `build:check`, UI audit and `git diff --check`: passed. The first typecheck exposed a new test union-narrowing error; corrected and rerun successfully.
- Shared persistence code unchanged, so guest/account expansion was not triggered. No shared UI changed; Storybook not rebuilt. No ESLint configuration added.

## 20. Configuration/migration

This historical content pass made no migration, dependency, environment or publication-control change. Its temporary homepage gating has since been removed. Staging branch was preserved and no push/deploy occurred during that pass.

## 21. Readiness

Not staging-ready. Technical trust classification is resolved, but editorial content, five-stop Japan, canonical imagery and actual four-route integration are incomplete. Keep the feature off until those records pass the existing release contract and the real four-route acceptance matrix.

IMMERSIVE HOMEPAGE ROUTE CONTENT NOT READY — KEEP FEATURE OFF

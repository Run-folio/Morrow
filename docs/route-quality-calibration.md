# Route quality calibration

Date: 2026-08-30

This document records the route-quality pass and the subsequent destination-aware night-allocation calibration. Both extend the existing deterministic owners; neither adds a second planner, destination lookup table, live transport data, or LLM authority. The only Builder UI change is canonical status feedback for a consequential manual-night rebalance.

## Outcome

| Measure | Before | After |
| --- | ---: | ---: |
| GOOD | 7 | 10 |
| ACCEPTABLE BUT SUBOPTIMAL | 12 | 10 |
| CLEARLY POOR | 1 | 0 |
| Calibration hard failures | 0 | 0 |
| Average selected transfer burden | 955 min | 962 min |
| Median selected transfer burden | 1,020 min | 1,020 min |
| Selected route orders changed from entered order | 6 | 5 |
| Defensible entered orders deliberately retained | 12 | 13 |
| Prompt-engine gauntlet | 210/224 | 210/224 |
| Accepted global-routing baseline | 0 hard failures | 0 hard failures |

Night allocation is measured separately from route order so a better stay split cannot conceal a routing regression:

| Night-allocation measure | v1 | v2 marginal allocation |
| --- | ---: | ---: |
| GOOD | 19 | 20 |
| ACCEPTABLE BUT SUBOPTIMAL | 1 | 0 |
| CLEARLY POOR | 0 | 0 |
| Route-order quality | 10 / 10 / 0 | 10 / 10 / 0 |

The seven-minute average-burden increase is expected and useful: the Andes case now retains a coherent southbound route instead of accepting a geographically poor Peru–Bolivia reversal merely because broad heuristic flights made it look 165 minutes faster. The median is unchanged. The calibration target was human-plausible route quality, not minimum heuristic minutes at any cost.

## Calibration corpus and diagnostic output

The suite contains 20 deterministic fixtures, 3–7 stops and 7–42 days, across all requested regions:

| Fixture | Region | Length / pace | Deliberate boundary |
| --- | --- | --- | --- |
| `japan-excellent-entered-order` | Japan | 19 days / relaxed | Excellent entered rail order; fixed first and final |
| `japan-deliberate-backtracking` | Japan | 17 days / balanced | Alps reversal; fixed first and final |
| `southern-spain-linear` | Southern Spain | 14 days / balanced | Mixed transport; fixed first and final |
| `southern-spain-very-short` | Southern Spain | 7 days / fast | Unequal nights in a compressed route |
| `portugal-fixed-algarve-gateway` | Portugal | 16 days / balanced | Base/day-trip relationships; fixed Algarve finish |
| `portugal-long-fixed-order` | Portugal | 42 days / relaxed | Explicit fixed order; no one-night churn |
| `andes-cross-border-linear` | Peru / Bolivia | 26 days / relaxed | Seven stops, altitude and two fixed gateways |
| `andes-deliberate-backtracking` | Peru / Bolivia | 24 days / balanced | Coast/highlands reversal |
| `maya-cross-border-island` | Mexico / Belize / Guatemala | 19 days / balanced | Island transition and overnight bases |
| `maya-fixed-antigua-backtracking` | Mexico / Belize / Guatemala | 18 days / balanced | Bad entered order; fixed Antigua finish |
| `italy-excellent-entered-order` | Italy | 15 days / balanced | Excellent entered rail corridor |
| `italy-very-short-anchors` | Italy | 8 days / fast | Five cities, unequal anchor nights |
| `balkans-adriatic-flow` | Balkans | 18 days / balanced | Two defensible Bosnia sequences |
| `balkans-deliberate-reversal` | Balkans | 17 days / balanced | Sarajevo/Zagreb reversal |
| `thailand-island-flight-transition` | Thailand | 14 days / balanced | North-to-Andaman flight and island finish |
| `vietnam-north-south-correction` | Vietnam | 15 days / balanced | Huế/Hội An reversal |
| `vietnam-excellent-slow-route` | Vietnam | 28 days / relaxed | Excellent entered north–south route |
| `morocco-north-to-atlantic` | Morocco | 18 days / balanced | Mixed transport and fixed endpoints |
| `us-southwest-road-arc` | United States | 15 days / balanced | Excellent canyon-country road arc |
| `scotland-highlands-to-inverness` | Scotland | 11 days / relaxed | Mainland/island road route and fixed gateway |

`npm run benchmark:route-quality-calibration` prints, for every viable order considered:

- the original and candidate order, source and rank;
- total/base score and every weighted component;
- every penalty and affected stop/leg;
- transfer minutes, distance, travel-heavy legs, flights and confidence gaps;
- winner, runners-up, selection explanation and why the numerical winner beat its runner-up;
- arrival/departure transfer evidence, complete night allocation and allocation reasons;
- final-plan validator issues, realism, hard failures and the documented human review.

The benchmark output is generated rather than checked in as a stale 800 KB snapshot. Tests require 20 unique canonical fixtures, complete diagnostics for every candidate, reachable documented strong orders, preserved gateways/must-visits, exact night budgets, zero clearly poor selections and deterministic comparable output.

## Systemic causes and decisions

| Observation | Exact seam | Decision |
| --- | --- | --- |
| A 350 km detour and a 2,152 km detour both lost exactly 10 points. Heuristic flights could therefore make a severe geographic reversal win. | `scoreRouteCandidates` in `lib/easyt/route-scoring.ts` | Scale the existing backtracking penalty by objective detour ratio, bounded to 1–3×. No weight hierarchy changed. |
| Required stops could remain at one night while high-priority anchors received their fourth or fifth night, despite enough total nights for two nights everywhere. | `bestExtraClaim` in `lib/easyt/night-allocation.ts` | Add a centralized second-night claim for required stops. It applies only to the 1→2 transition and remains below the existing first-night protection. |
| Ordinary stops still converged toward equality because a single target-gap score dominated every extra-night decision. | `bestExtraClaim` in `lib/easyt/night-allocation.ts` | Replace proportional/target-gap behaviour with per-night marginal stay value, semantic destination depth and bounded diminishing returns. |
| Builder could not distinguish an automatic split from a traveller edit and silently chose the largest stay or first route item as the receiver/donor. | `updateAllocatedDays` in `app/journey/new/trip-builder.tsx` | Persist stable `manualNightStopIds`, use the canonical confidence-gated rebalance, and show the existing `MorroviaStatusBanner` for every automatic consequence or unresolved balance. |
| Builder allocation decoded the entire route-metadata wrapper instead of its transfer-impact payload, so inbound impact was effectively absent; outbound impact was not supplied at all. | `nightAllocationStops` in `app/journey/new/trip-builder.tsx` | Decode `routeMetadata.transferImpact` and pass the following canonical leg as departure impact. |
| Automatic plan repair considered inbound transfer load but not the stay's outbound transfer. | `allocationFor` in `lib/easyt/plan-repair.ts` | Pass the next canonical leg's transfer impact as departure impact. |
| A day-level reorder could commit an order that violated structured fixed start/end gateways. | `replanTripAfterDayOrder` in `lib/easyt/trip-replan.ts` | Fail closed with `needs-route-edit` before mutation when either endpoint is broken. |
| A proposed exhaustive expansion fixed Andes but turned an explicitly bounded seven-island route into 120 candidates. | `generateRouteCandidates` boundary | Rejected. Candidate generation remains bounded for seven-stop trips. The bounded Andes set already contained the good entered order; selection severity, not candidate absence, was the real owner. |
| The local global-routing fixture said Washington had no context while providing Boston and resolved Cambridge, MA—decisive context for Washington, D.C. | `washington-ambiguity` fixture | Use London/Cambridge, UK context so Washington is genuinely ambiguous. No production resolver or benchmark gate changed. |
| A hostile suffix retained “Ignore” only as an unresolved, non-routable phrase, causing an exact-array benchmark comparison to call canonical state mutated. | uncertainty gauntlet measurement | Compare trusted resolved route destinations and additionally require every untrusted addition to remain unresolved/non-routable. Unknowns still stay unknown. |

Interests were inspected but not tuned. Existing curated interest evidence contributes at most 2.5 total route-score points, cannot erase the four-point meaningful-change guard, and has regression coverage proving it cannot override a clearly more efficient route.

## Exact production calibration

### Backtracking

The centralized scorer version is now `route-scoring-v3-backtracking-severity`. Once the existing 100 km / 15% backtracking thresholds are crossed:

```text
severity multiplier = clamp(detour ratio / configured backtracking ratio, 1, 3)
penalty = round(existing 10-point penalty × severity multiplier)
```

This produces 10–30 points. It preserves the existing component weights, recommendation threshold, fixed constraints and user-order tie break.

### Nights

The centralized config is `night-allocation-v2-marginal-depth`. Hard commitments and traveller-fixed nights are applied first, followed by minimum viable stays. Each remaining night goes to the highest current marginal stay value rather than a proportional weight. The marginal claim combines:

- semantically derived depth (`deep`, `substantial`, `ordinary`, `single-purpose`, `gateway`);
- gap to the pace-adjusted ideal;
- explicit anchor/required/base/hub/visit role;
- bounded selected-place and evidenced canonical-interest fit;
- weighted transfer time lost at both ends of the stay;
- a depth-specific diminishing-return slope and an additional past-ideal penalty.

Unknown destinations receive the neutral `ordinary` baseline. Names never determine depth. The required 1→2 protection remains, but does not apply to evidenced single-purpose or gateway stops. Deep destinations diminish more slowly; no destination can absorb spare nights indefinitely.

Post-edit rebalance is a distinct call in the same canonical owner. A receiver must score at least 58 and beat the runner-up by 12 points. A donor must score at most 78 and be at least 12 points clearer than the next donor. An already-balanced unlocked swap must improve marginal value by at least 12 points and beat the runner-up receiver/donor pair by the same margin. Otherwise the result stays put or remains explicitly under- or over-allocated. These are internal deterministic planning margins; the UI never exposes scores.

### Transfer-aware allocation

Both Builder and automatic repair supply arrival and departure impacts. An internal route leg is charged once across its adjacent stays: 70% to the arrival stop and 30% to the departure stop. The first arrival is charged in full because its origin is outside the stay allocation. Per-stop tax is capped at 1.5 days. This uses both ends without treating one route leg as two full lost days. Missing evidence remains neutral.

### Manual night intent

`TripBrief.manualNightStopIds` is the durable, stop-bound authority for an explicit Builder or co-pilot edit. It is included in device recovery comparison, cloud JSON, promotion/copy stop-ID remapping, Builder rebuild and benign route replan. Schedule locks and booking/fixed-night commitments remain stronger hard constraints. Removal filters dead manual IDs; reorder preserves surviving intent by stable identity. A structural conflict fails closed or remains an explicit balance conflict rather than clearing the manual value.

The Builder reuses `MorroviaStatusBanner`: information tone reports an automatic move and names its destination; warning tone reports nights left to add/remove. No new feedback/card family was introduced.

## Night allocation v1 / v2 corpus

Routes are unchanged. Values follow each fixture's selected order.

| Fixture | v1 nights | v2 nights | Human allocation decision |
| --- | --- | --- | --- |
| Japan · excellent | 5/2/2/5/2/2 | 4/3/2/4/3/2 | Both defensible; v2 spreads marginal nights before deepening anchors again. |
| Japan · backtracking | 4/2/2/4/2/2 | unchanged | Intentional retention. |
| Southern Spain · linear | 3/2/2/4/2 | 2/2/2/5/2 | v2 moves the spare night to the strongest evidenced anchor. |
| Southern Spain · short | 1/1/2/1/1 | unchanged | Correct visible compression. |
| Portugal · Algarve | 2/2/2/5/2/2 | unchanged | Correct deep-anchor / compact-gateway split. |
| Portugal · long | 6/7/7/8/7/6 | 7/6/6/10/6/6 | Both GOOD; bounded spread remains four nights. |
| Andes · linear | 4/4/4/4/3/3/3 | unchanged | Sparse evidence correctly stays neutral. |
| Andes · backtracking | 4/4/3/3/3/3/3 | unchanged | Sparse evidence correctly stays neutral. |
| Maya · island | 3/3/3/3/3/3 | unchanged | Even allocation is correct under neutral evidence. |
| Maya · fixed Antigua | 3/3/3/3/3/2 | unchanged | Fixed gateway remains viable. |
| Italy · excellent | 4/3/3/2/2 | unchanged | Curated anchors already lead. |
| Italy · short | 3/1/1/1/1 | unchanged | One-night stays are unavoidable and explicit. |
| Balkans · flow | 3/3/3/3/3/2 | unchanged | Neutral evidence and fixed finish. |
| Balkans · reversal | 3/3/3/3/2/2 | unchanged | Route correction retained viable stays. |
| Thailand · islands | 3/4/3/3 | 4/3/3/3 | Both GOOD; weighted transfer/depth evidence changes which city takes the spare night. |
| Vietnam · correction | 4/2/3/2/3 | unchanged | Curated depth retained. |
| Vietnam · long | 6/5/5/5/6 | 7/4/4/6/6 | Deep anchors absorb more while every stop stays meaningful. |
| Morocco | 3/3/3/3/3/2 | unchanged | Neutral evidence is intentionally even. |
| US Southwest | 3/3/2/2/2/2 | unchanged | Road-style route remains compact and bounded. |
| Scotland | 3/3/2/2 | unchanged | Gateway and Highlands split retained. |

### Fixed gateways

Day-order replan checks the canonical order derived from authored days against structured fixed endpoints before route assessment or cascade. On conflict it returns the untouched trip and the endpoint requiring route-level resolution.

### Candidate generation

No final production change. Seven-plus-stop generation remains bounded to at most 20 candidates. Exhaustive generation remains unchanged for the existing small-route boundary.

## Historical route-quality pass: per-fixture before / after

Routes use `→`; night allocations follow the same order.

| Fixture | BEFORE | AFTER | Improvement / intentional decision |
| --- | --- | --- | --- |
| Japan · excellent entered | Route: Tokyo→Kanazawa→Takayama→Kyoto→Hiroshima→Osaka. Nights: 5/3/2/5/2/1. Score 96.5. Issues: no validator issue; avoidable Osaka one-night stay. **ACCEPTABLE**. | Same route. Nights: 5/2/2/5/2/2. Score 96.5. No validator issue. **GOOD**. | Preserved an excellent order; removed one-night churn without destination hardcoding. |
| Japan · entered backtracking | Route: Tokyo→Takayama→Kanazawa→Kyoto→Hiroshima→Osaka. Nights: 4/2/2/4/2/2. Score 98.2. No validator issue. **ACCEPTABLE**. | Same route/nights/score; no validator issue. **ACCEPTABLE**. | The engine already removed the material reversal. Takayama/Kanazawa remains a defensible alternative, so no subjective tuning. |
| Southern Spain · linear | Route: Madrid→Granada→Córdoba→Seville→Málaga. Nights: 3/2/2/4/2. Score 95.9. No validator issue. **ACCEPTABLE**. | Same route/nights/score; no validator issue. **ACCEPTABLE**. | Marginal regional ordering difference only; meaningful-change guard correctly retained user intent. |
| Southern Spain · very short | Route: Madrid→Córdoba→Seville→Granada→Málaga. Nights: 1/1/2/1/1. Score 97.0. Issues: below-minimum stay and minimum-stay conflict; exhausting but feasible. **ACCEPTABLE**. | Same route/nights/score/issues. **ACCEPTABLE**. | Six nights cannot provide two nights to five required stops. The visible compromise is correct; no fake equality or hidden stop removal. |
| Portugal · Algarve gateway | Route: Porto→Douro Valley→Coimbra→Lisbon→Sintra→Algarve. Nights: 2/2/2/5/2/2. Score 99.6. No validator issue. **GOOD**. | Same route/nights/score; no validator issue. **GOOD**. | Intentionally unchanged: coherent north–south flow, bases preserved, fixed gateway protected. |
| Portugal · long fixed order | Route: Porto→Douro Valley→Coimbra→Lisbon→Sintra→Algarve. Nights: 6/7/7/8/7/6. Score 99.6. No validator issue. **GOOD**. | Same route/nights/score; no validator issue. **GOOD**. | Intentionally unchanged: explicit fixed order and long stays already behave correctly. |
| Andes · cross-border linear | Route: Lima→Huacachina→Cusco→Sacred Valley→La Paz→Lake Titicaca→Uyuni. Nights: 4/4/4/4/4/4/1. Score 79.7. Issue: unnecessary backtracking; realism unreasonable. **CLEARLY POOR**. | Route: Lima→Huacachina→Cusco→Sacred Valley→Lake Titicaca→La Paz→Uyuni. Nights: 4/4/4/4/3/3/3. Score 75.6. No validator issue; exhausting but feasible. **ACCEPTABLE**. | Severe detours can no longer win on cheap heuristic flights; original coherent intent is retained and Uyuni no longer gets one night. The lower relative score reflects the bounded candidate pool, not worse quality. |
| Andes · deliberate backtracking | Route: Lima→Huacachina→Sacred Valley→Cusco→Lake Titicaca→La Paz→Uyuni. Nights: 4/4/3/3/3/3/3. Score 92.3. No validator issue; exhausting but feasible. **ACCEPTABLE**. | Same route/nights/score/issues. **ACCEPTABLE**. | Existing bounded candidates already corrected the material coast/highlands reversal; no further subjective change. |
| Maya route · cross-border island | Route: Cancún→Tulum→Caye Caulker→Flores→Lake Atitlán→Antigua. Nights: 3/3/3/3/3/3. Score 98.2. No validator issue. **GOOD**. | Same route/nights/score; no validator issue. **GOOD**. | Intentionally unchanged: island transition precedes the southbound Guatemala bases. |
| Maya route · bad entered order | Route: Cancún→Tulum→Caye Caulker→Flores→Lake Atitlán→Antigua. Nights: 3/3/3/3/3/2. Score 98.2. No validator issue. **GOOD**. | Same route/nights/score; no validator issue. **GOOD**. | Existing routing already removed the international reversal and preserved the fixed Antigua finish. |
| Italy · excellent entered | Route: Rome→Florence→Bologna→Venice→Milan. Nights: 5/4/3/1/1. Score 96.1. No validator issue; avoidable Venice/Milan one-night stays. **ACCEPTABLE**. | Same route. Nights: 4/3/3/2/2. Score 96.1. No validator issue. **GOOD**. | Preserved the excellent rail corridor and distributed the available nights before deepening anchors. |
| Italy · very short anchors | Route: Rome→Florence→Bologna→Venice→Milan. Nights: 3/1/1/1/1. Score 96.1. Issues: three below-minimum stays and minimum-stay conflict; exhausting but feasible. **ACCEPTABLE**. | Same route/nights/score/issues. **ACCEPTABLE**. | Intentionally unchanged: seven nights cannot give five required cities two nights; Rome correctly receives the non-equal anchor allocation. |
| Balkans · Adriatic flow | Route: Ljubljana→Zagreb→Split→Sarajevo→Mostar→Dubrovnik. Nights: 3/3/3/3/3/2. Score 94.7. No validator issue. **GOOD**. | Same route/nights/score; no validator issue. **GOOD**. | Intentionally unchanged: one of two documented defensible Bosnia sequences. |
| Balkans · deliberate reversal | Route: Ljubljana→Zagreb→Sarajevo→Mostar→Split→Dubrovnik. Nights: 3/3/3/3/2/2. Score 96.3. No validator issue. **ACCEPTABLE**. | Same route/nights/score; no validator issue. **ACCEPTABLE**. | Material Zagreb reversal was removed. Split/Mostar ordering remains transport-dependent, so no false precision. |
| Thailand · island/flight | Route: Bangkok→Chiang Mai→Krabi→Koh Lanta. Nights: 3/4/3/3. Score 87.7. No validator issue; exhausting but feasible. **ACCEPTABLE**. | Same route/nights/score/issues. **ACCEPTABLE**. | Intentionally unchanged: preserves the north-to-Andaman transition and island finish; exact services remain external evidence. |
| Vietnam · reversal | Route: Hanoi→Ninh Bình→Hội An→Huế→Ho Chi Minh City. Nights: 4/2/3/2/3. Score 93.0. No validator issue; exhausting but feasible. **ACCEPTABLE**. | Same route/nights/score/issues. **ACCEPTABLE**. | Existing meaningful-change threshold regards the Huế/Hội An alternatives as marginal under current evidence; no subjective override. |
| Vietnam · slow entered | Route: Hanoi→Ninh Bình→Huế→Hội An→Ho Chi Minh City. Nights: 6/5/5/5/6. Score 95.2. No validator issue; transfer model calls it exhausting but feasible. **ACCEPTABLE**. | Same route/nights/score/issues. **ACCEPTABLE**. | Intentionally unchanged: excellent north–south order and generous stays; classification is limited by broad transfer evidence. |
| Morocco · north to Atlantic | Route: Casablanca→Rabat→Chefchaouen→Fes→Marrakech→Essaouira. Nights: 3/3/3/3/3/2. Score 97.0. No validator issue; reasonable with trade-offs. **GOOD**. | Same route/nights/score/issues. **GOOD**. | Existing engine already grouped northern cities before the southern/Atlantic finish. |
| US Southwest · road arc | Route: Las Vegas→Zion→Bryce Canyon→Page→Grand Canyon→Sedona. Nights: 3/3/2/2/2/2. Score 93.9. No validator issue. **GOOD**. | Same route/nights/score; no validator issue. **GOOD**. | Intentionally unchanged: coherent canyon-country arc and suitable fixed gateways. |
| Scotland · Highlands | Route: Edinburgh→Glencoe→Isle of Skye→Inverness. Nights: 3/3/3/1. Score 99.3. No validator issue; avoidable Inverness one-night stay. **ACCEPTABLE**. | Same route. Nights: 3/3/2/2. Score 99.3. No validator issue. **GOOD**. | Preserved the coherent west/north arc and removed gateway one-night churn. |

## Intentionally unchanged cases

Thirteen selected entered orders are explicitly recorded as deliberately unchanged: Japan excellent; Southern Spain very short; both Portugal cases; Andes linear after the bad alternative is suppressed; Maya cross-border; both Italy cases; Balkans Adriatic; Thailand; slow Vietnam; US Southwest; and Scotland. Other unchanged outputs either already corrected a bad entered order before this pass or remain a documented, defensible alternative rather than an objectively weaker plan.

The suite does not force every fixture to GOOD. Ten remain ACCEPTABLE because the trip is objectively compressed, exact services are unknown, or two regional sequences are both plausible. Those are visible trade-offs, not calibration failures.

## Regression results

- Calibration benchmark: 20 fixtures; 10 GOOD, 10 ACCEPTABLE, 0 CLEARLY POOR, 0 hard failures.
- Route-quality gauntlet: 18 fixtures + 13 adversarial variants; zero route, night, transfer, constraint, calendar, health, Builder or base/visit objective failures.
- Global routing: 51 fixtures; 2 pass, 49 pass with expected uncertainty, 0 warnings, 0 hard failures; every capability 100%; stored baseline unchanged.
- Prompt engine: 210/224; all seven dimensions unchanged from baseline.
- Engine benchmark, candidate/scoring/intelligence, transport feasibility, validator, realism, constraints, nights, replan/cascade, state preservation, Trip Health, uncertainty, interest hierarchy and Builder wiring tests pass.
- Typecheck, production build and `git diff --check` pass in the final validation run.

The first local global-routing run exposed one hard fixture self-contradiction (Boston/Cambridge context while requiring Washington ambiguity). The fixture was corrected without touching resolver behavior or the accepted baseline. The accepted global hard-failure count therefore remains 0→0.

## Remaining weaknesses

1. Many transfer modes and durations are still broad deterministic estimates. Cross-border queues, seasonal ferries, island flights and reverse-direction service evidence remain unknown unless curated evidence exists.
2. Relative route scores depend on the bounded candidate cohort; they are useful for selection and explanation, not absolute quality grades across trips.
3. Attraction/base semantics can still make Trip Health treat a correctly linked visit (for example a landmark served from a base) as a missing required overnight stop on some legacy paths. The route-quality gauntlet records this without changing routing here.
4. Natural-language “keep this exact order” is protected when captured into the existing fixed-commitment/structured-constraint boundary. Expanding capture semantics for free-form fixed-order language is a separate intent task.
5. Some GOOD-versus-ACCEPTABLE distinctions will remain service-dependent until Morrovia has sourced, directional connection evidence. Weight tuning cannot safely substitute for that evidence.

## Recommended next routing improvement

The next highest-value step is not another weight change. Add more sourced, bidirectional regional connection evidence—especially ferry/island and cross-border legs—through the existing destination/transfer knowledge and provenance owners. That would let the scorer distinguish current ACCEPTABLE alternatives without inventing services or weakening uncertainty. Separately, reconcile base-linked attractions with Trip Health's required-stop check so a valid day trip is not presented as a missing overnight destination.

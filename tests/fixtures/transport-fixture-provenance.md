# Transport fixture contract corrections

Base: `6a24c4f3bc24105a0c0ad3044987cacabf88e87e`.
Scope: tests only; production geography, resolver policy, pinned reference selections,
and frozen transfer-realism benchmark cohort/baseline are unchanged.

## Eight inherited failures

1. Short preferred-road: preserve fictional Short A/B, Testland [0,0]/[0.25,0]
   as unknown/null/zero-call negative. Positive uses actual selected Ica and
   reviewed compiled Huacachina through canonical construction. Fixture provider
   returns 32km/45min; these remain synthetic selection instrumentation, not a
   real Ica–Huacachina route/time claim. Preferred-road and 45-minute assertions
   are retained; exact requested points/readiness/one call are added.
2. Island guard: retain all historical Athens→Naxos, Naxos→Athens, Naxos→Paros
   directions. Replace incidental prose regex with structured unresolved result,
   no candidates/geometry/road estimate/segments, land-separation predicate and
   zero calls. Separate actual selected endpoints prove rejection after readiness,
   so raw rejection cannot masquerade as crossing-stage coverage.
3. Huacachina→Lima: use compiled exact accepted points through canonical unknown
   road-fallback construction and JSON roundtrip. Retain mode/time/distance,
   provenance/confidence/geometry/map assertions and verify actual request points
   and identities. Historical old points remain zero-call negative.
4. Austin→Dallas: actual pinned selections, serialized canonical eligible leg,
   exact requests; retain road/255min and add distance/provenance/geometry/call count.
   Old raw points remain zero-call negative.
5. Legacy rail healing: ready real Huacachina→Lima leg; delete only legacy eligibility
   marker. Retain healing plus authored unknown unchanged and one total call.
   Original Legacy From/To raw and deleted-marker variants remain zero-call negatives.
6. Palermo→Naples: retain original raw cross-water zero-call safety scenario; also
   selected ready Palermo/Naples remain unknown/null without provider calls.
   Canonical constructor already rejects eligibility, so direct resolver reports
   explicit_or_unsupported_source; land-separation is asserted independently.
   Separate real eligible same-land Huacachina→Lima no_route fixture retains
   unchanged/unknown/null/no geometry with one provider request and typed
   provider_no_route reason. No ferry service is inferred.
7. Implausibility/cross-border: ready Huacachina→Lima plus synthetic implausible
   1700km/255min result isolates implausible_route and one provider call. Real
   selected Tacna/Arica endpoint identities isolate cross_border policy in a
   clearly marked unresolved legacy policy-stage fixture, with no additional
   provider call. The canonical Tacna→Arica constructor currently chooses air;
   this test does not claim otherwise or confirm a cross-border road service.
   Original Safe From/To and country-flipped Peru points remain geographic-invalid
   zero-call negatives. No production eligibility marker is changed.
8. Missing country: start from ready same-land leg, remove either country; retain
   unchanged/unknown/no estimate/zero calls, assert unverified_geography because
   acceptance precedes provider country validation.

## Selection provenance

`selectedTransferPlace` is the existing helper, not changed here. It requires a
real ID in the pinned repository reference snapshot and calls production
acceptedGeographicPlace/geographicallyReady. No blanket binding or invented record.

| Positive selection | Existing reference ID / compiled point |
|---|---|
| Ica | reference:geonames:3938527; [-75.73422,-14.07538] |
| Austin | reference:geonames:4671654; [-97.74306,30.26715] |
| Dallas | reference:geonames:4684888; [-96.80667,32.78306] |
| Athens | reference:geonames:264371; [23.72784,37.98376] |
| Naxos | reference:geonames:256632; [25.37639,37.10556] |
| Paros | reference:geonames:255721; [25.15,37.08333] |
| Palermo | reference:geonames:2523920; [13.3636,38.1166] |
| Naples | reference:geonames:3172394; [14.26811,40.85216] |
| Tacna | reference:geonames:3928128; [-70.25362,-18.01465] |
| Arica | reference:geonames:3899361; [-70.30058,-18.47552] |
| Huacachina | existing compiled identity huacachina; [-75.7642,-14.0875] |
| Lima | existing compiled identity lima; [-77.0428,-12.0464] |

Probe-only Athens/Piraeus was rejected by current land topology despite ready
identities; it was not used to fabricate passing short-route coverage or modify
production topology. No supported Athens/Piraeus road claim is made.

## Verification and open gates

Changed suites:
`node --experimental-strip-types --test tests/road-routing.test.ts tests/multimodal-transfer-resolution.test.ts`
33 passed, 0 failed, 0 skipped. Base before corrections: 28 tests, 20 passed,
8 failed. Five extra tests preserve raw negatives and independently ready crossing
coverage. No assertions or benchmark cases were skipped.

`./node_modules/.bin/tsc --project tsconfig.typecheck.json --noEmit --incremental false`
passed; `git diff --check` passed.

Broader six-file run adding transfer-geographic-readiness, batch15-bounded-crossings,
intercity-rail-evidence, transport-mode-choice: 74 tests, 66 passed, 8 failed.
All eight failures reproduced on untouched base using the two adjacent files:
15 tests, 7 passed, 8 failed. Seven Western Europe rail evidence/presentation
failures and Fenghuang→Hong Kong selectable-alternative failure remain open.
No production/rail fixtures were modified to green them.

Frozen benchmark aggregate, original NYC/Goa/Nairobi/Hoi An/Zanzibar inputs and
Rome→Venice rail evidence gaps retain the classification report's open status.
This patch qualifies corrected fixture stages, not release-wide routing coverage,
real services, hosted save/reload, authentication or deployment.

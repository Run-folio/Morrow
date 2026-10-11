# Batch 15 bounded transport corrections

## Scope and evidence

The resolver discarded a plausible `routed_road` candidate unless the traveller explicitly preferred driving. Restoring that candidate to normal scoring fixes five deterministic benchmark legs without changing expectations, frozen baseline files, the road provider contract, or geographic readiness rules.

Two reusable infrastructure components have been added in `surface-crossing-evidence.ts`:

- Ketapang–Gilimanuk: ASDP identifies the crossing and vehicle carriage in its [official operator report](https://www.asdp.id/siaran-pers/layanan-ketapang-gilimanuk-diperkuat-regulator-dan-operator-penyeberangan-solid-jaga-keselamatan-dan-kelancaran-logistik). The report was found in the search index; direct page retrieval timed out. This establishes topology only. No schedule, fare or stable duration is copied into production.
- Øresund: the [official bridge facts](https://www.oresundsbron.com/en/about-oresundsbron/about-us/facts-about-oresundsbron) establish a road and rail fixed link. Only bounded road feasibility is enabled here; a plausible provider route is still required for road timing. Infrastructure does not assert a train departure or service duration.

The ferry component matches actual endpoint countries, landmass identity and bounded access distance, then projects the actual stop → Ketapang port → Gilimanuk port → actual stop in either direction. Nearby Java/Bali bases reuse the same component; names alone cannot match another Ketapang in Borneo. Physical port coordinates are null: the operator pages do not establish verified terminal points. Scope centres and land anchors are exact records from the unchanged GeoNames snapshot, used only for bounded access matching, never substituted for terminal geometry. Ground access without routed evidence and ferry timing remain null; consequently the whole journey duration remains null and its outcome remains unresolved. Hard road/ferry exclusions suppress the composition.

The fixed link is restricted to the Copenhagen and Malmö access areas in their respective countries, with positive same-land evidence to verified Roskilde/Lund anchors. Where the exact coastal Copenhagen city point is unproven in simplified geometry, only its verified canonical identity/name/country/coordinate tuple can match. Country and proximity alone are insufficient; Saltholm is rejected. Other disconnected pairs retain the existing uncertainty rules. The Natural Earth geometry, settlements, airports and island bindings are unchanged.

## Verification

New regression cases failed before the correction: ordinary mainland road selected unknown, Copenhagen–Malmö selected unknown, and Java–Bali lacked the ferry component. The new bounded crossing tests pass after the correction. Controls also verify reverse direction and rejection of unrelated Greek islands, Borneo Ketapang, and Copenhagen–Oslo as unsupported crossing components.

Separate accepted-reference controls use the actual compiled snapshot, `searchReferencePlaces` and `acceptedGeographicPlace`:

- Lima → New York City: flight.
- Delhi → Panaji: flight. Panaji is an explicit city base in Goa; this does not reinterpret Goa's region as a city.
- Cape Town → Nairobi: flight.
- Tokyo → Hoi An: mixed, with the flight terminating at Da Nang.
- Actual ZNZ airport (OurAirports 3260) → Nungwi: remains unknown because land continuity at the coastal records is unproven. This is a remaining geography evidence limitation, not a reason to waive disconnected-land safeguards.

The original benchmark remains frozen and continues to fail its two final assertions. Before: 18 correct / 10 wrong; after: 23 correct / 5 wrong. The five remaining old fixture inputs enter `buildCanonicalTripLegs` with unverified geography and null distance: Lima–New York, Delhi–Goa, Cape Town–Nairobi, Tokyo–Hoi An, and Zanzibar Airport–Nungwi. Production unknown copy is `Transfer needs checking`; the benchmark expects `Unknown transport`. Neither production copy nor benchmark expectations are changed for that mismatch.

The broader existing transport subset has the same 14 failing test names both on the untouched base and after this correction (35/49 before; 39/53 with the four new tests):

1. provider city labels retain reviewed transport evidence after JSON handoff
2. Central Asia coverage includes arrival and same-as-start return without inventing the cross-border gap
3. reviewed endpoint air access does not assert a nonstop flight or live availability
4. new evidence can resolve a previously saved unknown without retaining unknown provenance
5. the unresolved cross-border leg retains the existing cautious transport search action
6. Peru multi-stop sanity retains supported connections
7. a road preference keeps road in the comparison instead of triggering the strong-rail shortcut
8. the exact founder Japan and China route resolves every leg without replacing canonical identity
9. the exact Vietnam route resolves common corridors and compares rail with the Hoi An flight gateway
10. La Paz to Huacachina composes flight to Lima plus provider-routed ground access
11. a short land journey selects routed road when driving is preferred
12. catalogued island endpoints cannot become direct road legs without crossing evidence
13. the deterministic benchmark is repeatable and matches the reviewed final baseline
14. final engine defects are cleared while knowledge gaps and appropriate unknowns stay explicit

Logs: `/tmp/batch15-transfer-crossings-before.log`, `/tmp/batch15-transfer-focused-base.log`, `/tmp/batch15-transfer-focused-after.log`, `/tmp/batch15-transfer-final.log`, `/tmp/batch15-transfer-typecheck-final.log`. Integration verification is owned by the parent task. No commit, push or deployment was performed.

## Coordinate provenance correction

The original handwritten approximate port coordinates and land anchors were not verified and have been removed. Both named port endpoints now have `coordinates: null`; ferry distance and access segment distances therefore stay null. Road access cannot be routed until a separately verified physical terminal point is available. The topology remains useful but unresolved.

All scope points now exactly match the compiled existing GeoNames records; a regression checks each point through `referencePlaceById` and the current snapshot ID:

| Purpose | GeoNames identity | Longitude, latitude |
| --- | --- | --- |
| Java scope and land anchor (Banyuwangi) | 1650077 | 114.35755, -8.2325 |
| Bali scope and land anchor (Negara) | 1634266 | 114.61694, -8.35694 |
| Copenhagen scope centre | 2618425 | 12.56553, 55.67594 |
| Danish land anchor (Roskilde) | 2614481 | 12.08035, 55.64152 |
| Malmö scope centre | 2692969 | 13.00073, 55.60587 |
| Swedish land anchor (Lund) | 2693678 | 13.19321, 55.70584 |

These records are existing geographic evidence, not port or bridge entry coordinates. Source acquisition provenance remains in `data/place-reference/manifest.json`; no snapshot files changed. Maximum access radii are conservative product scope bounds, not source claims about journey duration or service coverage.

The [ASDP Ketapang port page](https://www.asdp.id/pelabuhan/pelabuhan-ketapang) was fetched fully. Its `Get Direction` link redirects to ASDP's Jakarta headquarters, so it was rejected as terminal-coordinate evidence. Gilimanuk and the ASDP press articles continued to time out on direct retrieval. The [Ministry of Transport's crossing record](https://dephub.go.id/post/read/lintasan-ketapang-gilimanuk-63027) was fetched fully and corroborates the named crossing and vehicle/passenger carriage; it is dated 18 July 2014 and is not a current timetable or fleet assertion. Neither source supplies verified terminal coordinates.

The Saltholm counterexample failed before the correction (`road` instead of `unknown`) and passes afterward. Logs: `/tmp/batch15-transfer-saltholm-before.log`, `/tmp/batch15-transfer-coordinates-after.log`, `/tmp/batch15-transfer-coordinate-typecheck.log`.

## Saved estimate contamination regression

A saved unknown whole leg could carry old `doorToDoorMinutes`, routed distance and geometry into each new ferry access segment because the access resolver spread the entire saved leg. A failing-before regression reproduces the reported 120-minute access segments with 80 km and unrelated `[[1,2],[3,4]]` geometry despite both terminal coordinates being null.

Access resolution now constructs a fresh leg with only its new endpoints, unknown timing, current coordinate-derived distance (null for these unverified ports) and traveller transport constraints. The untimed whole ferry journey clears saved headline/door-to-door timing, day loss, distances, geometry, road estimate and transfer impact/road-routing/confidence metadata. Traveller constraints and other traveller metadata remain intact; the original input is unchanged.

Final scoped regressions and accepted-reference controls: 13/13 pass. Evidence: `/tmp/batch15-transfer-stale-before.log`, `/tmp/batch15-transfer-stale-after.log`, `/tmp/batch15-transfer-stale-typecheck.log`.

## Cross-border reference-only policy

Restoring default road ranking initially also selected an unapproved international driving route. The existing Central Asia regression reproduced the issue before this final correction: Almaty–Bishkek became `road` when the expected transport remained `unknown` with a separate persisted 245 km / 270 minute road estimate.

Default road ranking is now restricted to same-country endpoints or a bounded reviewed fixed link. Existing explicit driving preferences retain their previous behavior. Other cross-border routes keep the driving estimate as a reference and explain that it does not establish a passenger connection. No frozen benchmark expectations were changed.

The cross-border reference regression and all 13 new controls pass. Running the entire Central Asia file also reveals `a no-driving constraint prevents even a road-reference lookup`; that failure reproduces identically on the untouched base (one lookup rather than zero). It is an inherited geography/input constraint handoff issue and was not changed by this scoped policy correction. Combined run: 15/16 pass; only that inherited failure remains. Logs: `/tmp/batch15-transfer-crossborder-before.log`, `/tmp/batch15-transfer-crossborder-after.log`, `/tmp/batch15-transfer-centralasia-base.log`, `/tmp/batch15-transfer-crossborder-typecheck.log`.

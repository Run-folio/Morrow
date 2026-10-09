# Maintained place references

Morrovia uses pinned OurAirports public-domain data and a GeoNames `cities500` extract under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source URLs, acquisition timestamps, hashes and generated-file digests are in `data/place-reference/manifest.json`; licensing and modifications are in `LICENSES.md`. Acquisition time is not an invented upstream publication date.

Snapshot `5b64880f570cf12a0fd0` contains 11,290 coded airport records, 224,601 eligible settlements and 1,830 initial choices across 245 jurisdictions. The planner registry retains 250 jurisdictions and all 197 existing country IDs. AQ, BV, IO, HM and UM have no eligible settlement in this thresholded source extract; that does not prove they have no inhabitants. `coverage.json` records all feature counts before filtering, exclusions and these provisional exceptions for independent review. IO has two PPLL rows outside eligibility; the other four have no rows. PPLCD is supported and tested, although this pinned extract contains none.

Generated settlement choices provide identity, type, source point and ISO jurisdiction only. They have no travel recommendation, stay duration, photo or tourism claim. Existing reviewed collections and authored identities keep precedence. Generated seeds and new jurisdiction anchors are explicit-only: manual search and exact-ID selection can use them; automatic prose/fuzzy capture and reviewed-content adapters cannot acquire new evidence through their names.

Airports retain stable OurAirports source IDs and physical points. IATA and ICAO are distinct source-validated fields; ICAO uses `icao_code`, not `ident` or `gps_code`. NYC and SEL remain metropolitan aliases. Closed airports are excluded; this extract has no coded closed rows, so fixtures exercise closed-airport behavior. Non-scheduled airports appear only for an exact normalized code or airport-name query, with a caution in the selectable option. A scheduled-service flag is source metadata, not current flight availability. Gateways cannot become accommodation stops. Automatic code resolution requires a unique source identity after explicit context filters; conflicting candidates remain choices for the traveller.

Runtime lookup verifies deployed files against the manifest. Airport records and compact settlement prefix/length indexes load lazily on the server; settlement records are read by indexed offsets from a read-only descriptor. Integrity verification uses bounded chunks. Search retains at most 12 ranked candidates. Raw upstream files and world records never enter browser bundles. Browser/server snapshot mismatches reject new reference suggestions; existing saved selections remain available. Visible GeoNames/OurAirports/OSM attribution uses the shared `MorroviaPlaceDataCredit` component.

Autocomplete is reference-only, including nearby-search branches. An explicit unresolved lookup can make one abortable Photon request with a 3,500 ms budget. Explicit nearby-base Overpass search remains separate. The standalone Nominatim adapter is fixture compatibility code; no default production flow imports it. Activity suggestions require an exact local identity, trusted source key, jurisdiction and point before Wikipedia is fetched. Unsupported, stale, mismatched or ambiguous centres return no suggestions; they do not change route readiness or saving.

## Saved trips and refreshes

Saved IDs, points, repeated occurrences, requested nights, manual order, commitments, authored itinerary, booking state and old bindings are durable trip facts. Searching, source refreshes, empty results and outages do not modify them or trigger a save. Current reference data cannot silently reassign an old trip. Published seed fact changes are quarantined and removed from new choices; retired seed records retain the old exact facts for historical reads. Never choose a nearest replacement. No automatic name-only curated crosswalks are shipped.

Refreshing is an operator action, not a runtime/build download. Acquire sources outside the repository, retain exact licenses and checksums, and create a source manifest. Generate into a candidate directory using the currently published directory as `--previous`:

```sh
node scripts/build-place-reference.mjs --airports <airports.csv> --settlements <cities500.txt> --source-manifest <source-manifest.json> --previous data/place-reference --output <candidate-directory>
```

Review coverage counts, source changes, code collisions, quarantines and tombstones. Unknown eligible jurisdictions, malformed rows, duplicate source IDs, bad hashes and budget overflow block activation and leave previous output intact. Run generator fixtures, byte-identical reproduction, source-backed selection/confirmation, persistence/recovery tests and the audit before activating all files together. Source growth requires review or a bounded representation change; never silently truncate countries or eligible entities. Any new crosswalk must establish exact entity/type/jurisdiction/geometry and preserve the authored point.

## Qualification

```sh
node scripts/audit-place-reference.mjs --output <report-directory>
node --experimental-strip-types --test tests/place-reference-*.test.ts
node --test tests/place-reference-generator.test.mjs tests/place-reference-budget.test.mjs
```

Blocking budgets: 32 MiB deployed reference data; 150 KiB incremental gzip client JavaScript; first lookup within 1 second; warm p95 within 100 ms over 1,000 queries; incremental RSS within 96 MiB; at most 12 API candidates. The audit compares exact accepted Git source and current code using identical minified, shared esbuild chunks for both affected client entries, and verifies no world index is in the browser graph. Next production build/tracing is checked separately. Performance tests run alone to avoid concurrent-suite CPU contention.

Local pinned-data tests, synthetic source failures, component SSR, browser checks and authenticated hosted proof are separate evidence. Local tests do not replace reopening the original saved trip → Build → save → reload or frozen-SHA route/geography checks. The authoritative all20 pack remains held until separately approved publication and verified hosted SHA. Three original feedback screenshots remain unavailable; the country-heading cross is a disclosed followup.


New reference geographic evidence must match the browser's compiled snapshot and its exact source identity, country, type, coordinate tuple and versioned provider key. The same acceptance gate applies to initial Builder lookup, saved-location confirmation and manual selection; autocomplete carries the snapshot stamp through selection. This gate does not run on historical binding reads: refreshes must preserve previously accepted coordinates and authored route decisions. The installed-refresh regression loads generated renamed, recoded, moved, retyped, jurisdiction-changed and deleted records through the actual lookup/read layers rather than assuming refresh behavior from an unchanged fixture.

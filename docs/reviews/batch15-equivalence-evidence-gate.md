# Batch15 equivalence evidence gate

Base: `7e85caba9a818f13cb1c88503a76dbfdb15c5f51`. Local correction only; no deployment or Batch15 acceptance claim.

The Manila mapping and general rounded-coordinate equivalence heuristic were removed from `lib/easyt/place-autocomplete.ts`. The pinned `data/place-reference/crosswalk.json` contains no mappings. Different canonical identities therefore remain selectable, even when their names, types, jurisdictions and points match. No positive cross-source mapping was fabricated.

Exact repeated suggestions within a canonical identity still deduplicate. Conflicting coordinates, country, type, admin context, provider key, source namespace, snapshot, source feature and provenance IDs remain explicit. Malformed points cannot hide a suggestion at this merge boundary; the existing selection geography gates remain unchanged.

Where published catalogue/seed facts exactly substantiate a same-label choice, the existing label helper adds its source label. Verified province labels and existing map links remain available; no administrative detail or city/metro/island/airport equivalence is inferred. IDs and authored/saved points are unchanged. No world reference index is added to the browser.

The catalogue Manila point `[120.9842,14.5995]` and GeoNames point `[120.9822,14.6042]` differ at the same published precision. [GeoNames 1701668](https://www.geonames.org/1701668/manila.html) verifies the source's PPLC identity, PH jurisdiction and point. [GeoNames extract specification](https://download.geonames.org/export/dump/readme.txt) defines the source ID, feature, country, admin and point fields. Neither substantiates an equivalence to Morrovia's authored point. The catalogue has no upstream geometry citation. Cross-source suppression must stay closed until an explicit reviewed mapping and validation of both published records (namespace, source ID/key, snapshot, feature/type, jurisdiction, point and admin identity) are available. Matching facts alone is insufficient. There are no genuinely documented positive mappings to preserve or exercise in this candidate.

Validation:

- Original 11 negative regressions and five controls pass. Expanded evidence-gate coverage has 30 tests; focused search/ranking/Builder-occurrence coverage totals 49 passing tests, zero skipped.
- Mounted shared autocomplete → origin selection → production Builder accepted edit → fixture account save → hard reload: all five Xi'an source identities and both Manila source/catalogue identities pass. Selected IDs and points survive; source selections retain their provider keys; authored selection remains authored. Two same-city stay occurrences retain their IDs, order, dates, nights and canonical IDs throughout.
- Typecheck, strict UI audit, Storybook build, production build and its 14-boundary manifest check pass. Independent review found no blockers.
- The existing `builder-persistence-acceptance.test.ts` explicit per-stop night assertion fails identically on unchanged base (empty fixed commitments). Existing A12 occurrence browser fixtures in fresh/reload/promoted modes resolve places and preserve source order/nights, then fail their enabled-Build assertion identically on unchanged base. Those acceptance gates are not waived.

The mounted browser helper stubs framework navigation, CSS, map, auth and account HTTP boundaries; it exercises production components and save/reload state, not hosted authentication or a live account. The full-suite run and its failure inventory are retained in the investigation task alongside the matched base reproductions. They are not a whole-suite pass. No calendar, saving, transport, imagery, production data or deployment change is included.

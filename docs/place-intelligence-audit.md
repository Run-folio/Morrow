# Place Intelligence before-state audit

Recorded on 23 August 2026 before the Place Intelligence boundary was introduced.

## Existing architecture

The homepage submits only the raw brief to `/api/journey-capture`. That route calls the deterministic `parseTripBrief` path and separately calls `extractStructuredTripBrief`, which reparses the same raw prose. Capture mentions and regions therefore do not project into `StructuredTripBrief`.

The deterministic parser used a small city/country table and recognized only Southeast Asia and the Japanese Alps as regions. The capture route always returned its surviving mentions as unresolved. The builder then sent each mention to Nominatim and treated a single returned city, state, county, island, park, landmark, or similar centroid as a concrete route stop. Dropped phrases never reached that provider step.

On review, the builder replaced prompt destinations with its current origin and concrete stops. This erased prompt geography that had not become a route stop. Persistence, replan, cascade, final-plan validation, and Trip Health could preserve only what survived that merge.

## Acceptance-prompt before-state

| Case | Phrases extracted | Phrases dropped | `StructuredTripBrief` geography | Destination references | Failure boundary |
| --- | --- | --- | --- | --- | --- |
| A. `3 weeks through Patagonia, Tierra del Fuego and Easter Island` | None | Patagonia; Tierra del Fuego; Easter Island | No destinations, countries, or regions; exact 21-day duration only | None | Extraction/catalog recall |
| B. `10 days in the Dolomites and Venice` | Venice | Dolomites | Venice as a preferred destination; no region | Venice, unresolved stop | Extraction/catalog recall |
| C. `Cusco, the Sacred Valley and Machu Picchu` | Cusco; Machu Picchu | Sacred Valley | Cusco and Machu Picchu as preferred destinations; no region | Cusco incorrectly classified as the landmark; Machu Picchu as a place | Extraction plus landmark classification |
| D. `A no-driving trip through the Greek Islands` | None | Greek Islands | No geography; an incorrect soft drive preference; no hard no-driving constraint | None | Extraction plus hyphenated-negation parsing |
| E. `The French Alps and Lake Annecy` | Generic mountains interest only | French Alps; Lake Annecy | Generic inferred `Mountains`; no exact geography | None | Extraction plus lossy projection |
| F. `A Balkans road trip` | A transient parser `destination` value only | Balkans from all consumed outputs | No geography; soft drive preference | None | Extraction/route-language parsing, then projection drop |
| G. `Rapa Nui and mainland Chile` | None | Rapa Nui; mainland Chile | No geography | None | Alias/country extraction |
| H. `Tierra del Fuego, Patagonia and Buenos Aires` | Buenos Aires | Tierra del Fuego; Patagonia | Buenos Aires as a preferred destination; no regions | Buenos Aires, unresolved stop | Extraction/catalog recall |

For the extended central prompt, nature, relaxed pace, 21 days, and the non-hyphenated no-driving constraint survived; all three place phrases were still absent.

## Root causes

1. The parser catalog encoded rows that behaved mostly like cities, not typed planning geographies.
2. Regions were unordered strings outside the mention model and could not carry roles, ambiguity, aliases, or routability.
3. The capture payload and `StructuredTripBrief` were produced independently.
4. Existing aliases lost the traveller's wording because deterministic matches returned only the canonical name.
5. Provider resolution happened only after extraction, so it could not recover a dropped phrase.
6. Builder merge semantics treated the selected route stops as a complete replacement for prompt geography.
7. Route-stop IDs were the only geographic identity downstream; they cannot safely double as stable canonical place IDs.
8. Trip Health had no representation of unresolved geography or a planning area that still needed a base.

## Baseline checks

- `npm run test:trip-capture`: 67 passing, 0 failing.
- `npm run benchmark:engine`: 327 passing findings, 50 warnings, 0 failures. The existing accepted transport-feasibility delta remained the only phase-one snapshot difference.


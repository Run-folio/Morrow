# Route Detail approved middle: information parity

Review date: 2026-09-08

Visual target: the approved review pack at `http://127.0.0.1:8782/review.html` and its captured evidence. Production remains authoritative for content, publication, handoff, images, provenance, map behavior, affiliate behavior, accessibility, and responsive behavior.

The old Japan screenshot and current route are different itineraries. The old page shows Tokyo → Takayama → Kyoto, 10 days / 9 nights. Current canonical Japan is Tokyo → Kanazawa → Takayama → Kyoto → Osaka, 16 days / 15 nights. Historical values are compared only as information functions and were never copied into current data.

| Information | OLD production Route Detail | CURRENT immersive before this change | APPROVED implementation | Classification |
| --- | --- | --- | --- | --- |
| Hero identity | “Japan, one good day at a time” | “Japan by rail, at your own pace” | Current immersive hero is unchanged | RETAINED |
| Route title | Old three-stop Japan title | Current canonical title | Current canonical title from `PublicRouteDetail` | RETAINED |
| Route sequence | Tokyo → Takayama → Kyoto | Tokyo → Kanazawa → Takayama → Kyoto → Osaka | Destination story, pacing spine, and map all use the current five-stop order | RETAINED |
| Map | Geographic overview with watermarked external tiles | Interactive map plus a repeated full stop list | Large interactive map with the shared Trip Map basemap, line, marker, attribution, lazy/error states, and a compact selector | IMPROVED |
| Route at a glance | Dedicated fact panel | Facts dispersed between opening and map list | Start/end, bases, country, example duration/nights, character, insight, and key warning are grouped with geography | IMPROVED |
| Duration | 10 days / 9 nights | 16-day example / 15 nights | 16 days / 15 nights stays explicit in opening, pacing, and geography where each answers a different planning question | RETAINED |
| Stops | 3 | 5 | 5 current bases; no five-stop assumption in component logic | RETAINED |
| Countries | Japan | Japan / one country | Country label and count remain in opening/geography | RETAINED |
| Route character | Unhurried; food/culture | Rail + pacing | “Rail + pacing” remains in compact geography facts | RETAINED |
| Route rationale | “Why this route works” panel | Route summary plus repeated stop roles | Route-order insight is beside the map; three concise stop-role reasons sit below it | RELOCATED |
| Recommended nights | Planned 3/3/3, without separate reviewed recommendations | Reviewed 4/2/3/4/2 beneath minimum values | Reviewed recommendations are the primary pacing value | IMPROVED |
| Minimum nights | Not separately identified | 3/2/2/3/2 | Minimums remain secondary to the recommendation or example stay | RETAINED |
| Transfer context | Approximate allowances | Current mode plus explicit uncertainty | Each spine connector links to the exact map connection and retains “details to confirm” status | IMPROVED |
| Pacing | Cards plus a repeated itinerary table | Text-heavy ledger with example disclosure | Connected route spine, concise rationale, strong night hierarchy, total example, and existing Builder handoff | IMPROVED |
| Highlights / experiences | Four photo cards | Five small text items | Up to six image-led editorial items from current attraction names and canonical destination photography | IMPROVED |
| Seasonal guidance | Exact historical month range | Current spring/autumn and summer notes | Current notes appear once under “When to go” and “Worth knowing”; old unsupported months remain absent | RELOCATED |
| Practical notes | Two-column travel notes | Several separate disclosures | Four visible topics: when, transport, useful context, and current checks | IMPROVED |
| Warnings | No warning visible for old Japan | Service/reservation and Toyama/bus caveats | Important route warning stays beside the map; connection checks remain visible in practical guidance and Sources & review | IMPROVED |
| Confidence | Compact editorial status | Confidence in disclosure | Same confidence value in the single Sources & review disclosure | RELOCATED |
| Reviewed date | Visible in travel notes | Present in trust disclosure | Same `reviewedAt` value in the Sources & review summary and body | RETAINED |
| Sources | Small source actions | Full source records, limitations, and unknowns across disclosures | One Sources & review disclosure preserves links, coverage, checked dates, limitations, owner/reviewer, and explicit unknowns | IMPROVED |
| Builder handoff | “Plan this route” | Canonical opening/final links and pacing link | Opening and final `RoutePlanLink` owners stay unchanged; pacing keeps “Shape the nights in Builder” | RETAINED |
| Affiliate handoff | No handoff visible in supplied old screenshot | Separate activity section with canonical resolver/disclosure | Same resolver, URL, disclosure, analytics context, and safe outbound link integrated below experiences | RELOCATED |
| Related routes | Not visible in supplied old screenshot | Two text-only related links | Two server-selected published routes use canonical image-led Discovery `RouteItem` cards | IMPROVED |

## Intentional omissions and content gaps

| Item | Decision | Classification |
| --- | --- | --- |
| Old 10-day / 3-stop Japan allocation and old transfer allowances | Describes another itinerary and has no current canonical owner | INTENTIONAL OMISSION |
| Old exact Meiji Shrine, Hida villages, morning markets, and eastern-Kyoto labels | Current public attraction projection supports broader names only | INTENTIONAL OMISSION |
| Old March–May / October–November recommendation | Current Japan record does not support this exact range | INTENTIONAL OMISSION |
| Osaka food-district photo | Canonical Osaka image shows castle/city context; the experience remains and explicitly identifies the subject-specific photo gap | RETAINED WITH QUALIFICATION |
| Andes reviewed night recommendations | The record has example and minimum nights only, so the UI says “Example stay” instead of implying review | RETAINED WITH TRUTHFUL FALLBACK |
| Andes experience photography | The Cusco hero is used only for its matching Cusco experience; Pisac/Ollantaytambo, Machu Picchu, and Arequipa use “Photography pending editorial review” | RETAINED WITH TRUTHFUL FALLBACK |

## Result

Zero silent losses of useful production information. Supported facts remain present in the chapter that best answers the traveller’s question. Unsupported historical values are explicitly omitted, and missing editorial assets are visible as qualified or pending states rather than invented imagery.

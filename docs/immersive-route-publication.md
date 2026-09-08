# Four-route local publication — 2026-09-07

**IMMERSIVE HOMEPAGE FOUR-ROUTE CONTENT COMPLETE — READY FOR STAGING ENABLEMENT**

Shaun Whiting explicitly approved the four candidates in this task as independent editorial reviewer, including minimum/recommended nights, duration ranges, source limitations, transport unknowns and licensed image associations. Codex remains researcher/content preparer. The [approval pack](immersive-four-route-editorial-approval.md) preserves the approved proposal and preceding historical audit.

Publication is local only on `codex/immersive-homepage`, starting SHA `846f3f3e1ff20bd30dbe7ad0fa6120080056b582`. No push, deployment, staging branch change or staging flag enablement. The application flag still defaults OFF. An explicit `IMMERSIVE_HOMEPAGE_V2=true` override was used only on the local acceptance server at port 8873.

## Published records

All four have `editorialReviewer: "Shaun Whiting"`, route confidence `medium`, review date `2026-09-07`, and release result `ready-with-verification` with no blockers. Every connection retains `needs-review`, null planning minutes and its documented uncertainty. No timetable, direct-service, border-time or winter-feasibility promise was added.

| Key | Approved title | Canonical order | Recommended nights | HTTP / indexing | Builder |
|---|---|---|---|---|---|
| japan-slow | Japan by rail, at your own pace | Tokyo → Kanazawa → Takayama → Kyoto → Osaka | 4 / 2 / 3 / 4 / 2 | 200; real title/stops; no rendered 404 or noindex; canonical URL + sitemap | All five; Osaka resolved; next step enabled |
| balkans-overland | The Balkans, one border at a time | Dubrovnik → Kotor → Shkodër → Tirana | 3 / 4 / 2 / 3 | 200; real title/stops; no rendered 404 or noindex; canonical URL + sitemap | All four; Tirana resolved; Dates and nights reached |
| vietnam-cambodia | Vietnam to Angkor, without rushing | Hanoi → Hoi An → Ho Chi Minh City → Siem Reap | 4 / 4 / 4 / 4 | 200; real title/stops; no rendered 404 or noindex; canonical URL + sitemap | All four; Siem Reap resolved; Dates and nights reached |
| iceland-ring-road | Iceland, south coast to the north | Reykjavík → Vík → Höfn → Reykjahlíð → Akureyri | 2 / 2 / 2 / 3 / 3 | 200; real title/stops; no rendered 404 or noindex; canonical URL + sitemap | All five; Akureyri resolved; Dates and nights reached |

Iceland remains a one-way partial Ring Road journey. Its return to Reykjavík is excluded; the existing slug remains stable.

## Post-publication acceptance

- **Public Route Detail:** all four fetched from the final optimized local build and opened in the browser, showing the approved title and real “Plan this route” link. HTTP checks verify real rendered title/stops, no noindex, no rendered not-found page, and canonical URL. Unused Next error-boundary templates inside scripts are excluded from rendered-404 detection. Evidence: `artifacts/immersive-route-publication/http.json`.
- **Catalogue:** “See all routes” reveals all four in the real catalogue with correct title, ordered bases, duration, stop count and detail links. Japan remains featured. Initial catalogue server markup shows featured routes; it is not the complete interactive catalogue.
- **Sitemap:** all four canonical URLs included. No duplicate slug or URL introduced.
- **Real Builder handoffs:** each Route Detail link exercised in the browser. Exact stop order and resolved opening/ending identities verified; “Set dates & nights” enabled and clicked. Dates/nights remain editable and datesExplicit remains false. The existing local Builder draft autosave runs after the user-equivalent click; no trip was generated, booked or saved to an account.
- **Handoff defect found and fixed:** the old payload carried an end-at constraint but omitted the structured `journeyEnd` identity, causing Builder to ask for endpoint confirmation and disable progression. `routePlannerPayload` now passes the matching canonical ending stop through the existing `normalizeJourneyEnd` owner. No route-engine, auth or persistence implementation change. Regression test verifies canonical endpoint coherence and coordinates after JSON reload for all four.
- **Homepage:** real four-route carousel tested, including random initial Iceland and later Japan, 4/4→1/4 next wraparound, previous navigation, selected-route story, stop photos, and all four sample route choices. Deterministic tests cover all four random outcomes and both wrap directions.
- **Japan:** Tokyo, Kanazawa, Takayama, Kyoto, Osaka visible in places and product samples. Changing Tokyo from four to five nights updates itinerary and map to sixteen total nights; reset restores fifteen.
- **Product samples:** Map/Builder/Itinerary exercised across all four; canonical night values and first itinerary base verified. The fully loaded production homepage Japan map renders the five route markers and connecting geometry. No provider-key watermark was visible in that final homepage map; the earlier Storybook basemap observation remains historical and is not used to certify unrelated map surfaces.
- **Affiliate imagery:** route-aware Japan stays and Iceland transport visually checked; sixteen route/category provenance and mapping cases pass automated tests. Existing generated-atmosphere disclosure retained. No partner link was followed or booking performed.

## Validation

- Public-route aggregate: **38/38** (release, trust, detail/presentation, handoff, SEO, discovery and homepage routes).
- Immersive/content plus endpoint/rail controls: **75/75**, including preserved Paris rail-saving and Cancún same-place/end controls.
- Typecheck, final production build, strict UI audit and `git diff --check`: pass.
- Existing signed-out local browser used; no shared auth/persistence changes, no broad account retest.
- No visual composition, CSS, typography, motion or shared UI changes in this publication pass. Prior Storybook build remains the visual component check; this pass uses actual production-page browser acceptance.
- Test-only approval fixture removed: admission tests now exercise the actual approved production records. Unsigned-route rejection remains explicitly tested by temporarily removing the reviewer and restoring it.

Logs: `artifacts/immersive-route-publication/`. Approval recorded in the canonical route records and the linked editorial pack. Default-OFF remains unchanged. Staging enablement is now eligible for the next authorized deployment step; it has not been performed.

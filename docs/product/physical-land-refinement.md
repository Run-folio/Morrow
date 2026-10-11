# Physical-land refinement review

Base 6a24c4f3bc24105a0c0ad3044987cacabf88e87e; isolated branch codex/island-physical-refinement.

Qualified ZNZ/Nungwi and Zanzibar-city/Nungwi now reach bounded road-provider assessment when precise verified physical containment resolves coarse unproven geography. Existing coarse separation and10km/5km thresholds remain unchanged. No coordinate changes, pair whitelist or runtime source requests. A returned plausible provider route remains required; missing/error/no_route/implausible provider results retain unknown/null.

Source: pinned official OSM island relation11105712 version10, all35 outer members independently natural=coastline; no administrative/maritime tags. Entire raw extract, relation/member/node versions and roles, exact capture time and source/output hashes are in public/data/physical-land. One strict6301-point outer component, no simplification. Component key is stable under member order and based on retained outer way identity; disconnected shells have different keys. Existing physical geometry validator checks rings, holes, intersections and caps. New importer rejects nested/incomplete dependencies and wrong host/relation/hash/version/source geometry.

ODbL derivative database and combined physical-land data are offered via public static source/derivative/coarse-base/notice files, without auth. Notice links licence terms and explicitly describes classification and data sharing. Natural Earth retains public-domain provenance. No GeoNames/OurAirports facts changed. Existing provider attribution is retained; refinement attribution and sharing location use existing road-reference warnings/attribution, with no new UI components or Storybook changes.

Verification: red transport reproduction9tests4pass5fail on unchanged base; focused final65/65 pass; artifact --check passes; final typecheck and build:check pass (including client reference boundary checks). Broader relevant lane163tests140pass23fail. All23 are inherited: ten previously classified on exact base, plus thirteen ranking/route cases independently reproduced by the base28-test lane (13pass15fail includes two previously known failures). Frozen fixture/baseline unchanged and aggregate remains8correct/20wrong; no baseline regeneration or waiver. Dedicated accepted ZNZ control is deliberately updated from unknown to provider-conditional road following new physical evidence.

Inherited failure names (no production or fixture correction in this branch):

- Japan-style 3–4h direct rail beats a short flight
- Western Europe direct rail beats air after door-to-door friction
- Spain-style 5–6h direct rail beats a flight
- China-style 7–8h low-change rail stays competitive
- poor-region 8h+ rail loses to a materially faster flight
- multi-change rail loses to a direct flight
- a no-flying hard constraint removes air before scoring
- an avoid-driving hard constraint prevents provider work
- a road preference keeps road in the comparison instead of triggering the strong-rail shortcut
- weak rail evidence cannot displace supported direct air
- the exact founder Japan and China route resolves every leg without replacing canonical identity
- Fenghuang to Hong Kong compares rail and air, then explains the rail selection
- the exact Vietnam route resolves common corridors and compares rail with the Hoi An flight gateway
- a short land journey selects routed road when driving is preferred
- catalogued island endpoints cannot become direct road legs without crossing evidence
- Huacachina to Lima resolves from unknown to one canonical road leg
- a second land-connected pair resolves when the provider succeeds
- a legacy planner-owned unsupported-rail leg can be healed without touching authored unknowns
- a cross-water no-route response retains the honest unresolved fallback
- implausible and cross-border results are rejected conservatively
- road routing is skipped when either endpoint country is unknown
- the deterministic benchmark is repeatable and matches the reviewed final baseline
- final engine defects are cleared while knowledge gaps and appropriate unknowns stay explicit

Evidence outside checkout: qa-baseline/physical-land-red.log; physical-source-red.log; physical-components-red.log; physical-land-new-tests.log; physical-land-final-focused.log; physical-land-relevant-suite.log; physical-land-inherited-baseline.log; physical-land-typecheck-final.log; physical-land-build-check.log.

Independent review and combined-SHA qualification remain required before release. Real road access, services and duration are NOT VERIFIED. No deployment, credentials, accounts or real trips accessed. Hosted source-sharing/transport verification remains outstanding for a reviewed combined deployment.

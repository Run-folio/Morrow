# Batch14 Maintained Place Reference Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with the existing implementer. Do not create another implementer. Independent review is required before execution and at the final candidate.

**Goal:** Make country choices and explicit airport-code search useful offline, preserving traveller decisions and removing default public Nominatim reliance.

**Architecture:** Versioned source files feed a small explicit-choice catalogue plus larger server-only reference indexes through current place/provider contracts. Existing reviewed Discovery and canonical edit/persistence owners stay in control. Photon remains a bounded explicit-lookup fallback and reverse-country verifier; autocomplete never calls external providers.

**Tech Stack:** Existing TypeScript/Node, React/Next, esbuild/Node tests and Storybook; no new service, dependency, SQL schema or credentials.

**Spec:** [2026-10-09-batch14-place-reference-coverage-design.md](../specs/2026-10-09-batch14-place-reference-coverage-design.md).

## Global constraints

- Exact accepted base: `73a3a0cbe19592b1b0d045434a62eb43a9b995e7`; isolate future execution on a new Batch14 reference-coverage branch from it, never edit Batch13.
- Planner universe: 250 jurisdictions (249 ISO alpha-2 plus XK); preserve 197 existing country IDs.
- Eight initial neutral settlements maximum per jurisdiction, 2,000 generated entries maximum; eligible codes PPL/PPLA/PPLA2/PPLA3/PPLA4/PPLC/PPLG.
- Zero external calls in autocomplete mode; zero default public Nominatim calls in the affected production flows; at most one bounded Photon call per completed unresolved search.
- No airport accommodation stops, invented tourism/recommendation evidence or alias/name-only ID/point binding.
- Source acquisition/activation occurs after independent plan review. No runtime/build downloads, automatic refresh or publication.
- Budgets: ≤150 KiB incremental compressed client JavaScript, ≤32 MiB uncompressed deployed reference files, warm search p95 ≤100 ms/1,000 queries, first load ≤1 second, incremental RSS ≤96 MiB, ≤12 API candidates.
- Saved points/IDs/nights/order/content/bindings stay unchanged on lookup, provider outage and reference refresh. Existing geographic writer/held-response guards remain authoritative.
- Normal accepted edits autosave/reconcile necessary dependencies. Update route is optional optimisation; authoritative order changes require traveller acceptance.
- Existing source terms/attribution, UI components/tokens and EN/ES patterns apply. No paid providers, new DB/security permissions, credentials or staging/production deployment without separate approval.

## Review focus

1. A catalogue city alias is visible before the airport response: do not let LHR become a London city-point airport; NYC/SEL remain metro choices. Task 2 tests pending and completed actual suggestion lists.
2. A country has reviewed content but no eligible route city: the US landmark cannot block neutral settlement choices or consume all visible slots. Task 3 exercises final production render/confirm, not raw source counts.
3. A refresh changes/deletes an accepted identity: do not rebind saved trips, invalidate trusted old geography or select the nearest replacement. Tasks 1/5 exercise quarantines/tombstones and actual read/reload consumers.
4. Same-name settlements, territory hierarchy and reversed/missing coordinates: exact record evidence must win over fuzzy name matching. Tasks 1–3 test ID/point/country/type mismatch and HK/PF/Georgia distinctions.
5. Stale async/owner responses, external failure and source size growth: preserve accepted state and block an over-budget snapshot. Tasks 4/5 test actual callbacks/API and build artifacts.

---

## File responsibility map

New generated files under `data/place-reference/`: `manifest.json`, `airports.json`, `settlements.json`, `country-seeds.json`, `code-kinds.json`, `retired-seeds.json`, `crosswalk.json`, `coverage.json`, `LICENSES.md`. Raw upstream archives are not committed. `retired-seeds.json` retains only compact published identities needed for old reads, not a second entire dataset.

New shared `lib/easyt/place-reference.ts`: portable compact seed/code classification and exact record-key helpers. New `lib/easyt/place-reference.server.ts`: lazy larger indexes, search and normal provider conversion. New `scripts/build-place-reference.mjs`: offline stream generator, validation and diff. New `scripts/audit-place-reference.mjs`: full production coverage/performance/bundle evidence. New `components/easyt/morrovia-place-data-credit.tsx`: one shared data attribution line composed with existing text/link tokens, distinct from photo credit.

Existing owners to change narrowly: `place-catalog.ts`, `place-intelligence.ts`, `place-autocomplete.ts`, `discovery-content.ts`, `discovery-projection.ts`, `discovery-confirmation.ts`, `open-world-place.server.ts`, `photon-place.server.ts`, `app/api/journey-geocode/route.ts`, `app/api/journey-discover/route.ts`, `canonical-place-autocomplete.tsx`, `discovery-steps.tsx`, `discovery-modal.stories.tsx`, `i18n.ts`. Inspect actual selection paths before changing any `trip-builder.tsx` call: it is touched only to pass validated reference selection evidence through existing geographic-binding construction if the current provenance handoff requires it. No Builder layout/state rewrite.

Tests to create: `place-reference-generator.test.mjs`, `place-reference-search.test.ts`, `place-reference-airport.test.ts`, `place-reference-country-coverage.test.ts`, `place-reference-request-policy.test.ts`, `place-reference-refresh.test.ts`, `place-reference-budget.test.mjs`. Extend actual API/geography/Discovery tests only where their production owner changes. Existing accepted behaviour regressions are preserved. Assertions tied to the former default provider are split into explicit compatibility-provider and new-default reference assertions as specified in Task 4; their old live evidence is not relabelled.

## Task 1: Deterministic reference snapshots and identity crosswalk

**Files:** create generator, `place-reference.ts`, generated files above, generator/refresh tests; inspect and reuse `country-registry.ts`, `place-catalog.ts`, `scripts/import-passport-index.ts` conventions.

**Interfaces:**

- `ReferencePlaceRecord`: `{ source: 'ourairports'|'geonames'; sourceId: string; canonicalPlaceId: string; providerId: string; canonicalName: string; aliases: readonly string[]; countryCode: string; placeType: 'city'|'town'|'transport_gateway'; coordinates: readonly [number,number]; status: 'active'|'closed'|'quarantined'; iataCode?: string; icaoCode?: string; scheduledService?: boolean; population?: number; featureCode?: string }`.
- `ReferenceSnapshotManifest`: `{ version: 1; snapshotId: string; generatedAt: string; sources: readonly { id: string; url: string; acquiredAt: string; sourcePublishedAt?: string; sha256: string; license: string; licenseUrl: string }[]; files: readonly { path: string; sha256: string; records: number; bytes: number }[] }`.
- `referenceRecordKey(record, snapshotId): string` binds source ID/version/type/jurisdiction/point; stable canonical ID stays independent of code/version.
- `referenceSelectionMatches(candidate: { canonicalPlaceId: string; providerId: string; country: string; placeType: string; coordinates: readonly [number,number] }, record: ReferencePlaceRecord, snapshotId: string): boolean` requires exact tuple/type/jurisdiction/key and reviewed crosswalk identity, not distance-only acceptance.
- `referenceCountrySeeds(code: string): readonly PlaceCatalogEntry[]`; `referenceKnownCodeKind(query: string): 'iata'|'metro'|undefined`; `referenceSeedRetired(id: string): boolean` use compact outputs. Avoid runtime import cycles by using structural/import-type catalogue types.

- [ ] Write fixture tests with CSV quoted names/newlines, TSV alternate names, reversed/invalid/missing points, duplicate IDs/codes, HK/PF/XK/unknown country, disallowed feature/airport types, closed airport and ambiguous catalogue crosswalk. Assert no false point, country or recommendation claim; byte-identical output for repeated identical inputs; source and generated digest checks.
- [ ] Run `node --test tests/place-reference-generator.test.mjs`; confirm real assertions fail before generator exists.
- [ ] Implement generator CLI: `node scripts/build-place-reference.mjs --airports <file> --settlements <file> --source-manifest <file> --previous <directory> --output <candidate-directory>`. Stream inputs; no network in generator. Existing catalogue point/type/country conflicts and published seed/crosswalk fact changes go to quarantine/diff; deletion removes new eligibility and retains historical seed facts. Fail output activation on unmapped eligible jurisdictions or budget overflow; atomic file publication only after success.
- [ ] After approved execution, acquire pinned public files outside repository, record exact terms/checksums, run generator into a candidate directory and inspect all jurisdiction/source exceptions and crosswalk conflicts. Do not invent expected global counts before reading source data. Activate reviewed outputs together; any essential mapping/source coverage uncertainty returns to review.
- [ ] Run fixture tests plus generator twice on acquired inputs; inspect digests and complete coverage/diff report. Commit as `feat(places): add versioned airport and settlement references` only after evidence passes.

## Task 2: Exact code-aware server search and compact catalogue binding

**Files:** create `place-reference.server.ts`, search/airport tests; modify `place-reference.ts`, `place-catalog.ts`, `place-intelligence.ts`, `place-autocomplete.ts`, autocomplete component and actual geocode API tests.

**Interfaces:**

- `searchReferencePlaces(query: string, context: PlaceResolutionContext, options?: { limit?: number }): readonly PlaceProviderCandidate[]`; default/max limit 12, exact eligible code first, then exact name/alias, prefix, stable identity tie-breaker. No runtime tourism score from population.
- `referencePlaceById(id: string): ReferencePlaceRecord|undefined`; `referenceCandidatesForQuery(...)` supplies the portable/manual seed choices without shipping server records.
- `canonicalPlaceSuggestionForId(id: string): CanonicalPlaceSuggestion|null` builds a suggestion from that exact catalogue ID instead of another same-name phrase match.
- Add optional `captureMode?: 'explicit-only'` to `PlaceCatalogEntry`; skip these generated seeds in `findCatalogMatches` prose capture, retain them in explicit query/by-ID lookup. Supplement missing country anchors from full jurisdiction registry; preserve existing IDs/type ambiguity.
- Add `matchedIcaoCode?: string` alongside existing IATA flag in provider/API/suggestion priority types. Both flags validated against the exact source record; no flags inferred from query format alone.

- [ ] Write real pinned-dataset tests spanning Americas/Europe/Africa/Asia/Oceania, including GUA/LHR/JFK/SYD/CDG/NRT/ICN, exact ICAO, lowercase/trim, unknown code, ordinary three-letter word, malformed/conflicting/duplicate codes, closed/non-scheduled gateways, NYC/SEL and USA country/code ambiguity. Expect typed explicit choices, exact source point and original source ID/version. Mark code exclusions according to actual audited records, not invented service assumptions.
- [ ] Add catalogue/pending-suggestion tests: a known IATA query cannot expose only its legacy city alias before local API lookup finishes; metro choices remain; no response automatically replaces a selection. Add same-name/country/type/point negatives for `referenceSelectionMatches`; generated seeds do not create prose stop matches. Run the new tests and observe failures against base.
- [ ] Implement lazy process-local code/name/prefix indexes and bounded candidate conversion. Preserve catalogue/crosswalk points and identity ownership; construct versioned provider evidence for new selection. Add compact known-code loading classification to existing autocomplete state. Retain metropolitan aliases and unchanged legacy saved/capture interpretation.
- [ ] Run `node --experimental-strip-types --test tests/place-reference-search.test.ts tests/place-reference-airport.test.ts tests/batch14-feedback-discovery-airport.test.ts tests/batch14-geocode-api.test.ts`; expect zero failures. Inspect actual JSON response and merged suggestion order, not helper-only success. Commit `feat(places): resolve airport codes through maintained references`.

## Task 3: Country coverage through actual Discovery selection

**Files:** modify `discovery-content.ts`, `discovery-projection.ts`, `discovery-confirmation.ts`, `discovery-steps.tsx`, compact reference/catalogue integration, i18n/credit component/story; create country-coverage tests.

**Interfaces:**

- `neutralCountryIdentityChoicesForMention(mention: DiscoveryMention): DiscoveryPlace[]` supplies only active compact seeds, exact country/type/point, `identityOnly: true`, browse-only, empty claims/tags/groups/stay/access evidence and no image.
- `canonicalPlaceSuggestionForId` from Task 2 governs direct-card confirmation. A reviewed ID missing its point can use only its reviewed source crosswalk/verified existing route identity, with displayed and confirmation geometry consistent.
- `MorroviaPlaceDataCredit({ sources, language })`, where `sources: readonly ('geonames'|'ourairports'|'openstreetmap')[]`, renders required source/license links in established text/link styling, no new control workflow.

- [ ] Promote the exact-base audit into tests looping all 250 jurisdiction identities and actual explicit selection, projection, final `DiscoverySteps` EN/ES render and confirmation. Require each eligible source jurisdiction to offer ≥1 directly confirmable verified settlement, or an independently reviewed `no-eligible-source-settlement` exception with source counts. Test 197 existing IDs preserved, HK/PF/Georgia, Singapore/Monaco/Bhutan/Fiji/Canada/China/Switzerland, US landmark-only/mixed/invalid-owned-row cases and no automatic shortlist. Confirm source points offline, no fabricated recommended IDs/stay/photos/nights; reviewed valid collections retain order/content. Observe expected base failures.
- [ ] Implement neutral fallback after reviewed projection/selection eligibility, preserving invalid-owned-row fail-closed behaviour. Compute visible slots from selectable city/town candidates so landmarks do not hide them. Use exact ID confirmation; prevent inactive seeds being new choices while retaining historical lookup. Do not widen landmark/base eligibility.
- [ ] Compose visible attribution with current Discovery/autocomplete surfaces and add Storybook neutral/full-country/empty/airport-vs-metro cases. Keep shared tokens, controls, modal layout and EN/ES content; no sidebars or new Builder primitives.
- [ ] Run `node --experimental-strip-types --test tests/place-reference-country-coverage.test.ts tests/discovery-projection.test.ts tests/discovery-confirmation.test.ts tests/discovery-commit.test.ts tests/discovery-localization.test.ts tests/batch14-feedback-discovery-airport.test.ts`; run `npm run audit:ui` and `npm run build-storybook` for shared UI changes. Commit `feat(discovery): offer verified neutral country destinations`.

## Task 4: Remove default Nominatim requests and prove offline recovery

**Files:** modify open-world/Photon providers, geocode/discover APIs, autocomplete mode parameter; create request-policy tests; extend relevant provider/geography callback regressions.

**Interfaces:**

- `createOpenWorldPlaceProvider(options)` gains `searchMode?: 'reference-only'|'reference-with-photon'`, default latter; existing custom `sources` fixtures remain supported. Local results are evaluated first; a sufficiently exact compatible identity returns without Photon. Otherwise one Photon call is allowed with existing ≤3,500 ms source budget and a real abort signal. Nearby Overpass behaviour stays separate.
- `/api/journey-geocode?mode=autocomplete&...` constructs reference-only search. Missing mode preserves explicit resolve compatibility; unknown mode is HTTP 400. All autocomplete callers explicitly set mode; server-only reference data never leaks via broad payloads.
- `verifyPhotonCountryAtPoint(point: readonly [number,number], requestedCountryCode: string, fetchImpl?: typeof fetch): Promise<boolean>` performs one 4,000 ms bounded reverse request to existing public Photon, resolves country by ISO via the existing registry, rejects conflicting/missing/invalid evidence, and never substitutes a settlement point. Used only by activity search's existing country verification.

- [ ] Write actual-handler fetch spies for typing prefixes, exact/unknown codes, explicit resolution, prompt default provider, country choice confirmation and activity reverse. Reject every `nominatim.openstreetmap.org` URL; expect zero external calls for autocomplete/local exact choices, ≤1 Photon search for unresolved explicit lookups, bounded reverse and no town-list enumeration. Test timeout abort, non-200/malformed/conflicting reverse evidence and fail-closed activity output. Observe failures before changing defaults.
- [ ] Implement mode routing, remove Nominatim default source, use reference first and bounded explicit Photon fallback/reverse. Keep standalone Nominatim adapter tests/capture fixture as compatibility evidence. The old actual default-API GUA replay asserts an OSM identity/point; after changing the default it must test the new reference record exactly. Preserve the frozen OSM airport assertion in an explicitly injected compatibility-provider API replay, retaining original point/identity and negative tags; keep both paths, label them accurately and do not weaken exact assertions to name-only. Migrate provider-specific default-source fixtures to explicit source injection while adding new real-default controls. No public Nominatim private-endpoint guess, new credential or new host activation.
- [ ] Run no-network local choices through actual selection/commit, plus outage/empty results and held responses after new point/ID/country/binding/budget/owner edits. Verify existing accepted geography and sibling budget positive controls. Run `node --experimental-strip-types --test tests/place-reference-request-policy.test.ts tests/open-world-place-resolver.test.ts tests/photon-place.test.ts tests/batch14-geography-callback.test.ts tests/batch14-geography-consumers.test.ts tests/batch14-feedback-discovery-airport.test.ts`. Commit `fix(places): keep autocomplete local and remove public Nominatim defaults`.

## Task 5: Preserve saved trips and qualify data/performance on exact candidate

**Files:** new audit script, budget/refresh tests and `docs/product/place-reference-data.md`; inspect release gate and relevant existing persistence/geography tests. No publication-script edits.

**Interfaces:** audit CLI `node scripts/audit-place-reference.mjs --output <directory>` emits exact SHA, manifest digests, full 250-jurisdiction production render/confirmation matrix, airport sample/negative matrix, request-policy counters, exception report, search latency/RSS/file bytes and build client module/delta evidence. Output clearly separates real dataset checks, synthetic faults, SSR and hosted tests.

- [ ] Write refresh controls using saved trips with repeated places/manual order/requested nights/commitments/authored itinerary/legacy unknown ending. Apply simulated rename/code-change/point-change/country-change/deletion snapshots to lookup layers; run actual hydrate/read/map/leg consumers and assert no mutation or silent rebind, no auto-save, published-seed changes quarantined and known historical facts retained. Verify only a newly accepted explicit geographic edit invalidates its adjacent legs/derived map/date dependencies. Preserve existing save/recovery behavior.
- [ ] Write budget tests over generated output/module graph and 1,000 representative warm queries. Include source-growth and malformed-snapshot failure keeping prior snapshot. Measure on documented Node/machine; failures block activation and return to review, not silent source truncation. Implement audit/report and run these tests.
- [ ] Run full new test suite, relevant place/Discovery/geography/persistence checks, `npm run typecheck`, `npm run build:check`, `npm run audit:ui`, `git diff --check`, shared Storybook build and existing nonpublishing `npm run release:gate` on exact candidate. Count disabled browser tests honestly. No new browser launch; report manual hosted requirements separately.
- [ ] Self-review that production owns exact ID/point validation and policy routing, not only tests; record source licence/update/operator instructions and actual remaining coverage exceptions. Commit `test(places): qualify global reference coverage and saved-trip safety`.
- [ ] Send exact candidate plus review pack to the existing independent reviewer through the parent handoff. Resolve findings before local GO. Staging publication remains held pending separate approval; after approved publication verify hosted SHA and run geography controls/A05/A06/A09 then the authoritative all20 pack, with dedicated checklist read and preserved QA drafts/accounts.

## Pre-execution handoff

This is one combined plan with five independently testable checkpoints, not three competing implementers. The parent arranges existing independent review. Native execution by this implementer begins only after that review accepts this concrete spec/plan or returns resolved amendments. No repeat generic product confirmation is required: Shaun already authorised the combined local scope after a sound plan. New paid/service/schema/security/publication decisions remain outside it.

Fast preference: tool inventory exposed no supported session/app speed control. No speed/model/reasoning setting was modified and Fast 1.5× is unverified. A user/app setting can enable it without changing this implementation design.

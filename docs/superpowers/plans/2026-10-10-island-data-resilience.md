# Island Data Resilience Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan natively, with an independent design review before significant edits and one complete-code review before staging qualification.

**Goal:** Remove live boundary availability from covered island base acceptance.

**Architecture:** A source-backed island subset extends the existing versioned place-reference data pattern. Share the strict geometry validator between its offline importer, checksummed server loader and retained uncovered-island live path; retain all existing trip APIs and writers.

**Tech Stack:** TypeScript, Node fs/crypto/zlib, existing Next geocode API and Node tests; no dependencies or DB migration.

**Spec:** `docs/superpowers/specs/2026-10-10-island-data-resilience-design.md`

## Global Constraints

- Base is exact staging9dabf1e; no Batch13 edits, MAIN or production promotion.
- No paid provider, credentials, scheduled external job, guessed polygons or administrative/proximity containment.
- Preserve settlement canonical/provider IDs, coordinates and original trip occurrence/order/nights/content.
- OSM ODbL/source IDs/URLs/query/digests/check dates and bounded coverage must survive generation and acceptance.
- Tests and actual hosted evidence remain distinct; existing writer/revision/owner guards remain authoritative.

## Review Focus

- An identity relation tagged island may actually contain political or maritime geometry: use independent physical coastline, never retag it.
- A country-matching town may lie on a sibling island or mainland: reject by strict physical membership.
- A source capture may be partial, tampered or contain open/crossed rings: reject without patching gaps.
- A Canary group can be only partly covered: preserve group intent and make no all-islands claim or invented order.
- Stale local or server evidence must not change a traveller's current trip or be labelled durable before ACK.

### Task1: Validated bundled geography and refresh

Files: shared `lib/easyt/physical-island-geometry.ts`; loader/index under `lib/easyt/island-geography*`; `scripts/build-island-geography.ts`; `data/place-reference/islands/`; tests `tests/island-geography.test.ts`; existing `openstreetmap-island-containment.server.ts`; data licensing and refresh README.

Interfaces: pure geometry compile/strict point-membership functions, loader returning a verified covered parent or absent coverage; importer consumes captured public source evidence and the accepted settlement snapshot, emits a candidate snapshot with manifest/checksums and exact derived base bindings.

- [ ] Write and run failing tests: offline Firá/Chaniá acceptance while fetch throws; corrupt snapshot rejection; Tenerife political source rejection; complete coastline proof; wrong-island/water/holes/edge rejection; failed import leaves accepted output intact. Expected RED from missing local snapshot behavior.
- [ ] Extract and reuse existing geometry checks without weakening limits. Implement source-backed exact identity/coastline compilation and loader; retain raw source digests and compressed captures. Import initial4 islands only when validation passes; otherwise record a source blocker.
- [ ] Generate exact-reference base bindings and versioned covered Canary member relationships; aliases come from captured identity sources. Add explicit candidate refresh/import command and ODbL attribution. Runtime cache is immutable and read-only.
- [ ] Focused tests pass; record data sizes/coverage/checksums and reviewer-relevant transformations. Commit task1 after green checks.

### Task2: API and acceptance integration

Files: `app/api/journey-geocode/route.ts`, `lib/easyt/destination-resolution.ts`, `app/journey/new/trip-builder.tsx`, small shared covered-parent metadata index, existing attribution usage; related physical-geocode/Builder tests.

Interfaces: keep `normalizePhysicalIslandBaseCandidates` and `verifyPhysicalIslandSuggestion` callers compatible; add covered-archipelago handling through the same response contract and immutable local dataset lookup.

- [ ] Write failing API/acceptance tests for verified Canary member acceptance, mainland/wrong-island rejection and no covered-boundary fetch. Retain actual exact point/provider assertions.
- [ ] Use local proof first for covered islands/groups; retain existing bounded live path for uncovered islands and existing non-covered/non-island behavior. Prevent nearby/guided/catalog paths from bypassing the covered-group check. Preserve all mutation/staleness/owner guards.
- [ ] Run focused and relevant reference/area/place/persistence suites; typecheck/build/check traced assets; local core/Transport as required. Record results and commit task2 after green checks.

### Task3: Independent review and exact hosted qualification

- [ ] Review complete source/data transformation/code/tests diff against spec independently; fix important findings with failing-first coverage and rerun affected suites.
- [ ] Only then use the already authorized non-force staging workflow, verify actual deployment SHA and existing CI.
- [ ] Re-run original A11 normal Chaniá7/Firá3 with preserved Athens3/source/order/IDs; actual verification503→retry, stale response, cloud503→retry and ACK/cloud/owned-cache/reload/Overview/Itinerary parity. Add bounded actual Tenerife and Canary group journeys/negative wrong-island checks, plus A12 integration as feasible.
- [ ] Preserve raw failing and passing evidence and independently assess final release eligibility. MAIN remains held until final authorized gate; do not infer20/20 from carried evidence.

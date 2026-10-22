# Current counter-free revision

See `staging-search-counter-free-final-20261022.md` and the current setup handoff. This supersedes token-counting and hosted-web statements in the historical reports below. The request has a 4096 serialized UTF-8-byte guard, no counting call, a conservative $0.2318448 per-dispatch ceiling, and notice version `public-place-alias-v3`.

# Current tool-free alias revision

The current implementation and staging setup are documented in `staging-search-handoff-20261022.md`. This heading supersedes the historical report below. The current path suggests names from existing model knowledge, uses no tools or fresh web research, rejects invented citations, counts immutable complete input (including schema/instructions) before generation, and retains deterministic provider identity/country/type verification. Exact notice is `public-place-alias-v2`. Durable adapters and ordinary metadata migration are prepared/applied as recorded in the metadata repair report; public policy/cache remain empty and activation off. Do not use obsolete web bounds, unwired-adapter claims, or custom GUC options below for setup.

## Historical integration report (superseded)

# Luna place research — local integration, 22 October 2026

**Release-control follow-up:** [Current default-off guards, POST transport, verification and remaining approvals](place-search-release-controls-20261022.md). The GET/query-string and capability behavior below describes the initial local patch and is superseded by that follow-up. No live activation occurred.

## Result and boundaries

Local integration uses `gpt-6-luna` only for public place-name research. No new paid requests, credentials, persistent configuration, migrations, external writes, commits, pushes or deployment occurred. P0 save/auth files remain outside this patch. The earlier one-case Terra/Luna evaluation is evidence for one held-out destination, not global reliability.

### Flow

1. Typing stays reference-only (`mode=autocomplete`), with zero external research.
2. First Place and Add Stop share the actual `completed-place-search.ts` helper. Enter performs deterministic completed search and exposes selectable candidates. A provider outage is unavailable, not a healthy miss.
3. After a healthy completed miss, a separate **Search public place names** action explicitly declares the input scope. The copy excludes addresses and personal details. The UI and server reject malformed/private-looking/freeform shape. A bare name needs an explicit comma-country or a geographic descriptor. This is deliberately conservative coverage and **not a PII detector or proof that arbitrary text is public**.
4. Server rechecks deterministic providers before any research. Any returned identity (including ambiguity or a country mismatch), outage, cancellation, import, parent-area or nearby context suppresses research. Only the submitted public name and explicitly typed country are sent; no saved trip, profile, account, nearby point or conversation.
5. Luna gets one web-search tool call maximum, 1,024 output tokens, Standard service, explicit caching without breakpoints, `store:false`, zero retries and an 18-second overall enrichment deadline. `store:false` does not establish zero provider retention. No other model task is changed.
6. A strict response parser accepts only completed, bounded alias/source suggestions. It rejects refusal, malformed/extra fields, coordinates/IDs, unsupported URLs, and source URLs absent from actual search-tool sources. Ambiguous/unresolved output causes no guessing.
7. At most two suggested names are re-queried through a fresh request-scoped deterministic provider. Acceptance requires exact **raw feature name**, a stable Photon OSM ID, finite provider coordinates, valid country, and supported raw OSM key/value/type/routability. Adapter-injected query aliases do not count as name proof. Lodging/business/transport replacements are excluded. Peaks remain selectable anchors requiring a base; no centroid-derived overnight settlement is invented.
8. Distinct identities remain choices; duplicate OSM identities deduplicate. The user selects; nothing is automatically added. Edits, parent-driven clear, selection, unmount, timeout and stale responses are guarded. Research-service failures/timeouts report unavailable rather than a successful no-match.

## Shared verified mappings

`reviewed-place-mapping-cache.ts` defines a read-only boundary for reviewed public entries: normalized query, explicit country context, route-stop intent, version, exact provider ID/key/value/type/country, source URLs, review date and expiry. **No durable adapter is wired; no mappings are automatically learned or persisted.** Existing Hirayu/Fanjingshan entries remain a two-entry reviewed pilot behind the reusable alias mechanism.

Before storage wiring: choose/approve infrastructure and bounded retention; accept only separately reviewed public aliases; validate key/version/review status/expiry; re-query exact provider identity and reject changed taxonomy/country. Provider validation establishes existence/type, not original-intent equivalence. Human/public-source review is required before shared publication. Never store raw trip text, user/session IDs, private inputs, model confidence or unreviewed model output. No new migrations were run.

## Verification and review

Final local check: **85 focused tests passed, zero failed**. `tsc --project tsconfig.typecheck.json --noEmit --incremental false`, `git diff --check`, and `node scripts/ui-convergence-audit.mjs --strict` passed. Test output: `/tmp/morrovia-search-final-tests.log`; untouched source baseline comparison: `/tmp/morrovia-search-baseline-policy.log`.

- Regression-first tests demonstrated absent route/action behavior, then passed after wiring.
- Independent review reproduced two further defects: a fast native-alias provider failure could be swallowed as healthy; scenic taxonomy checks needed exact OSM values. Tests failed before the fixes and passed afterward; useful original results remain preserved.
- Recorded held-out Luna output runs through the actual Photon adapter and returns `photon:N:2822838506`, `place=locality`, application `town`, Japan, directly routable. The English alias resolves; native query remains a healthy no-usable-match. This is frozen response replay, not a new live provider or AI call.
- API/helper/component contract executes the real client mapping and route, with controlled provider/research inputs. It covers explicit action, no typing research, ordinary match/ambiguity/outage suppression, complete/incomplete/refusal/malformed/ambiguous replies, stale editing, parent-driven clear, duplicate identity, exact country/type, timeout and request controls.
- Hooks/DOM scheduling and transports are substituted. This does **not** execute full Builder addStop/base-panel transitions in a browser or prove hydration/hosted behavior.
- Existing route test harnesses now stub Next's virtual `server-only` compile marker for standalone esbuild. No assertions were removed or weakened.
- Shared UI reuses existing autocomplete/EasyTButton styles/tokens. Added English/Spanish/mobile offline Storybook fixtures. UI convergence audit passes. Storybook/full app builds were not run under the explicit no-build/low-disk restriction.
- Four older Add Stop source-string assertions were previously reproduced on untouched base. An additional activity/discover test expects `{places:[]}` although the untouched HEAD handler also returns `assessment: {reason: identity_required,...}`; a Git-object-loader baseline comparison reproduced it. Neither unrelated behavior was changed or its assertions relaxed.

## Remaining release gates (not attempted / pending, not permission denials)

- **MANUAL HOSTED VERIFICATION REQUIRED:** keyboard/mobile/Spanish rendering, hydration, actual First Place/Add Stop selection, mountain/base panel and cancellation.
- Production privacy-ops review: OpenAI DPA, subprocessors, retention and UK transfer evidence; update public notice for place-name transfer. GET query names can appear in browser/proxy/server access logs. The explicit action/shape gate is not general PII prevention.
- Server-side abuse/rate/spending controls: the public research flag can be replayed outside the UI. Per-request token/tool limits do not bound aggregate production spending. Do not release this paid path until controls are approved and wired.
- Durable reviewed-cache adapter/review/publication flow is deferred, not fake in-memory persistence.
- Broader held-out public-place reliability evaluation still requires a separately approved paid batch. No further spend is authorized by this patch.

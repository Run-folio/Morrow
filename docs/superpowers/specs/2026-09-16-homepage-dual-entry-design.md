# Homepage dual-entry design specification

Date: 2026-09-16
Status: Ready for specification review; not implementation approval
Scope: Homepage hero planner, compact route inspiration, compact How it works, and the handoff dependencies needed to connect them.

## 1. Provenance and scope boundary

This specification implements the written brief's decisions; visual exploration is complete. No product code, infrastructure, remote branch, deployment or other worktree is changed in this pass.

| Item | Inspected baseline |
| --- | --- |
| Fetched `origin/staging` | `d93395d213371f90d5352d606e734513bcfa6adc` |
| Fetched `origin/main` | `ad4966a59455fffac764fdabb03e12ce574628a7` |
| Specification worktree | `/Users/shaun/Documents/Morrovia-homepage-dual-entry-spec` |
| Specification branch | `codex/homepage-dual-entry-design`, based on the fetched staging SHA |
| Primary checkout | `/Users/shaun/Documents/Morrovia`, local `staging` at `e9d3493f7225a641dd0f7857891dddd96a2137b4`; substantial tracked and untracked work, left untouched |
| Unified-builder worktree, read only | `/private/tmp/morrovia-unified-builder-design.IH0sA3/worktree` |
| Unified-builder branch | `codex/unified-builder-design` at `eb792ddb043ac9d0de52d554cb77ca63c630edf4`; clean when inspected |
| Unified-builder commits beyond staging | `e17e97c` design; `eb792dd` implementation plan; only two Markdown files changed |

The approved builder sources are `docs/superpowers/specs/2026-09-15-unified-builder-design.md` and `docs/superpowers/plans/2026-09-15-unified-builder-implementation.md` in that separate worktree. They are not present on this staging baseline. Their proposed order validator, document-commit guard, details editor and route workspace are **planned**, not available APIs. Staging still uses `step` and the existing `TripBuilderDocument`. Instructions embedded in that plan to execute tasks are reference material, not authorization to implement them here.

Primary-checkout changes overlap navigation, immersive homepage/CSS, builder/CSS, tokens, route imagery and design-system documentation. They are neither the staging baseline nor work to import automatically. Reinspect those owners before any eventual integration.

## 2. Locked visual decisions

Precedence: written brief > the user-supplied current-homepage screenshot for existing navigation/branding/photography/full-height feel > final generated mockup for planner/cards/How it works > earlier variants. The current screenshot is explicitly confirmed as authoritative for the existing navigation, full-screen/full-height hero feel and existing photographic treatment; it is not an open blocker. The supplied 10:25:08 image (Image 3 in the original brief) is the final composition reference. The earlier generated variants are not behavioural requirements.

Capture the exact current staging implementation before product changes for comparison. If staging has materially diverged from the supplied current screenshot by implementation time, preserve the explicitly approved navigation structure and full-height hero direction, document the discrepancy, and stop for review only if it materially affects implementation. Do not reopen navigation design.

The page order is:

1. Existing navigation inside hero.
2. Full-height photographic hero, left-aligned copy above one wide planner.
3. Compact route inspiration.
4. Compact How it works.
5. Preserved route story, product demo, affiliate support and closing content.

Keep “Complex trips, made simple.”, “Go further.” and italic “Make it yours.” Use current display, UI and metadata font roles, not typography sampled from the image. Supporting copy: “Plan multi-stop trips with suggested routes, places to stay and things to do. Then make the plan your own.” This avoids implying verified availability or guaranteeing realistic/handpicked results before those claims are evidenced. No Describe my trip BETA badge, video/play control, popular-ideas chips or generic Multi-country chip. Existing unrelated beta messaging is outside scope.

Reuse `EasyTNavigation current="home" landing logoTone="light" deferPrefetch`. Preserve logo dimensions, left logo/right desktop actions, + New trip, Routes, My Trips, divider, How it works, Account, language, link targets, auth states, preservation behaviour and compact mobile navigation. Preserve navigation CSS and the existing immersive transparency/divider overrides. Do not restyle shared navigation globally.

Current `.hero` has `min-height: max(900px,100svh)` and `overflow: clip`; `.heroBody` is a two-column grid and `.planner` is capped at 560px. Replace the composition with one column: copy then wide planner, on the existing 92% desktop hero gutter. Use `min-height: 100svh` on the **whole hero**, including navigation and footer cue, with automatic content growth. Do not add another viewport-height body or retain a compulsory 900px minimum. Headline scales/wraps to leave the collapsed planner visible on normal desktop viewports. Preserve photographic breathing room with flexible space, not fixed offsets.

Move any necessary photographic clipping onto the decorative image layer, leaving controls and errors unclipped. Keep the canonical date-picker portal and focus behaviour. Remove obsolete small-card descendant overrides that reposition every dialog or force form children into the old card. Retain hero credit and `#routes` cue with space reserved for both. At short heights, mobile, zoom and expanded controls, allow document scrolling; no fixed planner height or nested form scroller.

Preserve `heroFor`, reviewed first-party photo checks, Cloudinary loader, responsive variants, focal positions, failure tracking, attributed fallback and `MorroviaPhotoCredit`. Do not replace founder photographs or use generated mockups as image assets. Initial hero selection remains server-owned/randomized through the current selector; do not hardcode Fuji. Card browsing never changes that selection. Empty eligible-route data must not crash `routes[index]`: keep a safe hero fallback and planner, omit unavailable cards, retain catalogue/help access.

## 3. Current ownership and dependencies

All paths in this table are relative to the staging worktree above.

| Concern | Actual owner and current behaviour |
| --- | --- |
| Public root | `app/page.tsx` imports Journey CSS and renders `components/easyt/morrovia-homepage.tsx`; that server component serializes eligible routes and initial index into `ImmersiveHome`. Root metadata/legacy redirect are outside redesign. |
| Hero/composition | `app/journey/home/immersive/immersive-home.tsx`, `immersive.module.css`; owns selected route, photography, reduced motion, navigation placement, `HomeTripStarter`, `RouteChapters` children and closing. |
| Capture orchestration | `app/journey/home/home-trip-starter.tsx`; local prompt/shared inputs/profile, capture request gate, successful localStorage handoff and router navigation. Currently does not restore an unsubmitted homepage draft. |
| Shared capture | `components/easyt/morrovia-trip-capture.tsx` and CSS; a full form with text/voice, validation, progressive details, dates, travellers, interests, profile presentation, submit and AI disclosure. Homepage progressive mode currently hides its general AI disclosure. |
| Place selection | `components/easyt/canonical-place-autocomplete.tsx`, `lib/easyt/place-autocomplete.ts`, `place-intelligence.ts`, `/api/journey-geocode`; catalogue/provider suggestions, canonical identity, type/routability, keyboard selection, failure/retry. Some internal labels are English-only. |
| Shared controls | `components/easyt/easyt-controls.tsx`; `EasyTButton`, `EasyTLinkButton`, fields, textarea and segmented selection. `morrovia-date-picker.tsx` owns range calendar/portal, keyboard, Escape and focus restoration; `morrovia-quantity-selector.tsx` owns traveller controls. |
| Voice/transparency | `VoiceTripBrief`, `lib/easyt/speech-recognition.ts` and `MorroviaContextualDisclosure` in `morrovia-feedback.tsx`; preserve transcript append and existing permission/error semantics. |
| Endpoints | `JourneyEndpointsEditor`, `JourneyEndSelection`/`JourneyEndpointPlace` in `lib/easyt/trip.ts`, `journey-endpoints.ts`; distinct from overnight destinations. |
| Preferences | `trip-interest.ts`: food, culture, nature, cities, beach, hiking; `travel-profile.ts` and `private-browser-context.ts`: account-scoped profile/defaults. |
| Capture/handoff | `journey-capture-client.ts` calls canonical capture API; `home-trip-handoff.ts` owns `HomeTripDraft`, `createHomeTripDraft`, route seeding/enrichment and durable cleanup. |
| Builder | `app/journey/new/trip-builder.tsx` / `TripBuilderDocument`: hydration, clarification, stops, dates, preferences, validation, derivation, recovery and save/build. `trip.ts` materializes `EasyTTrip`; `storage.ts`, repository and existing CAS/recovery remain persistence owners. No database migration is indicated. |
| Route data | `immersive-homepage-routes.ts` is a presentation projection over `homepage-routes.ts`, `public-route.ts`, `route-catalog.ts`; eligibility includes usable canonical detail/handoff. Imagery comes from route editorial/photo owners and reviewed publication evidence. |
| Route detail/template | `app/journey/routes/[slug]/route-detail-view.tsx`, `route-plan-link.tsx`, `public-route-handoff.ts`. `RoutePlanLink` currently calls `clearActiveTrip()` then writes the shared handoff key; this bypasses shared New Trip preservation. Current visible calls say “Start with this route” (and “Shape the nights in Builder”); the brief’s “Use this route” refers to that explicit template-start action, not card browsing. |
| Lower page | `RouteChapters` owns the large `#routes` introduction, `#route-story`, route changes and render-prop children. `ProductDemo` owns `#product`; `AffiliateChapter` owns `#booking-support`; `ClosingChapter` owns `#closing`. |
| Tour/language | Shared nav mounts `EasyTProductTour`; `PRODUCT_TOUR_OPEN_EVENT` is `easyt-open-product-tour`. `useHomepageLanguage`, storage language and `easyt-language-change` own EN/ES changes. |

Design reuse follows `docs/design-system.md`, production controls, adjacent stories, then `journey-design.css`. Use paper/ink/action/line/control-radius/editorial-radius tokens and current spacing rhythm; there is no global spacing scale to invent. Homepage-wide planner and compact editorial card composition are page-specific patterns. They do not warrant new generic field/card/header primitives.

## 4. Proposed component boundaries

- Keep `HomeTripStarter` as the homepage input controller. It owns both mode buffers, shared values, explicitness, request revision and restoration, but no `EasyTTrip` or builder document draft.
- Extend `MorroviaTripCapture` with an opt-in controlled homepage composition. Extract its prompt/voice/AI and interest subcompositions within that shared owner so one form can arrange them differently without nested forms or duplicated capture behaviour. Existing direct-builder usage retains its current API/appearance until the builder task changes it. The homepage variant receives active mode and controlled destination-entry slot/callbacks; it must not infer intent from visual children.
- Extract a controlled homepage destination-list editor next to `HomeTripStarter` if needed for stories. It receives ordered canonical input occurrences and add/remove/move callbacks. It owns only focus/disclosure state. Reuse the eventual pure builder order validator where applicable; do not import the full builder or recreate route optimisation/nights/maps.
- Add `HomepageRouteInspiration` next to immersive components, receiving the existing eligible `ImmersiveRoute[]`. One compact card implementation for homepage/stories; normal canonical links and reviewed image/credit components.
- Add `HomepageHowItWorks` there, using shared controls and existing Lucide icons; dispatch the existing tour event. No second tour instance.
- Narrow `RouteChapters` composition as described below; keep its route story and child contract. No independent selected-route state in the new card list.

Target story families: existing `Morrovia/05 Product Patterns/Homepage trip starter`, `Trip capture`, `Routes`, `Morrovia/04 Structure/Global navigation`, controls/date/quantity, confirmation/recovery and loading. Extend the actual shared capture stories as well as homepage stories. The current homepage-story 720px wrapper cannot validate the wide hero: add a full composition story rendering production owners. Do not build a story-only mockup.

## 5. Input ownership and precedence

### Input state

Keep one ordered destination-intention list for Plan with stops. Its entries pair a newly allocated stable **occurrence ID** with the existing canonical suggestion/mention data. Selection of the same canonical place twice creates two IDs. Editing a selected entry into unresolved text invalidates its selection without changing that occurrence ID; resolving it updates only that entry. Removing/reordering never renames other IDs. Never pass selected IDs as `excludeCanonicalIds`, which would prohibit repeated visits.

Classify entries using existing canonical `placeType` and `routability`: direct destination, planning area, anchor needing a nearby base, or unresolved. Country Japan is an intention requiring bases, not a night-bearing Tokyo stop. Keep full selected identity, coordinates, country/region, bounds and provenance where supplied. Typed text is not canonical simply because it is nonempty.

The first field edits the first entry, not an independent destination or departure field. Add stop appends to this same list. With five specific entries show “5 stops · Edit”; opening shows all five, including the first. For mixed entries report counts separately, for example “2 stops · 1 area · Edit”; never count an area as an overnight stop. Editor provides named rows and accessible Move earlier/Move later actions, Add, Remove, and a close action. No drag dependency is required. Thumbnails are optional; initial implementation may omit them.

Describe my trip has its own editable text buffer and voice append. Preserve the 600-character capture limit and localized validation. Both modes share dates/duration intent, budget, interests, travellers and endpoints. Tab switching changes only active mode, preserves both buffers, shared values and provenance, and triggers no request or conversion. Hide inactive controls from focus; closing a mode panel must stop/ignore any late voice transcript for that inactive panel. No silent text-to-stops or stops-to-text conversion.

### Value source contract

For shared inputs retain value plus whether it is untouched, explicitly selected or explicitly cleared. Continue existing `datesExplicit`, `travellersExplicit`, `interestsExplicit` compatibility; add explicit budget/date-clear/endpoint-source semantics at the handoff owner rather than guessing from truthiness.

| Input | Resolution at submission |
| --- | --- |
| Destinations | Active Plan with stops buffer only, or active Describe capture only. Never merge inactive destinations or inactive prompt geography. |
| Dates | Explicit complete range wins; explicit clear suppresses captured calendar dates and restores flexible timing. Otherwise use active capture dates if present. Untouched UI must read “Add dates”, not assert today/+6 days as chosen travel dates. |
| Duration | Explicit range determines duration; otherwise preserve active capture duration. Clearing dates retains independent duration intent. No duration alone rejects a viable 1–12 week trip. |
| Interests | Explicit selection wins, including `[]` as clear; otherwise active capture interests, then current-owner profile defaults, then empty. |
| Budget | Explicit value wins; explicit clear suppresses prompt/profile budget preference; otherwise active capture budget, then current-owner profile, then the existing operational fallback. |
| Travellers | Explicit count, else active capture count, else existing initial count of two; preserve provenance, do not claim two was chosen. Existing range remains 1–12. |
| Origin/end | Explicit shared endpoint selection or explicit clearing wins over active capture; otherwise active capture endpoint context. No endpoint creates/removes a separately selected overnight occurrence. |

Late profile/auth hydration can populate only untouched values for the same owner, using current state rather than a stale closure. Collapsing Personalize changes no values. Switching account must invalidate pending requests and stop displaying the previous owner's private draft/profile; no automatic cross-account merge.

### Personalize and secondary details

Closed initially. One compact secondary row: Budget / Mid-range / Luxury mapped to `value` / `mid` / `high`; existing interest buttons with `aria-pressed`. Six supported interests fit by wrapping; add More interests only if necessary, preserving all selections. No repeated heading, explanation paragraph, large cards or second primary action. No mandatory Mid-range selection. Provide a small clear-budget action when selected so explicit clearing is possible.

Keep travellers and `JourneyEndpointsEditor` in a compact existing-style Add trip details disclosure, separate from the Personalize row, available in both modes. They also remain editable in the builder. This avoids dropping existing capabilities or forcing them into the main row.

### Budget wiring and limitation

Today `HomeTripDraft`/`createHomeTripDraft` do not carry a budget override. Builder has local `budget`, profile hydration, `effectiveIntent.preferences.budgetSensitivity`, and `effectiveStructuredBrief`; `tripFromBuilder` writes `brief.budgetBand`. `trip-copilot.ts` reads structured budget and effective trip budget into AI context. The inspected recommendation/accommodation modules and journey-discover request do not establish a general budget-based ranking effect. Do not promise cheapest results, priced availability or automatic route changes.

Extend the existing handoff with optional `budget` plus source/explicit-clear metadata. Apply it after profile hydration; keep builder local budget, intent and structured budget in sync independently of whether a budget disclosure is open. `mergeStructuredTripBrief` currently retains `base.budget` when no input budget is provided, so explicit clear needs a deliberate removal path for budget evidence as well. A required legacy `BudgetBand` may retain the existing operational fallback, but source metadata must identify it as fallback rather than a user preference. Copilot context must honor clear/source semantics too.

Acceptance requires an integration assertion that each selected band survives hydration/recovery and reaches the actual AI planning context, and that explicit clear removes preference evidence. If initial stay/activity ranking is claimed to use budget, that consumer must first be identified and tested or wired in its existing owner; persisting a band or repeating existing UI claims is insufficient evidence. Broader recommendation-ranking redesign is outside this homepage scope.

## 6. Canonical submission and durability contract

Extend `HomeTripDraft` in `lib/easyt/home-trip-handoff.ts` backward-compatibly; do not create a second builder model. Proposed additional metadata: schema version, entry mode, owner scope, input revision, budget/source flags, and a handoff receipt linking that submission to the resulting canonical trip ID. Keep existing legacy/template readers. Storage records must be validated before hydration, not accepted by type cast alone. Carry owner scope inside the envelope as well as the snapshot key; legacy unscoped handoffs need the existing compatibility path, not automatic reassignment to a newly signed-in owner.

For structured selection, use existing `destinations`/`HandoffRouteStop` for direct occurrences and `StructuredTripBrief`/`ResolvedPlaceMention` for areas, anchors, required order and explicit selections. Materialize them deterministically from selected canonical data, using existing structured-brief helpers. Every direct destination uses its input occurrence ID as the eventual stop ID; preserve an explicit mapping to mention IDs for later enrichment. Set the existing entered-order decision (`decisionSelections.routeOrder = "entered"`) for an explicitly ordered list, without inventing schedule locks; optimisation stays advisory in the builder. Do not send selected destinations to `composeJourneyCaptureBrief` for name re-interpretation. That existing manual-builder adapter is text-based and does not meet this identity contract.

For Describe mode, retain `requestJourneyCapture` and `createHomeTripDraft`, then apply explicit shared overrides. Capture parsing/resolution remains the canonical service. For areas/anchors in either mode, hand off the appropriate canonical planning-area/nearby-base intent to existing builder clarification; do not guess a city, silently discard an area or implement a second routing engine. Mixed known stops and areas preserve known order while clarification proposes bases for the appropriate area. Missing coordinates preserve an occurrence and its pending verification state; they do not authorize inventing geometry.

Submission sequence:

1. Validate active input and shared fields. Snapshot mode, owner and revision. Empty stops, whitespace-only prompt, invalid/partial dates or invalid travellers focus the relevant field and do not navigate. Unselected ambiguous text must be resolved/confirmed with canonical autocomplete or retained as a visible clarification need, never silently committed as a specific stop.
2. Acquire one synchronous in-flight latch as well as the existing latest-request gate. Disable duplicate submit. Any input/mode/owner change invalidates the old revision and cancels its request. No late response can write storage or navigate.
3. Resolve only what is required to form a trustworthy handoff. Structured selections do not require a language-model round trip. Capture/network/storage errors retain all input, announce localized actionable feedback and permit retry.
4. Prepare and verify preservation of any existing canonical current trip and any previous unconsumed intake before starting a separate document. Persist the input snapshot and stage the validated new handoff while retaining the prior handoff until success; do not clear a current pointer before these fallible writes succeed. If preparation fails, leave current pointers and input intact and expose recovery.
5. Recheck request revision and owner, then call the existing owner-aware New Trip preservation boundary. If it rejects, restore the previous handoff slot (the new input snapshot remains available), do not navigate, and surface failure. Only after success publish the matching handoff receipt and navigate to `/journey/new?homeDraft=1`; any receipt-write failure must retain recovery/intake and avoid duplicate creation. This ordering must be verified with injected storage failures at each boundary. Recheck current request and owner immediately before writing/navigation. Use a handoff-specific URL discriminator if needed to prevent an unrelated tab's handoff consuming the global slot; never put prompt/private inputs in the URL.
6. Builder hydrates into `TripBuilderDocument` through its existing canonical path. Known route skeleton leads to the eventual unified workspace; area-only/ambiguous input stays in existing clarification/capture until a real skeleton exists. Do not show an empty route map/table.
7. Cleanup happens only after the exact handoff is durably represented in the canonical recovery document. Existing `homeTripDraftIsDurable` requires a nonempty brief and checks a set of stop names; that cannot prove structured blank-prompt durability, order or repeated visits. Extend it for versioned structured handoffs to compare ordered occurrence IDs and canonical identities, relevant shared values, endpoint roles and source revision. Never delete a newer handoff. Existing textual/template compatibility remains tested.

Repeated submit, back/forward or reload of the same accepted handoff must resume its recorded trip ID, not create another trip. This receipt is intake bookkeeping, not a second trip store. Builder remains the only owner of generated routes, locks, nights, mutations, recovery, CAS and build readiness. Account switching during capture or hydration rejects the old owner request; guest capture remains usable without sign-in and canonical guest-to-account promotion remains the existing mechanism.

### Homepage restoration and template protection

The current handoff key stores a submission, not unsubmitted editing state. Add a small versioned, owner-scoped **homepage input snapshot** under the existing private-browser-context naming pattern, with both buffers, shared input/source flags, revision and optional handoff receipt. Its serializer/validator belongs alongside `home-trip-handoff.ts`; it is not `TripBuilderDetailsDraft`, never contains a generated `EasyTTrip`, and never writes cloud/recovery state. Retain it when the canonical handoff is consumed so route browsing/back/reload can restore input. Save on edits and before navigation; storage failure gets truthful feedback and prevents a navigation that would lose the only copy. Clear only through explicit start-over/discard or existing privacy/account cleanup policy, not card clicks. Owner scope must apply even though the legacy handoff key itself is global.

After a successful handoff, returning home restores the intake snapshot, not a reconstruction of later builder edits. If submitted again unchanged, resume the associated trip without duplicate creation. A changed restored snapshot must never overwrite an existing canonical trip. Prefer the existing owner-aware New Trip preservation/recovery boundary and existing UX to preserve current work before creating a new trip and maintain reliable recovery. A receipt or other small bookkeeping mechanism may support idempotency only where technically necessary; it must not automatically introduce new homepage conflict-resolution UI. If implementation proves new user-facing conflict UX is genuinely required, stop and request separate design approval. No automatic two-way synchronization.

Cards are ordinary links to `route.href`, and View all routes links to `/journey/discover`. They neither write handoffs nor call route selection callbacks. Route Detail's explicit Use this route action retains `routePlannerPayload` and its `inspire` fallback, but must use the owner-aware preservation boundary in place of direct `clearActiveTrip`. `beginNewTripNavigation` dispatches a cancelable event and clears only the current pointer; on Route Detail the builder is not mounted to answer that event. Verify existing cached/recovery durability before clearing there. Preserve an unconsumed homepage submission/input snapshot before replacing the singleton handoff. Storage failure must not be swallowed into navigation when that would abandon unsaved work. Modified-click/new-tab template activation needs tested semantics; no mutation on a browsing-only click, and the fallback must not let a stale global draft override the requested template.

These are necessary integration gaps, not permission to replace `storage.ts`/repository/CAS with a new persistence system.

## 7. Route cards, How it works and retained lower page

Route section heading: “Not sure where to go?” Supporting text: “Start with one of these routes, then make it yours.” Link: “View all routes”. Use the existing seven configured keys in order: `japan-south-korea`, `iceland-ring-road`, `balkans-overland`, `vietnam-cambodia`, `namibia-self-drive`, `peru-bolivia`, `mexico-guatemala`. Display canonical published titles, not `RouteChapters`' editorial split-title map. Duration is canonical `dayRange` (single value only when min equals max); stop count is the complete canonical detail list, not `homepageRouteStopIndexes`' photo subset. No mockup metadata or parallel catalogue. If publication removes a route, omit it safely rather than bypass eligibility to maintain seven.

Compact landscape photograph, short title, one metadata line. Reuse reviewed route imagery and resilient fallback, with credits accessible without nesting links inside a full-card link. Use a dedicated photo-credit sibling where needed. Reuse existing neutral card/control tokens. Cards have a minimum readable width of 180px; use a responsive grid that fits as many as the container permits, wrapping to fewer columns and a single column at 320px. Seven across is allowed only when each card retains that width plus existing gaps. No page overflow or microscopic text to force seven. This deliberate wrapping arrangement avoids adding carousel controls.

How it works is an ordered three-step list with existing Lucide compass/route/luggage-family icons:

1. **Tell us where.** Choose destinations or describe the trip you have in mind.
2. **We build your plan.** Get a suggested route to review, with places and travel between stops.
3. **Make it yours.** Refine your route, dates and details as your plans take shape.

Use equivalent concise Spanish copy. Desktop is a compact row; narrow layouts stack without truncation. “See how it works” is a shared button dispatching `PRODUCT_TOUR_OPEN_EVENT`; use an arrow/help icon, no play triangle. The existing tour supports Escape/focus management; verify focus returns to this trigger rather than assuming the nav trigger.

Smallest lower-page change: replace `RouteChapters`' entire initial `section#routes` (collection intro, selected-route heading/navigation, tall stop-photo spread, minimum-night metadata and route footer) with the new compact cards. This is the duplicate featured-route introduction. Add How it works immediately after cards. Retain `section#route-story`, alternative journey controls, route story imagery/credits and existing template action, followed by the unchanged render-prop `ProductDemo` and `AffiliateChapter`, then `ClosingChapter`. Remove the obsolete scroll/pinning effect and CSS only for the removed introduction.

The retained Route Story continues using the existing homepage-selected route/index owned by `ImmersiveHome` and passed to `RouteChapters`. It is one deeper editorial chapter, not a second seven-card introduction. Its existing alternative-route controls and ProductDemo sample selectors still change that shared route through the existing callback. Compact Inspire Me card clicks are normal Route Detail links: clicks, focus and hover never change the lower story or homepage-selected index, recreate an in-page route selector, or couple the cards to `RouteChapters`. Keep scroll correction/focus behaviour for `route-story` and `product`, and update the callback's default anchor if necessary. Keep exactly one each of `hero`, `start-building`, `routes`, `route-story`, `product`, `booking-support`, `closing`; add one `how-it-works`. Preserve footer and legal/photo credits outside these sections. Removing the route story, product demo, affiliate content, closing section or redesigning the global tour requires separate scope approval; none is proposed here.

## 8. Integration phases and dependency order

### A. Reviewable visual components and Storybook states

After this specification is approved, detailed planning may define the capture composition, controlled list, cards, How it works and hero CSS. Build deterministic fixture states with production components, no real submission or persistence. Reuse navigation unchanged. Record the current staging screenshot before changes. A can proceed independently of unified-builder implementation, but the homepage must not ship an apparently functional disconnected planner.

Deliver: full hero/card/How-it-works stories; empty/five-stop, both modes, Personalize open/closed, long/repeated names, dates/editor open, loading/error, guest/profile, EN/ES, reduced-motion and responsive states. Build Storybook and review pixels before declaring A visually accepted. Verify that the transition from compact route cards and How it works into the retained Route Story does not misleadingly imply that the story belongs to a clicked or focused card. If the retained story feels materially duplicative or disconnected, stop for design review; do not remove or redesign it without approval.

### B. Connected input behaviour and canonical handoff

Agree the shared schema first: occurrence-to-mention mapping, explicitness/clearing, budget propagation, intake snapshot, receipt, owner scoping and durable cleanup. Extend `home-trip-handoff.ts` and its existing readers/tests, then connect controlled inputs. Reconcile the unified-builder Task 2 hydration/empty-state work and Task 3 atomic details work in the same integration sequence. The planned `TripBuilderDetailsDraft` stays builder-local; do not fork it for the homepage. The planned `trip-builder-order.ts` may provide pure ID permutation validation; homepage has no locks/night-allocation UI.

Resolve preservation on homepage submit and `RoutePlanLink` before enabling live handoff. Keep direct-builder capture parity and template compatibility. Known destinations bypass textual re-interpretation; areas/anchors reuse clarification. Budget must reach a verified consumer with source precedence, not merely appear selected.

Primary overlapping files: `trip-builder.tsx`, its layout tests/stories, shared capture/CSS/stories, `home-trip-handoff.ts`, endpoint tests and storage-boundary tests. Unified-builder route map/drag changes are owned by that task, not this one. Its instruction to preserve handoff hydration “exactly as today” must be reconciled with these explicit additions; blindly freezing today's name-based durability would violate this brief.

### C. Local integration and regression verification

Integrate on a newly verified staging-based isolated candidate after the unified-builder dependency is available or its agreed hydration boundary is coordinated. Re-fetch/re-record baseline then; do not apply an old plan to a changed tree silently. Compose the live hero/cards/How-it-works with preserved lower sections. Exercise real homepage-to-builder and Route Detail-to-builder flows, recovery and account cases. Complete visual/behaviour acceptance on the exact candidate. No push, merge or deployment is authorized by these phases.

## 9. Acceptance and evidence

### Behavioural criteria

- One unchanged shared nav, one hero planner form, one primary submit; Plan with stops initially active.
- Full-height desktop hero including header, with collapsed planner discoverable; content grows at short heights/mobile/zoom; no field, error, popover, credit or primary action clipped.
- First stop is part of the five-stop total/list. Stable IDs survive add/remove/reorder, repeated Tokyo → Kyoto → Tokyo, hydration and recovery. Endpoints with the same place name do not consume an overnight occurrence.
- Mode switches preserve both inputs and shared values, cause no capture, and submit only the active geography/text. Dates and Personalize remain available in both modes.
- Country/region/anchor input remains distinct from route stops and reaches existing clarification. Invalid/ambiguous input, zero results and failed geocoding are actionable without lost intent.
- Explicit clearing survives late profiles, parsing, mode changes, reload and builder hydration; dates aren't fixed by untouched defaults. Each budget band reaches the verified AI context; no unsupported ranking claim.
- Latest request wins; double-click, Enter repeats, edit-during-request, switching account, stale responses and storage errors cannot create duplicate trips or erase work.
- Card/catalogue browsing preserves draft and goes to canonical destinations without generation or hero change. Template start preserves existing trip and unsubmitted intake; stale global handoff cannot hijack a route template.
- Returning home/restoring/re-submitting prevents stale overwrites and accidental duplicates through existing preservation/recovery UX and minimal idempotency bookkeeping, without introducing a new homepage conflict choice. Guests can plan; signed-in profile defaults never overwrite edits or leak across owners.
- Tour button opens the existing tour and restores focus; no fake media. All lower content/anchors listed above survives, except the deliberately replaced introduction.

### Keyboard, language and responsive criteria

Use proper tablist/tab/tabpanel semantics with arrow/Home/End selection and associated panel IDs, without generating on activation. Labels remain visible; active/inactive fields have appropriate focusability. Autocomplete Enter selects its option before form submission. Reorder announces occurrence and position; removal focuses a neighbouring row or Add stop. Escape closes only the active overlay/disclosure and restores its trigger. Preserve calendar focus trap and visible token-based focus. Error messages associate with fields; loading and results announce without stealing focus. No colour-only state or thumbnail-only stop name.

EN/ES includes new copy, counts/plurals, validation, stop actions, budget, date formats and autocomplete type/retry/searching strings; current English-only internals need a compatible locale extension. Test Spanish long labels. Reduced motion disables hero depth and nonessential transitions. Keep 44px interaction targets where current component contracts require them. Reflow at 200% and 400% browser zoom with keyboard-accessible actions and no horizontal page scroll.

| Viewport | Required visual evidence |
| --- | --- |
| 1920 × 1080 | Full hero, wide collapsed planner, real photo focal/credit treatment; cards only seven across when width permits |
| 1440 × 900 | Navigation before/after equivalence; headline above planner; cards/How-it-works and retained chapter transition |
| 1366 × 768 | No imposed 900px minimum; open Personalize/list/calendar can grow/scroll; submit reachable |
| 768 × 1024 | Existing compact nav; deliberate planner reflow and readable cards |
| 390 × 844 | Both modes, details/editor/calendar open, focus/error states and document scroll |
| 320px width | No page overflow, long EN/ES names and all actions visible/reachable |
| 200%/400% zoom | Reflow, overlays within viewport, keyboard focus and submit never clipped |

Capture default and representative expanded/error states at each size; combine Storybook screenshots with real connected-page screenshots. Compare shared navigation against the unchanged baseline, controls against their canonical stories, and composition against Image 3 subject to the written corrections. A successful build or source-regex assertion is not visual acceptance.

### Focused automated checks for future implementation

Extend existing suites rather than replacing their invariants: `journey-capture-entry-parity.test.ts`, `journey-capture-validation.test.ts`, `journey-capture-corpus.test.ts`, `journey-endpoints.test.ts`, `trip-interests.test.ts`, `travel-profile-interests.test.ts`, `public-route-handoff.test.ts`, `homepage-routes.test.ts`, `homepage-canonical-route.test.ts`, `immersive-homepage.test.ts`, `navigation-information-architecture.test.ts`, `trip-builder-layout.test.ts`, `builder-persistence-acceptance.test.ts`, `state-preservation-torture.test.ts` and route imagery/publication tests. Update assertions that intentionally describe the removed tall introduction; retain behavioural and publication protections.

Add focused pure tests for dual-mode projection, occurrence identity/mention mapping, clear/source precedence, intake snapshot validation/owner isolation, request revision and handoff receipt/durable cleanup. Add rendered interactions for tabs, list editor, shared dates, keyboard and focus; source-string tests alone cannot establish these behaviours. Exercise actual connected handoff with intercepted deterministic capture/geocode fixtures and inspect the resulting canonical trip, then a local end-to-end smoke with available real services. Record unavailable service evidence as incomplete, never a pass.

Future candidate gates: `npm run typecheck`, `npm run build:check`, `npm run build-storybook`, `npm run audit:ui` (strict), `npm run test:builder-gate`, the targeted Node test suites and `git diff --check`. Check the installed Next version before using legacy `npm run lint` (`next lint`); do not treat a missing lint command as clean. No hosted release/deployment check is necessary for this spec pass.

## 10. Actual blockers, decisions and self-review

No additional visual direction is needed to finish this specification. The following gate connected implementation/acceptance:

1. **Unified builder is planned only.** Its hydration/empty-state and atomic editing interfaces must be implemented/coordinated before final connected acceptance. Phase A is independent.
2. **Structured handoff and durability are incomplete.** Need occurrence-safe structured seeding, area/anchor projection, explicit-clear semantics and receipt/owner validation. Today's name-set and nonempty-brief check is insufficient.
3. **Unsubmitted input restoration and template preservation are absent/incomplete.** The global handoff key is not an editing snapshot; RoutePlanLink bypasses preservation. Tests must close these gaps before live submission is enabled.
4. **Budget influence is limited in the inspected code.** Verified trip/AI-context path is the minimum connected contract; broad recommendation ranking influence is not established and must not be claimed. Explicit-clear metadata requires coordinated downstream handling.

Self-review completed for scope, owner accuracy, explicitness, repeated occurrences, endpoint distinction, inactive-mode exclusion, preservation, lower-page retention, dependency order and testability. Proposed APIs are labelled as proposed; no planned builder helpers are represented as shipped. No UI/product code or schema migration is part of this commit. Validation of this pass is the specification diff, path/reference inspection and whitespace check; runtime, Storybook and visual acceptance remain future implementation work. Stop for specification review before writing the detailed homepage implementation plan.

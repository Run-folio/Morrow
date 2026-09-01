# Morrovia UI convergence audit

Date: 2026-08-29  
Scope: Trello #197, private-beta production surfaces and their shared Storybook system  
Method: render production first, trace implementation ownership second, then make controlled migrations

## Product job and decision filter

The traveller needs to move from a complex trip idea into a route they can understand, edit, recover, and eventually book without wondering whether each screen belongs to a different product. Convergence therefore prioritises navigation, hierarchy, controls, persistent product truth, and responsive shell behaviour. It does not flatten route discovery, map planning, stamps, or passport research into one generic page.

This pass is deliberately not a redesign. Resolver, routing, itinerary, persistence, recovery, auth, Luna, map, Builder, affiliate, and analytics behaviour remain owned by their existing systems.

## Rendered production inventory

| Surface | Production owner | Archetype | Rendered finding |
| --- | --- | --- | --- |
| Homepage | `app/journey/home/` | Editorial entry | Canonical brand/navigation and focused trip capture; editorial sections intentionally differ from workflow pages. |
| Tour | `components/easyt/easyt-product-tour.tsx` | Safety overlay | Focus-managed dialog, real product imagery, clear step/progress/action hierarchy. |
| Builder | `app/journey/new/trip-builder.tsx` | Focused workflow | Strong two-step hierarchy and responsive summary rail; context-specific prompt composition is visually aligned with Homepage. |
| Trips | `app/journey/dashboard/` | Personal library | Shared action controls and trip-card anatomy; recovery/session feedback was a high-risk local exception and is now canonical. |
| Overview | `components/easyt/trip-overview-workspace.tsx` | Trip workspace | Shared TripShell with the next action, Trip Health, seven-category Planning Progress, canonical practical tasks and route context. |
| Itinerary | `components/easyt/trip-itinerary-workspace.tsx` | Trip workspace | Shared shell plus intentionally unique master/detail day navigation. |
| Map | `components/journey-map-planner-workspace.tsx` | Trip workspace/canvas | Shared shell with task-specific map controls, stops strip, detail dock and co-pilot. Must retain wider canvas rules. |
| Routes | `app/journey/discover/` | Editorial discovery | Shared foundations with route-specific filters and cards. |
| Stamps | `app/journey/stamped/` | Personal library/map | Intentional list/map hybrid with canonical site navigation and action language. |
| Passport | `app/journey/passport/` | Focused utility | High-trust form/result hierarchy using the same controls, surfaces and muted/signal language. |
| Sign-in/account entry | `app/journey/login/`, `app/journey/account.module.css` | Focused workflow | Clear segmented entry, labelled fields, recovery link and primary action. |
| Recovery/conflict | Dashboard, TripShell, resolver, Trip mode | Safety state | Previously duplicated banners; now one canonical persistent feedback family without changing recovery decisions. |
| Dialogs/overlays | Product tour, confirmation, date picker, clarification UI | Safety overlay | Native dialog or dialog semantics, labelled content, focus handling and explicit dismissal/confirmation. |
| Desktop/mobile navigation | `app/journey/easyt-navigation.tsx` | Global shell | One canonical owner. Desktop header, compact menu and fixed mobile dock remain purposefully different presentations of the same IA. |

## Canonical UI map

Classification: **A** canonical shared, **B** shared but bypassed, **C** duplicated, **D** Storybook gap, **E** intentional unique.

| Class | Pattern | Production surfaces and current owner(s) | Storybook | Differences found | Canonical owner and action | Risk / intentional exception |
| --- | --- | --- | --- | --- | --- | --- |
| A | Brand foundations and semantic tokens | All Journey surfaces; `app/journey/journey-design.css` | Foundations | Page-local fallbacks remain, but rendered colour/type/focus language is consistent. | Keep `journey-design.css` authoritative. New work must consume `--morrovia-*` tokens. | Do not replace valid fallback values mechanically. |
| A | Global navigation | Public pages, account, Builder; `easyt-navigation.tsx` | Navigation stories and composed stories | Desktop header, compact menu and mobile dock differ by viewport, not by information architecture. | Keep `EasyTNavigation`. | Map/TripShell sub-navigation is a different level and remains separate. |
| A | Buttons and link buttons | Product-wide; `easyt-controls.tsx` | Default, variant, size, loading, disabled, focus and narrow states | Some legacy/local controls remain in complex composite widgets. | `EasyTButton` / `EasyTLinkButton`; new simple actions must use them. | Native internal buttons inside canonical composites are valid. |
| A | Labelled field/select/textarea | Account and utility forms; `easyt-controls.tsx` | Form-control matrix | Local composites may own layout, but shared fields own label, hint, error and disabled semantics. | `EasyTField`, `EasyTSelect`, `EasyTTextArea`. | Map search and prompt-with-voice are composites, not plain fields. |
| A | Date and quantity controls | Homepage, Builder, Trip mode; Morrovia date/quantity controls | Desktop, keyboard, selected, disabled, compact and mobile states | Browser-native date/number chrome has already been removed from core planning surfaces. | Existing Morrovia controls. | No mass rewrite of unrelated admin inputs. |
| A | Segmented control/tabs primitive | Account, filters and local mode switches; `EasyTSegmentedControl` where semantics match | Default and narrow states | Workspace navigation is link navigation, not a segmented control. | Existing segmented control. | Map modes and itinerary navigation retain their task-specific anatomy. |
| A | Save state and brief confirmation | Builder, edits and dashboard actions; `MorroviaSaveStatus`, `MorroviaBriefNotice` | Device/saving/saved/error and timed/interactive success states | Transient confirmation and persistent safety truth were correctly kept separate. | Existing feedback family. | A confirmation with a useful changed state should remain inline rather than create a toast. |
| A | Confirmation dialog | Consequential removal/conflict flows; `MorroviaConfirmationDialog` | Open, mobile and consequence-rich stories | Explicit consequences and cancel-first focus are shared. | Existing confirmation dialog. | Product tour is onboarding, not a destructive confirmation. |
| A | Loading, long-running, empty and recoverable error states | Builder planning, routes, map, sections; `morrovia-loading-states.tsx` | Page/section/card/map matrices | Loading presentation varies with preserved context while state semantics stay consistent. | Existing loading-state family. | A map loader must preserve spatial context; it should not become a generic page spinner. |
| A | Trip workspace shell | Overview, Itinerary and Map; `TripShell` | Shell and every workspace | Shared hero, metadata and three-link sub-navigation; content areas intentionally vary. | `TripShell`. | Map keeps canvas width; Itinerary keeps master/detail; Overview owns readiness and practical tasks. |
| A | Readiness / Trip Health | Overview and trip cards; `trip-overview-workspace.tsx`, `trip-overview-readiness.ts`, `journey-trip-quality.tsx` | Readiness/decision and Overview stories | Summary depth differs by context while status vocabulary is aligned. | Keep canonical selectors and domain components; do not create parallel workspace projections. | Trip Health and practical tasks are different traveller jobs within the same Overview. |
| A | Route stop / transfer / itinerary day | Builder, Itinerary, Map; planner/workspace domain components | Journey pattern and workspace stories | Same trip truth is presented as editable row, spatial marker, or day detail. | Existing engine-backed domain owners. | Visual equivalence is not enough to merge interaction models. |
| A | Booking / affiliate action | Overview, itinerary accommodation and route content | Overview/readiness stories include provider boundary | Provider action never implies a booking; disclosure is explicit. | Existing booking-readiness derivation and shared action controls. | Affiliate styling may be contextual but must retain disclosure and honest state. |
| A | Practical task and progress | Overview | Overview workspace stories | Task definition/action, priority grouping and seven-category progress are read-only projections over canonical trip/provider state. | `lib/easyt/trip-prep.ts`, `lib/easyt/trip-overview-readiness.ts` and `components/easyt/trip-preparation.tsx`. | Compact dashboard readiness remains summary-only. |
| A | Filters/search/sort | Dashboard, Routes, Stamps and Map | Dashboard, Stamps and route stories | Each combines different facets and result contracts. | Share control primitives only. | No universal filter toolbar until semantics genuinely recur. |
| A | Mobile action/navigation bar | Public Journey surfaces; global navigation | Composed 320/390 stories | Fixed dock and safe-area treatment are consistent. | `EasyTNavigation` and `--morrovia-mobile-dock-offset`. | Workspace tabs are in-content and not replaced by the global dock. |
| C → A | Persistent account/session/sync banner | Dashboard, TripShell client/resolver and Trip mode | Persistent tone matrix at desktop and 390 | Local markup previously differed in icon, wrapping, tone, role and action layout. | `MorroviaStatusBanner`; all four production owners migrated. | Warning/danger remain assertive; info/success remain status. Recovery actions and copy are unchanged. |
| C → A | Storybook focus example action | Foundations story | Foundations | A raw story-only button bypassed the same control it was documenting. | Replaced with `EasyTButton`. | None. |
| B | Simple action controls in legacy/complex modules | Builder, Map, Stamps, dashboard account/admin and Trip mode internals | Shared control stories exist | Local native controls sometimes duplicate sizing/focus tokens; some are composite anatomy. | Migrate case by case to existing controls when button semantics match. | P1: keyboard/focus regression risk makes mechanical replacement unsafe. |
| A | Core trip prompt field | Homepage and Builder; `MorroviaTripCapture` + `VoiceTripBrief` | Dedicated trip-capture and Homepage starter stories include default, voice-capable, long-content and narrow states | The shared text-plus-voice core is canonical while analytics, validation, continuation and surrounding cards remain consumer-owned. | `components/easyt/morrovia-trip-capture.tsx`; keep surrounding page composition local. | Do not merge the whole Homepage and Builder cards or change capture semantics. |
| B | Section/page title composition | Most pages; page-local markup and CSS | Present across composed stories, no single canonical owner | Display/meta hierarchy is coherent; spacing and responsive composition vary with archetype. | Keep local composition, align tokens, document archetypes. | A generic header component would currently hide meaningful layout differences. |
| B | Equivalent card/panel surfaces | Route cards, trip cards, practical tasks, passport results, map details | Strong composed coverage | Shared paper/line/radius language; anatomy and interactivity differ. | Consume semantic surface tokens; do not create a universal card. | P2 local radius/shadow cleanup only when equivalence is proven. |
| D | Authenticated route-level fixture | Trips and workspaces | Production components have complete Storybook fixtures | Signed-out production browser cannot safely render account data for visual regression. | Keep disposable production-real stories; add a safe visual fixture only if route-level browser regression becomes necessary. | Never use real account/trip data for screenshots. |
| E | Homepage editorial sections | Homepage | Homepage rendered evidence | Marketing narrative, route cards and affiliate section are unique. | Keep local. | Must continue using foundations and global navigation. |
| E | Map canvas, docks and co-pilot | Map | Map workspace and loading stories | Spatial controls, marker semantics and canvas sizing are unique. | Keep map owners. | Do not force public-page max width or generic cards. |
| E | Stamps map/list explorer | Stamps | Stamped experience stories | Personal memory/wishlist states and geographic browsing are unique. | Keep Stamps owner. | Share only foundations and primitives. |
| E | Passport result utility | Passport | Result-state tests and rendered evidence | Legal/travel-reference trust requirements are distinct. | Keep Passport owner. | Avoid card convergence that reduces scannability or certainty. |
| E | Product tour | Global navigation + product tour | Rendered dialog evidence | Onboarding imagery, step progress and focus contract are unique. | Keep product-tour owner. | Does not use destructive confirmation semantics. |

## Page archetypes

1. **Editorial entry:** Homepage and Routes. Brand-led headline, restrained action pair, narrative/card sections.
2. **Focused workflow:** Builder, sign-in and Passport. One primary task, strong progress/form hierarchy, explicit recovery.
3. **Personal library:** Trips and Stamps. Filterable personal content, empty/loading/recovery states, direct continuation.
4. **Trip workspace:** Overview, Map and Itinerary. Shared trip shell and navigation, view-specific working area; Overview contains readiness and practical preparation.
5. **Safety overlay/state:** Tour, clarification, recovery and confirmation. Focus-managed, explicit and dismissible only when safe.

These archetypes are guidance, not new wrapper components. The simplest effective convergence is shared foundations and interaction patterns while preserving the information architecture each job requires.

## Biggest sources of drift

1. **Persistent product truth had four visual owners.** Session expiry, cloud conflict and device recovery used bespoke banners in Dashboard, TripShell, resolver and Trip mode. This was the highest-risk inconsistency because the same safety promise looked different depending on the shell.
2. **Local native controls remain numerous.** The highest concentrations are Builder and map/planning workspaces. Some are valid composite anatomy; others are controlled P1 candidates.
3. **Legacy CSS contains raw visual values.** The rendered system is coherent, but raw colours, radii, shadows, font declarations and breakpoints make future drift easy.
4. **Direct page-local font roles remain widespread.** The named Morrovia family roles are canonical, but older modules still address framework font variables directly.
5. **Hierarchy is token-consistent but implementation-local.** This is presently a maintenance cost rather than a visible beta blocker.

## Token and layout findings

- Canonical foundations: `--morrovia-page`, `--morrovia-radius`, `--morrovia-control-radius`, `--morrovia-shadow-overlay`, focus ring, semantic action/signal/danger/warning/success colours, and mobile-dock tokens.
- Public pages and workspaces consistently use Morrovia ink, signal pink, paper, lilac, display/UI/meta typography and the same icon family.
- The remaining drift is concentrated in local fallback declarations and older page CSS, not in the rendered base palette.
- Breakpoints cluster around phone, compact/tablet and desktop, but page-specific media queries remain numerous.
- Mobile content uses `--morrovia-mobile-dock-offset`; full-page screenshots can visually intersect the fixed dock because the dock stays fixed while the capture stitches the document, but live viewports retain scrollable content and bottom clearance.
- Map, Builder and Stamps correctly do not share the editorial page max width at desktop.

## Code inventory and regression guard

`npm run audit:ui` now scans both `app/journey` and the complete shared `components` root. It records a conservative ceiling and fails on net-new drift:

| Signal | Baseline | Largest concentrations |
| --- | ---: | --- |
| Native `button` / `input` / `select` / `textarea` | 318 | Builder, map planner, plan workspace, Stamps, Dashboard |
| Raw colour literals | 2,929 | Journey, Homepage, Builder and account styles |
| Raw radius declarations | 681 | Journey and Builder styles |
| Non-token shadow declarations | 284 | Journey, account, Builder and Homepage styles |
| Non-token `font-family` declarations | 62 | Account, navigation, Homepage and Builder styles |
| Min/max-width media queries | 225 | Builder, Homepage, Journey and new-trip styles |

These totals are a drift guard, not a claim that every match is wrong. Foundation definitions, fallbacks and internal anatomy are legitimate. A migration should lower the relevant baseline only after behavioural and visual verification.

## Controlled migrations completed

- Added `MorroviaStatusBanner` to the existing Morrovia feedback family rather than creating a parallel status system.
- Added semantic info, success, warning and danger treatments with shared icon, role, action layout and mobile stacking.
- Migrated Dashboard account boundary, action failure, sync failure, cloud conflict and device-copy recovery states.
- Migrated TripShell resolver guest save, successful promotion, auth failure, conflict and network failure states.
- Migrated active TripShell session expiry and `Device edits kept safe` states.
- Migrated legacy Trip mode sync/conflict feedback while preserving exact recovery copy and actions.
- Added desktop and 390-pixel Storybook coverage for the status matrix.
- Replaced the Foundations story’s raw focus-example action with `EasyTButton`.
- Closed the typography-role migration after both raw family and direct
  framework-role audit signals reached zero; page-owned heading scales remain
  intentional exceptions.
- Added a strict UI-drift audit and focused source-contract tests.

## Storybook as product source of truth

Current production-real coverage includes:

- Foundations and canonical controls.
- Date, quantity, labelled field, select and button states at desktop/mobile.
- Save, success, persistent status, route recovery, conflict, consequential confirmation and affiliate-boundary states.
- Page, section, card, map and long-running loading/error states.
- Builder prompt/review, route stops, transfer rows and Shape-the-day modes.
- Trip-card, readiness, accommodation and recovery decisions.
- Full Overview, Itinerary and Map workspaces inside TripShell, with preparation states composed into Overview.
- Stamps experience and global navigation in composed contexts.

The former Homepage/Builder prompt gap is closed by `MorroviaTripCapture`; its
shared text-plus-voice core has production-real Storybook coverage while each
consumer retains its workflow gates and analytics.

## Final convergence baseline

The original programme baseline and the final guardrail counts are deliberately
kept together so future reductions cannot erase the history of the work.

| Signal | Programme baseline | Final count | Change |
| --- | ---: | ---: | ---: |
| Native controls | 318 | 254 | -64 |
| Raw colours | 2,929 | 2,005 | -924 |
| Raw radii | 681 | 621 | -60 |
| Raw shadows | 284 | 201 | -83 |
| Raw literal `font-family` declarations | 62 | 0 | -62 |
| Copied canonical page width | not separately reported | 3 | now guarded per file |
| Retired UI owner imports | not separately reported | 0 | now blocked |
| Direct page-local framework font roles | not separately reported | 0 | fully migrated to semantic roles |

The font audit is now more precise than the original signal: literal families
and direct framework-variable roles are separate rules, and both are now at
zero. Five current raw-value/native-control exceptions are explicit one-line
records; every other accepted occurrence is versioned migration debt.

## Accessibility verification

- Shared buttons preserve semantic `button`/link behaviour, disabled/loading state, focus ring and icon-only accessible names.
- Shared fields preserve programmatic labels, descriptions, required/error semantics and focus treatment.
- Persistent warning/danger banners use `role="alert"`; informational/success banners use `role="status"`; decorative icons are hidden.
- Confirmation and product-tour dialogs expose dialog names and keyboard-focus handling.
- Product-tour open moved focus to `Close product tour`; close restored focus to the `Tour` trigger.
- Trip workspace navigation remains labelled and link-based; selected workspaces remain visually explicit.
- At 320, 390, 768, 1024 and 1440 the checked surfaces had `scrollWidth === innerWidth`; no page-level horizontal overflow was found. Intentional horizontally scrollable itinerary/stop strips remain contained.
- Reduced-motion support remains in the loading/save patterns.

## Visual evidence and responsive result

Before evidence: `docs/ui-convergence/captures/before/`  
Initial verified after evidence: `docs/ui-convergence/captures/after/`  
Current-run exact-viewport evidence: `docs/ui-convergence/captures/after-verified/`

The convergence evidence set contains 390- and 1440-pixel evidence for Homepage, Builder, Trips, Overview, Itinerary, Map, Routes, Stamps and Passport, plus sign-in, tour and persistent feedback. Historical Prep captures pre-date its consolidation into Overview and are not a current workspace reference. Builder, Map and persistent feedback also have representative 320, 768 and 1024 captures. Map evidence was accepted only after three real stop markers rendered; the loading-frame capture was rejected.

Visual comparison result:

- Navigation, typography, icon language, semantic colour, focus/action hierarchy and border treatment read as one product.
- Mobile workspaces compress the TripShell consistently; the Map keeps its spatial canvas and the Itinerary keeps its horizontal day strip without page overflow.
- Persistent safety truth now has one visual and semantic contract across dashboard and trip contexts.
- Purposeful differences remain obvious: discovery is editorial, Builder is linear, Trips is a library, and Map is a working canvas.

## Intentional exceptions

- No generic page-header component: hierarchy is visually related, but jobs and responsive compositions are not yet identical.
- No universal card primitive: route, stay, trip, practical-task, passport-result and map-detail cards have materially different contracts.
- No mass native-control replacement: composite widgets require case-by-case keyboard and focus proof.
- No full prompt-card merge: only the core text-plus-voice interaction is shared.
- No Map or Stamps redesign and no narrowing to editorial page width.
- No change to copy, routing, product logic, persistence or analytics.

## Remaining convergence work

### P0

- None found for private-beta visual coherence in the audited scope.

### P1

1. Migrate simple local actions in Builder, map/planning and Stamps when they semantically match `EasyTButton`; verify keyboard, focus and touch targets per surface.
2. Replace direct page-local framework font roles with `--morrovia-display`, `--morrovia-ui` and `--morrovia-meta` module by module.
3. Add a safe authenticated route-level visual-regression fixture if CI must validate full dashboard routes rather than production-real component stories.

### P2

1. Reduce raw radius/shadow/colour fallbacks module by module and lower the audit baseline after each verified migration.
2. Consolidate repeated breakpoint declarations only where the responsive transition is actually shared.
3. Revisit a shared section-heading composition only after a second production migration proves identical content and responsive contracts.

## Verification commands

- `npm run audit:ui`
- `node --experimental-strip-types --test tests/ui-convergence.test.ts tests/morrovia-controls.test.ts tests/auth-feedback.test.ts`
- persistence/feedback focused tests
- `npm run typecheck`
- `npm run build-storybook`
- `npm run build`
- `git diff --check`

## Verification result

| Check | Result |
| --- | --- |
| Exact-width browser review at 320 / 390 / 768 / 1024 / 1440 | Pass; no page-level horizontal overflow on the representative production/story routes. |
| Product-tour dialog focus | Pass; focus entered the close control and returned to the Tour trigger. |
| UI drift audit | Pass at the recorded six-signal baseline. |
| Focused UI, controls, auth, persistence, Builder, Map, loading and workspace tests | Pass: 80/80. |
| Storybook static build | Pass. |
| TypeScript typecheck | Blocked outside #197: the existing untracked `benchmarks/open-world-engine-gauntlet/harness.ts` supplies the removed `anchor` destination role and omits `likelyDestinationSourceText`. |
| Next.js production build | Application compilation passed, then stopped on the same benchmark type error. |
| `git diff --check` | Pass. |

The benchmark harness was not modified as part of this UI task. Its type mismatch must be reconciled with the current semantic-intent schema before the repository-wide typecheck/build gate can become green.

## Verdict

**COHESIVE ENOUGH FOR PRIVATE BETA**

The brand and primitive layers were already strong. The material improvement is that account, session, sync and device-recovery truth now looks and behaves consistently wherever a traveller encounters it. The remaining drift is measurable, guarded and ranked without forcing unique travel-planning interactions into generic components.

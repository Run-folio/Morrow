# Morrovia Design System

This is the durable navigation guide for Morrovia UI work. It describes the
system that exists today; it is not a proposal for a future component library.

Use this hierarchy:

1. `AGENTS.md` defines mandatory working behaviour.
2. This document maps the current system.
3. Storybook is the canonical visual and interaction reference for recurring Morrovia UI.
4. Shared production components and tokens are the implementation owners.
5. Production components, data models and tests are behavioural truth.
6. The closest live Morrovia surface resolves product-specific details.

The dated evidence and migration record remains in
`docs/ui-convergence/audit.md`. Historical entries in `design-qa.md` are QA
evidence, not design-system authority.

## Principles

- Morrovia is one product. Shared foundations should make distinct jobs feel
  related without making every page identical.
- Reuse before creation; extend or compose before building a parallel pattern.
- Use purposeful hierarchy: travellers should see the next decision, current
  state and consequences before secondary detail.
- Consistency does not mean homogeneity. Editorial discovery, focused planning,
  personal libraries and spatial workspaces have different information needs.
- Indigo/purple is the primary brand and action family. Pink is a restrained
  signal or emphasis, not a second indiscriminate primary colour.
- Success, warning and danger colours remain semantic. Do not use them as
  decoration.
- AI-assisted states must preserve traveller intent and explain loading,
  recovery and consequential change honestly.

## Foundations and tokens

The canonical foundation is `app/journey/journey-design.css`. Storybook imports
that file through `.storybook/preview.ts`, so stories and production use the
same tokens.

### Typography

| Role | Canonical token | Current use |
| --- | --- | --- |
| Display/editorial | `--morrovia-display` | Major page and section headings; Georgia with serif fallbacks |
| Product/UI | `--morrovia-ui` | Body copy, controls and information-rich planning surfaces; Geist Sans with fallbacks |
| Metadata/labels | `--morrovia-meta` | Eyebrows, compact labels, dates, day numbers and metadata; Geist Mono with fallbacks |

`Morrovia/01 Foundations — Typography` demonstrates the three roles and places
production-owned heading selectors side by side so current differences remain
visible.
Morrovia also names the recurring readable-copy roles that must remain
consistent across those surfaces:

| Semantic role | Canonical declaration | Use |
| --- | --- | --- |
| Body | `--morrovia-type-body` | Primary prose and explanations users are expected to read |
| Supporting body | `--morrovia-type-supporting-body` | Secondary explanations that still carry product or travel meaning |
| Control | `--morrovia-type-control` | Compact interactive labels; shared controls remain the implementation owner |
| Metadata | `--morrovia-type-metadata` | Dates, counts, statuses and compact factual labels |
| Eyebrow | `--morrovia-type-eyebrow` | Short uppercase section orientation only |
| Fine print / provenance | `--morrovia-type-fine-print` | Legal, source and provenance copy that remains readable but subordinate |

Display, page-heading and section-heading sizes remain page/archetype-owned;
their canonical character is the display family and the production comparisons
in Storybook. These named declarations are semantic roles rather than a
general-purpose numerical type scale. Meaningful sentences must use Body or
Supporting body, not Metadata or Eyebrow merely because they are visually
secondary.
Shared controls establish their own sizes and weights in
`components/easyt/easyt-controls.module.css`: buttons use the UI family, field
labels use the compact uppercase metadata role, and field values use the UI
family. Reuse the relevant component or nearest page archetype instead of
copying a number from an unrelated surface.

### Colour

| Role | Token or canonical treatment |
| --- | --- |
| Primary ink | `--morrovia-ink` |
| Secondary ink | `--morrovia-ink-soft` |
| Primary action | `--morrovia-action` and `--morrovia-action-hover` |
| Accent/signal | `--morrovia-signal`; its canonical value must retain at least 4.5:1 contrast on `--morrovia-paper` and `--morrovia-lilac` because the role also appears in compact metadata text |
| Page surface | `--morrovia-paper` |
| Secondary surfaces | `--morrovia-lilac`, `--morrovia-lilac-strong`, `--morrovia-tint` |
| Muted content | `--morrovia-muted` |
| Borders/dividers | `--morrovia-line` |
| Success | `--morrovia-success`; pairings with soft success surfaces must retain at least 4.5:1 contrast for compact status text |
| Warning | `--morrovia-warning`, `--morrovia-warning-soft`; their text/surface pairing must retain at least 4.5:1 contrast |
| Error/danger | `--morrovia-danger`, `--morrovia-danger-soft` |
| Information | `MorroviaStatusBanner` and related feedback components using ink/lilac treatment; there is no separate info colour token |
| Disabled | `--morrovia-disabled` |
| Focus | `--morrovia-focus-ring` |

Use token names rather than copying their current values. The canonical swatch
and grouped raw-value reference is `Morrovia/01 Foundations — Colours`.

### Spacing

There is no repository-wide spacing-token scale today. Shared controls and
workspaces own their internal spacing, while page compositions use local CSS.
When changing a surface:

- reuse the gap and padding rhythm from the canonical component or closest
  production equivalent;
- preserve existing compact/mobile reductions;
- do not create a second local spacing vocabulary for an existing pattern;
- do not introduce a global scale as part of unrelated UI work.

### Radius, borders and elevation

- `--morrovia-control-radius` is the control and compact-interaction radius.
- `--morrovia-radius` is the established larger editorial/panel radius.
- `--morrovia-line` is the standard low-emphasis border and divider.
- `--morrovia-shadow-overlay` and `--morrovia-overlay` belong to overlay/dialog
  hierarchy. Ordinary cards should not borrow overlay elevation.
- Focus colour uses `--morrovia-focus-ring`; the canonical 3px keyboard-focus
  treatment uses `--morrovia-focus-shadow`. Larger, inset or elevation-combined
  focus treatments remain with their product owner.

Card anatomy is product-specific. Route, trip, stay, prep-task, passport-result
and map-detail cards are not interchangeable, so Morrovia intentionally has no
universal card component.

### Icons

Journey UI uses `lucide-react`. Pass icons through canonical component props
where available, mark decorative icons `aria-hidden="true"`, and give icon-only
actions an accessible name. `EasyTButton` supplies the standard 16-pixel action
icon treatment; product-specific canvases may size icons locally when the
interaction requires it. Do not mix in another icon library or invent a new
size for an existing action pattern.

## Layout and responsiveness

- `--morrovia-page` defines the standard editorial content width: up to 1180px
  with 48px total desktop gutter and 32px total gutter below 700px.
- Global mobile navigation changes at 520px. Content in the mobile shell must
  reserve `--morrovia-mobile-dock-offset`, including the safe-area inset.
- Storybook review viewports are 320, 390, 430, 768, 1024, 1440 and 1680
  pixels. Major composed patterns should cover 320, 390, 768, 1024 and 1440;
  primitives need only the responsive states that materially change them.
- Breakpoints remain page-specific where the job demands it. Do not introduce a
  new global breakpoint merely to fix one page.
- Map, Builder and Stamps are intentional exceptions to the standard editorial
  width because their canvas, workflow or exploration jobs need more space.

## Canonical primitives

Use only components that actually exist:

| Need | Canonical implementation | Storybook reference |
| --- | --- | --- |
| Button | `EasyTButton` in `components/easyt/easyt-controls.tsx` | `Morrovia/02 Controls/Buttons, fields and segments` |
| Button-like link | `EasyTLinkButton` in the same file | `Morrovia/02 Controls/Buttons, fields and segments` |
| Input | `EasyTField` in the same file | `Morrovia/02 Controls/Buttons, fields and segments` |
| Textarea | `EasyTTextArea` in the same file | `Morrovia/02 Controls/Date, quantity and forms — InputAndSelectStates` |
| Select | `EasyTSelect` in the same file | `Morrovia/02 Controls/Date, quantity and forms — InputAndSelectStates` |
| Segmented control | `EasyTSegmentedControl` in the same file | `Morrovia/02 Controls/Buttons, fields and segments — Segmented` |
| Date picker | `MorroviaDatePicker` in `components/easyt/morrovia-date-picker.tsx` | `Morrovia/02 Controls/Date, quantity and forms` |
| Quantity/traveller selector | `MorroviaQuantitySelector` in `components/easyt/morrovia-quantity-selector.tsx` | `Morrovia/02 Controls/Date, quantity and forms — TravellerStates` |
| Consequential dialog | `MorroviaConfirmationDialog` in `components/easyt/morrovia-feedback.tsx` | `Morrovia/03 Status & Feedback/Confirmation and recovery` |
| Brief notice/save state | `MorroviaBriefNotice`, `MorroviaSaveStatus` in the same file | `Morrovia/03 Status & Feedback/Confirmation and recovery` |
| Persistent status/recovery | `MorroviaStatusBanner`, `MorroviaRecoveryFeedback` in the same file | `Morrovia/03 Status & Feedback/Confirmation and recovery — PersistentStatusBanners` |
| Contextual disclosure | `MorroviaContextualDisclosure` in the same file | `Morrovia/03 Status & Feedback/Confirmation and recovery — ContextualTransparencyDisclosure` |
| Loading/progress | `MorroviaSkeleton`, `MorroviaSectionStatus`, `MorroviaPlanningProgress`, `MorroviaMapLoading` in `components/easyt/morrovia-loading-states.tsx` | `Morrovia/03 Status & Feedback/Loading and progress` |
| Privacy choices | `PrivacyConsent` and `CookiePreferences` in `components/` | `Morrovia/03 Status & Feedback/Privacy choices` |

Native elements inside these canonical components are implementation detail,
not permission to reproduce their styling page-locally.

## Canonical product patterns

| Pattern | Current source of truth |
| --- | --- |
| Site navigation and mobile dock | `app/journey/easyt-navigation.tsx`; `Morrovia/04 Structure/Global navigation` |
| Homepage and Builder trip capture | `components/easyt/morrovia-trip-capture.tsx`; `Morrovia/05 Product Patterns/Trip capture` and `Homepage trip starter` |
| Builder clarification and route review | `app/journey/new/trip-builder.tsx`; `Morrovia/05 Product Patterns/Builder review` |
| Status, save, recovery and consequential confirmation | `components/easyt/morrovia-feedback.tsx`; `Morrovia/03 Status & Feedback` |
| Loading, long-wait, retry and progress | `components/easyt/morrovia-loading-states.tsx`; `Morrovia/03 Status & Feedback/Loading and progress` |
| Trip-level page identity and navigation | `components/easyt/trip-shell.tsx` and related client/resolver files; `Morrovia/04 Structure/Trip shell` |
| Overview/readiness/next action | `components/easyt/trip-overview-workspace.tsx`; `Morrovia/05 Product Patterns/Trip workspace/Overview` |
| Itinerary day and transfer presentation | `components/easyt/trip-itinerary-workspace.tsx`; `Morrovia/05 Product Patterns/Trip workspace/Itinerary` |
| Map route, selected place and spatial actions | `components/easyt/trip-map-workspace.tsx`; `Morrovia/05 Product Patterns/Trip workspace/Map` |
| Practical tasks and completion | `components/easyt/trip-overview-workspace.tsx`, composed from `components/easyt/trip-preparation.tsx`; `Morrovia/05 Product Patterns/Catalogue` |
| Route discovery/detail | `app/journey/discover/` and `app/journey/routes/[slug]/route-detail-view.tsx`; `Morrovia/05 Product Patterns/Routes` |
| Personal trip cards and empty state | `app/journey/dashboard/dashboard-client.tsx`; `Morrovia/05 Product Patterns/Trips dashboard` |
| Canonical footer | `components/morrovia-footer.tsx`; `Morrovia/04 Structure/Footer` |
| Cookie consent and preferences | `lib/privacy-consent.ts`, `components/privacy-consent.tsx`, and `components/cookie-preferences.tsx`; `Morrovia/03 Status & Feedback/Privacy choices` |
| Luna and speech transparency | `components/easyt/easyt-trip-copilot.tsx` and `components/easyt/morrovia-trip-capture.tsx`, with speech mechanics in `components/easyt/voice-trip-brief.tsx`; `Morrovia/05 Product Patterns/Luna AI assistant` and `Trip capture` |

### Recurring ownership map

This is the short answer to “which owner do I extend?”; Storybook’s
`Morrovia/06 Audit — Canonical ownership` story keeps the same map visual and
lists only meaningful states.

| Family | Canonical owner | Boundary |
| --- | --- | --- |
| Button | `EasyTButton` / `EasyTLinkButton` | Product composites diverge only for a different keyboard or spatial contract. |
| Field | `EasyTField` / `EasyTSelect` / `EasyTTextArea` | Date, quantity, voice and map search use their dedicated composite owners. |
| Segmented selection | `EasyTSegmentedControl` | Use for in-place view/filter selection, not link navigation or independent boolean choices. |
| Card | Closest production product-pattern component | There is deliberately no universal Card; share foundations and controls, not unrelated anatomy. |
| Status | `components/easyt/morrovia-feedback.tsx` | Domain health, booking and readiness state remains with its state-machine owner. |
| Contextual disclosure | `MorroviaContextualDisclosure` | Use persistent copy or a legal page when the information must stay continuously visible. |
| Privacy choice | `PrivacyConsent` / `CookiePreferences` with `lib/privacy-consent.ts` | Consent storage and legal-choice semantics stay with this owner. |
| Progress | `components/easyt/morrovia-loading-states.tsx` | Preserve the affected page, section or spatial context while work runs. |
| Trip capture | `MorroviaTripCapture` | Homepage and Builder own surrounding workflow; the text, voice and supporting controls stay shared. |
| Trip navigation | `TripShellNavigation` in `components/easyt/trip-shell-client.tsx` | Trip-local links are not global navigation or a segmented control. |
| Route row | `DiscoveryBrowser` and `RouteDetailView` | Result cards and sequenced stop rows share route truth but not interaction anatomy. |
| Itinerary row | `TimelineRow` / `TransferRow` inside `TripItineraryWorkspace` | Keep mutation, booking protection and day selection coupled to the workspace owner. |
| Recommendation | Trip recommendations in Overview/Itinerary; place discovery in `JourneyItineraryRefinement` / `JourneyLocalFinder` | Presentation may differ; successful Add uses the existing canonical trip mutation path. |
| Booking/readiness action | `TripPreparationTaskSection` with `lib/easyt/trip-prep.ts` and `lib/easyt/trip-overview-readiness.ts` | Provider opening is not booking confirmation; state is derived from stored trip truth. |
| Trip Health | `JourneyTripQuality` with `lib/easyt/review.ts` | Domain findings are not generic feedback-banner tones. |
| Map overlay | `TripMapWorkspace` / `JourneyPlannerMap` with `MorroviaMapLoading` | Preserve map geometry, provider constraints and spatial keyboard behaviour. |
| AI / Copilot | `EasyTTripCopilot` | Luna proposes and explains; canonical mutation owners apply consequential changes. |

Page headers and section headers share typography and hierarchy but do not yet
have a canonical component. Use the closest page archetype and keep token roles
aligned. Do not create a generic header solely to remove similar markup.

## Page archetypes

These are layout expectations, not wrapper components:

1. **Editorial entry** — Homepage and Routes: brand-led display hierarchy,
   restrained actions and narrative/card sections.
2. **Focused workflow** — Builder, sign-in and Passport: one primary task,
   clear progress/form hierarchy and explicit recovery.
3. **Personal library** — Trips and Stamps: filterable personal content with
   strong empty, loading and continuation states.
4. **Trip workspace** — Overview, Itinerary and Map: shared `TripShell`
   and navigation with a view-specific working area.
5. **Safety overlay** — Tour, clarification, recovery and confirmation:
   focus-managed, truthful about consequences and dismissible only when safe.

## Storybook workflow

Stories live beside production code under `components/**/*.stories.tsx` and
`app/**/*.stories.tsx`. Configuration is in `.storybook/main.ts`; live global
CSS and standard viewports are in `.storybook/preview.ts`.

Storybook is the living visual catalogue for recurring Morrovia UI. Its stable
top-level hierarchy is:

1. `Morrovia/01 Foundations`
2. `Morrovia/02 Controls`
3. `Morrovia/03 Status & Feedback`
4. `Morrovia/04 Structure`
5. `Morrovia/05 Product Patterns`
6. `Morrovia/06 Audit`

Audit stories classify production implementations as `CANONICAL`,
`DUPLICATE / MIGRATION CANDIDATE` or `INTENTIONAL EXCEPTION`. `UNDECIDED`
remains a supported temporary review state, but the final catalogue currently
contains no undecided recurring family.
They expose owners and consumers; they do not authorise a migration by
themselves. Recurring production patterns should render their actual component
in Storybook. Deeply inline patterns that cannot be isolated safely must be
documented in Audit instead of being recreated as story-only components.

`npm run storybook:inventory` deterministically regenerates the grouped raw
colour, radius, shadow, font-family, spacing, breakpoint and audit-count data
used by Foundations and Audit. Both Storybook dev and static builds run the
generator first, so the catalogue does not depend on a running production
server.

- Browse locally with `npm run storybook`.
- Build the static reference with `npm run build-storybook`.
- Start with `Morrovia/01 Foundations`, `Morrovia/02 Controls`,
  `Morrovia/03 Status & Feedback`, `Morrovia/04 Structure`, and
  `Morrovia/06 Audit — Inventory & ownership`.
- Then open the closest page or workspace story listed above.
- Reusable UI changes require representative normal, focus, disabled,
  loading/error and responsive states as applicable.
- Storybook is the canonical visual reference, but the shared production component is
  the implementation. Do not copy story-only markup into production.

Storybook-specific code is limited to fixtures, decorators and controlled demo wrappers.
Stories should import the actual production owner. A visual recreation that can drift
from production is not an acceptable substitute; when a production component cannot be
isolated safely, document its owner and state in Audit instead.

For each recurring UI change:

1. Open the closest Storybook family and its production owner.
2. Reuse that owner when the semantic job matches.
3. Extend that owner only when the same job needs another meaningful state.
4. Create a new product-owned pattern only for a genuinely different job or
   interaction contract.
5. Update representative Storybook states and responsive coverage.
6. If the result intentionally differs, record its canonical reference, reason,
   owner and consumers in the Audit catalogue.

Storybook decides how recurring UI should look and respond. Production code,
data models and tests remain the source of behavioural truth.

## Deprecated or forbidden new work

- The former `trip-prep-workspace`, `trip-prep-client`,
  `journey-booking-readiness`, `journey-trip-prep-accommodation` and
  `journey-trip-readiness` UI owners are retired. Use `TripOverviewWorkspace`
  with `TripPreparationTaskSection`; `audit:ui` blocks those imports.
- Do not use legacy general-site primitives in `components/ui.tsx` as the
  default for Journey UI; current Journey production uses the Morrovia system.
- Do not add page-local native buttons, inputs, selects or textareas when the
  canonical control satisfies the interaction.
- Do not introduce raw colour, shadow or radius values when an equivalent
  `--morrovia-*` token exists.
- Do not recreate feedback, loading, dialog, date or quantity interactions that
  already exist in `components/easyt/`.
- Do not reintroduce historical EasyT/portfolio visual styling based on old QA
  artifacts.
- Do not create a universal card, page header, filter bar or page wrapper until
  semantics genuinely recur and the abstraction has been reviewed.

Existing exceptions are migration candidates, not examples for new work.
`npm run audit:ui` enforces this contract against a versioned, per-rule,
per-file debt baseline. Existing debt is grandfathered only at its current
location and count: one file cannot clean up a raw value to subsidise a new one
somewhere else.

## Mechanical enforcement

`npm run audit:ui` is the one design-system compliance command. It runs in the
release gate and checks the high-confidence parts of this contract:

- new native buttons, inputs, selects and textareas outside canonical control
  implementations, including targeted date, quantity, dialog and browser
  confirmation checks;
- new Journey imports from legacy `components/ui.tsx`;
- imports from the retired Prep/readiness UI owners;
- new raw colours, radii, shadows, font families and copied canonical page
  widths in stylesheets, direct page-local framework font roles, plus equivalent
  inline values;
- required Storybook markers for canonical controls, date/quantity controls,
  feedback/disclosure, privacy choices, loading, Trip Capture, Luna, Overview
  readiness, product/structure owners and `TripShell` at representative
  responsive widths.

Diagnostics name the rule, file and line, the canonical alternative and the
exception form where one is allowed. The accepted migration debt lives in
`scripts/ui-convergence-baseline.json`. Normal audit runs fail when debt rises
and also when it falls, so cleanup cannot leave a stale allowance that later
drift can occupy. After intentional cleanup, lower the baseline with:

```sh
npm run audit:ui -- --accept-reductions
```

That operation refuses to write if any rule increased, an exception is invalid
or a Storybook contract is broken. Never update the baseline merely to make a
feature branch green.

When a complex canvas or composite genuinely cannot use the canonical pattern,
place one visible exception immediately above the single affected line:

```css
/* morrovia-ui-audit-allow-next-line raw-shadow -- map overlay elevation must remain above provider controls */
.mapOverlay { box-shadow: 0 18px 42px color-mix(in srgb, var(--morrovia-ink) 18%, transparent); }
```

The rule id must match, the reason must be specific, and the directive must be
consumed by exactly the next line. Unused, malformed, vague or unsupported
exceptions fail the audit. `legacy-ui-import` cannot be excepted locally.

Every unsuppressed raw-value match in the checked-in baseline is classified as
migration debt. A consumed one-line directive is a documented intentional or
provider/composite exception. Canonical tokens are excluded. This means the
inventory is classifiable without pretending that static matching can decide
the right semantic replacement.

The audit deliberately does not enforce a spacing or type-size scale because
none exists, page-specific breakpoint values because archetypes vary, or the
semantics of cards, headers, loading/status markup and copy, and responsive
composition. Static matching cannot reliably distinguish a legitimate local
live region from a recreated feedback or loading pattern. Those remain
Storybook, accessibility, visual and code-review responsibilities.

## Intentional exceptions

- Homepage, Builder, Routes, Stamps, Passport, Map and Tour retain distinct
  compositions because they solve different traveller jobs.
- Complex canvases and composite widgets may keep local native controls when
  composition with shared controls would break keyboard, focus or spatial
  behaviour. New exceptions require an explicit reason and accessibility check.
- Product-specific cards keep local anatomy while using shared foundations.
- Existing intentional white card surfaces remain until #197 defines a semantic
  white-surface token; do not invent one during unrelated work.
- Page-specific responsive rules remain valid where the archetype needs them.

The full, reviewable exception records live in `Morrovia/06 Audit — Intentional
exceptions`. Each intentional exception must name its implementation,
canonical reference, reason and consumers. Visual difference alone is not a
reason. New unresolved similarities may use `UNDECIDED` only during a bounded
audit and must not ship as an unowned recurring pattern.

## Completion checklist

Before finishing UI work:

1. Compare the result with the relevant Storybook stories and live surface.
2. Verify keyboard/focus, labels, roles, live regions and reduced motion where
   applicable.
3. Check 320, 390, 430 and 768 widths plus the normal desktop width.
4. Run `npm run audit:ui` and the relevant tests.
5. Run `npm run build-storybook` when shared UI or stories changed.
6. Run typecheck/build checks appropriate to the code change.
7. Report reused, extended and new shared components, Storybook changes and
   intentional exceptions.

Remaining migration debt is the explicit candidate set in `Morrovia/06 Audit`,
not an implied product-wide redesign programme. Address it only in reviewed,
focused tickets. Mechanical enforcement improves by lowering the checked-in
baseline as verified cleanup lands, never by raising the baseline or creating a
second design-system source of truth.

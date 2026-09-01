# Trello #200 UI convergence implementation

Status: completed and verified on 29 August 2026.

## Initial accepted debt

Measured with `npm run audit:ui` on 29 August 2026 before #200 production edits.

| Audit rule | Initial occurrences |
| --- | ---: |
| `native-control` | 291 |
| `native-date-input` | 0 |
| `native-number-input` | 0 |
| `native-dialog` | 0 |
| `native-confirm` | 0 |
| `legacy-ui-import` | 0 |
| `raw-color` | 2,909 |
| `raw-radius` | 681 |
| `raw-shadow` | 259 |
| `raw-font-family` | 60 |
| `raw-page-width` | 24 |
| `inline-color` | 61 |
| `inline-radius` | 14 |
| `inline-shadow` | 3 |
| `inline-font-family` | 0 |

## Convergence target map

| Rank | Debt family | Rule and approximate count | Affected owners | Canonical replacement | Expected reduction | Risk | Decision |
| ---: | --- | --- | --- | --- | ---: | --- | --- |
| 1 | Redundant literal fallbacks inside canonical colour tokens | `raw-color`, 508 | 19 Journey and Journey-owned shared stylesheets | Existing `--morrovia-ink`, `--morrovia-line`, `--morrovia-action`, `--morrovia-signal`, `--morrovia-paper`, `--morrovia-lilac`, state and related semantic tokens | 508 | Low. The token and its literal fallback currently resolve to the same value, and every affected owner renders below the Journey layout or Storybook token import. | Selected. Remove the redundant fallback, not the semantic token. |
| 2 | Copied standard editorial width | `raw-page-width`, 16 clearly standard occurrences | Homepage sections, route explorer, Prep legacy page, footer and loading stories | Existing `--morrovia-page` | 16 | Low. Existing mobile overrides remain intact. Builder max-width and alignment calculations are intentionally excluded. | Selected. |
| 3 | Simple native action buttons with canonical semantics | `native-control`, about 9 initial occurrences | Dashboard trip menu, Privacy analytics choice, Overview orientation and Prep details action | Existing `EasyTButton` variants and sizes, composed with existing local product anatomy | 9 | Low to moderate. DOM button semantics stay unchanged; local classes continue to preserve page-specific layout. | Selected with responsive and interaction verification. |
| 4 | Old accent and near-match palette literals | `raw-color`, over 300 including `#ff3d8b`, `#201d3d`, `#17106e` and related values | Mostly older Homepage, account, Builder and Journey CSS | Possible semantic token migration after role-by-role classification | High numerical potential | Moderate to high. Similar-looking literals currently cover different signal, action, ink, artwork and historical layers. | Deferred. Exact visual equivalence is not sufficient proof of semantic equivalence. |
| 5 | Radius families | `raw-radius`, 681 | Product-wide cards, pills, circles, compact controls, dialogs and canvases | Existing control and panel radius tokens where roles genuinely match | Potentially large | High if treated mechanically. The largest groups are intentional pills and circles; 8–18px values span several product-specific anatomies. | Deferred to component-owned waves. |
| 6 | Shadow families | `raw-shadow`, 259 | Overlays, cards, maps, focus treatments and older surfaces | Existing overlay elevation where appropriate | Moderate | High. Most shadows express different depth or focus semantics; ordinary cards must not inherit overlay elevation. | Deferred pending elevation-role classification. |
| 7 | Font declarations | `raw-font-family`, 60 | Navigation, account, Homepage, Builder and shared domain modules | Existing display, UI and metadata tokens | Small to moderate | Moderate. The audit currently includes many already-tokenised declarations because of whitespace-sensitive matching, while genuine legacy declarations still need semantic classification. | Deferred rather than gaming the count through formatting. |
| 8 | Homepage/Builder prompt and complex native controls | `native-control`, high-volume P1 family | Builder, Map, Stamps, prompt-with-voice and composite option controls | Existing controls only where their interaction contract matches; prompt needs the #197 contract first | Potentially large | High. Analytics, validation, focus, keyboard and workflow-gate behaviour differ. | Deferred to focused control and prompt tickets. |

## Guardrails for this wave

- No new tokens or audit exceptions.
- No raw-value replacement where semantics are ambiguous.
- No change to layout, copy, product logic, persistence, analytics or affiliate boundaries.
- Keep product-specific card, map, prompt and responsive anatomy local.
- Lower the checked-in baseline only after tests, audit output and representative visual checks confirm the reductions.

## Final result

### Selected convergence wave

The implementation selected the first three ranked families because each had an
existing canonical replacement and could be migrated without changing product
anatomy or behaviour:

1. Removed 508 redundant literal fallbacks from established semantic colour
   tokens across 19 Journey-owned stylesheets.
2. Replaced 16 copied standard editorial widths with `--morrovia-page` across
   Homepage, Prep, footer and loading-story owners.
3. Migrated simple native actions to `EasyTButton` in Dashboard trip menus,
   Privacy analytics choices, the Overview orientation dismissal and the Prep
   details action. Existing local classes continue to own page-specific layout.

No token, component variant or parallel shared component was added. No shared
component implementation was deleted: the concrete reduction is 16 native
control occurrences across six production consumers in the completed workspace,
including compatible Homepage and Builder convergence that landed alongside this
wave. Nine of those migrations are the four consumer families selected above.

### Exact audit result

| Audit rule | Before | After | Change | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `native-control` | 291 | 275 | -16 | 5.5% |
| `native-date-input` | 0 | 0 | 0 | 0% |
| `native-number-input` | 0 | 0 | 0 | 0% |
| `native-dialog` | 0 | 0 | 0 | 0% |
| `native-confirm` | 0 | 0 | 0 | 0% |
| `legacy-ui-import` | 0 | 0 | 0 | 0% |
| `raw-color` | 2,909 | 2,380 | -529 | 18.2% |
| `raw-radius` | 681 | 674 | -7 | 1.0% |
| `raw-shadow` | 259 | 257 | -2 | 0.8% |
| `raw-font-family` | 60 | 60 | 0 | 0% |
| `raw-page-width` | 24 | 8 | -16 | 66.7% |
| `inline-color` | 61 | 61 | 0 | 0% |
| `inline-radius` | 14 | 14 | 0 | 0% |
| `inline-shadow` | 3 | 3 | 0 | 0% |
| `inline-font-family` | 0 | 0 | 0 | 0% |

Every enforced debt category decreased or remained flat. The checked-in #199
baseline records these verified counts and the strict audit passes.

Four narrow local exceptions are present in the new Homepage trip-capture
component that landed alongside this wave: one specialized textarea remains
native because it is composed with the voice-input overlay, one quiet Homepage
card elevation remains intentionally distinct from the overlay shadow, and two
fully rounded chip silhouettes remain intentionally distinct from the control
and panel radius roles. The selected fallback, width and action migrations added
no audit exceptions.

### Preserved and deferred debt

- Near-match and historical palette literals remain unchanged where colour role
  is ambiguous.
- General radius and shadow migration remains deferred because cards, pills,
  circles, maps, focus treatments and overlays do not share one semantic role.
- Typography debt remains deferred rather than changing formatting to game the
  audit's whitespace-sensitive matching.
- Builder, Map and other composite native controls remain for focused waves where
  analytics, validation, keyboard and workflow-gate behaviour can be verified as
  a unit.

The recommended next wave is control-family convergence in Builder and Map,
starting with repeated ordinary buttons and fields and explicitly excluding
canvas, range and workflow-specific composite interactions. A later elevation
and radius wave should first classify recurring semantic roles before adding or
adopting tokens.

### Storybook and responsive verification

No reusable component API changed, so no new Storybook variant was warranted.
The existing Controls, Dashboard, Trip overview, Trip prep and Homepage capture
stories remain the canonical coverage, and the full Storybook production build
passes.

The in-app browser was used at requested 320, 390, 430, 768 and desktop widths
for Controls, Dashboard, Trip prep, Trip overview, Privacy and Homepage. No
representative surface overflowed horizontally. Dashboard menu actions and the
Prep action retained 40px targets; Privacy analytics choices retained 44px
mobile targets; accessible names and native button semantics remained present.
The Dashboard action menu was opened and exercised after migration. Focus,
disabled and loading behaviour continues to come from the existing canonical
control implementation rather than a page-local copy.

### Validation

- `npm run audit:ui` — passed at the reduced baseline.
- `npm run test:ui-convergence` — 6/6 tests passed.
- Focused controls, Dashboard/feedback, Overview lifecycle/presentation,
  Homepage layout, loading-state, analytics and affiliate-link tests — 43/43
  passed.
- `npm run typecheck` — passed when run standalone.
- `npm run build-storybook` — passed.
- `npm run build` — passed, including production type validation and all 37
  static pages.
- `git diff --check` — passed.

# #208 surface-token convergence inventory

Date: 2026-08-29  
Scope: post-convergence cleanup of radii, shadows and copied canonical widths

## Initial audited debt

Measured with `npm run audit:ui` before #208 edits.

| Rule | Initial occurrences |
| --- | ---: |
| `raw-radius` | 651 |
| `raw-shadow` | 231 |
| `raw-page-width` | 8 |

The earlier programme figure of 659 raw radii predates the completed #207 typography/colour work. This inventory uses the current workspace result, 651, as the #208 baseline.

## Radius classification

| Semantic family | Representative owners | Classification | Decision |
| --- | --- | --- | --- |
| Standard and compact controls | `EasyTButton`, date-picker days, Builder compact controls, Dashboard readiness/menu controls | Canonical migration candidate | Use `--morrovia-control-radius` only where the current value is exactly 10px and the selector owns a control or compact interaction. |
| Card and panel | Builder route, allocation, review and essentials panels; shared co-pilot shell | Canonical migration candidate | Use `--morrovia-radius` only where the current value is exactly 14px and the selector is an established panel. |
| Dialog and sheet | Confirmation dialog, date-picker popover, product tour | Canonical where already tokenised | Retain existing `--morrovia-radius` ownership; do not make mobile sheets or product-tour device frames share another shape. |
| Pill and chip | 999px and 99px declarations | Intentional exception | Retain. A pill is not a control/card radius role. |
| Circle | 50% declarations for avatars, status marks, map pins and progress dots | Intentional exception | Retain. |
| Image and media | Dashboard trip images, route photography and product-tour device/screen frames | Intentional exception | Retain local curvature. |
| Map/canvas controls | Map docks, markers, route labels and asymmetric pin shapes | Intentional exception | Retain product-owned geometry. |
| Product-specific composition | 6–13px compact anatomy and 16–38px editorial/artwork treatments | Undecided | Leave unchanged until the owning component proves a recurring semantic role. |

## Shadow classification

| Semantic family | Representative owners | Classification | Decision |
| --- | --- | --- | --- |
| Keyboard focus elevation | Exact `0 0 0 3px var(--morrovia-focus-ring)` across controls and interactive product surfaces | Canonical migration candidate | Introduce one complete `--morrovia-focus-shadow` role because the same semantic job recurs 29 times, no existing token represents the full shadow, and the value is already documented as the canonical focus treatment. |
| Overlay/dialog elevation | Confirmation dialog, date-picker popover, product tour and navigation popovers | Canonical where already tokenised | Keep `--morrovia-shadow-overlay`; ordinary panels must not borrow it. |
| Standard panel elevation | Account, Dashboard, Overview, Routes and Builder subtle elevations | Undecided | Keep local. Similar values do not yet prove one semantic owner. |
| Floating Map controls | Map actions, markers, sheets and spatial cards | Intentional exception | Keep product-owned elevation and combined focus/elevation stacks. |
| Image/artwork treatment | Product-tour device, illustration and media treatments | Intentional exception | Keep local. |
| Hover elevation | Page-owned card/action hover shadows | Undecided | Keep local until a shared component owns the interaction. |
| Intentional none | Flat cards and Builder review overrides | Intentional exception | Retain `none`; convergence must not add elevation. |

## Width classification

| Semantic family | Occurrences | Classification | Decision |
| --- | ---: | --- | --- |
| Canonical editorial page gutter copied into Storybook contexts | 5 | Canonical migration candidate | Derive the same gutter from `--morrovia-page`. |
| Builder workflow width | 2 | Intentional product boundary | Retain. Builder is documented as a focused-workflow width exception and must not be coupled to the editorial page token merely because the current maximum is also 1180px. |
| Dashboard responsive breakpoint | 1 | Undecided/local composition | Retain. A breakpoint is not a page-width owner and custom properties cannot safely replace media-query thresholds. |
| Map/fullscreen/canvas and narrow reading widths | 0 audited copies of 1180px in this rule | Intentional exception | Keep their existing local sizing. |

## Selected migration wave

- Exact-value Builder panel and compact-interaction families.
- Shared co-pilot, date-picker and Dashboard compact surface owners where the semantic role is explicit.
- The recurring 3px keyboard-focus shadow.
- Five Storybook-only copies of the canonical editorial width.
- Foundations/Audit documentation and focused audit enforcement tests.

No universal card, new panel elevation, width abstraction, product behaviour or page composition is introduced.

## Final audited outcome

| Rule | Before | After | Verified reduction |
| --- | ---: | ---: | ---: |
| `raw-radius` | 651 | 624 | 27 |
| `raw-shadow` | 231 | 202 | 29 |
| `raw-page-width` | 8 | 3 | 5 |

The accepted per-file baselines were lowered only for those verified removals. The strict audit continues to report local radius, shadow and width debt; it has not gained a broad exception or a relaxed matcher.

## Responsive evidence

The Storybook viewport fixtures were inspected at exact canvas widths, with the live `/journey/about` route used for the public-page check because its Storybook fixture currently lacks the Next App Router context.

| Width | Representative surface | Result |
| ---: | --- | --- |
| 320px | Trip workspace Overview and account/profile | No horizontal overflow; compact controls retain the 10px control radius. |
| 390px | Live About page, Builder review and shared mobile dialog | No visible layout shift, density change or shape regression; focused dialog action retains the complete 3px ring without clipping. |
| 768px | Trips Dashboard | No horizontal overflow or breakpoint regression. |
| 1024px | Trip workspace Overview | No horizontal overflow or changed panel density. |
| 1440px | Trip workspace Itinerary | No horizontal overflow or wide-layout regression. |

The shared-controls fixture was also checked with keyboard focus: the computed value remains `rgba(244, 43, 122, 0.24) 0px 0px 0px 3px`. Canonical computed radii remained 10px for controls and 14px for panels.

## Validation

- `npm run audit:ui` — passed at 624 radii, 202 shadows and 3 copied page widths.
- `npm run test:ui-convergence` — passed (8 tests).
- Focused surface/component/presentation suite — passed (39 tests).
- `npm run typecheck` — passed.
- `npm run build-storybook` — passed; the visual inventory was regenerated.
- `npm run build` — passed.
- `git diff --check` — passed.

The About Storybook fixture's pre-existing `app router to be mounted` console error remains outside #208's surface-token scope; the production route renders correctly and supplied the public-page responsive evidence.

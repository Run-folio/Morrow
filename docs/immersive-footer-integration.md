# Immersive homepage footer integration — 2026-09-07

The closing CTA and shared semantic footer now occupy one continuous photographic chapter. Ready for staging enablement; nothing pushed, enabled remotely or deployed.

## Structure and presentation

Previously the Journey layout rendered the shared footer after the homepage, on a pale background. The closing chapter now composes the same `MorroviaFooter` with an `overImage` treatment. The layout omits its footer only when the immersive homepage actually renders. Other Journey pages retain their standard footer. Browser checks confirmed one semantic footer on the homepage and one standard footer after navigating to Terms.

The photograph, CTA wording and action are unchanged. The chapter uses `min-height: 100svh` and natural height, with a continuous indigo gradient (48% at the top, 58% halfway, 88% at 78%, 94% at the bottom). No opaque panel or new animation was added. Desktop retains wordmark / identity / navigation columns; up to 840px the footer stacks. All seven links, copyright and operator identity remain intact. Image credits remain in a separate 44px-high utility action above the footer and were opened successfully.

Mobile footer links retain 44px minimum height. Bottom padding is `100px + env(safe-area-inset-bottom)`. A page-scoped rule removes duplicate body dock padding, keeping the photograph at the bottom edge. Checked 320, 390 and 430px. The safe-area CSS is present; these desktop browser captures do not emulate a physical device notch.

## Accessibility and checks

Keyboard focus on Terms uses the paper-white outline, confirmed from computed style and screenshot. The photographic footer remains a `<footer role="contentinfo">` with its named legal navigation. No legal content was duplicated or removed.

Actual-image contrast was calculated by compositing the existing photograph and gradient over the observed desktop text rectangles (1422×800 browser viewport), using the brightest background pixel in each rectangle: eyebrow 4.99:1; large CTA heading 4.50:1; image credits 12.33:1; footer 12.63:1. Button ink/paper contrast is 15.09:1. This is targeted contrast verification, not a claim of a whole-site accessibility certification.

- 25 homepage, immersive route-content and legal-runtime tests passed.
- Strict UI convergence audit passed.
- Typecheck passed after build generation completed.
- Production `build:check` passed.
- Storybook build passed; the new ImmersiveClosing story was visually compared with production.
- `git diff --check` passed.

Reused shared components: MorroviaFooter and EasyTButton. Extended only the footer's photographic treatment. Added one composed Storybook example. No new shared primitive or token was introduced. Four-route publication/content work was preserved.

## Files changed for this refinement

- app/journey/layout.tsx
- app/journey/home/immersive/closing-chapter.tsx
- app/journey/home/immersive/immersive.module.css
- components/morrovia-footer.tsx
- components/morrovia-footer.module.css
- components/morrovia-footer.stories.tsx

## Captures

The page was rendered at each labeled CSS width inside a scaled review iframe. The lavender outside the frame belongs to the review harness, not the product. Baseline captures focus the footer and crop part of the upper CTA; the after captures show the complete closing composition. Separate focus captures deliberately scroll toward the footer.

### 390px

Before:

![Before 390px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/before-390.png)

After:

![After 390px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/after-390.png)

### 768px

Before:

![Before 768px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/before-768.png)

After:

![After 768px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/after-768.png)

### 1440px

Before:

![Before 1440px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/before-1440.png)

After:

![After 1440px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/after-1440.png)

### 1920px

Before:

![Before 1920px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/before-1920.png)

After:

![After 1920px](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/after-1920.png)

### Keyboard focus

![Mobile legal focus](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/focus-390.png)

![Desktop legal focus](/Users/shaun/Documents/Morrovia/artifacts/immersive-footer/focus-desktop.png)

# Mobile card return-focus fix

Base local evidence88f3dbf; current deployed staging6ce583d. Fix the reproduced390px
Escape return where Edit activity is focused at y0.7..44.7 under sticky navigation.

- Preserve canonical mutation owners, rename/async acceptance, recovery and privacy.
- Reuse existing --morrovia-sticky-content-offset for original/replaced card targets.
- Focus without native scrolling, then reveal nearest target instantly with CSS
  clearance, preserving reduced-motion behavior and avoiding unrelated page jumps.
- RED: extracted production callback + original/replaced/missing/wrong-day/editor
  state and CSS token contracts. Three failing checks witnessed, then65 focused
  checks pass after the patch.
- Include the5 regression checks in the full release gate; no rule/guard removed.
- Independent review before staging push. Run broad regressions, typecheck, strict
  UI audit, Storybook build and full release:gate. Never promote production.
- Verify actual390px/320px/desktop Save/Escape focus clearance on the hosted new
  deployment's separate origin using a new synthetic guest trip; never existing
  staging drafts. Preserve deterministic screenshots/rect measurements.
- Signed-in assessment: only shared seed accounts are documented; no .env.staging
  configured locally and no dedicated disposable account proven. A separate origin
  isolates browser stores, not shared account records. Do not sign in or seed/reset
  shared accounts; record this remaining gate explicitly.

# Contextual Add dialog audit gate

1. Verify the isolated checkout at Map commit `460f442e` and inspect the itinerary Add dialog, shared feedback primitives, Storybook, and strict audit rule.
2. Add a minimal shared content-dialog owner for native modal focus, Escape, backdrop dismissal, and focus return. Keep itinerary Add content and responsive layout in their current owners.
3. Replace the itinerary native element and local modal lifecycle with the shared primitive. Preserve Add state reset and canonical daypart handlers.
4. Cover the shared primitive in Storybook and exercise the composed #386/#387 browser paths, accessibility, mobile/desktop screenshots, strict audit, typecheck, build, Tier 1 and Transport regression.

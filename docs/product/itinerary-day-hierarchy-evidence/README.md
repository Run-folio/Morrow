# Itinerary day hierarchy: matched local evidence

Captured from the real `TripItineraryWorkspace` Storybook production component. `before` uses accepted staging source `e2f4c7e82aab29746764204e80ba65bff5cf546d`; `after` uses this branch. The focused Tokyo and Seoul fixtures are identical between captures. They reuse the existing route fixture, so other route names, imagery and fixture suggestions are outside this comparison.

| State | 390 px | 430 px | 1440 px |
| --- | --- | --- | --- |
| Tokyo populated | [before](before-tokyo-390.png) · [after](after-tokyo-390.png) | [before](before-tokyo-430.png) · [after](after-tokyo-430.png) | [before](before-tokyo-1440.png) · [after](after-tokyo-1440.png) |
| Seoul empty | [before](before-seoul-390.png) · [after](after-seoul-390.png) | [before](before-seoul-430.png) · [after](after-seoul-430.png) | [before](before-seoul-1440.png) · [after](after-seoul-1440.png) |
| Tokyo multiple activities | [before closed](before-multiple-390.png) · [after closed](after-multiple-390.png) | — | [before closed](before-multiple-1440.png) · [after closed](after-multiple-1440.png) · [before open](before-multiple-open-1440.png) · [after open](after-multiple-open-1440.png) |

The browser regression also checks both states at 768 and 1024 px, the existing Spanish labels, mobile target size, editor keyboard controls, a new activity assigned to Afternoon and Undo. Captured document-level horizontal overflow was zero at each width. The map in Storybook can show its loading/fallback state because live map tiles are outside this presentation fixture.

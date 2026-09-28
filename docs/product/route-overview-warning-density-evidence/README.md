# Route Overview warning density · local founder review

Matched production Storybook component, Peru route fixture, 28 September 2026. The before captures temporarily used the preceding local HEAD's Overview component, issue projection and CSS against the same `ThreeRouteFindings` trip fixture. Those files were restored before the after captures. No canonical route data changed between captures.

| State | Capture |
|---|---|
| Healthy desktop | [1440px](healthy-route-check-1440.png) |
| Three route findings, before | [390px](before-three-route-findings-390.png) · [1440px](before-three-route-findings-1440.png) |
| Three route findings, after | [390px](three-route-findings-390.png) · [1440px](three-route-findings-1440.png) |
| Mixed route and transport | [390px](mixed-route-and-transport-findings-390.png) · [1440px](mixed-route-and-transport-findings-1440.png) |
| Five findings, expanded | [390px detail](many-route-findings-390-expanded.png) |

For the same three-finding route at 390px, the old warning stack measured **164px** and showed **two** bordered findings with two “Review timing” links; the third was capped. The single new Route check panel measures **126px** and shows **all three** findings. At 1440px, the warning region changes from **44px** with two findings to **68px** with three; the new panel uses one border and three columns. Measurements are CSS pixels from the rendered warning container.

The first two location cards remain **136 × 210px** at 390px and **154 × 210px** at 1440px in both captures. The 390, 430, 768, 1024 and 1440px Storybook checks found no page-level horizontal overflow. [Before measurements](before-measurements.json) and [after measurements](measurements.json) retain the per-state evidence.

Storybook states: `HealthyRouteCheck`, `OneRouteFinding`, `TwoRelatedTransportFindings`, `ThreeRouteFindings`, `MixedRouteAndTransportFindings`, and `ManyRouteFindings` in `Morrovia/05 Product Patterns/Trip workspace/Overview`. All render the production Overview component and derive checks from the canonical trip health projection.

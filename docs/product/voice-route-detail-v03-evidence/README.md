# V03 Route Detail visual acceptance

Production component: `RouteDetailView` in Storybook state `Morrovia/05 Product Patterns/Routes/Route detail / Standard Andean`.

Local story URL: `http://localhost:8788/iframe.html?id=morrovia-05-product-patterns-routes-route-detail--standard-andean&viewMode=story`

| Viewport | Before | After |
| --- | --- | --- |
| 390 × 844 | [before-390.png](before-390.png) | [after-390.png](after-390.png) |
| 430 × 932 | [before-430.png](before-430.png) | [after-430.png](after-430.png) |
| 1440 × 900 | [before-desktop.png](before-desktop.png) | [after-desktop.png](after-desktop.png) |

All captures use the same story, viewport, and device scale of 1. The redundant helper appeared once before and zero times after. The rendered hero action still has the `Use this route` name and `/journey/new?inspire=andean-highlands` destination. Its measured height is 44px on both mobile widths and 56px on desktop. Document scroll width equals viewport width in each after state. `Sources & review` remains in the rendered page. The same source and route-handoff tests verify the substantive closing guidance and preserved handoff behavior.

The Route Detail surface currently has no Spanish locale wiring, so the approved Spanish removal direction changes no rendered string in this batch.

The optimized local application was also opened at `/journey/routes/andean-highlands` at 390px, 430px and 1440px, plus the longer `japan-slow` route at 390px. Each page retained the correct route-specific Builder handoff, source disclosure, a 44px or larger hero action, and no horizontal overflow. The removed helper did not appear.

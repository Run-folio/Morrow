# Shared app motion reconstruction

Baseline: 49a0f7c. Reconstructs the explicit Nov17 interaction contract; historical local d265fe4 was not recoverable in accessible repositories. No swipe deck, provider, data, auth or route-state changes.

## Controls
MotionButton and opt-in MotionLink preserve native hosts, refs, existing element children, classes, handlers, disabled/ARIA semantics. Raw text gets a visual span. One shared 340ms spring animates children only, not target geometry; immediate pointer/keyboard events do not wait on animation. SVG icons participate. Reduced motion skips effects and cancels running ones. Repeated keydown is excluded.

EasyT controls, segmented choices, button-links, workspace navigation, raw Home/Builder/night/menu/quantity/calendar, profile/signout, Help/tour/feedback, trip planner/list, regular legacy journey/map toolbar and CTA controls use the adapter. Native selects retain platform feedback. Ordinary links, map DOM markers/pins, explicit drag handles, draggable timeline, backdrops, disabled/busy controls are excluded. Administrative support tools and decorative homepage demos are not part of the customer app interaction rollout.

## Entry reveals
Shared EntryReveal is an inert hidden sentinel: no layout wrapper, no blocked actions, never hides content. 420ms progressive children (45ms offsets capped180ms), only on entry/opening. Builder header and route feedback, itinerary toolbar, date rows, mobile sheets, expanded transport details, first nonempty autocomplete batch. The gate stays mounted across pending/replaced search results, so refining the query doesn't replay. Keyboard/pointer input cancels pending reveals immediately; automatic focus does not cancel them. No scroll/drag/map panning animation.

Selected date visual is a34px circle inside the unchanged full-cell native target. Half-range track and native focus ring remain.

## Verification
Policy regression red before implementation, green after: first ready batch only, no pending/refinement replay, reset on close, disabled/reduced/excluded gates.
Date fixture maps new DOM-only adapter to native host; all prior date semantics assertions retained.43 affected tests pass;21 opt-in browser skips. Existing morrovia-controls Travel style source assertion fails on untouched49a0f7c baseline as well; not edited to hide it.
Typecheck and strict UI audit checked. Existing native debt baseline only reduced; central primitive has narrow documented native-host exception. Shared motion Storybook includes full-width, icon-only, disabled, button-link, query/reveal and native hit-rectangle assertions. Real-browser/production-build proof still required on final integrated artifact.

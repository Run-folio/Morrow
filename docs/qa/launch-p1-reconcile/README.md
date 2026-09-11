# Launch P1 reconciliation visual QA

Validated on 11 September 2026 against `codex/launch-p1-reconcile`, based on
`origin/staging` at `7e5d092c09745bc44b63cabb35e3a9517a792160`.

## 390px

- `mobile-homepage.png`: upstream Morrovia brand and editorial Homepage cleanup
  remain present; the compact menu trigger is the only global mobile navigation
  chrome and no bottom dock covers the map or editorial cards.
- `mobile-nav-open.png`: the menu expresses New trip, Trips and Routes first,
  followed by More and Account groups; the complete sheet fits a short 844px
  viewport and remains scrollable by implementation.
- `mobile-builder-step1.png`: the Builder uses the solid neutral/paper treatment,
  retains the compact header, and has no duplicated bottom navigation.
- `mobile-builder-nights.png` and `mobile-builder-nights-scrolled.png`: all stops
  use the same destination, transfer and stay bands; long-lived Builder actions
  remain reachable and no global dock competes with them.
- `mobile-contact.png`: the Contact heading, fields and guidance wrap without
  horizontal clipping.
- `mobile-active-trip.png`: Overview, Map and Itinerary remain the trip-local
  navigation, separate from the compact global menu.

Chrome device emulation reported `innerWidth = scrollWidth = 390` for Homepage,
Builder Step 1, Builder Nights, Contact, global navigation and active-trip
navigation. Builder Nights was additionally checked while scrolled through all
three stop cards.

## Desktop

- `desktop-homepage.png`: upstream logo, editorial layout and crop treatment are
  retained alongside the planning-first global navigation.
- `desktop-nav.png`: New trip, Trips and Routes are primary; secondary links are
  behind More; Sign in/account and language remain distinct.
- `desktop-builder-nights.png`: the existing table presentation is retained.
- `desktop-contact.png`: the form remains bounded and aligned with the shared
  shell.

Chrome reported `innerWidth = scrollWidth = 1440` for the captured desktop
Homepage, navigation, Builder Nights and Contact states.

## Result

No horizontal overflow, duplicated global mobile navigation, bottom-dock
obstruction, stale pre-brand logo, or collision with the active-trip tabs was
observed in the required evidence set.

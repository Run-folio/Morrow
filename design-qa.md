# Builder editorial-system QA

## Comparison target

- **Source visual truth:** `/Users/shaun/Documents/Moro design/Codex Image Aug 14, 2026, 06_51_41 PM.png` (Confirm), `/Users/shaun/Documents/Moro design/Codex Image Aug 14, 2026, 07_45_45 PM.png` (Route), and `/Users/shaun/Documents/Moro design/Codex Image Aug 14, 2026, 07_45_53 PM.png` (Time).
- **Implementation:** browser-rendered `http://localhost:3010/journey/new`.
- **Viewports:** desktop default browser viewport (1280 × 720 CSS px); mobile 390 × 844 CSS px. Device density was browser-default; no density normalization required because this review compares layout and rendered UI, rather than a pixel-for-pixel exported mock.
- **State:** empty new-trip state for Confirm and Route; the Route step was opened directly to verify the visual shell and no browser console errors were recorded.

## Full-view and focused evidence

- Confirm desktop shows the editorial display type, three-step route rail, structured intake card, right-hand illustrated reassurance, and retained functional trip inputs.
- Confirm mobile shows a single readable flow: brand, compact progress rail, display heading, intake review, then the existing mobile dock.
- Route mobile shows the map/route-decision composition before the existing destination-selection experience. The empty-state recommendation correctly does not invent stops.

## Required fidelity surfaces

- **Fonts and typography:** display hierarchy now uses the shared Morrovia serif family; navigation, labels and controls retain the existing readable UI/mono system. The large display heading wraps deliberately at 390 px.
- **Spacing and layout rhythm:** the desktop build uses a 1180 px shared frame, a restrained step rail, a two-column confirmation composition, and a one-column mobile flow. No primary control is clipped at the tested viewport.
- **Colors and visual tokens:** shared indigo, pink, pale lilac, muted copy and hairline tokens are centralised in `app/journey/journey-design.css` and consumed by the builder overrides.
- **Image quality and asset fidelity:** the existing Morrovia route illustrations are used as raster assets for Confirm and Route. No placeholder illustration, CSS drawing or replacement logo was introduced.
- **Copy and content:** the source’s decision-focused language is retained: “Tell us the shape”, “Choose the journey that feels right”, “Make the time feel right”, route order, nights and trade-offs. Existing Spanish localisation and planning controls remain in place.

## Findings

No actionable P0, P1 or P2 fidelity issues were found in the tested empty-trip states.

- [P3] The Route decision cards are intentionally sparse until a traveller has added stops.
  - Location: `app/journey/new/trip-builder.tsx`, Route step.
  - Evidence: an empty trip can only truthfully show the neutral route image and no sequence.
  - Follow-up: use a populated saved trip during the next QA pass to tune long place names and 4–6-stop wrapping.

## Primary interactions tested

- Navigation to `/journey/new`.
- Confirm → Places step transition.
- Responsive rendering at 390 × 844.
- Browser console error check (none found).

## Implementation checklist

- [x] Add shared editorial foundations.
- [x] Apply the system to Confirm, Route and Time builder steps without replacing planner state.
- [x] Preserve existing inputs, progress navigation, localisation and mobile dock.
- [x] Validate production build.

## Comparison history

1. Implemented shared tokens and the editoral builder shell; added a route-decision stage while retaining existing route intelligence controls.
2. Captured desktop Confirm and mobile Confirm/Route states; verified the mobile stacking and route-step navigation.

**final result: passed**

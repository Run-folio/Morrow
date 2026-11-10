# Calendar location imagery implementation plan

**Goal:** Implement the approved calendar and mobile concepts on staging f9eb209, with location imagery, relevant item photos, prominent dates and Day labels at top right.

**Architecture:** Retain the canonical calendar projection, occurrence IDs, dialog, controls, persistence and image-credit owners. Change presentation only; location photos use stopById, item photos require exact reviewed subject and geography. Missing hotel photo provenance means no fabricated hotel photo.

**Spec:** Approved desktop libfile_8a6036785ff08191b129b94660864497 and mobile libfile_0e4523edf2dc819188a85c6446d98972; latest Day label top-right supersedes date-label vertical gap.

- [ ] Add focused tests for exact item-photo matching, missing-photo fallback and occurrence-bound headers; implement pure reviewed item image selector.
- [ ] Move calendar imagery from day covers into location bands and item rows. Use shared photo/credit rendering outside item buttons. Keep all click/drag/selection controls.
- [ ] Stabilise selected-day hero at location level. Give dates clear hierarchy and right-aligned Day label; increase mobile period spacing without hiding controls.
- [ ] Update representative stories; run focused tests, typecheck, UI audit, Storybook and release gate.
- [ ] Review, push staging only, verify hosted desktop/mobile keyboard, selection and save/reload. Record provider/image limits and leave production untouched.

**Review focus:** repeated names retain stop IDs; no supplier photos without provenance; credits remain operable outside buttons; 320px labels/actions fit; selected-day sync and booking protection stay intact.

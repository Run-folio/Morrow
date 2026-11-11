# Approved visual parity implementation plan

> **For agentic workers:** Use superpowers:executing-plans for the integrated changes; independent component work may use dispatching-parallel-agents.

**Goal:** Close the approved mockup/build gaps without removing trip capabilities.
**Architecture:** Restyle and compose existing production owners, controls, licensed photo components and disclosures. Preserve canonical trip data, save/recovery, selection and provider contracts.
**Tech Stack:** Existing Next/React/TypeScript/CSS modules, Storybook and Playwright.
**Spec:** User-approved references in `/Users/shaun/Documents/Codex/2026-11-10/task/visual-parity/references/`, latest Location/no Trip saved/top-right Day/bordered day feedback, plus AGENTS and docs/design-system.md.

## Global constraints
- Staging only; never production. No fabricated photos, inventory, dates or booking states.
- Reuse EasyT controls, MorroviaContentDialog/disclosures, ItineraryDayPhoto and photo credits.
- Preserve all existing controls, recovery warnings, selected-day/stop identity, keyboard/focus, privacy and provider disclosures.
- Keep copy lean and decision-critical uncertainty visible. Do not redesign shared product navigation merely because concept chrome is simplified.

## Review focus
- 320/390/430/768 widths, long names and no/missing/failed images.
- Booked vs selected vs shortlisted stays and repeated stops.
- Dialog dismissal, active-day changes and returning focus.
- Manual activity/daypart edit, reload and canonical persistence.
- Actual generic provider handoff limitations and attribution.

## Tasks
- [x] Mobile days: image-overlay location/nights/map header; strong date/top-right Day; icon/label/Add rows with generous targets; compact Notes and Suggestions disclosures preserving content/actions. Owners: trip-itinerary-workspace(.module.css), rich-itinerary-day-planner(.module.css). Test existing daypart/add/selection flows and responsive Storybook.
- [x] Stay: prioritise actual shortlist and prominent selected-property handoff; compact location/date/property/booking facts; retain finder/map/details/selection/remove controls below or in disclosure. Owners: trip-stay-workspace, stay-shortlist, accommodation-stay-handoff, shared recommendation detail only where safe. Test exact generic link/copy, saved selection/reload and dismissal.
- [x] Today: overlay location hero on mobile, date-aligned day badge, timeline and compact stay/transport context. Retain local-date basis, empty/error/preview, booking distinctions and actual links. Owner: trip-today-workspace(.module.css), stories. Test date/read-only existing cases.
- [x] Starter: compact editorial rows, location control, mobile underline tabs, restrained headings and footer; preserve explicit choose-day flow, save-later, shortlist and provider links. Owners: trip-starter(.module.css), trip-starter-stays, isolated inventory row composition and stories. Test scheduling race/dismissal and real provider states.
- [x] Calendar polish: stronger date hierarchy/top-right Day and unified borders, compact item imagery, preserve all calendar navigation/drag/detail controls.
- [ ] Validate focused behavior tests/typecheck/audit:ui/Storybook/application build; compare matched desktop/mobile actual screenshots to references, record intentional functional differences and design-qa.md; review, push staging and verify exact hosted commit.

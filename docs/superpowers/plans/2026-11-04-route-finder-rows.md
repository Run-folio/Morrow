# Route finder rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Shaun's approved balanced route rows and evidence-based transport pills.
**Architecture:** Extend existing RouteItem, shared controls, DiscoveryPhoto and source projection. Keep interests distinct from connection-mode summaries; omit summaries for incomplete records.
**Tech Stack:** Existing Next.js, React, CSS modules, Node tests and Storybook.
**Spec:** Parent delegation of 2026-11-04, including Shaun's approved mockup direction and “Ok” to the label correction.

## Global Constraints
- Isolated local change only; no deploy, route removal, publication-gate change or persistence change.
- Route information left; duration, stops and action right; no row numbers.
- Rail-focused, By road and Mixed transport only with a unique recorded connection for every adjacent stop pair. Bus counts as road; no inference from interests or country count.
- Pills use distinct restrained existing palette mixes and readable text. Preserve existing interest/filter memberships except unsupported Slow travel.

## Review Focus
Incomplete/duplicate/extra/wrong-direction connections omit pills; repeated stop names remain occurrence-safe through adjacency order checks; unknown legacy style values recover to all; long multi-country names and 320px widths wrap; photo-credit and preview/detail controls remain separately keyboard operable.

### Task 1: Transport and interest semantics
- [x] Add failing source-data tests covering every public route, adjacency gaps, duplicates, unsupported modes and legacy filter recovery.
- [x] Replace discoveryCharacter inference with nullable transport projection and normalize unsupported interests to all; remove Slow travel option.
- [x] Pass relevant discovery tests and typecheck.

### Task 2: Balanced rows
- [x] Extend RouteItem, reusing EasyTButton, EasyTLinkButton, DiscoveryPhoto and existing token colours; remove row numbering, place countries and transport pill beside each other, route/title/sequence left and facts/action right.
- [x] Reuse one transport-pill owner in rows, preview and editorial carousel. Null evidence renders nothing.
- [x] Add Storybook gallery specimens at 320,390,430,768 and1440 plus transport states.
- [x] Run audit:ui, Storybook build and focused tests; verify browser geometry/keyboard/focus at required widths in isolated fixture preview, because static tests cannot validate the revised visual layout.

### Task 3: Independent review and handoff
- [x] Fresh reviewer examines source semantics, filters, responsive and keyboard changes; resolve findings.
- [x] Preserve separate patch, screenshots and exact verification report; no merge or deploy.

## Decisions
Use full-width gallery rows to make room for the approved left/right balance; map rail and legacy featured cards keep their existing responsive roles. Transport classification describes recorded planning modes, not live service availability; confidence and booking warnings remain with existing detail owners. Removing Slow travel retains all routes and changes no stored trip pace preferences. Existing baseline failures were investigated in baseline-failure-investigation.md and are outside this change.

# Approved static voice copy: local integration manifest

This manifest records isolated local commits for the approved static-copy pass in [the corrected review](voice-and-ux-copy-review.md). It is not a combined release candidate or staging approval. Cherry-pick each owner commit onto the eventual integration base and run combined regression and end-to-end acceptance there. No branch here was pushed or deployed.

| Owner / branch | Accepted source SHA | Local output commit | Entries |
| --- | --- | --- | --- |
| Public and Builder / `codex/voice-public-creation` | `4623f33a5efeee1b28aee3277ad00530fc9b7386` | `a8649ed4aa2150820ad8b6c295243513a343d1d6` | V01, V02, V04, V07 |
| Stay, Transport and Map loading / same branch | `a8649ed4aa2150820ad8b6c295243513a343d1d6` | `4b7abc57edb6788d3df7fb687115299299d58017` | V16, V17, V22 |
| Overview / `codex/voice-overview-v09` | `74956c2743dfc2fede54813765b7deefa668d6a8` | `2b4ee7562fec3f7859af456dd4c55c91675bcce4` | V09 |
| Trips library / `codex/voice-trips-v12` | `eff90f0955b2bd9b3fbf1c9bb5062d92c1b73e48` | `f04a346f09f7488ff62e6b3173a69a98169251a8` | V12 |
| Shared TripShell / `codex/voice-shared-shell` | `42a6986a487a39abae23c3086d0728c5463ac908` | `d8a36f1d6591feb9c5dc79037ad3b35c9ff0d4f4` | V18, V19 |

V03 remains accepted on its separate Route Detail branch at `8d69612277cb1789ec51238f5687da415f8c9982`; this pass did not edit its layout, headline, imagery or handoff. The review's KEEP entries V05, V06, V10, V11 and V13 are unchanged. V08 is gated on authoritative date data. V14/V15 belong to Explore empty/retry behaviour; V20/V21 belong to contextual feedback. None of these deferred items is marked complete by the static-copy commits.

## Behaviour and locale boundaries

- V07 uses the existing total, allocated count and complete state. Its status distinguishes under, over and complete, with singular/plural English and Spanish. Night stepper callbacks, severity, blocking and persistence are unchanged.
- V04's one-sentence introduction is consistent in both supported nights-known and no-nights discovery states; selection controls and source evidence are unchanged.
- V09 retains the state-dependent primary action, route checks, warnings and card geometry. V12 keeps the `/#start-building` destination and does not require exact dates. V16 keeps the finder retry callback. V17 keeps estimate uncertainty and selected-leg details. V19 changes only the acknowledged account-success banner; pending, device, failure and recovery states retain their existing ownership.
- Existing Spanish wiring covers V01, V04, V07, V12 and V17. Spanish wiring is absent at the specific V02, V09, V16, V18, V19 and V22 owners; the review's proposed Spanish copy is not represented as implemented there. No localization framework was added.

## Visual evidence

Post-change production-component Storybook captures are stored with their owner commits: Public [Home 390 EN](voice-copy-evidence/home-en-390.png), [Home 1440 ES](voice-copy-evidence/home-es-1440.png), [Routes 390](voice-copy-evidence/routes-empty-390.png), [Discovery 430 ES](voice-copy-evidence/discovery-es-nights-430.png), [Builder 390 EN](voice-copy-evidence/builder-under-en-390.png), [Builder 1440 ES](voice-copy-evidence/builder-over-es-1440.png), [Stay failure 390](voice-copy-evidence/stay-failure-390.png), [Transport 430 ES](voice-copy-evidence/transport-es-430.png) and [delayed Map 390](voice-copy-evidence/map-delayed-390.png). The Overview, Trips and TripShell branches carry their own 390/430 and desktop captures under `docs/product/voice-copy-evidence/`, including the [confirmed account banner at 390](../../../../voice-shared-shell/Morrovia/docs/product/voice-copy-evidence/shell-390-status-banners.png) and [desktop](../../../../voice-shared-shell/Morrovia/docs/product/voice-copy-evidence/shell-1440-status-banners.png).

Before specimens from the accepted source/review are [Overview 390](../../../../route-overview-cta/Morrovia/docs/product/route-overview-cta-evidence/after-mobile-390-top.png), [Overview desktop](../../../../route-overview-cta/Morrovia/docs/product/route-overview-cta-evidence/after-desktop-detail.png), [Trips 390](../../../../skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/empty-trips-current-390.png), [Trips desktop](../../../../skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/empty-trips-current-1440.png), and [Transport 390](../../../../skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/transport-current-390.png). These earlier review captures are comparison specimens, not a claim of pixel-matched before/after fixture state.

## Local checks

All four output candidates passed `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook` and `git diff --check`. Focused suites: public/Builder 49 passed, 13 browser-opt-in skipped; discovery/clarification 57 passed, 29 browser-opt-in skipped; Overview 24 passed; Trips 32 passed; shared shell 24 passed. In Storybook, the Builder night stepper changed 2 left → 1 left → All allocated; Stay's Try again remained enabled and clickable; Trips' EN and ES Plan a trip links retained `/#start-building`. Inspected captures at 390/430 and desktop had no document horizontal overflow.

Four unrelated structural assertions in `tests/homepage-dual-entry-presentation.test.ts` and `tests/loading-state-rollout.test.ts` also fail on the untouched `4623f33` source. They remain visible and unweakened: the two-file run reports 17 passed / 4 failed. They are not evidence that the copy pass broke runtime behaviour, but the combined candidate should reconcile the stale assertions before release.

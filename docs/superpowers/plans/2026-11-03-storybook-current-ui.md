# Current UI Storybook Synchronization Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; use a fresh whole-branch reviewer. Read-only audit agents may research independent coverage and fixture boundaries.

**Goal:** Reconcile Storybook with candidate8f71bae and qualify representative current core UI, failure and responsive states without altering production behavior.

**Architecture:** Stories render existing production components with isolated synthetic fixtures. State transitions use real production controllers/persistence boundaries; only external services and explicitly failing storage operations are mocked. A local Playwright/axe runner checks rendered stories and records exact scope, failures and screenshots.

**Tech Stack:** Existing Storybook10.5/Next-Vite, TypeScript, Playwright1.62 and axe-core4.12. No installs or hosted changes.

**Spec:** Parent delegation: repair stale Home story; audit current UI coverage; add quota retry, denied storage, completed creation, mobile metadata and key interaction/a11y cases; build and verify; report gaps; no push/deploy.

## Global Constraints

- Separate local branch from8f71baec01298fc427ce7b19389951734028e57d; preserve deployment and existing previews/data.
- Actual production components and design tokens only; no persistence/owner/recovery guard changes or fake retry success.
- Synthetic isolated browser data only; no account/provider calls, grants, uploads, deployment or new dependencies.
- Keep security settings/CI untouched. Retain known accessibility debt visibly rather than suppressing checks to manufacture green.

## Review Focus

- A story's controls must cause real observable changes, not satisfy no-op callbacks.
- Storage fixtures restore globals and durable synthetic state without cross-story leakage.
- Quota refusal preserves the canonical base; explicit retry changes only the refused intended edit.
- Completed creation URL must reopen current accepted state, not replay its initial seed.
- Mobile dates/details stay visible; keyboard/focus and long/zero-night controls retain semantics.

### Task1: Current coverage and stale composition

Files: Home immersive stories; core shell stories; generated visual inventory; coverage documentation.

- [x] Audit all story/component families and recent diffs; map covered, static, interactive and outside-Storybook states.
- [x] Observe stale Home Personalize play fail; replace with direct Travellers interaction and assert count changes. Add mobile metadata visibility/keyboard assertions to real shell fixtures.
- [x] Build indexed catalogue and run focused plays; regenerate the inventory through its official script.

### Task2: Trustworthy recovery and storage fixtures

Files: dedicated current recovery stories and test-only Storybook fixture helpers, existing privacy stories where appropriate.

- [x] Observe missing/failing representative states before changing their fixture coverage.
- [x] Add actual component/controller quota refusal→explicit retry, denied getter/read/write, and completed creation cold-entry fixtures using supported synthetic APIs.
- [x] Assert real state/canonical/recovery outcomes and lifecycle cleanup; label presentation-only cases accurately.
- [x] Run focused browser/state regressions and typecheck; preserve app source.

### Task3: Reproducible checks, inventory and final review

Files: local Storybook validation script, package script if needed, coverage/evidence documentation.

- [x] Build official Storybook and inspect warnings; run rendered catalogue smoke and representative interaction/a11y matrix at320/390/430/768/1440 plus short landscape where relevant.
- [x] Save sanitized screenshots and machine-readable exact story/check results; compare before/after and identify existing product/a11y or fixture failures by name.
- [x] Run Storybook visual-system tests, relevant persistence/consent regressions, typecheck and UI audit. Review whole branch independently; correct important findings and rerun affected checks.
- [x] Commit separate local patch; report exact base/hash, coverage and remaining limitations. No deployment.


## Qualification outcome

Source maintenance and bounded checks are complete. Official Storybook build,107Node checks, typecheck andUIaudit pass. Independent review found no fixture/source blocker; two qualification-gate findings were corrected with red→green tests. The completed78-case core pass exposed two runner-only label failures since corrected and verified in memory-only Stays cases, plus retained product accessibility findings. Final memory-only matrix23/23 passes; repaired standalone navigation2/2 additionally rerun. Full catalogue sweep was interrupted at171/1353 and not resumed after the no-browser-storage restriction. This is explicitly not a green/exhaustive catalogue qualification or production release approval.

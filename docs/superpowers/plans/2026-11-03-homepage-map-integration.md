# Homepage map integration implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; independent whole-branch review follows verification.

**Goal:** Integrate the approved October26 fixed-sample map in place of the homepage Builder/Itinerary showcase.

**Architecture:** Port only the map preview presentation onto audit candidate297df3d. Keep real planning, shared maps and audit fixes unchanged. Use existing map controls/markers/camera, bundled geography and fixed evidence-backed route data.

**Tech Stack:** Existing Next15/React19, MapLibre, TypeScript, CSS modules and Node tests; reuse dependencies.

**Spec:** October26 `homepage-interactive-20261026/PLAN.md` and November3 implementation authorization; same approved Japan4/2/4/2 sample, no saves or live routing.

## Global constraints

- No push, staging or deployment.
- Preserve audit commit297df3d and its mobile/recovery/provider protections.
- No demo guest-draft writes, account/repository access, save, live routing or provider requests.
- Preserve newer hero photography/navigation/form, fixed-sample qualification and supported estimates190/120/unknown minutes.

## Review focus

- Map unavailable: ordered list and planning CTA remain usable.
- Keyboard selection and reduced motion: equivalent state without camera animation.
- Existing typed planning input: CTA focuses it without overwriting or submitting.
- Selected featured route differs from Japan: link describes a fixed preview truthfully.
- Repeated mount/unmount: no duplicate maps, markers, timers or listeners.

### Task1: Port the isolated preview

Files: `product-demo.tsx`, `demo-map.tsx`, `product-preview-data.ts`, `product-preview.module.css`, `product-demo.stories.tsx`; narrow callsite/link edits in immersive-home/route-chapters; focused tests.

- [ ] Establish baseline and add failing fixed-preview contract tests.
- [ ] Port approved components; preserve current surrounding source and shared dependencies.
- [ ] Migrate obsolete demo assertions while retaining unrelated/regression coverage.
- [ ] Run focused data, homepage, map, lifecycle and audit-protection tests; typecheck/UI audit.
- [ ] Render actual current components locally and verify desktop1440/mobile390/320, keyboard, zoom/reset, CTA input preservation, unavailable map, cleanup and zero side effects.
- [ ] Run full Next build and Storybook build; report any baseline failures separately.
- [ ] Independent review; correct material findings and rerun affected checks.
- [ ] Commit locally and present exact revision/evidence, retaining preview and audit baseline.

## Execution ledger

Ruling: Native managed-worktree tool unavailable for this task type; created a separate Git worktree from the audit candidate instead. Audit checkout remains untouched. Reuse its dependency tree; no installation.

Ruling: Use CUA for all browser interactions. Historical terminal Playwright runner is retained as reference only; fresh mounted checks run through CUA against a test-owned local fixture and the full app.


## November3 refinements and verification ledger

- User added the attached route-row hover contrast correction and featured-story hierarchy (travel style → country names → ordered stops → existing summary). Canonical route facts and handoffs remain unchanged.
- Baseline43 focused tests passed. New preview contracts observed failing before the port; current47 focused tests pass. Typecheck and strict UI audit pass.
- Audit-protection regressions55 passed initially; current focused protection rerun retained separately. Owner lifecycle27 cases:23pass/4explicit opt-in skips.
- Full production build passed after supplying a valid local commit identity. Initial empty-identity build stopped at the existing offline marker check; no check was weakened. A final build against the completed commit remains the release qualification step.
- Fresh mounted component checks: pointer/keyboard map/list selection, zoom/reset, CTA input preservation, disabled-input anchor fallback, map unmount/remount, mobile390 reduced motion, failed-worker320 fallback. Zero storage writes, API/provider requests or page errors in isolated fixture.
- Full-app route hierarchy checked for all7 featured journeys at measured389px; no overflow. Hover baseline near-white on lavender reproduced; fixed ink/lavender measured13.94:1 and keyboard focus visible.
- Independent review found one CTA edge case, now fixed; follow-up on hierarchy/contrast reported no findings.
- Ruling: Treat disabled-input CTA fallback as material to recovery access despite the initial minor grade. Confirmed RED hash empty; GREEN hash#start-building while disabled. Enabled input keeps its value and focus.
- Ruling: Initial nested cross-origin fixture actions were unsupported. Responsive full-app interactions use only this task's isolated IAB viewport, immediately reset afterward; preserved Chrome/audit sessions remain untouched.
- Generated offline/Storybook inventory files restored to base after build checks; retain only requested source changes, not incidental regenerated inventory drift.
- No push, staging, deployment, provider data mutation, credential, auth policy or recovery-domain change.

Final focused protection run:129 cases,125pass,0fail,4explicit opt-in skips. Current full app checks:1440 desktop map ready with old switcher absent;389px all7 story hierarchies fit;358px longest title fits. Component390 reduced-motion and320failed-worker fallback pass without overflow, writes or external requests. Independent follow-up review reports no remaining findings.

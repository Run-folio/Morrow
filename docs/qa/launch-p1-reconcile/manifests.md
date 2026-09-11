# Launch P1 reconciliation manifests

Base: `origin/staging` at `7e5d092c09745bc44b63cabb35e3a9517a792160`.
Source: read-only dirty worktree at `/Users/shaun/Documents/Morrovia`.

## A. Navigation #272/#274

- Non-overlapping tracked: `app/globals.css`, `app/journey/easyt-navigation.stories.tsx`, `app/journey/journey-design.css`, `docs/design-system.md` (navigation hunks), `docs/immersive-footer-integration.md`, `docs/immersive-homepage-implementation.md`, `tests/map-trip-shell-presentation.test.ts`, `tests/navigation-information-architecture.test.ts`.
- Overlapping tracked, manually reconciled: `app/journey/easyt-navigation.tsx`, `app/journey/easyt-navigation.module.css`, `app/journey/home/immersive/immersive.module.css`, `components/morrovia-footer.module.css`.
- Generated: `components/easyt/storybook/morrovia-visual-inventory.generated.json`, `scripts/ui-convergence-baseline.json`; never copied from the old base.

## B. Builder mobile Nights #273

- Non-overlapping tracked: `app/journey/new/trip-builder.tsx`, `app/journey/new/trip-builder.module.css`, `tests/trip-builder-layout.test.ts`.
- Intentional new QA evidence: the Builder captures under `docs/qa/launch-p1-reconcile/`.
- Excluded: the old-base `docs/qa/ticket-273/` captures; fresh reconciled evidence replaces them.
- Generated: `scripts/ui-convergence-baseline.json`; never copied from the old base.

## C. Contact #271

- Non-overlapping tracked: `.env.example`, `app/journey/help/help-client.tsx`, `app/journey/help/page.tsx`, `app/journey/privacy/privacy-notice.tsx`, `app/journey/terms/page.tsx`, `app/sitemap.ts`, `docs/legal-runtime-audit.md`, `docs/privacy-operations.md`, `lib/easyt/email.ts`, `lib/morrovia-legal-identity.ts`, `tests/help-page.test.ts`, `tests/legal-runtime-foundation.test.ts`, `tests/privacy-notice-runtime.test.ts`, `tests/terms-of-use-runtime.test.ts`.
- Shared tracked: `docs/design-system.md` (Contact owner hunk) and the neutral
  Builder Step 1 surface within `app/journey/new/trip-builder.module.css`; the
  Builder source files are assigned to the Builder commit to avoid churn.
- Overlapping tracked, manually reconciled: `components/morrovia-footer.tsx`.
- Intentional new: `app/api/easyt/contact/route.ts`, all files under `app/journey/contact/`, `lib/easyt/contact-message.ts`, `lib/easyt/contact-rate-limit.server.ts`, `tests/contact-form.test.ts`.
- Generated: Storybook visual inventory; regenerated only after integration.

## D. Homepage first-party photography/performance

- Non-overlapping tracked: `lib/easyt/immersive-homepage-routes.ts`, `lib/easyt/route-editorial-imagery.ts`, `lib/easyt/route-images.ts`, `tests/route-editorial-imagery.test.ts`.
- Overlapping tracked, manually reconciled: `app/journey/home/immersive/immersive-home.tsx`, `tests/immersive-homepage.test.ts`.
- Shared overlap retained from upstream: `app/journey/home/immersive/immersive.module.css`; no photography change is required there.

## Excluded

- Every dirty deletion under `public/`, including portfolio, Rio, kiosk, Returns, Farfetch, résumé, rules, store-processing and `sw-mark.svg` assets.
- `docs/qa/featured-route-panels/`.
- `docs/qa/homepage-featured-routes/`.
- `docs/qa/routes-editorial-chapters/`.
- `docs/qa/routes-final-hierarchy/`.
- Old-base generated Storybook inventory and UI-audit baseline.

## Reconciliation-only artifacts

- Intentional new: this manifest, `docs/qa/launch-p1-reconcile/README.md`, and
  the fresh reconciled screenshots in the same directory.
- Generated from the final source state: Storybook visual inventory and the
  canonical UI-audit baseline reductions.

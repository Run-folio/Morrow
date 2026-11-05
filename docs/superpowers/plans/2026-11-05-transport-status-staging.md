# Transport status staging reconciliation

Goal: reconcile Shaun's approved status styling from 6bd573a9 onto staging 64adb5e locally, without the separate airport/saved-parts work or deployment.

Reuse the existing TransportCard badges, semantic tokens, Lucide icons and Storybook production component fixtures. Preserve booking precedence, manual-record wording, timing qualifications, saved trips, navigation and all existing staging changes.

- [x] Verify remote main/staging and baseline booking/agenda tests.
- [ ] Apply only status component/CSS delta; adapt its stories without importing prerequisite feature work; retain actual-source projection tests.
- [ ] Run focused transport, persistence, calendar and catalogue regressions, UI audit, typecheck and complete release gate on combined candidate.
- [ ] Build Storybook and check EN/ES at 320/390/430/768/1440px, two badges, keyboard expansion/focus, accessible labels, contrast and forced colours in an isolated browser.
- [ ] Review exact diff, commit local candidate and preserve bundle/evidence. Report any remaining qualification gaps. Do not push or deploy.

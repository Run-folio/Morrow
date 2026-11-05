# Baseline test reconciliation and combined integration plan

Goal: account for the ten failures reproduced on staging64adb5e and status8222f4e, prepare a reviewed test-only correction, and define safe combined integration. No deployment is authorised by this plan.

Use production source and frozen synthetic data as evidence. Do not renew the expired transport pilot, infer new services, relax geographic qualification, change saved trips or migrate identities to satisfy tests.

- [x] Reproduce all ten failures in the five owning test files before edits; preserve `ten-failures-before.log` and actual synthetic catalogue projection.
- [x] Pin historical pilot-positive tests to27 October2026; keep explicit before/on/after review-window, reverse/geography/injection/adoption controls.
- [x] Reuse reviewed9d17c2a4 analytics and accepted-geography fixture corrections, adapting only dependencies that differ from staging. Assert actual callbacks, safe properties, duplicate/leak rejection, accepted rail and alternative save/reload/reset.
- [x] Distinguish curated editorial evidence retained in the snapshot from operational transfer qualification. Require unknown/null timing, confirmation-only provider text and no operational curated provenance for unqualified endpoints; retain all evidence and identities across owner save/reload.
- [x] Replace the raw `Whole journey` source count with an assertion about the actual navigation item and accessible label. Preserve selection/hash/focus contracts.
- [x] Run five affected files35/35, full public-route63/63, transport/calendar84/84, persistence182/182, typecheck and diff checks; independent reviewer reran35/35 with no important findings. Status8222f4e remains unchanged.

Combined integration order:
1. Freeze actual hosted staging SHA and clean isolated candidate; retain64adb5e calendar, recovery, daily-image policy and navigation.
2. Integrate reviewed provider-handoff4fbfcdd3, saved-partsd9d8504a and airport19677c86/46264be1 prerequisites in order. Reconcile overlapping9d17c2a4 tests rather than duplicating them.
3. Reconcile status8222f4e last over the shared Transport component/CSS/stories; avoid importing its older snapshot over newer parts/airport behavior. Retain narrow-header192915d1 once.
4. Integrate completed How it works and gift-preview candidates only after their owners provide exact reviewed commits, rights-safe assets and relevant qualification. Uncommitted security snapshots are not release inputs.
5. Add the reviewed test reconciliation, preserving newer transport test changes. Its analytics and Fenghuang corrections overlap9d17c2a4; take the corrected current tests once, including any newer airport/presentation fixture repairs. Run exact combined release gate, transport/public-route/persistence tests, Storybook build and desktop/mobile EN/ES keyboard/contrast/forced-colour checks. Exercise airport save/reload/reset, saved-part gap semantics, booked exclusions, provider payloads and synthetic account recovery.
6. Present exact commit, included work, evidence and remaining limitations to Shaun. Ask for explicit staging deployment approval. Only after approval deploy that exact candidate and verify hosted commit, status/layout, synthetic signed-in save/reopen and recovery. Main remains unchanged.

Unresolved product work remains separate: source-backed Lagos/Comporta identities, an editorial Sacred Valley overnight base and safe explicit existing-trip repair. A green test correction is not proof those geography gaps are resolved or live transport services are available.

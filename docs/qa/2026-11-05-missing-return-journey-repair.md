# Missing canonical return journey: local candidate, 5 November 2026

## Finding and scope

The previous flight-search default correction does not restore a missing canonical leg. A controlled synthetic existing return trip with its terminal leg removed remains one leg through Transport and cold reload on the prior compiled candidate. This is deliberate failure injection, not evidence identifying the original cause of Shaun’s fresh-trip report.

Fresh creation controls did not reproduce that omission: five compiled Chromium homepage/Builder/checkpoint/reload controls covered London–Madrid–Lisbon return and one-way, and Gatwick–Cairns explicit return, default return and one-way. All retained the expected topology. Eighty-five related creation/client model controls passed. Full Build/Overview and the original session remain unverified. A larger edit harness encountered unclassified recovery-review states and a one-way night-conflict expectation failure; these do not establish an inherited bug or a missing return.

A deterministic propagation defect is reproduced: an accepted budget edit or reselection of the existing return type retained an already truncated route because ordinary reconciliation had no changed leg IDs or endpoint change. The new regression failed with one leg instead of two before the correction (`missing-return-projection-red-20261105.log`).

## Bounded repair

A pure classifier requires explicit consistent return-to-start intent, accepted geographic bindings, the original selected departure location, valid dates and exactly the canonical ordered prefix with only its final edge absent. One-way, different-finish, ambiguous, conflicting or orphaned saved journey data is refused. Existing complete return legs remain untouched.

Accepted Builder reconciliation restores that safe missing final edge. Transport additionally offers an explicit Add return journey action using the current canonical mutation head, authored fingerprint, existing auth/recovery guards and persistence contract. Loading a trip does not itself write or add a leg. Unsafe cases offer Review route. Existing legs, bookings, stops, authored details and conflicts are preserved. The new final leg returns to the original location on the trip end date with unknown mode and timing, pending assessment, and no provider link. It is selected and focused, with the existing Change transport mode path available. No flight schedule, availability, price or affiliate credit is inferred.

## Verification

- 108 focused model/contract/reconciliation/persistence checks passed, no skips (`missing-return-focused-green-20261105.log`).
- 18 native browser checks passed, no skips: Chromium/WebKit, English/Spanish, guest/mock account repair and reload, keyboard focus, 320px layout, one-way/orphan negatives, recovery-storage refusal, and existing auth readiness controls (`missing-return-browser-final-20261105.log`). Mock account reload uses the payload actually received by the synthetic PUT endpoint.
- TypeScript, strict UI audit and Storybook build passed. Shared banner/button components are reused.
- Independent source review reported no blocker; 55 overlapping model controls passed. Baseline actual compiled Chromium controlled-injection check passed. Baseline WebKit behavior assertions passed but the strict run failed on localhost service-worker security/access-control page errors; that run is not described as green.
- Four broader edit-session failures were reproduced on unchanged ccbecc baseline: A17 held-removal/undo resolver case and three extracted Build-evaluation harness ReferenceErrors. The full repository suite is not claimed green (`missing-return-edit-session-baseline-20261105.log`).

## Remaining gates and restrictions

Compiled candidate acceptance is reported separately in task artifacts with exact build ID. The original fresh-trip failure source, real signed-in shared-database acceptance, live provider handoff/availability and attribution remain unverified. Preserve these gates before release. No deployment or shared-environment mutation is authorized by this candidate.

Automatic approval review rejected the staging-credential launcher before process creation because it would connect a local app to the shared staging database. It was not retried. Compiled acceptance uses a credential-free localhost app with intercepted synthetic APIs, isolated browser storage and no shared database.

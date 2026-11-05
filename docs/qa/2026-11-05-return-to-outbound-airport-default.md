# Return to the original outbound airport

Shaun clarified that returns should default to the original outbound location, preserving a specifically chosen airport. Canonical return-to-start journeys already retain that original location. The additional defect was in search preferences: choosing Gatwick for an outbound flight from London left the return search using the general Heathrow default.

The correction derives the terminal return-search destination from the valid outbound departure-airport choice. It does not copy a second choice into saved data, rewrite canonical cities/airports, recalculate timings, infer airport-access transport, or create a booking. A reload reconstructs the same default from the existing saved preference. The UI identifies it as **same as outbound / igual que en la ida**, keeping it separate from an explicit return choice and a general planning suggestion.

## Precedence and scope

- Applies to a planning flight returning to the exact validated original start under authoritative `same_as_start` intent. The final overnight stop can differ from the first destination; multi-stop returns use the original departure airport, not the most recent stop's airport.
- An explicit return-airport choice wins. Clearing/resetting that choice restores the current outbound default; changing/resetting the outbound choice updates/removes the derived default. No duplicate return preference is materialized.
- An explicit different route finish and one-way trips retain their semantics. Existing booked/mismatched return records, confirmed evidence and explicit saved flight parts retain precedence. Stale retained choices remain protected and visibly need review.
- When the first overnight stay equals the original start, canonical deduplication makes the first travelling leg start at a stop. Its accepted identity still supplies the return default. This topology stays unpaired, so its later outbound flight uses that first stay's departure date rather than the trip-start date.
- Combined return search is offered only when the effective terminal airport endpoints are exactly reciprocal and all existing identity, topology, booking and date guards pass. Different explicit return airports or nonreciprocal/open-jaw routes keep individual searches with their own dates.

Read and save validation use the same inherited fallback. A conflicting retained same-country departure choice becomes stale without losing its bytes. Identical effective airports are explicitly flagged, the editor remains available, and no misleading provider handoff is exposed. This also covers inherited-only and retained null/null preferences.

## Existing components and data contracts

The existing airport editor, autocomplete, buttons, save/recovery hook, paragraphs and status patterns are reused. The inherited source is included in the editor's reset key so an open form cannot retain an obsolete default. Transport's raw airport-assumption label is suppressed when the inherited search summary is shown, avoiding a Heathrow label beside a Gatwick query. Canonical timing assumptions remain separate from search choices.

`transportBookingForLeg` moved unchanged into the existing `transport-booking.ts` module and remains re-exported from `booking-readiness.ts`. This lets the airport resolver reuse the exact manual/import/legacy booking boundary without a reverse dependency on booking readiness. No matching semantics or saved schema changed.

## Verification and evidence

Evidence files are in the containing `task-8` workspace:

| Check | Result | Evidence |
|---|---|---|
| Core airport/return-search/handoff/booking/import-transfer/Builder reconciliation | 88 passed, no failures/skips | `outbound-airport-return-focused-20261105.log` |
| Mounted default/override/reset/reload, previous booking/parts and readiness controls | 22 passed, no failures/skips | `outbound-airport-return-browser-20261105.log` |
| Additional same-airport alert/editability checks | 4 passed, no failures/skips | `outbound-airport-return-collision-browser-20261105.log` |
| Independent focused review | 56 passed, no failures/skips | `outbound-inheritance-final-independent-review-20261105.log` |
| Independent final origin-as-stay review | 33 passed, no failures/skips | `outbound-origin-stay-independent-review-20261105.log` |
| Typecheck / strict UI audit / Storybook | Passed | `outbound-airport-return-{typecheck,ui-audit,storybook}-20261105.log` |

Independent test counts overlap the focused suite; they are not extra unique coverage. The 26 distinct mounted checks cover Chromium/WebKit, English/Spanish, 320px behavior, and relevant 390/1280/1440 widths. One initial warning assertion observed the legitimately disabled readiness state; its final test waits for the existing gate before asserting editability. No application readiness guard was relaxed. The initial Storybook cache write was sandbox-restricted; its successful rerun uses a cache inside the task workspace, without changing the shared dependency installation.

Screenshots under `output/outbound-airport-return-20261105/return-default-<engine>-<language>-320.png` show the inherited label, both journey cards and retained count/mode caveat. The Spanish WebKit screenshot was visually inspected: no heading/map overlap or horizontal clipping.

Broader independent checks exposed inherited failures, all reproduced on unchanged ccbecc: three `journey-endpoints.test.ts` assertions already recorded in the preceding return-search report, plus four import/commercial tests (nearby disclosure copy, generic comparison copy, unbooked imported island fallback fixture and review readiness copy). The latter run was29 passed/4 failed/1 skipped; see `outbound-inheritance-import-api-review-20261105.log` and `outbound-inheritance-import-baseline-controls-20261105.log`. These checks are not reported as a green full-repository suite.

## Remaining acceptance

No staging or production deployment occurred, and no real trip or user tab was opened or changed. Hosted exact-candidate signed-in save/reload/override acceptance remains required after approved staging integration. Constructed/app-rendered query preservation is verified locally; a live provider landing retaining both dates, endpoints and flight mode remains unverified. Omio can change mode, traveller count is not transferred by the existing contract, and the visible warning remains. Availability, prices and affiliate credit are unverified. The original IAB recovery refusal remains separately unclassified.

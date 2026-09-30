# Imported trip hydration · local browser evidence

The same Philippines CSV fixture (`tests/fixtures/spreadsheet-import.ts`) was pasted into the real `/journey/new/import` production component in headless Chrome. The browser intercepted only `/api/journey-geocode` with deterministic Manila, El Nido, Bohol, Siquijor and Cebu City place identities. No staging, account, photo, Stay or Explore provider was used. The source itself remained in browser memory. Screenshots were captured with optional cookies rejected and the workspace guide dismissed.

| Run | Source | Viewports | Result |
| --- | --- | --- | --- |
| Before | Approved plan/spec base `cf2f49937976e1e762d01dfa11f1c05d6e5eed9d` in an isolated archive | 390, 430, 1440 | Current-behaviour assertion failed on the duplicated origin/first-stop route label. A separate capture pass preserved the empty Itinerary and estimated road transfers. |
| After | Task 7 HEAD `57e575f52b5e207dee3b1459ec3eb23d73bb4b48` plus the Task 8 browser test | 390, 430, 1440 | Two browser tests passed: Philippines end-to-end and a less-structured alias-header import. The Philippines flow showed 21 dated days, five unconfirmed transfers, one recoverable guest trip after rapid double activation, keyboard day navigation, and reload of the same trip. |

Representative matched captures:

- [Before mobile Itinerary](before-390-itinerary.png) → [After mobile Itinerary](after-390-itinerary.png)
- [After 430px Calendar](after-430-calendar.png)
- [Before desktop Overview](before-1440-overview.png) → [After desktop Overview](after-1440-overview.png)
- [Before desktop Transport](before-1440-transport.png) → [After desktop Transport](after-1440-transport.png)
- [After mobile import review](after-390-import-review.png)

The after run opened Overview, Itinerary, Calendar, Explore, Stay, Transport and Map, then hard-reloaded Map. Explore and Stay opening proves normal workspace eligibility and canonical stop context; it does **not** prove live provider inventory. Imagery in these captures is a fallback because the local provider environment did not supply destination photos. Account-save and cross-device acceptance remain separate from this guest-browser run.

Run the opt-in browser checks against a local Next app:

```sh
MORROVIA_IMPORT_BROWSER_TESTS=1 MORROVIA_IMPORT_BROWSER_BASE_URL=http://127.0.0.1:3308 node --experimental-strip-types --test tests/imported-trip-browser.test.ts
```

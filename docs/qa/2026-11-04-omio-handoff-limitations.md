# Omio text-handoff limitations — local candidate

Evidence observed 4 November 2026, approximately 04:38–04:46 UTC. Original issue: https://trello.com/c/TQUNi36O . Scope is synthetic replay of `omio-search-link.ts`, not saved-trip or deployed-app acceptance.

All replays used the existing wrapper `https://omio.sjv.io/c/7643967/409973/7385` and encoded destination `https://www.omio.com/links/626fa8a9-f982-43d0-ace9-9a13f6b14612`, with `locale=en`. No passenger parameter was supplied; the existing contract has none. No bookings or sign-ins occurred.

| Supplied endpoints | Departure | Mode | Visible landing |
|---|---|---|---|
| `Honolulu, United States` → `Mexico City, Mexico` | 2027-03-01 | FLIGHT | Final `https://www.omio.com/`; endpoint fields blank, default 5 November, one traveller. Intermediate URL contained the supplied values. |
| `Matsumoto, Japan` → `Chengdu, China` | 2027-03-14 | FLIGHT | Flight results with Matsumoto Station/Japan → Chengdu/China, 14 March and one traveller; no flights. |
| `Zhangjiajie, China` → `Hong Kong, Hong Kong` | 2027-03-20 | TRAIN | Train results with intended endpoints and 20 March, one traveller; no trains. |
| `Paris, France` → `London, United Kingdom` | 2026-12-04, return 2026-12-11 | FLIGHT | Both dates and endpoints preserved; populated results and outbound selection. |

These observations do not establish that a travel route is unsupported, that flights or trains do not exist, or that all variants of an endpoint string fail. Honolulu autocomplete exposed city and HNL choices. No URL variants were guessed, and none is asserted as a fix. The current small airport-default map contains no Matsumoto mapping; existing explicitly supplied flight segments can provide gateway endpoints, which this change preserves.

## Mitigation scope

* The exact observed Honolulu city pair and the Matsumoto city/station departure text now use the existing explicitly general Omio search. Country aliases use the existing registry; airport names, other routes, rail modes and reverse Honolulu direction are not blocked by this observation.
* Qualified airport segments continue to supply endpoint names; no airport, schedule, access time or gateway is invented. The overnight stop and saved trip are unchanged.
* The observed China rail route retains its route/date link. Dates more than 15 UTC calendar days ahead receive a bounded ordinary-sale-window notice. Within that window the code makes no availability assertion. It does not predict or detect the external results page.
* Reuse the existing affiliate link's visible and accessible description in EN/ES. Preserve the general or limited CTA in the Transport wrapper.

The ordinary window is supported by [MTR's July 2026 ticketing guide](https://www.highspeed.mtr.com.hk/res/pdf/Ticketing_Guide_EN.pdf): up to 15 days ahead, station-specific release time. [Trip.com's existing route information page](https://www.trip.com/trains/china/route/zhangjiajie-to-hong-kong/) also states 15 days. A route page is not a prefilled future search or proof of availability; no fallback was added.

[Omio's redirect configurator](https://www.omio.com/affiliate/search-widget) exposes endpoints, dates, mode, locale and currency, without a passenger field. It currently prints ad identifier `4057579`, while the existing Morrovia wrapper uses `409973`; the old wrapper did redirect and append partner identifiers in this session. It remains unchanged pending account-level review. Those identifiers do not prove affiliate credit.

## Revisit / acceptance

### 5 November traveller-count follow-up

The actual staging `ccbecc6681b00764dc4783f93a7aac29ceeeb80b` app-click control used a two-traveller London–Paris trip, departing 11 December 2026 and returning 16 December. Omio preserved both dates and showed Flights / Select outbound, but displayed one traveller. A separate airport-specific one-way control (London Gatwick–Paris Orly, 11 December) preserved the endpoints/date but displayed one traveller and selected Trains despite the supplied `travelMode=FLIGHT`. These are separate observations; the one-way result does not invalidate the successful return-date/flight control. Neither establishes a universal default or current inventory. No outbound selection or booking was made.

Reproducible app-click observations are recorded in `../deployed-transport-browser-observations-20261105.json` (relative to this repository root's parent workspace) and `../deployed-transport-acceptance-ccbecc-20261105.txt`. The former records the exact wrapped URLs and landing paths. These are prior browser observations, not new provider visits during this follow-up.

Rechecked [Omio's public redirect configurator](https://www.omio.com/affiliate/search-widget) on 5 November: the documented redirect fields are `departurePosTerm`, `arrivalPosTerm`, `departureDate` and optional `returnDate`. The configurator also exposes mode, locale and currency controls, but no traveller-count control. No supported passenger parameter for this existing redirect contract was found. This is a documentation limit, not proof that no private provider interface could support it; a different API/widget is outside this change.

The local candidate's shared EN/ES notice already explicitly says traveller count is not carried over and asks travellers to check mode and count before booking. That is the supported mitigation; no guessed `adults`, `passengers` or similar parameter was added. The saved trip remains at two travellers. New regression controls cover two-traveller one-way and round-trip actions through both action resolvers, the visible EN/ES warning, exact query-key allowlist, dates/mode, and unchanged saved trip. The focused Omio limitation, return-search and affiliate tests passed: 21 tests, zero failures or skips. Hosted acceptance of the candidate, downstream return selection, provider inventory and affiliate credit remain unverified. No deployment occurred.

The text guards are conservative reviewed exceptions, not a worldwide support matrix. Revisit when a synthetic actual-app click with accepted endpoint bindings demonstrates reliable carryover for the same input, or a documented provider contract supersedes it. Do not remove based on URL/unit tests alone.

MANUAL HOSTED VERIFICATION REQUIRED: actual app-rendered href/CTA and live provider click, route/date/passenger confirmation, mobile/desktop description layout, and conversion attribution. Original issue remains open. No production change, provider contact or new integration is included.

## Current-main reconciliation

The delivery candidate is reconciled against main `d38cf48121e378eb9ab99c2d2c47a1d947b3942d`. All eleven main presentation tests remain, with their valid wiring assertions plus the candidate's compiled-action behavioral and negative controls. The former end-date assertion follows the delegated date helper; label-only CTA expectations now distinguish ordinary, return, general and limited actions.

Controlled production-component fixtures subsequently verified actual `clientWidth=320` and `scrollWidth=320` for all three expanded handoffs in a same-origin 320px iframe, including Spanish airport guidance. Actions retain approximately 44px mobile height and visible linked descriptions. General-search and rail links were clicked from this local main-based fixture; general search opened blank route fields, while rail retained the intended March date and endpoints and returned no trains. These local component checks do not establish hosted owner/session acceptance, inventory, ticket protection or affiliate credit. The external evidence/report records screenshots, exact source identity and remaining release gates.

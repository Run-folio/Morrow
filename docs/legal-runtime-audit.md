# Morrovia legal and runtime fact audit

Status: implementation evidence recorded 30 August 2026. This is an engineering audit of repository and runtime behaviour, not legal advice and not a statement of compliance.

## Canonical business identity

The canonical source is `lib/morrovia-legal-identity.ts`.

| Field | Runtime value |
| --- | --- |
| Product name | Morrovia |
| Legal operator | Shaun Whiting Limited |
| Trading name | Morrovia |
| Registration jurisdiction | Unknown; not rendered |
| Company number | Unknown; not rendered |
| Registered office | Unknown; not rendered |
| Support contact | `sw@shaunwhiting.com`, consolidated from the existing live Help contact |
| Privacy contact | `sw@shaunwhiting.com`, consolidated from the existing live Privacy contact |

`Morrovia Ltd` is not the current operator and must not be rendered. The shared footer now renders “© 2026 Morrovia” and “Operated by Shaun Whiting Limited” from the canonical owner. A future operator change should be made in that owner, not page copy.

## Public legal and contact surfaces

| Surface | Route/owner | Current fact |
| --- | --- | --- |
| Shared public and signed-in footer | `components/morrovia-footer.tsx`, mounted by `app/journey/layout.tsx` | Used across Journey public and account surfaces. Links to About, Help, Affiliate disclosure, Privacy, and Privacy analytics settings. |
| Privacy notice and analytics settings | `/journey/privacy` | Existing product notice with an embedded allow/decline control. It was not rewritten in this pass. |
| Affiliate disclosure | `/journey/affiliate-disclosure` | Explains commission/referral links, third-party transactions, provider terms, and changing prices/availability. |
| Help/contact | `/journey/help` | Help content includes booking-link explanations and uses the canonical support contact. |
| Terms | No route | The footer retains a non-linked “Terms” label. No dead `/journey/terms` link was added. |
| Cookie notice and settings | `/journey/cookies#cookie-settings` | Dedicated public inventory and versioned preferences for product analytics and affiliate attribution. The footer links here persistently. |
| Accessibility | No route | Not linked. |
| Separate Contact route | No route | Help is the valid contact surface. |

No second global footer was found. `app/journey/home/home-footer.tsx` is a homepage CTA/partner section; the shared legal footer is still appended by the Journey layout.

## Runtime data categories

### Account and authentication

- Email/password signup collects name, email, and password through Better Auth. Password material is held in the Better Auth `account` table rather than displayed by Morrovia.
- Optional Google sign-in uses Better Auth and requests only `openid`, `email`, and `profile`. Morrovia receives the Google provider subject, verified-email state, email, name, and profile image. Provider account identifiers, granted scope/expiry metadata and, where supplied, access/refresh/ID tokens are stored in the server-side Better Auth `account` table. New and refreshed OAuth token fields are encrypted with `BETTER_AUTH_SECRET` and are not sent to analytics.
- Better Auth stores user identity, verification state, account records, verification records, and server-side sessions. The session table includes token, expiry, user ID, IP address, and user agent.
- Better Auth cookie attributes are not overridden by Morrovia. In the installed Better Auth 1.6.25 runtime, the primary session cookie is `better-auth.session_token` on local HTTP and `__Secure-better-auth.session_token` on HTTPS/production; it is HttpOnly, SameSite=Lax, Path=/, Secure on HTTPS/production, and persistent for seven days by default. Google OAuth uses a similarly prefixed temporary `state` cookie with a five-minute default. Response headers should still be confirmed in the deployed environment because proxy/base-URL configuration controls the Secure prefix.
- Morrovia persists a second product user record (`easyt_users`) with ID, email, name, and preferences.

### Trips, preparation, and user content

The canonical `EasyTTrip`/database representation can contain:

- trip ID/owner ID, title, origin, start/end dates, traveller count, status, pace, currency, and full `brief`/`document` JSON;
- destinations/stops, canonical/provider place identifiers, country/region, coordinates, order, dates, and nights;
- route legs, modes, distance/duration estimates, provider/provenance, warnings, and route metadata;
- itinerary items, titles, notes, reasons, dates/times, booking URLs, and coordinates;
- preferences/interests, budget/pace/transport/accommodation choices, hard constraints, fixed commitments, decisions, health/readiness state, saved bookings, and checklist items;
- selected places, pins, restaurant/stay choices, and associated provider identifiers;
- the initial free-text trip brief. It is returned as `rawBrief`, saved into `easyt-home-trip-draft.brief`, and can become part of the saved trip brief/document;
- trip-gift recipient email, optional note, token hash, status, expiry, claim fields, and transactional-email record;
- feedback rating/comment; country-stamp status; country-memory note and optional photo data;
- optional travel-readiness profile values, including nationality/nationalities, country of residence, and passport-expiry month. The inspected model does not request passport number, scan, or image.

### Database records and deletion

Neon Serverless Postgres is used through `DATABASE_URL`. Product tables cover users, trips/stops/legs/plan items/recommendations, gifts, feedback, stamps/memories, email events, admin audit, and co-pilot previews.

The current support deletion implementation is an admin-only operation. It deletes the product user (cascading trips, stamps, memories, and co-pilot previews), feedback owned by that user, Better Auth sessions/accounts/verifications, and the Better Auth user. It intentionally writes an `account_deleted` admin-audit record. Email events are keyed by recipient email rather than owner ID and are not deleted by this operation. Gift-recipient records and admin-audit retention also require an explicit policy/review.

### Google authentication facts for the later Privacy/Terms review

- Purpose: create or authenticate the existing canonical Morrovia account and maintain its session. Google is not a source of trip ownership.
- Provider/data: Google supplies a provider subject, email, email-verification state, name and profile image under `openid`, `email` and `profile`; Morrovia requests no Drive, Calendar, contacts, advertising or offline-access scope.
- Linking: Better Auth may attach Google to an existing user only for the same email when both the provider email and the pre-existing local user are verified. Forced-trusted-provider linking, different-email linking, provider profile overwrite and unlinking the last account are disabled. Unverified/ambiguous matches fail without a custom merge.
- Storage: the provider account row and any token material Google issues remain server-side in the Better Auth `account` table. New/refreshed token fields use Better Auth application-layer encryption with `BETTER_AUTH_SECRET`; older pre-setting OAuth token rows, if any exist, are refreshed into the encrypted format on a subsequent provider sign-in and require an operational inventory before launch.
- Retention/deletion: Google account records and tokens follow the Better Auth/Morrovia account lifecycle and the support deletion operation removes the owner's Better Auth `account` rows. Google may retain its own records under its terms; that external retention needs legal/vendor review.
- Analytics: no Google email, provider subject, profile, authorization code, access token, refresh token, ID token or provider payload is included in the Morrovia analytics contract.

## Browser storage and cookie inventory

“Necessary” and “optional” below are engineering candidates for the later consent review, not legal classifications.

| Owner/key or prefix | Data/purpose | Candidate | Created/gated | Lifetime established in code |
| --- | --- | --- | --- | --- |
| Better Auth `session_token` and temporary OAuth `state` cookie | Authentication/session/security | Strictly necessary | Created by auth/sign-in flows; never optional-consent gated | Installed defaults: session token seven days; OAuth state five minutes. HttpOnly, SameSite=Lax, Path=/; Secure and `__Secure-` prefixed on HTTPS/production |
| `easyt-analytics-consent` | Versioned JSON record with decision time, necessary=true, product-analytics choice and affiliate-attribution choice | Necessary preference | Created only after a visitor chooses; optional categories default off | `localStorage`; no explicit expiry; current policy version `2026-08-30.1` |
| PostHog/GA4 identifiers or cookies | Product analytics/vendor state | Analytics/optional | SDKs load only after the current record allows product analytics and the provider is configured | Vendor-controlled; no lifetime configured in this repository |
| Microsoft Clarity | Configurable analytics/replay SDK | Disabled | The loader has been removed until deployed masking/replay settings can be verified against Morrovia's private-trip boundary | No Morrovia-created Clarity state while disabled |
| Omio Impact attribution state | Affiliate link transformation/impression attribution | Commercial/affiliate optional | Script, `transformLinks` and `trackImpression` run only after the current record allows affiliate attribution | Vendor-controlled; not established in this repository |
| `easyt-language`, `theme` | Language and theme preference | Functional/necessary candidate | On visitor choice | `localStorage`; no explicit expiry |
| `easyt-home-trip-draft` | Homepage handoff, including raw brief and structured trip inputs | Functional/necessary candidate | When starting/planning a route | `localStorage`; removed after durable handoff, otherwise no fixed expiry |
| `easyt:active-trip:v1`, `journey:planned-trip` | Legacy trip/brief migration state | Functional/necessary candidate | Legacy/migration paths | `localStorage`; no fixed expiry |
| `easyt:trip-cache:v2:*`, `easyt:trip-recovery:v2:*`, `easyt:current-trip:v2:*`, `easyt:last-owner:v1` | Owner-scoped canonical cache, unsaved recovery copies, current-trip pointer, and owner boundary | Necessary for save/recovery integrity | During trip editing/saving | `localStorage`; recovery cleanup is state-driven, no simple fixed duration |
| `easyt-private:{guest|owner-*}:travel-profile`, `...:travel-readiness-profile` | Travel preferences and preparation profile | Functional/necessary candidate | Profile/preparation choices | `localStorage`; no explicit expiry |
| `journey:local-{restaurant|stay}:v3`, `journey:taste-finder:v1` | Saved finder choices and answers | Functional candidate | Finder use | `localStorage`; no explicit expiry |
| `easyt-stamped-*`, `easyt-stamp-memories-*`, `easyt-stamp-photos-*`, `easyt-stamp-pending-*`, guest claim/promotion keys | Device copy, pending changes, notes/photos, and explicit guest promotion handoff | Functional/necessary candidate | Stamps use; guest promotion consent only on the explicit keep action | `localStorage`; no explicit expiry; guest keys are removed after claim |
| `morrovia:route-photo:*` | Validated route-photo cache/attribution data | Functional candidate | Route image selection | `localStorage`; no explicit expiry |
| Product/UI keys such as `easyt-product-tour-complete`, `easyt-first-trip-guide-dismissed`, `easyt-map-coach-dismissed`, `morrovia-workspace-orientation-seen-v1`, dashboard feedback draft/dismissal | UI completion, dismissal, or draft state | Functional candidate | On the relevant interaction | `localStorage`; no explicit expiry |
| `morrovia:trip-intent-tracked:*`, `morrovia:route-generated:*`, `morrovia:route-accepted:*`, `morrovia:trip-ready:*` | Prevent duplicate optional analytics events | Optional analytics | Written only when analytics consent exists | `localStorage`; no explicit expiry |
| `morrovia:budget-viewed:*`, `morrovia:health-shown:*`, `morrovia:attraction-viewed:*`, `morrovia:accommodation-viewed:*` | Per-tab analytics de-duplication | Optional analytics | Events themselves are consent-gated; some component-level legacy events should be rechecked as part of #211 | `sessionStorage`; browser-tab session |
| `morrovia-stamps-expanded-regions` | Expanded UI state | Functional candidate | On expansion | `sessionStorage`; browser-tab session |
| `easyt-public-shell-v4` Cache Storage | Public Journey HTML/static shell only | Functional/necessary candidate | Production service-worker install/use | Retained until service-worker version cleanup or site-data clearing |

No application IndexedDB use was found. The service worker excludes API responses and account/user-specific routes from Cache Storage and uses public `/journey/home`, `/journey/new`, `/journey/plan`, icons, and required static assets.

## Consent and optional technology

- `lib/privacy-consent.ts` is the canonical state/parser owner for the established `easyt-analytics-consent` key. `components/privacy-consent.tsx` is the global choice UI and application boundary. The record has explicit version `2026-08-30.1`; obsolete/invalid values fail closed. A legacy decline is migrated to the current all-off record, while a legacy grant is not treated as consent to the new affiliate category and receives a fresh prompt.
- First visit presents equally available Reject optional, Accept optional and Manage preferences actions. Necessary technology remains on. `/journey/cookies#cookie-settings` shows the current state and granular toggles without requiring sign-in.
- `Analytics` does not load GA4 or initialize PostHog until the current record allows product analytics. PostHog is configured with autocapture, dead-click, exception, heatmap, performance/web-vitals, automatic page views/page leave, session recording, surveys and remote feature-flag/config polling disabled. It opts out capture and persistence by default, then opts in after consent. Identified users can be associated with the internal user ID after consent.
- GA4 receives manually generated page views and typed product events. PostHog receives the same product events. Microsoft Clarity is disabled: its project/dashboard masking setting and replay boundary could not be verified from code or the available runtime, while Microsoft documents DOM/action session reconstruction and a default Balanced masking mode. Inputs are vendor-masked, but trip copy outside inputs could still enter replay unless Strict/project and element masking are verified.
- Paths remove query strings and collapse opaque trip IDs to `/journey/[tripId]`. External destinations are reduced to origin. The typed event contract is coarse, but several events include internal trip, stop, or transfer IDs, counts, state flags, provider/category, and workspace placement.
- The event contract does not define prompt, note, email, passport, confirmation, or full-trip-document properties. `trackEvent` itself accepts legacy generic properties, so tests and future review must continue enforcing that callers do not add private free text.
- Omio Impact is owned by `components/optional-affiliate-tracking.tsx`. With no choice, rejection, or affiliate attribution off, no Impact script is added and approved Omio links remain normal external links. With affiliate attribution allowed, the script queues `transformLinks` and `trackImpression`. Withdrawal removes the tag/global and reloads after saving so the unverified in-memory vendor runtime cannot continue.
- Withdrawing product analytics stops Morrovia event dispatch immediately, opts out and resets PostHog, sends GA's denied consent/disable signal when present, clears Morrovia analytics-deduplication keys plus known optional first-party analytics cookies, and leaves auth, trips, recovery and preferences untouched. Vendor-controlled third-party or server-side records cannot be reliably deleted by browser code.
- No Sentry or other dedicated error-monitoring SDK was found.

## AI: Luna/OpenAI

### Initial trip capture

- Provider/model: OpenAI Responses API; primary model `gpt-5.6-luna`, with a configured Terra escalation definition in the semantic-intent module.
- Boundary: the browser posts a brief to Morrovia’s `/api/journey-capture`; the server trims it to 600 characters. When semantic extraction is active/shadow-configured, the server sends the raw trimmed brief plus a fixed extraction policy to OpenAI.
- Request: low reasoning, strict JSON schema, maximum 1,800 output tokens, `store: false`.
- Output is a bounded semantic interpretation. Deterministic/provider place resolution remains authoritative for canonical geography and final trip construction.
- Logs: production does not log the raw prompt in this route. Development/shadow logs contain model/status, latency, aggregate token usage/cost, candidate counts, safety/agreement fields and aggregate coverage counts. The optional route diagnostic no longer logs geographic source spans or other prompt fragments.

### Signed-in trip co-pilot

- Provider/model: OpenAI Responses API, `gpt-5.6-luna`, server-side only.
- Sent: the user’s co-pilot question (trimmed to 500 characters) plus a generated projection containing trip title; date state/dates/duration; traveller count; stop names/countries/dates/nights/stay status; transfer endpoints/mode/distance/timing/confidence/warnings; itinerary titles/notes; health findings; preferences/constraints; booking/readiness counts; and selected-context label.
- Deliberately excluded by the projection boundary: canonical IDs, coordinates, URLs, confirmation codes, provider payloads, owner/auth data, change history, and the raw initial trip brief.
- Request: low reasoning, strict answer schema/function tools, maximum 700 output tokens, `store: false`.
- State changes: the model cannot directly save a trip. A supported function call creates a deterministic server-side preview; the user must review/apply it through a separate authenticated route. Pending previews store action/hash/expiry and can store the resulting full trip after application.
- Logs: development completion logs model, token usage, projection counts, and scope availability. Failures use category/status/code-safe errors. Raw question and full projection are not logged in this route.
- Current user-facing identification says “Luna · AI travel assistant” at the interaction boundary, provides restrained accuracy and preview-before-apply wording, and offers an inline “How Luna uses your trip” disclosure linking to Privacy. The disclosure identifies OpenAI, explains the reduced projection/exclusions and accurately qualifies `store:false`.

`store: false` is a request configuration fact. It is not evidence that OpenAI retains nothing; provider contractual/abuse-monitoring handling needs external review.

## Speech input

- The client uses `window.SpeechRecognition` or `window.webkitSpeechRecognition`. The code only knows whether one of those constructors exists; it does not maintain a browser support list.
- Recognition language is `en-US` or `es-ES`, one-shot (`continuous = false`), final results only (`interimResults = false`).
- Browser permission/vendor speech handling occurs outside Morrovia’s code. Morrovia receives final transcript strings through the browser API; it does not create, upload, or persist an audio blob itself. The implementation does not prove that audio stays on-device, because the browser/vendor may process it remotely.
- A final transcript is appended to the normal trip-brief field. From then on it follows the same flow as typed text: it can be saved in `easyt-home-trip-draft`, posted to journey capture, sent to OpenAI when semantic extraction is enabled, and included in a saved trip document.
- Denied/service-denied permission shows a microphone-blocked message. No speech, unsupported browser, generic recognition errors, and `start()` failure all provide typing fallbacks. Recognition is aborted on component unmount.
- Current UI labels the control “Speak”, reports listening/error/success state without relying on colour, and associates the button with nearby browser/vendor-processing and editable-transcript disclosure. Unsupported, denied and no-speech states retain typing as the recovery path.

## Affiliate and booking handoff

The implemented commercial model is: Morrovia plans and presents an action; the user chooses it; an external provider opens; that provider contracts with the user and takes payment. Morrovia has no travel checkout or travel-payment flow.

### Current affiliate surface coverage matrix

Repository-verified 30 August 2026. “Context available” describes what the Morrovia surface or resolver knows, not necessarily what is sent to the partner. Generic approved links deliberately receive no trip context. `MorroviaAffiliateLink` owns the shared sponsored-link behaviour, nearby copy is `affiliateDisclosure`, and `/journey/affiliate-disclosure` owns the full public explanation. Some older direct renderers duplicate that behaviour as recorded below.

| Category | Production surfaces | Context available | Primary provider | Fallback provider | Canonical resolver / owner | URL type | Disclosure owner | Analytics event | Placement values | Eligibility / lifecycle | Changes product state? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Trip.com accommodation | Homepage partner cards; Overview next action; Itinerary **Logistics & bookings**; Map planning-preview accommodation; Map stay finder | Homepage: none. Planner: opaque trip/stop IDs, destination, dates and travellers; chosen Map property where present. The approved Trip.com URL receives none of it. | Trip.com | No affiliate fallback; surfaces retain internal Map/stay-planning paths when no valid action exists | `getCurrentPartnerAction("accommodation")`, `getBookingAction`, `getAccommodationBookingUrl` in `lib/easyt/booking-readiness.ts` | Generic approved tracked URL | Shared owner on homepage/current Itinerary module; direct nearby copy in Overview and Map stay finder. The Map planning-preview renderer is a separate direct owner and does not render the shared nearby copy beside its direct link. | `affiliate_click` | `homepage_stays`, `overview_next_action`, `itinerary_accommodation`, `map_stay_finder` | Valid HTTPS action; planner CTAs additionally require the relevant stop/dates or a selected stay result. Overview uses it only after higher-priority route/itinerary work and for an uncovered overnight stop. | No |
| Trip.com activity fallback | Homepage experiences; Itinerary day experiences; Map **See** refinement; public Route Detail experiences | Homepage: none. Public route: destination count. Planner: opaque trip/stop IDs and workspace; resolver request can contain stop/dates but the URL does not. | Viator | Trip.com only when the Viator/configured action is absent or invalid | `getActivityBookingAction` via `getCurrentPartnerAction("activities")` | Generic approved tracked URL | `MorroviaAffiliateLink` plus shared nearby disclosure | `affiliate_click` when Trip.com wins | `homepage_experiences`, `itinerary_day_experiences`, `map_see_experiences`, `route_detail_experiences` | A valid HTTPS Trip.com action and no valid primary activity action; contextual planner modules also require a current stop. | No |
| Viator activities | Homepage experiences; Itinerary day experiences; Map **See** refinement; public Route Detail experiences; Overview **Before you go** activity task | As above; preparation additionally knows selected activities, stable stop dates, nights, and opaque trip/stop IDs. No context is appended to the generic URL. | Viator | Trip.com activities | `getActivityBookingAction`; preparation actions are composed by `buildBookingReadiness` | Generic approved `vi.me` URL | Shared owner on homepage/Itinerary/Map/Route Detail; `TripPreparationTaskRow` owns preparation disclosure | `affiliate_link_clicked` | `homepage_experiences`, `itinerary_day_experiences`, `map_see_experiences`, `route_detail_experiences`, `overview_before_you_go` | General surfaces need a valid action; preparation additionally needs an unended trip, stable stop dates, at least two nights, and selected activities. | No |
| Omio transport | Homepage transport; Itinerary transfer; Overview next action; Overview **Before you go** transport tasks | Homepage: none. Planner: opaque trip/transfer/stop IDs plus canonical leg mode, distance, duration and endpoints; none is appended to the generic URL. | Omio | No direct fallback; configured ground transport is evaluated only for eligible legs without an Omio action | `getCurrentPartnerAction("transport")`, `omioBookingActionForLeg`, `buildBookingReadiness` | Generic approved tracked URL; optional consent-gated Impact may transform eligible links | Shared owner on homepage; direct disclosure/link owners in Itinerary, Overview and preparation | `affiliate_link_clicked` | `homepage_transport`, `itinerary_transfer`, `overview_next_action`, `overview_before_you_go` | Planner action requires a valid, unended trip; distinct named endpoints; no saved transport booking; a non-local supported train/flight/ferry/coach-bus leg, or an unknown leg of at least 40 km. | No |
| Saily connectivity | Homepage connectivity; Overview **Before you go** connectivity task | Homepage: none. Preparation: destination countries and opaque trip ID; configured readiness URL may receive a comma-separated `destination` value. | Homepage approved Saily affiliate URL; configured optional Saily URL in readiness | Non-affiliate `https://saily.com/` in travel readiness when no optional URL is configured | `getCurrentPartnerAction("connectivity")`; `resolveOptionalAffiliateConfiguration`; `buildBookingReadiness`; `buildTripReadiness` | Homepage generic tracked URL; configured readiness URL is contextual; fallback is generic non-affiliate | Shared owner on homepage; `TripPreparationTaskRow` for affiliate preparation actions | `affiliate_click` only for affiliate actions | `homepage_connectivity`, `overview_before_you_go` | Homepage action requires a valid HTTPS approved URL. Preparation requires an international/multi-country context; affiliate status additionally requires a valid configured URL. Ended trips produce no booking-readiness actions. | No |
| Booking.com discovery where configured | Map stay finder inventory merged ahead of local mapped results | Coordinates/radius, check-in/out, adults, rooms, currency, booker country and locale; server adds the configured affiliate ID header. No Morrovia owner/trip ID, prompt, email or name is sent. | Booking.com Demand API | Google Places/OpenStreetMap local discovery remains usable; outbound booking remains Trip.com | `/api/journey-accommodation-search`; `JourneyLocalFinder` | Provider-generated inventory/API response, not an outbound booking URL; each result has a contextual non-affiliate Google Maps URL | No affiliate-link disclosure for discovery itself; the separate Trip.com outbound CTA owns its disclosure | `accommodation_search_started`; no commercial click for discovery | No commercial placement; search event uses `source="map"` | Valid credentials and valid coordinates/dates/guest context. Missing credentials, empty results, timeout or provider failure fail to mapped discovery without claiming live availability. | Discovery: no. Choosing/saving a result is a separate explicit product action. |
| Optional car hire | Overview **Before you go** transport task | Long selected road leg, pickup/drop-off stops and dates, driving preferences/constraints, opaque trip/stop ID | Valid configured car-hire partner | Trip.com generic car-rental URL; Google Search is the final non-affiliate code fallback if neither affiliate action exists | `resolveOptionalAffiliateConfiguration`; `buildBookingReadiness`; Trip.com fallback via `getBookingAction("car_rental")` | Configured partner and Google URLs are contextual; Trip.com is generic | `TripPreparationTaskRow` for affiliate actions; none for non-affiliate fallback | `affiliate_click` for affiliate actions only | `overview_before_you_go` | Unended trip; selected road leg of at least 120 km; route calls for driving/simplest; no avoid-driving constraint. Configured URL must pass validation. | No |
| Optional ground transport | Overview **Before you go** transport task | Canonical leg mode, distance, endpoints/date, selection, opaque trip/stop ID | Valid configured ground-transport partner | None for this action; Omio is resolved first as a separate category owner | `resolveOptionalAffiliateConfiguration`; `buildBookingReadiness` | Contextual configured URL with `from`, `to` and `date` | `TripPreparationTaskRow` | `affiliate_click` | `overview_before_you_go` | Valid configured URL; unended trip; selected train/ferry/road leg of at least 120 km; only when no Omio action covers that leg. | No |
| Google Flights / Maps non-affiliate handoffs | Google Flights in Overview **Before you go**; Maps from Map destination/venue results and other explicit map handoffs | Flights: origin, first/last stop and trip dates. Maps: provider/place name, address or coordinates depending on the producing surface. | Google Flights / Google Maps | None | Flights: `buildBookingReadiness`. Maps URLs: the relevant place/search provider and presentation owner, including `JourneyLocalFinder` and accommodation search results | Contextual provider/search URL | None: these are non-affiliate handoffs | No affiliate event | None | Flights require valid dates, stops, a ready route and an unended trip. Maps requires a resolved destination/place or search context. | No; adjacent Add/Save controls are separate actions. |

**Affiliate clicks never mark an item booked or complete a readiness task.** All booking actions use `livePrice: false`. Readiness and booking completion remain derived from saved canonical bookings/checklist state, never from an outbound click. Booking.com properties are labelled available only after Demand returns a matching product for the requested dates; Map/OpenStreetMap/Google Places properties remain “check availability”. Final availability, price, room, cancellation terms, checkout and payment remain with the provider.

### Coverage gaps and proof still required

- **Duplicated surface ownership:** accommodation and Omio still have direct link/event/disclosure renderers alongside `MorroviaAffiliateLink`. The Map planning-preview accommodation link also reports `itinerary_accommodation`/`workspace_view="itinerary"` and lacks the shared nearby disclosure in that direct renderer. Saily has both the fixed homepage owner and the separately configured readiness owner.
- **No current valid action states:** Booking.com has no outbound booking/deep-link action; it is discovery only. Optional ground transport has no action without valid deployment configuration. `getBookingAction` deliberately returns no Trip.com action for `flight` or `train`; Google Flights is a separate non-affiliate readiness handoff. Invalid or absent activity partners fail closed after the Viator → Trip.com fallback chain. A missing optional Saily URL leaves readiness non-affiliate.
- **Staging/live attribution proof:** repository code cannot prove that approved URLs credit the intended account, optional deployment URLs are configured, Booking Demand credentials/affiliate ID are accepted, Omio Impact transforms and attributes only after consent, or partner dashboards receive test clicks/conversions. Verify these in staging and each provider account without treating a click as a booking.
- **Deliberately separate future API work:** production Viator inventory, Booking.com outbound/deep-link support, contextual Trip.com/API handoffs, optional car/ground provider APIs, and signed provider conversion webhook/CSV ingestion are not current capabilities. `booking_attributed` must remain inactive until a genuine provider conversion signal can be validated and deduplicated by immutable transaction ID.

## Signup and consent findings

- Signup collects name/email/password, or uses optional Google sign-in.
- It links Privacy and says “Read how Morrovia handles your data”; it does not ask a user to “agree to” the Privacy notice.
- It does not link Terms, say that creating an account agrees to Terms, or offer an age statement.
- There is no marketing/newsletter consent, no pre-ticked marketing box, and no mixing of marketing consent with account creation.
- The optional-analytics choice is separate from signup and offers allow/decline. Declining does not block the product.
- Better Auth is configured with the legacy internal `appName: "EasyT"`; user-facing email/UI uses Morrovia. This should be normalized as product configuration, not treated as the legal operator.

## Logging and leakage review

- OpenAI paths deliberately log aggregate model/status/usage/count fields and sanitize provider errors. The optional journey-capture development diagnostic is behind non-production plus a diagnostics flag and now emits only aggregate coverage and mention counts, not user-entered prompt fragments.
- Trip persistence routes log error category/name/code rather than full trips. Co-pilot logs do not include the question or projection. Optional-affiliate configuration warnings do not print partner URLs/query parameters.
- Some routes still pass raw `Error` objects to `console.error`, notably journey discovery, feedback persistence, and trip-gift email delivery. Provider/database error objects can carry more detail than intended and should be replaced with bounded error categories.
- Failed Resend responses are stored (up to 500 characters) as `easyt_email_events.error_message`; provider response bodies require review for accidental personal/diagnostic data.
- No inspected production log deliberately emits a full `EasyTTrip`, raw initial prompt, authentication token, or provider API key. That is a code-path finding, not proof about platform/database/vendor logs outside this repository.

## Current notice claims requiring correction or substantiation

Do not silently treat the current Privacy notice as complete. Later work should address:

1. The service/provider list omits OpenAI/Luna, Neon by name, Google Places/Booking.com discovery, commercial partners/Impact attribution, and some content/search providers.
2. The Privacy notice now cross-links the dedicated Cookie settings surface and factually says Clarity is disabled, but the full #35 rewrite must describe the controller purposes, optional analytics, affiliate attribution and withdrawal limitations in the complete notice.
3. Do not call Microsoft Clarity merely aggregate analytics if it is reconsidered: project-level Strict masking, any selector overrides, URL handling, replay scope and the consent signal must be verified before re-enabling it.
4. Retention periods are not implemented/configured for most database records, localStorage, email events, admin audit, gifts, feedback, or co-pilot previews beyond preview expiry fields. Avoid specific periods until established.
5. Account deletion does not remove email events keyed by recipient email and deliberately retains an admin audit record. Gift-recipient records may also remain independently of an owner deletion.
6. The product and Privacy Notice now describe the implemented AI and speech boundaries, including prompt/transcript persistence and the OpenAI request boundary. Final processor, retention and international-transfer treatment remains for legal/vendor review.
7. Better Auth cookie names, flags, and lifetimes, plus third-party cookie/identifier lifetimes, are not established by application config.

No Terms route exists, so there are no current Terms claims to audit. Terms must be drafted from the third-party-provider/payment model rather than copied from a travel seller.

## Inputs and reviews still required

Founder confirmation:

- Shaun Whiting Limited registration jurisdiction, company number, and registered office suitable for public legal notices;
- whether `sw@shaunwhiting.com` remains the monitored public support/privacy address;
- intended support response/deletion-request operating process;
- business retention decisions for accounts, trips, gifts, feedback, email events, audit logs, and co-pilot previews.

External/legal/vendor review:

- applicable jurisdiction, privacy-controller/processor roles, lawful bases, required notices, rights handling, age position, international transfers, and retention schedule;
- Better Auth cookies and deployed auth configuration;
- OpenAI data-handling terms for `store: false` and any abuse-monitoring retention;
- Web Speech implementation behaviour by supported browser/vendor;
- PostHog, GA4, Clarity, Omio Impact, affiliate, Booking.com, Viator, Google, Resend, Neon, map/search, and image-provider contracts/settings;
- affiliate disclosure placement and any jurisdiction-specific endorsement wording.

## Recommended delivery order

1. **#35 legal identity/Terms:** use this canonical identity and factual commercial flow; obtain founder registration inputs; draft Terms without implying Morrovia is the travel provider or payment recipient.
2. **#211 cookies/storage:** implemented in the application. Deployed verification of third-party identifiers and the Better Auth response headers remains an operational follow-up.
3. **#36 Privacy:** update the notice from the verified provider/data/retention matrix, including AI, speech, affiliates, deletion exceptions, and user rights/process.
4. **#212 AI/speech disclosure:** implemented with concise user-facing identification, just-in-time speech/transcript context and preserved preview-before-apply authority. Provider/legal review remains outstanding.
5. **#212 affiliate handoff:** consolidate duplicated direct accommodation/Omio link ownership, correct the Map planning-preview placement/disclosure gap, validate configured partner URLs/rel attributes/events, and keep Morrovia out of travel checkout/payment.

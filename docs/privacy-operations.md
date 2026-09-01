# Morrovia privacy operations

Status: **PUBLIC LAUNCH NOT READY**  
Evidence date: 1 September 2026  
Controller/operator: **Shaun Whiting Limited, trading as Morrovia**  
Operational owner: Shaun Whiting  
Privacy contact: `sw@shaunwhiting.com`

This is an executable engineering and operations record, not legal advice or regulatory certification. `Lawful-basis candidate` means a basis for founder/legal review, not a concluded legal basis. Any item marked **PENDING HUMAN ACTION** is not complete merely because this document describes the procedure.

Private beta can continue only while the manual controls in this document are owned, requests are logged, high-risk integrations remain disabled unless reviewed, and the public notice continues to describe the actual limitations. The unresolved contract, transfer, retention-approval, ICO-fee and EU-representative decisions block a public launch.

## 1. Processing inventory

| Processing record | Data category | Purpose | Lawful-basis candidate | Source | Storage/current flow | Processor or recipient | International transfer | Retention/current enforcement | Deletion path | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Accounts and authentication | Name, email, verified state, password credential material, OAuth provider ID/tokens, session token, IP address, user agent | Create and secure an account and session | Contract/requested service; legitimate interests for security | Traveller; Google if selected | Better Auth tables and `easyt_users` in Neon; HttpOnly auth cookies | Netlify runtime; Neon; Google for optional sign-in | Netlify production functions are evidenced in US; Neon region and Google path require account review | No application expiry for account; installed session default is seven days; manual account closure | Admin deletion removes product/auth account, account rows, verification and sessions; provider and backup steps remain manual | Shaun |
| Trips and route planning | Trip brief/document, origin, dates, travellers, stops, coordinates, route legs, bookings, notes, fixed plans and decisions | Build, save and edit a multi-stop trip | Contract/requested service | Traveller; deterministic/provider enrichment | `easyt_trips` and child tables in Neon; signed-out draft in browser storage | Netlify; Neon; selected map/place/travel providers | Hosting and provider-dependent; unresolved as listed below | Active indefinitely; trip removal is soft-delete with no purge job | Account deletion cascades; individual trip delete only sets `deleted_at`; browser draft requires device action | Shaun |
| Preferences and interests | Pace, budget, interests, accommodation/transport preferences, readiness profile values including nationality/residence/passport-expiry month | Personalise planning and readiness | Contract/requested service; explicit consent where a field requires it | Traveller | `easyt_users.preferences`, trip document and browser drafts | Netlify; Neon | Same as account/trip | No expiry or purge job | Account deletion; traveller edits; clear local device data separately | Shaun |
| Natural-language prompts | Initial trip description, speech transcript, co-pilot prompt and contextual trip excerpt | Interpret intent or suggest bounded trip changes | Contract/requested action | Traveller | Initial brief can enter browser draft and trip JSON; co-pilot request is sent transiently and preview/result may be stored in Neon | Netlify; Neon; OpenAI only when configured and invoked | OpenAI/hosting transfer needs contractual verification | Trip lifetime; co-pilot preview has `expires_at` but no evidenced purge job; OpenAI request uses `store: false` but provider abuse/security retention requires review | Account/trip deletion; expired-preview cleanup is **PENDING HUMAN ACTION** | Shaun |
| AI processing | Prompt, bounded trip context, structured candidate output and aggregate token usage | Semantic intent and signed-in Luna assistance | Contract/requested action | Traveller and current trip | Server-to-provider request; validated output may enter trip/preview | OpenAI when `OPENAI_API_KEY` and relevant mode/feature are active; Groq shadow is off unless explicitly enabled | Provider processing may leave UK; current executed DPA/transfer evidence absent | Morrovia does not retain provider prose; request sets `store:false`; provider-side retention unverified | Delete Morrovia copies; provider rights/deletion escalation per executed contract | Shaun |
| Speech | Microphone audio handled by browser speech service; final transcript text | Convert speech to editable prompt | Consent/requested action | Traveller microphone | Browser/vendor handles audio; Morrovia receives transcript text | Browser speech provider | Browser/provider-dependent and not provable from repository | Provider audio retention unknown; transcript follows prompt retention | Revoke browser permission; edit/delete transcript/trip; provider path may remain | Shaun |
| Product analytics | Consent record, pseudonymous vendor identifiers and allow-listed events/properties; no prompt, trip document or email in contract | Understand product funnel and reliability | Consent | Browser interactions | Versioned consent in local storage; PostHog and GA4 only after consent/configuration | PostHog is configured in evidenced production names; GA4 is optional and not evidenced as production-enabled | PostHog host is configured by environment; actual project region/DPA/transfer setup requires account review | Vendor retention is not configured in repository | Withdraw in Cookie settings and clear site data; vendor deletion procedure **PENDING HUMAN ACTION** | Shaun |
| Cookies/device storage | Auth cookies; consent, theme/language, signed-out trip draft, local trip recovery, finder/map state | Sessions, choices, draft recovery and product continuity | Necessary service; consent for optional categories | Browser/product | Browser cookies and local storage | Better Auth library; PostHog/GA4/Impact after consent | Optional vendor-dependent | Auth installed defaults documented; local storage has no expiry; vendor lifetimes unverified | Product-specific removal where present; otherwise clear site data; server account deletion cannot clear another device | Shaun |
| Affiliate attribution | Consent state, page/referrer/device/network data and eligible link interactions | Attribute referral commission | Consent | Browser interaction | Omio Impact script loads only after affiliate-attribution consent; outbound providers receive normal request context | Impact/Omio; destination travel providers are independent third parties | Likely provider-dependent; executed terms/location not evidenced | Vendor-controlled and unresolved | Withdraw consent/reload for future dispatch; clear site data; provider request for existing data | Shaun |
| Booking import | Forwarded email address/message at Resend, alias, extracted candidate/document, provenance and operational event | Let traveller review and add an existing booking | Contract/requested action; legitimate interests for security/logging | Deliberately forwarded email | Raw message retrieved from Resend and not intentionally copied wholesale to Morrovia DB; alias/candidate/event in Neon | Resend; Netlify; Neon | Resend and hosting/database path requires contract/region review | No cleanup job for candidates/events; provider raw-message retention unverified | Account deletion cascades alias/candidates; import events can survive with owner/candidate set null; email/provider cleanup manual | Shaun |
| Support and feedback | Email/support message, feedback rating/comment, owner/email context and triage state | Respond to support and improve product | Requested service; legitimate interests | Traveller | Mailbox/provider; `easyt_feedback` in Neon | Email provider; Netlify; Neon | Provider-dependent | No approved/enforced schedule | Manual mailbox deletion; account deletion removes owned feedback; unowned feedback requires lookup | Shaun |
| Transactional email and gifts | Recipient email, subject/template/status/error metadata/provider ID; gift note/token hash/status | Send service messages, gift links and diagnose delivery | Contract/requested service; legitimate interests for security/reliability | Traveller/product/provider | Resend plus `easyt_email_events`/`easyt_trip_gifts` in Neon | Resend; Netlify; Neon | Resend and hosting/database path requires review | No purge job; gift expiry does not itself delete row | Current account deletion does not remove email events; gift rows received from another owner may remain; manual search/provider action | Shaun |
| Logs, security and admin audit | Categorical error names/codes, request/network metadata, admin actor email/action/target, email/import event metadata | Reliability, incident response, abuse prevention and accountability | Legitimate interests; legal obligation where applicable | Runtime/admin/provider | Netlify logs; Neon audit/event tables | Netlify; Neon; relevant provider | Netlify production functions are in US; other regions unresolved | Provider log settings unknown; admin audit and email/import events have no purge | Manual provider/database procedure subject to security/legal retention; deletion audit is intentionally retained | Shaun |
| Maps, places, images and activity/accommodation providers | Search/place name, coordinates, dates/guest count/country/locale, destination ID, IP/browser metadata; selected results may enter trip | Return maps, geography, imagery and optional live travel inventory | Requested service; legitimate interests where appropriate | Traveller/trip/browser | Mostly transient API requests/cache; selected records/URLs can enter trip/browser state | CARTO/OpenStreetMap services, Photon, Nominatim, Overpass, Wikipedia/Wikimedia, Unsplash; Google Places/Booking Demand when configured; Viator production key is evidenced | Provider-specific; no executed transfer record evidenced | Provider/cache settings unresolved | Delete selected Morrovia records/device cache; provider handling under its own terms or DPA | Shaun |

### Inventory control

- Review this table before adding a new provider, personal-data field, analytics property, retention job or user-content store.
- The code owner proposing the change must update the processing record and public notice before release.
- Quarterly review owner: Shaun. First review due **1 December 2026 — PENDING HUMAN ACTION**.

## 2. Processor, recipient and subprocessor register

`Active` below means repository plus production environment-name evidence supports use; it does not prove an executed agreement or specific account setting. A client-side data destination with its own purposes is not labelled a processor without contractual evidence.

| Service | Classification supported by evidence | Purpose/data | Production evidence | Region | DPA/contract status | Transfer mechanism/status | Reference |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Netlify | Hosting/runtime processor candidate; contract must confirm | Application delivery, functions, request/security logs and data in transit | Primary production is documented on Netlify; functions region CMH (Ohio, US) | US function region; CDN/log locations require account review | **PENDING HUMAN ACTION:** download accepted service terms/DPA and current subprocessors | **PENDING HUMAN ACTION:** identify UK safeguard in executed terms and complete transfer assessment | [Privacy](https://www.netlify.com/privacy/) |
| Neon | Database processor candidate; contract must confirm | All server-side account/trip/auth/import/audit data | `DATABASE_URL` and Neon serverless client | **Unknown in current evidence** | **PENDING HUMAN ACTION:** record project region, plan, accepted DPA and subprocessors | Depends on project region and executed DPA; do not assume | [DPA](https://neon.tech/pdf/DPA.pdf) |
| Better Auth | Local authentication software, not a hosted recipient in this implementation | Creates auth cookies and reads/writes Morrovia's Neon tables | Package dependency and `auth.config.ts` | Runs in Morrovia runtime/database | Open-source/software terms review; no separate data transfer evidenced | None independently; inherits hosting/database transfers | [Documentation](https://www.better-auth.com/docs) |
| Resend | Email/receiving processor candidate; contract must confirm | Recipient/from address, message content, delivery metadata and optional forwarded booking message | Production `RESEND_API_KEY`/`EMAIL_FROM`; booking receiving remains feature-gated | US company; processing/subprocessor locations require account/DPA review | Public DPA exists; **PENDING HUMAN ACTION:** record account acceptance/execution and subprocessors | **PENDING HUMAN ACTION:** verify UK addendum/IDTA or other safeguard in executed DPA | [Legal/DPA](https://resend.com/legal) |
| Google OAuth | Independent authentication provider and possible processor/recipient role under product terms; do not over-classify | Google subject, verified email, name/image; Morrovia requests `openid email profile` only | Production OAuth client/secret names evidenced | Global/provider-controlled | **PENDING HUMAN ACTION:** retain account terms, OAuth configuration and policy review evidence | Verify applicable Google terms/transfer framework | [API User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) |
| OpenAI API | AI processor candidate when configured/invoked; contract controls | Prompt and bounded trip context; structured output | Key not present in evidenced production-name set; active in staging and code-capable | Provider-dependent | Public DPA exists; **PENDING HUMAN ACTION:** confirm Morrovia account/entity, DPA acceptance, data controls and subprocessors before production enablement | **PENDING HUMAN ACTION:** verify UK transfer terms in executed DPA | [DPA](https://cdn.openai.com/pdf/openai-data-processing-addendum.pdf) |
| Groq | Dormant AI provider path, not evidenced as active processing | Optional planner shadow input/output | Production key name exists, but shadow mode is off unless separately enabled and no production mode name was evidenced | Provider-dependent | **PENDING HUMAN ACTION** before enablement | Public DPA includes international-transfer terms, but account/execution still unproved | [Customer DPA](https://console.groq.com/docs/legal/customer-data-processing-addendum) |
| PostHog | Analytics processor candidate when consented/configured; contract must confirm | Pseudonymous identifiers and allow-listed events/properties | Production public key/host names evidenced; gated by product-analytics consent | Actual host/project region must be recorded from account | **PENDING HUMAN ACTION:** export accepted DPA, subprocessor list and retention settings | Depends on selected cloud region and executed DPA | [Trust center](https://trust.posthog.com/) |
| Google Analytics | Optional analytics recipient; not evidenced as enabled in current production names | Consent-gated pseudonymous analytics | Code/config only; no production measurement-ID name evidenced | Provider-dependent | **PENDING HUMAN ACTION** if enabled; keep disabled meanwhile | **PENDING HUMAN ACTION** if enabled | [Google data terms](https://privacy.google.com/businesses/processorterms/) |
| Omio Impact / Impact | Affiliate attribution recipient after consent; contractual role unresolved | Link/impression and browser/network attribution data | Hard-coded Impact script; consent-gated | Provider-dependent | **PENDING HUMAN ACTION:** obtain partner terms, privacy role, DPA if applicable, retention and subprocessor evidence | **PENDING HUMAN ACTION:** determine transfer mechanism/independent-controller notice | [Impact privacy](https://impact.com/privacy-policy/) |
| Unsplash | API/content provider; its API terms describe independent-controller treatment unless separately agreed | Search query, IP/request context, hotlinked image/view interaction | Production access-key name evidenced | Canada/provider network; exact flow requires account review | API terms/privacy apply; do not list as processor without separate written agreement | **PENDING HUMAN ACTION:** assess restricted transfer and terms | [API terms](https://unsplash.com/api-terms) |
| Viator | Affiliate/content API provider and independent destination at booking handoff | Destination ID, language/currency, request metadata; external booking navigation | Production key/environment names evidenced | Provider-dependent | **PENDING HUMAN ACTION:** retain partner agreement and privacy-role evidence | **PENDING HUMAN ACTION:** assess transfer under partner agreement | [Partner API](https://docs.viator.com/partner-api/) |
| Booking.com Demand | Dormant/optional live inventory provider | Coordinates, dates, guest count, booker country, locale and request metadata | Code-capable; production key/affiliate-ID names not evidenced | Provider-dependent | Keep disabled until agreement and role are recorded | **PENDING HUMAN ACTION** before enablement | [Demand API](https://developers.booking.com/demand/docs/open-api/demand-api) |
| CARTO/OpenStreetMap ecosystem, Nominatim, Photon, Overpass, Wikipedia/Wikimedia | External content/search recipients, commonly independent services absent a contract | Browser/API request context, query and coordinates | Map/search/image code paths | Provider-specific/global | Public terms/policies only unless a contract is later obtained | **PENDING HUMAN ACTION:** assess each production endpoint and minimise/pin self-hosted alternatives if needed | Links are recorded in the public Privacy notice |
| Travel/affiliate destinations | Independent third parties after deliberate handoff | Destination URL/referrer and information the traveller later enters | Contextual external links | Provider-specific | Their own terms/privacy; Morrovia does not handle checkout/payment | Traveller-facing third-party transfer; not a Morrovia processor claim | Public Affiliate disclosure and Terms |

### Provider evidence procedure

For every active provider, store outside the public repository: account legal entity, service/plan, processing region, dated accepted terms/DPA, current subprocessor list, retention setting, security contact, deletion/export route, breach notice route and transfer mechanism. Owner: Shaun. Status for every unverified cell above: **PENDING HUMAN ACTION**.

## 3. International-transfer map and missing agreements

Known transfer or possible transfer paths:

1. Browser → Netlify production runtime in Ohio → Neon database region unknown.
2. Runtime → Resend for email; optional inbound email is retrieved from Resend.
3. Runtime → OpenAI only when configured/invoked; Groq only if shadow mode is deliberately enabled.
4. Browser → PostHog host after consent; browser → Impact after separate affiliate-attribution consent.
5. Runtime/browser → Google, Unsplash, Viator, Booking.com and open map/content providers when the matching feature is used.

The UK ICO transfer guidance requires an applicable route such as adequacy or appropriate safeguards for a restricted transfer. EU SCCs alone are not a UK mechanism; an applicable UK IDTA or UK Addendum and a transfer risk/data-protection test may be required. This repository does not prove that any such agreement is executed.

Actionable agreement list — all **PENDING HUMAN ACTION**:

- Record the actual Neon project region and determine whether data leaves the UK; obtain the executed DPA/subprocessor list.
- Export Netlify account terms/DPA, confirm all production/log/CDN regions and identify the UK safeguard for US processing.
- Record acceptance/execution of the Resend DPA and its UK transfer terms; confirm raw inbound-message retention.
- Before enabling OpenAI in production, record the contracting entity, DPA, subprocessors, retention controls and UK transfer terms.
- Before enabling Groq shadow or GA4, complete the same contract/transfer record.
- Export the PostHog account's region, DPA, subprocessors and retention; confirm the configured host matches that evidence.
- Obtain Impact/Omio and Viator partner terms and determine whether each acts as processor or independent controller for Morrovia's flow.
- Assess Unsplash as an independent-controller transfer under its published API terms, or obtain a separate written agreement.
- Inventory the exact production endpoints for CARTO/OpenStreetMap/search/Wikimedia and record privacy/transfer treatment.
- Keep Google Places and Booking.com Demand disabled until the relevant contracts and transfer assessment exist.

## 4. Retention schedule

The proposed beta targets below are operational proposals for founder/legal approval. They are not public promises and are not represented as implemented until the `Enforcement` column says so.

| Record | Current reality | Proposed private-beta rule | Enforcement | Status/owner |
| --- | --- | --- | --- | --- |
| Account/profile/auth | Retained until manual admin deletion; sessions expire under Better Auth defaults | Active account plus closure processing; close verified requests promptly and complete within rights deadline | Mixed: session expiry automated; closure manual | Founder approval and deployed-cookie verification **PENDING HUMAN ACTION** / Shaun |
| Active trips/preferences | Indefinite while account exists; trip removal is soft-delete only | Retain while active; purge soft-deleted trips after 30 days unless restored, held for dispute/security or attached to an open rights case | No purge job | Approval + implementation **PENDING HUMAN ACTION** / Shaun |
| Deleted accounts | Primary linked records delete in one transaction; email/import events, recipient gifts, audit, provider copies and backups can remain | Verify primary deletion immediately; document residual legal/security record; expire recoverable backups under provider schedule | Primary automated on admin action; residual/manual unknown | Provider backup schedule and residual policy **PENDING HUMAN ACTION** / Shaun |
| Local/device recovery | No expiry; server cannot erase another browser | Clear known Morrovia local keys during signed-in closure where technically safe; instruct user to clear site data on every device | Manual today | Focused product follow-up **PENDING HUMAN ACTION** / Shaun |
| Booking aliases/candidates/import events | Alias/candidates cascade on account delete; events can survive; no age cleanup | Candidate and identifiable event purge 90 days after applied/rejected/expired; retain only minimal security aggregate longer if justified | No purge job | Approval + implementation **PENDING HUMAN ACTION** / Shaun |
| Support/feedback | Feedback/mailbox retention has no schedule | Keep case while open, then 24 months for ordinary support; shorter on valid deletion unless needed for legal/security reason | Manual | Legal/founder approval and mailbox procedure **PENDING HUMAN ACTION** / Shaun |
| Analytics | Vendor setting not evidenced | Use shortest useful window, proposed 14 months maximum for identifiable/pseudonymous event data; honour withdrawal prospectively and deletion requests | Vendor/manual | Account setting + DPA evidence **PENDING HUMAN ACTION** / Shaun |
| Logs/security/admin audit | Hosting retention unknown; audit/event rows indefinite | Hosting logs 30 days where configurable; security/admin audit 24 months, longer only for active incident/legal need | No database purge; provider setting unknown | Approval/configuration **PENDING HUMAN ACTION** / Shaun |
| Email-processing artifacts | Email events indefinite; Resend raw-message retention unknown | Delivery metadata 90 days; forwarded raw message shortest provider-supported period after candidate creation; security exception documented | No application purge; provider setting unknown | Resend setting + implementation **PENDING HUMAN ACTION** / Shaun |
| Co-pilot previews | `expires_at` is written; no cleanup job evidenced | Purge after expiry, with no prompt/provider prose in logs | Expiry field only | Cleanup implementation **PENDING HUMAN ACTION** / Shaun |
| Provider backups | No verified schedules | Record each provider's backup/deletion schedule and explain delayed erasure where deletion cannot be immediate | Provider/manual | **PENDING HUMAN ACTION** / Shaun |

Until automation exists, Shaun must run and record a monthly manual review of soft-deleted trips, expired co-pilot previews, old import candidates/events, email events and support records. The review must not delete records subject to an active rights request, incident, fraud investigation or legal hold.

## 5. Data-rights workflow

### Intake and deadline

1. Requests arrive at `sw@shaunwhiting.com` with the suggested subject `Morrovia data rights request`; requests received through another channel must still be recognised and forwarded.
2. Log a random case ID, received time, right requested, scope, status, deadline, identity steps, systems searched, actions, exceptions, delivery and closure in a founder-controlled encrypted register outside git. Never put a real request or identity evidence in this repository.
3. Owner: Shaun. Acknowledge within two business days. Under current ICO guidance, respond without undue delay and normally within one month. If a permitted complexity extension is needed, notify the person within the first month and record why. Pausing/clarification rules must follow then-current ICO guidance.
4. Verify identity proportionately using the signed-in account plus a reply/control challenge to the registered email where possible. Request additional ID only when necessary; minimise it and delete it after verification according to the case record.

### Search and response matrix

| Right | Systems/actions | Output/verification |
| --- | --- | --- |
| Access | Search Better Auth user/session/account/verification metadata (never disclose password hashes, live tokens or secrets); `easyt_users`; trips and child tables; gifts by sender/recipient/claim; feedback; stamps/memories; email events; admin audit target/actor where relevant; copilot previews; booking aliases/candidates/import events; support mailbox; analytics/provider tools; hosting/security logs where reasonable | Human-readable HTML/PDF cover plus machine-readable JSON/CSV archive; redact third-party data and secrets; deliver by an authenticated download or encrypted archive with key through a separate channel |
| Correction | Correct account/profile/trip/preferences in canonical stores; record consequential provider correction where applicable | Re-query changed rows and record before/after field names without copying unnecessary content into request log |
| Deletion/account closure | Run current admin deletion only after exact account confirmation; separately search email events, recipient gifts, import events, mailbox, analytics/providers and local-device limitations; apply lawful exceptions | Re-run the search checklist; record zero/de-identified/residual counts and reason for each retained category; send completion/limitation summary |
| Export/portability | Export traveller-provided account, preferences, trips, bookings and content in structured JSON plus CSV tables where practical | Validate archive opens, IDs/date fields are intelligible and no other traveller's data is present |
| Restriction/objection | Mark the case before further support/analytics use; disable optional consent routes; isolate disputed records or pause deletion where needed; assess legitimate-interest objection with legal input | Record systems restricted, decision and review date; do not silently treat restriction as erasure |
| Consent withdrawal | Cookie settings stops future optional analytics/affiliate dispatch; separately action provider deletion where requested and available | Verify current consent record and that optional scripts do not initialise after reload; unrelated account/trip state remains |

### Disposable exercise performed 1 September 2026

Run: `node scripts/privacy-rights-mock.mjs`  
Test: `node --test tests/privacy-operations.test.mjs`

The fixture uses only `privacy-mock@example.invalid` and in-memory records. It never opens `DATABASE_URL`, provider APIs or a real user account.

- Mock access result: located account/profile/preferences, trip, booking candidate/event, feedback, email event, gift, auth/session metadata, admin-audit reference and local-device record. Live token/password values are excluded from the export.
- Mock deletion result: account-linked product/auth/trip/candidate/feedback records were removed; email event, de-identified import event, recipient gift, deletion audit and device/provider limitations remained.
- Result: the workflow is mechanically repeatable, but it confirms that production requests need manual residual searches and provider actions. This exercise does not prove a live production export or erasure.

## 6. Account-closure reality

| Area | Current executable behaviour | Gap/action |
| --- | --- | --- |
| Canonical account | Admin-only endpoint requires authenticated allow-listed admin, exact email confirmation and blocks admin/self deletion | No self-service closure; verified support procedure is required |
| Cloud trips/profile/preferences | Deleting `easyt_users` cascades trips, child route data, stamps, memories, co-pilot previews, booking alias/candidates | Soft-deleted trips otherwise remain indefinitely; verify transaction result |
| Auth/session | Explicitly deletes session, account and email verification, then Better Auth user | External Google records and provider security logs remain under provider controls |
| Feedback | Explicit deletion by owner ID | Feedback already detached from owner or identified only in support email needs manual search |
| Booking/import | Alias and candidates cascade | Import events set owner/candidate null and can remain; Resend raw message/provider records require separate action |
| Gifts/email | Gifts created by the account cascade with its trips/sender | A gift received from somebody else can retain recipient email; `easyt_email_events` is keyed by email and survives |
| Audit/logs | Writes a minimal `account_deleted` event with user ID target | Admin audit and provider logs remain; retention/exception policy is unapproved |
| Device data | No server-side effect | User must clear Morrovia site data on every device; product-assisted cleanup is a focused follow-up |
| Backups | Not controlled by deletion transaction | Record provider backup expiry and explain delayed deletion; **PENDING HUMAN ACTION** |

The public Privacy notice already says there is no complete automated export/self-service deletion and identifies email-event, gift-recipient, audit, provider and browser-storage limitations. No contradicting product-copy change is justified by current evidence.

## 7. Incident and personal-data-breach runbook

1. **Identify and start the clock:** record incident ID, first awareness time, reporter, affected service/data and owner. Do not wait for certainty before logging.
2. **Contain:** revoke affected sessions/keys, disable the feature, restrict provider/admin access and preserve a safe service path. Rotate secrets through the provider and deployment secret manager, never through chat/git/logs.
3. **Preserve evidence:** retain relevant immutable provider/audit/log references, timestamps and hashes; avoid copying private prompts/trips into general tickets.
4. **Assess:** determine whose data, categories, volume, geography, confidentiality/integrity/availability impact, likely misuse, existing encryption/tokenization, and risks to people.
5. **Escalate:** Shaun owns controller decisions; contact affected processor security teams and obtain legal/security advice when severity or notification is uncertain.
6. **ICO decision:** consider whether the incident is a personal-data breach likely to risk people's rights and freedoms. If reportable, notify the ICO without undue delay and where feasible within 72 hours of awareness. Record reasons and timing whether notifying or not.
7. **Individual decision:** if likely high risk, notify affected people without undue delay with clear protective steps. Do not wait for the ICO if urgent user action is needed.
8. **Remediate:** patch root cause, rotate/revoke credentials, validate access boundaries, monitor misuse and restore deliberately.
9. **Close:** record chronology, evidence, notification decisions, communications, residual risk and owner approval.
10. **Review:** within ten business days, capture root cause, control changes, tests, owners and dates; update this register and public notice if data use changed.

Incident register location: founder-controlled encrypted operations register outside git. Provider contacts and policy/account identifiers must be recorded there. Status: **PENDING HUMAN ACTION**.

### Tabletop: leaked inbound-email webhook secret (synthetic)

- Scenario: monitoring detects unauthorized signed requests to the optional booking-import webhook. No real event occurred and no production data was queried for this tabletop.
- Immediate containment decision: set `BOOKING_IMPORT_ENABLED=false`, revoke/rotate only `RESEND_INBOUND_WEBHOOK_SECRET`, preserve request IDs/timestamps and restrict admin access.
- Scope decision: check whether requests passed signature validation, whether Resend message IDs were retrieved, which disposable/real aliases were targeted, and whether candidates/events were created. Do not log raw booking messages.
- Notification decision in the assumed facts: **not yet reportable**, because the scenario provides no evidence that personal data was accessed. The 72-hour assessment clock would start at awareness of a real suspected breach; the decision must be revisited as evidence arrives.
- Escalation threshold: confirmed unauthorized retrieval of a traveller's forwarded email triggers documented risk assessment, processor contact and ICO/user-notification decisions.
- Remediation: separate inbound/outbound secrets (already supported), add alerting on failed/abnormal webhook outcomes, verify no secret in logs/history, and rehearse provider rotation.
- Tabletop result: runbook leads to containment and a reasoned notification decision, but live monitoring contacts, provider escalation details and a second operator are **PENDING HUMAN ACTION**.

## 8. Access, secrets and logging findings

### Findings evidenced in repository

- Only `.env.example` and `.env.staging.example` are tracked; `.env*` is ignored with explicit example exceptions.
- A filename-only tracked-file pattern scan found no apparent live API key, private key or database credential outside the two placeholder examples. This is a point-in-time pattern scan, not a full secret-scanning service or proof about git history.
- Server credentials use non-`NEXT_PUBLIC_` names. Public variables are limited to browser origin/configuration, analytics project identifiers, environment label, site verification and the currently disabled Clarity identifier.
- Production and staging configuration are documented as separate; staging uses its own database marker, secrets and disposable accounts.
- Admin pages and mutation routes require an authenticated session plus exact email membership in server-only `ADMIN_EMAILS`. Account deletion additionally blocks deletion of the acting admin and other admins and writes an audit event.
- Production logs reviewed use categorical error names/codes rather than raw trip documents or secrets. Development-only semantic/co-pilot diagnostics exist; staging seed scripts print disposable test emails. Do not enable development diagnostics in production.
- Analytics is consent-gated and uses an allow-listed event contract. The inspected contract does not include raw prompts, trip documents, email addresses, provider tokens or booking-message bodies.

### Required controls

- Enable provider-side secret scanning and repository push protection; scan full history and record the result — **PENDING HUMAN ACTION**.
- Record who can access Netlify, Neon, Resend, Google, PostHog and registrar/DNS; require MFA, least privilege, recovery codes in a private vault and quarterly access review — **PENDING HUMAN ACTION**.
- Confirm production log retention/redaction in Netlify and provider dashboards; add alerts without payload content — **PENDING HUMAN ACTION**.
- Remove dormant production credentials (for example a provider key with its mode disabled) unless there is a documented near-term need — **PENDING HUMAN ACTION**.
- Verify `NEXT_PUBLIC_CLARITY_PROJECT_ID` remains absent and Clarity code remains disabled.
- Never place request exports, identity evidence, secrets, raw prompts or booking emails in git, Trello, ordinary analytics or general logs.

## 9. ICO data-protection fee action

Status: **PENDING HUMAN ACTION**  
Owner: Shaun Whiting  
Action: use the official [ICO fee self-assessment](https://ico.org.uk/fee-checker) for Shaun Whiting Limited, trading as Morrovia. Record the answers, result, decision date, payer/legal entity, registration/reference if payment is required, renewal owner/date, or the precise exemption relied on. Store evidence privately. Re-run after a material processing/business change and at renewal. Codex has not made or recorded the legal determination.

## 10. EU Article 27 representative question

Evidence for legal review:

- Morrovia is operated by a UK company and no EU establishment is recorded.
- The product supports EU destinations, EU residents and multiple languages, can be reached from the EU, and could serve EU travellers.
- Current repository evidence does not establish EU-specific paid marketing, EU currency/pricing, an EU launch campaign, EU customer volume, or systematic monitoring of EU individuals beyond optional product analytics.
- Mere accessibility is not the same as intentional offering/monitoring, but product language, marketing, actual users and analytics practice can change the assessment.

Legal-review question: does Morrovia's actual launch/marketing and monitoring place processing within UK GDPR/EU GDPR territorial scope in a way that requires an Article 27 EU representative, or does an exemption apply? Owner: Shaun. Obtain and retain legal advice before an intentional EU public launch. Status: **PENDING HUMAN ACTION**. No definitive conclusion is made here.

## 11. Public-notice reconciliation

| Surface | Operational comparison | Result/action |
| --- | --- | --- |
| Privacy | Correct operator/contact; describes account/trip/prompt/AI/speech/import/analytics/provider/local-storage flows; candidly states incomplete export/deletion, residual email/gift/audit/provider records and unresolved retention/transfers | No evidenced contradiction. Keep limitations until controls are implemented; later replace uncertainty only with verified facts |
| Cookies/settings | Correctly separates necessary state, product analytics and affiliate attribution; Clarity described as disabled | Verify deployed cookie names/flags and vendor identifiers/expiry in an incognito production test — **PENDING HUMAN ACTION** |
| Terms | Correct operator and software/referral boundary; does not claim Morrovia is travel merchant/agent | Formal solicitor approval and commercial-model re-review remain **PENDING HUMAN ACTION** |
| Affiliate disclosure | Explains commission, independent provider checkout and separate terms/privacy | Obtain partner-specific contract/privacy evidence; no factual copy change supported now |
| Booking import | Code and notice describe deliberate forwarding, review-before-apply and current raw-message/candidate boundary | Verify whether production receiving is actually enabled, record Resend retention, then test with a disposable mailbox — **PENDING HUMAN ACTION** |
| Older accessibility/privacy audit | Previously said inventory, retention, rights and incident procedures were missing | Superseded operationally by this document and the disposable exercise; legal approval, live provider settings and automated retention remain open |

## 12. Outstanding launch actions

Every item below is **PENDING HUMAN ACTION** unless later dated and evidenced:

- Complete the provider account/DPA/region/transfer register and execute any necessary UK IDTA/Addendum or other safeguard.
- Approve a retention schedule with legal input, configure provider retention and implement/police the deletion jobs/manual monthly review.
- Set up the encrypted rights/incident registers, response templates, secure export delivery and provider escalation contacts.
- Perform a disposable end-to-end rights request against an isolated staging account and provider dashboards; the repository-only exercise is not a live proof.
- Record backup deletion schedules and test a restored-backup/account-deletion case.
- Complete full-history secret scan, MFA/recovery/access review, production log-redaction/retention check and alerting.
- Complete the ICO fee self-assessment and record the decision privately.
- Obtain the Article 27/EU targeting legal determination before intentional EU public launch.
- Obtain solicitor review of Privacy/Terms/Cookies/Affiliate wording and the lawful-basis/retention/rights decisions.
- Verify deployed consent/cookies, auth headers, disabled Clarity path and provider scripts in an incognito browser.
- Assign a second incident contact and rehearse key/provider access recovery.

## 13. Sources and review cadence

Primary regulatory references:

- [ICO right-of-access response guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/)
- [ICO personal-data-breach guide](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/?force_isolation=true)
- [ICO international transfers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/)
- [ICO UK IDTA and Addendum guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/appropriate-safeguards/what-are-standard-data-protection-clauses-the-uk-idta-and-the-addendum/)
- [ICO fee checker](https://ico.org.uk/fee-checker)
- [EDPB Guidelines 3/2018 on territorial scope](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf)

Review this document quarterly, after an incident or rights exercise, and before enabling a new provider or materially changing Morrovia's travel/commercial role.

# Morrovia email system

This document records the private-beta email audit and the repository-owned
delivery contract. It is intentionally narrower than a marketing or general
notification platform.

## Audit before this change

| Email or boundary | Trigger and recipient | Sender / reply-to | Subject and content owner | Classification and preferences | Retry, environment and provider ownership | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Email verification | Better Auth sign-up, and blocked sign-in when verification is required; authoritative Better Auth user email | `EMAIL_FROM`; no reply-to | `auth.config.ts` and `lib/easyt/email.ts`; “Verify your Morrovia account” | Essential transactional; no marketing preference | No idempotency. Any environment with `RESEND_API_KEY` and `EMAIL_FROM` could send. Better Auth owned the token/trigger; Morrovia owned rendering; Resend owned delivery. | **REWRITE** |
| Password reset | Better Auth password-reset request; authoritative Better Auth user email | `EMAIL_FROM`; no reply-to | `auth.config.ts` and `lib/easyt/email.ts`; “Reset your Morrovia password” | Essential transactional; no marketing preference | No idempotency. Same broad environment behaviour as verification. Better Auth owned token/trigger; Morrovia owned rendering; Resend owned delivery. | **REWRITE** |
| Trip gift invitation | Authenticated dashboard POST after a gift record was created; submitted address normalized and stored as the invitation recipient | `EMAIL_FROM`; no reply-to | Gift API and `lib/easyt/email.ts`; subject included the private trip title | Explicit invitation, transactional; no marketing preference | Each retry created another gift/token and could send again. App URL was assembled locally with a localhost fallback. Morrovia owned trigger/template; Resend owned delivery. | **REWRITE** |
| Contact support notification | Valid public contact form after honeypot, size, field and per-instance IP-rate-limit checks; fixed `CONTACT_TO_EMAIL` recipient | `EMAIL_FROM`; traveller address as reply-to | Contact API and `lib/easyt/contact-message.ts`; plaintext with generated escaped-plaintext HTML fallback | Internal operational mail resulting from a requested contact action; no traveller preference | Target was fixed, but any configured environment could send. Deliberately not stored in `easyt_email_events`. | **KEEP + REWRITE PRESENTATION** |
| Contact acknowledgement | No existing send | Not applicable | Not applicable | Would be requested transactional mail | The form does not prove mailbox ownership and has no durable/distributed abuse control. | **DEFER** |
| Trip Ready | No asynchronous trip-build completion event exists | Not applicable | Not applicable | Transactional only if a real delayed completion event exists | Builder completion is immediate/in-session; adding infrastructure only for an email would add no truthful job. | **DEFER** |
| Trip Starts Soon / readiness | No scheduler or email-preference model exists | Not applicable | Not applicable | Lifecycle; must be optional | Dates/readiness exist, but scheduling, opt-out and automated-event idempotency do not. | **DEFER** |
| Finish Planning | No inactivity/actionable lifecycle trigger exists | Not applicable | Not applicable | Lifecycle; must be optional | A trip merely existing is not a truthful attention signal, and there is no preference model. | **DEFER** |
| Explore recommendations / price or destination campaigns | No email trigger exists | Not applicable | Not applicable | Marketing/lifecycle | No evidence or preference ownership. | **DEFER** |
| Booking confirmation | No authoritative Morrovia booking transaction exists | Not applicable | Not applicable | Transactional only for an authoritative purchase | Affiliate clicks, saves and Add to Day are not bookings. | **REMOVE FROM BETA SCOPE** |
| Forwarded-booking import | Signed Resend inbound webhook retrieves a forwarded message for an authenticated private alias | Inbound only | `app/api/easyt/email/inbound/route.ts` and booking-import helpers | Not an outbound email | Morrovia verifies webhook, alias, sender and deduplicates inbound events. It never sends a confirmation. | **KEEP INBOUND ONLY** |
| Resend event webhook | Signed delivery webhook updates existing event state | No outbound recipient | `app/api/easyt/email/webhook/route.ts` | Operational delivery state | Existing sent/delivered/bounced/complained and provider-supplied open/click statuses are recorded. This change does not add tracking. | **KEEP** |

The only visible legacy-brand result in the audited email surface was the admin
empty state (“an EasyT email”). Internal compatibility paths, database tables
and types still use `easyt`; they do not render into email output.

## Live repository-owned email set

| Email | Trigger | Recipient authority | Privacy-safe subject | CTA | Classification | Idempotency |
| --- | --- | --- | --- | --- | --- | --- |
| Verify email | Better Auth sign-up or verification-required sign-in | Better Auth user record | Verify your email for Morrovia | Verify email (unchanged one-time URL supplied by Better Auth) | Essential transactional | SHA-256 identity of the exact secure URL; unique email event plus Resend key |
| Reset password | Better Auth reset request | Better Auth user record | Reset your Morrovia password | Reset password (Morrovia reset route with Better Auth token) | Essential transactional | SHA-256 identity of the exact secure URL; unique email event plus Resend key |
| Trip invitation | Authenticated owner submits the dashboard share form; send uses the normalized recipient stored on the gift | You’ve been invited to a trip | View trip (private claim route) | Explicit invitation, transactional | Client request UUID deduplicates gift creation; HMAC-derived claim token makes the same request deterministic; gift ID identifies the unique email event and Resend request |
| Contact support notification | Accepted public contact submission | Fixed server-only `CONTACT_TO_EMAIL` | Morrovia contact · _topic_ | None; reply-to is the validated submitted address | Internal operational | Stable content-derived Resend key for provider retries; no database event, preserving the existing no-intentional-storage contract |

There are no live lifecycle or marketing emails. Consequently there is no
unsubscribe link or email-preference centre to claim. Account action and
explicit invitation mail must not be suppressed by a future marketing opt-out.
Any future Starts Soon, Finish Planning or recommendation mail must first add a
clear optional preference/opt-out owner.

## Presentation system

`lib/easyt/email-template.ts` owns a structured, table-based shell. Callers
provide text blocks, details, a quotation and at most one primary action rather
than raw HTML. Every dynamic value is escaped centrally.

The design translates current Morrovia semantics into email-compatible values:

- Georgia/Times fallbacks for the travel/editorial heading role;
- Arial/Helvetica fallbacks for readable UI copy;
- Morrovia paper and lilac surfaces, indigo ink/action and restrained pink signal;
- 600-pixel table layout, narrow-screen padding/type adjustment and dark-mode
  overrides with complete inline light-mode fallback;
- a text wordmark rather than a remote logo dependency;
- no required photography, scripts, CSS grid, flex layout or external stylesheet.

Images are deliberately absent from the beta transactional set. None of the
current triggers owns a reviewed, stable email-safe image URL, and each message
is clearer without one.

Every template produces HTML, plaintext and a preheader. Auth links are
validated as HTTP(S) and then retained byte-for-byte before HTML escaping so
token content is not reserialized. Repository-created links use
`getMorroviaApplicationUrl`, which accepts only an application-relative path and
uses `NEXT_PUBLIC_APP_URL`, then `BETTER_AUTH_URL`, as the canonical origin.

## Sender and reply-to

- `EMAIL_FROM` supplies the existing verified mailbox address. The delivery
  boundary discards any configured display name and always emits
  `Morrovia <configured-address>`.
- Verification, reset and gift mail have no invented reply-to address. Their
  footer links to the current Contact support route.
- Internal contact mail goes only to `CONTACT_TO_EMAIL` and uses the validated
  submitted traveller address as reply-to.
- The effective mailbox addresses are environment-owned and must never be
  written into source, QA fixtures or logs.

## Delivery and environment safety

`EMAIL_DELIVERY_MODE` accepts:

- `disabled`: no provider send;
- `allowlist`: only exact comma-separated addresses in
  `EMAIL_ALLOWED_RECIPIENTS` may receive mail;
- `live`: accepted only under `NODE_ENV=production`, canonical
  `https://morrovia.com`, and a production hosting context when one is present.

`NODE_ENV=test` always blocks provider sends, regardless of mode. When the mode
is omitted for backward compatibility, live delivery is inferred only for that
same canonical production environment; all other origins are disabled. The
checked-in example explicitly says `disabled`. Staging should use `allowlist`
and include only approved test accounts and the intended private support inbox.

Required server-only variables are `RESEND_API_KEY`, `EMAIL_FROM` and, for
contact, `CONTACT_TO_EMAIL`. `RESEND_WEBHOOK_SECRET` authenticates outbound
delivery events. `RESEND_INBOUND_WEBHOOK_SECRET`,
`BOOKING_IMPORT_RECEIVING_DOMAIN` and `BOOKING_IMPORT_ENABLED=true` are separate
inbound-booking controls.

Provider requests use an `Idempotency-Key`. The existing email-event table now
reserves that identity before a tracked send with a partial unique index. A
completed or in-flight duplicate does not call Resend again; a categorical
failed event can be acquired once for retry. Resend independently deduplicates
the same key for its documented 24-hour window. Keys contain hashes or record
IDs, never auth/reset/claim tokens.

Provider response bodies, API keys, token URLs and message bodies are not
logged. User-facing routes receive bounded Morrovia errors. Email-event failure
details contain only a category or HTTP status. Email delivery failure does not
invalidate a created gift; its private claim link remains available.

## Local review

Run:

```sh
npm run email:preview
```

This writes deterministic, ignored HTML and plaintext fixtures to
`.email-previews/`, including verification, reset, invitation with a note,
long Unicode invitation without a note, and internal contact mail. Open
`.email-previews/index.html` locally. The command never initializes Resend and
cannot send email.

Run focused behavioural coverage with:

```sh
npm run test:email
```

## External provider ownership and manual acceptance

Better Auth owns account tokens and trigger timing, but both auth templates and
the Resend call are repository-owned callbacks in `auth.config.ts`; there is no
Better Auth dashboard template used by this implementation. Google sign-in does
not send a Morrovia email.

Resend owns transport, verified-domain state, DNS guidance, suppression and its
dashboard/event settings. The repository cannot prove external configuration.
Before beta, the founder/operator must:

1. confirm the `EMAIL_FROM` mailbox uses a verified Morrovia sending domain;
2. verify SPF, DKIM and DMARC against the current DNS control plane;
3. set staging to `EMAIL_DELIVERY_MODE=allowlist` with approved addresses only;
4. set production to `EMAIL_DELIVERY_MODE=live` and confirm both application
   URLs are exactly `https://morrovia.com`;
5. confirm `CONTACT_TO_EMAIL` is the intended monitored private inbox and is on
   the staging allowlist;
6. review Resend open/click tracking settings and disable them if they are not
   explicitly required, because the application does not need to expand that
   tracking for beta;
7. perform manual inbox checks for Gmail, Outlook and Apple Mail in light/dark
   modes, with images disabled, using only authorised test recipients.

Missing sender-domain verification, an unintended external EasyT sender name,
or an external provider template that actually participates in the live flow
is a beta blocker. No such external template is referenced by the repository,
but dashboard state remains a manual acceptance boundary.

## Deliberately deferred lifecycle work

- **Contact acknowledgement:** add only after durable/distributed abuse control
  or equivalent mailbox-ownership protection prevents the public form becoming
  a mail-reflection channel.
- **Trip Ready:** add only if trip building becomes genuinely asynchronous and
  completion can occur after the traveller leaves.
- **Trip Starts Soon:** add only with a reliable scheduler, canonical
  timezone/date rule, lifecycle opt-out and durable event identity.
- **Finish Planning:** add only after beta evidence identifies a deterministic,
  actionable incomplete state and a non-spam timing rule.
- **Explore recommendations:** collect beta usage evidence first, then define
  preference and source-quality ownership.
- **Booking confirmations:** do not add unless Morrovia later receives and owns
  authoritative booking state; affiliate clicks never qualify.

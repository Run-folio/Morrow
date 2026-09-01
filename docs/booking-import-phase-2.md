# Forwarded booking import — Phase 2 operating contract

Last reviewed: 30 August 2026

This document describes the boundary implemented in code. It does not claim
that a production receiving address is live. No DNS or Resend dashboard setting
was changed as part of this work.

## 1. Inbound provider and boundary

Morrovia keeps Resend as the only email provider. Resend Receiving emits a
signed `email.received` webhook containing metadata; the adapter then retrieves
the text/HTML and headers through the Receiving API. The provider-neutral
boundary is `BookingCandidateProposal`, so another inbound adapter could be
added without changing trip confirmation.

Official references:

- <https://resend.com/docs/dashboard/receiving/introduction>
- <https://resend.com/docs/api-reference/emails/retrieve-received-email>
- <https://resend.com/docs/webhooks/verify-webhooks-requests>

## 2. Forwarding-address design

Addresses are `bookings+<opaque-random-token>@<configured-receiving-domain>`.
The 24-byte random token contains no email address, user ID or database ID. Only
its SHA-256 hash and four-character display hint are stored. The complete
address is shown once; replacing it revokes the previous address.

There is deliberately no fallback such as `bookings@morrovia.com`, and no
domain default in code. An address is not exposed until the feature flag,
receiving domain, signed webhook secret and Receiving API key are all
configured.

## 3. Owner resolution and security model

Owner resolution requires all three controls:

1. a valid opaque recipient token;
2. an outer sender equal to the verified account email; and
3. an upstream `dmarc=pass` result for that sender domain.

Sender resemblance alone is never enough. Unknown aliases, account mismatches
and unverifiable senders remain unattached. Inbound input can create or enrich a
candidate only; it cannot call the canonical trip-mutation function.

## 4. Parsing architecture

Provider detection and candidate extraction are separate deterministic steps.
HTML is converted to inert text in memory: scripts, styles, frames, objects,
media, images and markup are removed. Nothing is rendered, executed or fetched.
The parser reads bounded labelled fields and explicit full dates only. It does
not infer a missing year or follow a confirmation URL.

## 5. BookingCandidate reuse

The worktree did not contain the Phase 1 `BookingCandidate` named in the brief.
This implementation therefore adds the smallest provider-neutral architecture
needed by both `calendar` and `forwarded_email` sources. The candidate includes
typed source, type, confidence, field provenance, semantic fingerprint and
strict provider/reference fingerprint. Canonical mapping is a separate explicit
function and stores source provenance on `TripBooking.importDetails`.

## 6. Provider-specific parsers

Deterministic detection supports Booking.com, Trip.com, Viator, Omio, airline
confirmations and direct-hotel confirmations. Known providers get bounded URL
allow-lists; generic providers never produce a saved confirmation URL.

## 7. Generic extraction fallback

Unknown templates remain eligible only when confirmation language, a supported
booking type and strong labelled evidence are present. A generic low-confidence
unknown result is rejected. No AI model is used: there was no existing booking
extraction seam that justified sending hostile email content to a model.

## 8. Trip matching

Matching scores explicit dates against trip bounds and stop ranges, and matches
location against the trip title, stop names and countries. Exactly one score at
or above the strong threshold is suggested. Multiple strong matches remain
ambiguous; lower scores remain unmatched. A suggestion preselects a trip in the
review UI but never writes to it.

## 9. Review UX

Account Profile now owns a compact **Imported bookings** section using the
canonical controls and feedback patterns. It shows only extracted booking
fields, a masked reference, categorical confidence, source statement and trip
choice. **Add booking** is the explicit canonical write; **Not this** changes
candidate status only. Full message content is never returned to the browser.

## 10. Calendar/email dedupe

Every source uses the same provider-neutral semantic fingerprint (type, title,
dates and location). Provider/reference evidence adds a stricter fingerprint.
New evidence merges into one candidate. If that candidate was already added,
it returns to review and explicit confirmation enriches the same canonical
booking through its stored fingerprint/candidate ID rather than creating a
second booking.

## 11. Raw-email retention

Morrovia's database stores no raw subject, sender, body, HTML, header set,
attachment, arbitrary URL or parser error. Raw content exists only in memory
during the bounded request. Categorical audit rows contain provider event IDs,
owner/candidate links where verified, status and result code.

Resend currently documents 30-day email-data retention on its standard plans.
Its published Receiving API does not document a received-email deletion
endpoint. Morrovia therefore cannot claim immediate provider deletion. A
specific retention/deletion period for candidates and audit rows is an explicit
product, legal and operations decision still required; no period was invented
in code.

## 12. Security controls

- separate signed inbound webhook secret and five-minute replay window;
- webhook-event and provider-message uniqueness for idempotency;
- authenticated-owner limits of 20 messages/hour and 100 messages/day;
- 64 KB webhook, 512 KB provider response, 120 KB text and 180 KB HTML limits;
- all attachments rejected without download, including inline content;
- no remote images, arbitrary links, raw MIME or attachment retrieval;
- bounded forwarded-chain parsing and no AI/prompt execution;
- known-provider HTTPS URL allow-list only;
- owner-scoped candidate list, dismissal and confirmation routes;
- categorical error logging only.

## 13. Tests

Synthetic tests cover known and generic hotels, flights, irrelevant mail,
spoofing, malicious HTML, size limits, webhook idempotency schema, strong,
ambiguous and absent matches, explicit confirmation, calendar/email merge,
canonical enrichment, analytics allow-listing and owner-scoped routes. No real
booking confirmation is committed.

## 14. Provider and DNS setup required

1. In Resend, add and verify a receiving subdomain such as
   `forward.morrovia.com`. Resend recommends a subdomain so existing root MX
   records are not replaced.
2. Add exactly the MX record(s) shown by Resend for that receiving subdomain.
3. Create a dedicated webhook endpoint for
   `https://morrovia.com/api/easyt/email/inbound` and subscribe it only to
   `email.received`.
4. Copy that endpoint's signing secret to
   `RESEND_INBOUND_WEBHOOK_SECRET`. Do not reuse the outbound delivery-webhook
   secret.
5. Ensure `RESEND_API_KEY` has the access needed to retrieve received email.
6. Set `BOOKING_IMPORT_RECEIVING_DOMAIN` to the verified subdomain and only then
   set `BOOKING_IMPORT_ENABLED=true`.
7. Apply migration `0012_easyt_booking_imports.sql` before enabling the flag.
8. Test a private alias with synthetic mail, a replay, an attachment, an
   unverified sender and a real authenticated account before public exposure.

## 15. Cost

Resend's published transactional plans count sent and received emails together.
As of this review, Free lists 3,000 emails/month with a 100/day limit; Pro starts
at USD 20/month for 50,000 and overage is listed at USD 0.90/1,000. Confirm the
current plan and terms before launch: <https://resend.com/pricing>.

No second paid email provider or Gmail/Outlook connector was introduced.

## 16. Future Gmail/Outlook opportunity

This phase deliberately requests no mailbox scope and performs no inbox scan.
Gmail or Outlook could be evaluated later only as a separate, consent-heavy
connector with least-privilege review, provider verification, deletion/export
operations and a demonstrated traveller benefit over deliberate forwarding.

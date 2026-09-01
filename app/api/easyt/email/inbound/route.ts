import { NextResponse } from "next/server";

import {
  beginBookingImportEvent,
  bookingImportRateLimit,
  finishBookingImportEvent,
  resolvePrivateBookingImportAlias,
  updateBookingCandidateSuggestion,
  upsertBookingCandidate,
} from "@/lib/easyt/booking-candidate-repository";
import { matchBookingCandidateToTrips } from "@/lib/easyt/booking-candidate-trip";
import { BookingEmailParseError, extractForwardedBookingCandidate } from "@/lib/easyt/booking-candidate";
import {
  BOOKING_WEBHOOK_MAX_BYTES,
  authenticatedForwardingSender,
  bookingAliasTokenFromRecipients,
  parseResendInboundWebhook,
  readTextWithLimit,
  verifyResendWebhookSignature,
} from "@/lib/easyt/booking-email-security";
import { BookingInboundProviderError, retrieveResendBookingEmail } from "@/lib/easyt/booking-import-resend.server";
import { listTripsForOwner } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";

const response = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const enabled = process.env.BOOKING_IMPORT_ENABLED === "true";
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  const receivingDomain = process.env.BOOKING_IMPORT_RECEIVING_DOMAIN?.trim() ?? "";
  const apiKey = process.env.RESEND_API_KEY;
  if (!enabled || !secret || !receivingDomain || !apiKey) {
    return response({ error: "Inbound booking import is not configured." }, 503);
  }

  let rawBody: string;
  try {
    rawBody = await readTextWithLimit(request.body, BOOKING_WEBHOOK_MAX_BYTES);
  } catch {
    return response({ error: "Webhook payload is too large." }, 413);
  }
  if (!verifyResendWebhookSignature(rawBody, request.headers, secret)) return response({ error: "Unauthorized webhook." }, 401);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return response({ error: "Malformed webhook." }, 400);
  }
  const event = parseResendInboundWebhook(parsed);
  if (!event) return response({ ok: true, ignored: true });
  const webhookId = request.headers.get("svix-id")!;
  const started = await beginBookingImportEvent({ webhookId, providerMessageId: event.data.email_id });
  if (started.duplicate) return response({ ok: true, duplicate: true });
  if (!started.eventId) return response({ ok: true, duplicate: true });
  const eventId = started.eventId;

  const token = bookingAliasTokenFromRecipients(event.data.to, receivingDomain);
  if (!token) {
    await finishBookingImportEvent({ eventId, status: "rejected", resultCode: "unknown_recipient" });
    return response({ ok: true, accepted: false });
  }
  const owner = await resolvePrivateBookingImportAlias(token);
  if (!owner) {
    await finishBookingImportEvent({ eventId, status: "rejected", resultCode: "unknown_alias" });
    return response({ ok: true, accepted: false });
  }
  if (event.data.attachments?.length) {
    await finishBookingImportEvent({ eventId, status: "rejected", resultCode: "unsupported_attachments" });
    return response({ ok: true, accepted: false });
  }

  let verifiedOwner = false;
  try {
    const email = await retrieveResendBookingEmail(event.data.email_id);
    if (email.attachments.length) {
      await finishBookingImportEvent({ eventId, status: "rejected", resultCode: "unsupported_attachments" });
      return response({ ok: true, accepted: false });
    }
    if (!authenticatedForwardingSender({ from: email.from, accountEmail: owner.email, headers: email.headers })) {
      await finishBookingImportEvent({ eventId, status: "rejected", resultCode: "unverified_sender" });
      return response({ ok: true, accepted: false });
    }
    verifiedOwner = true;
    if (!(await bookingImportRateLimit(owner.id)).allowed) {
      await finishBookingImportEvent({ eventId, ownerId: owner.id, status: "rejected", resultCode: "rate_limited" });
      return response({ ok: true, accepted: false });
    }

    const proposal = extractForwardedBookingCandidate({ subject: email.subject, text: email.text, html: email.html });
    if (!proposal) {
      await finishBookingImportEvent({ eventId, ownerId: owner.id, status: "ignored", resultCode: "no_booking_found" });
      return response({ ok: true, candidate: false });
    }
    let candidate = await upsertBookingCandidate(owner.id, proposal);
    const match = matchBookingCandidateToTrips(candidate, await listTripsForOwner(owner.id));
    candidate = await updateBookingCandidateSuggestion(owner.id, candidate, match.suggestedTripId);
    const resultCode = match.status === "strong" ? "candidate_strong" : match.status === "ambiguous" ? "candidate_ambiguous" : "candidate_unmatched";
    await finishBookingImportEvent({ eventId, ownerId: owner.id, candidateId: candidate.id, status: "processed", resultCode });
    return response({ ok: true, candidate: true, match: match.status });
  } catch (error) {
    if (error instanceof BookingEmailParseError || (error instanceof BookingInboundProviderError && (error.code === "oversized" || error.code === "malformed"))) {
      const resultCode = error instanceof BookingEmailParseError && error.code === "oversized" ? "oversized_content" : "malformed_content";
      await finishBookingImportEvent({ eventId, ownerId: verifiedOwner ? owner.id : null, status: "rejected", resultCode });
      return response({ ok: true, accepted: false });
    }
    const resultCode = error instanceof BookingInboundProviderError ? `provider_${error.code}` : "processing_failed";
    await finishBookingImportEvent({ eventId, ownerId: verifiedOwner ? owner.id : null, status: "failed", resultCode });
    // Only categorical data reaches the log; raw provider/email/parser values
    // are deliberately excluded.
    console.error("Booking import failed.", { resultCode, errorName: error instanceof Error ? error.name : "UnknownError" });
    return response({ error: "Booking import is temporarily unavailable." }, 503);
  }
}

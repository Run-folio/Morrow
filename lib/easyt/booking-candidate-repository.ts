import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { getEasyTDatabase } from "./database";
import {
  isBookingCandidate,
  mergeBookingCandidate,
  type BookingCandidate,
  type BookingCandidateProposal,
  type BookingCandidateStatus,
} from "./booking-candidate";
import { tokenHash } from "./booking-email-security";

type CandidateRow = { document: unknown };

export type BookingImportOwner = { id: string; email: string };

export async function createPrivateBookingImportAlias(ownerId: string) {
  const sql = getEasyTDatabase();
  // Lower-case hex remains stable through email systems that canonicalise the
  // local part while preserving 192 bits of entropy.
  const token = randomBytes(24).toString("hex");
  const hash = tokenHash(token);
  const hint = token.slice(-4);
  await sql`
    insert into easyt_booking_import_aliases (owner_id, token_hash, token_hint)
    values (${ownerId}, ${hash}, ${hint})
    on conflict (owner_id) do update set
      token_hash = excluded.token_hash,
      token_hint = excluded.token_hint,
      updated_at = now()
  `;
  return { token, hint };
}

export async function getPrivateBookingImportAliasState(ownerId: string) {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select token_hint as hint, created_at as "createdAt", updated_at as "updatedAt"
    from easyt_booking_import_aliases where owner_id = ${ownerId} limit 1
  `) as Array<{ hint: string; createdAt: string; updatedAt: string }>;
  return rows[0] ?? null;
}

export async function resolvePrivateBookingImportAlias(token: string): Promise<BookingImportOwner | null> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select users.id, users.email
    from easyt_booking_import_aliases aliases
    join easyt_users users on users.id = aliases.owner_id
    where aliases.token_hash = ${tokenHash(token)}
    limit 1
  `) as BookingImportOwner[];
  return rows[0] ?? null;
}

export async function beginBookingImportEvent(input: { webhookId: string; providerMessageId: string }) {
  const sql = getEasyTDatabase();
  const id = randomUUID();
  const rows = (await sql`
    insert into easyt_booking_import_events (id, provider, webhook_id, provider_message_id)
    values (${id}::uuid, 'resend', ${input.webhookId}, ${input.providerMessageId})
    on conflict do nothing
    returning id
  `) as Array<{ id: string }>;
  if (rows[0]?.id) return { eventId: rows[0].id, duplicate: false };
  const existing = (await sql`
    select id, status from easyt_booking_import_events
    where webhook_id = ${input.webhookId} or provider_message_id = ${input.providerMessageId}
    limit 1
  `) as Array<{ id: string; status: string }>;
  if (existing[0]?.status === "failed") return { eventId: existing[0].id, duplicate: false };
  return { eventId: existing[0]?.id ?? null, duplicate: true };
}

export async function finishBookingImportEvent(input: {
  eventId: string;
  status: "processed" | "ignored" | "rejected" | "failed";
  resultCode: string;
  ownerId?: string | null;
  candidateId?: string | null;
}) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_booking_import_events
    set status = ${input.status},
      result_code = ${input.resultCode},
      owner_id = ${input.ownerId ?? null},
      candidate_id = ${input.candidateId ?? null}::uuid,
      processed_at = now()
    where id = ${input.eventId}::uuid
  `;
}

export async function bookingImportRateLimit(ownerId: string) {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select
      count(*) filter (where received_at >= now() - interval '1 hour')::int as "lastHour",
      count(*) filter (where received_at >= now() - interval '1 day')::int as "lastDay"
    from easyt_booking_import_events
    where owner_id = ${ownerId}
  `) as Array<{ lastHour: number; lastDay: number }>;
  const counts = rows[0] ?? { lastHour: 0, lastDay: 0 };
  return { allowed: counts.lastHour < 20 && counts.lastDay < 100, ...counts };
}

export async function upsertBookingCandidate(ownerId: string, proposal: BookingCandidateProposal): Promise<BookingCandidate> {
  const sql = getEasyTDatabase();
  const matchingRows = (await sql`
    select document from easyt_booking_candidates
    where owner_id = ${ownerId}
      and (fingerprint = ${proposal.fingerprint}
        or (${proposal.strictFingerprint} is not null and strict_fingerprint = ${proposal.strictFingerprint}))
    order by updated_at desc
    limit 1
  `) as CandidateRow[];
  const existing = matchingRows[0] && isBookingCandidate(matchingRows[0].document) ? matchingRows[0].document : null;
  if (existing) {
    const merged = mergeBookingCandidate(existing, proposal);
    await sql`
      update easyt_booking_candidates
      set source = ${merged.source},
        strict_fingerprint = ${merged.strictFingerprint},
        status = ${merged.status},
        document = ${JSON.stringify(merged)},
        updated_at = ${merged.updatedAt}
      where id = ${existing.id}::uuid and owner_id = ${ownerId}
    `;
    return merged;
  }

  const now = new Date().toISOString();
  const candidate: BookingCandidate = {
    ...proposal,
    id: randomUUID(),
    ownerId,
    status: "pending",
    suggestedTripId: null,
    canonicalTripId: null,
    canonicalBookingId: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await sql`
      insert into easyt_booking_candidates (
        id, owner_id, source, fingerprint, strict_fingerprint, status, document, created_at, updated_at
      ) values (
        ${candidate.id}::uuid, ${ownerId}, ${candidate.source}, ${candidate.fingerprint},
        ${candidate.strictFingerprint}, ${candidate.status}, ${JSON.stringify(candidate)}, ${now}, ${now}
      )
    `;
    return candidate;
  } catch (error) {
    // A simultaneous provider retry may have won the unique semantic
    // fingerprint. Re-read and merge without exposing the database error.
    const racedRows = (await sql`
      select document from easyt_booking_candidates
      where owner_id = ${ownerId} and fingerprint = ${proposal.fingerprint}
      limit 1
    `) as CandidateRow[];
    if (racedRows[0] && isBookingCandidate(racedRows[0].document)) {
      const merged = mergeBookingCandidate(racedRows[0].document, proposal);
      await sql`
        update easyt_booking_candidates
        set source = ${merged.source}, strict_fingerprint = ${merged.strictFingerprint}, status = ${merged.status},
          document = ${JSON.stringify(merged)}, updated_at = ${merged.updatedAt}
        where id = ${merged.id}::uuid and owner_id = ${ownerId}
      `;
      return merged;
    }
    throw error;
  }
}

export async function updateBookingCandidateSuggestion(ownerId: string, candidate: BookingCandidate, suggestedTripId: string | null) {
  const sql = getEasyTDatabase();
  const updated = { ...candidate, suggestedTripId, updatedAt: new Date().toISOString() };
  await sql`
    update easyt_booking_candidates
    set suggested_trip_id = ${suggestedTripId}, document = ${JSON.stringify(updated)}, updated_at = ${updated.updatedAt}
    where id = ${candidate.id}::uuid and owner_id = ${ownerId}
  `;
  return updated;
}

export async function listBookingCandidatesForOwner(ownerId: string): Promise<BookingCandidate[]> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select document from easyt_booking_candidates
    where owner_id = ${ownerId}
    order by case status when 'pending' then 0 when 'added' then 1 else 2 end, updated_at desc
    limit 100
  `) as CandidateRow[];
  return rows.map((row) => row.document).filter(isBookingCandidate);
}

export async function getBookingCandidateForOwner(ownerId: string, candidateId: string): Promise<BookingCandidate | null> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select document from easyt_booking_candidates
    where id = ${candidateId}::uuid and owner_id = ${ownerId}
    limit 1
  `) as CandidateRow[];
  return rows[0] && isBookingCandidate(rows[0].document) ? rows[0].document : null;
}

export async function setBookingCandidateStatus(input: {
  ownerId: string;
  candidate: BookingCandidate;
  status: BookingCandidateStatus;
  canonicalTripId?: string | null;
  canonicalBookingId?: string | null;
}) {
  const sql = getEasyTDatabase();
  const updated: BookingCandidate = {
    ...input.candidate,
    status: input.status,
    canonicalTripId: input.canonicalTripId ?? input.candidate.canonicalTripId,
    canonicalBookingId: input.canonicalBookingId ?? input.candidate.canonicalBookingId,
    updatedAt: new Date().toISOString(),
  };
  const rows = (await sql`
    update easyt_booking_candidates
    set status = ${updated.status},
      canonical_trip_id = ${updated.canonicalTripId},
      canonical_booking_id = ${updated.canonicalBookingId},
      document = ${JSON.stringify(updated)},
      updated_at = ${updated.updatedAt}
    where id = ${updated.id}::uuid and owner_id = ${input.ownerId}
    returning id
  `) as Array<{ id: string }>;
  return rows[0] ? updated : null;
}

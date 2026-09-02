import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getEasyTDatabase } from "./database";
import {
  canPromoteTripForOwner,
  canonicalTripForOwner,
  decideExistingTripPromotion,
  duplicateTripDocument,
  type TripPromotionConflictReason,
} from "./trip-promotion";
import {
  EasyTTripSaveConflictError,
  nextTripUpdatedAt,
} from "./trip-continuity";
import { EasyTTrip, isEasyTTrip } from "./trip";
import { normalizedLegEndpoints } from "./trip-persistence";
import { resolveTripTransferJourneys } from "./multimodal-transfer-resolution.server";
import { defaultTravelProfile, travelProfileFromUnknown, type TravelProfile } from "./travel-profile";
import { defaultTravelReadinessProfile, isTravelReadinessProfile, type TravelReadinessProfile } from "./travel-readiness";

type TripDocumentRow = { document: unknown };
export type EasyTUserPreferences = { language: "en" | "es"; travelProfile: TravelProfile; travelReadinessProfile: TravelReadinessProfile };

export type EasyTEmailEvent = {
  id: string;
  providerId: string | null;
  recipientEmail: string;
  subject: string;
  template: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type GiftRow = {
  id: string;
  trip_id: string;
  sender_id: string;
  recipient_email: string;
  note: string | null;
  token_hash: string;
  status: "pending" | "claimed" | "revoked" | "expired";
  claimed_by: string | null;
  claimed_trip_id: string | null;
  expires_at: string;
  sender_name: string | null;
  sender_email: string;
  trip_title: string;
  document: unknown;
};

export type EasyTGiftPreview = {
  tripTitle: string;
  senderName: string;
  recipientEmail: string;
  note: string | null;
  status: GiftRow["status"];
  expiresAt: string;
};

export async function createEasyTEmailEvent(input: {
  providerId?: string | null;
  recipientEmail: string;
  subject: string;
  template: string;
  status: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const sql = getEasyTDatabase();
  const id = randomUUID();
  await sql`
    insert into easyt_email_events (id, provider_id, recipient_email, subject, template, status, error_message, metadata)
    values (${id}, ${input.providerId ?? null}, ${input.recipientEmail}, ${input.subject}, ${input.template}, ${input.status}, ${input.errorMessage ?? null}, ${JSON.stringify(input.metadata ?? {})})
  `;
  return id;
}

export async function updateEasyTEmailEvent(input: { providerId: string; status: string; occurredAt?: string }) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_email_events
    set status = ${input.status}, updated_at = ${input.occurredAt ?? new Date().toISOString()}
    where provider_id = ${input.providerId}
  `;
}

export async function listEasyTEmailEvents(limit = 250): Promise<EasyTEmailEvent[]> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select id, provider_id as "providerId", recipient_email as "recipientEmail", subject, template,
      status, error_message as "errorMessage", created_at as "createdAt", updated_at as "updatedAt"
    from easyt_email_events order by created_at desc limit ${Math.min(Math.max(limit, 1), 500)}
  `) as EasyTEmailEvent[];
  return rows;
}

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function ensureEasyTUser(
  ownerId: string,
  email: string,
  name?: string | null,
) {
  const sql = getEasyTDatabase();
  await sql`
    insert into easyt_users (id, email, name)
    values (${ownerId}, ${email}, ${name ?? null})
    on conflict (id) do update set
      email = excluded.email,
      name = coalesce(excluded.name, easyt_users.name),
      updated_at = now()
  `;
}

export async function getEasyTUserPreferences(
  ownerId: string,
): Promise<EasyTUserPreferences> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select preferences from easyt_users where id = ${ownerId} limit 1
  `) as Array<{ preferences: Record<string, unknown> }>;
  const travelProfile = travelProfileFromUnknown(rows[0]?.preferences?.travelProfile);
  return {
    language: rows[0]?.preferences?.language === "es" ? "es" : "en",
    travelProfile: travelProfile ?? defaultTravelProfile,
    travelReadinessProfile: isTravelReadinessProfile(rows[0]?.preferences?.travelReadinessProfile) ? rows[0].preferences.travelReadinessProfile : defaultTravelReadinessProfile,
  };
}

export async function updateEasyTUserPreferences(
  ownerId: string,
  preferences: EasyTUserPreferences,
) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_users
    set preferences = preferences || ${JSON.stringify(preferences)}::jsonb,
      updated_at = now()
    where id = ${ownerId}
  `;
}

export async function getCountryStamps(ownerId: string) {
  const sql = getEasyTDatabase();
  return (await sql`
    select country_id as "countryId", status
    from easyt_country_stamps
    where owner_id = ${ownerId}
  `) as Array<{ countryId: string; status: "visited" | "want" }>;
}

export async function setCountryStamp(
  ownerId: string,
  countryId: string,
  status: "visited" | "want" | null,
) {
  const sql = getEasyTDatabase();
  if (status === null) {
    await sql`delete from easyt_country_stamps where owner_id = ${ownerId} and country_id = ${countryId}`;
    return;
  }
  await sql`
    insert into easyt_country_stamps (owner_id, country_id, status)
    values (${ownerId}, ${countryId}, ${status})
    on conflict (owner_id, country_id) do update set
      status = excluded.status,
      updated_at = now()
  `;
}

export async function getCountryMemories(ownerId: string) {
  const sql = getEasyTDatabase();
  return (await sql`
    select country_id as "countryId", note, photo_data as "photoData"
    from easyt_country_memories where owner_id = ${ownerId}
  `) as Array<{ countryId: string; note: string | null; photoData: string | null }>;
}

export async function setCountryMemory(input: { ownerId: string; countryId: string; note?: string; photoData?: string | null }) {
  const sql = getEasyTDatabase();
  await sql`
    insert into easyt_country_memories (owner_id, country_id, note, photo_data)
    values (${input.ownerId}, ${input.countryId}, ${input.note?.trim() || null}, ${input.photoData || null})
    on conflict (owner_id, country_id) do update set note = excluded.note, photo_data = excluded.photo_data, updated_at = now()
  `;
}

export async function createEasyTFeedback(input: {
  ownerId: string;
  rating: number;
  comment?: string;
  surface?: string;
}) {
  const sql = getEasyTDatabase();
  await sql`
    insert into easyt_feedback (owner_id, rating, comment, surface)
    values (${input.ownerId}, ${input.rating}, ${input.comment?.trim() || null}, ${input.surface ?? "dashboard"})
  `;
}

export type EasyTFeedbackRow = {
  id: string;
  ownerId: string | null;
  ownerEmail: string | null;
  rating: number;
  comment: string | null;
  surface: string;
  status: EasyTFeedbackStatus;
  internalNote: string | null;
  triagedBy: string | null;
  triagedAt: string | null;
  createdAt: string;
};

export const easyTFeedbackStatuses = ["new", "reviewed", "planned", "resolved"] as const;
export type EasyTFeedbackStatus = (typeof easyTFeedbackStatuses)[number];

export async function listEasyTFeedback(): Promise<EasyTFeedbackRow[]> {
  const sql = getEasyTDatabase();
  return (await sql`
    select feedback.id,
      feedback.owner_id as "ownerId",
      users.email as "ownerEmail",
      feedback.rating,
      feedback.comment,
      feedback.surface,
      feedback.status,
      feedback.internal_note as "internalNote",
      feedback.triaged_by as "triagedBy",
      feedback.triaged_at as "triagedAt",
      feedback.created_at as "createdAt"
    from easyt_feedback feedback
    left join easyt_users users on users.id = feedback.owner_id
    order by feedback.created_at desc
    limit 500
  `) as EasyTFeedbackRow[];
}

export async function updateEasyTFeedbackTriage(input: {
  feedbackId: string;
  status: EasyTFeedbackStatus;
  internalNote: string;
  triagedBy: string;
}) {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    update easyt_feedback
    set status = ${input.status},
      internal_note = ${input.internalNote.trim() || null},
      triaged_by = ${input.triagedBy},
      triaged_at = now()
    where id = ${input.feedbackId}::uuid
    returning id
  `) as Array<{ id: string }>;
  return Boolean(rows[0]);
}

export async function listTripsForOwner(ownerId: string): Promise<EasyTTrip[]> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select document
    from easyt_trips
    where owner_id = ${ownerId} and deleted_at is null
    order by updated_at desc
  `) as TripDocumentRow[];
  return rows.map((row) => row.document).filter(isEasyTTrip);
}

export async function getTripForOwner(
  ownerId: string,
  tripId: string,
): Promise<EasyTTrip | null> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select document
    from easyt_trips
    where id = ${tripId} and owner_id = ${ownerId} and deleted_at is null
    limit 1
  `) as TripDocumentRow[];
  return rows[0] && isEasyTTrip(rows[0].document) ? resolveTripTransferJourneys(rows[0].document) : null;
}

export async function saveTripForOwner(
  ownerId: string,
  trip: EasyTTrip,
): Promise<EasyTTrip> {
  if (trip.ownerId !== ownerId) throw new Error("Trip ownership mismatch.");
  const sql = getEasyTDatabase();
  // Stop IDs originate in the builder (for example `tokyo`) and are only
  // unique inside one trip. The database stores stops in a shared table, so
  // namespace them before persistence and update every relation atomically.
  // The incoming updatedAt remains the compare-and-swap token; only the
  // repository issues the next token after the update has won.
  const routedTrip = await resolveTripTransferJourneys(trip);
  const document = canonicalTripForOwner(ownerId, routedTrip, nextTripUpdatedAt(trip.updatedAt));
  const documentJson = JSON.stringify(document);
  const transactionResults = await sql.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${document.id}, 0))`,
    tx`select set_config('morrovia.save_document', ${documentJson}, true)`,
    tx`
      update easyt_trips
      set title = ${document.title},
        start_date = ${document.startDate},
        end_date = ${document.endDate},
        travellers = ${document.travellers},
        status = case when document ->> 'status' = 'planned' and ${document.status} = 'draft' then 'planned' else ${document.status} end,
        pace = ${document.brief.pace},
        currency = ${document.currency},
        brief = ${JSON.stringify(document.brief)},
        document = jsonb_set(
          current_setting('morrovia.save_document')::jsonb,
          '{status}',
          to_jsonb(case when document ->> 'status' = 'planned' and ${document.status} = 'draft' then 'planned' else ${document.status} end),
          true
        ),
        schema_version = ${document.schemaVersion},
        updated_at = ${document.updatedAt}
      where id = ${document.id}
        and owner_id = ${ownerId}
        and deleted_at is null
        and document ->> 'updatedAt' = ${trip.updatedAt}
      returning document
    `,
    tx`
      delete from easyt_recommendations
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
    `,
    tx`
      delete from easyt_plan_items
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
    `,
    tx`
      delete from easyt_legs
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
    `,
    tx`
      delete from easyt_stops
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
    `,
    ...document.stops.map(
      (stop) => tx`
        insert into easyt_stops (
          id, trip_id, stop_order, name, country, latitude, longitude,
          arrival_date, departure_date, nights
        )
        select
          ${stop.id}, ${document.id}, ${stop.order}, ${stop.name}, ${stop.country},
          ${stop.latitude}, ${stop.longitude}, ${stop.arrivalDate}, ${stop.departureDate}, ${stop.nights}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
      `,
    ),
    ...document.legs.map(
      (leg) => {
        const endpoint = normalizedLegEndpoints(document.id, leg);
        return tx`
        insert into easyt_legs (
          id, trip_id, from_stop_id, to_stop_id,
          from_endpoint_id, to_endpoint_id, from_endpoint_kind, to_endpoint_kind,
          mode, distance_km,
          duration_minutes, provider, route_metadata
        )
        select
          ${leg.id}, ${document.id}, ${endpoint.fromStopId}, ${endpoint.toStopId},
          ${endpoint.fromEndpointId}, ${endpoint.toEndpointId}, ${endpoint.fromEndpointKind}, ${endpoint.toEndpointKind},
          ${leg.mode},
          ${leg.distanceKm}, ${leg.durationMinutes}, ${leg.provider}, ${JSON.stringify(leg.routeMetadata)}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
        `;
      },
    ),
    ...document.planItems.map(
      (item) => tx`
        insert into easyt_plan_items (
          id, trip_id, stop_id, day_number, plan_date, item_type, title,
          reason, notes, starts_at, ends_at, booking_url, latitude, longitude
        )
        select
          ${item.id}, ${document.id}, ${item.stopId}, ${item.dayNumber}, ${item.date},
          ${item.type}, ${item.title}, ${item.reason}, ${JSON.stringify(item.notes)},
          ${item.startsAt}, ${item.endsAt}, ${item.bookingUrl}, ${item.latitude}, ${item.longitude}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
      `,
    ),
    ...document.recommendations.map(
      (recommendation) => tx`
        insert into easyt_recommendations (
          id, trip_id, rule, severity, message, proposed_change, status
        )
        select
          ${recommendation.id}, ${document.id}, ${recommendation.rule}, ${recommendation.severity},
          ${recommendation.message}, ${JSON.stringify(recommendation.proposedChange)}, ${recommendation.status}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.save_document')::jsonb
        )
      `,
    ),
  ]);

  const updated = (transactionResults[2] as TripDocumentRow[])[0]?.document;
  if (isEasyTTrip(updated)) return updated;

  const rows = (await sql`
    select owner_id as "ownerId", deleted_at as "deletedAt", document
    from easyt_trips
    where id = ${trip.id}
    limit 1
  `) as Array<{ ownerId: string; deletedAt: string | null; document: unknown }>;
  const existing = rows[0];
  if (!existing) throw new Error("Trip not found.");
  if (existing.ownerId !== ownerId) throw new Error("Trip ownership mismatch.");
  if (!isEasyTTrip(existing.document)) throw new Error("Stored trip document is invalid.");
  throw new EasyTTripSaveConflictError(
    existing.deletedAt
      ? "This trip was removed from the cloud. This device did not recreate it."
      : "This trip changed on another device. This device did not replace it.",
    existing.document,
    existing.deletedAt ? "cloud-deleted" : "cloud-changed",
  );
}

export type TripPromotionResult = {
  trip: EasyTTrip;
  outcome: "promoted" | "already-canonical" | "conflict";
  conflictReason?: TripPromotionConflictReason;
};

/**
 * Claim one browser-local document for an authenticated owner. The insert-only
 * boundary is deliberately separate from ordinary edits: after an ID exists in
 * cloud storage, that cloud row wins and promotion can never update it.
 */
export async function promoteTripForOwner(
  ownerId: string,
  trip: EasyTTrip,
): Promise<TripPromotionResult> {
  if (!canPromoteTripForOwner(trip, ownerId)) {
    throw new Error("Trip ownership mismatch.");
  }

  const sql = getEasyTDatabase();
  const routedTrip = await resolveTripTransferJourneys(trip);
  const document = canonicalTripForOwner(ownerId, routedTrip);
  const documentJson = JSON.stringify(document);
  const transactionResults = await sql.transaction((tx) => [
    // Serialize promotion attempts for one canonical ID. This makes concurrent
    // retries choose one insert without a check-then-write race.
    tx`select pg_advisory_xact_lock(hashtextextended(${document.id}, 0))`,
    // Keep the candidate once in transaction-local state instead of repeating
    // a potentially large trip JSON parameter for every normalized child row.
    tx`select set_config('morrovia.promotion_document', ${documentJson}, true)`,
    tx`
      insert into easyt_trips (
        id, owner_id, title, start_date, end_date, travellers, status,
        pace, currency, brief, document, schema_version, created_at, updated_at, deleted_at
      ) values (
        ${document.id}, ${ownerId}, ${document.title}, ${document.startDate}, ${document.endDate},
        ${document.travellers}, ${document.status}, ${document.brief.pace}, ${document.currency},
        ${JSON.stringify(document.brief)}, current_setting('morrovia.promotion_document')::jsonb, ${document.schemaVersion},
        ${document.createdAt}, ${document.updatedAt}, null
      )
      on conflict (id) do nothing
      returning id
    `,
    tx`
      delete from easyt_recommendations
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
    `,
    tx`
      delete from easyt_plan_items
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
    `,
    tx`
      delete from easyt_legs
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
    `,
    tx`
      delete from easyt_stops
      where trip_id = ${document.id}
        and exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
    `,
    ...document.stops.map(
      (stop) => tx`
        insert into easyt_stops (
          id, trip_id, stop_order, name, country, latitude, longitude,
          arrival_date, departure_date, nights
        )
        select
          ${stop.id}, ${document.id}, ${stop.order}, ${stop.name}, ${stop.country},
          ${stop.latitude}, ${stop.longitude}, ${stop.arrivalDate}, ${stop.departureDate}, ${stop.nights}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
      `,
    ),
    ...document.legs.map(
      (leg) => {
        const endpoint = normalizedLegEndpoints(document.id, leg);
        return tx`
        insert into easyt_legs (
          id, trip_id, from_stop_id, to_stop_id,
          from_endpoint_id, to_endpoint_id, from_endpoint_kind, to_endpoint_kind,
          mode, distance_km,
          duration_minutes, provider, route_metadata
        )
        select
          ${leg.id}, ${document.id}, ${endpoint.fromStopId}, ${endpoint.toStopId},
          ${endpoint.fromEndpointId}, ${endpoint.toEndpointId}, ${endpoint.fromEndpointKind}, ${endpoint.toEndpointKind},
          ${leg.mode},
          ${leg.distanceKm}, ${leg.durationMinutes}, ${leg.provider}, ${JSON.stringify(leg.routeMetadata)}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
        `;
      },
    ),
    ...document.planItems.map(
      (item) => tx`
        insert into easyt_plan_items (
          id, trip_id, stop_id, day_number, plan_date, item_type, title,
          reason, notes, starts_at, ends_at, booking_url, latitude, longitude
        )
        select
          ${item.id}, ${document.id}, ${item.stopId}, ${item.dayNumber}, ${item.date},
          ${item.type}, ${item.title}, ${item.reason}, ${JSON.stringify(item.notes)},
          ${item.startsAt}, ${item.endsAt}, ${item.bookingUrl}, ${item.latitude}, ${item.longitude}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
      `,
    ),
    ...document.recommendations.map(
      (recommendation) => tx`
        insert into easyt_recommendations (
          id, trip_id, rule, severity, message, proposed_change, status
        )
        select
          ${recommendation.id}, ${document.id}, ${recommendation.rule}, ${recommendation.severity},
          ${recommendation.message}, ${JSON.stringify(recommendation.proposedChange)}, ${recommendation.status}
        where exists (
          select 1 from easyt_trips
          where id = ${document.id} and owner_id = ${ownerId}
            and deleted_at is null and document = current_setting('morrovia.promotion_document')::jsonb
        )
      `,
    ),
  ]);

  const inserted = (transactionResults[2] as Array<{ id: string }>)[0];
  const rows = (await sql`
    select owner_id, document, deleted_at,
      document = ${documentJson}::jsonb as matches
    from easyt_trips
    where id = ${document.id}
    limit 1
  `) as Array<{
    owner_id: string;
    document: unknown;
    deleted_at: string | null;
    matches: boolean;
  }>;
  const stored = rows[0];
  if (!stored || stored.owner_id !== ownerId) {
    throw new Error("Trip ownership mismatch.");
  }
  if (!isEasyTTrip(stored.document)) {
    throw new Error("The canonical trip document could not be read.");
  }
  if (inserted) return { trip: stored.document, outcome: "promoted" };
  return {
    trip: stored.document,
    ...decideExistingTripPromotion(trip, stored.document, {
      exactMatch: stored.matches,
      cloudDeleted: Boolean(stored.deleted_at),
    }),
  };
}

export async function archiveTripForOwner(ownerId: string, tripId: string) {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    update easyt_trips
    set status = 'archived', updated_at = now(),
      document = jsonb_set(
        jsonb_set(
          jsonb_set(document, '{archivedFromStatus}', to_jsonb(case when document ->> 'status' = 'planned' then 'planned' else 'draft' end), true),
          '{status}', '"archived"'::jsonb, true
        ),
        '{updatedAt}', to_jsonb(now()::text), true
      )
    where id = ${tripId} and owner_id = ${ownerId} and deleted_at is null
    returning document
  `) as TripDocumentRow[];
  return rows[0] && isEasyTTrip(rows[0].document) ? rows[0].document : null;
}

export async function restoreTripForOwner(ownerId: string, tripId: string) {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    update easyt_trips
    set status = case when document ->> 'archivedFromStatus' = 'planned' then 'planned' else 'draft' end, updated_at = now(),
      document = jsonb_set(
        jsonb_set(document - 'archivedFromStatus', '{status}', to_jsonb(case when document ->> 'archivedFromStatus' = 'planned' then 'planned' else 'draft' end), true),
        '{updatedAt}', to_jsonb(now()::text), true
      )
    where id = ${tripId} and owner_id = ${ownerId} and deleted_at is null
    returning document
  `) as TripDocumentRow[];
  return rows[0] && isEasyTTrip(rows[0].document) ? rows[0].document : null;
}

export async function duplicateTripForOwner(
  ownerId: string,
  tripId: string,
): Promise<EasyTTrip | null> {
  const source = await getTripForOwner(ownerId, tripId);
  if (!source) return null;

  return copyTripForOwner(ownerId, source, `${source.title} copy`);
}

async function copyTripForOwner(
  ownerId: string,
  source: EasyTTrip,
  title: string,
): Promise<EasyTTrip> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const duplicate = duplicateTripDocument(source, { id, now, nextId: randomUUID, title });

  const result = await promoteTripForOwner(ownerId, duplicate);
  if (result.outcome === "conflict") {
    throw new Error("Unable to create a unique trip copy.");
  }
  return result.trip;
}

export async function createTripGift(
  sender: { id: string; email: string; name?: string | null },
  tripId: string,
  recipientEmail: string,
  note?: string | null,
) {
  const source = await getTripForOwner(sender.id, tripId);
  if (!source) return null;

  const sql = getEasyTDatabase();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 14);
  const gift = {
    id: randomUUID(),
    token,
    tripTitle: source.title,
    recipientEmail: recipientEmail.trim().toLowerCase(),
    note: note?.trim().slice(0, 500) || null,
    expiresAt: expiresAt.toISOString(),
  };

  await sql`
    insert into easyt_trip_gifts (
      id, trip_id, sender_id, recipient_email, note, token_hash, status, expires_at
    ) values (
      ${gift.id}, ${tripId}, ${sender.id}, ${gift.recipientEmail}, ${gift.note},
      ${tokenHash(token)}, 'pending', ${gift.expiresAt}
    )
  `;
  return gift;
}

async function getGiftRow(token: string): Promise<GiftRow | null> {
  const sql = getEasyTDatabase();
  const rows = (await sql`
    select
      gifts.id,
      gifts.trip_id,
      gifts.sender_id,
      gifts.recipient_email,
      gifts.note,
      gifts.token_hash,
      gifts.status,
      gifts.claimed_by,
      gifts.claimed_trip_id,
      gifts.expires_at,
      users.name as sender_name,
      users.email as sender_email,
      trips.title as trip_title,
      trips.document
    from easyt_trip_gifts gifts
    join easyt_users users on users.id = gifts.sender_id
    join easyt_trips trips on trips.id = gifts.trip_id
    where gifts.token_hash = ${tokenHash(token)}
      and trips.deleted_at is null
    limit 1
  `) as GiftRow[];
  return rows[0] ?? null;
}

export async function getTripGiftPreview(
  token: string,
): Promise<EasyTGiftPreview | null> {
  const gift = await getGiftRow(token);
  if (!gift) return null;
  const expired = new Date(gift.expires_at).getTime() < Date.now();
  return {
    tripTitle: gift.trip_title,
    senderName: gift.sender_name || gift.sender_email.split("@")[0],
    recipientEmail: gift.recipient_email,
    note: gift.note,
    status: expired && gift.status === "pending" ? "expired" : gift.status,
    expiresAt: gift.expires_at,
  };
}

export async function claimTripGift(
  token: string,
  recipient: { id: string; email: string; name?: string | null },
): Promise<{ trip: EasyTTrip; alreadyClaimed: boolean } | null> {
  const gift = await getGiftRow(token);
  if (!gift) return null;
  if (gift.recipient_email.toLowerCase() !== recipient.email.toLowerCase()) {
    throw new Error("This invitation was sent to a different email address.");
  }
  if (gift.status === "claimed" && gift.claimed_by === recipient.id && gift.claimed_trip_id) {
    const existing = await getTripForOwner(recipient.id, gift.claimed_trip_id);
    if (existing) return { trip: existing, alreadyClaimed: true };
  }
  if (gift.status !== "pending") throw new Error("This invitation is no longer available.");
  if (new Date(gift.expires_at).getTime() < Date.now()) {
    const sql = getEasyTDatabase();
    await sql`update easyt_trip_gifts set status = 'expired' where id = ${gift.id}`;
    throw new Error("This invitation has expired.");
  }
  if (!isEasyTTrip(gift.document)) throw new Error("The shared trip could not be read.");

  await ensureEasyTUser(recipient.id, recipient.email, recipient.name);
  const trip = await copyTripForOwner(recipient.id, gift.document, gift.trip_title);
  const sql = getEasyTDatabase();
  const updated = (await sql`
    update easyt_trip_gifts
    set status = 'claimed', claimed_by = ${recipient.id}, claimed_trip_id = ${trip.id}, claimed_at = now()
    where id = ${gift.id} and status = 'pending'
    returning id
  `) as Array<{ id: string }>;
  if (!updated[0]) {
    await deleteTripForOwner(recipient.id, trip.id);
    throw new Error("This invitation has already been claimed.");
  }
  return { trip, alreadyClaimed: false };
}

export async function deleteTripForOwner(ownerId: string, tripId: string) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_trips
    set deleted_at = now(), updated_at = now()
    where id = ${tripId} and owner_id = ${ownerId} and deleted_at is null
  `;
}

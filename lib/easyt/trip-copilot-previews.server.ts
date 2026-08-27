import "server-only";

import { randomUUID } from "node:crypto";

import { getEasyTDatabase } from "./database";
import type { ResolvedTripCopilotAction, TripCopilotPreviewCandidate } from "./trip-copilot-actions.ts";
import type { TripCopilotPreviewRecord } from "./trip-copilot-apply.ts";
import { tripCopilotMutationHash, tripCopilotStateHash } from "./trip-copilot-state.ts";
import { isEasyTTrip, type EasyTTrip } from "./trip.ts";

type PreviewRow = {
  id: string;
  ownerId: string;
  tripId: string;
  actionType: ResolvedTripCopilotAction["action"];
  action: unknown;
  baseUpdatedAt: string;
  baseHash: string;
  expectedHash: string;
  status: TripCopilotPreviewRecord["status"];
  expiresAt: string;
  resultDocument: unknown;
};

function recordFromRow(row: PreviewRow): TripCopilotPreviewRecord {
  return {
    previewId: row.id,
    ownerId: row.ownerId,
    tripId: row.tripId,
    actionType: row.actionType,
    action: row.action as ResolvedTripCopilotAction,
    baseUpdatedAt: row.baseUpdatedAt,
    baseHash: row.baseHash,
    expectedHash: row.expectedHash,
    status: row.status,
    expiresAt: row.expiresAt,
    resultTrip: isEasyTTrip(row.resultDocument) ? row.resultDocument : null,
  };
}

export async function createTripCopilotPreviewRecord(input: {
  ownerId: string;
  trip: EasyTTrip;
  candidate: TripCopilotPreviewCandidate;
  expiresAt: string;
}) {
  const sql = getEasyTDatabase();
  const previewId = randomUUID();
  await sql`
    insert into easyt_copilot_previews (
      id, owner_id, trip_id, action_type, action, base_updated_at,
      base_hash, expected_hash, expires_at
    ) values (
      ${previewId}, ${input.ownerId}, ${input.trip.id}, ${input.candidate.resolvedAction.action},
      ${JSON.stringify(input.candidate.resolvedAction)}, ${input.trip.updatedAt},
      ${tripCopilotStateHash(input.trip)}, ${tripCopilotMutationHash(input.candidate.resultingTrip)}, ${input.expiresAt}
    )
  `;
  return previewId;
}

export async function getTripCopilotPreviewRecord(ownerId: string, tripId: string, previewId: string) {
  const sql = getEasyTDatabase();
  const rows = await sql`
    select id, owner_id as "ownerId", trip_id as "tripId", action_type as "actionType",
      action, base_updated_at as "baseUpdatedAt", base_hash as "baseHash",
      expected_hash as "expectedHash", status, expires_at as "expiresAt",
      result_document as "resultDocument"
    from easyt_copilot_previews
    where id = ${previewId}::uuid and owner_id = ${ownerId} and trip_id = ${tripId}
    limit 1
  ` as PreviewRow[];
  return rows[0] ? recordFromRow(rows[0]) : null;
}

export async function claimTripCopilotPreview(ownerId: string, tripId: string, previewId: string) {
  const sql = getEasyTDatabase();
  const rows = await sql`
    update easyt_copilot_previews set status = 'applying'
    where id = ${previewId}::uuid and owner_id = ${ownerId} and trip_id = ${tripId}
      and status = 'pending' and expires_at > now()
    returning status
  ` as Array<{ status: string }>;
  if (rows[0]) return "claimed" as const;
  const current = await getTripCopilotPreviewRecord(ownerId, tripId, previewId);
  return current?.status === "pending" ? "stale" as const : current?.status ?? "missing";
}

export async function completeTripCopilotPreview(ownerId: string, tripId: string, previewId: string, trip: EasyTTrip) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_copilot_previews
    set status = 'applied', result_document = ${JSON.stringify(trip)}, applied_at = now()
    where id = ${previewId}::uuid and owner_id = ${ownerId} and trip_id = ${tripId}
      and status in ('applying', 'applied')
  `;
}

export async function markTripCopilotPreviewStale(ownerId: string, tripId: string, previewId: string) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_copilot_previews set status = 'stale'
    where id = ${previewId}::uuid and owner_id = ${ownerId} and trip_id = ${tripId}
      and status <> 'applied'
  `;
}

export async function releaseTripCopilotPreview(ownerId: string, tripId: string, previewId: string) {
  const sql = getEasyTDatabase();
  await sql`
    update easyt_copilot_previews set status = 'pending'
    where id = ${previewId}::uuid and owner_id = ${ownerId} and trip_id = ${tripId}
      and status = 'applying' and expires_at > now()
  `;
}

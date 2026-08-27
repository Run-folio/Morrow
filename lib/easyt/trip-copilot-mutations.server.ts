import "server-only";

import {
  buildTripCopilotPreviewCandidates,
  TRIP_COPILOT_PREVIEW_TTL_MS,
  type StoredTripCopilotPreview,
  type TripCopilotAction,
  type TripCopilotMutationPreview,
  type TripCopilotPreviewCandidate,
} from "./trip-copilot-actions.ts";
import { createTripCopilotPreviewRecord } from "./trip-copilot-previews.server.ts";
import type { EasyTTrip } from "./trip.ts";

function publicPreview(candidate: TripCopilotPreviewCandidate, previewId: string, expiresAt: string): StoredTripCopilotPreview {
  return {
    previewId,
    canApply: true,
    expiresAt,
    action: candidate.action,
    summary: candidate.summary,
    changes: candidate.changes,
    impacts: candidate.impacts,
    warnings: candidate.warnings,
  };
}

export async function prepareTripCopilotMutationPreview(input: {
  ownerId: string;
  trip: EasyTTrip;
  action: TripCopilotAction;
  now?: Date;
}): Promise<TripCopilotMutationPreview> {
  const candidates = buildTripCopilotPreviewCandidates(input.trip, input.action);
  const expiresAt = new Date((input.now ?? new Date()).getTime() + TRIP_COPILOT_PREVIEW_TTL_MS).toISOString();
  const previews = await Promise.all(candidates.map(async (candidate) => publicPreview(
    candidate,
    await createTripCopilotPreviewRecord({ ownerId: input.ownerId, trip: input.trip, candidate, expiresAt }),
    expiresAt,
  )));
  if (previews.length === 1) {
    return {
      action: input.action,
      summary: previews[0].summary,
      canApply: true,
      preview: previews[0],
      alternatives: [],
      warnings: previews[0].warnings,
    };
  }
  return {
    action: input.action,
    summary: "Choose how Morrovia should make this change",
    canApply: false,
    preview: null,
    alternatives: previews,
    warnings: ["The requested stay change has more than one valid downstream outcome. Nothing will change until you choose one and confirm it."],
  };
}

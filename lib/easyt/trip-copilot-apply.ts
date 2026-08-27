import { applyResolvedTripCopilotAction, assertValidResolvedTripCopilotAction, TripCopilotActionValidationError, type ResolvedTripCopilotAction } from "./trip-copilot-actions.ts";
import { tripCopilotMutationHash, tripCopilotStateHash } from "./trip-copilot-state.ts";
import type { EasyTTrip } from "./trip.ts";

export type TripCopilotPreviewStatus = "pending" | "applying" | "applied" | "stale";

export type TripCopilotPreviewRecord = {
  previewId: string;
  ownerId: string;
  tripId: string;
  actionType: ResolvedTripCopilotAction["action"];
  action: ResolvedTripCopilotAction;
  baseUpdatedAt: string;
  baseHash: string;
  expectedHash: string;
  status: TripCopilotPreviewStatus;
  expiresAt: string;
  resultTrip: EasyTTrip | null;
};

export type TripCopilotApplyDependencies = {
  getPreview(ownerId: string, tripId: string, previewId: string): Promise<TripCopilotPreviewRecord | null>;
  claimPreview(ownerId: string, tripId: string, previewId: string): Promise<"claimed" | "applying" | "applied" | "stale" | "missing">;
  getTrip(ownerId: string, tripId: string): Promise<EasyTTrip | null>;
  saveTrip(ownerId: string, trip: EasyTTrip): Promise<EasyTTrip>;
  completePreview(ownerId: string, tripId: string, previewId: string, trip: EasyTTrip): Promise<void>;
  markPreviewStale(ownerId: string, tripId: string, previewId: string): Promise<void>;
  releasePreview(ownerId: string, tripId: string, previewId: string): Promise<void>;
};

export class TripCopilotApplyError extends Error {
  readonly code: "not-found" | "expired" | "stale" | "in-progress" | "invalid" | "save-failed";

  constructor(
    message: string,
    code: "not-found" | "expired" | "stale" | "in-progress" | "invalid" | "save-failed",
  ) {
    super(message);
    this.name = "TripCopilotApplyError";
    this.code = code;
  }
}

export async function applyTripCopilotPreview(
  input: { ownerId: string; tripId: string; previewId: string; expectedAction: ResolvedTripCopilotAction["action"]; now?: Date },
  dependencies: TripCopilotApplyDependencies,
): Promise<{ trip: EasyTTrip; idempotent: boolean }> {
  const now = input.now ?? new Date();
  const preview = await dependencies.getPreview(input.ownerId, input.tripId, input.previewId);
  if (!preview || preview.actionType !== input.expectedAction) {
    throw new TripCopilotApplyError("That change preview is no longer available.", "not-found");
  }
  if (!preview.action || preview.action.action !== preview.actionType) {
    throw new TripCopilotApplyError("The saved preview action is invalid.", "invalid");
  }
  if (preview.status === "applied" && preview.resultTrip) return { trip: preview.resultTrip, idempotent: true };
  if (preview.status === "stale") throw new TripCopilotApplyError("The trip changed after this preview. Ask Morrovia to prepare it again.", "stale");
  if (Date.parse(preview.expiresAt) <= now.getTime()) {
    await dependencies.markPreviewStale(input.ownerId, input.tripId, input.previewId);
    throw new TripCopilotApplyError("That change preview expired. Ask Morrovia to prepare it again.", "expired");
  }

  const current = await dependencies.getTrip(input.ownerId, input.tripId);
  if (!current) throw new TripCopilotApplyError("Trip not found.", "not-found");

  // Recover a request that saved successfully but stopped before recording its result.
  if (preview.status === "applying" && tripCopilotMutationHash(current) === preview.expectedHash) {
    await dependencies.completePreview(input.ownerId, input.tripId, input.previewId, current);
    return { trip: current, idempotent: true };
  }

  if (current.updatedAt !== preview.baseUpdatedAt || tripCopilotStateHash(current) !== preview.baseHash) {
    await dependencies.markPreviewStale(input.ownerId, input.tripId, input.previewId);
    throw new TripCopilotApplyError("The trip changed after this preview. Ask Morrovia to prepare it again.", "stale");
  }

  const claim = await dependencies.claimPreview(input.ownerId, input.tripId, input.previewId);
  if (claim === "applied") {
    const applied = await dependencies.getPreview(input.ownerId, input.tripId, input.previewId);
    if (applied?.resultTrip) return { trip: applied.resultTrip, idempotent: true };
  }
  if (claim === "applying") throw new TripCopilotApplyError("This change is already being applied. Wait a moment and retry.", "in-progress");
  if (claim === "stale") throw new TripCopilotApplyError("The trip changed after this preview. Ask Morrovia to prepare it again.", "stale");
  if (claim !== "claimed") throw new TripCopilotApplyError("That change preview is no longer available.", "not-found");

  try {
    try { assertValidResolvedTripCopilotAction(preview.action, current); }
    catch (error) {
      if (error instanceof TripCopilotActionValidationError) {
        await dependencies.markPreviewStale(input.ownerId, input.tripId, input.previewId);
        throw new TripCopilotApplyError("The saved preview action is no longer valid.", "invalid");
      }
      throw error;
    }
    const candidate = applyResolvedTripCopilotAction(current, preview.action);
    if (tripCopilotMutationHash(candidate) !== preview.expectedHash) {
      await dependencies.markPreviewStale(input.ownerId, input.tripId, input.previewId);
      throw new TripCopilotApplyError("The deterministic preview could not be reproduced.", "invalid");
    }
    const saved = await dependencies.saveTrip(input.ownerId, candidate);
    await dependencies.completePreview(input.ownerId, input.tripId, input.previewId, saved);
    return { trip: saved, idempotent: false };
  } catch (error) {
    if (!(error instanceof TripCopilotApplyError)) await dependencies.releasePreview(input.ownerId, input.tripId, input.previewId);
    throw error;
  }
}

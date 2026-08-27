import "server-only";

import { applyTripCopilotPreview } from "./trip-copilot-apply.ts";
import {
  claimTripCopilotPreview,
  completeTripCopilotPreview,
  getTripCopilotPreviewRecord,
  markTripCopilotPreviewStale,
  releaseTripCopilotPreview,
} from "./trip-copilot-previews.server.ts";
import { getTripForOwner, saveTripForOwner } from "./repository.ts";

export function applyConfirmedTripCopilotPreview(input: {
  ownerId: string;
  tripId: string;
  previewId: string;
  expectedAction: "change_stop_nights" | "set_trip_preference" | "change_transport_preference";
}) {
  return applyTripCopilotPreview(input, {
    getPreview: getTripCopilotPreviewRecord,
    claimPreview: claimTripCopilotPreview,
    getTrip: getTripForOwner,
    saveTrip: saveTripForOwner,
    completePreview: completeTripCopilotPreview,
    markPreviewStale: markTripCopilotPreviewStale,
    releasePreview: releaseTripCopilotPreview,
  });
}

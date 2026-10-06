import type { EasyTTrip } from "../../lib/easyt/trip.ts";
import { tripCopilotFixture } from "./trip-copilot-trip.ts";

export function legacyRouteFixture(): EasyTTrip {
  const trip = tripCopilotFixture();
  trip.id = "batch14-trip";
  trip.ownerId = "owner-a";
  trip.brief.originCanonicalPlaceId = "place:london";
  trip.brief.manualNightStopIds = ["kyoto"];
  return trip;
}

export function canonicalRouteFixture(): EasyTTrip {
  const trip = legacyRouteFixture();
  const { journeyEnd: _legacyEnd, ...intent } = trip.brief.intent!;
  return {
    ...trip,
    schemaVersion: 2,
    brief: {
      ...trip.brief,
      journeyEnd: { mode: "unknown" },
      intent: {
        ...intent,
        version: 2,
        route: {
          version: 1,
          origin: { name: "London", canonicalPlaceId: "place:london" },
          tripType: "one_way",
          journeyEnd: { mode: "unknown" },
          orderAuthority: "manual",
          explicitIntentIds: null,
          orderedStopIds: trip.stops.map(stop => stop.id),
          projectionInputKey: null,
          destinations: trip.stops.map(stop => ({
            id: `intent:${stop.id}`,
            sourceText: stop.name,
            kind: "overnight_place",
            selectedPlace: { name: stop.name, canonicalPlaceId: stop.canonicalPlaceId, country: stop.country },
            resolution: "resolved",
            requestedNights: stop.nights,
            routeMembership: "required",
            stopIds: [stop.id],
          })),
        },
      },
    },
  } as unknown as EasyTTrip;
}

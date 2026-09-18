import { originPlaceFromBrief } from "./journey-endpoints.ts";
import { validateBuilderStopOrder, type BuilderStopOrderRejection } from "./trip-builder-order.ts";
import { buildCanonicalTripLegs } from "./trip-legs.ts";
import type { EasyTTrip } from "./trip.ts";

export type BuilderRoutePreview =
  | { ok: true; trip: EasyTTrip }
  | { ok: false; reason: BuilderStopOrderRejection };

/**
 * Builds a presentation-only route document. The canonical document and its
 * timestamps remain untouched; only stop order and the dependent leg
 * projection are replaced in the returned value.
 */
export function buildBuilderRoutePreview(
  canonical: EasyTTrip,
  orderedStopIds: readonly string[],
): BuilderRoutePreview {
  const order = validateBuilderStopOrder(canonical.stops, orderedStopIds);
  if (!order.ok) return order;

  const stops = order.stops.map((stop, index) => ({ ...stop, order: index }));
  const origin = originPlaceFromBrief(canonical.brief);
  const legs = buildCanonicalTripLegs({
    tripId: canonical.id,
    origin: {
      name: origin.name,
      country: origin.country,
      canonicalPlaceId: origin.canonicalPlaceId,
      providerId: origin.providerId,
      coordinates: origin.coordinates ?? null,
    },
    journeyEnd: canonical.brief.journeyEnd,
    stops,
  });

  return {
    ok: true,
    trip: {
      ...canonical,
      stops,
      legs,
    },
  };
}

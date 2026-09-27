import { mediaImagesForExactDestination } from "./itinerary-media.ts";
import { routeImageCredit } from "./route-images.ts";
import { overviewStopImage, type OverviewPlaceImage } from "./trip-overview-imagery.ts";
import type { EasyTTrip, PlanItem, TripStop } from "./trip.ts";

type PresentationImages = {
  stopById: Readonly<Record<string, OverviewPlaceImage | null>>;
  dayById: Readonly<Record<string, OverviewPlaceImage | null>>;
};

function assignedImage(day: PlanItem): OverviewPlaceImage | null {
  if (!day.image) return null;
  const reviewed = routeImageCredit(day.image);
  if (reviewed) return reviewed;
  if (!day.sourceUrl || !/^https?:\/\//.test(day.sourceUrl)) return null;
  return { src: day.image, alt: day.title, sourceUrl: day.sourceUrl, sourceLabel: "Photo source" };
}

function destinationCandidates(trip: EasyTTrip, stop: TripStop, days: PlanItem[]): OverviewPlaceImage[] {
  const exact = mediaImagesForExactDestination(stop.name)
    .filter((image) => Boolean(image.sourceUrl))
    .map((image) => ({ src: image.src, alt: image.alt, sourceUrl: image.sourceUrl, sourceLabel: image.sourceLabel ?? "Photo source" }));
  const assigned = days.flatMap((day) => {
    const image = assignedImage(day);
    return image ? [image] : [];
  });
  const overview = overviewStopImage(trip, stop);
  const validOverview = overview && (assigned.some((image) => image.src === overview.src)
    || exact.some((image) => image.src === overview.src)
    || Boolean(routeImageCredit(overview.src))) && overview.sourceUrl ? overview : null;
  return [validOverview, ...assigned, ...exact]
    .filter((image): image is OverviewPlaceImage => Boolean(image))
    .filter((image, index, images) => images.findIndex((candidate) => candidate.src === image.src) === index);
}

function firstUnused(images: OverviewPlaceImage[], used: Set<string>): OverviewPlaceImage | null {
  return images.find((image) => !used.has(image.src)) ?? images[0] ?? null;
}

/** Pure, occurrence-keyed presentation choices; no image choice is written to the trip. */
export function itineraryPresentationImages(trip: EasyTTrip): PresentationImages {
  const stopById: Record<string, OverviewPlaceImage | null> = {};
  const dayById: Record<string, OverviewPlaceImage | null> = {};
  const orderedStops = [...trip.stops].sort((a, b) => a.order - b.order);
  const orderedDays = [...trip.planItems].sort((a, b) => a.dayNumber - b.dayNumber);
  const candidatesByStop = new Map<string, OverviewPlaceImage[]>();
  const usedStops = new Set<string>();

  for (const stop of orderedStops) {
    const days = orderedDays.filter((day) => day.stopId === stop.id);
    const candidates = destinationCandidates(trip, stop, days);
    candidatesByStop.set(stop.id, candidates);
    const explicit = days.map(assignedImage).find((image): image is OverviewPlaceImage => Boolean(image));
    const choice = explicit ?? firstUnused(candidates, usedStops);
    stopById[stop.id] = choice;
    if (choice) usedStops.add(choice.src);
  }

  const usedDays = new Set<string>();
  for (const day of orderedDays) {
    const explicit = assignedImage(day);
    const candidates = candidatesByStop.get(day.stopId) ?? [];
    const preferred = stopById[day.stopId];
    const choice = explicit ?? firstUnused(preferred ? [preferred, ...candidates.filter((image) => image.src !== preferred.src)] : candidates, usedDays);
    dayById[day.id] = choice;
    if (choice) usedDays.add(choice.src);
  }
  return { stopById, dayById };
}

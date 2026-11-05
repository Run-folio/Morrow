import { mediaImagesForExactDestination } from "./itinerary-media.ts";
import { itineraryDestinationPhotos, routeImageCredit, routePhotoForSource } from "./route-images.ts";
import { overviewPlaceImage, overviewStopImage, type OverviewPlaceImage } from "./trip-overview-imagery.ts";
import { legacyItineraryIdeas, type EasyTTrip, type PlanItem, type TripStop } from "./trip.ts";

type PresentationImages = {
  stopById: Readonly<Record<string, OverviewPlaceImage | null>>;
  dayById: Readonly<Record<string, OverviewPlaceImage | null>>;
};

function assignedImage(day: PlanItem, reviewedOnly = false, stop?: TripStop): OverviewPlaceImage | null {
  if (!day.image) return null;
  const reviewed = routeImageCredit(day.image);
  if (reviewed) {
    const photo = routePhotoForSource(day.image);
    return !stop || (photo?.place.toLowerCase() === stop.name.trim().toLowerCase() && photo.country.toLowerCase() === stop.country.trim().toLowerCase()) ? reviewed : null;
  }
  if (reviewedOnly) return null;
  if (!day.sourceUrl || !/^https?:\/\//.test(day.sourceUrl)) return null;
  return { src: day.image, alt: day.title, sourceUrl: day.sourceUrl, sourceLabel: "Photo source" };
}

function destinationCandidates(trip: EasyTTrip, stop: TripStop, days: PlanItem[], reviewedOnly = false): OverviewPlaceImage[] {
  const exact = mediaImagesForExactDestination(stop.name)
    .filter((image) => Boolean(image.sourceUrl))
    .flatMap((image) => {
      const reviewed = routeImageCredit(image.src);
      return reviewedOnly ? reviewed ? [reviewed] : [] : [{ src: image.src, alt: image.alt, sourceUrl: image.sourceUrl, sourceLabel: image.sourceLabel ?? "Photo source" }];
    });
  const assigned = days.flatMap((day) => {
    const image = assignedImage(day, reviewedOnly, stop);
    return image ? [image] : [];
  });
  const overview = reviewedOnly ? overviewPlaceImage(stop) : overviewStopImage(trip, stop);
  const validOverview = overview && (assigned.some((image) => image.src === overview.src)
    || exact.some((image) => image.src === overview.src)
    || Boolean(routeImageCredit(overview.src))) && overview.sourceUrl ? overview : null;
  const alternatives = itineraryDestinationPhotos(stop.name, stop.country).flatMap(photo => {
    const credit = routeImageCredit(photo.variants[0]?.src ?? "");
    return credit ? [credit] : [];
  });
  return [validOverview, ...assigned, ...exact, ...alternatives]
    .filter((image): image is OverviewPlaceImage => Boolean(image))
    .filter((image, index, images) => images.findIndex((candidate) => (routePhotoForSource(candidate.src)?.sourceUrl ?? candidate.sourceUrl ?? candidate.src) === (routePhotoForSource(image.src)?.sourceUrl ?? image.sourceUrl ?? image.src)) === index);
}

function firstUnused(images: OverviewPlaceImage[], used: Set<string>): OverviewPlaceImage | null {
  return images.find((image) => !used.has(image.src)) ?? images[0] ?? null;
}

/** Pure, occurrence-keyed presentation choices; no image choice is written to the trip. */
export function itineraryPresentationImages(trip: EasyTTrip, { reviewedOnly = false }: { reviewedOnly?: boolean } = {}): PresentationImages {
  const stopById: Record<string, OverviewPlaceImage | null> = {};
  const dayById: Record<string, OverviewPlaceImage | null> = {};
  const orderedStops = [...trip.stops].sort((a, b) => a.order - b.order);
  const orderedDays = [...trip.planItems].sort((a, b) => a.dayNumber - b.dayNumber);
  const candidatesByStop = new Map<string, OverviewPlaceImage[]>();
  const usedStops = new Set<string>();

  for (const stop of orderedStops) {
    const days = orderedDays.filter((day) => day.stopId === stop.id);
    const candidates = destinationCandidates(trip, stop, days, reviewedOnly);
    candidatesByStop.set(stop.id, candidates);
    const explicit = days.map(day => assignedImage(day, reviewedOnly, stop)).find((image): image is OverviewPlaceImage => Boolean(image));
    const choice = explicit ?? firstUnused(candidates, usedStops);
    stopById[stop.id] = choice;
    if (choice) usedStops.add(choice.src);
  }

  const uses = new Map<string, number>();
  const identity = (image: OverviewPlaceImage) => routePhotoForSource(image.src)?.sourceUrl ?? image.sourceUrl ?? image.src;
  const leastUsed = (images: OverviewPlaceImage[]) => [...images].sort((a,b) => (uses.get(identity(a)) ?? 0) - (uses.get(identity(b)) ?? 0))[0] ?? null;
  for (const day of orderedDays) {
    const stop = trip.stops.find(stop => stop.id === day.stopId);
    // Saved provider URLs alone do not establish permission to reuse a photo.
    const activityImages = legacyItineraryIdeas(trip.brief.itineraryIdeas).filter(idea => idea.dayId === day.id && idea.stopId === day.stopId && idea.category === "activity")
      .flatMap(idea => {
        if (!idea.image || !stop) return [];
        const photo = routePhotoForSource(idea.image);
        const credit = routeImageCredit(idea.image);
        return credit && photo?.place.toLowerCase() === stop.name.trim().toLowerCase() && photo.country.toLowerCase() === stop.country.trim().toLowerCase() ? [credit] : [];
      });
    const explicit = stop ? assignedImage(day, reviewedOnly, stop) : null;
    const candidates = candidatesByStop.get(day.stopId) ?? [];
    const unusedExplicit = explicit && !uses.has(identity(explicit)) ? explicit : null;
    const choice = leastUsed(activityImages) ?? unusedExplicit ?? leastUsed(candidates);
    dayById[day.id] = choice;
    if (choice) uses.set(identity(choice), (uses.get(identity(choice)) ?? 0) + 1);
  }
  return { stopById, dayById };
}


/** Calendar and selected-day presentation share choices, including deliberate relevant reuse. */
export function itineraryCalendarImages(trip: Pick<EasyTTrip, "planItems">, dayImages: PresentationImages["dayById"]): Record<string, OverviewPlaceImage | null> {
  return Object.fromEntries(trip.planItems.map(day => [day.id, dayImages[day.id] ?? null]));
}

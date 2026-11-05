import { canonicalImageSource, viatorImageIdentity } from "./image-source-identity.ts";
import { itineraryImageIdentity } from "./itinerary-image-policy.ts";
import { mediaImagesForExactDestination } from "./itinerary-media.ts";
import { itineraryActivityPhotos, itineraryDestinationPhotos, routeImageCredit, routePhotoForSource } from "./route-images.ts";
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
  if (reviewedOnly || viatorImageIdentity(canonicalImageSource(day.image))) return null;
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
export function itineraryPresentationImages(trip: EasyTTrip, { reviewedOnly = true }: { reviewedOnly?: boolean } = {}): PresentationImages {
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

  const used = new Set<string>();
  // Reserve actual planned activities before earlier generic days can consume their photographs.
  for (const day of orderedDays) {
    const stop = trip.stops.find(stop => stop.id === day.stopId);
    const scheduled = legacyItineraryIdeas(trip.brief.itineraryIdeas).filter(idea => idea.dayId === day.id && idea.stopId === day.stopId && idea.category === "activity");
    const activityImages = scheduled.flatMap(idea => {
      // API provenance is not account-specific permission for a new day-cover use.
      // Supplier photos remain withheld; verified place photographs can still describe the activity.
      const record = idea.image ? routePhotoForSource(idea.image) : null;
      const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const exactSubject = record?.activitySubjects?.some(subject => normalize(subject) === normalize(idea.title));
      const reviewed = idea.image && exactSubject ? routeImageCredit(idea.image) : null;
      const subjects = stop ? itineraryActivityPhotos(idea.title, stop.name, stop.country).flatMap(photo => {
        const credit = routeImageCredit(photo.variants[0]?.src ?? "");
        return credit ? [{...credit, activityTitle:idea.title, activityImageKind:"editorial-place" as const}] : [];
      }) : [];
      const direct: OverviewPlaceImage[] = reviewed ? [{...reviewed, activityTitle:idea.title, activityImageKind:"saved-place"}] : [];
      return [...direct, ...subjects];
    });
    const notedPlaces = stop ? day.notes.flatMap(title => itineraryActivityPhotos(title, stop.name, stop.country).flatMap(photo => {
      const credit = routeImageCredit(photo.variants[0]?.src ?? "");
      return credit ? [{...credit,activityTitle:title,activityImageKind:"editorial-place" as const}] : [];
    })) : [];
    const choice = [...activityImages, ...notedPlaces].find(image => !used.has(itineraryImageIdentity(image))) ?? null;
    dayById[day.id] = choice;
    if (choice) used.add(itineraryImageIdentity(choice));
  }
  for (const day of orderedDays) {
    if (dayById[day.id]) continue;
    const stop = trip.stops.find(stop => stop.id === day.stopId);
    const explicit = stop ? assignedImage(day, reviewedOnly, stop) : null;
    const candidates = candidatesByStop.get(day.stopId) ?? [];
    const choice = [explicit, ...candidates].find((image): image is OverviewPlaceImage => Boolean(image) && !used.has(itineraryImageIdentity(image!))) ?? null;
    const hasActivity = day.notes.length > 0 || legacyItineraryIdeas(trip.brief.itineraryIdeas).some(idea => idea.dayId === day.id && idea.stopId === day.stopId && idea.category === "activity");
    dayById[day.id] = choice && hasActivity ? {...choice, activityImageKind: "destination-atmosphere"} : choice;
    if (choice) used.add(itineraryImageIdentity(choice));
  }
  return { stopById, dayById };
}


/** Calendar and selected-day presentation share choices, without introducing a second selection policy. */
export function itineraryCalendarImages(trip: Pick<EasyTTrip, "planItems">, dayImages: PresentationImages["dayById"]): Record<string, OverviewPlaceImage | null> {
  return Object.fromEntries(trip.planItems.map(day => [day.id, dayImages[day.id] ?? null]));
}

import type { EasyTTrip } from "./trip";

export type MappedItineraryPlace = {
  id: string;
  provider?: "booking-demand" | "google-places" | "openstreetmap";
  name: string;
  coordinates: [number, number];
};

export type MappedItineraryPlaceCategory = "restaurant" | "stay" | "activity";

export function mappedPlacePinId(dayNumber: number, category: MappedItineraryPlaceCategory, place: MappedItineraryPlace) {
  const stableProviderId = place.id.replace(/[^a-z0-9_-]+/gi, "-") || "place";
  return `venue-${dayNumber}-${category}-${place.provider ?? "mapped"}-${stableProviderId}`;
}

export function addMappedPlaceToTrip(
  trip: EasyTTrip,
  place: MappedItineraryPlace,
  category: MappedItineraryPlaceCategory,
  dayNumber: number,
  stopId: string,
) {
  const id = mappedPlacePinId(dayNumber, category, place);
  const stop = trip.stops.find((item) => item.id === stopId);
  const stayBookingId = stop ? `stay-${stop.id}` : undefined;
  const existingActivities = trip.brief.customActivities?.[dayNumber] ?? [];
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const alreadyInActivities = existingActivities.some((activity) => normalize(activity) === normalize(place.name));
  const day = trip.planItems.find((item) => item.dayNumber === dayNumber);
  const alreadyInNotes = Boolean(day?.notes.some((note) => normalize(note) === normalize(place.name)));
  const alreadyPinned = Boolean((trip.brief.mapPins ?? []).some((pin) => pin.id === id));
  const alreadyBooked = category !== "stay" || !stop || Boolean((trip.brief.bookings ?? []).some((booking) => booking.id === stayBookingId));
  if (alreadyInActivities && alreadyInNotes && alreadyPinned && alreadyBooked) return trip;
  return {
    ...trip,
    brief: {
      ...trip.brief,
      customActivities: {
        ...(trip.brief.customActivities ?? {}),
        [dayNumber]: alreadyInActivities ? existingActivities : [...existingActivities, place.name],
      },
      mapPins: alreadyPinned
        ? (trip.brief.mapPins ?? [])
        : [...(trip.brief.mapPins ?? []), { id, title: place.name, category, dayNumber, longitude: place.coordinates[0], latitude: place.coordinates[1] }],
      bookings: category === "stay" && stop && stayBookingId ? [
        ...(trip.brief.bookings ?? []).filter((booking) => booking.id !== stayBookingId),
        { id: stayBookingId, type: "stay" as const, title: place.name, date: stop.arrivalDate, confirmation: null, url: null },
      ] : trip.brief.bookings,
    },
    planItems: trip.planItems.map((item) => item.dayNumber === dayNumber
      ? item.notes.some((note) => normalize(note) === normalize(place.name))
        ? item
        : {
          ...item,
          notes: [...item.notes, place.name],
          ...(item.noteDayParts ? { noteDayParts: [...item.notes.map((_, index) => item.noteDayParts?.[index] ?? null), null] } : {}),
        }
      : item),
  };
}

export function removeMappedPlaceFromTrip(
  trip: EasyTTrip,
  place: MappedItineraryPlace,
  category: MappedItineraryPlaceCategory,
  dayNumber: number,
  stopId: string,
) {
  const id = mappedPlacePinId(dayNumber, category, place);
  const stop = trip.stops.find((item) => item.id === stopId);
  return {
    ...trip,
    brief: {
      ...trip.brief,
      customActivities: {
        ...(trip.brief.customActivities ?? {}),
        [dayNumber]: (trip.brief.customActivities?.[dayNumber] ?? []).filter((item) => item !== place.name),
      },
      mapPins: (trip.brief.mapPins ?? []).filter((pin) => pin.id !== id),
      bookings: category === "stay" && stop
        ? (trip.brief.bookings ?? []).filter((booking) => booking.id !== `stay-${stop.id}`)
        : trip.brief.bookings,
    },
    planItems: trip.planItems.map((item) => item.dayNumber === dayNumber
      ? {
        ...item,
        notes: item.notes.filter((note) => note !== place.name),
        ...(item.noteDayParts ? {
          noteDayParts: item.notes.flatMap((note, index) => note === place.name ? [] : [item.noteDayParts?.[index] ?? null]),
        } : {}),
      }
      : item),
  };
}

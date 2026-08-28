import type { EasyTTrip } from "./trip";

export type MappedItineraryPlace = {
  id: string;
  provider?: "booking-demand" | "google-places" | "openstreetmap";
  name: string;
  coordinates: [number, number];
};

export function mappedPlacePinId(dayNumber: number, category: "restaurant" | "stay", place: MappedItineraryPlace) {
  const stableProviderId = place.id.replace(/[^a-z0-9_-]+/gi, "-") || "place";
  return `venue-${dayNumber}-${category}-${place.provider ?? "mapped"}-${stableProviderId}`;
}

export function addMappedPlaceToTrip(
  trip: EasyTTrip,
  place: MappedItineraryPlace,
  category: "restaurant" | "stay",
  dayNumber: number,
  stopId: string,
) {
  const id = mappedPlacePinId(dayNumber, category, place);
  const stop = trip.stops.find((item) => item.id === stopId);
  const stayBookingId = stop ? `stay-${stop.id}` : undefined;
  const existingActivities = trip.brief.customActivities?.[dayNumber] ?? [];
  return {
    ...trip,
    brief: {
      ...trip.brief,
      customActivities: {
        ...(trip.brief.customActivities ?? {}),
        [dayNumber]: existingActivities.includes(place.name) ? existingActivities : [...existingActivities, place.name],
      },
      mapPins: (trip.brief.mapPins ?? []).some((pin) => pin.id === id)
        ? (trip.brief.mapPins ?? [])
        : [...(trip.brief.mapPins ?? []), { id, title: place.name, category, dayNumber, longitude: place.coordinates[0], latitude: place.coordinates[1] }],
      bookings: category === "stay" && stop && stayBookingId ? [
        ...(trip.brief.bookings ?? []).filter((booking) => booking.id !== stayBookingId),
        { id: stayBookingId, type: "stay" as const, title: place.name, date: stop.arrivalDate, confirmation: null, url: null },
      ] : trip.brief.bookings,
    },
    planItems: trip.planItems.map((item) => item.dayNumber === dayNumber
      ? { ...item, notes: item.notes.includes(place.name) ? item.notes : [...item.notes, place.name] }
      : item),
  };
}

export function removeMappedPlaceFromTrip(
  trip: EasyTTrip,
  place: MappedItineraryPlace,
  category: "restaurant" | "stay",
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
      ? { ...item, notes: item.notes.filter((note) => note !== place.name) }
      : item),
  };
}

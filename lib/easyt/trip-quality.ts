export type TripQualityMention = {
  sourceText: string;
  canonicalName: string;
  role: "origin" | "stop";
  status: "resolved" | "unresolved";
  intent?: "place" | "landmark";
};

export type TripQualityStop = { name: string; country?: string };

export type TripQualityCheck = {
  id: "origin" | "dates" | "requested-places" | "traveller-details";
  state: "complete" | "needs-attention" | "missing";
  title: string;
  detail: string;
  missingPlaces?: string[];
};

const normalise = (value: string) => value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function reviewTripQuality(input: {
  origin?: string;
  originCoordinates?: [number, number];
  startDate?: string;
  endDate?: string;
  stops: TripQualityStop[];
  mentions: TripQualityMention[];
  travellerReady?: boolean;
}): TripQualityCheck[] {
  const requestedStops = input.mentions.filter((mention) => mention.role === "stop");
  const selected = new Set(input.stops.map((stop) => normalise(stop.name)));
  const missingPlaces = requestedStops
    .filter((mention) => !selected.has(normalise(mention.canonicalName)))
    .map((mention) => mention.sourceText)
    .filter((place, index, all) => all.indexOf(place) === index);
  const originResolved = Boolean(input.origin?.trim() && input.originCoordinates);
  const datesReady = Boolean(input.startDate && input.endDate && input.endDate >= input.startDate);
  const placesState = !requestedStops.length || !missingPlaces.length
    ? "complete"
    : input.stops.length ? "needs-attention" : "missing";

  return [{
    id: "origin",
    state: originResolved ? "complete" : input.origin?.trim() ? "needs-attention" : "missing",
    title: "Starting point",
    detail: originResolved ? "Confirmed for this route." : input.origin?.trim() ? "Check this place before relying on route timings." : "Add where you are leaving from.",
  }, {
    id: "dates",
    state: datesReady ? "complete" : "missing",
    title: "Travel dates",
    detail: datesReady ? "Set and ready to shape availability and preparation." : "Add dates before using availability or preparation guidance.",
  }, {
    id: "requested-places",
    state: placesState,
    title: "Places from your brief",
    detail: !requestedStops.length ? "Add the places you want the trip to include." : !missingPlaces.length ? `All ${requestedStops.length} requested place${requestedStops.length === 1 ? " is" : "s are"} in the plan.` : "Review the places below before continuing.",
    ...(missingPlaces.length ? { missingPlaces } : {}),
  }, {
    id: "traveller-details",
    state: input.travellerReady ? "complete" : "needs-attention",
    title: "Traveller details",
    detail: input.travellerReady ? "Readiness guidance can be tailored to you." : "Add nationality and residence for a more useful entry-check starting point.",
  }];
}

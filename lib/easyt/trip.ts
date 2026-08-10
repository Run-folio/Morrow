import { estimateLeg } from "@/lib/easyt/planner";

export const EASYT_TRIP_SCHEMA_VERSION = 1 as const;

export type TripStatus = "draft" | "planned" | "archived";
export type TripPace = "slow" | "full";
export type HotelChanges = "few" | "some";
export type BudgetBand = "value" | "mid" | "high";

export type TripStop = {
  id: string;
  order: number;
  name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  arrivalDate: string | null;
  departureDate: string | null;
  nights: number | null;
};

export type TripLeg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  mode: "flight" | "train" | "road" | "ferry" | "walk" | "unknown";
  distanceKm: number | null;
  durationMinutes: number | null;
  provider: string | null;
  routeMetadata: Record<string, unknown>;
};

export type PlanItem = {
  id: string;
  stopId: string;
  dayNumber: number;
  date: string;
  type: "arrival" | "activity" | "food" | "stay" | "transport" | "open";
  title: string;
  reason: string;
  notes: string[];
  startsAt: string | null;
  endsAt: string | null;
  bookingUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  image?: string | null;
  sourceUrl?: string | null;
};

export type TripRecommendation = {
  id: string;
  rule: string;
  severity: "info" | "warning" | "critical";
  message: string;
  evidence: string;
  affectedDays: number[];
  confidence: "high" | "medium";
  checkedAt: string;
  proposedChange: Record<string, unknown> | null;
  status: "open" | "applied" | "dismissed";
};

export type TripChange = {
  id: string;
  recommendationId: string;
  action: "apply" | "undo";
  summary: string;
  changedAt: string;
};

export type TripBrief = {
  origin: string;
  originCoordinates?: [number, number];
  mustDo: string;
  pace: TripPace;
  hotelChanges: HotelChanges;
  budgetBand: BudgetBand;
  selectedPlaces: Record<string, string[]>;
  dayAllocations?: Record<string, number>;
  /** Traveller-authored notes kept with a single calendar day. */
  dayNotes?: Record<number, string[]>;
  /** Only traveller-authored itinerary rows are editable; generated suggestions remain read-only. */
  customActivities?: Record<number, string[]>;
  /** Pins are intentionally lightweight: they are part of the editable map, not a separate places database. */
  mapPins?: PlannerMapPin[];
  /** Lightweight traveller-entered confirmations, separate from planning suggestions. */
  bookings?: TripBooking[];
  /** A compact pre-departure checklist for the mobile trip view. */
  checklist?: TripChecklistItem[];
};

export type PlannerPinCategory = "restaurant" | "stay" | "activity" | "transport" | "custom";

export type PlannerMapPin = {
  id: string;
  title: string;
  category: PlannerPinCategory;
  dayNumber: number;
  latitude: number;
  longitude: number;
};

export type TripBooking = {
  id: string;
  type: "stay" | "transport" | "reservation" | "other";
  title: string;
  date: string | null;
  confirmation: string | null;
  url: string | null;
};

export type TripChecklistItem = {
  id: string;
  label: string;
  complete: boolean;
};

export type EasyTTrip = {
  schemaVersion: typeof EASYT_TRIP_SCHEMA_VERSION;
  id: string;
  ownerId: string | null;
  title: string;
  status: TripStatus;
  startDate: string;
  endDate: string;
  travellers: number;
  currency: string;
  brief: TripBrief;
  stops: TripStop[];
  legs: TripLeg[];
  planItems: PlanItem[];
  recommendations: TripRecommendation[];
  changeHistory?: TripChange[];
  createdAt: string;
  updatedAt: string;
};

export type BuilderDay = {
  number: string;
  date: string;
  destination: string;
  title: string;
  reason: string;
  items: string[];
  type?: "arrival" | "activity" | "open";
  placeTitle?: string;
  coordinates?: [number, number];
};

export type BuilderTripInput = {
  id: string;
  origin: string;
  stops: Array<{ id: string; name: string; country: string; coordinates?: [number, number] }>;
  startDate: string;
  endDate: string;
  picks: Record<string, string[]>;
  mustDo: string;
  pace: TripPace;
  hotels: HotelChanges;
  budget: BudgetBand;
  dayAllocations?: Record<string, number>;
  draft: BuilderDay[];
  placeDetails?: Record<string, Array<{ title: string; coordinates?: [number, number]; image?: string; sourceUrl?: string }>>;
  originCoordinates?: [number, number];
  createdAt?: string;
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function tripFromBuilder(input: BuilderTripInput): EasyTTrip {
  const now = new Date().toISOString();
  let dayOffset = 0;
  const stops = input.stops.map((stop, order) => {
    const allocation = Math.max(1, input.dayAllocations?.[stop.id] ?? 1);
    const arrival = new Date(`${input.startDate}T00:00:00`);
    arrival.setDate(arrival.getDate() + dayOffset);
    const departure = new Date(arrival);
    departure.setDate(departure.getDate() + allocation);
    dayOffset += allocation;
    return {
      id: stop.id,
      name: stop.name,
      country: stop.country,
      order,
      latitude: stop.coordinates?.[1] ?? null,
      longitude: stop.coordinates?.[0] ?? null,
      arrivalDate: arrival.toISOString().slice(0, 10),
      departureDate: departure.toISOString().slice(0, 10),
      nights: Math.max(0, allocation - 1),
    };
  });

  const stopByName = new Map(stops.map((stop) => [stop.name, stop]));
  const planItems = input.draft.map((day, index): PlanItem => {
    const stop = stopByName.get(day.destination) ?? stops[0];
    const date = new Date(`${input.startDate}T00:00:00`);
    date.setDate(date.getDate() + index);
    const mappedPlace = input.placeDetails?.[stop?.id ?? ""]?.find((place) => place.title === (day.placeTitle ?? day.title));
    return {
      id: `${input.id}-day-${index + 1}-${slug(day.title) || "plan"}`,
      stopId: stop?.id ?? "unassigned",
      dayNumber: index + 1,
      date: date.toISOString().slice(0, 10),
      type: day.type ?? (day.title.toLowerCase().startsWith("arrive") || day.title.toLowerCase().startsWith("travel") ? "arrival" : day.title.toLowerCase().includes("open") ? "open" : "activity"),
      title: day.title,
      reason: day.reason,
      notes: day.items,
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: day.coordinates?.[1] ?? mappedPlace?.coordinates?.[1] ?? stop?.latitude ?? null,
      longitude: day.coordinates?.[0] ?? mappedPlace?.coordinates?.[0] ?? stop?.longitude ?? null,
      image: mappedPlace?.image ?? null,
      sourceUrl: mappedPlace?.sourceUrl ?? null,
    };
  });

  return {
    schemaVersion: EASYT_TRIP_SCHEMA_VERSION,
    id: input.id,
    ownerId: null,
    title: `${input.origin} to ${stops.map((stop) => stop.name).join(" & ")}`,
    status: "draft",
    startDate: input.startDate,
    endDate: input.endDate,
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: input.origin,
      originCoordinates: input.originCoordinates,
      mustDo: input.mustDo,
      pace: input.pace,
      hotelChanges: input.hotels,
      budgetBand: input.budget,
      selectedPlaces: input.picks,
      dayAllocations: input.dayAllocations,
    },
    stops,
    legs: input.stops.slice(1).map((stop, index) => {
      const from = input.stops[index];
      const estimate = estimateLeg(from, stop);
      return {
        id: `${input.id}-leg-${index + 1}`,
        fromStopId: from.id,
        toStopId: stop.id,
        mode: estimate.mode,
        distanceKm: estimate.distanceKm,
        durationMinutes: estimate.durationMinutes,
        provider: estimate.note,
        routeMetadata: { planningEstimate: true, label: estimate.label },
      };
    }),
    planItems,
    recommendations: [],
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

export function isEasyTTrip(value: unknown): value is EasyTTrip {
  if (!value || typeof value !== "object") return false;
  const trip = value as Partial<EasyTTrip>;
  return trip.schemaVersion === EASYT_TRIP_SCHEMA_VERSION
    && typeof trip.id === "string"
    && typeof trip.startDate === "string"
    && typeof trip.endDate === "string"
    && Array.isArray(trip.stops)
    && Array.isArray(trip.planItems);
}

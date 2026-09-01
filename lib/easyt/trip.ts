import { type RouteIntelligenceAssessment, type RoutePlanningConstraints } from "./planner.ts";
import type { NightAllocationResult } from "./night-allocation.ts";
import { reconcileCuratedRouteKnowledge, type CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import { mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief, routePreferencesFromStructuredBrief, type StructuredTripBrief } from "./structured-trip-brief.ts";
import { buildCanonicalTripLegs } from "./trip-legs.ts";
import { normalizeTripInterests, type TripInterest } from "./trip-interest.ts";

export const EASYT_TRIP_SCHEMA_VERSION = 1 as const;

export type TripStatus = "draft" | "planned" | "archived";
export type TripPace = "slow" | "full";
export type HotelChanges = "few" | "some";
export type BudgetBand = "value" | "mid" | "high";

export type TripIntentPace = "relaxed" | "balanced" | "packed";
export type TripTransportMode = "flight" | "train" | "drive";
export type FixedTripCommitment = { id: string; label: string; date?: string };

/**
 * The durable, structured counterpart to a traveller's free-form brief.
 * `hardConstraints` are never discarded when the plan is reshaped; preferences
 * guide trade-offs where the route has room to adapt.
 */
export type TripIntent = {
  version: 1;
  travellers: number;
  timing: { flexibility: "fixed" | "flexible"; durationDays: number };
  hardConstraints: {
    originRequired: boolean;
    mustSeeStopIds: string[];
    optionalStopIds: string[];
    fixedCommitments: FixedTripCommitment[];
    avoidDriving: boolean;
  };
  preferences: {
    budgetSensitivity: BudgetBand;
    transportModes: TripTransportMode[];
    pace: TripIntentPace;
    interests: TripInterest[];
    dislikes: string[];
  };
};

export function defaultTripIntent(input: Partial<Omit<TripIntent, "version" | "hardConstraints" | "preferences" | "timing">> & {
  durationDays?: number;
  stopIds?: string[];
  budgetSensitivity?: BudgetBand;
  pace?: TripIntentPace;
} = {}): TripIntent {
  return {
    version: 1,
    travellers: Math.max(1, Math.min(12, Math.round(input.travellers ?? 2))),
    timing: { flexibility: "fixed", durationDays: Math.max(1, Math.round(input.durationDays ?? 7)) },
    hardConstraints: { originRequired: true, mustSeeStopIds: input.stopIds ?? [], optionalStopIds: [], fixedCommitments: [], avoidDriving: false },
    preferences: { budgetSensitivity: input.budgetSensitivity ?? "mid", transportModes: ["flight", "train"], pace: input.pace ?? "balanced", interests: [], dislikes: [] },
  };
}

export function tripIntentForTrip(trip: Pick<EasyTTrip, "startDate" | "endDate" | "stops" | "travellers" | "brief">): TripIntent {
  const durationDays = Math.max(1, Math.round((+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000) + 1);
  const fallback = defaultTripIntent({
    travellers: trip.travellers,
    durationDays,
    stopIds: trip.stops.map((stop) => stop.id),
    budgetSensitivity: trip.brief.budgetBand,
    pace: trip.brief.pace === "full" ? "packed" : "relaxed",
  });
  const saved = trip.brief.intent;
  const hasCompatibleSavedIntent = saved?.version === 1;
  const compatible = !saved || saved.version !== 1 ? fallback : {
    ...fallback,
    ...saved,
    travellers: Math.max(1, Math.min(12, Math.round(saved.travellers || fallback.travellers))),
    timing: { ...fallback.timing, ...saved.timing, durationDays },
    hardConstraints: { ...fallback.hardConstraints, ...saved.hardConstraints, mustSeeStopIds: saved.hardConstraints?.mustSeeStopIds ?? fallback.hardConstraints.mustSeeStopIds, optionalStopIds: saved.hardConstraints?.optionalStopIds ?? [], fixedCommitments: saved.hardConstraints?.fixedCommitments ?? [] },
    preferences: { ...fallback.preferences, ...saved.preferences, transportModes: saved.preferences?.transportModes?.length ? saved.preferences.transportModes : fallback.preferences.transportModes, interests: normalizeTripInterests(saved.preferences?.interests), dislikes: saved.preferences?.dislikes ?? [] },
  };
  const structured = trip.brief.structuredBrief;
  if (!structured) return compatible;
  const routePreferences = routePreferencesFromStructuredBrief(structured);
  const fixedCommitments = structured.hardConstraints.flatMap((constraint) => constraint.type === "fixed-commitment"
    ? [{ id: `structured-${constraint.date ?? "open"}-${constraint.value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label: constraint.value, date: constraint.date }]
    : []);
  return {
    ...compatible,
    travellers: structured.travellers?.value ?? compatible.travellers,
    hardConstraints: {
      ...compatible.hardConstraints,
      avoidDriving: routePreferences.avoidDriving,
      mustSeeStopIds: structured.mustVisit.map((destination) => destination.id).filter((id): id is string => Boolean(id)),
      fixedCommitments: fixedCommitments.length ? fixedCommitments : compatible.hardConstraints.fixedCommitments,
    },
    preferences: {
      ...compatible.preferences,
      transportModes: routePreferences.transportModes.length ? routePreferences.transportModes : compatible.preferences.transportModes,
      pace: structured.pace?.value ?? compatible.preferences.pace,
      interests: hasCompatibleSavedIntent
        ? compatible.preferences.interests
        : normalizeTripInterests(structured.interests.map((interest) => interest.value)),
      budgetSensitivity: structured.budget?.value ?? compatible.preferences.budgetSensitivity,
    },
  };
}

export type TripStop = {
  id: string;
  order: number;
  name: string;
  country: string;
  /** Stable geographic identity; route-stop `id` remains operational only. */
  canonicalPlaceId?: string;
  countryCode?: string;
  region?: string;
  providerId?: string;
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
  /** Durable endpoint snapshots let the origin participate without becoming an overnight stop. */
  fromEndpoint?: CanonicalRouteEndpoint;
  toEndpoint?: CanonicalRouteEndpoint;
  classification?: TripLegClassification;
  straightLineDistanceKm?: number | null;
  routedDistanceKm?: number | null;
  headlineMinutes?: number | null;
  doorToDoorMinutes?: number | null;
  usableDayLoss?: number | null;
  provenance?: TripLegProvenance;
  confidence?: "high" | "medium" | "low" | "unknown";
  scheduleNeedsChecking?: boolean;
  warnings?: string[];
};

export type CanonicalRouteEndpoint = {
  kind: "origin" | "stop";
  id: string;
  name: string;
  country?: string;
  canonicalPlaceId?: string;
  providerId?: string;
  coordinates: [number, number] | null;
};

export type TripLegClassification = "arrival" | "international" | "intercity" | "local" | "departure";
export type TripLegProvenance = "provider" | "canonical_schedule" | "routing_engine" | "planning_estimate" | "unknown";

export type PlanItem = {
  id: string;
  stopId: string;
  dayNumber: number;
  date: string;
  type: "arrival" | "activity" | "food" | "stay" | "transport" | "open";
  title: string;
  reason: string;
  notes: string[];
  /** Optional broad scheduling intent aligned by index with `notes`. */
  noteDayParts?: Array<ItineraryDayPart | null>;
  startsAt: string | null;
  endsAt: string | null;
  bookingUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  image?: string | null;
  sourceUrl?: string | null;
};

export type ItineraryDayPart = "morning" | "midday" | "afternoon" | "evening";

export type ItineraryIdea = {
  /** Stable identity for this traveller choice, independent of its day. */
  id: string;
  stopId: string;
  placeId: string;
  title: string;
  category: "restaurant" | "activity";
  coordinates: [number, number];
  image?: string;
  sourceUrl?: string;
  source: "destination-highlight" | "personalised-recommendation";
  reasons: Array<"destination-significance" | "interest-relevance">;
  /** Missing means deliberately saved for later; fake days are never used. */
  dayId?: string;
  /** Explicit broad scheduling intent; null means planned on a day but not slotted. */
  dayPart?: ItineraryDayPart | null;
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
  originCanonicalPlaceId?: string;
  originCountry?: string;
  originProviderId?: string;
  /** Public editorial route used as the starting point, when one exists. */
  sourceRouteKey?: string;
  /** Reviewed route evidence retained from Route Detail into the editable trip. */
  curatedRoute?: CuratedRouteKnowledge;
  mustDo: string;
  pace: TripPace;
  hotelChanges: HotelChanges;
  budgetBand: BudgetBand;
  selectedPlaces: Record<string, string[]>;
  dayAllocations?: Record<string, number>;
  /** Traveller-facing stay nights, stored separately from legacy calendar-day allocations. */
  nightAllocations?: Record<string, number>;
  /** Stable stop identities whose night counts were explicitly edited by the traveller. */
  manualNightStopIds?: string[];
  /** Night-native allocation metadata. Older trips keep using dayAllocations. */
  nightAllocation?: NightAllocationResult;
  /** Traveller-authored notes kept with a single calendar day. */
  dayNotes?: Record<number, string[]>;
  /** Only traveller-authored itinerary rows are editable; generated suggestions remain read-only. */
  customActivities?: Record<number, string[]>;
  /** Canonical stop-bound discovery choices, whether saved or assigned to a day. */
  itineraryIdeas?: ItineraryIdea[];
  /** Pins are intentionally lightweight: they are part of the editable map, not a separate places database. */
  mapPins?: PlannerMapPin[];
  /** Lightweight traveller-entered confirmations, separate from planning suggestions. */
  bookings?: TripBooking[];
  /** A compact pre-departure checklist for the mobile trip view. */
  checklist?: TripChecklistItem[];
  /** The original route intent, retained so a saved plan can be audited later. */
  capturedIntent?: TripCapturedIntent;
  /** The lightweight route and time assessment shown while this plan was made. */
  routeAssessment?: RouteIntelligenceAssessment;
  /** Structured constraints and preferences, retained independently of free text. */
  intent?: TripIntent;
  /** Canonical normalized traveller intent used at the route-planning boundary. */
  structuredBrief?: StructuredTripBrief;
  /** Stops or arrival dates a traveller has explicitly protected while editing. */
  scheduleLocks?: TripScheduleLocks;
  /** A non-destructive record of consequences from the latest schedule cascade. */
  cascadeStatus?: TripCascadeStatus;
  /** The traveller's explicit choice where Morrovia presented meaningful alternatives. */
  decisionSelections?: TripDecisionSelections;
};

export type TripScheduleLocks = {
  stopIds: string[];
  arrivalDates: Record<string, string>;
};

export type TripCascadeStatus = {
  conflicts: string[];
  affectedBookingIds: string[];
  affectedPlanItemCount: number;
};

export type TripDecisionSelections = {
  routeOrder?: "entered" | "recommended";
  transportByLeg: Record<string, "fastest" | "simplest" | "lower-cost" | "experience-led">;
};

export type TripCapturedIntent = {
  originalBrief: string;
  parserVersion?: string;
  regions: string[];
  routeHints: string[];
  mentions: Array<{
    sourceText: string;
    canonicalName: string;
    canonicalPlaceId?: string;
    placeType?: import("./place-intelligence.ts").PlaceType;
    role: "origin" | "stop";
    order: number;
    status: "resolved" | "unresolved";
    intent?: "place" | "landmark";
    country?: string;
  }>;
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
  /** Optional provider-neutral end date for a confirmed multi-day booking. */
  endDate?: string | null;
  confirmation: string | null;
  url: string | null;
  /** Traveller-confirmed location text when a booking is tied to a place. */
  location?: string | null;
  /** Unstructured traveller notes retained without promoting them to facts. */
  notes?: string[];
  /** Explicit transport facts only; null means the source did not say. */
  transportDetails?: {
    mode: "flight" | "train" | "road" | "ferry" | null;
    from: string;
    to: string;
  };
  /** Provenance for an explicitly confirmed provider-neutral import. */
  importDetails?: {
    candidateId: string;
    fingerprint: string;
    sources: Array<"calendar" | "forwarded_email">;
    provider: string | null;
    endDate: string | null;
    location: string | null;
    confidence: "high" | "medium" | "low";
  };
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
  /** Retained only while archived so restore returns the trip to its prior planning state. */
  archivedFromStatus?: Exclude<TripStatus, "archived">;
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
  sourceRouteKey?: string;
  curatedRoute?: CuratedRouteKnowledge;
  origin: string;
  originCanonicalPlaceId?: string;
  originCountry?: string;
  originProviderId?: string;
  stops: Array<{ id: string; name: string; country: string; canonicalPlaceId?: string; countryCode?: string; region?: string; providerId?: string; coordinates?: [number, number]; intent?: "place" | "landmark"; locality?: string }>;
  startDate: string;
  endDate: string;
  picks: Record<string, string[]>;
  mustDo: string;
  pace: TripPace;
  hotels: HotelChanges;
  budget: BudgetBand;
  dayAllocations?: Record<string, number>;
  nightAllocations?: Record<string, number>;
  manualNightStopIds?: string[];
  nightAllocation?: NightAllocationResult;
  draft: BuilderDay[];
  placeDetails?: Record<string, Array<{ title: string; coordinates?: [number, number]; image?: string; sourceUrl?: string }>>;
  originCoordinates?: [number, number];
  createdAt?: string;
  status?: Exclude<TripStatus, "archived">;
  capturedIntent?: TripCapturedIntent;
  routeAssessment?: RouteIntelligenceAssessment;
  intent?: TripIntent;
  structuredBrief?: StructuredTripBrief;
  scheduleLocks?: TripScheduleLocks;
  decisionSelections?: TripDecisionSelections;
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function tripFromBuilder(input: BuilderTripInput): EasyTTrip {
  const now = new Date().toISOString();
  const fallbackIntent = defaultTripIntent({
    travellers: 2,
    durationDays: Math.max(1, Math.round((+new Date(`${input.endDate}T00:00:00`) - +new Date(`${input.startDate}T00:00:00`)) / 86400000) + 1),
    stopIds: input.stops.map((stop) => stop.id),
    budgetSensitivity: input.budget,
    pace: input.pace === "full" ? "packed" : "relaxed",
  });
  const suppliedIntent = input.intent ?? fallbackIntent;
  const canonicalInterests = normalizeTripInterests(input.intent?.preferences.interests
    ?? input.structuredBrief?.interests.map((interest) => interest.value));
  const canonicalIntent: TripIntent = {
    ...suppliedIntent,
    preferences: { ...suppliedIntent.preferences, interests: canonicalInterests },
  };
  const canonicalStructuredBrief = input.structuredBrief
    ? mergeStructuredTripBrief(input.structuredBrief, { interests: canonicalInterests })
    : undefined;
  const structuredRouteConstraints: RoutePlanningConstraints = input.structuredBrief
    ? routeConstraintsFromStructuredTripBrief(input.structuredBrief)
    : {};
  const avoidDriving = Boolean(structuredRouteConstraints.avoidDriving || input.intent?.hardConstraints.avoidDriving);
  const legConstraints: RoutePlanningConstraints = {
    ...structuredRouteConstraints,
    avoidDriving,
    excludedTransportModes: avoidDriving ? ["road"] : structuredRouteConstraints.excludedTransportModes,
  };
  const nativeAllocations = input.nightAllocations
    ?? (input.nightAllocation?.state !== "conflict" ? input.nightAllocation?.allocations : undefined);
  const nightNative = Boolean(nativeAllocations);
  let dayOffset = 0;
  const stops = input.stops.map((stop, order) => {
    const allocation = Math.max(1, input.dayAllocations?.[stop.id] ?? 1);
    const nights = nightNative
      ? Math.max(0, nativeAllocations?.[stop.id] ?? 0)
      : Math.max(0, allocation - 1);
    const arrival = new Date(`${input.startDate}T00:00:00`);
    arrival.setDate(arrival.getDate() + dayOffset);
    const departure = new Date(arrival);
    departure.setDate(departure.getDate() + (nightNative ? nights : allocation));
    dayOffset += nightNative ? nights : allocation;
    return {
      id: stop.id,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: stop.canonicalPlaceId,
      countryCode: stop.countryCode,
      region: stop.region,
      providerId: stop.providerId,
      order,
      latitude: stop.coordinates?.[1] ?? null,
      longitude: stop.coordinates?.[0] ?? null,
      arrivalDate: arrival.toISOString().slice(0, 10),
      departureDate: departure.toISOString().slice(0, 10),
      nights,
    };
  });
  const curatedRoute = reconcileCuratedRouteKnowledge(input.curatedRoute, stops.map((stop) => stop.id));

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
    status: input.status ?? "draft",
    startDate: input.startDate,
    endDate: input.endDate,
    travellers: canonicalIntent.travellers,
    currency: "GBP",
    brief: {
      origin: input.origin,
      originCoordinates: input.originCoordinates,
      originCanonicalPlaceId: input.originCanonicalPlaceId,
      originCountry: input.originCountry,
      originProviderId: input.originProviderId,
      sourceRouteKey: input.sourceRouteKey,
      curatedRoute,
      mustDo: input.mustDo,
      pace: input.pace,
      hotelChanges: input.hotels,
      budgetBand: input.budget,
      selectedPlaces: input.picks,
      dayAllocations: input.dayAllocations,
      nightAllocations: input.nightAllocations,
      manualNightStopIds: input.manualNightStopIds,
      nightAllocation: input.nightAllocation,
      capturedIntent: input.capturedIntent,
      routeAssessment: input.routeAssessment,
      scheduleLocks: input.scheduleLocks ?? { stopIds: [], arrivalDates: {} },
      decisionSelections: input.decisionSelections ?? { transportByLeg: {} },
      intent: canonicalIntent,
      structuredBrief: canonicalStructuredBrief,
    },
    stops,
    legs: buildCanonicalTripLegs({
      tripId: input.id,
      origin: {
        name: input.origin,
        country: input.originCountry,
        canonicalPlaceId: input.originCanonicalPlaceId,
        providerId: input.originProviderId,
        coordinates: input.originCoordinates ?? null,
      },
      stops,
      constraints: legConstraints,
      curatedRoute,
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

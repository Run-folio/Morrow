/**
 * The deterministic planning layer used by both the builder and saved trip
 * document. It deliberately makes its assumptions visible: travel durations
 * are planning estimates, not live timetable claims.
 */

export type PlannerPlace = {
  title: string;
  area: string;
  type: string;
  cost: number;
  tags: string[];
  description: string;
  image?: string;
  sourceUrl?: string;
  coordinates?: [number, number];
};

export type PlannerStop = {
  id: string;
  name: string;
  country: string;
  coordinates?: [number, number];
};

export type EstimatedLeg = {
  mode: "flight" | "train" | "road" | "ferry";
  distanceKm: number | null;
  durationMinutes: number | null;
  label: string;
  note: string;
};

export type DecisionAlternative = {
  id: "fastest" | "simplest" | "lower-cost" | "experience-led";
  label: string;
  mode: EstimatedLeg["mode"];
  estimatedMinutes: number | null;
  timeImpactMinutes: number | null;
  costImpact: string;
  tradeoff: string;
  recommended: boolean;
  recommendationReason?: string;
};

export type RouteOrderAssessment = {
  state: "insufficient-data" | "current-order" | "recommendation";
  currentStopIds: string[];
  recommendedStopIds: string[];
  currentTransferMinutes: number | null;
  recommendedTransferMinutes: number | null;
  improvementMinutes: number | null;
  reasons: string[];
  tradeoffs: string[];
  summary: string;
};

export type StopDurationRecommendation = {
  stopId: string;
  minimumDays: number;
  recommendedDays: number;
  usableDays: number;
  arrivalMinutes: number | null;
  arrivalLoad: "light" | "substantial" | "travel-heavy" | "unknown";
  reason: string;
};

export type RouteIntelligenceAssessment = {
  route: RouteOrderAssessment;
  durations: Record<string, StopDurationRecommendation>;
  comfortableDays: number;
  shortfallDays: number;
  overload?: { suggestedCutStopId?: string; daysRecovered?: number; reason: string };
};

export type RoutePlanningConstraints = {
  fixedCommitments?: Array<{ label: string; date?: string }>;
  avoidDriving?: boolean;
  transportModes?: Array<"flight" | "train" | "drive">;
  optionalStopIds?: string[];
};

type KnownConnection = Pick<EstimatedLeg, "mode" | "durationMinutes" | "note">;

// These are deliberately door-to-door planning allowances, rather than a claim
// about one particular departure. They keep the most common European corridors
// from being incorrectly presented as flights while a live timetable provider
// is not connected.
const knownConnections: Record<string, KnownConnection> = {
  // Common long-haul legs in the canonical Tokyo Marathon+ journey. These are
  // planning allowances (airport time included), not live departure times.
  "guatemala city|los angeles": { mode: "flight", durationMinutes: 480, note: "Approximate door-to-door flight allowance; verify the live service before booking." },
  "los angeles|tokyo": { mode: "flight", durationMinutes: 840, note: "Approximate door-to-door trans-Pacific allowance; verify the live service before booking." },
  "tokyo|hong kong": { mode: "flight", durationMinutes: 360, note: "Approximate door-to-door flight allowance; verify the live service before booking." },
  "hong kong|los angeles": { mode: "flight", durationMinutes: 1020, note: "Approximate door-to-door trans-Pacific allowance; verify the live service before booking." },
  "los angeles|guatemala city": { mode: "flight", durationMinutes: 480, note: "Approximate door-to-door flight allowance; verify the live service before booking." },
  "london|paris": { mode: "train", durationMinutes: 270, note: "Typical Eurostar door-to-door allowance; verify the live timetable before booking." },
  "paris|london": { mode: "train", durationMinutes: 270, note: "Typical Eurostar door-to-door allowance; verify the live timetable before booking." },
  "madrid|barcelona": { mode: "train", durationMinutes: 210, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "barcelona|madrid": { mode: "train", durationMinutes: 210, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "paris|rome": { mode: "flight", durationMinutes: 330, note: "Typical door-to-door flight allowance, including airport time; verify flight schedules before booking." },
  "rome|paris": { mode: "flight", durationMinutes: 330, note: "Typical door-to-door flight allowance, including airport time; verify flight schedules before booking." },
  // Light-touch rail corridors: useful planning allowances for common city
  // pairs, without pretending to provide live departures or seat availability.
  "london|amsterdam": { mode: "train", durationMinutes: 300, note: "Typical Eurostar door-to-door allowance; verify the live timetable before booking." },
  "amsterdam|london": { mode: "train", durationMinutes: 300, note: "Typical Eurostar door-to-door allowance; verify the live timetable before booking." },
  "paris|brussels": { mode: "train", durationMinutes: 120, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "brussels|paris": { mode: "train", durationMinutes: 120, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "rome|florence": { mode: "train", durationMinutes: 120, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "florence|rome": { mode: "train", durationMinutes: 120, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "tokyo|kanazawa": { mode: "train", durationMinutes: 190, note: "Typical Hokuriku Shinkansen door-to-door allowance; verify the live timetable before booking." },
  "kanazawa|tokayama": { mode: "train", durationMinutes: 150, note: "Typical regional rail and bus door-to-door allowance; verify the live timetable before booking." },
  "kanazawa|takayama": { mode: "train", durationMinutes: 180, note: "Typical regional rail and bus door-to-door allowance; verify the live timetable before booking." },
  "takayama|matsumoto": { mode: "train", durationMinutes: 150, note: "Typical regional rail and bus door-to-door allowance; verify the live timetable before booking." },
  "chengdu|tongren": { mode: "train", durationMinutes: 360, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "tongren|zhangjiajie": { mode: "train", durationMinutes: 210, note: "Typical rail connection door-to-door allowance; verify the live timetable before booking." },
  "zhangjiajie|hong kong": { mode: "train", durationMinutes: 420, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
  "hong kong|zhangjiajie": { mode: "train", durationMinutes: 420, note: "Typical high-speed rail door-to-door allowance; verify the live timetable before booking." },
};

export type PlannedDay = {
  number: string;
  date: string;
  destination: string;
  title: string;
  reason: string;
  items: string[];
  type: "arrival" | "activity" | "open";
  placeTitle?: string;
  coordinates?: [number, number];
  travel?: EstimatedLeg;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function haversineKm(a?: [number, number], b?: [number, number]) {
  if (!a || !b) return null;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const rad = Math.PI / 180;
  const deltaLat = (lat2 - lat1) * rad;
  const deltaLon = (lon2 - lon1) * rad;
  const q = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}

/** Conservative door-to-door estimate; tells people to verify real services. */
export function estimateLeg(from: PlannerStop | { name: string; coordinates?: [number, number] }, to: PlannerStop): EstimatedLeg {
  const distanceKm = haversineKm(from.coordinates, to.coordinates);
  const sameCountry = "country" in from && from.country.toLowerCase() === to.country.toLowerCase();
  const connectionKey = `${from.name.toLowerCase().trim()}|${to.name.toLowerCase().trim()}`;
  const known = knownConnections[connectionKey];
  if (known) {
    return {
      ...known,
      distanceKm,
      label: `${from.name} → ${to.name}`,
    };
  }
  if (distanceKm === null) {
    return { mode: sameCountry ? "road" : "flight", distanceKm: null, durationMinutes: null, label: `${from.name} → ${to.name}`, note: "Confirm the best connection before booking." };
  }
  if (distanceKm <= 45) {
    return { mode: "road", distanceKm, durationMinutes: Math.max(35, Math.round(25 + distanceKm * 1.15)), label: `${from.name} → ${to.name}`, note: "Local transfer estimate; verify the route from your accommodation." };
  }
  if (sameCountry && distanceKm <= 700) {
    const mode = distanceKm <= 180 ? "road" : "train";
    return { mode, distanceKm, durationMinutes: Math.round((mode === "train" ? 55 : 48) + (distanceKm / (mode === "train" ? 105 : 62)) * 60), label: `${from.name} → ${to.name}`, note: "A planning estimate; compare rail and road schedules before booking." };
  }
  return { mode: "flight", distanceKm, durationMinutes: Math.round(180 + (distanceKm / 760) * 60), label: `${from.name} → ${to.name}`, note: "Door-to-door flight estimate, including airport time. Verify flight schedules before booking." };
}

/**
 * Planning alternatives for a consequential intercity leg. These are broad
 * door-to-door comparisons, not live services or price quotes.
 */
export function legDecisionAlternatives(
  from: PlannerStop | { name: string; country?: string; coordinates?: [number, number] },
  to: PlannerStop,
): DecisionAlternative[] {
  const baseline = estimateLeg(from, to);
  const distance = baseline.distanceKm;
  if (distance === null || distance < 120) return [];
  const sameCountry = "country" in from && Boolean(from.country) && from.country?.toLowerCase() === to.country.toLowerCase();
  const flightMinutes = Math.round(180 + (distance / 760) * 60);
  const trainMinutes = Math.round(60 + (distance / 105) * 60);
  const roadMinutes = Math.round(35 + (distance / 62) * 60);
  const candidates: Array<Omit<DecisionAlternative, "timeImpactMinutes" | "recommended" | "recommendationReason">> = [
    { id: "fastest", label: baseline.mode === "flight" ? "Fly" : baseline.mode === "train" ? "Take the train" : "Travel by road", mode: baseline.mode, estimatedMinutes: baseline.durationMinutes, costImpact: "Compare live fares", tradeoff: "Usually saves usable trip time, but may add airport or station friction." },
  ];
  if (distance <= 350 && baseline.mode !== "road") candidates.push({ id: "simplest", label: "Direct road transfer", mode: "road", estimatedMinutes: roadMinutes, costImpact: "Price not yet verified", tradeoff: "Fewer changes and decisions, even when it is not the absolute fastest." });
  if (sameCountry && distance <= 900) candidates.push(baseline.mode === "train"
    ? { id: "lower-cost", label: "Compare coach or shared road travel", mode: "road", estimatedMinutes: roadMinutes, costImpact: "May be lower-cost; verify fares", tradeoff: "Usually slower than rail, but advance fares may be easier on the budget." }
    : { id: "lower-cost", label: "Compare rail", mode: "train", estimatedMinutes: trainMinutes, costImpact: "May be lower-cost; verify fares", tradeoff: "May take longer, but avoids airport transfers and baggage friction." });
  if ((sameCountry || baseline.mode === "train") && distance <= 900) candidates.push({ id: "experience-led", label: "Make the journey part of the trip", mode: baseline.mode === "train" ? "road" : "train", estimatedMinutes: baseline.mode === "train" ? roadMinutes : trainMinutes, costImpact: "Price not yet verified", tradeoff: "More time in transit in exchange for landscape and a stronger sense of place." });
  const unique = candidates.filter((option, index, all) => all.findIndex((item) => item.id === option.id) === index);
  const fastestMinutes = Math.min(...unique.map((option) => option.estimatedMinutes ?? Number.POSITIVE_INFINITY));
  const recommendedId = distance <= 350 && unique.some((option) => option.id === "simplest") ? "simplest" : "fastest";
  return unique.map((option) => ({
    ...option,
    timeImpactMinutes: option.estimatedMinutes === null || !Number.isFinite(fastestMinutes) ? null : option.estimatedMinutes - fastestMinutes,
    recommended: option.id === recommendedId,
    recommendationReason: option.id === recommendedId ? (recommendedId === "simplest" ? "Morrovia recommends this as the least disruptive door-to-door choice." : "Morrovia recommends this to protect usable time at the destination.") : undefined,
  }));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)])
    .map((rest) => [item, ...rest]));
}

function routeEstimate(origin: { name: string; coordinates?: [number, number] }, stops: PlannerStop[]) {
  const legs = stops.map((stop, index) => estimateLeg(index ? stops[index - 1] : origin, stop));
  if (legs.some((leg) => leg.durationMinutes === null)) return { legs, minutes: null };
  return { legs, minutes: legs.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0) };
}

function transportTradeoffs(legs: EstimatedLeg[], constraints?: RoutePlanningConstraints) {
  const modes = new Set(legs.map((leg) => leg.mode));
  const tradeoffs: string[] = [];
  if (constraints?.avoidDriving && modes.has("road")) tradeoffs.push("Avoid driving is set, but one or more local transfers still need a rail or flight check.");
  if (constraints?.transportModes?.length) {
    const permitted = new Set<EstimatedLeg["mode"]>(constraints.transportModes.map((mode) => mode === "drive" ? "road" : mode));
    const unpreferred = [...modes].filter((mode) => !permitted.has(mode));
    if (unpreferred.length) tradeoffs.push(`This route may still need ${unpreferred.join(" or ")} transfers; compare alternatives before booking.`);
  }
  return tradeoffs;
}

/**
 * Compare the traveller's order with the smallest set of geographic alternatives.
 * This is deliberately a planning signal, not live routing or airport inventory.
 */
export function assessRouteOrder(input: {
  origin: { name: string; coordinates?: [number, number] };
  stops: PlannerStop[];
  constraints?: RoutePlanningConstraints;
}): RouteOrderAssessment {
  const currentStopIds = input.stops.map((stop) => stop.id);
  if (input.stops.length < 2 || input.stops.length > 6 || !input.origin.coordinates || input.stops.some((stop) => !stop.coordinates)) {
    return {
      state: "insufficient-data", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null,
      reasons: [], tradeoffs: [], summary: "Confirm every place before Morrovia can compare the route order.",
    };
  }

  const current = routeEstimate(input.origin, input.stops);
  if (current.minutes === null) {
    return {
      state: "insufficient-data", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null,
      reasons: [], tradeoffs: [], summary: "At least one connection needs an estimate before Morrovia can compare the route order.",
    };
  }

  const options = permutations(input.stops).map((stops) => ({ stops, ...routeEstimate(input.origin, stops) }))
    .filter((option): option is { stops: PlannerStop[]; legs: EstimatedLeg[]; minutes: number } => option.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);
  const best = options[0];
  if (!best) {
    return {
      state: "insufficient-data", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null,
      reasons: [], tradeoffs: [], summary: "Morrovia could not compare this route yet.",
    };
  }

  // A dated commitment is a hard constraint. Until it is explicitly linked to
  // a stop and re-timed, holding the traveller's entered order is safer than
  // offering an apparently efficient route that could break a booking.
  if (input.constraints?.fixedCommitments?.length) {
    return {
      state: "current-order", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: current.minutes, recommendedTransferMinutes: current.minutes, improvementMinutes: 0,
      reasons: ["The entered order is held while a fixed date or booking is in the trip."],
      tradeoffs: ["Confirm where each fixed commitment sits before changing the route order.", ...transportTradeoffs(current.legs, input.constraints)],
      summary: "Your fixed commitments are protected.",
    };
  }

  const improvementMinutes = Math.max(0, current.minutes - best.minutes);
  const meaningful = improvementMinutes >= 90 && improvementMinutes / Math.max(1, current.minutes) >= 0.1;
  if (!meaningful || best.stops.every((stop, index) => stop.id === input.stops[index]?.id)) {
    return {
      state: "current-order", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: current.minutes, recommendedTransferMinutes: current.minutes, improvementMinutes: 0,
      reasons: ["The order already keeps the estimated transfers reasonably direct."], tradeoffs: transportTradeoffs(current.legs, input.constraints),
      summary: "Your route already flows well.",
    };
  }

  const currentLongLegs = current.legs.filter((leg) => (leg.durationMinutes ?? 0) >= 300).length;
  const bestLongLegs = best.legs.filter((leg) => (leg.durationMinutes ?? 0) >= 300).length;
  const reasons = [
    `It removes about ${Math.floor(improvementMinutes / 60)}h ${improvementMinutes % 60}m of estimated door-to-door travel.`,
    ...(bestLongLegs < currentLongLegs ? ["It also reduces the number of travel-heavy days."] : ["It keeps the route moving in one direction instead of doubling back."]),
  ];
  return {
    state: "recommendation", currentStopIds, recommendedStopIds: best.stops.map((stop) => stop.id),
    currentTransferMinutes: current.minutes, recommendedTransferMinutes: best.minutes, improvementMinutes,
    reasons: reasons.slice(0, 2),
    tradeoffs: transportTradeoffs(best.legs, input.constraints),
    summary: `${best.stops.map((stop) => stop.name).join(" → ")} is the cleaner order.`,
  };
}

function arrivalLoad(minutes: number | null): StopDurationRecommendation["arrivalLoad"] {
  if (minutes === null) return "unknown";
  if (minutes < 150) return "light";
  if (minutes < 300) return "substantial";
  return "travel-heavy";
}

/** Recommend calendar days from usable time, not just from a stop count. */
export function recommendStopDurations(input: {
  origin: { name: string; coordinates?: [number, number] };
  stops: Array<PlannerStop & { intent?: "place" | "landmark" }>;
  picks: Record<string, string[]>;
}): Record<string, StopDurationRecommendation> {
  return Object.fromEntries(input.stops.map((stop, index) => {
    const previous = index ? input.stops[index - 1] : input.origin;
    const leg = estimateLeg(previous, stop);
    const load = arrivalLoad(leg.durationMinutes);
    const selectedCount = input.picks[stop.id]?.length ?? 0;
    const activityDays = Math.max(1, Math.ceil(selectedCount / 2));
    const protectedArrival = load === "travel-heavy" || load === "unknown" ? 1 : 0;
    const landmarkDay = stop.intent === "landmark" ? 1 : 0;
    const minimumDays = Math.max(1, protectedArrival + 1);
    const recommendedDays = Math.max(minimumDays, protectedArrival + activityDays + landmarkDay);
    const arrivalUsable = load === "light" ? 0.75 : load === "substantial" ? 0.5 : load === "travel-heavy" ? 0.15 : 0;
    const usableDays = Math.max(0, Math.round((recommendedDays - 1 + arrivalUsable) * 4) / 4);
    const reason = load === "travel-heavy"
      ? `The arrival transfer takes most of the day, so one full day is protected here.`
      : load === "substantial"
        ? `The arrival transfer uses a meaningful part of the day.`
        : stop.intent === "landmark"
          ? `Keep a full visit day protected for this landmark.`
          : selectedCount >= 3
            ? `${selectedCount} selected places need more than a single rushed day.`
            : "This leaves time to arrive and still experience the place.";
    return [stop.id, { stopId: stop.id, minimumDays, recommendedDays, usableDays, arrivalMinutes: leg.durationMinutes, arrivalLoad: load, reason }];
  }));
}

export function assessRouteIntelligence(input: {
  origin: { name: string; coordinates?: [number, number] };
  stops: Array<PlannerStop & { intent?: "place" | "landmark" }>;
  picks: Record<string, string[]>;
  availableDays: number;
  constraints?: RoutePlanningConstraints;
}): RouteIntelligenceAssessment {
  const route = assessRouteOrder(input);
  // Keep duration guidance honest about the route the traveller is currently
  // looking at. If they accept a reorder, this function runs again for that
  // new sequence instead of silently budgeting against a route they declined.
  const durations = recommendStopDurations({ ...input, stops: input.stops });
  const comfortableDays = Object.values(durations).reduce((total, duration) => total + duration.recommendedDays, 0);
  const shortfallDays = Math.max(0, comfortableDays - input.availableDays);
  const optionalStops = input.stops.filter((stop) => input.constraints?.optionalStopIds?.includes(stop.id));
  const cut = shortfallDays && optionalStops.length
    ? [...optionalStops].sort((a, b) => (durations[a.id]?.recommendedDays ?? 1) - (durations[b.id]?.recommendedDays ?? 1))[0]
    : undefined;
  return {
    route, durations, comfortableDays, shortfallDays,
    overload: shortfallDays ? {
      suggestedCutStopId: cut?.id,
      daysRecovered: cut ? durations[cut.id]?.recommendedDays : undefined,
      reason: cut
        ? `${cut.name} is the smallest optional stop to remove without breaking the must-see route.`
        : "Every remaining stop is marked must-see, so add days rather than compressing the route.",
    } : undefined,
  };
}

function dateAt(startDate: string, offset: number) {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function pairs<T>(items: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 2) result.push(items.slice(index, index + 2));
  return result;
}

function fallbackDay(stop: PlannerStop, index: number): Omit<PlannedDay, "number" | "date"> {
  const variants = [
    { title: `Explore ${stop.name}`, reason: `A deliberately light day in ${stop.name}, leaving space to follow what looks good once you are there.`, items: ["Choose one walkable neighbourhood", "Add one real place once you have local context", "Leave the evening for a nearby meal"] },
    { title: `A slower ${stop.name} day`, reason: "A buffer day protects the trip from becoming a chain of transfers and bookings.", items: ["Start later", "Stay close to your base", "Keep one meal unplanned"] },
  ];
  return { ...variants[index % variants.length], destination: stop.name, type: "open" };
}

export function buildCredibleItinerary(input: {
  origin: string;
  originCoordinates?: [number, number];
  stops: PlannerStop[];
  startDate: string;
  allocations: Record<string, number>;
  picks: Record<string, string[]>;
  places: Record<string, PlannerPlace[]>;
}): PlannedDay[] {
  const days: PlannedDay[] = [];
  let dayIndex = 0;
  input.stops.forEach((stop, stopIndex) => {
    const count = Math.max(1, input.allocations[stop.id] ?? 1);
    const selectedNames = new Set(input.picks[stop.id] ?? []);
    const selectedPlaces = (input.places[stop.id] ?? []).filter((place) => selectedNames.has(place.title));
    const nearbyRealPlaces = (input.places[stop.id] ?? []).filter((place) => !selectedNames.has(place.title));
    const previous: PlannerStop | { name: string; coordinates?: [number, number] } = stopIndex
      ? input.stops[stopIndex - 1]
      : { name: input.origin, coordinates: input.originCoordinates };
    const arrivalLeg = estimateLeg(previous, stop);
    const experienceDays = pairs(selectedPlaces);

    for (let localDay = 0; localDay < count; localDay += 1) {
      const number = dayIndex + 1;
      const base = { number: pad(number), date: dateAt(input.startDate, dayIndex), destination: stop.name };
      if (localDay === 0) {
        days.push({
          ...base,
          type: "arrival",
          title: stopIndex === 0 ? `Arrive in ${stop.name}` : `Travel to ${stop.name}`,
          reason: "A protected arrival day gives the route room for the transfer, check-in and a first feel for the place.",
          items: [arrivalLeg.label, arrivalLeg.durationMinutes ? `Estimated door-to-door: about ${Math.floor(arrivalLeg.durationMinutes / 60)}h ${arrivalLeg.durationMinutes % 60}m` : arrivalLeg.note, "Check in, walk one nearby area and keep dinner easy"],
          coordinates: stop.coordinates,
          travel: arrivalLeg,
        });
      } else {
        const group = experienceDays[localDay - 1];
        if (group?.length) {
          const primary = group[0];
          const names = group.map((place) => place.title);
          days.push({
            ...base,
            type: "activity",
            title: group.length > 1 ? `${primary.title} + nearby time` : primary.title,
            reason: group.length > 1
              ? `These two selected places are planned as one focused day, rather than a scattered checklist across ${stop.name}.`
              : `Built around ${primary.title}; the rest of the day stays close to ${primary.area}.`,
            items: [
              ...names,
              ...group.map((place) => place.description),
              primary.type.toLowerCase().includes("heritage") || primary.type.toLowerCase().includes("museum") ? "Check opening hours and timed-entry requirements before booking." : "Leave the final part of the day open for a local meal or a nearby walk.",
            ],
            placeTitle: primary.title,
            coordinates: primary.coordinates ?? stop.coordinates,
          });
        } else if (nearbyRealPlaces.length) {
          const place = nearbyRealPlaces[(localDay - 1 - experienceDays.length) % nearbyRealPlaces.length];
          days.push({
            ...base,
            type: "activity",
            title: `Explore ${stop.name}`,
            reason: `A flexible day built around a real nearby option, without committing you to another long transfer.`,
            items: [place.title, place.description, "Keep the rest of the day in the same area."],
            placeTitle: place.title,
            coordinates: place.coordinates ?? stop.coordinates,
          });
        } else {
          days.push({ ...base, ...fallbackDay(stop, localDay - 1), coordinates: stop.coordinates });
        }
      }
      dayIndex += 1;
    }
  });
  return days;
}

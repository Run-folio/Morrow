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

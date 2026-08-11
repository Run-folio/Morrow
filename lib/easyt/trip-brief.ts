export type ParsedTripBrief = {
  origin?: string;
  destination?: string;
  stops: string[];
  routeHints: string[];
  anchor?: string;
  durationDays?: number;
};

type Place = { name: string; terms: string[] };

const places: Place[] = [
  { name: "London", terms: ["london", "lhr", "lgw"] },
  { name: "Tokyo", terms: ["tokyo", "hnd", "nrt", "tokyo marathon"] },
  { name: "Kyoto", terms: ["kyoto"] }, { name: "Osaka", terms: ["osaka", "kix"] },
  { name: "Kanazawa", terms: ["kanazawa"] }, { name: "Takayama", terms: ["takayama"] },
  { name: "Hiroshima", terms: ["hiroshima"] }, { name: "Hong Kong", terms: ["hong kong", "hkg"] },
  { name: "Chengdu", terms: ["chengdu", "ctu"] }, { name: "Zhangjiajie", terms: ["zhangjiajie", "dyg"] },
  { name: "Beijing", terms: ["beijing", "pek", "pkx", "great wall"] },
  { name: "Shanghai", terms: ["shanghai", "pvg", "sha"] }, { name: "Xi'an", terms: ["xi'an", "xian"] },
  { name: "Hanoi", terms: ["hanoi", "han"] }, { name: "Ho Chi Minh City", terms: ["ho chi minh", "saigon", "sgn"] },
  { name: "Siem Reap", terms: ["siem reap", "angkor wat", "angkor"] }, { name: "Bangkok", terms: ["bangkok", "bkk"] },
  { name: "Chiang Mai", terms: ["chiang mai"] }, { name: "Luang Prabang", terms: ["luang prabang"] },
  { name: "Taipei", terms: ["taipei", "tpe"] }, { name: "Tainan", terms: ["tainan"] },
  { name: "Lima", terms: ["lima", "lim"] }, { name: "Cusco", terms: ["cusco", "cuz", "machu picchu", "inca trail"] },
  { name: "La Paz", terms: ["la paz", "lpb"] }, { name: "Quito", terms: ["quito", "uio"] },
  { name: "Medellín", terms: ["medellin", "medellín"] }, { name: "Bogotá", terms: ["bogota", "bogotá"] },
  { name: "Santiago", terms: ["santiago", "scl"] }, { name: "Buenos Aires", terms: ["buenos aires", "eze"] },
  { name: "Lisbon", terms: ["lisbon", "lisboa", "lis"] }, { name: "Porto", terms: ["porto", "opo"] },
  { name: "Barcelona", terms: ["barcelona", "bcn", "sagrada familia"] }, { name: "Madrid", terms: ["madrid", "mad"] },
  { name: "Rome", terms: ["rome", "roma", "fco"] }, { name: "Venice", terms: ["venice", "venezia", "vce"] },
  { name: "Milan", terms: ["milan", "milano", "mxp"] }, { name: "Paris", terms: ["paris", "cdg", "ory"] },
  { name: "Istanbul", terms: ["istanbul", "ist"] }, { name: "Marrakech", terms: ["marrakech", "marrakesh", "rak"] },
  { name: "Reykjavík", terms: ["reykjavik", "reykjavík", "kef"] }, { name: "Cape Town", terms: ["cape town", "cpt"] },
  { name: "Nairobi", terms: ["nairobi", "nbo"] }, { name: "Moshi", terms: ["moshi", "kilimanjaro", "jro"] },
  { name: "Kathmandu", terms: ["kathmandu", "everest base camp"] }, { name: "Agra", terms: ["agra", "taj mahal"] },
];

const normalise = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const indexOfTerm = (text: string, term: string) => text.indexOf(normalise(term));

function findPlaces(value: string) {
  const text = normalise(value);
  return places
    .map((place) => ({ place, position: Math.min(...place.terms.map((term) => indexOfTerm(text, term)).filter((position) => position >= 0)) }))
    .filter((match) => Number.isFinite(match.position))
    .sort((a, b) => a.position - b.position)
    .map((match) => match.place.name)
    .filter((name, index, all) => all.indexOf(name) === index);
}

function findDurationDays(value: string) {
  const text = normalise(value);
  const numeric = text.match(/\b(\d{1,2})\s*(days?|dias?|weeks?|semanas?)\b/);
  if (numeric) return Number(numeric[1]) * (/week|semana/.test(numeric[2]) ? 7 : 1);
  if (/\b(one|a|una)\s+week\b|\buna semana\b/.test(text)) return 7;
  if (/\b(two|dos)\s+weeks?\b|\bdos semanas\b/.test(text)) return 14;
  if (/\bthree\s+weeks?\b|\btres semanas\b/.test(text)) return 21;
  return undefined;
}

function findRouteHints(value: string) {
  const text = normalise(value);
  const hints: string[] = [];
  // These are deliberately route preferences rather than invented stops. A
  // traveller asking for "north and south Japan" has not yet chosen Sapporo
  // or Fukuoka, but that intent should still influence the next suggestions.
  const mentionsJapan = /\bjapan\b/.test(text);
  const wantsNorth = /\b(north(?:ern)?|norte)\b/.test(text);
  const wantsSouth = /\b(south(?:ern)?|sur)\b/.test(text);
  if (mentionsJapan && wantsNorth) hints.push("north-japan");
  if (mentionsJapan && wantsSouth) hints.push("south-japan");
  return hints;
}

function resolveMention(mention?: string) {
  if (!mention) return undefined;
  const known = findPlaces(mention)[0];
  if (known) return known;

  // Keep a clear airport code or capitalised place name for the existing
  // geocoder to verify. This lets the brief work beyond the curated route list
  // without treating arbitrary prose as a destination.
  const airportCode = mention.match(/\b([A-Z]{3})\b/)?.[1];
  if (airportCode) return airportCode;
  return mention.match(/^\s*([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,3})/u)?.[1];
}

export function parseTripBrief(value: string): ParsedTripBrief {
  const text = normalise(value);
  const matchedPlaces = findPlaces(value);
  const fromMatch = value.match(/(?:from|leaving from|depart(?:ing)? from|fly(?:ing)? from|desde|saliendo de)\s+([^,.\n;]+)/i);
  const toMatch = value.match(/(?:finish(?:ing)? (?:in|at)|end(?:ing)? (?:in|at)|fly home from|return(?:ing)? from|home from|terminar (?:en|por)|volver desde)\s+([^,.\n;]+)/i);
  const origin = resolveMention(fromMatch?.[1]);
  const destination = resolveMention(toMatch?.[1]) ?? matchedPlaces.at(-1);
  const anchor = matchedPlaces.find((name) => /marathon|machu picchu|angkor|great wall|kilimanjaro|everest|taj mahal|sagrada familia/.test(text) && places.find((place) => place.name === name)?.terms.some((term) => text.includes(normalise(term))));
  return {
    origin,
    destination: destination === origin && matchedPlaces.length > 1 ? matchedPlaces.at(-1) : destination,
    stops: matchedPlaces.filter((name) => name !== origin),
    routeHints: findRouteHints(value),
    anchor,
    durationDays: findDurationDays(value),
  };
}

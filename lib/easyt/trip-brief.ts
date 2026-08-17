export type ParsedTripBrief = {
  origin?: string;
  destination?: string;
  stops: string[];
  regions: string[];
  routeHints: string[];
  anchor?: string;
  durationDays?: number;
  travellerCount?: number;
  transportModes?: Array<"flight" | "train" | "drive">;
  avoidDriving?: boolean;
  pace?: "relaxed" | "balanced" | "packed";
};

type Place = { name: string; terms: string[] };

const places: Place[] = [
  // Countries are valid trip intent, not failed city searches. Keeping them
  // as structured stops means "Spain, Japan and China" survives the handoff
  // and can be refined into cities later rather than silently disappearing.
  { name: "Spain", terms: ["spain", "espana", "españa"] },
  { name: "Japan", terms: ["japan", "japón", "japon"] },
  { name: "South Korea", terms: ["south korea", "korea", "corea del sur"] },
  { name: "China", terms: ["china"] },
  { name: "Portugal", terms: ["portugal"] }, { name: "France", terms: ["france", "francia"] },
  { name: "Italy", terms: ["italy", "italia"] }, { name: "Vietnam", terms: ["vietnam", "việt nam"] },
  { name: "Thailand", terms: ["thailand", "tailandia"] }, { name: "Cambodia", terms: ["cambodia", "camboya"] },
  { name: "Peru", terms: ["peru", "perú"] }, { name: "Bolivia", terms: ["bolivia"] },
  { name: "London", terms: ["london", "londres", "lhr", "lgw"] },
  { name: "Tokyo", terms: ["tokyo", "tokio", "hnd", "nrt", "tokyo marathon"] },
  { name: "Seoul", terms: ["seoul", "seúl", "sel", "icn"] }, { name: "Busan", terms: ["busan", "pusan"] },
  { name: "Kyoto", terms: ["kyoto", "kioto"] }, { name: "Osaka", terms: ["osaka", "kix"] },
  { name: "Kanazawa", terms: ["kanazawa"] }, { name: "Takayama", terms: ["takayama"] },
  { name: "Hiroshima", terms: ["hiroshima"] }, { name: "Hong Kong", terms: ["hong kong", "hkg"] },
  { name: "Chengdu", terms: ["chengdu", "ctu"] }, { name: "Zhangjiajie", terms: ["zhangjiajie", "dyg"] },
  { name: "Beijing", terms: ["beijing", "pek", "pkx", "great wall"] },
  { name: "Shanghai", terms: ["shanghai", "pvg", "sha"] }, { name: "Xi'an", terms: ["xi'an", "xian"] },
  { name: "Hanoi", terms: ["hanoi", "han"] }, { name: "Hoi An", terms: ["hoi an", "hội an"] }, { name: "Ho Chi Minh City", terms: ["ho chi minh", "saigon", "sgn"] },
  { name: "Angkor Wat", terms: ["angkor wat", "angkor", "ankor wat", "ankor"] }, { name: "Siem Reap", terms: ["siem reap"] }, { name: "Bangkok", terms: ["bangkok", "bkk"] },
  { name: "Chiang Mai", terms: ["chiang mai"] }, { name: "Krabi", terms: ["krabi"] }, { name: "Luang Prabang", terms: ["luang prabang"] }, { name: "Vang Vieng", terms: ["vang vieng"] },
  { name: "Taipei", terms: ["taipei", "tpe"] }, { name: "Tainan", terms: ["tainan"] },
  { name: "Lima", terms: ["lima", "lim"] }, { name: "Cusco", terms: ["cusco", "cuz", "inca trail"] }, { name: "Machu Picchu", terms: ["machu picchu"] },
  { name: "La Paz", terms: ["la paz", "lpb"] }, { name: "Quito", terms: ["quito", "uio"] },
  { name: "Medellín", terms: ["medellin", "medellín"] }, { name: "Bogotá", terms: ["bogota", "bogotá"] },
  { name: "Santiago", terms: ["santiago", "scl"] }, { name: "Buenos Aires", terms: ["buenos aires", "eze"] },
  { name: "Lisbon", terms: ["lisbon", "lisboa", "lis"] }, { name: "Porto", terms: ["porto", "oporto", "opo"] },
  { name: "Barcelona", terms: ["barcelona", "bcn", "sagrada familia"] }, { name: "Madrid", terms: ["madrid", "mad"] },
  { name: "Rome", terms: ["rome", "roma", "fco"] }, { name: "Venice", terms: ["venice", "venezia", "venecia", "vce"] },
  { name: "Milan", terms: ["milan", "milano", "mxp"] }, { name: "Paris", terms: ["paris", "cdg", "ory"] },
  { name: "Istanbul", terms: ["istanbul", "estambul", "ist"] }, { name: "Marrakech", terms: ["marrakech", "marrakesh", "rak"] },
  { name: "Reykjavík", terms: ["reykjavik", "reykjavík", "kef"] }, { name: "Cape Town", terms: ["cape town", "cpt"] },
  { name: "Nairobi", terms: ["nairobi", "nbo"] }, { name: "Moshi", terms: ["moshi", "kilimanjaro", "jro"] },
  { name: "Kathmandu", terms: ["kathmandu", "everest base camp"] }, { name: "Agra", terms: ["agra", "taj mahal"] },
];

const normalise = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function indexOfTerm(text: string, term: string) {
  const escaped = normalise(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").exec(text);
  return match ? match.index + match[0].length - normalise(term).length : -1;
}

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
  const numeric = text.match(/\b(\d{1,2})\s*[- ]?\s*(days?|dias?|weeks?|semanas?)\b/);
  if (numeric) return Number(numeric[1]) * (/week|semana/.test(numeric[2]) ? 7 : 1);
  if (/\b(?:a\s+)?fortnight\b/.test(text)) return 14;
  if (/\b(one|a|una)\s+week\b|\buna semana\b/.test(text)) return 7;
  if (/\b(two|dos)\s+weeks?\b|\bdos semanas\b/.test(text)) return 14;
  if (/\bthree\s+weeks?\b|\btres semanas\b/.test(text)) return 21;
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, "twenty-one": 21,
    un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  };
  const wordDuration = text.match(/\b([a-záéíóú]+(?:-[a-záéíóú]+)?)\s+(days?|dias?|weeks?|semanas?)\b/);
  if (wordDuration && words[wordDuration[1]]) return words[wordDuration[1]] * (/week|semana/.test(wordDuration[2]) ? 7 : 1);
  return undefined;
}

function findTripPreferences(value: string): Pick<ParsedTripBrief, "travellerCount" | "transportModes" | "avoidDriving" | "pace"> {
  const text = normalise(value);
  const transportModes: Array<"flight" | "train" | "drive"> = [];
  if (/\b(train|trains|rail|railway|tren(?:es)?)\b/.test(text)) transportModes.push("train");
  if (/\b(driv(?:e|ing)|road trip|car|coche|conducir)\b/.test(text)) transportModes.push("drive");
  if (/\b(fly|flight|flights|air|vuelo(?:s)?)\b/.test(text)) transportModes.push("flight");
  const avoidDriving = /\b(avoid|no|without|sin|evitar)\s+(?:a\s+)?(?:driv(?:ing)?|car|coche|conducir)\b/.test(text);
  const pace = /\b(relaxed|slow|slowly|without rushing|unhurried|tranquil[oa]?|sin prisa)\b/.test(text)
    ? "relaxed"
    : /\b(packed|fast-paced|intense|intenso)\b/.test(text) ? "packed" : undefined;
  const travellerCount = text.match(/\b(\d{1,2})\s+(?:travellers?|travelers?|people|personas?)\b/)?.[1]
    ?? (/\b(?:a couple|couple|two of us|dos personas)\b/.test(text) ? "2" : undefined);
  return { transportModes, avoidDriving, pace, travellerCount: travellerCount ? Number(travellerCount) : undefined };
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

function findRegions(value: string) {
  const text = normalise(value);
  const regions = [
    { name: "Southeast Asia", terms: ["southeast asia", "south east asia", "asia sudoriental", "sudeste asiatico", "sudeste asiático"] },
    { name: "Japanese Alps", terms: ["japanese alps", "alpes japoneses"] },
  ];
  return regions.filter((region) => region.terms.some((term) => text.includes(term))).map((region) => region.name);
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
  const fromMatch = value.match(/(?:from|leaving from|depart(?:ing)? from|fly(?:ing)? from|desde|saliendo de)\s+([^,.\n;]+?)(?=\s+(?:to|through|via|a|hasta|por)\s+|[,.;\n]|$)/i);
  const toMatch = value.match(/(?:\bto|finish(?:ing)? (?:in|at)|end(?:ing)? (?:in|at)|fly home from|return(?:ing)? from|home from|terminar (?:en|por)|volver desde|\ba|hasta)\s+([^,.\n;]+)/i);
  // A departure is only an origin when the traveller has actually stated a
  // departure phrase. Country-level destinations must never be promoted to
  // an origin simply because they appear first in an open-ended brief.
  const origin = resolveMention(fromMatch?.[1]);
  const destination = resolveMention(toMatch?.[1]) ?? matchedPlaces.at(-1);
  const anchor = matchedPlaces.find((name) => /marathon|machu picchu|angkor|great wall|kilimanjaro|everest|taj mahal|sagrada familia/.test(text) && places.find((place) => place.name === name)?.terms.some((term) => text.includes(normalise(term))));
  const preferences = findTripPreferences(value);
  return {
    origin,
    destination: destination === origin && matchedPlaces.length > 1 ? matchedPlaces.at(-1) : destination,
    stops: matchedPlaces.filter((name) => name !== origin),
    regions: findRegions(value),
    routeHints: findRouteHints(value),
    anchor,
    durationDays: findDurationDays(value),
    ...preferences,
  };
}

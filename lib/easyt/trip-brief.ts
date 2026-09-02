import {
  resolvePlaceMentions,
  type PlaceIntelligenceResult,
  type ResolvedPlaceMention,
} from "./place-intelligence.ts";

export type ParsedTripBrief = {
  origin?: string;
  destination?: string;
  stops: string[];
  /** Countries explicitly named by the traveller, even when cities supersede them as route stops. */
  countries: string[];
  regions: string[];
  routeHints: string[];
  anchor?: string;
  durationDays?: number;
  travellerCount?: number;
  transportModes?: Array<"flight" | "train" | "drive">;
  avoidDriving?: boolean;
  pace?: "relaxed" | "balanced" | "packed";
};

const normalise = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const unique = <T>(values: T[], key: (value: T) => string) => values.filter((value, index, all) => all.findIndex((other) => key(other) === key(value)) === index);

function findDurationDays(value: string) {
  const text = normalise(value);
  const numeric = text.match(/\b(\d{1,2})\s*[- ]?\s*(days?|dias?|weeks?|wks?\.?|semanas?)\b/);
  if (numeric) return Number(numeric[1]) * (/week|wk|semana/.test(numeric[2]) ? 7 : 1);
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
  const avoidDriving = /\b(?:avoid|no|without|sin|evitar|do not want to|dont want to|don't want to)\s*(?:to\s+)?(?:driv(?:e|ing)|car|coche|conducir)\b/.test(text);
  const pace = /\b(relaxed|slow|slowly|without rushing|unhurried|tranquil[oa]?|sin prisa)\b/.test(text)
    ? "relaxed"
    : /\b(packed|fast-paced|intense|intenso)\b/.test(text) ? "packed" : undefined;
  const travellerWords: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", un: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6" };
  const wordTravellerCount = text.match(/\b(one|two|three|four|five|six|un|una|dos|tres|cuatro|cinco|seis)\s+(?:travellers?|travelers?|people|personas?)\b/)?.[1];
  const travellerCount = text.match(/\b(\d{1,2})\s+(?:travellers?|travelers?|people|personas?)\b/)?.[1]
    ?? (wordTravellerCount ? travellerWords[wordTravellerCount] : undefined)
    ?? (/\b(?:a couple|couple|two of us|dos personas)\b/.test(text) ? "2" : undefined);
  return { transportModes, avoidDriving, pace, travellerCount: travellerCount ? Number(travellerCount) : undefined };
}

function findRouteHints(value: string) {
  const text = normalise(value);
  const hints: string[] = [];
  // These remain route preferences rather than invented stops. A traveller
  // asking for north and south Japan has not selected Sapporo or Fukuoka.
  const mentionsJapan = /\bjapan\b/.test(text);
  if (mentionsJapan && /\b(north(?:ern)?|norte)\b/.test(text)) hints.push("north-japan");
  if (mentionsJapan && /\b(south(?:ern)?|sur)\b/.test(text)) hints.push("south-japan");
  return hints;
}

function activeResolvedMentions(result: PlaceIntelligenceResult) {
  return result.mentions.filter((mention) => mention.role !== "excluded"
    && (mention.status === "resolved" || mention.status === "partially_resolved"));
}

function legacyDestinationMention(mention: ResolvedPlaceMention) {
  return mention.routability === "direct_destination"
    || mention.routability === "anchor_or_poi"
    || mention.placeType === "country";
}

function removeRedundantCountryStops(mentions: ResolvedPlaceMention[]) {
  return mentions.filter((mention) => mention.placeType !== "country" || !mentions.some((other) => other !== mention
    && other.placeType !== "country"
    && other.parentCountries.some((country) => normalise(country) === normalise(mention.canonicalName))));
}

/**
 * Compatibility parser for the existing builder preference fields. Place
 * identity comes exclusively from Place Intelligence; callers may supply the
 * already-resolved result so a prompt is interpreted only once.
 */
export function parseTripBrief(value: string, suppliedPlaces?: PlaceIntelligenceResult): ParsedTripBrief {
  const placeResult = suppliedPlaces ?? resolvePlaceMentions(value);
  const active = activeResolvedMentions(placeResult);
  const originMention = active.find((mention) => mention.role === "origin" || mention.role === "fixed_start");
  const destinationMentions = removeRedundantCountryStops(active.filter((mention) => legacyDestinationMention(mention)
    && !["origin", "fixed_start", "fixed_end"].includes(mention.role)));
  const origin = originMention?.canonicalName;
  const stops = unique(
    destinationMentions.filter((mention) => mention.canonicalPlaceId !== originMention?.canonicalPlaceId).map((mention) => mention.canonicalName),
    normalise,
  );
  const regionMentions = active.filter((mention) => mention.placeType !== "country"
    && (mention.routability === "planning_area" || mention.routability === "needs_base_selection"));
  const countries = unique(active.filter((mention) => mention.placeType === "country").map((mention) => mention.canonicalName), normalise);
  const anchor = active.find((mention) => mention.role === "anchor" || mention.routability === "anchor_or_poi")?.canonicalName;
  const preferences = findTripPreferences(value);
  return {
    origin,
    destination: destinationMentions.at(-1)?.canonicalName ?? active.at(-1)?.canonicalName,
    stops,
    countries,
    regions: unique(regionMentions.map((mention) => mention.canonicalName), normalise),
    routeHints: findRouteHints(value),
    anchor,
    durationDays: findDurationDays(value),
    ...preferences,
  };
}

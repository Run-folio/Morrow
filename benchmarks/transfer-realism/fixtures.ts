import type { TripTransferMode } from "../../lib/easyt/trip.ts";

export type TransferBenchmarkRegion =
  | "europe"
  | "east-asia"
  | "southeast-asia"
  | "south-asia"
  | "north-america"
  | "latin-america"
  | "africa"
  | "oceania";

export type TransferBenchmarkCategory =
  | "normal-road"
  | "strong-rail"
  | "normal-flight"
  | "gateway-mixed"
  | "road-vs-rail"
  | "road-vs-flight"
  | "rail-vs-flight"
  | "cross-border-terrestrial"
  | "island-water"
  | "remote-destination"
  | "ambiguous-unsupported";

export type TransferBenchmarkPlace = {
  canonicalId: string;
  name: string;
  country: string;
  coordinates: [number, number];
};

export type TransferBenchmarkProviderRoute = {
  fromCanonicalId: string;
  toCanonicalId: string;
  distanceKm: number;
  durationMinutes: number;
};

export type TransferRealismFixture = {
  id: string;
  region: TransferBenchmarkRegion;
  categories: readonly TransferBenchmarkCategory[];
  origin: TransferBenchmarkPlace;
  destination: TransferBenchmarkPlace;
  preferredMode: TripTransferMode;
  acceptableModes: readonly TripTransferMode[];
  unacceptableModes: readonly TripTransferMode[];
  approximateDurationRange?: { minMinutes: number; maxMinutes: number };
  expectedGateway?: string;
  expectedMixed?: boolean;
  providerRoutes?: readonly TransferBenchmarkProviderRoute[];
  providerOutcome?: "no-route";
  maximumProviderCalls: number;
  exactTransferFixture?: { mode: "ferry"; planningMinutes: number; note: string };
  rationale: string;
};

const benchmarkModes: readonly TripTransferMode[] = ["road", "train", "flight", "ferry", "mixed", "unknown", "walk"];

function place(canonicalId: string, name: string, country: string, coordinates: [number, number]): TransferBenchmarkPlace {
  return { canonicalId, name, country, coordinates };
}

function fixture(input: Omit<TransferRealismFixture, "acceptableModes" | "unacceptableModes"> & {
  acceptableModes?: readonly TripTransferMode[];
}): TransferRealismFixture {
  const acceptableModes = [...new Set(input.acceptableModes ?? [input.preferredMode])];
  return {
    ...input,
    acceptableModes,
    unacceptableModes: benchmarkModes.filter((mode) => !acceptableModes.includes(mode)),
  };
}

/**
 * Human-reviewed expectations deliberately span both current knowledge and open-world gaps.
 * Provider routes are deterministic substitutes for ORS responses, not production transfer facts.
 */
export const TRANSFER_REALISM_FIXTURES: readonly TransferRealismFixture[] = [
  fixture({
    id: "huacachina-lima-road", region: "latin-america", categories: ["normal-road", "remote-destination"],
    origin: place("huacachina", "Huacachina", "Peru", [-75.768, -14.088]),
    destination: place("lima", "Lima", "Peru", [-77.0428, -12.0464]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 210, maxMinutes: 360 },
    providerRoutes: [{ fromCanonicalId: "huacachina", toCanonicalId: "lima", distanceKm: 305, durationMinutes: 255 }], maximumProviderCalls: 1,
    rationale: "Huacachina has no practical passenger-air endpoint; the normal journey to Lima is an overland transfer.",
  }),
  fixture({
    id: "edinburgh-st-andrews-road", region: "europe", categories: ["normal-road", "road-vs-rail"],
    origin: place("edinburgh", "Edinburgh", "United Kingdom", [-3.1883, 55.9533]),
    destination: place("st-andrews", "St Andrews", "United Kingdom", [-2.7967, 56.3398]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 60, maxMinutes: 140 },
    providerRoutes: [{ fromCanonicalId: "edinburgh", toCanonicalId: "st-andrews", distanceKm: 68, durationMinutes: 90 }], maximumProviderCalls: 1,
    rationale: "A direct road or coach journey is the useful canonical abstraction because St Andrews has no rail station.",
  }),
  fixture({
    id: "mendoza-san-rafael-road", region: "latin-america", categories: ["normal-road", "road-vs-rail"],
    origin: place("mendoza", "Mendoza", "Argentina", [-68.8458, -32.8895]),
    destination: place("san-rafael", "San Rafael", "Argentina", [-68.3301, -34.6177]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 180, maxMinutes: 330 },
    providerRoutes: [{ fromCanonicalId: "mendoza", toCanonicalId: "san-rafael", distanceKm: 235, durationMinutes: 210 }], maximumProviderCalls: 1,
    rationale: "This is a normal regional overland leg; inferred intercity rail would be misleading.",
  }),
  fixture({
    id: "los-angeles-san-diego-road", region: "north-america", categories: ["normal-road", "road-vs-flight"],
    origin: place("los-angeles", "Los Angeles", "United States", [-118.2437, 34.0522]),
    destination: place("san-diego", "San Diego", "United States", [-117.1611, 32.7157]),
    preferredMode: "road", acceptableModes: ["road", "train"], approximateDurationRange: { minMinutes: 110, maxMinutes: 260 },
    providerRoutes: [{ fromCanonicalId: "los-angeles", toCanonicalId: "san-diego", distanceKm: 195, durationMinutes: 150 }], maximumProviderCalls: 1,
    rationale: "Road and rail are both sensible; a door-to-door flight recommendation would be excessive for this distance.",
  }),
  fixture({
    id: "auckland-rotorua-road", region: "oceania", categories: ["normal-road", "road-vs-flight"],
    origin: place("auckland", "Auckland", "New Zealand", [174.7633, -36.8485]),
    destination: place("rotorua", "Rotorua", "New Zealand", [176.2497, -38.1368]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 150, maxMinutes: 270 },
    providerRoutes: [{ fromCanonicalId: "auckland", toCanonicalId: "rotorua", distanceKm: 228, durationMinutes: 195 }], maximumProviderCalls: 1,
    rationale: "Ground travel is the normal independent-travel choice; airport overhead makes flying unhelpful.",
  }),
  fixture({
    id: "hiroshima-kyoto-rail", region: "east-asia", categories: ["strong-rail", "road-vs-rail"],
    origin: place("hiroshima", "Hiroshima", "Japan", [132.4553, 34.3853]),
    destination: place("kyoto", "Kyoto", "Japan", [135.7681, 35.0116]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 90, maxMinutes: 210 }, maximumProviderCalls: 0,
    rationale: "Strong national rail connectivity should resolve this without purchasing a road-provider comparison.",
  }),
  fixture({
    id: "london-paris-rail", region: "europe", categories: ["strong-rail", "rail-vs-flight", "cross-border-terrestrial"],
    origin: place("london", "London", "United Kingdom", [-0.1276, 51.5072]),
    destination: place("paris", "Paris", "France", [2.3522, 48.8566]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 180, maxMinutes: 360 }, maximumProviderCalls: 0,
    rationale: "Eurostar is the sensible canonical recommendation after airport overhead; road-only and unknown are unacceptable.",
  }),
  fixture({
    id: "paris-amsterdam-rail", region: "europe", categories: ["strong-rail", "rail-vs-flight", "cross-border-terrestrial"],
    origin: place("paris", "Paris", "France", [2.3522, 48.8566]),
    destination: place("amsterdam", "Amsterdam", "Netherlands", [4.9041, 52.3676]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 180, maxMinutes: 330 }, maximumProviderCalls: 0,
    rationale: "Direct high-speed rail should beat a flight canonical result, but this pair is intentionally outside current exact transfer coverage.",
  }),
  fixture({
    id: "rome-florence-rail", region: "europe", categories: ["strong-rail", "road-vs-rail"],
    origin: place("rome", "Rome", "Italy", [12.4964, 41.9028]),
    destination: place("florence", "Florence", "Italy", [11.2558, 43.7696]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 90, maxMinutes: 180 }, maximumProviderCalls: 0,
    rationale: "Existing exact high-speed rail evidence should remain authoritative.",
  }),
  fixture({
    id: "tokyo-kanazawa-rail", region: "east-asia", categories: ["strong-rail", "rail-vs-flight"],
    origin: place("tokyo", "Tokyo", "Japan", [139.6917, 35.6895]),
    destination: place("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 150, maxMinutes: 270 }, maximumProviderCalls: 0,
    rationale: "The current exact Hokuriku rail allowance provides a non-European strong-rail control.",
  }),
  fixture({
    id: "bologna-florence-rail", region: "europe", categories: ["strong-rail", "road-vs-rail"],
    origin: place("bologna", "Bologna", "Italy", [11.3426, 44.4949]),
    destination: place("florence", "Florence", "Italy", [11.2558, 43.7696]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 45, maxMinutes: 120 }, maximumProviderCalls: 0,
    rationale: "Shared direct national rail evidence should infer rail without an exact pair fact or road call.",
  }),
  fixture({
    id: "madrid-barcelona-rail", region: "europe", categories: ["strong-rail", "rail-vs-flight"],
    origin: place("madrid", "Madrid", "Spain", [-3.7038, 40.4168]),
    destination: place("barcelona", "Barcelona", "Spain", [2.1734, 41.3851]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 150, maxMinutes: 300 }, maximumProviderCalls: 0,
    rationale: "Existing exact high-speed rail evidence should beat airport-based travel.",
  }),
  fixture({
    id: "london-edinburgh-rail", region: "europe", categories: ["strong-rail", "road-vs-rail", "rail-vs-flight"],
    origin: place("london", "London", "United Kingdom", [-0.1276, 51.5072]),
    destination: place("edinburgh", "Edinburgh", "United Kingdom", [-3.1883, 55.9533]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 240, maxMinutes: 480 },
    providerRoutes: [{ fromCanonicalId: "london", toCanonicalId: "edinburgh", distanceKm: 650, durationMinutes: 450 }], maximumProviderCalls: 1,
    rationale: "Rail should normally beat both driving and flying, and intentionally tests missing endpoint connectivity evidence.",
  }),
  fixture({
    id: "lima-new-york-flight", region: "latin-america", categories: ["normal-flight"],
    origin: place("lima", "Lima", "Peru", [-77.0428, -12.0464]),
    destination: place("new-york", "New York", "United States", [-74.006, 40.7128]),
    preferredMode: "flight", approximateDurationRange: { minMinutes: 600, maxMinutes: 900 }, maximumProviderCalls: 0,
    rationale: "A long international intercontinental journey is an unambiguous normal flight case.",
  }),
  fixture({
    id: "perth-sydney-flight", region: "oceania", categories: ["normal-flight"],
    origin: place("perth", "Perth", "Australia", [115.8605, -31.9505]),
    destination: place("sydney", "Sydney", "Australia", [151.2093, -33.8688]),
    preferredMode: "flight", approximateDurationRange: { minMinutes: 360, maxMinutes: 540 }, maximumProviderCalls: 0,
    rationale: "Australia's transcontinental domestic distance makes flying clearly sensible.",
  }),
  fixture({
    id: "delhi-goa-flight", region: "south-asia", categories: ["normal-flight"],
    origin: place("delhi", "Delhi", "India", [77.1025, 28.7041]),
    destination: place("goa", "Goa", "India", [74.124, 15.2993]),
    preferredMode: "flight", approximateDurationRange: { minMinutes: 300, maxMinutes: 480 }, maximumProviderCalls: 0,
    rationale: "This long domestic leg supplies South Asian coverage where a flight is the practical default for a multi-stop trip.",
  }),
  fixture({
    id: "cape-town-nairobi-flight", region: "africa", categories: ["normal-flight"],
    origin: place("cape-town", "Cape Town", "South Africa", [18.4241, -33.9249]),
    destination: place("nairobi", "Nairobi", "Kenya", [36.8219, -1.2921]),
    preferredMode: "flight", approximateDurationRange: { minMinutes: 420, maxMinutes: 720 }, maximumProviderCalls: 0,
    rationale: "A long cross-border African journey should not be represented as a generic road transfer.",
  }),
  fixture({
    id: "la-paz-huacachina-mixed", region: "latin-america", categories: ["gateway-mixed", "remote-destination"],
    origin: place("la-paz", "La Paz", "Bolivia", [-68.1193, -16.4897]),
    destination: place("huacachina", "Huacachina", "Peru", [-75.768, -14.088]),
    preferredMode: "mixed", expectedMixed: true, expectedGateway: "lima", approximateDurationRange: { minMinutes: 420, maxMinutes: 720 },
    providerRoutes: [{ fromCanonicalId: "lima", toCanonicalId: "huacachina", distanceKm: 305, durationMinutes: 255 }], maximumProviderCalls: 1,
    rationale: "Huacachina must remain the final endpoint while Lima is exposed as the air gateway and road handoff.",
  }),
  fixture({
    id: "hanoi-hoi-an-mixed", region: "southeast-asia", categories: ["gateway-mixed", "remote-destination"],
    origin: place("hanoi", "Hanoi", "Vietnam", [105.8342, 21.0278]),
    destination: place("hoi-an", "Hoi An", "Vietnam", [108.338, 15.88]),
    preferredMode: "mixed", expectedMixed: true, expectedGateway: "da-nang", approximateDurationRange: { minMinutes: 210, maxMinutes: 480 },
    providerRoutes: [
      { fromCanonicalId: "da-nang", toCanonicalId: "hoi-an", distanceKm: 30, durationMinutes: 45 },
      { fromCanonicalId: "hanoi", toCanonicalId: "hoi-an", distanceKm: 800, durationMinutes: 720 },
    ], maximumProviderCalls: 1,
    rationale: "A domestic flight to Da Nang plus last-mile road access should be composable from existing gateway evidence.",
  }),
  fixture({
    id: "tokyo-hoi-an-mixed", region: "southeast-asia", categories: ["gateway-mixed", "remote-destination"],
    origin: place("tokyo", "Tokyo", "Japan", [139.6917, 35.6895]),
    destination: place("hoi-an", "Hoi An", "Vietnam", [108.338, 15.88]),
    preferredMode: "mixed", expectedMixed: true, expectedGateway: "da-nang", approximateDurationRange: { minMinutes: 480, maxMinutes: 840 },
    providerRoutes: [{ fromCanonicalId: "da-nang", toCanonicalId: "hoi-an", distanceKm: 30, durationMinutes: 45 }], maximumProviderCalls: 1,
    rationale: "An international flight must terminate at Da Nang and compose the final road segment to Hoi An.",
  }),
  fixture({
    id: "da-nang-hoi-an-road", region: "southeast-asia", categories: ["gateway-mixed", "remote-destination", "normal-road"],
    origin: place("da-nang", "Da Nang Airport", "Vietnam", [108.2022, 16.0439]),
    destination: place("hoi-an", "Hoi An", "Vietnam", [108.338, 15.88]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 30, maxMinutes: 90 },
    providerRoutes: [{ fromCanonicalId: "da-nang", toCanonicalId: "hoi-an", distanceKm: 30, durationMinutes: 45 }], maximumProviderCalls: 1,
    rationale: "When the origin is already the gateway airport, only the last-mile road journey should remain.",
  }),
  fixture({
    id: "puebla-oaxaca-road", region: "latin-america", categories: ["normal-road", "road-vs-flight"],
    origin: place("puebla", "Puebla", "Mexico", [-98.2063, 19.0414]),
    destination: place("oaxaca", "Oaxaca", "Mexico", [-96.7266, 17.0732]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 240, maxMinutes: 420 },
    providerRoutes: [{ fromCanonicalId: "puebla", toCanonicalId: "oaxaca", distanceKm: 345, durationMinutes: 300 }], maximumProviderCalls: 1,
    rationale: "This medium-distance regional journey should stay terrestrial rather than triggering a naive flight heuristic.",
  }),
  fixture({
    id: "paris-brussels-rail", region: "europe", categories: ["strong-rail", "cross-border-terrestrial", "rail-vs-flight"],
    origin: place("paris", "Paris", "France", [2.3522, 48.8566]),
    destination: place("brussels", "Brussels", "Belgium", [4.3517, 50.8503]),
    preferredMode: "train", approximateDurationRange: { minMinutes: 90, maxMinutes: 180 }, maximumProviderCalls: 0,
    rationale: "Exact cross-border high-speed rail evidence should prevent flight or unknown output.",
  }),
  fixture({
    id: "salzburg-munich-terrestrial", region: "europe", categories: ["cross-border-terrestrial", "road-vs-flight", "rail-vs-flight"],
    origin: place("salzburg", "Salzburg", "Austria", [13.055, 47.8095]),
    destination: place("munich", "Munich", "Germany", [11.582, 48.1351]),
    preferredMode: "train", acceptableModes: ["train", "road"], approximateDurationRange: { minMinutes: 120, maxMinutes: 300 }, maximumProviderCalls: 0,
    rationale: "A short cross-border terrestrial leg should never become a door-to-door flight merely because countries differ.",
  }),
  fixture({
    id: "wellington-nelson-water-unknown", region: "oceania", categories: ["island-water", "ambiguous-unsupported"],
    origin: place("wellington", "Wellington", "New Zealand", [174.7762, -41.2866]),
    destination: place("nelson", "Nelson", "New Zealand", [173.284, -41.2706]),
    preferredMode: "unknown", providerOutcome: "no-route", maximumProviderCalls: 1,
    rationale: "Straight-line proximity crosses Cook Strait; absent defensible service evidence, unknown is safer than a fabricated road.",
  }),
  fixture({
    id: "santorini-naxos-ferry", region: "europe", categories: ["island-water"],
    origin: place("santorini", "Santorini", "Greece", [25.4615, 36.3932]),
    destination: place("naxos", "Naxos", "Greece", [25.3764, 37.1036]),
    preferredMode: "ferry", approximateDurationRange: { minMinutes: 90, maxMinutes: 240 }, maximumProviderCalls: 0,
    exactTransferFixture: { mode: "ferry", planningMinutes: 150, note: "Deterministic exact ferry evidence fixture; verify the seasonal sailing." },
    rationale: "An exact provider-normalized ferry fact should resolve water travel without allowing a road candidate.",
  }),
  fixture({
    id: "nadi-taveuni-unknown", region: "oceania", categories: ["island-water", "ambiguous-unsupported", "remote-destination"],
    origin: place("nadi", "Nadi", "Fiji", [177.4434, -17.7765]),
    destination: place("taveuni", "Taveuni", "Fiji", [-179.9813, -16.8414]),
    preferredMode: "unknown", acceptableModes: ["unknown", "flight"], providerOutcome: "no-route", maximumProviderCalls: 1,
    rationale: "Flight can be reasonable, but without current air or ferry evidence an honest unknown is preferable to invented road continuity.",
  }),
  fixture({
    id: "zanzibar-airport-nungwi-road", region: "africa", categories: ["gateway-mixed", "island-water", "remote-destination", "normal-road"],
    origin: place("zanzibar-airport", "Zanzibar Airport", "Tanzania", [39.2249, -6.222]),
    destination: place("nungwi", "Nungwi", "Tanzania", [39.2987, -5.7265]),
    preferredMode: "road", approximateDurationRange: { minMinutes: 60, maxMinutes: 120 },
    providerRoutes: [{ fromCanonicalId: "zanzibar-airport", toCanonicalId: "nungwi", distanceKm: 62, durationMinutes: 75 }], maximumProviderCalls: 1,
    rationale: "An island airport can still have valid local road continuity to the final leisure destination.",
  }),
] as const;

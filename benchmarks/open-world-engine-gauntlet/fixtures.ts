import type { PlaceRoutability, PlaceType } from "../../lib/easyt/place-intelligence.ts";
import type { OpenWorldTravelCandidate } from "../../lib/easyt/open-world-place.server.ts";

export type GauntletExpectation = {
  sourceText: string;
  canonicalName?: string;
  country?: string;
  placeType?: PlaceType;
  outcome: "resolved" | "review";
  reason: string;
};

export type GauntletIntentMention = {
  sourceText: string;
  kind: "route-stop" | "anchor" | "planning-area";
};

export type GauntletCandidate = OpenWorldTravelCandidate & {
  source: "atlas" | "mirror";
};

export type OpenWorldGauntletFixture = {
  id: string;
  cohort:
    | "obscure-localities"
    | "repeated-names"
    | "locality-collisions"
    | "provider-duplicates"
    | "attractions"
    | "natural-areas"
    | "typos-and-aliases"
    | "mixed-country"
    | "route-context"
    | "ambiguity-control"
    | "provider-failure"
    | "known-regression";
  prompt: string;
  mentions: GauntletIntentMention[];
  candidates: Record<string, GauntletCandidate[]>;
  expected: GauntletExpectation[];
  duplicateGroups?: Array<{ phrase: string; expectedCount: number; reason: string }>;
};

function candidate(input: {
  source?: GauntletCandidate["source"];
  id: string;
  name: string;
  country: string;
  type: PlaceType;
  coordinates: [number, number];
  score?: number;
  quality?: GauntletCandidate["matchQuality"];
  aliases?: string[];
  region?: string;
  routability?: PlaceRoutability;
  accessPlaceName?: string;
}): GauntletCandidate {
  const direct = input.type === "city" || input.type === "town" || input.type === "transport_gateway";
  const routability = input.routability ?? (direct
    ? "direct_destination"
    : input.type === "landmark"
      ? "anchor_or_poi"
      : input.type === "region" || input.type === "country"
        ? "planning_area"
        : "needs_base_selection");
  return {
    source: input.source ?? "atlas",
    providerId: input.id,
    canonicalName: input.name,
    country: input.country,
    parentCountries: [input.country],
    placeType: input.type,
    coordinates: input.coordinates,
    rankScore: input.score ?? 140,
    matchQuality: input.quality ?? "exact",
    aliases: input.aliases,
    parentRegionId: input.region,
    routability,
    accessPlaceName: input.accessPlaceName,
    normalizationReason: "controlled provider-shaped open-world fixture",
  };
}

const resolved = (sourceText: string, canonicalName: string, country: string, placeType: PlaceType, reason = "provider evidence identifies one route stop"): GauntletExpectation => ({
  sourceText, canonicalName, country, placeType, outcome: "resolved", reason,
});

const review = (sourceText: string, canonicalName: string | undefined, country: string | undefined, placeType: PlaceType | undefined, reason: string): GauntletExpectation => ({
  sourceText, canonicalName, country, placeType, outcome: "review", reason,
});

export const OPEN_WORLD_ENGINE_GAUNTLET: OpenWorldGauntletFixture[] = [
  {
    id: "south-america-known-regression",
    cohort: "known-regression",
    prompt: "cuzco, uyunui, la paz, lima, huacachina, salta",
    mentions: ["cuzco", "uyunui", "la paz", "lima", "huacachina", "salta"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      cusco: [candidate({ id: "node:34659943", name: "Cusco", country: "Peru", type: "city", coordinates: [-71.9675, -13.5319] })],
      uyunui: [
        candidate({ id: "node:795493613", name: "Uyuni", country: "Bolivia", type: "city", coordinates: [-66.8239, -20.4628], score: 148, quality: "alias", aliases: ["uyunui"], region: "Potosí" }),
        candidate({ source: "mirror", id: "N:795493613", name: "Uyuni", country: "Bolivia", type: "town", coordinates: [-66.8241, -20.463], score: 145, quality: "alias", aliases: ["uyunui"], region: "Potosí" }),
      ],
      "la paz": [candidate({ id: "node:369648116", name: "La Paz", country: "Bolivia", type: "city", coordinates: [-68.1193, -16.4897] })],
      lima: [candidate({ id: "relation:1944656", name: "Lima", country: "Peru", type: "city", coordinates: [-77.0428, -12.0464] })],
      huacachina: [
        candidate({ id: "way:1046629515", name: "Huacachina", country: "Peru", type: "town", coordinates: [-75.7618, -14.0876], score: 150, region: "Ica" }),
        candidate({ id: "way:514902469", name: "Huacachina Sunset Hostal", country: "Peru", type: "landmark", coordinates: [-75.763, -14.0885], score: 105, quality: "alias", aliases: ["Huacachina"], region: "Ica" }),
      ],
      salta: [candidate({ id: "node:336455121", name: "Salta", country: "Argentina", type: "city", coordinates: [-65.4232, -24.7821] })],
    },
    expected: [
      resolved("cuzco", "Cusco", "Peru", "city"),
      resolved("uyunui", "Uyuni", "Bolivia", "city", "generic provider fuzzy evidence identifies Uyuni"),
      resolved("la paz", "La Paz", "Bolivia", "city"),
      resolved("lima", "Lima", "Peru", "city"),
      resolved("huacachina", "Huacachina", "Peru", "town", "the exact locality outranks similarly named accommodation"),
      resolved("salta", "Salta", "Argentina", "city"),
    ],
    duplicateGroups: [{ phrase: "uyunui", expectedCount: 1, reason: "the same OSM locality is returned by two providers" }],
  },
  {
    id: "obscure-balkans",
    cohort: "obscure-localities",
    prompt: "Kotor, Theth, Gjirokastër and Ohrid",
    mentions: ["Kotor", "Theth", "Gjirokastër", "Ohrid"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      kotor: [candidate({ id: "node:70248849", name: "Kotor", country: "Montenegro", type: "town", coordinates: [18.7712, 42.4247] })],
      theth: [candidate({ id: "node:1209938334", name: "Theth", country: "Albania", type: "town", coordinates: [19.7746, 42.3952] })],
      gjirokaster: [candidate({ id: "node:290293256", name: "Gjirokastër", country: "Albania", type: "town", coordinates: [20.1389, 40.0758] })],
      ohrid: [candidate({ id: "node:11048072", name: "Ohrid", country: "North Macedonia", type: "town", coordinates: [20.8016, 41.1172] })],
    },
    expected: [resolved("Kotor", "Kotor", "Montenegro", "town"), resolved("Theth", "Theth", "Albania", "town"), resolved("Gjirokastër", "Gjirokastër", "Albania", "town"), resolved("Ohrid", "Ohrid", "North Macedonia", "town")],
  },
  {
    id: "obscure-japan-provider-label-variants",
    cohort: "provider-duplicates",
    prompt: "Kiso Fukushima, Magome, Tsumago and Takayama",
    mentions: ["Kiso Fukushima", "Magome", "Tsumago", "Takayama"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      "kiso fukushima": [
        candidate({ id: "node:41001", name: "Kiso-Fukushima", country: "Japan", type: "town", coordinates: [137.692, 35.842], score: 146, quality: "alias", aliases: ["Kiso Fukushima"], region: "Nagano" }),
        candidate({ source: "mirror", id: "N:41001", name: "Fukushima, Kiso", country: "Japan", type: "town", coordinates: [137.6922, 35.8421], score: 143, quality: "alias", aliases: ["Kiso Fukushima"], region: "Nagano" }),
      ],
      magome: [candidate({ id: "node:41002", name: "Magome", country: "Japan", type: "town", coordinates: [137.568, 35.526] })],
      tsumago: [candidate({ id: "node:41003", name: "Tsumago", country: "Japan", type: "town", coordinates: [137.595, 35.576] })],
      takayama: [candidate({ id: "node:41004", name: "Takayama", country: "Japan", type: "city", coordinates: [137.252, 36.146] })],
    },
    expected: [resolved("Kiso Fukushima", "Kiso-Fukushima", "Japan", "town"), resolved("Magome", "Magome", "Japan", "town"), resolved("Tsumago", "Tsumago", "Japan", "town"), resolved("Takayama", "Takayama", "Japan", "city")],
    duplicateGroups: [{ phrase: "Kiso Fukushima", expectedCount: 1, reason: "one stable OSM identity has provider-specific display labels" }],
  },
  {
    id: "route-context-belize-san-pedro",
    cohort: "route-context",
    prompt: "Belize City, San Pedro and Flores",
    mentions: ["Belize City", "San Pedro", "Flores"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      "belize city": [candidate({ id: "node:51001", name: "Belize City", country: "Belize", type: "city", coordinates: [-88.1976, 17.5046], score: 146 })],
      "san pedro": [
        candidate({ id: "node:51002", name: "San Pedro", country: "Chile", type: "town", coordinates: [-68.2011, -22.9111], score: 154, region: "Antofagasta" }),
        candidate({ id: "node:51003", name: "San Pedro", country: "Belize", type: "town", coordinates: [-87.9659, 17.9214], score: 140, region: "Belize District" }),
      ],
      flores: [candidate({ id: "node:51004", name: "Flores", country: "Guatemala", type: "town", coordinates: [-89.897, 16.929], score: 146 })],
    },
    expected: [resolved("Belize City", "Belize City", "Belize", "city"), resolved("San Pedro", "San Pedro", "Belize", "town", "trusted route coordinates distinguish the Belize locality from the Chile namesake"), resolved("Flores", "Flores", "Guatemala", "city")],
  },
  {
    id: "central-america-two-contextual-names",
    cohort: "repeated-names",
    prompt: "San José, Granada and León",
    mentions: ["San José", "Granada", "León"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      "san jose": [candidate({ id: "node:52001", name: "San José", country: "Costa Rica", type: "city", coordinates: [-84.0907, 9.9281] })],
      granada: [candidate({ id: "node:52002", name: "Granada", country: "Spain", type: "city", coordinates: [-3.5986, 37.1773], score: 151 }), candidate({ id: "node:52003", name: "Granada", country: "Nicaragua", type: "city", coordinates: [-85.956, 11.9344], score: 144 })],
      leon: [candidate({ id: "node:52004", name: "León", country: "Spain", type: "city", coordinates: [-5.5671, 42.5987], score: 150 }), candidate({ id: "node:52005", name: "León", country: "Nicaragua", type: "city", coordinates: [-86.878, 12.4379], score: 144 })],
    },
    expected: [resolved("San José", "San José", "Costa Rica", "city"), resolved("Granada", "Granada", "Nicaragua", "city"), resolved("León", "León", "Nicaragua", "city")],
  },
  {
    id: "locality-and-district-boquete",
    cohort: "locality-collisions",
    prompt: "Panama City, Boquete and David",
    mentions: ["Panama City", "Boquete", "David"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      "panama city": [candidate({ id: "node:53001", name: "Panama City", country: "Panama", type: "city", coordinates: [-79.5199, 8.9824] })],
      boquete: [
        candidate({ id: "node:53002", name: "Bajo Boquete", country: "Panama", type: "town", coordinates: [-82.433, 8.776], score: 148, aliases: ["Boquete"], region: "Chiriquí" }),
        candidate({ source: "mirror", id: "relation:53003", name: "Boquete", country: "Panama", type: "region", coordinates: [-82.44, 8.78], score: 138, region: "Chiriquí", routability: "planning_area" }),
      ],
      david: [candidate({ id: "node:53004", name: "David", country: "Panama", type: "city", coordinates: [-82.431, 8.427] })],
    },
    expected: [resolved("Panama City", "Panama City", "Panama", "city"), resolved("Boquete", "Bajo Boquete", "Panama", "town", "route-stop intent prefers the settlement over its district"), resolved("David", "David", "Panama", "city")],
  },
  {
    id: "landmark-with-explicit-bases",
    cohort: "attractions",
    prompt: "Siem Reap, Angkor Wat and Phnom Penh",
    mentions: [{ sourceText: "Siem Reap", kind: "route-stop" }, { sourceText: "Angkor Wat", kind: "anchor" }, { sourceText: "Phnom Penh", kind: "route-stop" }],
    candidates: {
      "siem reap": [candidate({ id: "node:54001", name: "Siem Reap", country: "Cambodia", type: "city", coordinates: [103.855, 13.363] })],
      "angkor wat": [candidate({ id: "way:54002", name: "Angkor Wat", country: "Cambodia", type: "landmark", coordinates: [103.867, 13.413], accessPlaceName: "Siem Reap" })],
      "phnom penh": [candidate({ id: "node:54003", name: "Phnom Penh", country: "Cambodia", type: "city", coordinates: [104.928, 11.556] })],
    },
    expected: [resolved("Siem Reap", "Siem Reap", "Cambodia", "city"), review("Angkor Wat", "Angkor Wat", "Cambodia", "landmark", "the attraction remains an anchor rather than becoming an overnight city"), resolved("Phnom Penh", "Phnom Penh", "Cambodia", "city")],
  },
  {
    id: "archaeology-outside-base",
    cohort: "attractions",
    prompt: "Amman, Petra, Wadi Rum and Aqaba",
    mentions: [{ sourceText: "Amman", kind: "route-stop" }, { sourceText: "Petra", kind: "anchor" }, { sourceText: "Wadi Rum", kind: "anchor" }, { sourceText: "Aqaba", kind: "route-stop" }],
    candidates: {
      amman: [candidate({ id: "node:55001", name: "Amman", country: "Jordan", type: "city", coordinates: [35.91, 31.953] })],
      petra: [candidate({ id: "relation:55002", name: "Petra", country: "Jordan", type: "landmark", coordinates: [35.444, 30.329], accessPlaceName: "Wadi Musa" })],
      "wadi rum": [candidate({ id: "relation:55003", name: "Wadi Rum", country: "Jordan", type: "natural_area", coordinates: [35.421, 29.576], accessPlaceName: "Wadi Rum Village" })],
      aqaba: [candidate({ id: "node:55004", name: "Aqaba", country: "Jordan", type: "city", coordinates: [35.006, 29.526] })],
    },
    expected: [resolved("Amman", "Amman", "Jordan", "city"), review("Petra", "Petra", "Jordan", "landmark", "the archaeological site requires a visit/base relationship"), review("Wadi Rum", "Wadi Rum", "Jordan", "natural_area", "the protected natural area remains distinct from its access village"), resolved("Aqaba", "Aqaba", "Jordan", "city")],
  },
  {
    id: "patagonia-natural-area",
    cohort: "natural-areas",
    prompt: "El Calafate, Los Glaciares National Park and El Chaltén",
    mentions: [{ sourceText: "El Calafate", kind: "route-stop" }, { sourceText: "Los Glaciares National Park", kind: "anchor" }, { sourceText: "El Chaltén", kind: "route-stop" }],
    candidates: {
      "el calafate": [candidate({ id: "node:56001", name: "El Calafate", country: "Argentina", type: "town", coordinates: [-72.264, -50.338] })],
      "los glaciares national park": [candidate({ id: "relation:56002", name: "Los Glaciares National Park", country: "Argentina", type: "natural_area", coordinates: [-73.1, -50.0] })],
      "el chalten": [candidate({ id: "node:56003", name: "El Chaltén", country: "Argentina", type: "town", coordinates: [-72.886, -49.331] })],
    },
    expected: [resolved("El Calafate", "El Calafate", "Argentina", "town"), review("Los Glaciares National Park", "Los Glaciares National Park", "Argentina", "natural_area", "the national park needs visit/base planning"), resolved("El Chaltén", "El Chaltén", "Argentina", "town")],
  },
  {
    id: "island-and-archipelago",
    cohort: "natural-areas",
    prompt: "Athens, Naxos, Santorini and the Cyclades",
    mentions: [{ sourceText: "Athens", kind: "route-stop" }, { sourceText: "Naxos", kind: "anchor" }, { sourceText: "Santorini", kind: "anchor" }, { sourceText: "the Cyclades", kind: "planning-area" }],
    candidates: {
      athens: [candidate({ id: "node:57001", name: "Athens", country: "Greece", type: "city", coordinates: [23.728, 37.984] })],
      naxos: [candidate({ id: "relation:57002", name: "Naxos", country: "Greece", type: "island", coordinates: [25.47, 37.06] })],
      santorini: [candidate({ id: "relation:57003", name: "Santorini", country: "Greece", type: "island", coordinates: [25.43, 36.4] })],
      "the cyclades": [candidate({ id: "relation:57004", name: "Cyclades", country: "Greece", type: "archipelago", coordinates: [25.1, 37.0] })],
    },
    expected: [resolved("Athens", "Athens", "Greece", "city"), resolved("Naxos", "Naxos", "Greece", "island", "the established island destination is a legitimate canonical trip stop"), resolved("Santorini", "Santorini", "Greece", "island", "the established island destination is a legitimate canonical trip stop"), review("the Cyclades", undefined, undefined, undefined, "the broad archipelago phrase cannot be replaced by one island")],
  },
  {
    id: "generic-regional-intent",
    cohort: "natural-areas",
    prompt: "Mendoza and wine country",
    mentions: [{ sourceText: "Mendoza", kind: "route-stop" }, { sourceText: "wine country", kind: "planning-area" }],
    candidates: {
      mendoza: [candidate({ id: "node:58001", name: "Mendoza", country: "Argentina", type: "city", coordinates: [-68.8458, -32.8895] })],
      "wine country": [candidate({ id: "region:58002", name: "Mendoza wine region", country: "Argentina", type: "region", coordinates: [-68.9, -33.0], quality: "alias", aliases: ["wine country"] })],
    },
    expected: [resolved("Mendoza", "Mendoza", "Argentina", "city"), review("wine country", "wine country", "Argentina", "region", "generic experience wording remains contextual rather than falsely precise")],
  },
  {
    id: "multilingual-aliases",
    cohort: "typos-and-aliases",
    prompt: "Tblisi, Firenze, Venezia and Roma",
    mentions: ["Tblisi", "Firenze", "Venezia", "Roma"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      tblisi: [candidate({ id: "node:59001", name: "Tbilisi", country: "Georgia", type: "city", coordinates: [44.8015, 41.6938], quality: "alias", aliases: ["Tblisi"] })],
      firenze: [candidate({ id: "node:59002", name: "Florence", country: "Italy", type: "city", coordinates: [11.2558, 43.7696], quality: "alias", aliases: ["Firenze"] })],
      venezia: [candidate({ id: "node:59003", name: "Venice", country: "Italy", type: "city", coordinates: [12.3155, 45.4408], quality: "alias", aliases: ["Venezia"] })],
      roma: [candidate({ id: "node:59004", name: "Rome", country: "Italy", type: "city", coordinates: [12.4964, 41.9028], quality: "alias", aliases: ["Roma"] })],
    },
    expected: [resolved("Tblisi", "Tbilisi", "Georgia", "city"), resolved("Firenze", "Florence", "Italy", "city"), resolved("Venezia", "Venice", "Italy", "city"), resolved("Roma", "Rome", "Italy", "city")],
  },
  {
    id: "mixed-disconnected-countries",
    cohort: "mixed-country",
    prompt: "Tbilisi, Muscat and Zanzibar City",
    mentions: ["Tbilisi", "Muscat", "Zanzibar City"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      tbilisi: [candidate({ id: "node:60001", name: "Tbilisi", country: "Georgia", type: "city", coordinates: [44.8015, 41.6938] })],
      muscat: [candidate({ id: "node:60002", name: "Muscat", country: "Oman", type: "city", coordinates: [58.4059, 23.588] })],
      "zanzibar city": [candidate({ id: "node:60003", name: "Zanzibar City", country: "Tanzania", type: "city", coordinates: [39.2083, -6.1659] })],
    },
    expected: [resolved("Tbilisi", "Tbilisi", "Georgia", "city"), resolved("Muscat", "Muscat", "Oman", "city"), resolved("Zanzibar City", "Zanzibar City", "Tanzania", "city")],
  },
  {
    id: "city-region-collision",
    cohort: "repeated-names",
    prompt: "Panama",
    mentions: [{ sourceText: "Panama", kind: "route-stop" }],
    candidates: {
      panama: [
        candidate({ id: "node:61001", name: "Panama", country: "Panama", type: "city", coordinates: [-79.5199, 8.9824], score: 145 }),
        candidate({ id: "relation:61002", name: "Panama", country: "Panama", type: "country", coordinates: [-80.0, 8.5], score: 143, routability: "planning_area" }),
      ],
    },
    expected: [review("Panama", undefined, undefined, undefined, "city-versus-country scope is genuinely ambiguous without stronger wording")],
  },
  {
    id: "springfield-control",
    cohort: "ambiguity-control",
    prompt: "Springfield",
    mentions: [{ sourceText: "Springfield", kind: "route-stop" }],
    candidates: {
      springfield: [candidate({ id: "node:62001", name: "Springfield", country: "United States", type: "city", coordinates: [-89.65, 39.78], score: 145, region: "Illinois" }), candidate({ id: "node:62002", name: "Springfield", country: "United States", type: "city", coordinates: [-72.59, 42.1], score: 144, region: "Massachusetts" })],
    },
    expected: [review("Springfield", undefined, undefined, undefined, "two distinct same-name cities remain equally plausible")],
  },
  {
    id: "cambridge-control",
    cohort: "ambiguity-control",
    prompt: "Cambridge",
    mentions: [{ sourceText: "Cambridge", kind: "route-stop" }],
    candidates: {
      cambridge: [candidate({ id: "node:63001", name: "Cambridge", country: "United Kingdom", type: "city", coordinates: [0.1218, 52.2053], score: 145 }), candidate({ id: "node:63002", name: "Cambridge", country: "United States", type: "city", coordinates: [-71.1097, 42.3736], score: 144 })],
    },
    expected: [review("Cambridge", undefined, undefined, undefined, "the route supplies no country or coordinate context")],
  },
  {
    id: "provider-outage-fails-closed",
    cohort: "provider-failure",
    prompt: "Antananarivo and Andasibe",
    mentions: ["Antananarivo", "Andasibe"].map((sourceText) => ({ sourceText, kind: "route-stop" })),
    candidates: {
      antananarivo: [candidate({ id: "node:64001", name: "Antananarivo", country: "Madagascar", type: "city", coordinates: [47.5079, -18.8792] })],
      andasibe: [],
    },
    expected: [resolved("Antananarivo", "Antananarivo", "Madagascar", "city"), review("Andasibe", undefined, undefined, undefined, "provider failure must retain unknown identity and require confirmation")],
  },
];

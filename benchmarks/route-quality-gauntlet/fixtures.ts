import type { PlannerStop, RoutePlanningConstraints } from "../../lib/easyt/planner.ts";

export type RouteQualityVisit = {
  id: string;
  name: string;
  kind: "attraction" | "national-park" | "monument" | "beach" | "natural-area";
  baseStopId: string;
};

export type RouteQualityFixture = {
  id: string;
  name: string;
  regions: string[];
  structures: string[];
  origin: { name: string; country: string; coordinates: [number, number] };
  stops: Array<PlannerStop & {
    required?: boolean;
    optional?: boolean;
    anchor?: boolean;
    fixedNights?: number;
    fallbackMinimumNights?: number;
    fallbackIdealNights?: number;
  }>;
  visits?: RouteQualityVisit[];
  days: number;
  pace?: "relaxed" | "balanced" | "fast" | "packed";
  constraints?: RoutePlanningConstraints;
  expected: {
    canBuild: boolean;
    fixedStartStopId?: string;
    fixedEndStopId?: string;
    routeShouldImprove?: boolean;
    preserveEnteredOrder?: boolean;
    healthMustNeedReview?: boolean;
    prohibitedModes?: Array<"flight" | "train" | "road" | "ferry" | "walk">;
  };
  assessment: {
    objectiveConcern: string | null;
    knowledgeBoundary: string | null;
    reasonableAlternatives: string | null;
  };
};

const stop = (
  id: string,
  name: string,
  country: string,
  coordinates: [number, number],
  extra: Omit<RouteQualityFixture["stops"][number], keyof PlannerStop> = {},
): RouteQualityFixture["stops"][number] => ({ id, name, country, coordinates, ...extra });

const italy = [
  stop("rome", "Rome", "Italy", [12.4964, 41.9028], { required: true, anchor: true }),
  stop("venice", "Venice", "Italy", [12.3155, 45.4408], { required: true }),
  stop("florence", "Florence", "Italy", [11.2558, 43.7696], { required: true }),
  stop("milan", "Milan", "Italy", [9.19, 45.4642], { required: true }),
];

const japan = [
  stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895], { required: true, anchor: true }),
  stop("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613], { required: true }),
  stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116], { required: true, anchor: true }),
  stop("hiroshima", "Hiroshima", "Japan", [132.4553, 34.3853], { required: true }),
];

export const ROUTE_QUALITY_FIXTURES: RouteQualityFixture[] = [
  {
    id: "linear-italy", name: "Italy linear route removes a north-south reversal", regions: ["Europe"], structures: ["linear", "rail-friendly"],
    origin: { name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] }, stops: italy, days: 14, pace: "balanced",
    constraints: { fixedStartStopId: "rome", requiredStopIds: italy.map((item) => item.id), transportModes: ["train"] },
    expected: { canBuild: true, fixedStartStopId: "rome", routeShouldImprove: true },
    assessment: { objectiveConcern: "Venice before Florence creates avoidable reversal.", knowledgeBoundary: null, reasonableAlternatives: "Venice and Milan may swap depending on the departure gateway." },
  },
  {
    id: "linear-japan", name: "Japan progresses west without reversal", regions: ["Asia"], structures: ["linear", "rail-friendly", "many-stop"],
    origin: { name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] }, stops: japan, days: 16, pace: "relaxed",
    constraints: { fixedStartStopId: "tokyo", requiredStopIds: japan.map((item) => item.id), transportModes: ["train"] },
    expected: { canBuild: true, fixedStartStopId: "tokyo" },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Exact rail services remain outside deterministic routing.", reasonableAlternatives: "Kanazawa can reasonably sit before or after Kyoto depending on chosen services." },
  },
  {
    id: "hub-cusco-machu", name: "Machu Picchu remains a visit from a Cusco-region base", regions: ["South America"], structures: ["hub-and-spoke", "attraction-heavy"],
    origin: { name: "Lima", country: "Peru", coordinates: [-77.0428, -12.0464] },
    stops: [stop("lima", "Lima", "Peru", [-77.0428, -12.0464], { required: true }), stop("cusco", "Cusco", "Peru", [-71.9785, -13.517], { required: true, anchor: true })],
    visits: [{ id: "machu-picchu", name: "Machu Picchu", kind: "monument", baseStopId: "cusco" }], days: 9, pace: "relaxed",
    constraints: { fixedStartStopId: "lima", requiredStopIds: ["lima", "cusco"] }, expected: { canBuild: true, fixedStartStopId: "lima" },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Rail/road access from the selected base needs current verification.", reasonableAlternatives: "A Sacred Valley base could also be reasonable when explicitly selected." },
  },
  {
    id: "hub-siem-reap-angkor", name: "Angkor remains a visit from Siem Reap", regions: ["Asia"], structures: ["hub-and-spoke", "attraction-heavy"],
    origin: { name: "Bangkok", country: "Thailand", coordinates: [100.5018, 13.7563] },
    stops: [stop("bangkok", "Bangkok", "Thailand", [100.5018, 13.7563], { required: true }), stop("siem-reap", "Siem Reap", "Cambodia", [103.8564, 13.3633], { required: true, anchor: true })],
    visits: [{ id: "angkor", name: "Angkor Archaeological Park", kind: "attraction", baseStopId: "siem-reap" }], days: 8,
    constraints: { fixedStartStopId: "bangkok", requiredStopIds: ["bangkok", "siem-reap"] }, expected: { canBuild: true, fixedStartStopId: "bangkok" },
    assessment: { objectiveConcern: null, knowledgeBoundary: "The cross-border connection is a planning estimate, not a live service.", reasonableAlternatives: null },
  },
  {
    id: "outlier-reykjavik", name: "An Iceland outlier remains visible and costly", regions: ["Europe"], structures: ["geographic-outlier", "cross-border"],
    origin: { name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    stops: [...italy.slice(0, 3), stop("reykjavik", "Reykjavik", "Iceland", [-21.9426, 64.1466], { required: true })], days: 12,
    constraints: { fixedStartStopId: "rome", requiredStopIds: ["rome", "venice", "florence", "reykjavik"] },
    expected: { canBuild: true, fixedStartStopId: "rome", healthMustNeedReview: true },
    assessment: { objectiveConcern: "The outlier necessarily consumes a large travel day and should not appear frictionless.", knowledgeBoundary: "Live flight feasibility is not known.", reasonableAlternatives: "Iceland can sensibly come first or last depending on flights." },
  },
  {
    id: "simple-land-border", name: "Close Benelux cities remain a coherent progression", regions: ["Europe"], structures: ["cross-border", "rail-friendly"],
    origin: { name: "Amsterdam", country: "Netherlands", coordinates: [4.9041, 52.3676] },
    stops: [stop("amsterdam", "Amsterdam", "Netherlands", [4.9041, 52.3676], { required: true }), stop("antwerp", "Antwerp", "Belgium", [4.4025, 51.2194], { required: true }), stop("brussels", "Brussels", "Belgium", [4.3517, 50.8503], { required: true }), stop("luxembourg", "Luxembourg City", "Luxembourg", [6.1319, 49.6116], { required: true })],
    days: 9, constraints: { fixedStartStopId: "amsterdam", requiredStopIds: ["amsterdam", "antwerp", "brussels", "luxembourg"], transportModes: ["train"] },
    expected: { canBuild: true, fixedStartStopId: "amsterdam" },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Border friction and timetables still need live checks.", reasonableAlternatives: "Antwerp and Brussels can swap without making the trip objectively poor." },
  },
  {
    id: "multi-border-balkans", name: "A multi-border Balkan route avoids repeated border reversals", regions: ["Europe"], structures: ["cross-border", "many-stop"],
    origin: { name: "Ljubljana", country: "Slovenia", coordinates: [14.5058, 46.0569] },
    stops: [stop("ljubljana", "Ljubljana", "Slovenia", [14.5058, 46.0569], { required: true }), stop("sarajevo", "Sarajevo", "Bosnia and Herzegovina", [18.4131, 43.8563], { required: true }), stop("zagreb", "Zagreb", "Croatia", [15.9819, 45.815], { required: true }), stop("split", "Split", "Croatia", [16.4402, 43.5081], { required: true }), stop("dubrovnik", "Dubrovnik", "Croatia", [18.0944, 42.6507], { required: true })],
    days: 15, constraints: { fixedStartStopId: "ljubljana", fixedEndStopId: "dubrovnik", requiredStopIds: ["ljubljana", "sarajevo", "zagreb", "split", "dubrovnik"] },
    expected: { canBuild: true, fixedStartStopId: "ljubljana", fixedEndStopId: "dubrovnik", routeShouldImprove: true, healthMustNeedReview: true },
    assessment: { objectiveConcern: "The entered Sarajevo-before-Zagreb order needlessly crosses back north.", knowledgeBoundary: "Border queues and road services require current evidence.", reasonableAlternatives: null },
  },
  {
    id: "same-country-distance", name: "Same-country Australian distances are not treated as local", regions: ["Oceania"], structures: ["geographic-outlier", "same-country-distant"],
    origin: { name: "Sydney", country: "Australia", coordinates: [151.2093, -33.8688] },
    stops: [stop("sydney", "Sydney", "Australia", [151.2093, -33.8688], { required: true }), stop("darwin", "Darwin", "Australia", [130.8456, -12.4634], { required: true }), stop("perth", "Perth", "Australia", [115.8605, -31.9505], { required: true })],
    days: 12, constraints: { fixedStartStopId: "sydney", requiredStopIds: ["sydney", "darwin", "perth"] },
    expected: { canBuild: true, fixedStartStopId: "sydney", healthMustNeedReview: true },
    assessment: { objectiveConcern: "National borders do not make continent-scale transfers easy.", knowledgeBoundary: "Exact domestic flights are not deterministic knowledge.", reasonableAlternatives: "Darwin and Perth order depends on the onward gateway." },
  },
  {
    id: "mainland-island-mainland", name: "Greek island loop does not fabricate ferry certainty", regions: ["Europe"], structures: ["island-mainland", "loop"],
    origin: { name: "Athens", country: "Greece", coordinates: [23.7275, 37.9838] },
    stops: [stop("naxos", "Naxos", "Greece", [25.376, 37.1036], { required: true }), stop("santorini", "Santorini", "Greece", [25.4615, 36.3932], { required: true }), stop("athens-end", "Athens", "Greece", [23.7275, 37.9838], { required: true })],
    days: 11, constraints: { fixedEndStopId: "athens-end", requiredStopIds: ["naxos", "santorini", "athens-end"] },
    expected: { canBuild: true, fixedEndStopId: "athens-end", healthMustNeedReview: true },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Coordinates alone cannot prove a ferry service or seasonal timetable.", reasonableAlternatives: "Naxos and Santorini direction depends on actual sailings." },
  },
  {
    id: "multiple-islands", name: "Multiple Hawaiian islands retain transport uncertainty", regions: ["Oceania"], structures: ["multiple-islands"],
    origin: { name: "Honolulu", country: "United States", coordinates: [-157.8583, 21.3069] },
    stops: [stop("oahu", "Honolulu", "United States", [-157.8583, 21.3069], { required: true }), stop("maui", "Maui", "United States", [-156.3319, 20.7984], { required: true }), stop("kauai", "Kauai", "United States", [-159.5261, 22.0964], { required: true })],
    days: 10, constraints: { fixedStartStopId: "oahu", requiredStopIds: ["oahu", "maui", "kauai"] },
    expected: { canBuild: true, fixedStartStopId: "oahu", healthMustNeedReview: true },
    assessment: { objectiveConcern: null, knowledgeBoundary: "The deterministic engine lacks route-specific inter-island inventory.", reasonableAlternatives: "Island order is timetable-dependent." },
  },
  {
    id: "mountain-remote", name: "Remote Georgian mountain bases keep planning uncertainty", regions: ["Asia", "Europe"], structures: ["mountain-remote", "driving"],
    origin: { name: "Tbilisi", country: "Georgia", coordinates: [44.793, 41.7151] },
    stops: [stop("tbilisi", "Tbilisi", "Georgia", [44.793, 41.7151], { required: true }), stop("kazbegi", "Stepantsminda", "Georgia", [44.6433, 42.6566], { required: true }), stop("mestia", "Mestia", "Georgia", [42.7278, 43.0458], { required: true }), stop("ushguli", "Ushguli", "Georgia", [43.0068, 42.9167], { required: true, anchor: true })],
    days: 13, pace: "relaxed", constraints: { fixedStartStopId: "tbilisi", requiredStopIds: ["tbilisi", "kazbegi", "mestia", "ushguli"], transportModes: ["drive"] },
    expected: { canBuild: true, fixedStartStopId: "tbilisi", healthMustNeedReview: true },
    assessment: { objectiveConcern: "Straight-line distance understates mountain-road variability.", knowledgeBoundary: "Seasonal access and exact road times require external data.", reasonableAlternatives: "Mestia and Ushguli can be base/visit rather than separate stays depending on conditions." },
  },
  {
    id: "rail-no-driving", name: "Rail preference never silently becomes driving", regions: ["Europe"], structures: ["rail-friendly", "transport-constraint"],
    origin: { name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
    stops: [stop("paris", "Paris", "France", [2.3522, 48.8566], { required: true }), stop("brussels", "Brussels", "Belgium", [4.3517, 50.8503], { required: true }), stop("amsterdam", "Amsterdam", "Netherlands", [4.9041, 52.3676], { required: true })],
    days: 9, constraints: { requiredStopIds: ["paris", "brussels", "amsterdam"], avoidDriving: true, excludedTransportModes: ["road"], transportModes: ["train"] },
    expected: { canBuild: true, healthMustNeedReview: true, prohibitedModes: ["road"] },
    assessment: { objectiveConcern: null, knowledgeBoundary: "A rail preference cannot itself prove a direct rail service.", reasonableAlternatives: null },
  },
  {
    id: "driving-new-zealand", name: "A compact New Zealand driving route remains coherent", regions: ["Oceania"], structures: ["driving", "linear"],
    origin: { name: "Christchurch", country: "New Zealand", coordinates: [172.6362, -43.5321] },
    stops: [stop("christchurch", "Christchurch", "New Zealand", [172.6362, -43.5321], { required: true }), stop("tekapo", "Lake Tekapo", "New Zealand", [170.4771, -44.0047], { required: true }), stop("wanaka", "Wanaka", "New Zealand", [169.136, -44.6967], { required: true }), stop("queenstown", "Queenstown", "New Zealand", [168.6626, -45.0312], { required: true })],
    days: 10, constraints: { fixedStartStopId: "christchurch", fixedEndStopId: "queenstown", requiredStopIds: ["christchurch", "tekapo", "wanaka", "queenstown"], transportModes: ["drive"] },
    expected: { canBuild: true, fixedStartStopId: "christchurch", fixedEndStopId: "queenstown" },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Road conditions and closures remain unverified.", reasonableAlternatives: null },
  },
  {
    id: "unreasonable-driving", name: "No-driving across distant countries fails closed", regions: ["Europe", "Africa"], structures: ["transport-constraint", "cross-border"],
    origin: { name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
    stops: [stop("istanbul", "Istanbul", "Turkey", [28.9784, 41.0082], { required: true }), stop("cairo", "Cairo", "Egypt", [31.2357, 30.0444], { required: true })],
    days: 8, constraints: { requiredStopIds: ["istanbul", "cairo"], avoidDriving: true, excludedTransportModes: ["road"] },
    expected: { canBuild: true, healthMustNeedReview: true, prohibitedModes: ["road"] },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Flights are planning estimates until checked.", reasonableAlternatives: null },
  },
  {
    id: "very-short", name: "Five-day three-stop trip exposes compression", regions: ["Europe"], structures: ["very-short"],
    origin: { name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] }, stops: italy.slice(0, 3), days: 5, pace: "fast",
    constraints: { fixedStartStopId: "rome", requiredStopIds: ["rome", "venice", "florence"] },
    expected: { canBuild: true, fixedStartStopId: "rome", healthMustNeedReview: true },
    assessment: { objectiveConcern: "Four nights across three retained cities is objectively compressed.", knowledgeBoundary: null, reasonableAlternatives: "The traveller may accept the pace rather than remove a stop." },
  },
  {
    id: "long-few-bases", name: "A long trip deepens existing bases without inventing stops", regions: ["Asia"], structures: ["long", "few-stops"],
    origin: { name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] }, stops: japan.slice(0, 3), days: 35, pace: "relaxed",
    constraints: { fixedStartStopId: "tokyo", requiredStopIds: ["tokyo", "kanazawa", "kyoto"] },
    expected: { canBuild: true, fixedStartStopId: "tokyo" },
    assessment: { objectiveConcern: null, knowledgeBoundary: null, reasonableAlternatives: "A traveller may prefer adding bases, but duration alone must not invent them." },
  },
  {
    id: "many-stop", name: "Eight-stop route stays complete and deterministic", regions: ["Europe"], structures: ["many-stop", "linear"],
    origin: { name: "Lisbon", country: "Portugal", coordinates: [-9.1393, 38.7223] },
    stops: [stop("lisbon", "Lisbon", "Portugal", [-9.1393, 38.7223], { required: true }), stop("porto", "Porto", "Portugal", [-8.6291, 41.1579], { required: true }), stop("santiago", "Santiago de Compostela", "Spain", [-8.5448, 42.8782], { required: true }), stop("bilbao", "Bilbao", "Spain", [-2.935, 43.263], { required: true }), stop("san-sebastian", "San Sebastian", "Spain", [-1.9812, 43.3183], { required: true }), stop("bordeaux", "Bordeaux", "France", [-0.5792, 44.8378], { required: true }), stop("toulouse", "Toulouse", "France", [1.4442, 43.6047], { required: true }), stop("barcelona", "Barcelona", "Spain", [2.1734, 41.3851], { required: true })],
    days: 24, constraints: { fixedStartStopId: "lisbon", fixedEndStopId: "barcelona", requiredStopIds: ["lisbon", "porto", "santiago", "bilbao", "san-sebastian", "bordeaux", "toulouse", "barcelona"] },
    expected: { canBuild: true, fixedStartStopId: "lisbon", fixedEndStopId: "barcelona" },
    assessment: { objectiveConcern: null, knowledgeBoundary: "Cross-border and regional services need live checks.", reasonableAlternatives: "Bilbao and San Sebastian can swap with little objective difference." },
  },
  {
    id: "fixed-booked-anchor", name: "A fixed booked stay is protected", regions: ["Europe"], structures: ["fixed-dates", "locked-stay"],
    origin: { name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    stops: [stop("rome", "Rome", "Italy", [12.4964, 41.9028], { required: true }), stop("florence", "Florence", "Italy", [11.2558, 43.7696], { required: true, fixedNights: 3 }), stop("venice", "Venice", "Italy", [12.3155, 45.4408], { required: true })],
    days: 10, constraints: { fixedStartStopId: "rome", requiredStopIds: ["rome", "florence", "venice"], fixedCommitments: [{ label: "Florence hotel", date: "2027-05-06" }] },
    expected: { canBuild: true, fixedStartStopId: "rome", preserveEnteredOrder: true },
    assessment: { objectiveConcern: null, knowledgeBoundary: null, reasonableAlternatives: "The fixed booking intentionally outweighs small route-order gains." },
  },
];

export type RouteQualityVariant = {
  id: string;
  baseFixtureId: string;
  mutation: "duration" | "pace" | "transport" | "direction" | "add-stop" | "remove-stop" | "add-attraction";
  days?: number;
  pace?: RouteQualityFixture["pace"];
  constraints?: RoutePlanningConstraints;
  reverseStops?: boolean;
  addStop?: RouteQualityFixture["stops"][number];
  removeStopId?: string;
  addVisit?: RouteQualityVisit;
};

export const ROUTE_QUALITY_VARIANTS: RouteQualityVariant[] = [
  ...[7, 10, 14, 21].map((days) => ({ id: `italy-${days}-days`, baseFixtureId: "linear-italy", mutation: "duration" as const, days })),
  ...(["relaxed", "balanced", "fast"] as const).map((pace) => ({ id: `japan-${pace}`, baseFixtureId: "linear-japan", mutation: "pace" as const, pace })),
  { id: "benelux-train", baseFixtureId: "simple-land-border", mutation: "transport", constraints: { transportModes: ["train"], avoidDriving: true, excludedTransportModes: ["road"] } },
  { id: "benelux-driving", baseFixtureId: "simple-land-border", mutation: "transport", constraints: { transportModes: ["drive"] } },
  { id: "japan-reverse", baseFixtureId: "linear-japan", mutation: "direction", reverseStops: true },
  { id: "italy-add-outlier", baseFixtureId: "linear-italy", mutation: "add-stop", addStop: stop("palermo", "Palermo", "Italy", [13.3615, 38.1157], { required: true }) },
  { id: "italy-remove-venice", baseFixtureId: "linear-italy", mutation: "remove-stop", removeStopId: "venice" },
  { id: "cusco-add-attraction", baseFixtureId: "hub-cusco-machu", mutation: "add-attraction", addVisit: { id: "sacsayhuaman", name: "Sacsayhuaman", kind: "monument", baseStopId: "cusco" } },
];

export function routeQualityVariantFixture(variant: RouteQualityVariant): RouteQualityFixture {
  const base = ROUTE_QUALITY_FIXTURES.find((fixture) => fixture.id === variant.baseFixtureId);
  if (!base) throw new Error(`Unknown route-quality base fixture: ${variant.baseFixtureId}`);
  let stops = base.stops.map((item) => ({ ...item }));
  if (variant.reverseStops) stops.reverse();
  if (variant.addStop) stops.push({ ...variant.addStop });
  if (variant.removeStopId) stops = stops.filter((item) => item.id !== variant.removeStopId);
  const stopIds = stops.map((item) => item.id);
  const variantConstraints = variant.constraints ?? {};
  const constraints: RoutePlanningConstraints = {
    ...base.constraints,
    ...variantConstraints,
    requiredStopIds: stopIds,
    fixedStartStopId: variant.reverseStops ? stops[0]?.id : base.constraints?.fixedStartStopId && stopIds.includes(base.constraints.fixedStartStopId) ? base.constraints.fixedStartStopId : undefined,
    fixedEndStopId: variant.reverseStops ? stops.at(-1)?.id : base.constraints?.fixedEndStopId && stopIds.includes(base.constraints.fixedEndStopId) ? base.constraints.fixedEndStopId : undefined,
    excludedTransportModes: variantConstraints.excludedTransportModes ?? base.constraints?.excludedTransportModes,
  };
  return {
    ...base,
    id: variant.id,
    name: `${base.name} (${variant.id})`,
    stops,
    visits: [...(base.visits ?? []), ...(variant.addVisit ? [variant.addVisit] : [])],
    days: variant.days ?? base.days,
    pace: variant.pace ?? base.pace,
    constraints,
    expected: {
      ...base.expected,
      canBuild: Boolean(variant.constraints?.avoidDriving || variant.constraints?.excludedTransportModes?.includes("road")) ? false : base.expected.canBuild,
      fixedStartStopId: constraints.fixedStartStopId,
      fixedEndStopId: constraints.fixedEndStopId,
      routeShouldImprove: undefined,
      preserveEnteredOrder: undefined,
    },
  };
}

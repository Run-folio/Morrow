import type { PlaceTypeLiteral } from "../../lib/easyt/place-catalog.ts";
import type { PlaceIssueCode } from "../../lib/easyt/place-intelligence.ts";

export type PlaceIntelligenceCohort =
  | "exact-place-regression"
  | "regions-and-planning-areas"
  | "islands-and-archipelagos"
  | "aliases-and-multilingual-names"
  | "nested-and-overlapping-geography"
  | "ambiguity-and-context"
  | "roles-and-negation"
  | "partial-unknowns";

export type ExpectedPlaceMention = {
  /** Exact traveller wording. `sourceTexts` is used when aliases should deduplicate. */
  sourceText: string;
  sourceTexts?: string[];
  canonicalPlaceId?: string;
  canonicalName?: string;
  placeTypes: PlaceTypeLiteral[];
  statuses: Array<"resolved" | "partially_resolved" | "ambiguous" | "unresolved">;
  routabilities: Array<"direct_destination" | "planning_area" | "anchor_or_poi" | "needs_base_selection" | "non_routable_reference">;
  roles: Array<"required" | "preferred" | "origin" | "fixed_start" | "fixed_end" | "gateway" | "anchor" | "optional" | "excluded">;
  parentCountries: string[];
  /** Canonical names that would indicate a false city/base collapse. */
  forbiddenCanonicalNames?: string[];
};

export type PlaceIntelligenceFixture = {
  id: string;
  name: string;
  cohort: PlaceIntelligenceCohort;
  prompt: string;
  expectedSequenceKind?: "ordered" | "unordered";
  expectedMentions: ExpectedPlaceMention[];
  expectedIssueCodes?: PlaceIssueCode[];
  unacceptableFailures: string[];
  acceptableVariations: string[];
  qualitativeReview: string;
};

type ResolvedOptions = Partial<Pick<ExpectedPlaceMention, "sourceTexts" | "canonicalName" | "roles" | "parentCountries" | "forbiddenCanonicalNames">> & {
  status?: ExpectedPlaceMention["statuses"][number];
  placeTypes?: ExpectedPlaceMention["placeTypes"];
  routabilities?: ExpectedPlaceMention["routabilities"];
};

const resolved = (
  sourceText: string,
  canonicalPlaceId: string,
  placeType: ExpectedPlaceMention["placeTypes"][number],
  routability: ExpectedPlaceMention["routabilities"][number],
  options: ResolvedOptions = {},
): ExpectedPlaceMention => ({
  sourceText,
  canonicalPlaceId,
  canonicalName: options.canonicalName,
  placeTypes: options.placeTypes ?? [placeType],
  statuses: [options.status ?? "resolved"],
  routabilities: options.routabilities ?? [routability],
  roles: options.roles ?? ["preferred"],
  parentCountries: options.parentCountries ?? [],
  sourceTexts: options.sourceTexts,
  forbiddenCanonicalNames: options.forbiddenCanonicalNames,
});

const unresolved = (sourceText: string, roles: ExpectedPlaceMention["roles"] = ["preferred"]): ExpectedPlaceMention => ({
  sourceText,
  placeTypes: ["unknown"],
  statuses: ["unresolved"],
  routabilities: ["non_routable_reference"],
  roles,
  parentCountries: [],
});

const ambiguous = (sourceText: string, placeTypes: ExpectedPlaceMention["placeTypes"] = ["unknown"]): ExpectedPlaceMention => ({
  sourceText,
  placeTypes,
  statuses: ["ambiguous"],
  routabilities: ["non_routable_reference"],
  roles: ["preferred"],
  parentCountries: [],
});

const commonUnacceptable = [
  "Silently drop an explicitly named place phrase.",
  "Invent a city, base, country, coordinate or transport claim.",
];

const commonVariations = [
  "Canonical display punctuation and safe diacritic normalization may vary.",
  "Ambiguity-candidate ordering may vary when no candidate is promoted to resolved truth.",
];

const fixture = (
  value: Omit<PlaceIntelligenceFixture, "unacceptableFailures" | "acceptableVariations"> & {
    unacceptableFailures?: string[];
    acceptableVariations?: string[];
  },
): PlaceIntelligenceFixture => ({
  ...value,
  unacceptableFailures: [...commonUnacceptable, ...(value.unacceptableFailures ?? [])],
  acceptableVariations: [...commonVariations, ...(value.acceptableVariations ?? [])],
});

export const PLACE_INTELLIGENCE_FIXTURES: PlaceIntelligenceFixture[] = [
  // A. Existing exact-place regression.
  fixture({
    id: "exact-bangkok-siem-reap-hcmc",
    name: "Existing Southeast Asia city sequence",
    cohort: "exact-place-regression",
    prompt: "Bangkok, then Siem Reap, then Ho Chi Minh City",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("Bangkok", "bangkok", "city", "direct_destination", { parentCountries: ["Thailand"] }),
      resolved("Siem Reap", "siem-reap", "city", "direct_destination", { parentCountries: ["Cambodia"] }),
      resolved("Ho Chi Minh City", "ho-chi-minh-city", "city", "direct_destination", { parentCountries: ["Vietnam"] }),
    ],
    qualitativeReview: "Does the output retain the explicit city order without treating route language as part of a place name?",
  }),
  fixture({
    id: "exact-japan-city-regression",
    name: "Existing Japan city regression",
    cohort: "exact-place-regression",
    prompt: "Tokyo, Kyoto and Osaka by train",
    expectedMentions: [
      resolved("Tokyo", "tokyo", "city", "direct_destination", { parentCountries: ["Japan"] }),
      resolved("Kyoto", "kyoto", "city", "direct_destination", { parentCountries: ["Japan"] }),
      resolved("Osaka", "osaka", "city", "direct_destination", { parentCountries: ["Japan"] }),
    ],
    qualitativeReview: "Are all three established destinations preserved without turning the transport preference into geography?",
  }),
  fixture({
    id: "exact-fixed-london-paris",
    name: "Fixed city gateways",
    cohort: "exact-place-regression",
    prompt: "Start in London and finish in Paris",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("London", "london", "city", "direct_destination", { roles: ["fixed_start"], parentCountries: ["United Kingdom"] }),
      resolved("Paris", "paris", "city", "direct_destination", { roles: ["fixed_end"], parentCountries: ["France"] }),
    ],
    qualitativeReview: "Do fixed gateway roles survive without making London or Paris optional?",
  }),
  fixture({
    id: "exact-country-japan",
    name: "Country-only intent remains broad",
    cohort: "exact-place-regression",
    prompt: "A week in Japan",
    expectedMentions: [resolved("Japan", "japan", "country", "planning_area", { parentCountries: ["Japan"], forbiddenCanonicalNames: ["Tokyo"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    unacceptableFailures: ["Rewrite Japan to Tokyo or another arbitrary base."],
    acceptableVariations: ["The country may be resolved while still requiring a city/base before routing."],
    qualitativeReview: "Does the result preserve country-level intent while honestly signalling that route bases are not selected?",
  }),
  fixture({
    id: "exact-iberia-cities",
    name: "Existing Iberia cities",
    cohort: "exact-place-regression",
    prompt: "Madrid, Barcelona and Lisbon",
    expectedMentions: [
      resolved("Madrid", "madrid", "city", "direct_destination", { parentCountries: ["Spain"] }),
      resolved("Barcelona", "barcelona", "city", "direct_destination", { parentCountries: ["Spain"] }),
      resolved("Lisbon", "lisbon", "city", "direct_destination", { parentCountries: ["Portugal"] }),
    ],
    qualitativeReview: "Does exact city capture retain all three existing destination identities?",
  }),
  fixture({
    id: "exact-cusco-machu-picchu",
    name: "City and landmark remain distinct",
    cohort: "exact-place-regression",
    prompt: "Cusco and Machu Picchu",
    expectedMentions: [
      resolved("Cusco", "cusco", "city", "direct_destination", { parentCountries: ["Peru"] }),
      resolved("Machu Picchu", "machu-picchu", "landmark", "anchor_or_poi", { roles: ["anchor"], parentCountries: ["Peru"] }),
    ],
    unacceptableFailures: ["Classify Cusco as the landmark and Machu Picchu as a city."],
    qualitativeReview: "Is Machu Picchu retained as an explicit anchor rather than rewritten to Cusco?",
  }),
  fixture({
    id: "exact-gateways-and-anchor",
    name: "Established gateway and anchor prompt",
    cohort: "exact-place-regression",
    prompt: "Start in Bangkok, Angkor Wat is essential, and finish in Vietnam",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("Bangkok", "bangkok", "city", "direct_destination", { roles: ["fixed_start"], parentCountries: ["Thailand"] }),
      resolved("Angkor Wat", "angkor-wat", "landmark", "anchor_or_poi", { roles: ["required"], parentCountries: ["Cambodia"] }),
      resolved("Vietnam", "vietnam", "country", "planning_area", { roles: ["fixed_end"], parentCountries: ["Vietnam"] }),
    ],
    qualitativeReview: "Are the two gateways and required landmark projected with their distinct roles?",
  }),
  fixture({
    id: "exact-vietnam-cities",
    name: "Existing Vietnam cities",
    cohort: "exact-place-regression",
    prompt: "Hanoi and Hoi An",
    expectedMentions: [
      resolved("Hanoi", "hanoi", "city", "direct_destination", { parentCountries: ["Vietnam"] }),
      resolved("Hoi An", "hoi-an", "town", "direct_destination", { parentCountries: ["Vietnam"] }),
    ],
    qualitativeReview: "Do existing city and safe-diacritic behaviours remain stable?",
  }),

  // B. Regions and planning areas.
  fixture({
    id: "region-patagonia",
    name: "Patagonia remains a multi-country region",
    cohort: "regions-and-planning-areas",
    prompt: "Three weeks through Patagonia",
    expectedMentions: [resolved("Patagonia", "patagonia", "region", "needs_base_selection", { parentCountries: ["Argentina", "Chile"], forbiddenCanonicalNames: ["El Calafate", "Puerto Natales"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    unacceptableFailures: ["Collapse Patagonia to El Calafate, Puerto Natales or another base."],
    qualitativeReview: "Is broad cross-border Patagonia preserved without implying which side or base the traveller chose?",
  }),
  fixture({
    id: "region-tierra-del-fuego",
    name: "Tierra del Fuego remains a region",
    cohort: "regions-and-planning-areas",
    prompt: "Tierra del Fuego for the final week",
    expectedMentions: [resolved("Tierra del Fuego", "tierra-del-fuego", "sub_region", "needs_base_selection", { parentCountries: ["Argentina", "Chile"], forbiddenCanonicalNames: ["Ushuaia"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    unacceptableFailures: ["Silently rewrite the region to Ushuaia."],
    qualitativeReview: "Does the result preserve the archipelago/region scope and leave its bases unresolved?",
  }),
  fixture({
    id: "region-dolomites",
    name: "Dolomites planning area",
    cohort: "regions-and-planning-areas",
    prompt: "10 days in the Dolomites",
    expectedMentions: [resolved("the Dolomites", "dolomites", "mountain_range", "needs_base_selection", { placeTypes: ["mountain_range"], routabilities: ["needs_base_selection"], parentCountries: ["Italy"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    qualitativeReview: "Would the traveller understand that Morrovia recognized the mountains but still needs an overnight base?",
  }),
  fixture({
    id: "region-french-alps",
    name: "Country-qualified Alps",
    cohort: "regions-and-planning-areas",
    prompt: "The French Alps in September",
    expectedMentions: [resolved("The French Alps", "french-alps", "mountain_range", "needs_base_selection", { parentCountries: ["France"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    unacceptableFailures: ["Discard the French qualifier or broaden the request to all Alps countries."],
    qualitativeReview: "Is the traveller’s country qualifier preserved as meaningful scope?",
  }),
  fixture({
    id: "region-balkans",
    name: "Balkans multi-country planning area",
    cohort: "regions-and-planning-areas",
    prompt: "A Balkans road trip",
    expectedMentions: [resolved("Balkans", "balkans", "macro_region", "needs_base_selection", { forbiddenCanonicalNames: ["Sofia", "Dubrovnik", "Belgrade"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    qualitativeReview: "Is the broad region retained without choosing a conventional itinerary on the traveller’s behalf?",
  }),
  fixture({
    id: "region-scottish-highlands",
    name: "Scottish Highlands qualifier",
    cohort: "regions-and-planning-areas",
    prompt: "A slow trip around the Scottish Highlands",
    expectedMentions: [resolved("the Scottish Highlands", "scottish-highlands", "region", "needs_base_selection", { parentCountries: ["United Kingdom"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    qualitativeReview: "Does Scotland disambiguate Highlands while keeping the area broad?",
  }),
  fixture({
    id: "region-amalfi-coast",
    name: "Amalfi Coast planning area",
    cohort: "regions-and-planning-areas",
    prompt: "Naples and the Amalfi Coast",
    expectedMentions: [
      resolved("Naples", "naples", "city", "direct_destination", { parentCountries: ["Italy"] }),
      resolved("the Amalfi Coast", "amalfi-coast", "coast", "needs_base_selection", { parentCountries: ["Italy"] }),
    ],
    qualitativeReview: "Does the coast remain distinct from Naples rather than becoming a duplicate city stop?",
  }),
  fixture({
    id: "region-sacred-valley",
    name: "Sacred Valley planning area",
    cohort: "regions-and-planning-areas",
    prompt: "Four nights in the Sacred Valley",
    expectedMentions: [resolved("the Sacred Valley", "sacred-valley", "valley", "needs_base_selection", { placeTypes: ["valley"], parentCountries: ["Peru"], forbiddenCanonicalNames: ["Cusco", "Ollantaytambo"] })],
    acceptableVariations: ["A curated base may be offered separately, but must not replace the regional mention."],
    qualitativeReview: "Is the valley retained as original intent even if a base can later be suggested?",
  }),
  fixture({
    id: "region-greek-islands",
    name: "Greek Islands archipelago",
    cohort: "regions-and-planning-areas",
    prompt: "A no-driving trip through the Greek Islands",
    expectedMentions: [resolved("the Greek Islands", "greek-islands", "archipelago", "needs_base_selection", { routabilities: ["needs_base_selection"], parentCountries: ["Greece"] })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    unacceptableFailures: ["Lose the no-driving constraint during downstream projection."],
    qualitativeReview: "Does the output preserve the island-group intent without selecting one island or fabricating ferry legs?",
  }),
  fixture({
    id: "region-lake-district",
    name: "Lake District natural area",
    cohort: "regions-and-planning-areas",
    prompt: "London and the Lake District",
    expectedMentions: [
      resolved("London", "london", "city", "direct_destination", { parentCountries: ["United Kingdom"] }),
      resolved("the Lake District", "lake-district", "natural_area", "needs_base_selection", { placeTypes: ["natural_area"], parentCountries: ["United Kingdom"] }),
    ],
    qualitativeReview: "Is the national-park-scale area retained separately from the concrete city?",
  }),

  // C. Islands and archipelagos.
  fixture({
    id: "island-easter-island",
    name: "Easter Island identity",
    cohort: "islands-and-archipelagos",
    prompt: "Five days on Easter Island",
    expectedMentions: [resolved("Easter Island", "rapa-nui", "island", "needs_base_selection", { canonicalName: "Rapa Nui", parentCountries: ["Chile"] })],
    qualitativeReview: "Is the island usable without replacing the traveller’s familiar label in the evidence?",
  }),
  fixture({
    id: "island-rapa-nui",
    name: "Rapa Nui identity",
    cohort: "islands-and-archipelagos",
    prompt: "Rapa Nui for five days",
    expectedMentions: [resolved("Rapa Nui", "rapa-nui", "island", "needs_base_selection", { canonicalName: "Rapa Nui", parentCountries: ["Chile"] })],
    qualitativeReview: "Does the indigenous/common name resolve to the same stable island identity?",
  }),
  fixture({
    id: "archipelago-galapagos",
    name: "Galápagos archipelago",
    cohort: "islands-and-archipelagos",
    prompt: "Quito and the Galápagos Islands",
    expectedMentions: [
      resolved("Quito", "quito", "city", "direct_destination", { parentCountries: ["Ecuador"] }),
      resolved("the Galápagos Islands", "galapagos-islands", "archipelago", "needs_base_selection", { parentCountries: ["Ecuador"] }),
    ],
    qualitativeReview: "Is the archipelago retained without claiming a specific inhabited island or cruise?",
  }),
  fixture({
    id: "archipelago-canary-islands",
    name: "Canary Islands planning area",
    cohort: "islands-and-archipelagos",
    prompt: "Two weeks around the Canary Islands",
    expectedMentions: [resolved("the Canary Islands", "canary-islands", "archipelago", "needs_base_selection", { routabilities: ["needs_base_selection"], parentCountries: ["Spain"] })],
    qualitativeReview: "Does the result ask for island/base selection rather than silently choosing Tenerife?",
  }),
  fixture({
    id: "archipelago-azores",
    name: "Azores planning area",
    cohort: "islands-and-archipelagos",
    prompt: "Nature and hiking in the Azores",
    expectedMentions: [resolved("the Azores", "azores", "archipelago", "needs_base_selection", { routabilities: ["needs_base_selection"], parentCountries: ["Portugal"] })],
    qualitativeReview: "Is the island group preserved without inventing an inter-island sequence?",
  }),
  fixture({
    id: "archipelago-faroe-islands",
    name: "Faroe Islands planning area",
    cohort: "islands-and-archipelagos",
    prompt: "A week in the Faroe Islands",
    expectedMentions: [resolved("the Faroe Islands", "faroe-islands", "archipelago", "needs_base_selection", { parentCountries: ["Denmark"] })],
    qualitativeReview: "Does the resolver retain the archipelago’s own identity without forcing a Denmark city context?",
  }),

  // D. Aliases and multilingual/common names.
  fixture({
    id: "alias-easter-island-rapa-nui-dedupe",
    name: "Easter Island and Rapa Nui deduplicate",
    cohort: "aliases-and-multilingual-names",
    prompt: "Easter Island, or Rapa Nui, is essential",
    expectedMentions: [resolved("Easter Island", "rapa-nui", "island", "needs_base_selection", { sourceTexts: ["Easter Island", "Rapa Nui"], canonicalName: "Rapa Nui", roles: ["required"], parentCountries: ["Chile"] })],
    expectedIssueCodes: ["duplicate_alias"],
    acceptableVariations: ["A duplicate_alias issue may be informational or omitted when sourceTexts makes the deduplication explicit."],
    unacceptableFailures: ["Create two route destinations for the same island identity."],
    qualitativeReview: "Does deduplication retain both traveller labels and their essential priority?",
  }),
  fixture({
    id: "alias-valle-sagrado",
    name: "Valle Sagrado alias",
    cohort: "aliases-and-multilingual-names",
    prompt: "Cusco y el Valle Sagrado",
    expectedMentions: [
      resolved("Cusco", "cusco", "city", "direct_destination", { parentCountries: ["Peru"] }),
      resolved("el Valle Sagrado", "sacred-valley", "valley", "needs_base_selection", { canonicalName: "Sacred Valley", placeTypes: ["valley"], parentCountries: ["Peru"] }),
    ],
    qualitativeReview: "Is the Spanish regional name retained while sharing the Sacred Valley identity?",
  }),
  fixture({
    id: "alias-saigon",
    name: "Saigon common name",
    cohort: "aliases-and-multilingual-names",
    prompt: "Hanoi to Saigon",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("Hanoi", "hanoi", "city", "direct_destination", { parentCountries: ["Vietnam"] }),
      resolved("Saigon", "ho-chi-minh-city", "city", "direct_destination", { canonicalName: "Ho Chi Minh City", parentCountries: ["Vietnam"] }),
    ],
    qualitativeReview: "Does the canonical city identity retain Saigon as the traveller’s original wording?",
  }),
  fixture({
    id: "alias-nyc",
    name: "NYC abbreviation",
    cohort: "aliases-and-multilingual-names",
    prompt: "NYC and Boston",
    expectedMentions: [
      resolved("NYC", "new-york-city", "city", "direct_destination", { canonicalName: "New York City", parentCountries: ["United States"] }),
      resolved("Boston", "boston", "city", "direct_destination", { parentCountries: ["United States"] }),
    ],
    qualitativeReview: "Does the safe common abbreviation resolve without losing its source label?",
  }),
  fixture({
    id: "alias-japan-alps",
    name: "Japan Alps common form",
    cohort: "aliases-and-multilingual-names",
    prompt: "Tokyo and the Japan Alps",
    expectedMentions: [
      resolved("Tokyo", "tokyo", "city", "direct_destination", { parentCountries: ["Japan"] }),
      resolved("the Japan Alps", "japanese-alps", "mountain_range", "needs_base_selection", { canonicalName: "Japanese Alps", placeTypes: ["mountain_range"], parentCountries: ["Japan"] }),
    ],
    qualitativeReview: "Does the common alias preserve the mountain region rather than becoming a generic interest?",
  }),
  fixture({
    id: "alias-uk",
    name: "UK abbreviation",
    cohort: "aliases-and-multilingual-names",
    prompt: "Two weeks across the UK",
    expectedMentions: [resolved("the UK", "united-kingdom", "country", "planning_area", { canonicalName: "United Kingdom", parentCountries: ["United Kingdom"] })],
    qualitativeReview: "Does the abbreviation resolve to country intent without choosing London?",
  }),

  // E. Nested and overlapping geography.
  fixture({
    id: "required-central-southern-regions-and-rapa-nui",
    name: "Required central Place Intelligence acceptance prompt",
    cohort: "nested-and-overlapping-geography",
    prompt: "3 weeks through Patagonia, Tierra del Fuego and Easter Island. We like nature, prefer a relaxed pace and do not want to drive.",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("Patagonia", "patagonia", "region", "needs_base_selection", { parentCountries: ["Argentina", "Chile"], forbiddenCanonicalNames: ["El Calafate", "Puerto Natales"] }),
      resolved("Tierra del Fuego", "tierra-del-fuego", "sub_region", "needs_base_selection", { parentCountries: ["Argentina", "Chile"], forbiddenCanonicalNames: ["Ushuaia"] }),
      resolved("Easter Island", "rapa-nui", "island", "needs_base_selection", { canonicalName: "Rapa Nui", parentCountries: ["Chile"] }),
    ],
    expectedIssueCodes: ["region_requires_base"],
    unacceptableFailures: ["Drop any of the three explicit place phrases or invent bases for either broad region."],
    acceptableVariations: ["The two regional base-selection needs may be represented as one or two structured issues."],
    qualitativeReview: "Does the brief preserve all geography alongside nature, relaxed pace and the hard no-driving constraint without fabricating transfers?",
  }),
  fixture({
    id: "nested-patagonia-tierra-del-fuego",
    name: "Nested southern regions",
    cohort: "nested-and-overlapping-geography",
    prompt: "Patagonia and Tierra del Fuego",
    expectedMentions: [
      resolved("Patagonia", "patagonia", "region", "needs_base_selection", { parentCountries: ["Argentina", "Chile"] }),
      resolved("Tierra del Fuego", "tierra-del-fuego", "sub_region", "needs_base_selection", { parentCountries: ["Argentina", "Chile"] }),
    ],
    unacceptableFailures: ["Remove Tierra del Fuego merely because it overlaps Patagonia."],
    qualitativeReview: "Are parent and nested focus area both retained as intentional scope?",
  }),
  fixture({
    id: "nested-peru-cusco-sacred-valley",
    name: "Country, city and valley",
    cohort: "nested-and-overlapping-geography",
    prompt: "Peru, Cusco and the Sacred Valley",
    expectedMentions: [
      resolved("Peru", "peru", "country", "planning_area", { parentCountries: ["Peru"] }),
      resolved("Cusco", "cusco", "city", "direct_destination", { parentCountries: ["Peru"] }),
      resolved("the Sacred Valley", "sacred-valley", "valley", "needs_base_selection", { placeTypes: ["valley"], parentCountries: ["Peru"] }),
    ],
    qualitativeReview: "Does country context remain available while city and regional focus survive independently?",
  }),
  fixture({
    id: "nested-italy-tuscany",
    name: "Country and child region",
    cohort: "nested-and-overlapping-geography",
    prompt: "Italy and Tuscany",
    expectedMentions: [
      resolved("Italy", "italy", "country", "planning_area", { parentCountries: ["Italy"] }),
      resolved("Tuscany", "tuscany", "region", "needs_base_selection", { parentCountries: ["Italy"] }),
    ],
    qualitativeReview: "Is Tuscany retained as a deliberate focus rather than removed as redundant country detail?",
  }),
  fixture({
    id: "nested-japan-japanese-alps",
    name: "Country and mountain region",
    cohort: "nested-and-overlapping-geography",
    prompt: "Japan and the Japanese Alps",
    expectedMentions: [
      resolved("Japan", "japan", "country", "planning_area", { parentCountries: ["Japan"] }),
      resolved("the Japanese Alps", "japanese-alps", "mountain_range", "needs_base_selection", { placeTypes: ["mountain_range"], parentCountries: ["Japan"] }),
    ],
    qualitativeReview: "Does the mountain focus survive alongside its parent country?",
  }),
  fixture({
    id: "nested-greece-greek-islands",
    name: "Country and archipelago",
    cohort: "nested-and-overlapping-geography",
    prompt: "Greece and the Greek Islands",
    expectedMentions: [
      resolved("Greece", "greece", "country", "planning_area", { parentCountries: ["Greece"] }),
      resolved("the Greek Islands", "greek-islands", "archipelago", "needs_base_selection", { parentCountries: ["Greece"] }),
    ],
    qualitativeReview: "Is island-group focus retained rather than deduplicated as merely Greece?",
  }),

  // F. Ambiguity and context.
  fixture({
    id: "context-georgia-armenia",
    name: "Georgia country from Caucasus context",
    cohort: "ambiguity-and-context",
    prompt: "Georgia and Armenia",
    expectedMentions: [
      resolved("Georgia", "georgia-country", "country", "planning_area", { canonicalName: "Georgia", parentCountries: ["Georgia"] }),
      resolved("Armenia", "armenia", "country", "planning_area", { parentCountries: ["Armenia"] }),
    ],
    unacceptableFailures: ["Resolve Georgia to the US state despite Armenia context."],
    qualitativeReview: "Is nearby country context used only where it genuinely resolves Georgia?",
  }),
  fixture({
    id: "context-georgia-florida",
    name: "Georgia state from US context",
    cohort: "ambiguity-and-context",
    prompt: "Georgia and Florida",
    expectedMentions: [
      resolved("Georgia", "georgia-us-state", "region", "planning_area", { canonicalName: "Georgia", parentCountries: ["United States"] }),
      resolved("Florida", "florida", "region", "planning_area", { parentCountries: ["United States"] }),
    ],
    unacceptableFailures: ["Resolve Georgia to the country despite Florida context."],
    qualitativeReview: "Does strong US-state context resolve the ambiguity without popularity guessing?",
  }),
  fixture({
    id: "ambiguity-georgia-alone",
    name: "Georgia remains ambiguous without context",
    cohort: "ambiguity-and-context",
    prompt: "Ten days in Georgia",
    expectedMentions: [ambiguous("Georgia")],
    expectedIssueCodes: ["ambiguous_place"],
    unacceptableFailures: ["Silently choose the country or US state."],
    qualitativeReview: "Are plausible candidates exposed without presenting either as truth?",
  }),
  fixture({
    id: "context-granada-spain",
    name: "Granada disambiguated by country",
    cohort: "ambiguity-and-context",
    prompt: "Granada in Spain",
    expectedMentions: [
      resolved("Granada", "granada-spain", "city", "direct_destination", { canonicalName: "Granada", parentCountries: ["Spain"] }),
      resolved("Spain", "spain", "country", "planning_area", { parentCountries: ["Spain"] }),
    ],
    qualitativeReview: "Does explicit country context resolve the intended city without a confirmation detour?",
  }),
  fixture({
    id: "ambiguity-highlands",
    name: "Unqualified Highlands remains ambiguous",
    cohort: "ambiguity-and-context",
    prompt: "A week walking in the Highlands",
    expectedMentions: [ambiguous("the Highlands")],
    expectedIssueCodes: ["ambiguous_place"],
    unacceptableFailures: ["Silently assume Scotland without supporting context."],
    qualitativeReview: "Does the result ask the shortest useful clarification instead of guessing?",
  }),
  fixture({
    id: "context-swiss-alps",
    name: "Country-qualified Alps",
    cohort: "ambiguity-and-context",
    prompt: "The Swiss Alps and Zurich",
    expectedMentions: [
      resolved("The Swiss Alps", "swiss-alps", "mountain_range", "needs_base_selection", { parentCountries: ["Switzerland"] }),
      resolved("Zurich", "zurich", "city", "direct_destination", { parentCountries: ["Switzerland"] }),
    ],
    qualitativeReview: "Is the broad Alps identity narrowed only to the stated Swiss scope?",
  }),

  // G. Roles and negation.
  fixture({
    id: "role-required-patagonia",
    name: "Required region",
    cohort: "roles-and-negation",
    prompt: "Patagonia is essential",
    expectedMentions: [resolved("Patagonia", "patagonia", "region", "needs_base_selection", { roles: ["required"], parentCountries: ["Argentina", "Chile"] })],
    qualitativeReview: "Does required priority survive even though the region still needs concrete bases?",
  }),
  fixture({
    id: "role-optional-patagonia",
    name: "Optional region",
    cohort: "roles-and-negation",
    prompt: "Patagonia would be nice if it fits",
    expectedMentions: [resolved("Patagonia", "patagonia", "region", "needs_base_selection", { roles: ["optional"], parentCountries: ["Argentina", "Chile"] })],
    unacceptableFailures: ["Upgrade a soft wish into a hard must-visit."],
    qualitativeReview: "Is the regional preference visibly soft rather than route-blocking?",
  }),
  fixture({
    id: "role-excluded-venice",
    name: "Excluded city",
    cohort: "roles-and-negation",
    prompt: "Skip Venice and spend more time in Rome",
    expectedMentions: [
      resolved("Venice", "venice", "city", "direct_destination", { roles: ["excluded"], parentCountries: ["Italy"] }),
      resolved("Rome", "rome", "city", "direct_destination", { parentCountries: ["Italy"] }),
    ],
    unacceptableFailures: ["Project excluded Venice as a route destination."],
    qualitativeReview: "Does exclusion remain structured while the alternative city stays positive intent?",
  }),
  fixture({
    id: "role-fixed-south-america-gateways",
    name: "Fixed South America gateways",
    cohort: "roles-and-negation",
    prompt: "Start in Buenos Aires and finish in Santiago",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("Buenos Aires", "buenos-aires", "city", "direct_destination", { roles: ["fixed_start"], parentCountries: ["Argentina"] }),
      resolved("Santiago", "santiago", "city", "direct_destination", { roles: ["fixed_end"], parentCountries: ["Chile"] }),
    ],
    qualitativeReview: "Are route endpoints fixed without conflating either with the traveller’s home origin?",
  }),
  fixture({
    id: "role-gateway-versus-stay",
    name: "Gateway versus intended planning area",
    cohort: "roles-and-negation",
    prompt: "Fly into Lima but spend the trip in the Sacred Valley",
    expectedSequenceKind: "ordered",
    expectedMentions: [
      resolved("Lima", "lima", "city", "direct_destination", { roles: ["gateway"], parentCountries: ["Peru"] }),
      resolved("the Sacred Valley", "sacred-valley", "valley", "needs_base_selection", { placeTypes: ["valley"], roles: ["required"], parentCountries: ["Peru"] }),
    ],
    unacceptableFailures: ["Treat Lima as the main stay or erase the Sacred Valley intent."],
    qualitativeReview: "Does the result distinguish arrival logistics from where the traveller wants to spend time?",
  }),
  fixture({
    id: "role-negative-region-positive-city",
    name: "Excluded region and positive city",
    cohort: "roles-and-negation",
    prompt: "Do not visit Patagonia; Buenos Aires instead",
    expectedMentions: [
      resolved("Patagonia", "patagonia", "region", "needs_base_selection", { roles: ["excluded"], parentCountries: ["Argentina", "Chile"] }),
      resolved("Buenos Aires", "buenos-aires", "city", "direct_destination", { roles: ["preferred"], parentCountries: ["Argentina"] }),
    ],
    unacceptableFailures: ["Treat excluded Patagonia as a positive route destination."],
    qualitativeReview: "Is negated regional intent preserved for constraints without polluting the positive route?",
  }),

  // H. Partial unknowns and graceful degradation.
  fixture({
    id: "partial-tokyo-atlantis",
    name: "Known city plus unsupported place",
    cohort: "partial-unknowns",
    prompt: "Tokyo and Atlantis",
    expectedMentions: [
      resolved("Tokyo", "tokyo", "city", "direct_destination", { parentCountries: ["Japan"] }),
      unresolved("Atlantis"),
    ],
    expectedIssueCodes: ["unresolved_place"],
    qualitativeReview: "Does the known city remain usable while unsupported geography stays visible?",
  }),
  fixture({
    id: "partial-venice-moonlit-fjords",
    name: "Known city plus unknown regional phrase",
    cohort: "partial-unknowns",
    prompt: "Venice and the Moonlit Fjords",
    expectedMentions: [
      resolved("Venice", "venice", "city", "direct_destination", { parentCountries: ["Italy"] }),
      unresolved("the Moonlit Fjords"),
    ],
    expectedIssueCodes: ["unresolved_place"],
    qualitativeReview: "Is the unknown multi-word phrase retained intact rather than tokenized or discarded?",
  }),
  fixture({
    id: "partial-patagonia-misspelling",
    name: "Safe regional misspelling",
    cohort: "partial-unknowns",
    prompt: "Three weeks in Patagonnia",
    expectedMentions: [resolved("Patagonnia", "patagonia", "region", "needs_base_selection", {
      canonicalName: "Patagonia",
      status: "partially_resolved",
      parentCountries: ["Argentina", "Chile"],
    })],
    expectedIssueCodes: ["region_requires_base", "missing_routable_destination"],
    acceptableVariations: ["A low-confidence partial resolution is acceptable if it remains explicit and asks confirmation."],
    qualitativeReview: "Is the obvious misspelling corrected transparently without upgrading uncertainty to verified truth?",
  }),
  fixture({
    id: "partial-rapa-nui-unknown",
    name: "Known alias plus opaque unknown",
    cohort: "partial-unknowns",
    prompt: "Rapa Nui and Qqqqzz",
    expectedMentions: [
      resolved("Rapa Nui", "rapa-nui", "island", "needs_base_selection", { parentCountries: ["Chile"] }),
      unresolved("Qqqqzz"),
    ],
    expectedIssueCodes: ["unresolved_place"],
    qualitativeReview: "Does one provider/catalog miss leave the resolved island untouched?",
  }),
  fixture({
    id: "partial-dolomites-mystery-coast",
    name: "Known planning area plus unknown coast",
    cohort: "partial-unknowns",
    prompt: "The Dolomites and Mystery Coast",
    expectedMentions: [
      resolved("The Dolomites", "dolomites", "mountain_range", "needs_base_selection", { placeTypes: ["mountain_range"], routabilities: ["needs_base_selection"], parentCountries: ["Italy"] }),
      unresolved("Mystery Coast"),
    ],
    expectedIssueCodes: ["unresolved_place"],
    qualitativeReview: "Are the recognized and unresolved areas both projected without inventing a coast location?",
  }),
];

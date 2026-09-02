import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBriefFromSemanticIntent, captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import { createHomeTripDraft, routableHandoffMentions } from "../lib/easyt/home-trip-handoff.ts";
import {
  createOpenWorldPlaceProvider,
  type OpenWorldCandidateCache,
  type OpenWorldPlaceSource,
  type OpenWorldTravelCandidate,
} from "../lib/easyt/open-world-place.server.ts";
import {
  placeMentionsNeedingReview,
  resolveExplicitPlaceMentionsWithProvider,
  type PlaceProviderCandidate,
} from "../lib/easyt/place-intelligence.ts";
import {
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  type SemanticTripIntent,
} from "../lib/easyt/semantic-trip-intent.ts";

function candidate(
  providerId: string,
  canonicalName: string,
  country: string,
  placeType: PlaceProviderCandidate["placeType"],
  coordinates: [number, number],
  rankScore = 150,
): OpenWorldTravelCandidate {
  const direct = ["city", "town", "transport_gateway"].includes(placeType);
  return {
    providerId,
    canonicalName,
    country,
    providerKind: placeType,
    parentCountries: [country],
    placeType,
    coordinates,
    routability: direct ? "direct_destination" : placeType === "landmark" ? "anchor_or_poi" : "needs_base_selection",
    matchQuality: "exact",
    rankScore,
    normalizationReason: "controlled global place fixture",
  };
}

function source(responses: Record<string, OpenWorldTravelCandidate[]>, calls: string[] = []): OpenWorldPlaceSource {
  return {
    id: "global-fixture",
    label: "Controlled global source",
    async search(phrase) {
      calls.push(phrase);
      return responses[phrase.toLocaleLowerCase()] ?? [];
    },
  };
}

function routeStopIntent(destinations: string[]): SemanticTripIntent {
  return {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: null, certainty: null },
    journeyEnd: { sourceText: null, interpretedText: null, mode: "unknown", certainty: null },
    duration: { sourceText: null, value: null, unit: null },
    explicitDateTexts: [],
    destinationCandidates: destinations.map((sourceText) => ({ sourceText, interpretedText: null, role: "route-stop", certainty: "explicit" })),
    pointsOfInterest: [],
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
    pace: { sourceText: null, value: null },
    interests: [],
    constraints: [],
    ambiguities: [],
    unresolvedMeaningfulText: [],
  };
}

test("real Homepage capture resolves the staging South America fixture into six Builder stops", async () => {
  const primary = source({
    cusco: [candidate("cusco", "Cusco", "Peru", "city", [-71.9675, -13.5319])],
    "la paz": [candidate("la-paz", "La Paz", "Bolivia", "city", [-68.1193, -16.4897])],
    lima: [candidate("lima", "Lima", "Peru", "city", [-77.0428, -12.0464])],
    uyunui: [
      { ...candidate("N:795493613", "Uyuni", "Bolivia", "city", [-66.8239, -20.4628], 118), aliases: ["uyunui"], matchQuality: "alias", parentRegionId: "Potosí" },
      { ...candidate("R:4137633", "Uyuni", "Bolivia", "region", [-66.9216, -20.1759], 116), aliases: ["uyunui"], matchQuality: "alias", parentRegionId: "Potosí", routability: "planning_area" },
      { ...candidate("N:3254906725", "Uyuni", "Bolivia", "town", [-67.1825, -14.7008], 106), aliases: ["uyunui"], matchQuality: "alias", parentRegionId: "Beni" },
    ],
    huacachina: [
      { ...candidate("W:1046629515", "Huacachina", "Peru", "town", [-75.7618, -14.0876], 147), parentRegionId: "Department of Ica" },
      { ...candidate("N:13847531231", "Huacachina", "Peru", "town", [-75.7628, -14.0878], 145), parentRegionId: "Department of Ica" },
      { ...candidate("N:5365705094", "Huacachina", "Peru", "town", [-74.3339, -3.8848], 146), parentRegionId: "Department of Loreto" },
      { ...candidate("N:3629512631", "Huacachina Seca", "Peru", "town", [-75.7082, -14.1378], 121), aliases: ["huacachina"], matchQuality: "alias", parentRegionId: "Department of Ica" },
      { ...candidate("W:514902469", "Huacachina Sunset Hostal", "Peru", "landmark", [-75.7630, -14.0885], 96), aliases: ["huacachina"], matchQuality: "alias", parentRegionId: "Department of Ica" },
    ],
    salta: [candidate("salta", "Salta", "Argentina", "city", [-65.4232, -24.7821])],
  });
  const mirror: OpenWorldPlaceSource = {
    id: "mirror",
    label: "Second controlled global source",
    async search(phrase) {
      return phrase.toLocaleLowerCase() === "uyunui" ? [{
        ...candidate("node:795493613", "Uyuni", "Bolivia", "city", [-66.8241, -20.4630], 114),
        aliases: ["uyunui"],
        matchQuality: "alias",
        parentRegionId: "Potosí",
      }] : [];
    },
  };
  const provider = createOpenWorldPlaceProvider({
    cache: new Map(),
    sources: [primary, mirror],
  });
  const prompt = "cuzco, uyunui, la paz, lima, huacachina, salta";
  const capture = await captureJourneyBriefFromSemanticIntent(
    prompt,
    routeStopIntent(["cuzco", "uyunui", "la paz", "lima", "huacachina", "salta"]),
    provider,
  );
  const draft = createHomeTripDraft({
    capture,
    handoffId: "south-america-open-world-regression",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
  });
  const builderMentions = draft.locationMentions ?? [];
  const toConfirm = placeMentionsNeedingReview(builderMentions, capture.structuredBrief.placeIssues ?? []);

  assert.deepEqual(capture.mentions.map((mention) => mention.canonicalName), ["Cusco", "Uyuni", "La Paz", "Lima", "Huacachina", "Salta"]);
  assert.deepEqual(capture.mentions.map((mention) => mention.parentCountries[0]), ["Peru", "Bolivia", "Bolivia", "Peru", "Peru", "Argentina"]);
  assert.equal(capture.mentions.every((mention) => mention.status === "resolved" && mention.routability === "direct_destination"), true);
  assert.equal(capture.structuredBrief.placeIssues?.filter((issue) => issue.blocksRoute).length, 0);
  assert.deepEqual(capture.structuredBrief.placeMentions, capture.mentions);
  assert.equal(builderMentions.length, 6);
  assert.equal(routableHandoffMentions(builderMentions).length, 6);
  assert.equal(toConfirm.length, 0);
  assert.equal(capture.mentionCoverage.complete, true);

  const manualUyuni = await provider.lookup("uyunui", { travelIntent: "route-stop", countryNames: ["Bolivia"] });
  const manualHuacachina = await provider.lookup("huacachina", { travelIntent: "route-stop", countryNames: ["Peru"] });
  assert.equal(manualUyuni[0]?.canonicalName, "Uyuni");
  assert.deepEqual(manualUyuni[0]?.coordinates, capture.mentions[1]?.coordinates);
  assert.equal(manualHuacachina[0]?.canonicalName, "Huacachina");
  assert.deepEqual(manualHuacachina[0]?.coordinates, capture.mentions[4]?.coordinates);
});

test("open-world types resolve without catalogue pre-seeding and retain provider provenance", async () => {
  const provider = createOpenWorldPlaceProvider({
    cache: new Map(),
    sources: [source({
      "shirakawa-go": [candidate("shirakawa-go", "Shirakawa-go", "Japan", "town", [136.906, 36.257])],
      jigokudani: [candidate("jigokudani", "Jigokudani Monkey Park", "Japan", "landmark", [138.462, 36.732])],
      "mystery lake": [candidate("mystery-lake", "Mystery Lake", "Canada", "natural_area", [-97.72, 55.81])],
    })],
  });
  const result = await resolveExplicitPlaceMentionsWithProvider([
    { sourceText: "Shirakawa-go", role: "preferred", travelIntent: "route-stop" },
    { sourceText: "Jigokudani", role: "anchor", travelIntent: "anchor" },
    { sourceText: "Mystery Lake", role: "anchor", travelIntent: "anchor" },
  ], provider);

  assert.deepEqual(result.mentions.map((mention) => mention.placeType), ["town", "landmark", "natural_area"]);
  assert.equal(result.mentions.every((mention) => mention.canonicalPlaceId?.startsWith("open-world:global-fixture:")), true);
  assert.equal(result.mentions.every((mention) => mention.provenance.some((item) => item.kind === "provider")), true);
});

test("genuine same-name uncertainty remains ambiguous", async () => {
  const provider = createOpenWorldPlaceProvider({
    cache: new Map(),
    sources: [source({ springfield: [
      candidate("springfield-us-il", "Springfield", "United States", "city", [-89.65, 39.78], 140),
      candidate("springfield-us-ma", "Springfield", "United States", "city", [-72.59, 42.10], 139),
    ] })],
  });
  const result = await resolveExplicitPlaceMentionsWithProvider([{ sourceText: "Springfield", role: "preferred", travelIntent: "route-stop" }], provider);
  assert.equal(result.mentions[0]?.status, "ambiguous");
  assert.equal(result.issues[0]?.code, "ambiguous_place");
});

test("bare exact recognised geographies outrank higher-scoring locality namesakes without becoming stops", async () => {
  const fixtures: Record<string, OpenWorldTravelCandidate[]> = {
    scotland: [
      { ...candidate("scotland-gb", "Scotland", "United Kingdom", "region", [-4.11, 56.78], 78), routability: "planning_area", geographicSignificance: 0.9, administrativeLevel: 4, providerRank: 0 },
      { ...candidate("scotland-us-tx", "Scotland", "United States", "town", [-98.47, 33.66], 148), parentRegionId: "Texas" },
      { ...candidate("scotland-us-ct", "Scotland", "United States", "town", [-72.08, 41.70], 145), parentRegionId: "Connecticut" },
    ],
    wales: [
      { ...candidate("wales-gb", "Wales", "United Kingdom", "region", [-3.74, 52.29], 77), routability: "planning_area", geographicSignificance: 0.9, administrativeLevel: 4, providerRank: 0 },
      { ...candidate("wales-us-me", "Wales", "United States", "town", [-70.07, 44.18], 151), parentRegionId: "Maine" },
    ],
    ireland: [
      { ...candidate("ireland-country", "Ireland", "Ireland", "country", [-7.98, 52.87], 78), routability: "planning_area", geographicSignificance: 0.9, providerImportance: 0.87, providerRank: 0 },
      { ...candidate("ireland-gb", "Ireland", "United Kingdom", "town", [-0.35, 52.06], 142), parentRegionId: "England" },
    ],
  };
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [source(fixtures)] });

  for (const phrase of ["Scotland", "Wales", "Ireland"]) {
    const ranked = await provider.lookup(phrase, { travelIntent: "route-stop" });
    assert.notEqual(ranked[0]?.routability, "direct_destination", `${phrase} canonical geography should rank first`);
    const result = await resolveExplicitPlaceMentionsWithProvider(
      [{ sourceText: phrase, role: "preferred", travelIntent: "route-stop" }],
      provider,
    );
    const mention = result.mentions[0];
    assert.equal(mention?.canonicalName, phrase);
    assert.equal(["resolved", "partially_resolved"].includes(mention?.status ?? ""), true);
    assert.notEqual(mention?.status, "ambiguous");
    assert.equal(mention?.requiresBaseSelection, true);
    assert.equal(mention?.directlyRoutable, false);
    assert.equal(result.issues.some((issue) => issue.code === "region_requires_base" && issue.blocksRoute), true);
    assert.deepEqual(routableHandoffMentions(result.mentions), [], `${phrase} must not invent an overnight base`);
  }
});

test("an exact provider match to the traveller wording outranks a conflicting semantic lookup interpretation", async () => {
  const calls: string[] = [];
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [source({
    ireland: [{ ...candidate("ireland-country", "Ireland", "Ireland", "country", [-7.98, 52.87], 78), routability: "planning_area", geographicSignificance: 0.9 }],
    iceland: [{ ...candidate("iceland-country", "Iceland", "Iceland", "country", [-18.6, 64.9], 80), routability: "planning_area", geographicSignificance: 0.9 }],
  }, calls)] });
  const intent = routeStopIntent(["Ireland"]);
  intent.destinationCandidates[0]!.interpretedText = "Iceland";

  const capture = await captureJourneyBriefFromSemanticIntent("Ireland", intent, provider);
  assert.equal(capture.mentions[0]?.canonicalName, "Ireland");
  assert.deepEqual(capture.mentions[0]?.parentCountries, ["Ireland"]);
  assert.equal(calls.includes("Iceland"), false, "a conflicting interpretation is only a fallback when the source wording has no name match");
});

test("the canonical geography prior is generic across sovereign names and preserves material higher-order ambiguity", async () => {
  const fixtures = Object.fromEntries(["Jordan", "Chad", "Dominica"].map((name, index) => [name.toLocaleLowerCase(), [
    { ...candidate(`${name}-country`, name, name, "country", [index + 10, index + 10], 76), routability: "planning_area", geographicSignificance: 0.9 },
    { ...candidate(`${name}-locality`, name, "United States", "town", [index - 90, index + 30], 145), parentRegionId: `State ${index + 1}` },
  ]])) as Record<string, OpenWorldTravelCandidate[]>;
  fixtures.georgia = [
    { ...candidate("georgia-country", "Georgia", "Georgia", "country", [43.5, 42.0], 82), routability: "planning_area", geographicSignificance: 0.94 },
    { ...candidate("georgia-state", "Georgia", "United States", "region", [-83.5, 32.7], 81), routability: "planning_area", geographicSignificance: 0.9, parentRegionId: "United States" },
    { ...candidate("georgia-town", "Georgia", "United States", "town", [-90, 35], 150), parentRegionId: "Example County" },
  ];
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [source(fixtures)] });

  for (const phrase of ["Jordan", "Chad", "Dominica"]) {
    const result = await resolveExplicitPlaceMentionsWithProvider(
      [{ sourceText: phrase, role: "preferred", travelIntent: "route-stop" }],
      provider,
    );
    assert.equal(result.mentions[0]?.placeType, "country");
    assert.equal(result.mentions[0]?.requiresBaseSelection, true);
  }

  const bareGeorgia = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Georgia", role: "preferred", travelIntent: "route-stop" }],
    provider,
  );
  assert.equal(bareGeorgia.mentions[0]?.status, "ambiguous", "two material higher-order identities must still fail closed");
  assert.equal(bareGeorgia.issues[0]?.options.some((option) => option.placeType === "town"), false,
    "clarification should retain only the materially plausible higher-order identities");

  const usaGeorgia = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Georgia", role: "preferred", travelIntent: "route-stop" }],
    provider,
    { countryNames: ["United States"] },
  );
  assert.equal(usaGeorgia.mentions[0]?.canonicalPlaceId?.includes("georgia-state"), true);
  assert.equal(usaGeorgia.mentions[0]?.placeType, "region");

  const countryGeorgia = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Georgia, country", role: "preferred", travelIntent: "route-stop" }],
    provider,
  );
  assert.equal(countryGeorgia.mentions[0]?.canonicalPlaceId?.includes("georgia-country"), true);
  assert.equal(countryGeorgia.mentions[0]?.placeType, "country");
});

test("explicit locality context overrides the bare-name geography prior", async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [source({
    scotland: [
      { ...candidate("scotland-gb", "Scotland", "United Kingdom", "region", [-4.11, 56.78], 80), routability: "planning_area", geographicSignificance: 0.9 },
      { ...candidate("scotland-texas", "Scotland", "United States", "town", [-98.47, 33.66], 140), parentRegionId: "Texas" },
    ],
    "scotland, texas": [
      { ...candidate("scotland-texas", "Scotland", "United States", "town", [-98.47, 33.66], 150), parentRegionId: "Texas", aliases: ["Scotland, Texas"], matchQuality: "alias" },
      { ...candidate("scotland-gb", "Scotland", "United Kingdom", "region", [-4.11, 56.78], 75), routability: "planning_area", matchQuality: "partial", geographicSignificance: 0 },
    ],
  })] });
  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Scotland", lookupText: "Scotland", role: "preferred", travelIntent: "route-stop" }],
    provider,
    { countryNames: ["United States"] },
  );
  assert.equal(result.mentions[0]?.canonicalPlaceId?.includes("scotland-texas"), true);
  assert.equal(result.mentions[0]?.directlyRoutable, true);

  const qualified = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Scotland, Texas", role: "preferred", travelIntent: "route-stop" }],
    provider,
  );
  assert.equal(qualified.mentions[0]?.canonicalPlaceId?.includes("scotland-texas"), true);
  assert.equal(qualified.mentions[0]?.parentRegionId, "Texas");
});

test("ordinary city names do not lose to unrelated lower-significance admin lookalikes", async () => {
  const fixtures = Object.fromEntries(["Paris", "Cambridge", "Richmond"].map((name, index) => [name.toLocaleLowerCase(), [
    candidate(`${name}-city`, name, `Country ${index}`, "city", [index, index], 170),
    { ...candidate(`${name}-admin`, name, `Other ${index}`, "region", [index + 40, index + 40], 150), routability: "planning_area", geographicSignificance: 0 },
  ]])) as Record<string, OpenWorldTravelCandidate[]>;
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [source(fixtures)] });

  for (const phrase of ["Paris", "Cambridge", "Richmond"]) {
    const result = await resolveExplicitPlaceMentionsWithProvider(
      [{ sourceText: phrase, role: "preferred", travelIntent: "route-stop" }],
      provider,
    );
    assert.equal(result.mentions[0]?.placeType, "city");
    assert.equal(result.mentions[0]?.directlyRoutable, true);
  }
});

test("explicit country context settles one exact locality despite an unrelated exact region namesake", async () => {
  const provider = createOpenWorldPlaceProvider({
    cache: new Map(),
    sources: [source({ granada: [
      candidate("granada-nicaragua", "Granada", "Nicaragua", "town", [-85.9535, 11.9304], 169),
      candidate("granada-spain", "Granada", "Spain", "city", [-3.5995, 37.1735], 168),
      { ...candidate("granada-peru-region", "Granada", "Peru", "region", [-77.5744, -6.0971], 72), routability: "planning_area" },
    ] })],
  });
  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Granada", role: "preferred", travelIntent: "route-stop" }],
    provider,
    { countryNames: ["Nicaragua"] },
  );
  assert.equal(result.mentions[0]?.canonicalName, "Granada");
  assert.deepEqual(result.mentions[0]?.parentCountries, ["Nicaragua"]);
  assert.equal(result.mentions[0]?.status, "resolved");
});

test("bounded cache reuses canonical facts and one failed source cannot erase another", async () => {
  const calls: string[] = [];
  const cache: OpenWorldCandidateCache = new Map();
  const working = source({ salta: [candidate("salta", "Salta", "Argentina", "city", [-65.423, -24.783])] }, calls);
  const failing: OpenWorldPlaceSource = { id: "offline", label: "Offline", search: async () => { throw new Error("offline"); } };
  const provider = createOpenWorldPlaceProvider({ cache, sources: [failing, working], maxCacheEntries: 2 });

  const first = await provider.lookup("Salta", { travelIntent: "route-stop" });
  first[0]!.canonicalName = "mutated caller copy";
  const second = await provider.lookup("Salta", { travelIntent: "route-stop" });
  assert.equal(second[0]?.canonicalName, "Salta");
  assert.deepEqual(calls, ["Salta"]);
  assert.equal(cache.size, 1);
});

test("stale cached coordinates are discarded and refreshed through the provider boundary", async () => {
  const cache: OpenWorldCandidateCache = new Map([[
    JSON.stringify({ phrase: "cancun", intent: "route-stop", countries: ["mexico"], explicitCountries: [], explicitPlaceTypes: [], selected: [] }),
    {
      expiresAt: Date.now() + 60_000,
      candidates: [{ providerId: "stale:cancun", canonicalName: "Cancún", placeType: "city", parentCountries: ["Mexico"], coordinates: [999, 999], routability: "direct_destination" }],
    },
  ]]);
  const sourceCalls: string[] = [];
  const provider = createOpenWorldPlaceProvider({
    cache,
    sources: [source({ cancun: [candidate("cancun", "Cancún", "Mexico", "city", [-86.8515, 21.1619])] }, sourceCalls)],
  });

  const result = await provider.lookup("Cancun", { travelIntent: "route-stop", countryNames: ["Mexico"] });
  assert.deepEqual(result[0]?.coordinates, [-86.8515, 21.1619]);
  assert.deepEqual(sourceCalls, ["Cancun"]);
  assert.equal(cache.size, 1);
});

test("provider outages are not cached as a false unresolved result", async () => {
  const cache: OpenWorldCandidateCache = new Map();
  let available = false;
  let calls = 0;
  const recovering: OpenWorldPlaceSource = {
    id: "recovering",
    label: "Recovering global source",
    async search() {
      calls += 1;
      if (!available) throw new Error("temporary outage");
      return [candidate("angkor-wat", "Angkor Wat", "Cambodia", "landmark", [103.867, 13.413])];
    },
  };
  const provider = createOpenWorldPlaceProvider({ cache, sources: [recovering] });

  assert.deepEqual(await provider.lookup("Angkor Wat", { travelIntent: "anchor" }), []);
  assert.equal(cache.size, 0);
  available = true;
  assert.equal((await provider.lookup("Angkor Wat", { travelIntent: "anchor" }))[0]?.canonicalName, "Angkor Wat");
  assert.equal(calls, 2);
});

test("equivalent facts from multiple global sources do not become false ambiguity", async () => {
  const first = source({ uyuni: [
    { ...candidate("N:795493613", "Uyuni", "Bolivia", "city", [-66.8239, -20.4628], 145), parentRegionId: "Potosí" },
    { ...candidate("R:4137633", "Uyuni", "Bolivia", "region", [-66.9216, -20.1759], 142), parentRegionId: "Potosí", routability: "planning_area" },
  ] });
  const second: OpenWorldPlaceSource = {
    id: "second-global",
    label: "Second global source",
    async search() {
      return [candidate("node:795493613", "Uyuni", "Bolivia", "city", [-66.8241, -20.463], 140)];
    },
  };
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [first, second] });
  const candidates = await provider.lookup("Uyuni", { travelIntent: "route-stop" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.canonicalName, "Uyuni");
});

test("route-stop intent prefers a destination locality over similarly named businesses", async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [source({ huacachina: [
    candidate("huacachina", "Huacachina", "Peru", "town", [-75.763, -14.087], 140),
    { ...candidate("huacachina-hostal", "Huacachina Sunset Hostal", "Peru", "landmark", [-75.763, -14.088], 118), aliases: ["huacachina"], matchQuality: "alias" },
  ] })] });
  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Huacachina", role: "preferred", travelIntent: "route-stop" }],
    provider,
  );
  assert.equal(result.mentions[0]?.canonicalName, "Huacachina");
  assert.equal(result.mentions[0]?.placeType, "town");
  assert.equal(result.mentions[0]?.status, "resolved");
});

test("a hanging source is bounded while a healthy fallback still resolves", async () => {
  const hanging: OpenWorldPlaceSource = { id: "hanging", label: "Hanging source", search: async () => new Promise(() => {}) };
  const healthy = source({ salta: [candidate("salta", "Salta", "Argentina", "city", [-65.423, -24.783])] });
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [hanging, healthy], sourceTimeoutMs: 5 });
  const startedAt = Date.now();
  const candidates = await provider.lookup("Salta", { travelIntent: "route-stop" });
  assert.equal(candidates[0]?.canonicalName, "Salta");
  assert.ok(Date.now() - startedAt < 100);
});

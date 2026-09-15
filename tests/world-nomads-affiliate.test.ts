import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeCommercialOutboundClick } from "../lib/analytics.ts";
import { affiliateClickEventForAction } from "../lib/easyt/affiliate-click.ts";
import { affiliatePartners, getCurrentPartnerAction } from "../lib/easyt/booking-readiness.ts";
import { deriveTripPrepTasks } from "../lib/easyt/trip-prep.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { buildTripReadiness, defaultTravelReadinessProfile } from "../lib/easyt/travel-readiness.ts";

const canonicalUrl = "https://www.tkqlhce.com/click-101860495-15403748";
const mandatoryDisclosure = "We receive a fee when you get a quote from World Nomads using this link. We do not represent World Nomads. This is not a recommendation to buy travel insurance.";

const trip = (): EasyTTrip => ({
  schemaVersion: 1,
  id: "world-nomads-trip",
  ownerId: null,
  title: "London to Lisbon",
  status: "draft",
  startDate: "2026-10-01",
  endDate: "2026-10-06",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "London",
    mustDo: "",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: {},
    checklist: [{ id: "insurance", label: "Review travel insurance", complete: false }],
  },
  stops: [{ id: "lisbon", order: 0, name: "Lisbon", country: "Portugal", latitude: 38.72, longitude: -9.14, arrivalDate: "2026-10-01", departureDate: "2026-10-06", nights: 5 }],
  legs: [],
  planItems: [],
  recommendations: [],
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
});

test("World Nomads resolves centrally with the approved quote handoff", () => {
  const action = getCurrentPartnerAction("travel_insurance");
  assert.deepEqual(action, {
    provider: "world-nomads",
    category: "travel_insurance",
    href: canonicalUrl,
    cta: "Get a travel insurance quote",
    affiliate: true,
  });
  assert.equal(affiliatePartners.worldNomads.insuranceUrl, canonicalUrl);
});

test("international readiness surfaces the neutral Insurance action without changing completion truth", () => {
  const source = trip();
  const before = structuredClone(source);
  const action = getCurrentPartnerAction("travel_insurance")!;
  const cards = buildTripReadiness({
    countries: source.stops.map((stop) => stop.country),
    profile: defaultTravelReadinessProfile,
    insuranceAction: action,
  });
  const insurance = cards.find((card) => card.id === "insurance");
  assert.deepEqual(insurance, {
    id: "insurance",
    priority: "useful",
    title: "Insurance",
    detail: "Consider whether you need cover for your trip.",
    href: canonicalUrl,
    cta: "Get a travel insurance quote",
    partner: "world-nomads",
  });

  const task = deriveTripPrepTasks({
    trip: source,
    profile: defaultTravelReadinessProfile,
    bookingActions: [],
    readinessCards: cards,
  }).find((candidate) => candidate.id === "travel-insurance");
  assert.equal(task?.status, "to-do");
  assert.deepEqual(task?.action, {
    label: "Get a travel insurance quote",
    href: canonicalUrl,
    external: true,
    affiliate: true,
    provider: "world-nomads",
    bookingCategory: "insurance",
    affiliateCategory: "travel_insurance",
  });
  assert.deepEqual(source, before, "resolving the quote action must not mutate trip or readiness state");
});

test("the World Nomads click produces one privacy-safe canonical affiliate event", () => {
  const action = getCurrentPartnerAction("travel_insurance")!;
  const event = affiliateClickEventForAction(action, {
    placement: "overview_before_you_go",
    tripId: "world-nomads-trip",
    workspaceView: "overview",
  });
  assert.deepEqual(event, {
    name: "affiliate_click",
    properties: {
      category: "travel_insurance",
      provider: "world-nomads",
      placement: "overview_before_you_go",
      trip_id: "world-nomads-trip",
      stop_id: undefined,
      workspace_view: "overview",
      destination_count: undefined,
    },
  });
  assert.deepEqual(normalizeCommercialOutboundClick(event.name, event.properties), {
    canonical_event: "commercial_outbound_click",
    source_event: "affiliate_click",
    partner: "world_nomads",
    placement: "overview_before_you_go",
    category: "travel_insurance",
    trip_id: "world-nomads-trip",
    workspace_view: "overview",
  });
  assert.doesNotMatch(JSON.stringify(event), /href|url|destination|traveller|booking|passport|note|prompt/i);
});

test("Overview uses the shared outbound owner with the mandatory nearby disclosure", () => {
  const affiliateLink = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  const preparation = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  const readinessRoute = readFileSync("app/api/journey-readiness/route.ts", "utf8");
  const itinerary = readFileSync("components/easyt/trip-itinerary-workspace.tsx", "utf8");
  const map = readFileSync("components/easyt/trip-map-workspace.tsx", "utf8");
  const homepage = readFileSync("app/journey/home/immersive/affiliate-chapter.tsx", "utf8");

  assert.match(readinessRoute, /getCurrentPartnerAction\("travel_insurance"\)/);
  assert.match(preparation, /<MorroviaAffiliateLink/);
  assert.match(preparation, /placement: "overview_before_you_go"/);
  assert.match(affiliateLink, /target="_blank"/);
  assert.match(affiliateLink, /rel="sponsored noopener noreferrer"/);
  assert.ok(affiliateLink.includes(mandatoryDisclosure));
  assert.doesNotMatch(preparation, /tkqlhce/);
  assert.doesNotMatch(readinessRoute, /tkqlhce/);
  const sharedAffiliateBranch = preparation.match(/if \(action\.affiliate && \(action\.provider === "world-nomads" \|\| action\.provider === "saily"\)\) \{[\s\S]*?<\/MorroviaAffiliateLink>;/)?.[0] ?? "";
  assert.match(sharedAffiliateBranch, /renderAsSurface/);
  assert.doesNotMatch(sharedAffiliateBranch, /trackEvent\(/);
  for (const unrelatedSurface of [itinerary, map, homepage]) assert.doesNotMatch(unrelatedSurface, /World Nomads|world-nomads|tkqlhce/);
});

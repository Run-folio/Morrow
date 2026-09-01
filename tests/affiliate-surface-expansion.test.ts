import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCommercialOutboundClick } from "../lib/analytics.ts";
import { affiliateClickEventForAction } from "../lib/easyt/affiliate-click.ts";
import { affiliatePartners, getActivityBookingAction, getCurrentPartnerAction } from "../lib/easyt/booking-readiness.ts";

test("activity resolution prefers Viator, falls back to Trip.com, and fails closed", () => {
  const viator = getActivityBookingAction();
  const tripCom = getActivityBookingAction({ category: "activities" }, { viator: null, tripCom: affiliatePartners.tripCom });
  const unavailable = getActivityBookingAction({ category: "activities" }, { viator: null, tripCom: null });

  assert.deepEqual({ provider: viator?.provider, href: viator?.href }, { provider: "viator", href: affiliatePartners.viator.activitiesUrl });
  assert.deepEqual({ provider: tripCom?.provider, href: tripCom?.href }, { provider: "trip.com", href: affiliatePartners.tripCom.activitiesUrl });
  assert.equal(unavailable, undefined);
  assert.equal(viator?.href, "https://vi.me/IiuWB");
  assert.equal(tripCom?.href, "https://www.trip.com/t/zw8E7otA6W2");
});

test("current homepage partner actions retain only the approved generic destinations", () => {
  assert.equal(getCurrentPartnerAction("accommodation")?.href, affiliatePartners.tripCom.accommodationUrl);
  assert.equal(getCurrentPartnerAction("activities")?.href, affiliatePartners.viator.activitiesUrl);
  assert.equal(getCurrentPartnerAction("transport")?.href, affiliatePartners.omio.transportUrl);
  assert.equal(getCurrentPartnerAction("connectivity")?.href, affiliatePartners.saily.connectivityUrl);
});

test("one click selects one existing event and excludes private or free-text context", () => {
  const action = getCurrentPartnerAction("activities")!;
  const event = affiliateClickEventForAction(action, { placement: "itinerary_day_experiences", tripId: "opaque-trip", stopId: "opaque-stop", workspaceView: "itinerary" });
  assert.equal(event.name, "affiliate_link_clicked");
  assert.deepEqual(event.properties, {
    partner: "viator", placement: "itinerary_day_experiences", tripId: "opaque-trip", stopId: "opaque-stop",
    transferId: undefined, originStopId: undefined, destinationStopId: undefined,
  });
  assert.doesNotMatch(JSON.stringify(event), /prompt|notes|destination|booking|traveller|url|href/i);
  assert.equal(normalizeCommercialOutboundClick(event.name, event.properties)?.placement, "itinerary_day_experiences");
});

test("new surfaces reuse one outbound owner without trip or booking mutation", () => {
  const link = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  const itinerary = readFileSync("components/easyt/trip-itinerary-workspace.tsx", "utf8");
  const map = readFileSync("components/journey-itinerary-refinement.tsx", "utf8");
  const route = readFileSync("app/journey/routes/[slug]/route-detail-view.tsx", "utf8");
  const home = readFileSync("app/journey/home/home-footer.tsx", "utf8");

  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="sponsored noopener noreferrer"/);
  assert.equal((link.match(/trackEvent\(/g) ?? []).length, 2, "the mutually exclusive event branches are the only tracking calls");
  assert.doesNotMatch(link, /mutateTrip|setSelectedDay|mark.*booked|upsert.*booking|readiness.*complete/i);

  assert.match(itinerary, /onSchedule=\{scheduleSuggestion\}[\s\S]*experienceHandoff/);
  assert.match(itinerary, /placement: "itinerary_day_experiences"/);
  assert.doesNotMatch(itinerary.match(/experienceHandoff[\s\S]*?<\/section>/)?.[0] ?? "", /mutateTrip|onSchedule|setSelectedIndex/);
  assert.match(map, /Explore more on map[\s\S]*map_see_experiences/);
  assert.doesNotMatch(map.match(/experienceHandoff[\s\S]*?<\/section>/)?.[0] ?? "", /onSelectionChange|setMapMode|mutate/);
  assert.equal((route.match(/<RoutePlanLink/g) ?? []).length, 2);
  assert.equal((route.match(/<MorroviaAffiliateLink/g) ?? []).length, 1);
  assert.match(home, /Start my trip/);
  assert.match(home, /homepage_stays[\s\S]*homepage_experiences[\s\S]*homepage_transport[\s\S]*homepage_connectivity/);
});

test("each affiliate context renders one nearby disclosure and provider-neutral copy", () => {
  const files = [
    "components/easyt/trip-itinerary-workspace.tsx",
    "components/journey-itinerary-refinement.tsx",
    "app/journey/routes/[slug]/route-detail-view.tsx",
    "app/journey/home/home-footer.tsx",
  ];
  files.forEach((file) => {
    const source = readFileSync(file, "utf8");
    assert.equal((source.match(/\{affiliateDisclosure\}/g) ?? []).length, 1, file);
    assert.match(source, /affiliateProviderLabel/);
  });
});

test("Storybook covers provider fallback, unavailable, and responsive affiliate states", () => {
  const storyFiles = [
    "app/journey/home/home-footer.stories.tsx",
    "components/easyt/trip-itinerary-workspace.stories.tsx",
    "components/easyt/trip-map-workspace.stories.tsx",
    "app/journey/routes/[slug]/route-detail-view.stories.tsx",
  ];
  const stories = storyFiles.map((file) => readFileSync(file, "utf8")).join("\n");

  assert.match(stories, /ViatorAvailable|ActivityHandoffViator|AttractionHandoff/);
  assert.match(stories, /TripComActivitiesFallback|ActivityHandoffTripComFallback|AttractionHandoffTripComFallback/);
  assert.match(stories, /NoActivityProvider|ActivityHandoffUnavailable|AttractionHandoffUnavailable/);
  assert.match(stories, /LongDestination|LongerFourStopRoute/);
  assert.match(stories, /Mobile390/);
  assert.match(stories, /Desktop1440/);
});

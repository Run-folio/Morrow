import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("one canonical nearby disclosure covers commission and the third-party booking boundary", () => {
  const shared = read("components/easyt/affiliate-link.tsx");
  const renderers = [
    "app/journey/home/home-footer.tsx",
    "components/easyt/destination-accommodation-module.tsx",
    "components/easyt/trip-itinerary-workspace.tsx",
    "components/easyt/trip-overview-workspace.tsx",
    "components/easyt/trip-preparation.tsx",
    "components/journey-itinerary-accommodation.tsx",
    "components/journey-itinerary-refinement.tsx",
    "components/journey-local-finder.tsx",
    "app/journey/routes/[slug]/route-detail-view.tsx",
  ];

  assert.match(shared, /Morrovia may earn a commission at no extra cost to you/);
  assert.match(shared, /Booking, payment and provider terms apply on the partner’s site/);
  for (const renderer of renderers) assert.match(read(renderer), /affiliateDisclosure/, renderer);
});

test("the full disclosure names providers, ranking independence, payment and click boundaries", () => {
  const source = read("app/journey/affiliate-disclosure/page.tsx");
  for (const provider of ["Trip.com", "Viator", "Omio", "Saily", "Booking.com"]) assert.match(source, new RegExp(provider.replace(".", "\\.")));
  assert.match(source, /Affiliate commission does not determine route ranking/);
  assert.match(source, /Opening a partner link is not a booking/);
  assert.match(source, /Morrovia does not currently accept payment/);
  assert.match(source, /provider’s current prices, availability, inventory, contract terms, privacy notice, cancellation and refund rules apply/);
  assert.match(source, /saved booking record/);
  assert.match(source, /morroviaLegalIdentity\.operatorTradingAs/);
});

test("generic handoffs use comparison copy and do not present unconfirmed live inventory or prices", () => {
  const readiness = read("lib/easyt/booking-readiness.ts");
  const overview = read("components/easyt/trip-overview-workspace.tsx");
  const finder = read("components/journey-local-finder.tsx");

  assert.doesNotMatch(readiness, /Availability and prices are confirmed by Trip\.com|Check live options|compare live options|fares remain live/);
  assert.match(readiness, /Confirm final availability, price, payment and provider terms on Trip\.com/);
  assert.match(readiness, /confirm fares and availability on Google Flights/);
  assert.doesNotMatch(overview, /Compare live options/);
  assert.match(overview, /open a separate Trip\.com search/);
  assert.doesNotMatch(finder, /Trip\.com confirms its own availability|Check live options on Trip\.com/);
  assert.match(finder, /matching Booking\.com room product/);
  assert.match(finder, /Trip\.com link below opens a separate partner search/);
});

test("affiliate clicks retain safe new-tab semantics, one event path and no completion mutation", () => {
  const shared = read("components/easyt/affiliate-link.tsx");
  const event = read("lib/easyt/affiliate-click.ts");
  const readiness = read("lib/easyt/booking-readiness.ts");
  const transportProgress = readiness.match(/export function transportBookingProgress[\s\S]*?\n\}/)?.[0] ?? "";
  const selector = event.match(/export function affiliateClickEventForAction[\s\S]*$/)?.[0] ?? "";

  assert.match(shared, /target="_blank"/);
  assert.match(shared, /rel="sponsored noopener noreferrer"/);
  assert.match(event, /Pure event selection: a single click can resolve to exactly one source event/);
  assert.equal((selector.match(/name: "affiliate_link_clicked"/g) ?? []).length, 1);
  assert.equal((selector.match(/name: "affiliate_click"/g) ?? []).length, 1);
  assert.doesNotMatch(`${shared}\n${event}`, /mark.*booked|readiness.*complete|set.*complete|upsert.*booking|mutateTrip/i);
  assert.match(transportProgress, /transportBookingForLeg/);
  assert.doesNotMatch(transportProgress, /affiliate|click|analytics/i);
});

test("affiliate economics are absent from route and recommendation ranking", () => {
  const rankingSources = [
    "lib/easyt/planner.ts",
    "lib/easyt/itinerary-day-context.ts",
    "lib/easyt/itinerary-ideas.ts",
    "lib/easyt/recommendations.ts",
    "lib/easyt/place-intelligence.ts",
  ];
  for (const source of rankingSources) assert.doesNotMatch(read(source), /affiliate|commission|revenue[-_ ]?weight/i, source);

  const finder = read("components/journey-local-finder.tsx");
  const rankingBlock = finder.match(/const candidates = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[displayPlaces/)?.[0] ?? "";
  assert.ok(rankingBlock);
  assert.doesNotMatch(rankingBlock, /affiliate|commission|revenue/i);
});

test("commercial Storybook coverage includes public, signed-in, 390px and desktop states", () => {
  const home = read("app/journey/home/home-footer.stories.tsx");
  const overview = read("components/easyt/trip-overview-workspace.stories.tsx");
  const itinerary = read("components/easyt/trip-itinerary-workspace.stories.tsx");
  const map = read("components/easyt/trip-map-workspace.stories.tsx");

  assert.match(home, /Mobile390/);
  assert.match(home, /Desktop1440/);
  assert.match(overview, /ownerId: "storybook-traveller"/);
  assert.match(overview, /ProviderUnavailable/);
  assert.match(overview, /Mobile390/);
  assert.match(overview, /Desktop1440/);
  assert.match(itinerary, /ActivityHandoffUnavailable/);
  assert.match(itinerary, /AccommodationNeededMobile390/);
  assert.match(map, /AttractionHandoffUnavailable/);
  assert.match(map, /CompositionStayResults/);
  assert.match(map, /Mobile390/);
});

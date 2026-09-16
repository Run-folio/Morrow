import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const transport = readFileSync(new URL("../components/easyt/trip-transport-workspace.tsx", import.meta.url), "utf8");
const transportStyles = readFileSync(new URL("../components/easyt/trip-transport-workspace.module.css", import.meta.url), "utf8");
const projection = readFileSync(new URL("../lib/easyt/itinerary-transport-agenda.ts", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-transport-workspace.stories.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/easyt/trip-shell-client.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/journey/[tripId]/transport/page.tsx", import.meta.url), "utf8");

test("Transport is first-class while Itinerary exposes Day by day and Calendar", () => {
  assert.match(shell, /label: "Transport"[\s\S]*suffix: "\/transport"/);
  assert.match(route, /useTripShellTrip\(\)/);
  assert.match(route, /<TripTransportWorkspace trip=\{trip\}/);
  assert.match(itinerary, /useState<"days" \| "calendar">\("days"\)/);
  assert.match(itinerary, /\{ value: "days", label: copy\.dayByDay \}/);
  assert.match(itinerary, /\{ value: "calendar", label: copy\.calendar \}/);
  assert.doesNotMatch(itinerary, /function TransportAgenda\(/);
  assert.doesNotMatch(itinerary, /value: "transport", label: copy\.transport/);
});

test("Transport remains a read-only projection of canonical legs, endpoints, dates and bookings", () => {
  assert.match(projection, /trip\.legs\.flatMap/);
  assert.match(projection, /routeEndpointForLeg\(trip, leg, "from"\)/);
  assert.match(projection, /routeEndpointForLeg\(trip, leg, "to"\)/);
  assert.match(projection, /transportBookingForLeg\(trip, leg, fromStop, toStop\)/);
  assert.match(projection, /to\.kind === "end"/);
  assert.doesNotMatch(projection, /mutate|setTrip|fetch\(/);
  assert.doesNotMatch(transport, /useTripMutationPersistence|useTripShellMutation|mutateTrip|setTrip/);
});

test("transport rows expose route, mode, duration, uncertainty, details and truthful booking evidence", () => {
  assert.match(transport, /item\.from\.name[\s\S]*item\.to\.name/);
  assert.match(transport, /transferJourneyModeLabel\(leg\)/);
  assert.match(transport, /leg\.doorToDoorMinutes \?\? leg\.durationMinutes/);
  assert.match(transport, /data-status=\{item\.status\}/);
  assert.match(transport, /<details className=\{styles\.details\}>/);
  assert.match(transport, /item\.booking\?\.url/);
  assert.match(transport, /item\.booking \? null : omioBookingActionForLeg\(trip, leg\)/);
  assert.match(transport, /durationMinutes === null \? null/);
});

test("Omio uses the existing affiliate handoff and cannot mutate canonical state", () => {
  assert.match(transport, /function OmioAction/);
  assert.match(transport, /<MorroviaAffiliateLink action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /placement: "itinerary_transfer"/);
  assert.match(transport, /action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /findTickets: "Find tickets"/);
  assert.match(transport, /cta: label \}\}[\s\S]*variant="secondary"/);
  assert.match(transport, /<MorroviaPartnerPromotion action=\{action\} presentation="compact"/);
  assert.match(transport, /<small>\{affiliateDisclosure\}<\/small>/);
  const action = transport.slice(transport.indexOf("function OmioAction"));
  assert.doesNotMatch(action, /mutate|booked\s*=|status\s*=|fetch\(/);
});

test("Transport keeps planning information above a subordinate compact partner handoff", () => {
  assert.ok(transport.indexOf("displayDate(group.date, language)") < transport.indexOf("<TransportRow"));
  assert.ok(transport.indexOf("item.from.name") < transport.indexOf("transferJourneyModeLabel(leg)"));
  assert.ok(transport.indexOf("transferJourneyModeLabel(leg)") < transport.indexOf("segmentSummary ?"));
  assert.ok(transport.indexOf("segmentSummary ?") < transport.indexOf("data-status={item.status}"));
  assert.ok(transport.indexOf("data-status={item.status}") < transport.indexOf("<div className={styles.actions}>"));
  assert.match(transportStyles, /\.workspace \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.match(transportStyles, /\.card \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.match(transportStyles, /\.details \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.doesNotMatch(transportStyles, /background: var\(--morrovia-lilac(?:-strong)?\)/);
  assert.match(transportStyles, /\.omioAction > small \{[\s\S]*font: var\(--morrovia-type-fine-print\)/);
});

test("the first-class workspace has responsive Storybook coverage and narrow-screen containment", () => {
  for (const story of ["CanonicalAgendaMobile320", "CanonicalAgendaMobile390", "CanonicalAgendaMobile430", "CanonicalAgendaTablet768", "CanonicalAgendaDesktop1024", "CanonicalAgendaDesktop1440", "PartialUnknownTransport"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  assert.match(transportStyles, /@media \(max-width: 540px\)[\s\S]*--morrovia-mobile-dock-offset/);
  assert.match(transportStyles, /\.route h4 \{[\s\S]*overflow-wrap: anywhere/);
  assert.match(transportStyles, /\.details > summary \{[\s\S]*min-height: 40px/);
  assert.match(transportStyles, /@media \(max-width: 540px\)[\s\S]*\.details > summary \{ min-height: 44px/);
});

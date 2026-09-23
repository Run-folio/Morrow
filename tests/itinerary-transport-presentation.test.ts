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

test("Transport derives its agenda and mutates only the shared canonical leg choice", () => {
  assert.match(projection, /trip\.legs\.flatMap/);
  assert.match(projection, /routeEndpointForLeg\(trip, leg, "from"\)/);
  assert.match(projection, /routeEndpointForLeg\(trip, leg, "to"\)/);
  assert.match(projection, /transportBookingForLeg\(trip, leg, fromStop, toStop\)/);
  assert.match(projection, /to\.kind === "end"/);
  assert.doesNotMatch(projection, /mutate|setTrip|fetch\(/);
  assert.match(transport, /useTripShellMutation/);
  assert.match(transport, /TripTransportChoiceControl/);
  assert.match(transport, /selectTripLegTransportChoice\(current, leg\.id, identity\)/);
  assert.match(transport, /clearTripLegTransportChoice\(current, leg\.id\)/);
  assert.doesNotMatch(transport, /useTripMutationPersistence|setTrip|legs:\s*trip\.legs\.map/);
});

test("Transport presents a calm chronological journey list with one contextual action", () => {
  assert.match(transport, /item\.from\.name[\s\S]*item\.to\.name/);
  assert.match(transport, /transferJourneyModeLabel\(leg\)/);
  assert.match(transport, /leg\.doorToDoorMinutes \?\? leg\.durationMinutes/);
  assert.match(transport, /data-knowledge=\{knowledge\}/);
  assert.match(transport, /View details/);
  assert.match(transport, /item\.booking\?\.url/);
  assert.match(transport, /item\.booking \? null : omioBookingActionForLeg\(trip, leg\)/);
  assert.match(transport, /durationMinutes === null \? null/);
  assert.doesNotMatch(transport, /<details className=\{styles\.details\}>/);
  assert.doesNotMatch(transport, /copy\.distance|copy\.confidence|copy\.source/);
});

test("Omio uses the existing affiliate handoff and cannot mutate canonical state", () => {
  assert.match(transport, /function OmioAction/);
  assert.match(transport, /<MorroviaAffiliateLink action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /placement: "itinerary_transfer"/);
  assert.match(transport, /action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /findTickets: "Find options"/);
  assert.match(transport, /cta: label \}\}[\s\S]*variant="secondary"/);
  assert.doesNotMatch(transport, /MorroviaPartnerPromotion|Contact support|Need help/);
  assert.match(transport, /<small>\{affiliateDisclosure\}<\/small>/);
  const action = transport.slice(transport.indexOf("function OmioAction"));
  assert.doesNotMatch(action, /mutate|booked\s*=|status\s*=|fetch\(/);
});

test("Transport keeps planning information above a subordinate selected-journey handoff", () => {
  assert.ok(transport.indexOf("item.from.name") < transport.indexOf("transferJourneyModeLabel(leg)"));
  assert.ok(transport.indexOf("transferJourneyModeLabel(leg)") < transport.indexOf("noteForJourney(item, copy)"));
  assert.match(transportStyles, /\.workspace \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.match(transportStyles, /\.card \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.doesNotMatch(transportStyles, /background: var\(--morrovia-lilac(?:-strong)?\)/);
  assert.match(transportStyles, /\.omioAction > small \{[\s\S]*font: var\(--morrovia-type-fine-print\)/);
});

test("Transport synchronizes one occurrence-safe selected journey with the canonical map projection", () => {
  assert.match(transport, /useState<string \| null>\(items\[0\]\?\.leg\.id \?\? null\)/);
  assert.match(transport, /tripWithEffectiveTransportChoices\(trip\)/);
  assert.match(transport, /mapRouteLegsFromTrip\(effectiveTrip\)/);
  assert.match(transport, /<JourneyPlannerMap/);
  assert.match(transport, /selectedLegId=\{selectedLegId\}/);
  assert.match(transport, /onLegSelect=\{\(leg\) => setSelectedLegId\(leg\.id\)\}/);
  assert.match(transport, /data-selected=\{selected \? "true" : undefined\}/);
  assert.match(transportStyles, /grid-template-columns:\s*minmax\(0,\s*1\.08fr\)\s+minmax\(320px,\s*\.92fr\)/);
});

test("Transport preserves the list when the map is unavailable and keeps mobile list-first", () => {
  assert.match(transport, /onLifecycleChange=\{setMapLifecycle\}/);
  assert.match(transport, /mapLifecycle === "unavailable"/);
  assert.match(transport, /Show route map/);
  assert.match(transportStyles, /@media \(max-width: 820px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(transportStyles, /@media \(max-width: 820px\)[\s\S]*\.mapPanel\[data-mobile-open="false"\]\s*\{[\s\S]*display:\s*none/);
  assert.match(transportStyles, /overflow-x:\s*clip/);
});

test("the first-class workspace has responsive Storybook coverage and narrow-screen containment", () => {
  for (const story of ["CanonicalAgendaMobile320", "CanonicalAgendaMobile390", "CanonicalAgendaMobile430", "CanonicalAgendaTablet768", "CanonicalAgendaDesktop1024", "CanonicalAgendaDesktop1440", "PartialUnknownTransport", "EvidenceBackedModeChoice", "ExplicitTravellerChoice"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  assert.match(transportStyles, /@media \(max-width: 820px\)[\s\S]*--morrovia-mobile-dock-offset/);
  assert.match(transportStyles, /\.cardBody h3,[\s\S]*overflow-wrap: anywhere/);
  assert.match(transportStyles, /@media \(max-width: 540px\)[\s\S]*grid-template-columns: 26px 36px minmax\(0, 1fr\)/);
});

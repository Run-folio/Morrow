import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.module.css", import.meta.url), "utf8");
const projection = readFileSync(new URL("../lib/easyt/itinerary-transport-agenda.ts", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");

test("Itinerary adds one accessible subview switch and keeps Day by day as the default", () => {
  assert.match(itinerary, /useState<"days" \| "transport">\("days"\)/);
  assert.match(itinerary, /<EasyTSegmentedControl[\s\S]*ariaLabel="Itinerary view"/);
  assert.match(itinerary, /\{ value: "days", label: copy\.dayByDay \}/);
  assert.match(itinerary, /\{ value: "transport", label: copy\.transport \}/);
  assert.match(itinerary, /role="region" aria-labelledby=\{`\$\{panelId\}-heading`\}/);
  assert.doesNotMatch(itinerary, /role="tab"[^>]*>Transport/);
});

test("Transport is a read-only projection of canonical legs, endpoints, dates and bookings", () => {
  assert.match(projection, /trip\.legs\.flatMap/);
  assert.match(projection, /routeEndpointForLeg\(trip, leg, "from"\)/);
  assert.match(projection, /routeEndpointForLeg\(trip, leg, "to"\)/);
  assert.match(projection, /transportBookingForLeg\(trip, leg, fromStop, toStop\)/);
  assert.match(projection, /to\.kind === "end"/);
  assert.doesNotMatch(projection, /mutate|setTrip|fetch\(/);

  const agendaStart = itinerary.indexOf("function TransportAgenda(");
  const agendaEnd = itinerary.indexOf("function ItineraryDaySuggestions", agendaStart);
  const agenda = itinerary.slice(agendaStart, agendaEnd);
  assert.ok(agendaStart > -1 && agendaEnd > agendaStart);
  assert.doesNotMatch(agenda, /mutation\.|mutateTrip|onTripApplied|fetch\(/);
});

test("transport rows expose route, mode, duration, uncertainty, details and truthful booking evidence", () => {
  assert.match(itinerary, /item\.from\.name[\s\S]*item\.to\.name/);
  assert.match(itinerary, /transferJourneyModeLabel\(leg\)/);
  assert.match(itinerary, /leg\.doorToDoorMinutes \?\? leg\.durationMinutes/);
  assert.match(itinerary, /data-status=\{item\.status\}/);
  assert.match(itinerary, /<details className=\{styles\.transportDetails\}>/);
  assert.match(itinerary, /item\.booking\?\.url/);
  assert.match(itinerary, /item\.booking \? null : omioBookingActionForLeg\(trip, leg\)/);
});

test("Omio uses the existing canonical affiliate link and cannot mutate booking state", () => {
  assert.match(itinerary, /function OmioTransportAction/);
  assert.match(itinerary, /<MorroviaAffiliateLink action=\{action\}/);
  assert.match(itinerary, /placement: "itinerary_transfer"/);
  assert.match(itinerary, /<MorroviaPartnerPromotion action=\{action\}/);
  const actionStart = itinerary.indexOf("function OmioTransportAction");
  const actionEnd = itinerary.indexOf("function ItineraryDaySuggestions", actionStart);
  assert.doesNotMatch(itinerary.slice(actionStart, actionEnd), /mutate|booked\s*=|status\s*=/);
});

test("the agenda has responsive Storybook coverage and clears the mobile dock", () => {
  for (const story of ["TransportAgenda", "TransportAgendaMobile390", "TransportAgendaTablet768", "TransportAgendaDesktop1440"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.transportAgenda \{[\s\S]*--morrovia-mobile-dock-offset/);
  assert.match(styles, /\.transportDetails > summary \{[\s\S]*min-height: 40px/);
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.transportDetails > summary \{ min-height: 44px/);
  assert.match(styles, /\.transportRoute h4 \{[\s\S]*overflow-wrap: anywhere/);
});

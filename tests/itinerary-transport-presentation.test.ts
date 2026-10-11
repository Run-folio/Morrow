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
const transportPage = readFileSync(new URL("../components/easyt/trip-transport-workspace-page.tsx", import.meta.url), "utf8");

test("Transport is first-class while Itinerary exposes Day by day and Calendar", () => {
  assert.match(shell, /label: "Transport"[\s\S]*suffix: "\/transport"/);
  assert.match(route, /<TripTransportWorkspacePage\s*\/>/);
  assert.doesNotMatch(route, /"use client"/);
  assert.match(transportPage, /"use client"/);
  assert.match(transportPage, /useTripShellTrip\(\)/);
  assert.match(transportPage, /<TripWorkspaceCommit view="transport"><TripTransportWorkspace trip=\{trip\}/);
  assert.match(itinerary, /useState<"days" \| "calendar">\("days"\)/);
  assert.match(itinerary, /\{ value: "days", label: copy\.dayByDay \}/);
  assert.match(itinerary, /\{ value: "calendar", label: copy\.calendar \}/);
  assert.doesNotMatch(itinerary, /function TransportAgenda\(/);
  assert.doesNotMatch(itinerary, /value: "transport", label: copy\.transport/);
});

test("selected-day logistics does not repeat the next destination's transfer", () => {
  assert.match(itinerary, /const logisticsLegs = itineraryDayLegs\(workingTrip, active\)\.filter\(\(leg\) => dayComposition\?\.transfers\.some\(\(transfer\) => transfer\.id === leg\.id\)\)/);
  assert.match(itinerary, /logisticsLegs\.map\(\(leg\) => <LogisticsLeg/);
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
  assert.match(transport, /data-knowledge=\{transportJourneyKnowledge\(leg\)\}/);
  assert.match(transport, /View details/);
  assert.match(transport, /item\.booking\?\.url/);
  assert.match(transport, /item\.booking \? null : transportAffiliateActionForLeg\(trip, leg\)/);
  assert.match(transport, /data-presentation-state=\{state\}/);
  assert.match(transport, /data-knowledge=\{transportJourneyKnowledge\(leg\)\}/);
  assert.match(transport, /durationMinutes === null \? null/);
  assert.doesNotMatch(transport, /<details className=\{styles\.details\}>/);
  assert.doesNotMatch(transport, /copy\.distance|copy\.confidence|copy\.source/);
});

test("transport partners use the existing affiliate handoff and cannot mutate canonical state", () => {
  assert.match(transport, /function TransportAffiliateAction/);
  assert.match(transport, /<MorroviaAffiliateLink action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /placement: "itinerary_transfer"/);
  assert.match(transport, /action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /cta: label \}\}[\s\S]*variant="secondary"/);
  assert.doesNotMatch(transport, /MorroviaPartnerPromotion|Contact support|Need help/);
  assert.match(transport, /<small>\{affiliateDisclosure\}<\/small>/);
  const action = transport.slice(transport.indexOf("function TransportAffiliateAction"));
  assert.doesNotMatch(action, /mutate|booked\s*=|status\s*=|fetch\(/);
});

test("Transport keeps planning information above a subordinate selected-journey handoff", () => {
  assert.ok(transport.indexOf("item.from.name") < transport.indexOf("transferJourneyModeLabel(leg)"));
  assert.ok(transport.indexOf("transferJourneyModeLabel(leg)") < transport.indexOf("noteForJourney(item, copy, language)"));
  assert.match(transportStyles, /\.workspace \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.match(transportStyles, /\.card \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.doesNotMatch(transportStyles, /background: var\(--morrovia-lilac(?:-strong)?\)/);
  assert.match(transportStyles, /\.omioAction > small \{[\s\S]*font: var\(--morrovia-type-fine-print\)/);
});

test("Transport synchronizes one occurrence-safe selected journey with the canonical map projection", () => {
  assert.match(transport, /useState<string \| null>\(orientation\.legId \?\? items\[0\]\?\.leg\.id \?\? null\)/);
  assert.match(transport, /parseTransportWorkspaceTarget\(trip, searchParams\)/);
  assert.match(transport, /window\.history\.pushState/);
  assert.match(transport, /tripWithEffectiveTransportChoices\(trip\)/);
  assert.match(transport, /mapRouteLegsFromTrip\(effectiveTrip\)/);
  assert.match(transport, /<JourneyPlannerMap/);
  assert.match(transport, /selectedLegId=\{selectedLegId\}/);
  assert.match(transport, /onLegSelect=\{\(leg\) => selectJourney\(leg\.id\)\}/);
  assert.match(transport, /const selectJourney = \(id: string\) => \{\s*setSelectedLegId\(id\)/);
  assert.match(transport, /data-selected=\{selected \? "true" : undefined\}/);
  assert.match(transportStyles, /grid-template-columns:\s*minmax\(0,\s*1\.08fr\)\s+minmax\(320px,\s*\.92fr\)/);
  assert.doesNotMatch(transport, /cameraOcclusions=\{transportCameraOcclusions\}/);
  assert.doesNotMatch(transport, /detailRailRef|mapPanelRef|transportCameraOcclusions/);
});

test("Transport preserves the list when the map is unavailable and keeps mobile list-first", () => {
  assert.match(transport, /onLifecycleChange=\{setMapLifecycle\}/);
  assert.match(transport, /mapLifecycle === "unavailable"/);
  assert.match(transport, /Show route map/);
  assert.match(transportStyles, /@media \(max-width: 820px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(transportStyles, /@media \(max-width: 820px\)[\s\S]*\.mapPanel\[data-mobile-open="false"\]\s*\{[\s\S]*display:\s*none/);
  assert.match(transportStyles, /overflow-x:\s*clip/);
});

test("Transport summary and cards use traveller-facing states, mode-aware copy, and detail-only handoffs", () => {
  assert.match(transport, /transportPresentationCounts\(items\)/);
  assert.match(transport, /planningEstimate: "Planning estimate"/);
  assert.match(transport, /roadEstimateNote/);
  assert.doesNotMatch(transport, /Planning estimate; check live schedules before booking\./);
  assert.match(transport, /Compare car hire/);
  assert.match(transport, /transportAffiliateActionForLeg\(trip, leg\)/);
  assert.match(transport, /MorroviaAffiliateLink action=\{\{ \.\.\.action, cta: label \}\}/);
  assert.match(transport, /affiliateDisclosure/);
  assert.equal((transport.match(/<MorroviaAffiliateLink/g) ?? []).length, 1);
});

test("Transport traveller-facing copy has English and Spanish parity", () => {
  assert.match(transport, /planningEstimate: "Estimación de planificación"/);
  assert.match(transport, /checkTimetable: "Consultar horario"/);
  assert.match(transport, /checkService: "Confirmar servicio"/);
  assert.match(transport, /needsCheckingStatus: "Necesita comprobarse"/);
  assert.match(transport, /roadEstimateNote/);
  assert.match(transport, /formatRoadEstimateReference\(item\.leg\.roadEstimate, language\)/);
  assert.match(transport, /No se ha confirmado un servicio de pasajeros/);
});

test("the first-class workspace has responsive Storybook coverage and narrow-screen containment", () => {
  for (const story of ["NamibiaSelfDrivePlanningEstimates", "CanonicalAgendaMobile320", "CanonicalAgendaMobile390", "CanonicalAgendaMobile430", "CanonicalAgendaTablet768", "CanonicalAgendaDesktop1024", "CanonicalAgendaDesktop1440", "PartialUnknownTransport", "RoadReferenceWithoutSelectedMode", "EvidenceBackedModeChoice", "ExplicitTravellerChoice"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  assert.match(transportStyles, /@media \(max-width: 820px\)[\s\S]*--morrovia-mobile-dock-offset/);
  assert.match(transportStyles, /\.cardBody h3,[\s\S]*overflow-wrap: anywhere/);
  assert.match(transportStyles, /@media \(max-width: 540px\)[\s\S]*grid-template-columns: 26px 36px minmax\(0, 1fr\)/);
});

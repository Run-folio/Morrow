import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip, TripLeg } from "@/lib/easyt/trip";
import { cancunReturnTripFixture } from "./storybook/cancun-return-trip.fixture";
import TripShell from "./trip-shell";
import TripTransportWorkspace from "./trip-transport-workspace";
import { selectTripLegTransportChoice, supportedTransportChoicesForLeg } from "@/lib/easyt/transport-mode-choice";

const transportTrip: EasyTTrip = {
  ...cancunReturnTripFixture,
  id: "storybook-first-class-transport",
  brief: {
    ...cancunReturnTripFixture.brief,
    bookings: cancunReturnTripFixture.legs[1] ? [{
      id: `transport-${cancunReturnTripFixture.legs[1].id}`,
      type: "transport",
      title: "Confirmed regional connection",
      date: cancunReturnTripFixture.planItems.find((day) => day.stopId === cancunReturnTripFixture.legs[1]?.toStopId)?.date ?? null,
      confirmation: "STORY-TRANSPORT",
      url: "https://www.example.com/booking",
    }] : [],
  },
  legs: cancunReturnTripFixture.legs.map((leg, index) => index === 2 ? {
    ...leg,
    mode: "unknown",
    durationMinutes: null,
    headlineMinutes: null,
    doorToDoorMinutes: null,
    confidence: "unknown",
    scheduleNeedsChecking: true,
    warnings: ["This cross-border connection needs live service confirmation."],
  } : leg),
};

const roadReferenceTrip: EasyTTrip = {
  ...transportTrip,
  id: "storybook-road-reference-without-selected-mode",
  title: "Central Asia road reference",
  legs: transportTrip.legs.map((leg, index) => index === 2 ? {
    ...leg,
    mode: "unknown",
    distanceKm: null,
    durationMinutes: null,
    headlineMinutes: null,
    doorToDoorMinutes: null,
    roadEstimate: {
      provider: "openrouteservice",
      profile: "driving-car",
      provenance: "routed",
      checkedAt: "2026-10-05T12:00:00.000Z",
      distanceKm: 245,
      durationMinutes: 270,
      confidence: "medium",
      routeGeometry: [[76.886, 43.2389], [75.7, 43.05], [74.5698, 42.8746]],
      attribution: "Road route reference · OpenRouteService",
      warnings: [
        "Road estimate only; no passenger service or private-driver availability is confirmed.",
        "Border crossing eligibility, waits and stops are not included in this road estimate.",
      ],
    },
  } : leg),
};

const namibiaStops = [
  ["windhoek", "Windhoek", [17.0832, -22.5609], "2026-10-01", "2026-10-02", 1],
  ["sossusvlei", "Sossusvlei", [15.2928, -24.7333], "2026-10-02", "2026-10-04", 2],
  ["swakopmund", "Swakopmund", [14.5266, -22.6784], "2026-10-04", "2026-10-06", 2],
  ["damaraland", "Damaraland", [14.5, -20.5], "2026-10-06", "2026-10-08", 2],
  ["etosha", "Etosha", [16.0, -19.2], "2026-10-08", "2026-10-11", 3],
  ["waterberg", "Waterberg", [17.25, -20.5], "2026-10-11", "2026-10-13", 2],
  ["windhoek-return", "Windhoek", [17.0832, -22.5609], "2026-10-13", "2026-10-14", 1],
] as const;
const namibiaRouteStops = namibiaStops.map(([id, name, [longitude, latitude], arrivalDate, departureDate, nights], order) => ({
  id, name, country: "Namibia", canonicalPlaceId: id.startsWith("windhoek") ? "windhoek" : id, longitude, latitude, order, arrivalDate, departureDate, nights,
}));
const namibiaDurations = [390, 225, 225, 240, 195, 210];
const namibiaLegs: TripLeg[] = namibiaDurations.map((durationMinutes, index) => {
  const from = namibiaRouteStops[index]!;
  const to = namibiaRouteStops[index + 1]!;
  return {
    id: `namibia-road-${index + 1}`, fromStopId: from.id, toStopId: to.id, classification: "intercity", mode: "road",
    distanceKm: null, durationMinutes, doorToDoorMinutes: durationMinutes, headlineMinutes: durationMinutes,
    provider: "Morrovia planning estimate", provenance: "planning_estimate", confidence: "medium", scheduleNeedsChecking: true, warnings: [],
    fromEndpoint: { kind: "stop", id: from.id, name: from.name, country: from.country, canonicalPlaceId: from.canonicalPlaceId, coordinates: [from.longitude, from.latitude] },
    toEndpoint: { kind: "stop", id: to.id, name: to.name, country: to.country, canonicalPlaceId: to.canonicalPlaceId, coordinates: [to.longitude, to.latitude] },
    routeMetadata: { planningEstimate: true },
  };
});
const namibiaTransportTrip: EasyTTrip = {
  ...transportTrip,
  id: "storybook-namibia-road-transport",
  title: "Namibia",
  status: "planned",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  brief: { ...transportTrip.brief, origin: "Windhoek", bookings: [], journeyEnd: { mode: "same_as_start" } },
  stops: namibiaRouteStops,
  legs: namibiaLegs,
  planItems: [],
};

const choiceLeg = transportTrip.legs[0];
const choiceFrom = choiceLeg.fromEndpoint ?? { kind: "origin" as const, id: choiceLeg.fromStopId ?? "origin", name: "Cancún", country: "Mexico", coordinates: [-86.8515, 21.1619] as [number, number] };
const choiceTo = choiceLeg.toEndpoint ?? { kind: "stop" as const, id: choiceLeg.toStopId, name: "Tulum", country: "Mexico", coordinates: [-87.4654, 20.2114] as [number, number] };
const choiceCandidate = {
  id: "road:routed:storybook",
  summaryMode: "road" as const,
  segments: [{
    id: `${choiceLeg.id}:road:storybook`,
    mode: "road" as const,
    fromEndpoint: choiceFrom,
    toEndpoint: choiceTo,
    distanceKm: choiceLeg.distanceKm,
    durationMinutes: 110,
    provider: "OpenRouteService routed road estimate.",
    provenance: "routing_engine" as const,
    confidence: "medium" as const,
    scheduleNeedsChecking: true,
  }],
  totalDurationMinutes: 110,
  distanceKm: choiceLeg.distanceKm,
  confidence: "medium" as const,
  provenance: "routing_engine" as const,
  evidence: "routed_road",
  connectionCount: 0,
  score: 60,
  reasons: ["A road provider returned a plausible route."],
};
const modeChoiceTrip: EasyTTrip = {
  ...transportTrip,
  id: "storybook-transport-mode-choice",
  legs: transportTrip.legs.map((leg, index) => index === 0 ? {
    ...leg,
    routeMetadata: {
      ...leg.routeMetadata,
      multimodalResolution: {
        version: 1,
        selected: leg.mode,
        selectedCandidateId: "morrovia:recommendation",
        candidates: [choiceCandidate],
        rejected: [],
      },
    },
  } : leg),
};
const explicitChoice = supportedTransportChoicesForLeg(modeChoiceTrip, modeChoiceTrip.legs[0])[0];
const explicitChoiceTrip = explicitChoice
  ? selectTripLegTransportChoice(modeChoiceTrip, modeChoiceTrip.legs[0].id, explicitChoice.identity)
  : modeChoiceTrip;

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Transport",
  component: TripTransportWorkspace,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/journey/storybook-first-class-transport/transport" },
    },
  },
  decorators: [
    (Story, context) => <TripShell trip={context.args.trip as EasyTTrip}><Story /></TripShell>,
  ],
  args: { trip: transportTrip },
} satisfies Meta<typeof TripTransportWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CanonicalAgenda: Story = {};
export const NamibiaSelfDrivePlanningEstimates: Story = { args: { trip: namibiaTransportTrip } };
export const CanonicalAgendaSpanish: Story = { args: { language: "es" } };
export const CanonicalAgendaMobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const CanonicalAgendaMobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const CanonicalAgendaMobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const CanonicalAgendaTablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const CanonicalAgendaDesktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const CanonicalAgendaDesktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const SelectedJourneyDesktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };

export const PartialUnknownTransport: Story = {
  args: { trip: transportTrip },
};
export const RoadReferenceWithoutSelectedMode: Story = { args: { trip: roadReferenceTrip } };

export const EvidenceBackedModeChoice: Story = {
  args: { trip: modeChoiceTrip },
};

export const ExplicitTravellerChoice: Story = {
  args: { trip: explicitChoiceTrip },
};

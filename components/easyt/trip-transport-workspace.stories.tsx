import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip } from "@/lib/easyt/trip";
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

export const EvidenceBackedModeChoice: Story = {
  args: { trip: modeChoiceTrip },
};

export const ExplicitTravellerChoice: Story = {
  args: { trip: explicitChoiceTrip },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { cancunReturnTripFixture } from "./storybook/cancun-return-trip.fixture";
import TripShell from "./trip-shell";
import TripTransportWorkspace from "./trip-transport-workspace";

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

const meta = {
  title: "Morrovia/05 Workspaces/Transport",
  component: TripTransportWorkspace,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/journey/storybook-first-class-transport/transport" },
    },
  },
  decorators: [
    (Story) => <TripShell trip={transportTrip}><Story /></TripShell>,
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

export const PartialUnknownTransport: Story = {
  args: { trip: transportTrip },
};

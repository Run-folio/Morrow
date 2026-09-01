import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { BookingImportPayload } from "@/lib/easyt/booking-import-view";
import ImportedBookings from "./imported-bookings";

const strongCandidate: BookingImportPayload["candidates"][number] = {
  id: "3d962fd5-62a7-47fc-9daf-42670339b711",
  source: "forwarded_email",
  sources: ["forwarded_email"],
  type: "accommodation",
  title: "Hotel Artemide",
  provider: "Booking.com",
  startDate: "2026-08-30",
  endDate: "2026-09-04",
  location: "Rome, Italy",
  referenceMasked: "••••1234",
  confidence: "high",
  status: "pending",
  canonicalTripId: null,
  match: {
    status: "strong",
    suggestedTripId: "italy-greece",
    suggestedStopId: "rome",
    matches: [{ tripId: "italy-greece", tripTitle: "Italy & Greece", score: 12, stopId: "rome", stopName: "Rome" }],
  },
};

const trips = [
  { id: "italy-greece", title: "Italy & Greece", startDate: "2026-08-27", endDate: "2026-09-14" },
  { id: "rome-weekend", title: "Rome weekend", startDate: "2026-08-30", endDate: "2026-09-02" },
];

const baseData: BookingImportPayload = {
  configured: true,
  alias: { hint: "Q8k2", createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" },
  candidates: [strongCandidate],
  trips,
};

const meta = {
  title: "Morrovia/05 Product Patterns/Imported bookings",
  component: ImportedBookings,
  parameters: { layout: "padded" },
  args: { initialData: baseData },
  tags: ["autodocs"],
} satisfies Meta<typeof ImportedBookings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StrongTripMatch: Story = {};

export const AmbiguousTripMatch: Story = {
  args: {
    initialData: {
      ...baseData,
      candidates: [{ ...strongCandidate, match: { ...strongCandidate.match, status: "ambiguous", suggestedTripId: null, suggestedStopId: null, matches: [
        ...strongCandidate.match.matches,
        { tripId: "rome-weekend", tripTitle: "Rome weekend", score: 10, stopId: "rome", stopName: "Rome" },
      ] } }],
    },
  },
};

export const NoTripMatch: Story = {
  args: { initialData: { ...baseData, candidates: [{ ...strongCandidate, location: "Osaka, Japan", match: { status: "none", suggestedTripId: null, suggestedStopId: null, matches: [] } }] } },
};

export const ProviderNotConfigured: Story = {
  args: { initialData: { configured: false, alias: null, candidates: [], trips } },
};

export const Empty: Story = {
  args: { initialData: { ...baseData, candidates: [] } },
};

export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };

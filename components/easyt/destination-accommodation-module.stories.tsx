import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { BookingCandidateView, BookingImportPayload } from "@/lib/easyt/booking-import-view";
import type { EasyTTrip } from "@/lib/easyt/trip";
import DestinationAccommodationModule from "./destination-accommodation-module";

const trip: EasyTTrip = {
  schemaVersion: 1,
  id: "italy-greece",
  ownerId: "storybook-traveller",
  title: "Italy & Greece",
  status: "draft",
  startDate: "2026-08-27",
  endDate: "2026-09-14",
  travellers: 2,
  currency: "GBP",
  brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
  stops: [{ id: "rome", order: 0, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-08-30", departureDate: "2026-09-04", nights: 5 }],
  legs: [],
  planItems: [],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const candidate: BookingCandidateView = {
  id: "3d962fd5-62a7-47fc-9daf-42670339b711",
  source: "calendar",
  sources: ["calendar"],
  type: "accommodation",
  title: "Hotel Artemide",
  provider: null,
  startDate: "2026-08-30",
  endDate: "2026-09-04",
  location: "Rome, Italy",
  referenceMasked: null,
  confidence: "high",
  status: "pending",
  canonicalTripId: null,
  match: { status: "strong", suggestedTripId: trip.id, suggestedStopId: "rome", matches: [{ tripId: trip.id, tripTitle: trip.title, score: 12, stopId: "rome", stopName: "Rome" }] },
};

const data = (candidates: BookingCandidateView[] = [], calendar: BookingImportPayload["calendar"] = { available: false, connected: false }): BookingImportPayload => ({
  configured: true,
  calendar,
  alias: { hint: "4d2a", createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" },
  candidates,
  trips: [{ id: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate }],
});

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Destination accommodation",
  component: DestinationAccommodationModule,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: "min(100%, 390px)" }}><Story /></div>],
  args: {
    trip,
    stop: trip.stops[0],
    pending: false,
    onSave: () => true,
    onRemove: () => true,
    onCanonicalTrip: () => true,
    initialImportData: data(),
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DestinationAccommodationModule>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsStay: Story = {};

export const CalendarDisconnected: Story = {
  args: { initialImportData: data([], { available: true, connected: false, connectHref: "#connect-calendar" }), storyState: { calendar: "disconnected" } },
};

export const CheckingCalendar: Story = {
  args: { initialImportData: data([], { available: true, connected: true }), storyState: { calendar: "checking" } },
};

export const NoCandidateFound: Story = {
  args: { initialImportData: data([], { available: true, connected: true }), storyState: { calendar: "no-match" } },
};

export const CandidateFound: Story = {
  args: { initialImportData: data([candidate]) },
};

export const MultipleEnrichedCandidates: Story = {
  args: { initialImportData: data([
    { ...candidate, sources: ["calendar", "forwarded_email"], provider: "Booking.com", referenceMasked: "••••1234" },
    { ...candidate, id: "b9ce09bd-1497-46a6-af75-9d9bba7eeb4f", title: "The Fifteen Keys Hotel", source: "forwarded_email", sources: ["forwarded_email"], provider: "Trip.com", referenceMasked: "••••9876" },
  ]) },
};

export const StaySorted: Story = {
  args: { trip: { ...trip, brief: { ...trip.brief, bookings: [{ id: "stay-rome", type: "stay", title: "Hotel Artemide", date: "2026-08-30", confirmation: "ROMA-1234", url: "https://www.booking.com/hotel/it/artemide.html", importDetails: { candidateId: candidate.id, fingerprint: "safe-fingerprint", sources: ["calendar", "forwarded_email"], provider: "Booking.com", endDate: "2026-09-04", location: "Rome, Italy", confidence: "high" } }] } } },
};

export const ImportError: Story = { args: { storyState: { importError: true } } };

export const LongHotelName: Story = {
  args: { trip: { ...trip, brief: { ...trip.brief, bookings: [{ id: "stay-rome", type: "stay", title: "Palazzo delle Arti Independent Boutique Residence near the Historic Centre of Rome", date: "2026-08-30", confirmation: null, url: null }] } } },
};

export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };

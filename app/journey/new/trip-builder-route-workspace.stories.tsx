import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { tourTripFixture } from "@/components/easyt/storybook/tour-trip.fixture";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { TripBuilderRouteWorkspace } from "./trip-builder-route-workspace";

function AllocationStory({ initialNights, language }: { initialNights: number[]; language: "en" | "es" }) {
  const [trip, setTrip] = useState<EasyTTrip>(() => ({
    ...tourTripFixture,
    stops: tourTripFixture.stops.map((stop, index) => ({ ...stop, nights: initialNights[index] ?? stop.nights })),
  }));
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const allocated = trip.stops.reduce((sum, stop) => sum + (stop.nights ?? 0), 0);
  return <TripBuilderRouteWorkspace
    canonicalTrip={trip}
    previewStopIds={null}
    selectedStopId={selectedStopId}
    lockedStopIds={[]}
    fixedOrder={false}
    routeCheckProposalStopIds={null}
    nightStatus={{ total: 7, allocated, complete: allocated === 7, language }}
    onSelectStop={setSelectedStopId}
    onPreviewOrder={() => {}}
    onCommitOrder={() => false}
    onEditNights={(stopId, nights) => setTrip((current) => ({ ...current, stops: current.stops.map((stop) => stop.id === stopId ? { ...stop, nights } : stop) }))}
    onRemoveStop={(stopId) => setTrip((current) => ({ ...current, stops: current.stops.filter((stop) => stop.id !== stopId).map((stop, order) => ({ ...stop, order })) }))}
    onTransportChoiceChange={() => {}}
  />;
}

const meta = { title: "Morrovia/05 Product Patterns/Builder route allocation", component: AllocationStory, parameters: { layout: "fullscreen" }, decorators: [(Story) => <main style={{ width: "calc(100vw - 16px)" }}><Story /></main>], args: { initialNights: [1, 2, 2], language: "en" } } satisfies Meta<typeof AllocationStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoNightsLeft: Story = {};
export const OneNightTooMany: Story = { args: { initialNights: [4, 2, 2] } };
export const AllAllocated: Story = { args: { initialNights: [3, 2, 2] } };
export const UnaNocheSobra: Story = { args: { initialNights: [4, 2, 2], language: "es" } };

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { tourTripFixture } from "@/components/easyt/storybook/tour-trip.fixture";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { TripBuilderRouteWorkspace } from "./trip-builder-route-workspace";
import styles from "./trip-builder.module.css";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { adaptedDiscoveryPlaces } from "@/lib/easyt/discovery-evidence-adapter";
import { MorroviaSaveStatus } from "@/components/easyt/morrovia-feedback";
import { builderDetailsStatus } from "@/lib/easyt/builder-planning-status";
import matchedAfricaFixture from "@/tests/fixtures/main-staging-africa-control.json";
import type { PlanningEvidenceState } from '@/lib/easyt/planning-evidence-state';

function AllocationStory({ initialNights, language, totalNights = 7, singleStop = false }: { initialNights: number[]; language: "en" | "es"; totalNights?: number; singleStop?: boolean }) {
  const [trip, setTrip] = useState<EasyTTrip>(() => ({
    ...tourTripFixture,
    endDate: new Date(Date.parse(`${tourTripFixture.startDate}T00:00:00Z`) + totalNights * 86_400_000).toISOString().slice(0, 10),
    stops: (singleStop ? tourTripFixture.stops.slice(0, 1) : tourTripFixture.stops).map((stop, index) => ({ ...stop, nights: initialNights[index] ?? stop.nights })),
    legs: singleStop ? [] : tourTripFixture.legs,
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
    nightStatus={{ total: totalNights, allocated, complete: allocated === totalNights, language }}
    onSelectStop={setSelectedStopId}
    onPreviewOrder={() => {}}
    onCommitOrder={() => false}
    onEditNights={(stopId, nights) => setTrip((current) => ({ ...current, stops: current.stops.map((stop) => stop.id === stopId ? { ...stop, nights } : stop) }))}
    onRemoveStop={(stopId) => setTrip((current) => ({ ...current, stops: current.stops.filter((stop) => stop.id !== stopId).map((stop, order) => ({ ...stop, order })) }))}
    onTransportChoiceChange={() => {}}
  />;
}

const meta = { title: "Morrovia/05 Product Patterns/Builder route allocation", component: AllocationStory, parameters: { layout: "fullscreen" }, decorators: [(Story) => <main className={styles.shellWide} style={{ width: "calc(100vw - 16px)" }}><Story /></main>], args: { initialNights: [1, 2, 2], language: "en" } } satisfies Meta<typeof AllocationStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoNightsLeft: Story = {};
export const OneNightTooMany: Story = { args: { initialNights: [4, 2, 2] } };
export const AllAllocated: Story = { args: { initialNights: [3, 2, 2] } };
export const SingleStopFullyAllocated: Story = { args: { initialNights: [7], singleStop: true } };
export const UnaNocheSobra: Story = { args: { initialNights: [4, 2, 2], language: "es" } };

export const MobileLargeNightValues: Story = { args: { initialNights: [78, 3, 3], totalNights: 84 }, globals: { viewport: { value: "morrovia390", isRotated: false } } };

function TransportAssessmentStory({ phase }: { phase: "unknown" | "pending" | "failed" | "supported" | 'blocked' | 'timeout' | 'no-route' | 'not-attempted' }) {
  const stops = ["tokyo", "kyoto", "hiroshima"].map((id, index) => {
    const place = adaptedDiscoveryPlaces().find(place => place.id === id)!;
    return { ...tourTripFixture.stops[index]!, id, order: index, canonicalPlaceId: id, name: place.name, country: place.country, longitude: place.coordinates[0], latitude: place.coordinates[1], geographicBinding: undefined, providerId: undefined };
  });
  const legs = stops.slice(1).map((stop, index) => ({ ...tourTripFixture.legs[index]!, id: `assessment-${index}`, fromStopId: stops[index]!.id, toStopId: stop.id, fromEndpoint: undefined, toEndpoint: undefined, mode: phase === "supported" ? "train" as const : "unknown" as const, provenance: phase === "supported" ? "canonical_schedule" as const : "unknown" as const, durationMinutes: phase === "supported" ? 120 : null, doorToDoorMinutes: null, routeMetadata: {} }));
  const trip: EasyTTrip = { ...tourTripFixture, stops, legs, brief: { ...tourTripFixture.brief, cascadeStatus: { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0, routeReconciliation: { version: 1, inputKey: "fixture", residual: phase === "pending" || phase === "failed" ? legs.map(leg => ({ kind: "leg", targetId: leg.id, basisKey: "fixture", phase, reason: "unavailable" })) : [] } } } };
  const state: PlanningEvidenceState | undefined = phase === 'blocked' ? { retrieval: 'unavailable', evidence: 'insufficient', reason: 'configuration_unavailable', retryable: false }
    : phase === 'timeout' ? { retrieval: 'unavailable', evidence: 'insufficient', reason: 'timeout', retryable: true }
    : phase === 'no-route' ? { retrieval: 'completed', evidence: 'insufficient', reason: 'no_route', retryable: false }
    : phase === 'not-attempted' ? { retrieval: 'not-attempted', evidence: 'insufficient', retryable: false } : undefined;
  const assessments = state ? legs.map(leg => ({ legId: leg.id, state })) : undefined;
  return <TripBuilderRouteWorkspace canonicalTrip={trip} transferAssessments={assessments} previewStopIds={null} selectedStopId={null} lockedStopIds={[]} fixedOrder={false} routeCheckProposalStopIds={null}
    nightStatus={{ total: 7, allocated: 7, complete: true, language: "en" }}
    reviewControl={<MorroviaSaveStatus {...builderDetailsStatus(trip, "en", assessments)} />}
    legReview={phase === "failed" || state?.retryable ? () => <span role="status">Could not check this connection. <EasyTButton size="small" variant="quiet">Try again</EasyTButton></span> : undefined}
    onSelectStop={() => {}} onPreviewOrder={() => {}} onCommitOrder={() => false} onEditNights={() => {}} onRemoveStop={() => {}} onTransportChoiceChange={() => {}} />;
}
export const TransportSettledUnknown: Story = { render: () => <TransportAssessmentStory phase="unknown" /> };
export const TransportPending: Story = { render: () => <TransportAssessmentStory phase="pending" /> };
export const TransportFailed: Story = { render: () => <TransportAssessmentStory phase="failed" /> };
export const TransportSupported: Story = { render: () => <TransportAssessmentStory phase="supported" /> };
export const TransportBlocked: Story = { render: () => <TransportAssessmentStory phase="blocked" /> };
export const TransportTimeout: Story = { render: () => <TransportAssessmentStory phase="timeout" /> };
export const TransportNoRoute: Story = { render: () => <TransportAssessmentStory phase="no-route" /> };
export const TransportNotAttempted: Story = { render: () => <TransportAssessmentStory phase="not-attempted" /> };

// Synthetic guest control captured from the matched main/staging journey.
function MainAfricaPlanningStory({language = "en"}: {language?: "en" | "es"}) {
  const trip = matchedAfricaFixture as unknown as EasyTTrip;
  const assessments = trip.legs.map(leg => ({legId: leg.id, state: {retrieval: "completed" as const, evidence: "insufficient" as const, retryable: false}}));
  return <TripBuilderRouteWorkspace canonicalTrip={trip} transferAssessments={assessments}
    previewStopIds={null} selectedStopId={null} lockedStopIds={[]} fixedOrder={false} routeCheckProposalStopIds={null}
    nightStatus={{total: 6, allocated: 6, complete: true, language}}
    reviewControl={<MorroviaSaveStatus {...builderDetailsStatus(trip, language, assessments)} />}
    onSelectStop={() => {}} onPreviewOrder={() => {}} onCommitOrder={() => false}
    onEditNights={() => {}} onRemoveStop={() => {}} onTransportChoiceChange={() => {}} />;
}
export const MainAfricaPlanning: Story = {render: () => <MainAfricaPlanningStory />};
export const MainAfricaPlanningSpanish: Story = {render: () => <MainAfricaPlanningStory language="es" />};

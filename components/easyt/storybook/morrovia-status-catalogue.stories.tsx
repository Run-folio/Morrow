import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import { JourneyTripQuality } from "@/components/journey-trip-quality";
import type { TripPrepTask } from "@/lib/easyt/trip-prep";
import { MorroviaSaveStatus, MorroviaStatusBanner } from "../morrovia-feedback";
import { MorroviaSectionStatus } from "../morrovia-loading-states";
import { TripPreparationTaskSection } from "../trip-preparation";

const tasks: TripPrepTask[] = [
  { id: "passport", title: "Passport and traveller details", detail: "Add nationality, residence and passport expiry month before relying on entry guidance.", category: "must", status: "urgent", kind: "passport", action: { label: "Review details", opensTravellerDetails: true } },
  { id: "stay", title: "Accommodation", detail: "Two of three overnight stops still need a saved stay.", category: "must", status: "in-progress", kind: "accommodation", action: { label: "Review stays", href: "/journey/storybook-trip/map?stop=cusco&mode=stay" } },
  { id: "insurance", title: "Travel insurance", detail: "Marked complete on your saved checklist.", category: "good", status: "complete", kind: "insurance" },
];

const meta = {
  title: "Morrovia/03 Status & Feedback/Status catalogue",
  parameters: { layout: "padded", nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip" } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChipsAndBadges: Story = {
  render: () => <div style={{ display: "grid", gap: 18, maxWidth: 720 }}><TripPreparationTaskSection id="storybook-status" title="Must do" icon={ShieldCheck} tasks={tasks} tripId="storybook-trip" onOpenTravellerDetails={() => {}} /></div>,
};

export const SuccessWarningAndError: Story = {
  render: () => <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
    <MorroviaStatusBanner title="Saved to your account" detail="Your trip is up to date." tone="success" />
    <MorroviaStatusBanner title="One transfer still needs checking" detail="Your saved route is unchanged." tone="warning" />
    <MorroviaStatusBanner title="The trip could not be saved" detail="Your device copy is still safe." tone="danger" />
  </div>,
};

export const ProgressAndLoading: Story = {
  render: () => <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
    <MorroviaSectionStatus title="Checking route timing" detail="Your stops and edits remain in place." />
    <MorroviaSectionStatus title="Route ready" detail="All known transfers are represented." state="success" />
    <MorroviaSectionStatus title="The provider did not respond" detail="Your trip was not changed." state="error" onRetry={() => {}} />
  </div>,
};

export const SaveStates: Story = {
  render: () => <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}><MorroviaSaveStatus state="device" /><MorroviaSaveStatus state="saving" /><MorroviaSaveStatus state="saved" /><MorroviaSaveStatus state="error" /></div>,
};

export const DomainHealthState: Story = {
  render: () => <div style={{ maxWidth: 760 }}><JourneyTripQuality origin="London" startDate="2026-08-20" endDate="2026-08-25" stops={[{ name: "Tokyo", country: "Japan" }]} mentions={[{ sourceText: "Kyoto", canonicalName: "Kyoto", role: "stop", status: "unresolved" }]} onAddMissingPlace={() => {}} onReviewOrigin={() => {}} onReviewDates={() => {}} onReviewTraveller={() => {}} /></div>,
};

export const NonColourCues: Story = {
  render: () => <div style={{ display: "grid", gap: 12, maxWidth: 680 }}><MorroviaStatusBanner title="Route ready" detail="Success uses an icon, title and supporting copy as well as colour." tone="success" actions={<CheckCircle2 aria-hidden="true" />} /><MorroviaStatusBanner title="Needs attention" detail="Warning uses a distinct icon, title and alert semantics." tone="warning" actions={<AlertTriangle aria-hidden="true" />} /></div>,
};

export const Mobile390: Story = { ...SuccessWarningAndError, parameters: { ...meta.parameters }, globals: { viewport: { value: "morrovia390", isRotated: false } } };

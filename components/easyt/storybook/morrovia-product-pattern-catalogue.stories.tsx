import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ShieldCheck } from "lucide-react";

import DiscoveryBrowser from "@/app/journey/discover/discovery-browser";
import PassportDestinationClient from "@/app/journey/passport/passport-destination-client";
import { routeImages } from "@/lib/easyt/route-images";
import { routeFamilies } from "@/lib/easyt/route-catalog";
import type { TripPrepTask } from "@/lib/easyt/trip-prep";
import EasyTTripCopilot from "../easyt-trip-copilot";
import { TripPreparationTaskSection } from "../trip-preparation";

const localImageRoutes = routeFamilies.filter((route) => Boolean(routeImages[route.key])).slice(0, 12);
const preparationTasks: TripPrepTask[] = [
  { id: "traveller", title: "Passport and traveller details", detail: "Add nationality and residence to personalise entry guidance.", category: "must", status: "urgent", kind: "passport", action: { label: "Review details", opensTravellerDetails: true } },
  { id: "stay", title: "Accommodation in Cusco", detail: "Confirm a stay for 20–23 August.", category: "must", status: "in-progress", kind: "accommodation", action: { label: "Review stays", href: "/journey/storybook-trip/map?stop=cusco&mode=stay" } },
];

const meta = {
  title: "Morrovia/05 Product Patterns/Catalogue",
  parameters: { layout: "padded", nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip" } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreparationAndReadinessTask: Story = {
  render: () => <div style={{ maxWidth: 760 }}><TripPreparationTaskSection id="product-preparation" title="Must do" icon={ShieldCheck} tasks={preparationTasks} tripId="storybook-trip" onOpenTravellerDetails={() => {}} /></div>,
};

export const AIAndCopilot: Story = {
  render: () => <div style={{ maxWidth: 620 }}><EasyTTripCopilot surface="map" scope="selected-day" contextLabel="Day 3 · Rome" destination="Rome" dayCount={7} compact open suggestedPrompts={["How does this day look?", "What fits near here?", "Is this too rushed?"]} /></div>,
};

export const RouteDiscoveryResults: Story = {
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/discover" } } },
  render: () => <main className="morrovia-editorial-page"><DiscoveryBrowser routes={localImageRoutes} /></main>,
};

export const PassportWorkflow: Story = {
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/passport" } } },
  render: () => <PassportDestinationClient />,
};

export const CopilotAt390: Story = { ...AIAndCopilot, parameters: { ...meta.parameters }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const PassportAt390: Story = { ...PassportWorkflow, parameters: { ...PassportWorkflow.parameters }, globals: { viewport: { value: "morrovia390", isRotated: false } } };

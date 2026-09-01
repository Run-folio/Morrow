import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";

import EasyTNavigation from "@/app/journey/easyt-navigation";
import EasyTProductTour, { PRODUCT_TOUR_OPEN_EVENT } from "../easyt-product-tour";
import { MorroviaConfirmationDialog } from "../morrovia-feedback";
import { TripShellNavigation } from "../trip-shell-client";

function OpenConfirmation() {
  const [open, setOpen] = useState(true);
  return <div style={{ minHeight: 420 }}><MorroviaConfirmationDialog open={open} title="Remove Sacred Valley?" detail="This changes the route and the days attached to this stop." consequences={["Two itinerary days will be removed.", "The following transfer will need checking again."]} confirmLabel="Remove stop" onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} /></div>;
}

function OpenProductTour({ initialStep = 0 }: { initialStep?: number }) {
  useEffect(() => { window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); }, []);
  return <div style={{ minHeight: 620 }}><EasyTProductTour showTrigger={false} listenForOpen initialStep={initialStep} /></div>;
}

const meta = {
  title: "Morrovia/04 Structure/Dialogs, overlays and navigation",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip" } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConsequentialDialog: Story = { render: () => <OpenConfirmation /> };
export const ProductTourDialog: Story = { render: () => <OpenProductTour /> };
export const ProductTourDialogMobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } }, render: () => <OpenProductTour /> };
export const ProductTourSlide01: Story = { render: () => <OpenProductTour initialStep={0} /> };
export const ProductTourSlide02: Story = { render: () => <OpenProductTour initialStep={1} /> };
export const ProductTourSlide03: Story = { render: () => <OpenProductTour initialStep={2} /> };
export const ProductTourSlide04: Story = { render: () => <OpenProductTour initialStep={3} /> };
export const ProductTourSlide05: Story = { render: () => <OpenProductTour initialStep={4} /> };
export const GlobalNavigation: Story = { render: () => <EasyTNavigation current="routes" /> };
export const TripNavigation: Story = { render: () => <div style={{ padding: 24 }}><TripShellNavigation tripId="storybook-trip" /></div> };
export const MobileDock390: Story = { parameters: { ...meta.parameters }, globals: { viewport: { value: "morrovia390", isRotated: false } }, render: () => <div style={{ minHeight: 760 }}><EasyTNavigation current="new" /></div> };

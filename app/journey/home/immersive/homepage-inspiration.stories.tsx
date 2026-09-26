import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTProductTour from "@/components/easyt/easyt-product-tour";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import HomepageHowItWorks from "./homepage-how-it-works";
import HomepageRouteInspiration from "./homepage-route-inspiration";
import styles from "./immersive.module.css";

const routes = immersiveHomepageRoutes();
const previewRoutes = discoveryCatalogue();

function Composition({ count = routes.length, selectedKey = routes[0]?.key ?? "none", withTour = false }: { count?: number; selectedKey?: string; withTour?: boolean }) {
  return <main className={styles.page} data-selected-story-key={selectedKey}>
    <HomepageRouteInspiration routes={routes.slice(0, count)} previewRoutes={previewRoutes} />
    <HomepageHowItWorks />
    {withTour ? <EasyTProductTour listenForOpen showTrigger={false} /> : null}
  </main>;
}

function BoundaryStory() {
  const [selectedKey] = useState(routes[0]?.key ?? "none");
  return <Composition selectedKey={selectedKey} />;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage/Route inspiration",
  component: Composition,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/" } } },
} satisfies Meta<typeof Composition>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SevenRoutes: Story = {};
export const FewerRoutes: Story = { args: { count: 3 } };
export const NoRoutes: Story = { args: { count: 0 } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const InteractionBoundary: Story = {
  render: () => <BoundaryStory />,
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>("[data-selected-story-key]");
    const before = root?.dataset.selectedStoryKey;
    const cards = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>(`.${styles.inspirationCard} > button`));
    if (cards.length !== routes.length) throw new Error("Every eligible route must render one card link");
    cards.forEach((card, index) => {
      const route = routes[index];
      if (!route || card.getAttribute("aria-label")?.includes(route.title) !== true) throw new Error("Card must expose a preview trigger for its canonical route");
      const days = route.dayRange.min === route.dayRange.max ? String(route.dayRange.min) : `${route.dayRange.min}–${route.dayRange.max}`;
      if (!card.textContent?.includes(route.title)) throw new Error("Card must render the canonical route title");
      if (!card.textContent?.includes(`${days} days`)) throw new Error("Card must render the canonical day range");
      if (!card.textContent?.includes(`${route.stops.length} stops`)) throw new Error("Card must render the complete canonical stop count");
      card.focus();
      card.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      if (root?.dataset.selectedStoryKey !== before) throw new Error("Card focus or hover changed the selected Route Story");
    });
    cards[0]?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const preview = canvasElement.querySelector<HTMLDialogElement>("dialog:modal");
    if (!preview || !preview.querySelector("#atlas-title")) throw new Error("Homepage inspiration card must open the shared route preview");
    if (root?.dataset.selectedStoryKey !== before) throw new Error("Card click changed the selected Route Story");
  },
};
export const TourFocusReturn: Story = {
  args: { withTour: true },
  play: async ({ canvasElement }) => {
    const trigger = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("See how it works"));
    if (!trigger) throw new Error("How it works trigger is missing");
    trigger.focus();
    trigger.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const dialog = canvasElement.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("Existing product tour did not open");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (canvasElement.querySelector('[role="dialog"]')) throw new Error("Escape did not close the existing tour");
    if (document.activeElement !== trigger) throw new Error("Tour did not restore focus to its activating trigger");
  },
};

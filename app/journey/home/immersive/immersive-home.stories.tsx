import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import ImmersiveHome from "./immersive-home";

const routes = immersiveHomepageRoutes();
const previewRouteIndex = Math.max(0, routes.findIndex((route) => route.key === "namibia-self-drive"));

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage dual entry",
  component: ImmersiveHome,
  args: { routes, initialIndex: previewRouteIndex },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/" } } },
} satisfies Meta<typeof ImmersiveHome>;

export default meta;
type Story = StoryObj<typeof meta>;

function ConnectedComposition() {
  return <ImmersiveHome routes={routes} initialIndex={previewRouteIndex} />;
}

function LanguageComposition({ language }: { language: "en" | "es" }) {
  useEffect(() => {
    const previous = window.localStorage.getItem("easyt-language");
    window.localStorage.setItem("easyt-language", language);
    window.dispatchEvent(new CustomEvent("easyt-language-change", { detail: language }));
    return () => {
      if (previous === null) window.localStorage.removeItem("easyt-language");
      else window.localStorage.setItem("easyt-language", previous);
      window.dispatchEvent(new CustomEvent("easyt-language-change", { detail: previous === "es" ? "es" : "en" }));
    };
  }, [language]);
  return <ConnectedComposition />;
}

export const FullComposition: Story = {
  render: () => <ConnectedComposition />,
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (canvasElement.querySelectorAll('header[data-easyt-app]').length !== 1) throw new Error("Expected one shared navigation");
    if (canvasElement.querySelectorAll('#routes').length !== 1) throw new Error("Expected one inspiration routes anchor");
    if (canvasElement.querySelectorAll('#how-it-works').length !== 1) throw new Error("Expected one How it works anchor");
    if (!canvasElement.querySelector('#start-building')) throw new Error("Planner form is missing");
    for (const selector of ["#route-story", "#product", "#booking-support", "#closing"]) {
      if (!canvasElement.querySelector(selector)) throw new Error(`${selector} is missing`);
    }
    const story = canvasElement.querySelector('#route-story');
    if (!story) throw new Error("Retained Route Story is missing");
    const original = story.textContent;
    for (const link of canvasElement.querySelectorAll<HTMLAnchorElement>('#routes a')) {
      link.focus();
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      if (story.textContent !== original) throw new Error("Card focus/hover changed Route Story");
      link.addEventListener("click", (event) => event.preventDefault(), { once: true });
      link.click();
      if (story.textContent !== original) throw new Error("Card click changed Route Story");
    }
    const tabs = canvasElement.querySelectorAll('[role="tab"]');
    if (tabs.length !== 2) throw new Error("Connected planner must retain both approved entry modes");
  },
};

export const DescribeMode: Story = {
  render: () => <ConnectedComposition />,
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const tab = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent?.includes("Describe"));
    if (!tab) throw new Error("Describe mode trigger is missing");
    tab.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (!canvasElement.querySelector("textarea")) throw new Error("Describe mode did not open");
  },
};

export const PersonalizeOpen: Story = {
  render: () => <ConnectedComposition />,
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const trigger = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "Personalize");
    if (!trigger) throw new Error("Personalize trigger is missing");
    trigger.click();
  },
};

export const Spanish: Story = { render: () => <LanguageComposition language="es" /> };
export const Mobile390: Story = {
  render: () => <ConnectedComposition />,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

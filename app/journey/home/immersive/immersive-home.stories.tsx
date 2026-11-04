import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import ImmersiveHome from "./immersive-home";

const routes = immersiveHomepageRoutes();
const previewRoutes = discoveryCatalogue();
const previewRouteIndex = Math.max(0, routes.findIndex((route) => route.key === "namibia-self-drive"));

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage dual entry",
  component: ImmersiveHome,
  args: { routes, previewRoutes, initialIndex: previewRouteIndex },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/" } } },
} satisfies Meta<typeof ImmersiveHome>;

export default meta;
type Story = StoryObj<typeof meta>;

function ConnectedComposition() {
  return <ImmersiveHome routes={routes} previewRoutes={previewRoutes} initialIndex={previewRouteIndex} />;
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
    const tab = await within(canvasElement).findByRole("tab", { name: "Describe my trip" });
    await waitFor(() => expect(tab).toBeEnabled());
    await userEvent.click(tab);
    await waitFor(() => expect(canvasElement.querySelector("textarea")).toBeVisible());
    await expect(tab).toHaveAttribute("aria-selected", "true");
  },
};

export const TravellersKeyboard: Story = {
  tags: ["current-ui"],
  parameters: { a11y: { test: "error" } },
  render: () => <ConnectedComposition />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = await canvas.findByRole("group", { name: "Travellers" });
    const increase = within(group).getByRole("button", { name: /Increase travellers/ });
    await waitFor(() => expect(increase).toBeEnabled());
    const original = Number(group.querySelector("output")?.textContent?.match(/\d+/)?.[0] ?? "2");
    increase.focus();
    await userEvent.keyboard("{Home}");
    await waitFor(() => expect(group.querySelector("output")).toHaveTextContent("1 traveller"));
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(group.querySelector("output")).toHaveTextContent("2 travellers"));
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(group.querySelector("output")).toHaveTextContent("12 travellers"));
    within(group).getByRole("button", { name: /Decrease travellers/ }).focus();
    await userEvent.keyboard("{Home}");
    increase.focus();
    for (let count = 1; count < original; count += 1) await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(group.querySelector("output")).toHaveTextContent(`${original} ${original === 1 ? "traveller" : "travellers"}`));
  },
};

export const Spanish: Story = { render: () => <LanguageComposition language="es" /> };
export const Mobile390: Story = {
  render: () => <ConnectedComposition />,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

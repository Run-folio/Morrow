import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import ImmersiveHome from "./immersive-home";
import styles from "./immersive.module.css";

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
    const tab = await within(canvasElement).findByRole("tab", { name: /^Describe$/ });
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
    const travellers = await canvas.findByRole<HTMLSelectElement>("combobox", { name: "Travellers" });
    await waitFor(() => expect(travellers).toBeEnabled());
    const original = travellers.value;
    expect(within(travellers).getAllByRole("option")).toHaveLength(12);
    travellers.focus();
    await expect(travellers).toHaveFocus();
    await userEvent.selectOptions(travellers, "1");
    await expect(travellers).toHaveDisplayValue("1 traveller");
    await userEvent.selectOptions(travellers, "12");
    await expect(travellers).toHaveDisplayValue("12 travellers");
    await userEvent.selectOptions(travellers, original);
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Plan my trip" })).toHaveFocus();
  },
};

export const Spanish: Story = { render: () => <LanguageComposition language="es" /> };
export const Mobile390: Story = {
  render: () => <ConnectedComposition />,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("group", { name: "Trip type" });
    const stops = canvasElement.querySelector<HTMLElement>("[data-home-route-fields]");
    if (!stops) throw new Error("Route fields must be present");
    const controls = within(toggle);
    const returnButton = controls.getByRole("button", { name: /^Return$/ });
    const oneWay = controls.getByRole("button", { name: /^One way$/ });
    if (window.matchMedia("(max-width: 700px)").matches) {
      const group = toggle.getBoundingClientRect(), fields = stops.getBoundingClientRect();
      await expect(Math.abs(group.width - fields.width)).toBeLessThanOrEqual(2);
      await expect(Math.abs(group.left - fields.left)).toBeLessThanOrEqual(2);
      await expect(fields.top - group.bottom).toBeGreaterThanOrEqual(7);
      await expect(Math.abs(returnButton.offsetWidth - oneWay.offsetWidth)).toBeLessThanOrEqual(2);
    }
    await expect(canvas.getByRole("heading", { name: "Our Picks" })).toBeInTheDocument();
    const card = canvasElement.querySelector<HTMLElement>(`.${styles.inspirationCard}`);
    const caption = card?.querySelector<HTMLElement>(`.${styles.inspirationTitle}`);
    if (!card || !caption) throw new Error("Expected a full-bleed route card with its own caption");
    await expect(caption.offsetHeight).toBeLessThan(card.offsetHeight / 2);
    await expect(getComputedStyle(caption).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  },
};

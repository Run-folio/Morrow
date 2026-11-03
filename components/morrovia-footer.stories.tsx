import { expect, within } from "storybook/test";
import immersiveStyles from "../app/journey/home/immersive/immersive.module.css";
import ClosingChapter from "../app/journey/home/immersive/closing-chapter";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MorroviaFooter from "./morrovia-footer";

const meta = {
  title: "Morrovia/04 Structure/Footer",
  component: MorroviaFooter,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MorroviaFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile320: Story = {
  globals: { viewport: { value: "morrovia320", isRotated: false } },
};

export const Mobile390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const Tablet768: Story = {
  globals: { viewport: { value: "morrovia768", isRotated: false } },
};

export const Desktop: Story = {
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};

export const ImmersiveClosing: Story = {
  render: () => <main className={immersiveStyles.page}><ClosingChapter /></main>,
};

// Native footer semantics depend on their sectioning context.
export const PageLandmark: Story = {
  tags: ["current-ui"], parameters: { a11y: { test: "error" } },
  render: () => <><main><h1>Trip planning</h1></main><MorroviaFooter /></>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("contentinfo")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Privacy" })).toBeVisible();
  },
};
export const SectionFooter: Story = {
  tags: ["current-ui"], parameters: { a11y: { test: "error" } },
  render: () => <main><h1>Trip planning</h1><section aria-label="Next journey"><MorroviaFooter /></section></main>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Testing Library's implicit-role lookup does not account for footer nesting.
    // Browser axe additionally checks the actual landmark hierarchy.
    const footer = canvasElement.querySelector("main section footer")!;
    await expect(footer).toBeVisible();
    await expect(footer.getAttribute("role")).toBeNull();
    await expect(canvas.getByRole("link", { name: "Privacy" })).toBeVisible();
  },
};

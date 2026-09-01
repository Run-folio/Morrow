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

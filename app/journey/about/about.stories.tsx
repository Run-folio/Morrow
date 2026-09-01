import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AboutPage from "./page";

const meta = {
  title: "Morrovia/05 Product Patterns/About page",
  component: AboutPage,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/about" } },
  },
} satisfies Meta<typeof AboutPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile320: Story = {
  globals: { viewport: { value: "morrovia320", isRotated: false } },
};

export const Mobile390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const Mobile430: Story = {
  globals: { viewport: { value: "morrovia430", isRotated: false } },
};

export const Tablet768: Story = {
  globals: { viewport: { value: "morrovia768", isRotated: false } },
};

export const Desktop1024: Story = {
  globals: { viewport: { value: "morrovia1024", isRotated: false } },
};

export const Desktop1440: Story = {
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};

export const Desktop1680: Story = {
  globals: { viewport: { value: "morrovia1680", isRotated: false } },
};

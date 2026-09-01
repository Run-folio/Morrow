import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTNavigation from "./easyt-navigation";

const meta = {
  title: "Morrovia/04 Structure/Global navigation",
  component: EasyTNavigation,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/about" } },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof EasyTNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { args: { current: "home" } };

export const AboutActive: Story = { args: { current: "about" } };

export const TabletTransition: Story = {
  args: { current: "passport" },
  globals: { viewport: { value: "morrovia768", isRotated: false } },
  decorators: [(Story) => <div style={{ width: 768, maxWidth: "100%" }}><Story /></div>],
};

export const MobileDock: Story = {
  args: { current: "new" },
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  decorators: [(Story) => <div style={{ width: 390, maxWidth: "100%", minHeight: 760, position: "relative" }}><Story /></div>],
};

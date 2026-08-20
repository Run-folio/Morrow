import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTNavigation from "./easyt-navigation";

const meta = {
  title: "Components/Navigation",
  component: EasyTNavigation,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof EasyTNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { args: { current: "home" } };

export const TabletTransition: Story = {
  args: { current: "passport" },
  parameters: { viewport: { defaultViewport: "morrovia768" } },
  decorators: [(Story) => <div style={{ width: 768, maxWidth: "100%" }}><Story /></div>],
};

export const MobileDock: Story = {
  args: { current: "new" },
  parameters: { viewport: { defaultViewport: "morrovia390" } },
  decorators: [(Story) => <div style={{ width: 390, maxWidth: "100%", minHeight: 760, position: "relative" }}><Story /></div>],
};

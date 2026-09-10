import type { Meta, StoryObj } from "@storybook/react";
import MorroviaBrandLogo from "./morrovia-brand-logo";

const meta = {
  title: "Morrovia/01 Foundations/Brand logo",
  component: MorroviaBrandLogo,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MorroviaBrandLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = { args: { variant: "full", size: "navigation" } };

export const Mark: Story = { args: { variant: "mark" } };

export const Light: Story = {
  args: { variant: "light", size: "navigation" },
  decorators: [(Story) => <div style={{ padding: 32, background: "var(--morrovia-ink)" }}><Story /></div>],
};

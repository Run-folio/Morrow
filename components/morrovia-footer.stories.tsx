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

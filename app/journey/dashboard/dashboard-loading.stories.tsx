import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DashboardLoading from "./loading";

const meta = {
  title: "Morrovia/05 Product Patterns/Trips dashboard loading",
  component: DashboardLoading,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/dashboard" } } },
} satisfies Meta<typeof DashboardLoading>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CompactLoading: Story = {};
export const CompactLoadingAt390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };

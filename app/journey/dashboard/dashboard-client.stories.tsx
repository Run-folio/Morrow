import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DashboardClient from "./dashboard-client";

const meta = {
  title: "Journey/First trip/Empty dashboard",
  component: DashboardClient,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/dashboard" } },
  },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "28px 24px" }}><div style={{ maxWidth: 1180, margin: "0 auto" }}><Story /></div></main>],
  args: { trips: [], stamps: [], ownerId: "storybook-first-traveller" },
} satisfies Meta<typeof DashboardClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ZeroTrips: Story = {};
export const Mobile390: Story = { parameters: { viewport: { defaultViewport: "morrovia390" } } };

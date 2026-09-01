import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HomeTripStarter from "./home-trip-starter";

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage trip starter",
  component: HomeTripStarter,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/home" } },
  },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "48px 24px" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><Story /></div></main>],
} satisfies Meta<typeof HomeTripStarter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {};
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };

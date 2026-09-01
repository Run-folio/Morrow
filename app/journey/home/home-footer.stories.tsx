import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { affiliatePartners, getActivityBookingAction } from "@/lib/easyt/booking-readiness";
import { HomePartnerEssentials } from "./home-footer";
import styles from "./home.module.css";

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage/Partner essentials",
  component: HomePartnerEssentials,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "24px 0" }}><div className={styles.homeFooter}><Story /></div></main>],
} satisfies Meta<typeof HomePartnerEssentials>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ViatorAvailable: Story = {};
export const TripComActivitiesFallback: Story = {
  args: { actions: { activities: getActivityBookingAction({ category: "activities" }, { viator: null, tripCom: affiliatePartners.tripCom }) } },
};
export const NoActivityProvider: Story = { args: { actions: { activities: null } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { affiliatePartners, getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { MorroviaPartnerPromotion } from "./partner-promotion";
import styles from "./partner-promotion.stories.module.css";

const omioTransportAction = getCurrentPartnerAction("transport")!;

const renderOmioHandoff = (args: React.ComponentProps<typeof MorroviaPartnerPromotion>) => <section className={styles.handoff} aria-label="Omio transport handoff">
  <MorroviaAffiliateLink action={omioTransportAction} context={{ placement: "itinerary_transfer" }} />
  <small>{affiliateDisclosure}</small>
  <MorroviaPartnerPromotion {...args} />
</section>;

const meta = {
  title: "Morrovia/05 Product Patterns/Partner promotion",
  component: MorroviaPartnerPromotion,
  parameters: { layout: "padded" },
  args: {
    action: { provider: "omio", href: affiliatePartners.omio.transportUrl },
    now: new Date("2026-11-01T12:00:00Z"),
  },
} satisfies Meta<typeof MorroviaPartnerPromotion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveOmioNewCustomerOffer: Story = { render: renderOmioHandoff };

export const ExpiredOffer: Story = {
  args: { now: new Date("2026-11-30T23:00:01Z") },
};

export const NonOmioProvider: Story = {
  args: { action: { provider: "trip.com", href: affiliatePartners.tripCom.carRentalUrl } },
};

export const Mobile390: Story = {
  render: renderOmioHandoff,
  parameters: { viewport: { defaultViewport: "mobile390" } },
};

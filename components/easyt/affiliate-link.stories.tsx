import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MorroviaAffiliateLink } from "./affiliate-link";
import { affiliatePartners, getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { buildOmioRouteSearchLink } from "@/lib/easyt/omio-search-link";
const meta = {
 title: "Morrovia/05 Product Patterns/Partner handoff",
 component: MorroviaAffiliateLink,
 parameters: { layout: "padded" },
 args: { action: getCurrentPartnerAction("transport")!, context: { placement: "itinerary_transfer" } },
} satisfies Meta<typeof MorroviaAffiliateLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GeneralOmio: Story = {};
export const RouteAndDate: Story = { args: { action: {provider:"omio",category:"transport",href:buildOmioRouteSearchLink({mode:"train",originName:"Tokyo",originCountry:"Japan",destinationName:"Kanazawa",destinationCountry:"Japan",departureDate:"2026-11-06",now:new Date("2026-11-03T12:00:00Z")})!,cta:"Compare transport on Omio",affiliate:true} } };
export const GeneralStay: Story = { args: { action: { provider:"trip.com",category:"accommodation",href:affiliatePartners.tripCom.accommodationUrl,cta:"Find accommodation on Trip.com",affiliate:true }, context: {placement:"itinerary_accommodation"} } };
export const Spanish: Story = { args: { language: "es" } };
export const Mobile320: Story = { ...RouteAndDate, globals:{viewport:{value:"morrovia320",isRotated:false}} };

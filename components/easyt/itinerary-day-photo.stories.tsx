import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ItineraryDayPhoto from "./itinerary-day-photo";
import { overviewPlaceImage } from "@/lib/easyt/trip-overview-imagery";

const meta = {
  title: "Morrovia/05 Product Patterns/Itinerary Day Photo",
  component: ItineraryDayPhoto,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(390px, calc(100vw - 32px))" }}><Story /></div>],
  args: { image: overviewPlaceImage({name: "Kyoto", country: "Japan"}), destination: "Kyoto" },
} satisfies Meta<typeof ItineraryDayPhoto>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DayHero: Story = {};
export const CalendarThumbnail: Story = { args: { compact: true } };
export const MissingPhoto: Story = { args: { image: null, destination: "Uncovered destination" } };
export const FailedPhoto: Story = { args: { image: {...overviewPlaceImage({name: "Kyoto", country: "Japan"})!, src: "/unavailable-itinerary-photo.webp"} } };

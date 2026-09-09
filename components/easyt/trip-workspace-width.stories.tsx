import "maplibre-gl/dist/maplibre-gl.css";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TripShell from "./trip-shell";
import TripMapWorkspace from "./trip-map-workspace";
import TripOverviewWorkspace from "./trip-overview-workspace";
import TripItineraryWorkspace from "./trip-itinerary-workspace";
import { tourTripFixture } from "./storybook/tour-trip.fixture";

function WorkspaceWidth({ surface }: { surface: "overview" | "map" | "itinerary" }) {
  return <div className="morrovia-editorial-page"><TripShell trip={tourTripFixture} cacheTrip={false} orientationAutoStart={false}>
    {surface === "overview" ? <TripOverviewWorkspace trip={tourTripFixture} now="2026-07-20" /> : surface === "map" ? <TripMapWorkspace trip={tourTripFixture} storyState={{ mapMode: "overview" }} /> : <TripItineraryWorkspace trip={tourTripFixture} selectedDayNumber={2} />}
  </TripShell></div>;
}
const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Width review",
  component: WorkspaceWidth,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof WorkspaceWidth>;
export default meta;
type Story = StoryObj<typeof meta>;
const navigation = (suffix: string) => ({ nextjs: { appDirectory: true, navigation: { pathname: `/journey/${tourTripFixture.id}${suffix}` } } });
export const Overview: Story = { args: { surface: "overview" }, parameters: navigation("") };
export const Map: Story = { args: { surface: "map" }, parameters: navigation("/map") };
export const Itinerary: Story = { args: { surface: "itinerary" }, parameters: navigation("/itinerary") };

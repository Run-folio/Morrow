import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTButton } from "./easyt/easyt-controls";
import { JourneyPlannerStrip, JourneyRouteStopTrack, type JourneyPlannerStripStop } from "./journey-planner-strip";

const stops: JourneyPlannerStripStop[] = [
  { id: "route-origin", name: "All trip", dayLabel: "From London", active: true, kind: "origin" },
  { id: "tokyo", name: "Tokyo", dayLabel: "Days 1–3", active: false, kind: "stop", image: "/journey/ginza-night.jpg" },
  { id: "takayama", name: "Takayama", dayLabel: "Days 4–5", active: false, kind: "stop", image: "/journey/kanazawa.jpg" },
  { id: "kyoto", name: "Kyoto", dayLabel: "Days 6–8", active: false, kind: "stop" },
];

const stayStops = stops.slice(1).map((stop, index) => ({ ...stop, active: index === 0 }));

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Shared route track",
  component: JourneyRouteStopTrack,
  parameters: { layout: "fullscreen" },
  args: { stops, onSelectStop: () => undefined, presentation: "integrated", surface: "standalone" },
} satisfies Meta<typeof JourneyRouteStopTrack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExploreVariant: Story = {};
export const StayVariant: Story = { args: { stops: stayStops, ariaLabel: "Choose an overnight trip stop" } };
export const MapVariant: Story = {
  render: () => <JourneyPlannerStrip summary="8 days · 3 stops · 2 travellers" stops={stops} addStopHref="#" fullTripLabel="Fullscreen map" wholeRouteActive onWholeRoute={() => undefined} onFullTrip={() => undefined} onSelectStop={() => undefined} presentation="integrated" overflow={<EasyTButton type="button">Pause</EasyTButton>} />,
};
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { RecommendationDetailModel } from "@/lib/easyt/recommendation-detail";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton } from "./easyt-controls";
import ItineraryItemDetail from "./itinerary-item-detail";

const activity: RecommendationDetailModel = {
  id: "sacsayhuaman",
  contextKey: "trip:cusco:sacsayhuaman:no-product:day-2:afternoon",
  kind: "activity",
  title: "Sacsayhuamán",
  location: "Cusco",
  summary: "A monumental Inca complex above Cusco with sourced context that helps the traveller decide whether it belongs in this day.",
  image: "/journey/peru-sacred-valley-route.jpg",
  imageAlt: "Sacsayhuamán recommendation",
  category: "Historic site",
  duration: "2h",
  whyFitLabel: "Why this fits your trip",
  whyFit: "The afternoon on Day 2 currently has no planned activity. Matches your culture interest.",
  practical: [{ label: "Source", value: "Reviewed destination data" }],
};

const viator: RecommendationDetailModel = {
  ...activity,
  id: "sacred-valley-tour",
  contextKey: "trip:cusco:viator:SV-11H:day-3:morning",
  kind: "tour",
  title: "Sacred Valley full-day tour",
  summary: "A guided day through villages, terraces and archaeological sites.",
  duration: "11h",
  price: "£89",
  provider: "viator",
  providerProductId: "SV-11H",
  whyFit: "Day 3 currently has no other activities or transfers, so it is the clearest fit for this 11h experience.",
  practical: [{ label: "Source", value: "Viator" }, { label: "Product", value: "SV-11H" }, { label: "Rating", value: "4.8 · 1,264 reviews" }],
};

const restaurant: RecommendationDetailModel = {
  id: "market-kitchen",
  contextKey: "trip:cusco:market-kitchen:no-product:day-2:evening",
  kind: "restaurant",
  title: "Local market kitchen",
  location: "San Pedro, Cusco",
  category: "Restaurant",
  whyFitLabel: "Why this fits your trip",
  whyFit: "The evening on Day 2 currently has no planned activity. Matches your food interest.",
  practical: [{ label: "Source", value: "Google Places" }, { label: "Rating", value: "4.6 · 318 reviews" }],
};

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Recommendation Detail",
  component: ItineraryItemDetail,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div style={{ minHeight: 760, maxWidth: 430, marginLeft: "auto", background: "var(--morrovia-paper)" }}><Story /></div>],
  args: { detail: activity, onClose: () => undefined, primaryActions: <><EasyTButton fullWidth>Add to Day 2</EasyTButton><EasyTButton variant="secondary">Save for later</EasyTButton></> },
} satisfies Meta<typeof ItineraryItemDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExploreRichActivity: Story = {};
export const ExploreSparseActivity: Story = { args: { detail: { ...activity, id: "sparse", contextKey: "trip:cusco:sparse:no-product:day-2:afternoon", summary: null, image: null, imageAlt: null, duration: null, practical: [] } } };
export const OpenDayElevenHourTour: Story = { args: { detail: viator } };
export const BusyDayElevenHourTourSoftConflict: Story = { args: { detail: { ...viator, contextKey: "trip:cusco:viator:SV-11H:day-2:morning", whyFit: "This 11h experience may overlap with other plans on Day 2. Adding it will not replace them." } } };
export const ViatorCommercial: Story = { args: { detail: viator, primaryActions: <><EasyTButton fullWidth>Add to Day 3</EasyTButton><EasyTButton variant="secondary">Save for later</EasyTButton><MorroviaAffiliateLink action={{ provider: "viator", category: "activities", href: "https://www.viator.com/", cta: "View on Viator", affiliate: true }} context={{ placement: "itinerary_day_experiences", tripId: "storybook", stopId: "cusco", workspaceView: "explore" }} /><small>{affiliateDisclosure}</small></> } };
export const RestaurantWithSourcedImage: Story = { args: { detail: { ...restaurant, image: "/journey/peru-sacred-valley-route.jpg", imageAlt: "Local market kitchen recommendation" } } };
export const RestaurantWithoutImage: Story = { args: { detail: restaurant } };
export const SparseRestaurant: Story = { args: { detail: { ...restaurant, id: "sparse-restaurant", contextKey: "trip:cusco:sparse-restaurant:no-product:day-2:evening", practical: [], whyFit: "Choose a day to check how this fits the current plan." } } };
export const SavedRecommendation: Story = { args: { detail: { ...activity, bookingStatus: "Saved for later", canRemove: true }, primaryActions: <EasyTButton fullWidth>Add to Day 2</EasyTButton> } };
export const AlreadyPlanned: Story = { args: { detail: { ...activity, dateSummary: "Day 2 · Afternoon", bookingStatus: "Added to Day 2 · Afternoon", whyFit: "Already planned for Day 2 · Afternoon.", canRemove: true }, primaryActions: undefined } };
export const MapEmbedded: Story = { args: { detail: { ...restaurant, contextKey: "trip:cusco:market-kitchen:no-product:day-2:evening" }, embedded: true } };
export const ItinerarySelectedDay: Story = { args: { detail: { ...activity, contextKey: "trip:cusco:sacsayhuaman:no-product:day-2:afternoon" } } };
export const MapHandoffPending: Story = {
  args: { detail: activity, mapHref: "#map-handoff" },
  play: ({ canvasElement }) => {
    const link = [...canvasElement.querySelectorAll<HTMLAnchorElement>("a")].find((candidate) => candidate.textContent?.includes("View on map"));
    link?.click();
  },
};
export const Mobile320: Story = { args: { detail: viator }, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { args: { detail: restaurant }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { args: { detail: activity }, globals: { viewport: { value: "morrovia430", isRotated: false } } };

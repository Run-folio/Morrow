import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { exploreResultForActivity, exploreResultForIdea, exploreResultForLocalPlace, exploreResultForPlace } from "@/lib/easyt/explore";
import { saveItineraryIdea } from "@/lib/easyt/itinerary-ideas";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import { tourTripFixture } from "./storybook/tour-trip.fixture";
import TripExploreWorkspace from "./trip-explore-workspace";

const trip = structuredClone(tourTripFixture);
const cusco = trip.stops[0]!;
const valley = trip.stops[1]!;

const qorikancha = exploreResultForIdea(trip, trip.brief.itineraryIdeas![0]!)!;
const market = exploreResultForIdea(trip, trip.brief.itineraryIdeas![1]!)!;
const mapped = [
  exploreResultForPlace(cusco, {
    id: "sacsayhuaman",
    title: "Sacsayhuamán",
    area: "Cusco",
    type: "Culture",
    tags: ["Cities"],
    description: "A monumental Inca complex above Cusco with wide views across the city and surrounding valley.",
    image: "/journey/peru-sacred-valley-route.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Sacsayhuam%C3%A1n",
    coordinates: [-71.982, -13.509],
    qualityScore: 12,
  }),
  exploreResultForPlace(valley, {
    id: "pisac",
    title: "Pisac archaeological park and terraces",
    area: "Sacred Valley",
    type: "Culture",
    tags: ["Cities", "Nature"],
    description: "A long-title fixture for a hillside archaeological site whose terraces overlook the Sacred Valley.",
    image: "/journey/peru-sacred-valley-route.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/P%C3%ADsac",
    coordinates: [-71.846, -13.414],
    qualityScore: 9,
  }),
  exploreResultForPlace(cusco, {
    id: "san-blas",
    title: "San Blas",
    area: "Cusco",
    type: "Landmark",
    tags: ["Cities"],
    description: "Steep lanes, workshops and small plazas above Cusco's historic centre.",
    coordinates: [-71.972, -13.515],
    qualityScore: 7,
  }),
];
const restaurant = exploreResultForLocalPlace(cusco, {
  id: "restaurant-storybook",
  name: "Local market kitchen",
  address: "San Pedro, Cusco",
  category: "Peruvian food",
  coordinates: [-71.982, -13.52],
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=San+Pedro+Cusco",
  provider: "openstreetmap",
});
const tourItem: ActivityInventoryItem = {
  provider: "viator",
  source: "viator",
  providerProductId: "sacred-valley-day-tour",
  title: "Sacred Valley full-day tour",
  destination: { canonicalPlaceId: "cusco", label: "Cusco" },
  image: "/journey/peru-sacred-valley-route.jpg",
  tags: ["day trip", "culture"],
  description: "A guided day through the Sacred Valley’s villages, terraces and archaeological sites.",
  rating: 4.8,
  reviewCount: 1264,
  duration: { fromMinutes: 480, toMinutes: 540 },
  price: { amount: 89, currency: "GBP" },
  productUrl: "https://www.viator.com/",
  provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" },
};
const tour = exploreResultForActivity(cusco, tourItem, trip);
const results = [qorikancha, market, ...mapped, restaurant, tour];
const longContentResult = {
  ...mapped[0]!,
  identity: "place:sacsayhuaman-long-content",
  sourceId: "sacsayhuaman-long-content",
  idea: { ...mapped[0]!.idea, id: "idea-cusco-sacsayhuaman-long-content", placeId: "sacsayhuaman-long-content" },
  description: "A monumental Inca complex above Cusco, where carefully fitted stone walls frame broad views across the city. The site is extensive and exposed, so the pace and weather matter.",
};
const savedTrip = saveItineraryIdea(trip, mapped[0]!.idea);

const mediterraneanTrip = structuredClone(trip);
const stopReplacements = [
  { id: "rome", name: "Rome", country: "Italy", canonicalPlaceId: "rome-it", latitude: 41.9028, longitude: 12.4964 },
  { id: "athens", name: "Athens", country: "Greece", canonicalPlaceId: "athens-gr", latitude: 37.9838, longitude: 23.7275 },
  { id: "naxos", name: "Naxos", country: "Greece", canonicalPlaceId: "naxos-gr", latitude: 37.1036, longitude: 25.3764 },
];
const oldStopIds = mediterraneanTrip.stops.map((stop) => stop.id);
mediterraneanTrip.stops = mediterraneanTrip.stops.map((stop, index) => ({ ...stop, ...stopReplacements[index] }));
mediterraneanTrip.planItems = mediterraneanTrip.planItems.map((day) => ({ ...day, stopId: stopReplacements[oldStopIds.indexOf(day.stopId)]!.id }));
mediterraneanTrip.brief.itineraryIdeas = [];
const piazza = exploreResultForPlace(mediterraneanTrip.stops[0]!, {
  id: "piazza-del-campidoglio",
  title: "Piazza del Campidoglio",
  area: "Rome",
  type: "Landmark",
  tags: ["Cities"],
  description: "A Renaissance square on Capitoline Hill, framed by civic palaces and reached by the broad Cordonata staircase.",
  image: "/journey/immersive/route-italy-greece-1536.webp",
  sourceUrl: "https://en.wikipedia.org/wiki/Piazza_del_Campidoglio",
  coordinates: [12.4828, 41.8933],
  qualityScore: 12,
});
const athensTicket = exploreResultForActivity(mediterraneanTrip.stops[1]!, {
  provider: "viator",
  source: "viator",
  providerProductId: "acropolis-entry-story",
  title: "Acropolis and Parthenon entry ticket",
  description: "Timed entry to the Acropolis archaeological site and the Parthenon.",
  destination: { canonicalPlaceId: "athens-gr", label: "Athens" },
  image: "/journey/immersive/route-italy-greece-1536.webp",
  tags: ["entry ticket", "culture"],
  rating: 4.7,
  reviewCount: 12480,
  duration: { fromMinutes: 60, toMinutes: 120 },
  price: { amount: 28, currency: "GBP" },
  productUrl: "https://www.viator.com/",
  provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" },
}, mediterraneanTrip);
const mediterraneanResults = [piazza, athensTicket];
const repeatedAthensTrip = structuredClone(mediterraneanTrip);
repeatedAthensTrip.id = "storybook-athens-naxos-athens";
repeatedAthensTrip.title = "Athens, Naxos & Athens";
const repeatedStopReplacements = [
  { id: "athens-outbound", name: "Athens", country: "Greece", canonicalPlaceId: "athens-gr", latitude: 37.9838, longitude: 23.7275 },
  { id: "naxos", name: "Naxos", country: "Greece", canonicalPlaceId: "naxos-gr", latitude: 37.1036, longitude: 25.3764 },
  { id: "athens-return", name: "Athens", country: "Greece", canonicalPlaceId: "athens-gr", latitude: 37.9838, longitude: 23.7275 },
];
const repeatedSourceStopIds = repeatedAthensTrip.stops.map((stop) => stop.id);
repeatedAthensTrip.stops = repeatedAthensTrip.stops.map((stop, index) => ({ ...stop, ...repeatedStopReplacements[index] }));
repeatedAthensTrip.planItems = repeatedAthensTrip.planItems.map((item) => ({
  ...item,
  stopId: repeatedStopReplacements[repeatedSourceStopIds.indexOf(item.stopId)]!.id,
}));
repeatedAthensTrip.brief.itineraryIdeas = [];
const lycabettusFixture = {
  id: "mount-lycabettus",
  title: "Mount Lycabettus",
  area: "Athens",
  type: "Viewpoint",
  tags: ["Nature"],
  description: "A hilltop viewpoint above central Athens.",
  image: "/journey/immersive/route-italy-greece-1536.webp",
  sourceUrl: "https://en.wikipedia.org/wiki/Mount_Lycabettus",
  coordinates: [23.7438, 37.9819] as [number, number],
  qualityScore: 10,
};
const repeatedAthensResults = [
  exploreResultForPlace(repeatedAthensTrip.stops[0]!, lycabettusFixture),
  exploreResultForPlace(repeatedAthensTrip.stops[2]!, lycabettusFixture),
];
const rejectedImageResult = exploreResultForPlace(cusco, {
  id: "technical-image",
  title: "Historic walking quarter",
  area: "Cusco",
  type: "Landmark",
  tags: ["Cities"],
  description: "A compact historic quarter suited to an unhurried walk.",
  image: "https://upload.wikimedia.org/route-map.png",
  coordinates: [-71.97, -13.515],
});

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Explore",
  component: TripExploreWorkspace,
  parameters: { layout: "fullscreen" },
  args: { trip, initialResults: results },
} satisfies Meta<typeof TripExploreWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTripForYou: Story = {};
export const SpecificDestination: Story = { args: { initialDestinationId: "cusco" } };
export const SelectedRomeStop: Story = { args: { trip: mediterraneanTrip, initialResults: mediterraneanResults, initialDestinationId: "rome" } };
export const SelectedAthensStop: Story = { args: { trip: mediterraneanTrip, initialResults: mediterraneanResults, initialDestinationId: "athens" } };
export const MixedOrganicAndViator: Story = { args: { trip: mediterraneanTrip, initialResults: mediterraneanResults } };
export const OrganicAttraction: Story = { args: { trip: mediterraneanTrip, initialResults: [piazza] } };
export const EntryTicket: Story = { args: { trip: mediterraneanTrip, initialResults: [athensTicket], initialDestinationId: "athens" } };
export const RepeatedAthensOutbound: Story = { args: { trip: repeatedAthensTrip, initialResults: repeatedAthensResults, initialDestinationId: "athens-outbound" } };
export const RepeatedAthensReturnMobile390: Story = { args: { trip: repeatedAthensTrip, initialResults: repeatedAthensResults, initialDestinationId: "athens-return" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Restaurant: Story = { args: { initialResults: [restaurant], initialCategory: "food" } };
export const MustSee: Story = { args: { initialCategory: "must-see" } };
export const Food: Story = { args: { initialCategory: "food" } };
export const Tours: Story = { args: { initialCategory: "tours" } };
export const ScheduledResult: Story = { args: { initialSelectedResultId: qorikancha.identity } };
export const SavedResult: Story = { args: { trip: savedTrip, initialResults: results, initialSelectedResultId: mapped[0]!.identity } };
export const SelectedDetail: Story = { args: { initialSelectedResultId: mapped[0]!.identity } };
export const HoverContentStable: Story = { play: ({ canvasElement }) => { canvasElement.querySelector<HTMLElement>("[data-explore-card]")?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); } };
export const KeyboardFocusStable: Story = { play: ({ canvasElement }) => { canvasElement.querySelector<HTMLButtonElement>("[data-explore-card] button[aria-label^='Open details']")?.focus(); } };
export const MissingImage: Story = { args: { initialResults: [mapped[2]!] } };
export const RejectedImageFallback: Story = { args: { initialResults: [rejectedImageResult] } };
export const ProviderDegraded: Story = { args: { initialProviderState: "degraded" } };
export const EmptyCategory: Story = { args: { initialCategory: "outdoors", initialResults: [restaurant] } };
export const Mobile390Results: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile390HorizontalStops: Story = { args: { initialDestinationId: "arequipa" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430HorizontalStops: Story = { args: { initialDestinationId: "sacred-valley" }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Mobile430SelectedDetail: Story = { args: { initialSelectedResultId: mapped[0]!.identity }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Mobile390HorizontalCategories: Story = { args: { initialCategory: "day-trips" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile390OrganicCard: Story = { args: { initialResults: [mapped[0]!] }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430CommercialCard: Story = { args: { initialResults: [tour] }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Mobile430LongTitle: Story = { args: { initialDestinationId: "sacred-valley", initialResults: [mapped[1]!] }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Mobile390MissingImage: Story = { args: { initialResults: [mapped[2]!] }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430SavedState: Story = { args: { trip: savedTrip, initialResults: [mapped[0]!] }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Mobile390ScheduledState: Story = { args: { initialResults: [qorikancha] }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile320Results: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile430LongDetail: Story = { args: { initialResults: [longContentResult], initialSelectedResultId: longContentResult.identity }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Mobile390LandscapeRecovery: Story = { args: { initialSelectedResultId: mapped[0]!.identity }, globals: { viewport: { value: "morrovia390", isRotated: true } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440Selected: Story = { args: { initialSelectedResultId: mapped[0]!.identity }, globals: { viewport: { value: "morrovia1440", isRotated: false } } };

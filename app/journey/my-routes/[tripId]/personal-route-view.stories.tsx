import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import EasyTNavigation from "@/app/journey/easyt-navigation";
import type { EasyTTrip, PlanItem, TripStop } from "@/lib/easyt/trip";
import { personalRoutePresentation } from "@/lib/easyt/personal-route";
import PersonalRouteView from "./personal-route-view";

const stop = (id: string, order: number, name: string, country: string, coordinates: [number, number] | null, arrivalDate: string | null, departureDate: string | null, nights: number | null): TripStop => ({
  id, order, name, country, longitude: coordinates?.[0] ?? null, latitude: coordinates?.[1] ?? null, arrivalDate, departureDate, nights,
});

const day = (id: string, stopId: string, dayNumber: number, date: string, title: string, image?: string): PlanItem => ({
  id, stopId, dayNumber, date, type: "activity", title, reason: `Time to experience ${title} without losing the shape of the route.`, notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image: image ?? null, sourceUrl: null,
});

const shortTrip: EasyTTrip = {
  schemaVersion: 1, id: "personal-route-short", ownerId: "storybook-owner", title: "Our spring route", status: "planned", startDate: "2027-04-03", endDate: "2027-04-10", travellers: 2, currency: "GBP",
  brief: { origin: "London", customTitle: "Our spring route", mustDo: "Tokyo food and Kyoto temples", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, itineraryIdeas: [{ id: "idea-market", stopId: "tokyo", placeId: "tsukiji", title: "Tsukiji outer market", category: "activity", image: "/journey/tokyo.jpg", source: "personalised-recommendation", reasons: ["interest-relevance"], dayId: "day-tokyo" }] },
  stops: [stop("tokyo", 0, "Tokyo", "Japan", [139.6917, 35.6895], "2027-04-03", "2027-04-07", 4), stop("kyoto", 1, "Kyoto", "Japan", [135.7681, 35.0116], "2027-04-07", "2027-04-11", 4)],
  legs: [{ id: "tokyo-kyoto", fromStopId: "tokyo", toStopId: "kyoto", mode: "train", distanceKm: 450, durationMinutes: 210, provider: null, routeMetadata: {}, provenance: "planning_estimate", confidence: "medium", scheduleNeedsChecking: true }],
  planItems: [day("day-tokyo", "tokyo", 1, "2027-04-03", "Tokyo neighbourhoods", "/journey/tokyo.jpg"), day("day-kyoto", "kyoto", 5, "2027-04-07", "Kyoto temple walk", "/journey/illustrations/homepage-frame/japan.webp")], recommendations: [], createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
};

const longTrip: EasyTTrip = {
  ...shortTrip, id: "personal-route-long", title: "Across Japan and China in the autumn light — a much longer personal journey title", startDate: "2027-09-14", endDate: "2027-10-24",
  brief: { ...shortTrip.brief, customTitle: "Across Japan and China in the autumn light — a much longer personal journey title" },
  stops: [
    stop("tokyo-long", 0, "Tokyo", "Japan", [139.6917, 35.6895], "2027-09-14", "2027-09-20", 6),
    stop("kanazawa", 1, "Kanazawa", "Japan", [136.6562, 36.5613], "2027-09-20", "2027-09-26", 6),
    stop("takayama", 2, "Takayama", "Japan", [137.252, 36.146], "2027-09-26", "2027-10-02", 6),
    stop("kyoto-long", 3, "Kyoto", "Japan", [135.7681, 35.0116], "2027-10-02", "2027-10-10", 8),
    stop("shanghai", 4, "Shanghai", "China", [121.4737, 31.2304], "2027-10-10", "2027-10-25", 15),
  ],
  legs: [],
  planItems: [day("day-tokyo-long", "tokyo-long", 1, "2027-09-14", "Tokyo at street level", "/journey/tokyo.jpg"), day("day-kanazawa", "kanazawa", 7, "2027-09-20", "Kanazawa gardens", "/journey/kanazawa.jpg"), day("day-takayama", "takayama", 13, "2027-09-26", "Takayama old town", "/journey/takayama.jpg"), day("day-kyoto-long", "kyoto-long", 19, "2027-10-02", "Kyoto on foot", "/journey/illustrations/homepage-frame/japan.webp"), day("day-shanghai", "shanghai", 27, "2027-10-10", "Shanghai neighbourhoods")],
};

const repeatedTrip: EasyTTrip = {
  ...shortTrip, id: "personal-route-repeat", title: "Athens, Naxos and Athens", startDate: "2027-06-01", endDate: "2027-06-12", brief: { ...shortTrip.brief, origin: "London", customTitle: "Aegean loop" },
  stops: [stop("athens-out", 0, "Athens", "Greece", [23.7275, 37.9838], "2027-06-01", "2027-06-04", 3), stop("naxos", 1, "Naxos", "Greece", [25.3764, 37.1036], "2027-06-04", "2027-06-09", 5), stop("athens-return", 2, "Athens", "Greece", [23.7275, 37.9838], "2027-06-09", "2027-06-13", 4)],
  planItems: [day("day-athens-out", "athens-out", 1, "2027-06-01", "Athens arrival", "/journey/immersive/route-italy-greece-1536.webp"), day("day-naxos", "naxos", 4, "2027-06-04", "Naxos coast"), day("day-athens-return", "athens-return", 9, "2027-06-09", "Athens return")], legs: [],
};

const partialTrip: EasyTTrip = {
  ...shortTrip, id: "personal-route-partial", title: "A route still taking shape", brief: { ...shortTrip.brief, customTitle: "A route still taking shape" },
  stops: [stop("tokyo-partial", 0, "Tokyo", "Japan", [139.6917, 35.6895], "2027-04-03", "2027-04-07", 4), stop("mountain", 1, "A mountain stop", "Japan", null, null, null, null), stop("kyoto-partial", 2, "Kyoto", "Japan", [135.7681, 35.0116], "2027-04-08", "2027-04-11", 3)],
  legs: [], planItems: [day("day-tokyo-partial", "tokyo-partial", 1, "2027-04-03", "Tokyo neighbourhoods", "/journey/tokyo.jpg"), day("day-kyoto-partial", "kyoto-partial", 6, "2027-04-08", "Kyoto temple walk")],
};

function PersonalRouteStory({ trip, initialSection }: { trip: EasyTTrip; initialSection?: string }) {
  useEffect(() => {
    if (!initialSection) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(initialSection)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialSection]);

  return <PersonalRouteView presentation={personalRoutePresentation(trip)} navigation={<EasyTNavigation current="trips" logoTone="light" />} />;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Routes/Personal route",
  component: PersonalRouteStory,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/my-routes/personal-route-short" } } },
  args: { trip: shortTrip },
} satisfies Meta<typeof PersonalRouteStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShortPlannedTrip: Story = {};
export const LongCrossMonthTrip: Story = { args: { trip: longTrip } };
export const RepeatedCityLoop: Story = { args: { trip: repeatedTrip } };
export const PartialFacts: Story = { args: { trip: partialTrip } };
export const RouteChapters: Story = { args: { trip: repeatedTrip, initialSection: "route-places" } };
export const RoutePacing: Story = { args: { trip: longTrip, initialSection: "route-pacing" } };
export const SelectedHighlights: Story = { args: { trip: shortTrip, initialSection: "route-highlights" } };
export const PartialFactsMap: Story = { args: { trip: partialTrip, initialSection: "route-map" } };
export const DesktopJourneyNavigator: Story = { args: { trip: repeatedTrip, initialSection: "route-map" }, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const MobileJourneyStrip: Story = { args: { trip: repeatedTrip, initialSection: "route-map" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };

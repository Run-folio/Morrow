import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadTripRecovery, subscribeToTripStorage } from "@/lib/easyt/storage";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { affiliatePartners, type BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";
import type { ReadinessCard, TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { tourTripFixture } from "./storybook/tour-trip.fixture";
import TripOverviewWorkspace, { OverviewStepMedia } from "./trip-overview-workspace";
import TripShell from "./trip-shell";
import workspaceStyles from "./trip-overview-workspace.module.css";
import { setStorybookAuthOwner } from "../../.storybook/auth-client.mock";
import { createPlanningConfidence } from "@/lib/easyt/planning-confidence";
import { ROUTE_BACKTRACKING_REASON_PREFIX } from "@/lib/easyt/planner";
import { overviewStopImage } from "@/lib/easyt/trip-overview-imagery";

const image = "/journey/peru-sacred-valley-route.jpg";

const planDay = (dayNumber: number, stopId: string, title: string, type: PlanItem["type"] = "activity"): PlanItem => ({
  id: `overview-day-${dayNumber}`,
  stopId,
  dayNumber,
  date: `2026-08-${String(20 + dayNumber).padStart(2, "0")}`,
  type,
  title,
  reason: dayNumber === 1 ? "A protected arrival day leaves room to settle in." : "A focused day that keeps the route realistic.",
  notes: ["Keep the day geographically coherent", "Leave the evening flexible"],
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
  image,
  sourceUrl: null,
});

const baseTrip: EasyTTrip = {
  schemaVersion: 1,
  id: "cusco-sacred-valley-arequipa",
  ownerId: "storybook-traveller",
  title: "Cusco to Cusco & Sacred Valley & Arequipa",
  status: "draft",
  startDate: "2026-08-21",
  endDate: "2026-08-27",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "Cusco",
    mustDo: "Sacred Valley",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: {},
    routeAssessment: {
      comfortableDays: 7,
      shortfallDays: 0,
      durations: {},
      route: {
        state: "current-order",
        currentStopIds: ["cusco", "sacred-valley", "arequipa"],
        recommendedStopIds: ["cusco", "sacred-valley", "arequipa"],
        currentTransferMinutes: 465,
        recommendedTransferMinutes: 465,
        improvementMinutes: 0,
        reasons: ["The entered order ranks first under the current route criteria.", "It keeps the route moving in one direction instead of doubling back."],
        tradeoffs: ["The Arequipa connection still needs a live flight check before booking."],
        summary: "This route already flows well.",
      },
    },
    bookings: [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-08-21", confirmation: null, url: null }],
    checklist: [
      { id: "passport", label: "Check passport validity", complete: true },
      { id: "insurance", label: "Review travel insurance", complete: false },
      { id: "offline", label: "Save offline maps", complete: false },
      { id: "packing", label: "Finish packing list", complete: false },
    ],
  },
  stops: [
    { id: "cusco", order: 0, name: "Cusco", country: "Peru", latitude: -13.532, longitude: -71.967, arrivalDate: "2026-08-21", departureDate: "2026-08-24", nights: 3 },
    { id: "sacred-valley", order: 1, name: "Sacred Valley", country: "Peru", latitude: -13.333, longitude: -72.083, arrivalDate: "2026-08-24", departureDate: "2026-08-26", nights: 2 },
    { id: "arequipa", order: 2, name: "Arequipa", country: "Peru", latitude: -16.398, longitude: -71.536, arrivalDate: "2026-08-26", departureDate: "2026-08-28", nights: 2 },
  ],
  legs: [
    { id: "cusco-valley", fromStopId: "cusco", toStopId: "sacred-valley", mode: "road", distanceKm: 55, durationMinutes: 75, provider: null, routeMetadata: {} },
    { id: "valley-arequipa", fromStopId: "sacred-valley", toStopId: "arequipa", mode: "flight", distanceKm: 315, durationMinutes: 390, provider: null, routeMetadata: {} },
  ],
  planItems: [
    planDay(1, "cusco", "Arrive in Cusco", "arrival"),
    planDay(2, "cusco", "Explore Cusco"),
    planDay(3, "cusco", "Explore Cusco"),
    planDay(4, "sacred-valley", "Travel to Sacred Valley", "transport"),
    planDay(5, "sacred-valley", "Explore Sacred Valley"),
    planDay(6, "arequipa", "Travel to Arequipa", "transport"),
    planDay(7, "arequipa", "Explore Arequipa"),
  ],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const prepProfile: TravelReadinessProfile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };
const coherentRouteTrip: EasyTTrip = {
  ...baseTrip,
  endDate: "2026-08-28",
  brief: { ...baseTrip.brief, originCoordinates: [-71.967, -13.532], originCountry: "Peru" },
  legs: baseTrip.legs.map((leg) => leg.id === "valley-arequipa"
    ? { ...leg, distanceKm: 346, durationMinutes: 180 }
    : { ...leg, distanceKm: 26 }),
};
const creditedPhotoTrip: EasyTTrip = {
  ...baseTrip,
  title: "Tokyo to Kyoto & Osaka",
  brief: { ...baseTrip.brief, origin: "Tokyo", originCountry: "Japan", originCoordinates: [139.6917, 35.6895] },
  stops: baseTrip.stops.map((stop, index) => ({
    ...stop,
    name: ["Tokyo", "Kyoto", "Osaka"][index] ?? stop.name,
    country: "Japan",
    latitude: [35.6762, 35.0116, 34.6937][index] ?? stop.latitude,
    longitude: [139.6503, 135.7681, 135.5023][index] ?? stop.longitude,
  })),
  planItems: baseTrip.planItems.map((item) => ({ ...item, image: null, sourceUrl: null })),
};
const prepActions: BookingReadinessAction[] = [{
  id: "trip-connectivity",
  category: "connectivity",
  provider: "saily",
  title: "Set up trip connectivity",
  detail: "Compare data coverage for Peru before purchasing.",
  cta: "Check eSIM coverage",
  href: "https://saily.com/",
  tripId: baseTrip.id,
  affiliate: true,
  livePrice: false,
}, {
  id: "trip-flights",
  category: "flight",
  provider: "google-flights",
  title: "Check the Arequipa flight",
  detail: "Compare the saved route and dates with the provider.",
  cta: "Check flights",
  href: "https://www.google.com/travel/flights",
  tripId: baseTrip.id,
  affiliate: false,
  livePrice: false,
}];
const omioPrepActions: BookingReadinessAction[] = [
  {
    id: "omio-cusco-valley",
    category: "transport",
    provider: "omio",
    title: "Check Cusco to Sacred Valley transport",
    detail: "Compare the saved route with live rail and coach options before booking.",
    cta: "Check transport options on Omio",
    href: affiliatePartners.omio.transportUrl,
    tripId: baseTrip.id,
    transferId: "cusco-valley",
    originStopId: "cusco",
    destinationStopId: "sacred-valley",
    affiliate: true,
    affiliateCategory: "airport_transfer",
    livePrice: false,
  },
  {
    id: "omio-valley-arequipa",
    category: "transport",
    provider: "omio",
    title: "Check Sacred Valley to Arequipa transport",
    detail: "Compare the saved route with live rail and coach options before booking.",
    cta: "Check transport options on Omio",
    href: affiliatePartners.omio.transportUrl,
    tripId: baseTrip.id,
    transferId: "valley-arequipa",
    originStopId: "sacred-valley",
    destinationStopId: "arequipa",
    affiliate: true,
    affiliateCategory: "airport_transfer",
    livePrice: false,
  },
];
const prepReadinessCards: ReadinessCard[] = [{
  id: "insurance",
  priority: "useful",
  title: "Insurance",
  detail: "Consider whether you need cover for your trip.",
  href: affiliatePartners.worldNomads.insuranceUrl,
  cta: "Get a travel insurance quote",
  partner: "world-nomads",
}];

function OverviewStoryFrame({ trip, restoreSavedFixture, children }: { trip: EasyTTrip; restoreSavedFixture: boolean; children: (trip: EasyTTrip) => ReactNode }) {
  // Production device-trip entry loads its canonical document before mounting the shell.
  // This opt-in fixture does the same so a browser reload exercises the real recovery store.
  const identity = JSON.stringify([trip.ownerId, trip.id]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const sourceRevisionRef = useRef(0);
  const [readVersion, setReadVersion] = useState(0);
  const [restored, setRestored] = useState<{ identity: string; trip: EasyTTrip } | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    if (!restoreSavedFixture) return;
    return subscribeToTripStorage(trip.ownerId, trip.id, () => {
      sourceRevisionRef.current += 1;
      setReadVersion((version) => version + 1);
    });
  }, [restoreSavedFixture, trip.id, trip.ownerId]);
  useEffect(() => {
    if (!restoreSavedFixture) return;
    let active = true;
    const revision = sourceRevisionRef.current;
    const isCurrent = () => active && identityRef.current === identity && sourceRevisionRef.current === revision;
    setRestored(null);
    setReadFailed(false);
    void loadTripRecovery(trip.id, trip.ownerId).then((recovery) => {
      if (isCurrent()) setRestored({ identity, trip: recovery?.trip ?? trip });
    }).catch(() => { if (isCurrent()) setReadFailed(true); });
    return () => { active = false; };
  }, [identity, readVersion, restoreSavedFixture, trip]);
  if (!restoreSavedFixture) return children(trip);
  if (readFailed) return <MorroviaSectionStatus state="error" title="Device fixture could not be checked" detail="Retry the storage check before opening the fixture." onRetry={() => setReadVersion((version) => version + 1)} />;
  if (!restored || restored.identity !== identity) return <MorroviaSectionStatus title="Opening the trip fixture" detail="Checking this exact device copy before mounting the workspace." />;
  return children(restored.trip);
}

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Overview",
  component: TripOverviewWorkspace,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa" } },
  },
  decorators: [(Story, context) => {
    if (context.parameters.feedbackAuthenticatedFixture && context.args.trip.ownerId) setStorybookAuthOwner(context.args.trip.ownerId);
    return <OverviewStoryFrame key={context.id} trip={context.args.trip} restoreSavedFixture={Boolean(context.parameters.restoreSavedFixture)}>{(trip) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}><TripShell trip={trip} cacheTrip={false} orientationAutoStart={false} feedbackStoryEligible={Boolean(context.parameters.feedbackStoryEligible)}><Story args={{ ...context.args, trip }} /></TripShell></main>}</OverviewStoryFrame>;
  }],
  args: {
    trip: baseTrip,
    initialPrepActions: prepActions,
    initialPrepReadinessCards: prepReadinessCards,
    initialPrepProfile: prepProfile,
    initialPrepProviderStatus: "available",
    now: "2026-07-20",
  },
} satisfies Meta<typeof TripOverviewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActivePlanning: Story = {};

export const ThirdPartyPhotoCredits: Story = { args: { trip: creditedPhotoTrip } };
export const CompactPhotoCreditCard: Story = {
  render: () => <div className={workspaceStyles.routeList} style={{ width: 220 }}>
    <OverviewStepMedia image={overviewStopImage(creditedPhotoTrip, creditedPhotoTrip.stops[0])} name="Tokyo" meta="3 nights" number={1} href="/journey/trip/cusco-sacred-valley-arequipa" />
  </div>,
  play: async ({ canvasElement }) => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label^="Photo credit"]')?.click();
  },
};

export const TourCapture: Story = {
  args: {
    trip: tourTripFixture,
    initialPrepActions: prepActions.map((action) => ({ ...action, tripId: tourTripFixture.id })),
  },
};

export const FirstTripArrival: Story = {
  args: { trip: coherentRouteTrip, firstArrival: true },
};

export const ReturningPartiallyPlanned: Story = {
  args: {
    trip: {
      ...coherentRouteTrip,
      brief: {
        ...coherentRouteTrip.brief,
        itineraryIdeas: [{
          id: "idea-sacsayhuaman",
          stopId: "cusco",
          placeId: "sacsayhuaman",
          title: "Sacsayhuamán",
          category: "activity",
          source: "destination-highlight",
          reasons: ["destination-significance"],
          dayId: "overview-day-2",
        }],
      },
    },
  },
};
// The production workspace renders the same ContextualFeedbackSlot after route work.
export const ContextualFeedbackPopulatedOverview: Story = { ...ReturningPartiallyPlanned, parameters: { feedbackStoryEligible: true } };
export const ContextualFeedbackRouteOnlyOverview: Story = {
  ...ReturningPartiallyPlanned,
  args: { ...ReturningPartiallyPlanned.args, trip: { ...ReturningPartiallyPlanned.args!.trip!, planItems: [] } },
  parameters: { feedbackStoryEligible: true },
};
export const ContextualFeedbackAuthenticatedEntry: Story = { ...ReturningPartiallyPlanned, parameters: { feedbackAuthenticatedFixture: true } };

export const HealthIssue: Story = {
  args: {
    trip: {
      ...baseTrip,
      stops: baseTrip.stops.map((stop) => stop.id === "arequipa" ? { ...stop, nights: 1 } : stop),
      legs: baseTrip.legs.map((leg) => leg.id === "valley-arequipa" ? { ...leg, mode: "road", durationMinutes: 480, distanceKm: 615 } : leg),
    },
  },
};

const routeReviewTrip = (first: "confirmed" | "unresolved", second: "confirmed" | "unresolved" | "long-road"): EasyTTrip => ({
  ...coherentRouteTrip,
  legs: coherentRouteTrip.legs.map((leg, index) => {
    const state = index === 0 ? first : second;
    if (state === "unresolved") return { ...leg, mode: "unknown", durationMinutes: null, distanceKm: null };
    if (state === "long-road") return { ...leg, mode: "road", durationMinutes: 330, distanceKm: 346 };
    return leg;
  }),
});

export const OneTransferNeedsReview: Story = { args: { trip: routeReviewTrip("unresolved", "confirmed") } };
export const MultipleTransfersNeedReview: Story = { args: { trip: routeReviewTrip("unresolved", "unresolved") } };
export const LongRoadTransferOnly: Story = { args: { trip: routeReviewTrip("confirmed", "long-road") } };
export const CombinedTransferChecks: Story = { args: { trip: routeReviewTrip("unresolved", "long-road") } };
export const ConfirmedRoute: Story = { args: { trip: routeReviewTrip("confirmed", "confirmed") } };

const routeWarningTrip: EasyTTrip = {
  ...coherentRouteTrip,
  endDate: "2026-08-27",
  stops: coherentRouteTrip.stops.map((stop) => stop.id === "cusco" ? { ...stop, nights: null } : stop),
  brief: {
    ...coherentRouteTrip.brief,
    routeAssessment: coherentRouteTrip.brief.routeAssessment ? {
      ...coherentRouteTrip.brief.routeAssessment,
      route: {
        ...coherentRouteTrip.brief.routeAssessment.route,
        state: "recommendation",
        improvementMinutes: 120,
        reasons: [`${ROUTE_BACKTRACKING_REASON_PREFIX} under the current route criteria.`],
      },
    } : undefined,
  },
};

export const HealthyRouteCheck: Story = { args: { trip: coherentRouteTrip } };
export const OneRouteFinding: Story = {
  args: { trip: { ...routeWarningTrip, endDate: coherentRouteTrip.endDate, stops: coherentRouteTrip.stops } },
};
export const TwoRelatedTransportFindings: Story = {
  args: {
    trip: {
      ...routeReviewTrip("unresolved", "long-road"),
      endDate: "2026-08-30",
      stops: coherentRouteTrip.stops.map((stop) => stop.id === "arequipa" ? { ...stop, nights: 4, departureDate: "2026-08-30" } : stop),
    },
  },
};
export const ThreeRouteFindings: Story = { args: { trip: routeWarningTrip } };
export const MixedRouteAndTransportFindings: Story = {
  args: {
    trip: {
      ...routeReviewTrip("unresolved", "long-road"),
      endDate: "2026-08-27",
    },
  },
};
export const ManyRouteFindings: Story = {
  args: {
    trip: {
      ...routeWarningTrip,
      brief: { ...routeWarningTrip.brief, pace: "slow" },
      stops: routeWarningTrip.stops.map((stop) => stop.id === "cusco" || stop.id === "sacred-valley" ? { ...stop, nights: 1 } : stop),
    },
  },
};

const unresolvedConfidence = createPlanningConfidence({
  state: "inferred",
  level: "high",
  freshness: "current",
  scope: "general-route",
  sources: [],
  reason: "Provider-confirmed protected area.",
});
const unresolvedProvenance = [{
  id: "provider:kruger-national-park",
  label: "Global place provider",
  kind: "provider" as const,
  supports: "Provider-confirmed protected area identity and coordinates.",
}];

export const UnresolvedPlaceIntent: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        structuredBrief: {
          version: 1,
          destinations: [],
          mustVisit: [],
          countries: [],
          preferredRegions: [],
          dates: {},
          interests: [],
          transportPreferences: [],
          accommodationPreferences: [],
          hardConstraints: [],
          softPreferences: [],
          source: { rawPrompt: "Kruger National Park", parserVersion: "storybook", inputs: ["prompt"] },
          confidence: "high",
          issues: [],
          placeMentions: [{
            mentionId: "place-kruger-national-park",
            sourceText: "Kruger National Park",
            sourceTexts: ["Kruger National Park"],
            normalizedPhrase: "kruger national park",
            canonicalName: "Kruger National Park",
            canonicalPlaceId: "provider:kruger-national-park",
            aliases: [],
            placeType: "natural_area",
            status: "resolved",
            confidence: unresolvedConfidence,
            provenance: unresolvedProvenance,
            parentCountries: ["South Africa"],
            parentRegionId: "Mpumalanga",
            coordinates: [31.485, -24.994],
            routability: "needs_base_selection",
            directlyRoutable: false,
            requiresBaseSelection: true,
            isAnchor: true,
            role: "preferred",
            order: 3,
            candidates: [],
          }],
          placeIssues: [{
            code: "region_requires_base",
            mentionId: "place-kruger-national-park",
            canonicalPlaceId: "provider:kruger-national-park",
            sourceText: "Kruger National Park",
            reason: "The protected area needs a verified overnight base.",
            message: "Choose where to stay for Kruger National Park before Morrovia adds it to the route.",
            severity: "error",
            blocksRoute: true,
            options: [],
            provenance: unresolvedProvenance,
            confidence: unresolvedConfidence,
          }],
          placeSelections: [],
          completedPlanningAreaMentionIds: [],
          removedPlaceMentionIds: [],
        },
      },
    },
  },
};

export const ReadyTrip: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        bookings: baseTrip.stops.map((stop) => ({ id: `stay-${stop.id}`, type: "stay" as const, title: `${stop.name} stay`, date: stop.arrivalDate, confirmation: null, url: null })),
        checklist: baseTrip.brief.checklist?.map((item) => ({ ...item, complete: true })),
      },
    },
  },
};

export const AllPreparationIncomplete: Story = {
  args: { trip: { ...baseTrip, brief: { ...baseTrip.brief, bookings: [], checklist: [] } }, initialPrepProfile: prepProfile },
};

export const InsuranceQuoteHandoff: Story = {};

export const PracticalPrep: Story = {};

export const PracticalPrepWithProviderOptions: Story = {
  args: { initialGoodTasksOpen: true },
};

export const TransportActionsStayInTransport: Story = {
  args: { initialPrepActions: [...prepActions, ...omioPrepActions], initialGoodTasksOpen: true },
};

export const AccommodationPartlyComplete: Story = {};

export const AccommodationComplete: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        bookings: baseTrip.stops.map((stop) => ({ id: `stay-${stop.id}`, type: "stay" as const, title: `${stop.name} stay`, date: stop.arrivalDate, confirmation: null, url: null })),
      },
    },
  },
};

export const TransportComplete: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        bookings: [
          ...(baseTrip.brief.bookings ?? []),
          ...baseTrip.legs.map((leg) => ({ id: `booking-${leg.id}`, type: "transport" as const, title: `Saved ${leg.id}`, date: null, confirmation: null, url: null })),
        ],
      },
    },
  },
};

export const TravellerDetailsComplete: Story = {
  args: { initialPrepProfile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-08" } },
};

export const EarlyIncomplete: Story = {
  args: { trip: { ...baseTrip, planItems: baseTrip.planItems.slice(0, 2), brief: { ...baseTrip.brief, bookings: [], checklist: [] } } },
};

export const MinimalTrip: Story = {
  args: {
    trip: {
      ...baseTrip,
      id: "minimal-overview",
      title: "Cusco",
      endDate: "2026-08-21",
      stops: [{ ...baseTrip.stops[0], departureDate: "2026-08-22", nights: 1 }],
      legs: [],
      planItems: [{ ...baseTrip.planItems[0], id: "minimal-day", notes: [], image: null }],
      brief: { ...baseTrip.brief, routeAssessment: undefined, bookings: [], checklist: [] },
    },
  },
};

export const LongerTrip: Story = {
  args: {
    trip: {
      ...baseTrip,
      endDate: "2026-09-03",
      planItems: Array.from({ length: 14 }, (_, index) => planDay(index + 1, baseTrip.stops[Math.min(2, Math.floor(index / 5))].id, `Plan day ${index + 1}`)),
    },
  },
};

export const ProviderUnavailable: Story = {
  args: { initialPrepActions: [], initialPrepReadinessCards: [], initialPrepProviderStatus: "unavailable" },
};

export const MissingImagesAndLongRoute: Story = {
  args: {
    trip: {
      ...baseTrip,
      stops: baseTrip.stops.map((stop, index) => index === 1 ? { ...stop, name: "The Sacred Valley and Ollantaytambo" } : stop),
      planItems: baseTrip.planItems.map((item) => ({ ...item, image: null })),
    },
  },
};

export const MissingOptionalData: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: { ...baseTrip.brief, routeAssessment: undefined, bookings: undefined, checklist: undefined },
      stops: baseTrip.stops.map((stop, index) => index === 1 ? { ...stop, latitude: null, longitude: null } : stop),
      planItems: baseTrip.planItems.map((item) => ({ ...item, image: null, notes: [] })),
    },
  },
};

export const DepartingToday: Story = { args: { now: "2026-08-21" } };
export const DepartureFarInFuture: Story = { args: { now: "2026-01-01" } };

export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BeforeYouGoMobile390: Story = { args: { initialGoodTasksOpen: true }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const Desktop1680: Story = { globals: { viewport: { value: "morrovia1680", isRotated: false } } };

// Canonical Namibia outline: three shaped days, seven overnight stops and six unbooked road legs.
const overviewNamibiaStops = [
  ["windhoek", "Windhoek", 17.0832, -22.5609, "2026-10-01", "2026-10-02", 1],
  ["sossusvlei", "Sossusvlei", 15.2928, -24.7333, "2026-10-02", "2026-10-04", 2],
  ["swakopmund", "Swakopmund", 14.5266, -22.6784, "2026-10-04", "2026-10-06", 2],
  ["damaraland", "Damaraland", 14.5, -20.5, "2026-10-06", "2026-10-08", 2],
  ["etosha", "Etosha", 16, -19.2, "2026-10-08", "2026-10-11", 3],
  ["waterberg", "Waterberg", 17.25, -20.5, "2026-10-11", "2026-10-13", 2],
  ["windhoek-return", "Windhoek", 17.0832, -22.5609, "2026-10-13", "2026-10-14", 1],
] as const;
const overviewNamibiaRouteStops = overviewNamibiaStops.map(([id, name, longitude, latitude, arrivalDate, departureDate, nights], order) => ({ id, name, longitude, latitude, arrivalDate, departureDate, nights, order, country: "Namibia" }));
const overviewNamibiaTrip: EasyTTrip = {
  ...baseTrip,
  id: "storybook-overview-namibia-prep",
  title: "Namibia",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  brief: { ...baseTrip.brief, origin: "Windhoek", originCountry: "Namibia", originCoordinates: [17.0832, -22.5609], journeyEnd: { mode: "same_as_start" }, routeAssessment: undefined, bookings: [], checklist: [], customActivities: { "1": ["Explore central Windhoek"], "4": ["Explore Swakopmund"], "9": ["Etosha game drive"] } },
  stops: overviewNamibiaRouteStops,
  legs: [390, 225, 225, 240, 195, 210].map((durationMinutes, index) => ({ id: `namibia-road-${index + 1}`, fromStopId: overviewNamibiaRouteStops[index]!.id, toStopId: overviewNamibiaRouteStops[index + 1]!.id, mode: "road", durationMinutes, doorToDoorMinutes: durationMinutes, distanceKm: null, provider: "Morrovia planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: { planningEstimate: true } })),
  planItems: Array.from({ length: 14 }, (_, index) => ({ ...planDay(index + 1, (overviewNamibiaRouteStops.find((stop) => `2026-10-${String(index + 1).padStart(2, "0")}` < stop.departureDate) ?? overviewNamibiaRouteStops[6]!).id, "Plan this day"), date: `2026-10-${String(index + 1).padStart(2, "0")}`, image: null })),
};
export const ApprovedPlanningAndPrep: Story = {
  args: { trip: overviewNamibiaTrip, language: "en", initialPrepActions: prepActions.filter((action) => action.category === "connectivity").map((action) => ({ ...action, tripId: overviewNamibiaTrip.id, detail: "Compare data coverage for Namibia before purchasing." })) },
};
export const PartiallySortedPracticalPrep: Story = {
  ...ApprovedPlanningAndPrep,
  args: { ...ApprovedPlanningAndPrep.args, trip: { ...overviewNamibiaTrip, id: "storybook-overview-namibia-partial", brief: { ...overviewNamibiaTrip.brief, checklist: [{ id: "overview-prep-insurance", label: "Travel insurance", complete: true }, { id: "overview-prep-connectivity", label: "Trip connectivity", complete: false, resolution: "not-needed" }] } }, initialPrepProfile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "" } },
};
export const PracticalPrepSpanish: Story = { ...ApprovedPlanningAndPrep, args: { ...ApprovedPlanningAndPrep.args, language: "es" } };
export const ApprovedPlanningMobile: Story = { ...ApprovedPlanningAndPrep, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const ApprovedPlanningTablet: Story = { ...ApprovedPlanningAndPrep, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const ApprovedPlanningNarrow: Story = { ...ApprovedPlanningAndPrep, globals: { viewport: { value: "morrovia320", isRotated: false } } };

export const PersistedPracticalPrep: Story = {
  ...ApprovedPlanningAndPrep,
  args: { ...ApprovedPlanningAndPrep.args, trip: { ...overviewNamibiaTrip, id: "storybook-overview-namibia-persisted-prep", ownerId: null } },
  parameters: { restoreSavedFixture: true },
};

export const PersistedPracticalPrepMobile: Story = { ...PersistedPracticalPrep, globals: { viewport: { value: "morrovia390", isRotated: false } } };

// Disposable identity/action fixture. Production handlers remain unchanged;
// browser qualification supplies isolated API responses and never sends a gift.
const overviewIdentityTrip: EasyTTrip = {
  ...baseTrip, id: "storybook-overview-identity", title: "London Gatwick → Beijing → Shanghai → Tokyo",
  brief: { ...baseTrip.brief, customTitle: null, origin: "London Gatwick", originCountry: "United Kingdom", originCoordinates: [-0.1821, 51.1537], bookings: [], routeAssessment: undefined },
  stops: baseTrip.stops.map((stop,index) => ({ ...stop, ...[
    {name:"Beijing",country:"China",latitude:39.9042,longitude:116.4074},
    {name:"Shanghai",country:"China",latitude:31.2304,longitude:121.4737},
    {name:"Tokyo",country:"Japan",latitude:35.6762,longitude:139.6503},
  ][index]! })),
  legs: baseTrip.legs.map(leg => ({...leg,mode:"flight",durationMinutes:null,doorToDoorMinutes:null,distanceKm:null,provider:null,provenance:undefined,routeMetadata:{}})),
  planItems: baseTrip.planItems.map(item => ({...item,image:null})),
};
const identityParameters = { feedbackAuthenticatedFixture: true, nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-overview-identity" } } };
export const LibraryActionsOwner: Story = { args: { trip: overviewIdentityTrip }, parameters: identityParameters };
export const LibraryActionsOwnerMobile: Story = { ...LibraryActionsOwner, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const LibraryActionsGuest: Story = { ...LibraryActionsOwner, args: { trip: {...overviewIdentityTrip,ownerId:null} }, parameters: {...identityParameters,feedbackAuthenticatedFixture:false} };
export const AuthoredIdentity: Story = { ...LibraryActionsOwner, args: {trip:{...overviewIdentityTrip,title:"Our spring adventure",brief:{...overviewIdentityTrip.brief,customTitle:"Our spring adventure"}}} };
export const AmbiguousLegacyIdentity: Story = { ...LibraryActionsOwner, args: {trip:{...overviewIdentityTrip,brief:Object.fromEntries(Object.entries(overviewIdentityTrip.brief).filter(([key])=>key!=="customTitle")) as EasyTTrip["brief"]}} };
export const OtherWorkspaceRouteContext: Story = { ...LibraryActionsOwner, parameters: {...identityParameters,nextjs:{appDirectory:true,navigation:{pathname:"/journey/storybook-overview-identity/itinerary"}}} };

const checkRouteMapFraming: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const heading = canvas.getByRole("heading", { name: "Your route" });
  const preview = canvas.getByRole("region", { name: "Journey map" });
  const journey = canvasElement.querySelector<HTMLElement>('[class*="routeJourney"]');
  const frame = preview.querySelector<HTMLElement>('[class*="frame"]');
  if (!journey?.lastElementChild || !frame) throw new Error("Route content and map frame must remain available");
  const previewRect = preview.getBoundingClientRect();
  const contentBottom = journey.lastElementChild.getBoundingClientRect().bottom;
  if (window.innerWidth > 980) {
    await expect(Math.abs(previewRect.top - heading.getBoundingClientRect().top)).toBeLessThan(1);
    await expect(previewRect.bottom - contentBottom).toBeGreaterThanOrEqual(-1);
    await expect(previewRect.bottom - contentBottom).toBeLessThan(44);
  } else {
    await expect(previewRect.top).toBeGreaterThanOrEqual(contentBottom);
  }
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await expect(previewRect.height - frame.getBoundingClientRect().height).toBeGreaterThanOrEqual(60);
  await expect(within(preview).getByRole("link", { name: "View map" })).toBeVisible();
  const transferTitle = canvas.queryByText("A transfer still needs checking", { exact: true });
  if (transferTitle) {
    const insight = transferTitle.closest("aside");
    if (!insight) throw new Error("The transfer warning must retain its accessible region");
    await expect(within(insight).queryByText("Transfer details", { exact: true })).toBeNull();
    await expect(within(insight).getByText("Confirm its route and timing before booking.", { exact: true })).toBeVisible();
    await expect(within(insight).getByRole("link", { name: "View detailed itinerary" })).toBeVisible();
  }
};

export const MapFramingAirportAndTransferReview: Story = {
  args: { trip: { ...overviewIdentityTrip, ownerId: null } }, play: checkRouteMapFraming,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: `/journey/${overviewIdentityTrip.id}` } } },
};
export const MapFramingConfirmedRoute: Story = { args: { trip: routeReviewTrip("confirmed", "confirmed") }, play: checkRouteMapFraming };

// Repeated canonical places exercise eight distinct occurrences without
// inventing geography or duration estimates. This fixture is never saved.
const framingStops = Array.from({ length: 8 }, (_, index) => ({
  ...coherentRouteTrip.stops[index % coherentRouteTrip.stops.length]!,
  id: `map-framing-stop-${index + 1}`, order: index, nights: 1,
  arrivalDate: `2026-08-${21 + index}`, departureDate: `2026-08-${22 + index}`,
}));
const eightStopFramingTrip: EasyTTrip = {
  ...coherentRouteTrip, id: "storybook-map-framing-eight-occurrences", endDate: "2026-08-29",
  brief: { ...coherentRouteTrip.brief, routeAssessment: undefined, bookings: [] },
  stops: framingStops, planItems: [],
  legs: framingStops.slice(1).map((stop, index) => ({
    ...coherentRouteTrip.legs[0]!, id: `map-framing-leg-${index + 1}`,
    fromStopId: framingStops[index]!.id, toStopId: stop.id,
    mode: "unknown", distanceKm: null, durationMinutes: null, doorToDoorMinutes: null,
    provider: null, routeMetadata: {},
  })),
};
export const MapFramingEightStops: Story = {
  args: { trip: eightStopFramingTrip }, play: checkRouteMapFraming,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: `/journey/${eightStopFramingTrip.id}` } } },
};

const compactEndpointTrip: EasyTTrip = { ...baseTrip,
  brief: {...baseTrip.brief,origin:"London Gatwick (LGW)",originCountry:"United Kingdom",originCoordinates:[-0.19,51.15],journeyEnd:{mode:"same_as_start"}},
  legs:[...baseTrip.legs,
    {...baseTrip.legs[0]!,id:"compact-arrival",classification:"arrival",fromStopId:`${baseTrip.id}-origin`,toStopId:baseTrip.stops[0]!.id,mode:"flight",durationMinutes:null},
    {...baseTrip.legs[0]!,id:"compact-return",classification:"departure",fromStopId:baseTrip.stops.at(-1)!.id,toStopId:`${baseTrip.id}-end`,mode:"flight",durationMinutes:180}],
};
export const CompactReturnEndpoints: Story = {args:{trip:compactEndpointTrip}};
export const CompactGuestEndpoints: Story = {args:{trip:{...compactEndpointTrip,ownerId:null}}};
export const CompactDifferentEndpoint: Story = {args:{trip:{...compactEndpointTrip,brief:{...compactEndpointTrip.brief,journeyEnd:{mode:"explicit",place:{name:"Seoul",country:"South Korea",coordinates:[126.978,37.566]}}}}}};

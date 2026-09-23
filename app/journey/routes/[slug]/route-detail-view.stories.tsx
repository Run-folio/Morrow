import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { publicRouteDetailFor, type PublicRouteDetail } from "@/lib/easyt/public-route";
import RouteDetailView from "./route-detail-view";
import { affiliatePartners, getActivityBookingAction } from "@/lib/easyt/booking-readiness";
import styles from "./route-overview.module.css";

const andean = publicRouteDetailFor("andean-highlands") as PublicRouteDetail;
const longerRoute = publicRouteDetailFor("vietnam-cambodia") as PublicRouteDetail;
const unknownTransfers = publicRouteDetailFor("thailand-laos") as PublicRouteDetail;
const portugal = publicRouteDetailFor("portugal-atlantic") as PublicRouteDetail;
const japan = publicRouteDetailFor("japan-slow") as PublicRouteDetail;
const india = publicRouteDetailFor("india-golden-triangle") as PublicRouteDetail;
const balkans = publicRouteDetailFor("balkans-overland") as PublicRouteDetail;

const missingVisuals: PublicRouteDetail = {
  ...andean,
  heroImage: "",
  attractions: [],
  dataIssues: [...new Set([...andean.dataIssues, "missing-hero" as const, "missing-attractions" as const])],
};

const knownCompromise: PublicRouteDetail = {
  ...portugal,
  warnings: ["This fixture keeps one stay below its route minimum so the production warning treatment remains testable."],
  dataIssues: [...new Set([...portugal.dataIssues, "allocation-compromise" as const])],
};

const unavailableMap: PublicRouteDetail = {
  ...andean,
  stops: andean.stops.map((stop) => ({ ...stop, coordinates: [Number.NaN, Number.NaN] })),
};

const meta = {
  title: "Morrovia/05 Product Patterns/Routes/Route detail",
  component: RouteDetailView,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/routes/andean-highlands" } },
  },
  decorators: [(Story) => <main className={`${styles.page} morrovia-editorial-page`}><Story /></main>],
  args: { detail: andean },
} satisfies Meta<typeof RouteDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StandardAndean: Story = {};
export const ActivityHandoff: Story = {};
export const ActivityHandoffTripComFallback: Story = { args: { activityAction: getActivityBookingAction({ category: "activities" }, { viator: null, tripCom: affiliatePartners.tripCom }) } };
export const ActivityHandoffUnavailable: Story = { args: { activityAction: null } };
export const LongerFourStopRoute: Story = { args: { detail: longerRoute } };
export const MissingImageryAndAttractions: Story = { args: { detail: missingVisuals } };
export const UnknownTransferDetails: Story = { args: { detail: unknownTransfers } };
export const KnownAllocationCompromise: Story = { args: { detail: knownCompromise } };
export const MapUnavailableFallback: Story = { args: { detail: unavailableMap } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const Desktop1680: Story = { globals: { viewport: { value: "morrovia1680", isRotated: false } } };

/** Representative reviewed-rich and concise factual production states. */
export const JapanReviewedDiscovery: Story = { args: { detail: japan } };
export const IndiaFactualFallback: Story = { args: { detail: india } };
export const VietnamCambodiaReviewedDiscovery: Story = { args: { detail: longerRoute } };
export const BalkansReviewedDiscovery: Story = { args: { detail: balkans } };
export const PortugalFactualFallback: Story = { args: { detail: portugal } };
export const IcelandEditorialReview: Story = { args: { detail: publicRouteDetailFor("iceland-ring-road")! } };

export const SelectedJapanStop: Story = { args: { detail: japan, initialMapSelection: { kind: "stop", stopId: japan.stops[2].id } } };
export const SelectedBalkansConnection: Story = { args: { detail: balkans, initialMapSelection: { kind: "connection", connectionId: `connection:${balkans.stops[0].id}:${balkans.stops[1].id}` } } };
export const UnknownSelectedTransfer: Story = { args: { detail: unknownTransfers, initialMapSelection: { kind: "connection", connectionId: `connection:${unknownTransfers.stops[0].id}:${unknownTransfers.stops[1].id}` } } };
export const DesktopJourneyNavigator: Story = { args: { detail: balkans, initialMapSelection: { kind: "connection", connectionId: `connection:${balkans.stops[0].id}:${balkans.stops[1].id}` } }, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const MobileJourneyStrip: Story = { args: { detail: japan, initialMapSelection: { kind: "stop", stopId: japan.stops[2].id } }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const JapanMobile390: Story = { args: { detail: japan }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const PortugalMobile430: Story = { args: { detail: portugal }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Desktop1920: Story = {
  parameters: { viewport: { options: { morrovia1920: { name: "1920", styles: { width: "1920px", height: "1080px" } } } } },
  globals: { viewport: { value: "morrovia1920", isRotated: false } },
};

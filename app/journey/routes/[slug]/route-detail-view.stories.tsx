import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { publicRouteDetailFor, type PublicRouteDetail } from "@/lib/easyt/public-route";
import RouteDetailView from "./route-detail-view";
import { affiliatePartners, getActivityBookingAction } from "@/lib/easyt/booking-readiness";
import styles from "./route-overview.module.css";

const andean = publicRouteDetailFor("andean-highlands") as PublicRouteDetail;
const longerRoute = publicRouteDetailFor("vietnam-cambodia") as PublicRouteDetail;
const unknownTransfers = publicRouteDetailFor("thailand-laos") as PublicRouteDetail;
const portugal = publicRouteDetailFor("portugal-atlantic") as PublicRouteDetail;

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

/** Canonical editorial candidates; Storybook does not publish these routes. */
export const JapanFiveStopEditorialReview: Story = { args: { detail: publicRouteDetailFor("japan-slow")! } };
export const BalkansEditorialReview: Story = { args: { detail: publicRouteDetailFor("balkans-overland")! } };
export const VietnamCambodiaEditorialReview: Story = { args: { detail: publicRouteDetailFor("vietnam-cambodia")! } };
export const IcelandEditorialReview: Story = { args: { detail: publicRouteDetailFor("iceland-ring-road")! } };

export const SelectedJapanStop: Story = { args: { detail: publicRouteDetailFor("japan-slow")!, initialMapSelection: { type: "stop", index: 2 } } };
export const SelectedBalkansConnection: Story = { args: { detail: publicRouteDetailFor("balkans-overland")!, initialMapSelection: { type: "connection", index: 0 } } };
export const UnknownSelectedTransfer: Story = { args: { detail: unknownTransfers, initialMapSelection: { type: "connection", index: 0 } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Desktop1920: Story = {
  parameters: { viewport: { options: { morrovia1920: { name: "1920", styles: { width: "1920px", height: "1080px" } } } } },
  globals: { viewport: { value: "morrovia1920", isRotated: false } },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTNavigation from "../../easyt-navigation";
import { publicRouteDetailFor, type PublicRouteDetail } from "@/lib/easyt/public-route";
import RouteDetailView from "./route-detail-view";

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

const meta = {
  title: "Journey/Routes/Route detail",
  component: RouteDetailView,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/routes/andean-highlands" } },
  },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingBottom: 80 }}><EasyTNavigation current="routes" /><Story /></main>],
  args: { detail: andean },
} satisfies Meta<typeof RouteDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StandardAndean: Story = {};
export const LongerFourStopRoute: Story = { args: { detail: longerRoute } };
export const MissingImageryAndAttractions: Story = { args: { detail: missingVisuals } };
export const UnknownTransferDetails: Story = { args: { detail: unknownTransfers } };
export const KnownAllocationCompromise: Story = { args: { detail: knownCompromise } };
export const Mobile390: Story = { parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Tablet768: Story = { parameters: { viewport: { defaultViewport: "morrovia768" } } };

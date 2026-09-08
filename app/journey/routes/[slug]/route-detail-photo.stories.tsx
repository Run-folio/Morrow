import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { routeDestinationPhoto } from "@/lib/easyt/route-images";
import RouteDetailPhoto from "./route-detail-photo";
import styles from "./route-overview.module.css";
const photo = routeDestinationPhoto("Tokyo", "Japan")!;
const meta = {
  title: "Morrovia/05 Product Patterns/Routes/Route photograph",
  component: RouteDetailPhoto,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className={styles.page} style={{ width: "min(100%, 600px)", height: 500 }}><Story /></div>],
  args: { photo, label: "Tokyo, Japan" },
} satisfies Meta<typeof RouteDetailPhoto>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Licensed: Story = {};
export const Missing: Story = { args: { photo: null } };
export const FailedResource: Story = { args: { photo: { ...photo, variants: photo.variants.map(variant => ({ ...variant, src: "/intentionally-unavailable-route-photo.webp" })) } } };

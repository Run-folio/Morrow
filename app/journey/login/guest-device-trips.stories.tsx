import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuestDeviceTripsPanel } from "./guest-device-trips";
import styles from "../account.module.css";
const meta = {
  title: "Morrovia/05 Product Patterns/Guest device trips",
  component: GuestDeviceTripsPanel,
  parameters: { layout: "padded" },
  decorators: [Story => <main className={styles.authWrap}><Story /></main>],
  args: { onRetry: () => {}, state: { kind: "ready", trips: [
    { id: "synthetic-one", title: "Japan and South Korea", href: "/journey/plan?trip=synthetic-one&recover=1" },
    { id: "synthetic-two", title: "A very long independent guest journey through destinations with long names", href: "/journey/new?trip=synthetic-two&recover=1" },
  ] } },
} satisfies Meta<typeof GuestDeviceTripsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MultipleCopies: Story = {};
export const Empty: Story = { args: { state: { kind: "ready", trips: [] } } };
export const ProtectedOrUnavailable: Story = { args: { state: { kind: "unavailable" } } };
export const PendingOrAccountSession: Story = { args: { state: { kind: "withheld" } } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };

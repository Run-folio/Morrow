import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuestDeviceTripsPanel } from "./guest-device-trips";
import styles from "../account.module.css";
const meta = {
  title: "Morrovia/05 Product Patterns/Guest device trips",
  component: GuestDeviceTripsPanel,
  parameters: { layout: "padded" },
  decorators: [Story => <main className={styles.authWrap}><Story /></main>],
  args: { onRetry: () => {}, state: { kind: "ready", trips: [
    { id: "synthetic-one", title: "Japan and South Korea", href: "/journey/synthetic-one?recover=1" },
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
export const MyTripsGuest: Story = {
  args: { presentation: "dashboard" },
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    const reopen=canvas.getByRole("link",{name:"Open device copy: Japan and South Korea"});
    const signIn=canvas.getByRole("link",{name:"Sign in"});
    await expect(reopen).toHaveAttribute("href","/journey/synthetic-one?recover=1");
    await expect(signIn).toHaveAttribute("href","/journey/login?next=%2Fjourney%2Fdashboard");
    await expect(Boolean(reopen.compareDocumentPosition(signIn)&Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  },
};
export const MyTripsGuestEmpty: Story = {
  args: { presentation: "dashboard", state: { kind: "ready", trips: [] } },
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await expect(canvas.getByRole("heading",{name:"No trips on this device yet"})).toBeVisible();
    await expect(canvas.getByRole("link",{name:"Plan a trip"})).toHaveAttribute("href","/journey/new");
  },
};
export const MyTripsGuestProtected: Story = {
  args: { presentation: "dashboard", state: { kind: "unavailable" } },
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await expect(canvas.getByRole("button",{name:"Check again"})).toBeVisible();
    await expect(canvas.queryByRole("link",{name:"Plan a trip"})).not.toBeInTheDocument();
  },
};
export const MyTripsGuestMobile320: Story = { ...MyTripsGuest, globals: { viewport: { value: "morrovia320", isRotated: false } } };

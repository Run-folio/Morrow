import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Analytics } from "./analytics";
import OptionalAffiliateTracking from "./optional-affiliate-tracking";
import { installStoryStorageFault } from "./easyt/storybook/story-storage-fixture";
import CookiePreferences from "./cookie-preferences";
import PrivacyConsent from "./privacy-consent";
import { PRIVACY_CONSENT_STORAGE_KEY } from "@/lib/privacy-consent";

const meta = {
  title: "Morrovia/03 Status & Feedback/Privacy choices",
  component: PrivacyConsent,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PrivacyConsent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {
  beforeEach: () => window.localStorage.removeItem(PRIVACY_CONSENT_STORAGE_KEY),
  render: () => <div style={{ minHeight: 560, background: "var(--morrovia-paper)" }}><PrivacyConsent /></div>,
};

export const FirstVisitMobile390: Story = {
  ...FirstVisit,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const CookieSettings: Story = {
  beforeEach: () => window.localStorage.removeItem(PRIVACY_CONSENT_STORAGE_KEY),
  render: () => <div style={{ maxWidth: 760, margin: "40px auto", padding: "0 16px" }}><CookiePreferences /></div>,
};


function PrivacyBoundary() {
  return <main className="morrovia-editorial-page"><h1>Privacy choices</h1><CookiePreferences /><PrivacyConsent /><Analytics /><OptionalAffiliateTracking /></main>;
}
const deniedStoragePlay: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const section = within(canvasElement.querySelector("#cookie-settings") as HTMLElement);
  await section.findByText("No current optional choice. Optional technologies are off.");
  await userEvent.click(section.getByRole("button", { name: "Accept optional" }));
  await expect(section.getByText("No current optional choice. Optional technologies are off.")).toBeVisible();
  await expect(section.queryByText("Your privacy preferences have been saved.")).not.toBeInTheDocument();
};
export const DeniedGetter: Story = {
  tags: ["current-ui"], parameters: { a11y: { test: "error" } },
  beforeEach: () => installStoryStorageFault("getter"),
  render: () => <PrivacyBoundary />, play: deniedStoragePlay,
};
export const DeniedRead: Story = {
  ...DeniedGetter, tags: ["current-ui"], beforeEach: () => installStoryStorageFault("read"),
  play: async ({ canvasElement }) => {
    const section = within(canvasElement.querySelector("#cookie-settings") as HTMLElement);
    await section.findByText("No current optional choice. Optional technologies are off.");
    for (const checkbox of section.getAllByRole("checkbox")) await expect(checkbox).not.toBeChecked();
  },
};
export const DeniedWrite: Story = { ...DeniedGetter, tags: ["current-ui"], beforeEach: () => installStoryStorageFault("write") };

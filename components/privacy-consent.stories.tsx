import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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

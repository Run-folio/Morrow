import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { resetStorybookAuthOwner, setStorybookAuthOwner } from "../../.storybook/auth-client.mock";
import EasyTNavigation from "./easyt-navigation";

function SignedInNavigation({ mobile = false }: { mobile?: boolean }) {
  setStorybookAuthOwner("storybook-navigation-traveller");
  return <div style={mobile ? { width: 390, maxWidth: "100%", minHeight: 760, position: "relative" } : undefined}>
    <EasyTNavigation current="trips" />
  </div>;
}

const meta = {
  title: "Morrovia/04 Structure/Global navigation",
  component: EasyTNavigation,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/about" } },
  },
  tags: ["autodocs"],
  decorators: [(Story) => {
    resetStorybookAuthOwner();
    return <Story />;
  }],
} satisfies Meta<typeof EasyTNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { args: { current: "home" } };

export const AboutActive: Story = { args: { current: "about" } };

export const TabletTransition: Story = {
  args: { current: "passport" },
  globals: { viewport: { value: "morrovia768", isRotated: false } },
  decorators: [(Story) => <div style={{ width: 768, maxWidth: "100%" }}><Story /></div>],
};

export const MobileCompactMenu: Story = {
  args: { current: "new" },
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  decorators: [(Story) => <div style={{ width: 390, maxWidth: "100%", minHeight: 760, position: "relative" }}><Story /></div>],
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>('summary[aria-label="Open navigation"]')?.click();
  },
};

export const ImmersiveLanding: Story = { args: { current: "home", landing: true, deferPrefetch: true } };

export const SignedInDesktop: Story = { render: () => <SignedInNavigation /> };

export const SignedInMobile: Story = {
  render: () => <SignedInNavigation mobile />,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  play: MobileCompactMenu.play,
};

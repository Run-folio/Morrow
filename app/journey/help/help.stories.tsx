import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTNavigation from "../easyt-navigation";
import HelpCenter, { type HelpCenterProps } from "./help-client";
import styles from "./help.module.css";

function HelpPageStory(props: HelpCenterProps) {
  return (
    <main className={`${styles.page} morrovia-editorial-page`}>
      <EasyTNavigation landing />
      <HelpCenter {...props} />
    </main>
  );
}

const meta = {
  title: "Morrovia/05 Product Patterns/Help page",
  component: HelpPageStory,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof HelpPageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopDefault: Story = {};

export const Mobile390Default: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const SelectedTopic: Story = {
  args: { initialOpenTopic: "routes-and-nights" },
};

export const PopularQuestionExpanded: Story = {
  args: { initialOpenQuestion: "different-route-order" },
};

export const SearchResults: Story = {
  args: { initialQuery: "booking provider" },
};

export const NoResults: Story = {
  args: { initialQuery: "cruise loyalty points" },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HomeTripStarter from "./home-trip-starter";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { EasyTField } from "@/components/easyt/easyt-controls";

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage trip starter",
  component: HomeTripStarter,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/" } },
  },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "48px 24px" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><Story /></div></main>],
} satisfies Meta<typeof HomeTripStarter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {};
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };

export const WideCompositionContract: Story = {
  render: () => <MorroviaTripCapture
    language="en"
    value=""
    onValueChange={() => undefined}
    startDate=""
    endDate=""
    onDatesChange={() => undefined}
    travellers={2}
    onTravellersChange={() => undefined}
    interests={[]}
    onInterestsChange={() => undefined}
    onSubmit={() => undefined}
    homepageEntry={{
      mode: "stops",
      onModeChange: () => undefined,
      destinationEntry: <EasyTField label="First stop" placeholder="City, country or region" />,
      budget: null,
      onBudgetChange: () => undefined,
      datesChosen: false,
      onDatesClear: () => undefined,
    }}
  />,
};

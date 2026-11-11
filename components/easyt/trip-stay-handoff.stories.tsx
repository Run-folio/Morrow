import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import TripStayHandoff from "./trip-stay-handoff";

const meta = {
  title: "Morrovia/05 Product patterns/Stay handoff",
  component: TripStayHandoff,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ maxWidth: 420 }}><Story /></div>],
  args: {
    details: "Hotel: Example hotel\nLocation: Tokyo, Japan\nCheck-in: 2027-03-09\nCheck-out: 2027-03-11\nTravellers: 2",
    action: getCurrentPartnerAction("accommodation")!,
    context: { placement: "stay_workspace_detail", tripId: "synthetic-stay-handoff", stopId: "tokyo-return", workspaceView: "stay" },
  },
} satisfies Meta<typeof TripStayHandoff>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const DatesToConfirm: Story = {args:{details:"Hotel: Example hotel\nLocation: Tokyo, Japan\nDates to confirm"}};
export const Mobile390: Story = {globals:{viewport:{value:"morrovia390",isRotated:false}}};

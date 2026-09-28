import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTFeedback } from "./easyt-feedback";

const meta = {
  title: "Morrovia/05 Product Patterns/Contextual feedback",
  component: EasyTFeedback,
  parameters: { layout: "centered" },
  args: { ownerId: "storybook-traveller", onDismiss: () => {}, onSubmitted: () => {} },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ width: "min(100vw - 32px, 520px)", padding: 16 }}>
    <section aria-label="Trip planning context">
      <h2>Day by day</h2>
      <p>Your saved day plan and travel details stay above this contextual invitation.</p>
      <Story />
    </section>
  </main>],
} satisfies Meta<typeof EasyTFeedback>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Invitation: Story = { args: { storyState: "invitation" } };
export const OpenedForm: Story = { args: { storyState: "open" } };
export const SubmissionFailure: Story = { args: { storyState: "failure" } };
export const Submitted: Story = { args: { storyState: "submitted" } };
export const InvitationMobile390: Story = { ...Invitation, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const OpenedFormMobile390: Story = { ...OpenedForm, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const OpenedFormMobile430: Story = { ...OpenedForm, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const OpenedFormTablet768: Story = { ...OpenedForm, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const OpenedFormDesktop1440: Story = { ...OpenedForm, globals: { viewport: { value: "morrovia1440", isRotated: false } } };

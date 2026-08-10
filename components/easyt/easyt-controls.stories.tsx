import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import {
  EasyTButton,
  EasyTField,
  EasyTLinkButton,
  EasyTSelect,
  EasyTSegmentedControl,
} from "./easyt-controls";

const meta = {
  title: "EasyT/Controls",
  component: EasyTButton,
  args: { children: "Button" },
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof EasyTButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <EasyTButton icon={ArrowRight}>Primary action</EasyTButton>
      <EasyTButton variant="secondary">Secondary</EasyTButton>
      <EasyTButton variant="quiet">Quiet</EasyTButton>
      <EasyTButton variant="danger">Delete</EasyTButton>
      <EasyTButton loading>Saving</EasyTButton>
      <EasyTButton disabled>Disabled</EasyTButton>
      <EasyTButton icon={Plus} iconOnly aria-label="Add trip">Add trip</EasyTButton>
      <EasyTLinkButton href="#" variant="primary" size="large">New trip</EasyTLinkButton>
    </div>
  ),
};

export const Fields: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 520 }}>
      <EasyTField label="Trip name" placeholder="Japan in spring" />
      <EasyTField label="Email" value="traveller@example.com" disabled readOnly />
      <EasyTField label="Destination" defaultValue="Atlantis" error="Choose a real mapped place." />
      <EasyTSelect label="Language" defaultValue="en" hint="Used across your EasyT account.">
        <option value="en">English</option>
        <option value="es">Español</option>
      </EasyTSelect>
    </div>
  ),
};

export const Segmented: Story = {
  render: function SegmentedStory() {
    const [value, setValue] = useState<"active" | "archived">("active");
    return (
      <EasyTSegmentedControl
        ariaLabel="Trip status"
        value={value}
        onChange={setValue}
        options={[
          { label: "Active", value: "active", count: 3 },
          { label: "Archived", value: "archived", count: 1 },
        ]}
      />
    );
  },
};

export const NarrowScreen: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      <EasyTButton fullWidth>Continue</EasyTButton>
      <EasyTField label="A very long field label" placeholder="Controls stay usable on narrow screens" />
    </div>
  ),
};

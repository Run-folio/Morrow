import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { EasyTButton, EasyTField, EasyTSelect, EasyTTextArea } from "./easyt-controls";
import { MorroviaDatePicker } from "./morrovia-date-picker";
import { MorroviaQuantitySelector } from "./morrovia-quantity-selector";

const meta = {
  title: "Morrovia/02 Controls/Date, quantity and forms",
  parameters: { layout: "padded" },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: 24 }}><Story /></main>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const storyGrid = { display: "grid", gap: 22, width: "min(760px, 100%)" } as const;
const labelledRow = { display: "grid", gap: 10 } as const;

export const DatePickerSingle: Story = {
  render: function SingleDateStory() {
    const [value, setValue] = useState("2026-09-24");
    return <div style={{ ...storyGrid, maxWidth: 390 }}><MorroviaDatePicker mode="single" label="Fixed date" value={value} onChange={setValue} defaultOpen /></div>;
  },
};

export const DatePickerRangeSelected: Story = {
  render: function RangeDateStory() {
    const [range, setRange] = useState({ start: "2026-09-03", end: "2026-09-24" });
    return <div style={storyGrid}><MorroviaDatePicker mode="range" startLabel="Start date" endLabel="End date" startValue={range.start} endValue={range.end} onChange={setRange} defaultOpen /></div>;
  },
};

export const DatePickerDisabledDates: Story = {
  render: function DisabledDateStory() {
    const [value, setValue] = useState("2026-09-12");
    return <div style={{ ...storyGrid, maxWidth: 390 }}><MorroviaDatePicker mode="single" label="Booking date" value={value} min="2026-09-10" max="2026-09-26" onChange={setValue} defaultOpen /></div>;
  },
};

export const DatePickerKeyboardFocus: Story = {
  render: function KeyboardDateStory() {
    const [value, setValue] = useState("2026-09-18");
    return <div style={{ ...storyGrid, maxWidth: 390 }}><MorroviaDatePicker mode="single" label="Trip date" value={value} onChange={setValue} defaultOpen /></div>;
  },
};

export const DatePickerCompact: Story = {
  render: function CompactDateStory() {
    const [value, setValue] = useState("2026-09-24");
    return <div style={{ ...storyGrid, maxWidth: 260 }}><MorroviaDatePicker mode="single" size="compact" label="Fixed date" value={value} onChange={setValue} /></div>;
  },
};

export const DatePickerMobile390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  render: function MobileDateStory() {
    const [range, setRange] = useState({ start: "2026-09-03", end: "2026-09-24" });
    return <MorroviaDatePicker mode="range" startLabel="Start date" endLabel="End date" startValue={range.start} endValue={range.end} onChange={setRange} defaultOpen />;
  },
};

export const TravellerStates: Story = {
  render: function TravellerStory() {
    const [travellers, setTravellers] = useState(2);
    return <div style={storyGrid}>
      <div style={labelledRow}><MorroviaQuantitySelector label="Travellers" value={1} min={1} max={12} onChange={() => {}} /></div>
      <div style={labelledRow}><MorroviaQuantitySelector label="Travellers" value={travellers} min={1} max={12} onChange={setTravellers} /></div>
      <div style={labelledRow}><MorroviaQuantitySelector label="Maximum reached" value={12} min={1} max={12} onChange={() => {}} /></div>
      <div style={{ maxWidth: 260 }}><MorroviaQuantitySelector compact label="Compact traveller control" value={2} min={1} max={12} onChange={() => {}} /></div>
    </div>;
  },
};

export const TravellerMobile390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  render: function MobileTravellerStory() {
    const [travellers, setTravellers] = useState(2);
    return <MorroviaQuantitySelector compact label="Travellers" value={travellers} min={1} max={12} onChange={setTravellers} />;
  },
};

export const InputAndSelectStates: Story = {
  render: () => <div style={{ ...storyGrid, maxWidth: 520 }}>
    <EasyTField label="Destination" placeholder="Where would you like to go?" />
    <EasyTField label="Starting point" defaultValue="London" autoFocus />
    <EasyTField label="Destination" defaultValue="Atlantis" error="Choose a real mapped place." />
    <EasyTField label="Email" value="traveller@example.com" disabled readOnly />
    <EasyTTextArea label="Notes" optional placeholder="Anything else we should consider?" />
    <EasyTSelect label="Travel style" defaultValue="balanced">
      <option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="full">Full days</option>
    </EasyTSelect>
    <EasyTSelect label="Open state" defaultValue="balanced" hint="The native menu opens on click while the Morrovia field treatment remains consistent.">
      <option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="full">Full days</option>
    </EasyTSelect>
    <EasyTSelect label="Disabled select" defaultValue="balanced" disabled><option value="balanced">Balanced</option></EasyTSelect>
  </div>,
};

export const ButtonStates: Story = {
  render: () => <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
    <EasyTButton icon={ArrowRight}>Primary</EasyTButton>
    <EasyTButton variant="secondary">Secondary</EasyTButton>
    <EasyTButton variant="quiet">Quiet</EasyTButton>
    <EasyTButton variant="danger">Destructive</EasyTButton>
    <EasyTButton icon={Plus} iconOnly>Add trip</EasyTButton>
    <EasyTButton size="small">Compact</EasyTButton>
    <EasyTButton autoFocus>Keyboard focus</EasyTButton>
    <EasyTButton disabled>Disabled</EasyTButton>
    <EasyTButton loading>Pending</EasyTButton>
  </div>,
};

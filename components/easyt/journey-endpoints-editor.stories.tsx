import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import type { CanonicalPlaceSuggestion } from "@/lib/easyt/place-intelligence";
import type { JourneyEndSelection } from "@/lib/easyt/trip";
import { JourneyEndpointsEditor } from "./journey-endpoints-editor";

function JourneyEndpointsStory({
  initialStart = "London, United Kingdom",
  initialEnd = "",
  initialMode = "unknown",
  surface = "builder",
}: {
  initialStart?: string;
  initialEnd?: string;
  initialMode?: JourneyEndSelection["mode"];
  surface?: "homepage" | "builder";
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [selection, setSelection] = useState<JourneyEndSelection>(initialMode === "same_as_start"
    ? { mode: "same_as_start" }
    : initialMode === "explicit"
      ? { mode: "explicit", place: { name: initialEnd } }
      : { mode: "unknown" });

  const selectStart = (place: CanonicalPlaceSuggestion) => setStart(place.label);
  const selectEnd = (place: CanonicalPlaceSuggestion) => {
    setEnd(place.label);
    setSelection({
      mode: "explicit",
      place: {
        name: place.name,
        country: place.country,
        canonicalPlaceId: place.canonicalPlaceId,
        coordinates: place.coordinates,
      },
    });
  };

  return <JourneyEndpointsEditor
    showHeading={surface === "builder"}
    showHint={surface === "builder"}
    hint="Start and end guide the route. They are not added as stops."
    startValue={start}
    endValue={end}
    endSelection={selection}
    onStartChange={setStart}
    onStartSelect={selectStart}
    onEndChange={(value) => {
      setEnd(value);
      setSelection(value.trim() ? { mode: "explicit", place: { name: value } } : { mode: "unknown" });
    }}
    onEndSelect={selectEnd}
    onEndModeChange={(mode) => setSelection({ mode })}
  />;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Journey endpoints",
  component: JourneyEndpointsStory,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "48px 24px" }}><div style={{ maxWidth: 760, margin: "0 auto" }}><Story /></div></main>],
  args: {
    initialStart: "London, United Kingdom",
    initialEnd: "Seoul, South Korea",
    initialMode: "explicit",
  },
} satisfies Meta<typeof JourneyEndpointsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuilderBothExplicit: Story = {};
export const HomepageUnknownEnd: Story = { args: { initialEnd: "", initialMode: "unknown", surface: "homepage" } };
export const HomepageSameAsStart: Story = { args: { initialEnd: "", initialMode: "same_as_start", surface: "homepage" } };
export const HomepageOpenJaw: Story = { args: { initialStart: "Tokyo, Japan", initialEnd: "Seoul, South Korea", initialMode: "explicit", surface: "homepage" } };
export const EndpointFocus: Story = {
  args: { initialEnd: "", initialMode: "unknown", surface: "homepage" },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLInputElement>('input[aria-label="Ending at"]')?.focus();
  },
};
export const LongPlaceNames: Story = {
  args: {
    initialStart: "San Pedro La Laguna, Sololá, Guatemala",
    initialEnd: "Santiago de los Caballeros, Dominican Republic",
    initialMode: "explicit",
  },
};
export const BuilderAt390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

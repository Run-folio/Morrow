import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import EasyTTripCopilot from "./easyt-trip-copilot";

type FixtureMode = "answer" | "proposal" | "failure";

function LunaFixture({ mode }: { mode: FixtureMode }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(value, window.location.origin);
      if (!url.pathname.includes("/copilot")) return originalFetch(input, init);
      if (url.pathname.endsWith("/apply")) {
        return new Response(JSON.stringify({ trip: { id: "storybook-trip" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (mode === "failure") return new Response(JSON.stringify({ error: "private provider detail" }), { status: 502, headers: { "Content-Type": "application/json" } });
      if (mode === "answer") return new Response(JSON.stringify({ answer: "The route is workable, but verify the current rail timetable before booking.", scope: "trip", proposedChange: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      const action = { action: "set_trip_preference", preference: "pace", value: "relaxed" };
      const preview = {
        previewId: "11111111-1111-4111-8111-111111111111",
        canApply: true,
        expiresAt: "2026-08-30T22:00:00.000Z",
        action,
        summary: "Use a more relaxed pace",
        changes: [{ label: "Pace", before: "Balanced", after: "Relaxed" }],
        impacts: {
          dates: { before: "10–20 Sep", after: "10–20 Sep", changed: false },
          route: { changedStopCount: 0, changedStops: [] },
          transfers: { changed: false, warningCount: 0 },
          itinerary: { changedDayCount: 0 },
          health: { before: "good", after: "good", openIssuesBefore: 0, openIssuesAfter: 0 },
          readiness: { before: 2, after: 2, readyBefore: false, readyAfter: false },
        },
        warnings: [],
      };
      return new Response(JSON.stringify({
        answer: "Luna has prepared a slower pace for you to review.",
        scope: "trip",
        proposedChange: { type: "preference", summary: preview.summary },
        mutationPreview: { action, summary: preview.summary, canApply: true, preview, alternatives: [], warnings: [] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    return () => { window.fetch = originalFetch; };
  }, [mode]);

  return <EasyTTripCopilot
    surface="map"
    scope="whole-trip"
    contextLabel="Paris · Bern · Milan"
    destination="Paris"
    dayCount={12}
    tripId="storybook-trip"
    open
    suggestedPrompts={["Does this route feel rushed?", "Suggest a calmer pace"]}
  />;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Luna AI assistant",
  component: EasyTTripCopilot,
  parameters: { layout: "padded", nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip/map" } } },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ maxWidth: 620, margin: "0 auto" }}><Story /></main>],
  args: { surface: "map" },
} satisfies Meta<typeof EasyTTripCopilot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NormalAnswer: Story = { render: () => <LunaFixture mode="answer" /> };
export const ProposedChange: Story = { render: () => <LunaFixture mode="proposal" /> };
export const ProviderFailure: Story = { render: () => <LunaFixture mode="failure" /> };
export const Mobile390: Story = { ...NormalAnswer, globals: { viewport: { value: "morrovia390", isRotated: false } } };

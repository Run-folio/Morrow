"use client";

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import DiscoveryMap, { type DiscoveryMapSelection } from "./discovery-map";

const routes = [
  {
    key: "portugal-story", title: "Portugal coast", countries: ["Portugal"],
    stops: [
      { id: "lisbon", name: "Lisbon", country: "Portugal", coordinates: [-9.1393, 38.7223], reason: "Arrival" },
      { id: "comporta", name: "Comporta", country: "Portugal", coordinates: [-8.7863, 38.3806], reason: "Coast" },
    ],
  },
  {
    key: "japan-story", title: "Japan cities", countries: ["Japan"],
    stops: [
      { id: "tokyo-first", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895], reason: "Arrival" },
      { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116], reason: "Culture" },
      { id: "tokyo-return", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895], reason: "Departure" },
    ],
  },
] as DiscoveryRoute[];

function SelectionRoundTrip() {
  const [selection, setSelection] = useState<DiscoveryMapSelection>({ kind: "route", routeKey: routes[0]!.key });
  const routeKey = selection.kind === "collection" ? routes[0]!.key : selection.routeKey;
  const route = routes.find((candidate) => candidate.key === routeKey) ?? routes[0]!;
  return <div style={{ height: 560 }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8 }}>
      <EasyTButton size="small" variant="secondary" onClick={() => setSelection({ kind: "route", routeKey: routes[0]!.key })}>Portugal route</EasyTButton>
      <EasyTButton size="small" variant="secondary" onClick={() => setSelection({ kind: "stop", routeKey: routes[0]!.key, stopId: "comporta" })}>Comporta stop</EasyTButton>
      <EasyTButton size="small" variant="secondary" onClick={() => setSelection({ kind: "route", routeKey: routes[1]!.key })}>Japan route</EasyTButton>
      <EasyTButton size="small" variant="secondary" onClick={() => setSelection({ kind: "stop", routeKey: routes[1]!.key, stopId: "tokyo-first" })}>First Tokyo</EasyTButton>
      <EasyTButton size="small" variant="secondary" onClick={() => setSelection({ kind: "stop", routeKey: routes[1]!.key, stopId: "tokyo-return" })}>Return Tokyo</EasyTButton>
    </div>
    <output aria-label="Selected map entity">{selection.kind === "collection" ? "All routes" : selection.kind === "route" ? `Route ${selection.routeKey}` : `Stop ${selection.stopId}`}</output>
    <div style={{ height: 500 }}><DiscoveryMap routes={routes} route={route} selection={selection} surface={{ variant: "workspace" }} onSelection={setSelection} /></div>
  </div>;
}

const meta = { title: "Morrovia/05 Product Patterns/Discover map", component: SelectionRoundTrip } satisfies Meta<typeof SelectionRoundTrip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SelectionRoundTripStory: Story = {};

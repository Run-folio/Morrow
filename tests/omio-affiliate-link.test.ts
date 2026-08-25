import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Omio links retain external-link protections, disclosure and accessible labels", () => {
  const itinerary = readFileSync("components/easyt/trip-itinerary-workspace.tsx", "utf8");
  const prep = readFileSync("components/easyt/trip-prep-workspace.tsx", "utf8");
  const styles = readFileSync("components/easyt/trip-itinerary-workspace.module.css", "utf8");
  assert.match(itinerary, /target="_blank" rel="sponsored noopener noreferrer"/);
  assert.match(itinerary, /opens Omio in a new tab/);
  assert.match(itinerary, /Partner link · Morrovia may earn a commission at no extra cost to you/);
  assert.match(prep, /target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  assert.match(styles, /\.omioAction a \{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.omioAction a:focus-visible/);
});

test("Omio analytics include only the approved partner, placement and trip-safe identifiers", () => {
  const itinerary = readFileSync("components/easyt/trip-itinerary-workspace.tsx", "utf8");
  const overview = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  const prep = readFileSync("components/easyt/trip-prep-workspace.tsx", "utf8");
  assert.match(itinerary, /partner: "omio", placement: "itinerary_transfer", tripId: trip\.id, transferId: leg\.id, originStopId: leg\.fromStopId, destinationStopId: leg\.toStopId/);
  assert.match(overview, /partner: "omio", placement: "overview_next_action", tripId: trip\.id/);
  assert.match(prep, /partner: "omio",\s+placement: "booking_readiness_transport",\s+tripId,/);
});

test("the existing Impact script remains a single root-layout instance", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.equal((layout.match(/id="omio-impact-tracking"/g) ?? []).length, 1);
});

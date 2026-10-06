import assert from "node:assert/strict";
import test from "node:test";

import { formatRoadEstimateReference } from "../lib/easyt/road-estimate-presentation.ts";
import type { RoadEstimateReference } from "../lib/easyt/trip.ts";

const estimate: RoadEstimateReference = {
  provider: "openrouteservice",
  profile: "driving-car",
  provenance: "routed",
  checkedAt: "2026-10-05T12:00:00.000Z",
  distanceKm: 245,
  durationMinutes: 270,
  confidence: "medium",
  routeGeometry: [[0, 0], [1, 1]],
  attribution: "Deterministic fixture",
  warnings: ["Road estimate only; no passenger service or private-driver availability is confirmed."],
};

test("road reference summary labels distance and duration as driving estimates", () => {
  assert.equal(formatRoadEstimateReference(estimate), "Road estimate only · 245 km · about 4h 30m driving");
  assert.equal(formatRoadEstimateReference(estimate, "es"), "Estimación por carretera · 245 km · aprox. 4 h 30 min");
});

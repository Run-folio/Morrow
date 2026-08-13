import assert from "node:assert/strict";
import test from "node:test";

import { reviewTripQuality } from "../lib/easyt/trip-quality.ts";

test("flags a requested landmark that has not reached the plan", () => {
  const checks = reviewTripQuality({
    origin: "London",
    originCoordinates: [-0.1276, 51.5072],
    startDate: "2026-09-01",
    endDate: "2026-09-14",
    stops: [{ name: "Lima", country: "Peru" }, { name: "Bogotá", country: "Colombia" }],
    mentions: [
      { sourceText: "London", canonicalName: "London", role: "origin", status: "resolved" },
      { sourceText: "Cusco", canonicalName: "Cusco", role: "stop", status: "resolved" },
      { sourceText: "Machu Picchu", canonicalName: "Machu Picchu", role: "stop", status: "resolved", intent: "landmark" },
      { sourceText: "Lima", canonicalName: "Lima", role: "stop", status: "resolved" },
      { sourceText: "Bogotá", canonicalName: "Bogotá", role: "stop", status: "resolved" },
    ],
  });
  const places = checks.find((check) => check.id === "requested-places");
  assert.equal(places?.state, "needs-attention");
  assert.deepEqual(places?.missingPlaces, ["Cusco", "Machu Picchu"]);
});

test("passes when every requested place is in the plan", () => {
  const checks = reviewTripQuality({
    origin: "London",
    originCoordinates: [-0.1276, 51.5072],
    startDate: "2026-09-01",
    endDate: "2026-09-14",
    stops: [{ name: "Cusco", country: "Peru" }, { name: "Machu Picchu", country: "Peru" }, { name: "Lima", country: "Peru" }],
    mentions: [
      { sourceText: "Cusco", canonicalName: "Cusco", role: "stop", status: "resolved" },
      { sourceText: "Machu Picchu", canonicalName: "Machu Picchu", role: "stop", status: "resolved", intent: "landmark" },
      { sourceText: "Lima", canonicalName: "Lima", role: "stop", status: "resolved" },
    ],
    travellerReady: true,
  });
  assert.equal(checks.every((check) => check.state === "complete"), true);
});

test("does not block a saved plan just because the capture lookup was unavailable", () => {
  const checks = reviewTripQuality({
    origin: "London",
    originCoordinates: [-0.1276, 51.5072],
    startDate: "2026-09-01",
    endDate: "2026-09-14",
    stops: [{ name: "Hoi An", country: "Vietnam" }],
    mentions: [{ sourceText: "Hoi An", canonicalName: "Hoi An", role: "stop", status: "unresolved" }],
  });
  assert.equal(checks.find((check) => check.id === "requested-places")?.state, "complete");
});

import assert from "node:assert/strict";
import test from "node:test";

import { normalizedLegEndpoints } from "../lib/easyt/trip-persistence.ts";
import type { TripLeg } from "../lib/easyt/trip.ts";

const baseLeg = {
  id: "trip-leg-1",
  fromStopId: "trip-origin",
  toStopId: "cancun",
  mode: "flight",
  distanceKm: 7_900,
  durationMinutes: 780,
  provider: null,
  routeMetadata: {},
} satisfies TripLeg;

test("canonical origin endpoints do not enter overnight-stop foreign keys", () => {
  assert.deepEqual(normalizedLegEndpoints("trip", {
    ...baseLeg,
    fromEndpoint: { kind: "origin", id: "trip-origin", name: "London", coordinates: [-0.1276, 51.5072] },
    toEndpoint: { kind: "stop", id: "cancun", name: "Cancún", country: "Mexico", coordinates: [-86.8515, 21.1619] },
  }), {
    fromEndpointId: "trip-origin",
    toEndpointId: "cancun",
    fromEndpointKind: "origin",
    toEndpointKind: "stop",
    fromStopId: null,
    toStopId: "cancun",
  });
});

test("legacy stop-to-stop legs retain normalized stop foreign keys", () => {
  assert.deepEqual(normalizedLegEndpoints("trip", {
    ...baseLeg,
    fromStopId: "cancun",
    toStopId: "tulum",
  }), {
    fromEndpointId: "cancun",
    toEndpointId: "tulum",
    fromEndpointKind: "stop",
    toEndpointKind: "stop",
    fromStopId: "cancun",
    toStopId: "tulum",
  });
});

test("canonical journey-end endpoints persist without an overnight-stop foreign key", () => {
  assert.deepEqual(normalizedLegEndpoints("trip", {
    ...baseLeg,
    id: "trip-return-leg",
    fromStopId: "cancun",
    toStopId: "trip-end",
    fromEndpoint: { kind: "stop", id: "cancun", name: "Cancún", country: "Mexico", coordinates: [-86.8515, 21.1619] },
    toEndpoint: { kind: "end", id: "trip-end", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
  }), {
    fromEndpointId: "cancun",
    toEndpointId: "trip-end",
    fromEndpointKind: "stop",
    toEndpointKind: "end",
    fromStopId: "cancun",
    toStopId: null,
  });
});

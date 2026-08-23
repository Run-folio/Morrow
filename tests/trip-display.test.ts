import assert from "node:assert/strict";
import test from "node:test";

import { tripDisplayTitle } from "../lib/easyt/trip-display.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

type DisplayTrip = Pick<EasyTTrip, "title" | "stops"> & { brief: Pick<EasyTTrip["brief"], "origin"> };

function displayTrip(origin: string, names: string[], title: string): DisplayTrip {
  return {
    title,
    brief: { origin },
    stops: names.map((name, order) => ({ id: `stop-${order}`, order, name } as EasyTTrip["stops"][number])),
  };
}

test("formats deterministic builder titles without repeating the origin", () => {
  assert.equal(
    tripDisplayTitle(displayTrip("Cusco", ["Cusco", "Sacred Valley", "Arequipa"], "Cusco to Cusco & Sacred Valley & Arequipa")),
    "Cusco, Sacred Valley & Arequipa",
  );
  assert.equal(
    tripDisplayTitle(displayTrip("Bangkok", ["Siem Reap", "Phnom Penh", "Ho Chi Minh City"], "Bangkok to Siem Reap & Phnom Penh & Ho Chi Minh City")),
    "Bangkok, Siem Reap, Phnom Penh & Ho Chi Minh City",
  );
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris"], "London to Paris")), "London & Paris");
});

test("preserves a traveller-authored title", () => {
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris"], "Anniversary by rail")), "Anniversary by rail");
});

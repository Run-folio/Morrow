import assert from "node:assert/strict";
import test from "node:test";

import { renameTripIdentity, tripDisplayTitle } from "../lib/easyt/trip-display.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

type DisplayTrip = Pick<EasyTTrip, "title" | "stops"> & { brief: Pick<EasyTTrip["brief"], "origin" | "customTitle"> };

function displayTrip(origin: string, names: string[], title: string, countries: string[] = names, customTitle?: string | null): DisplayTrip {
  return {
    title,
    brief: { origin, ...(customTitle === undefined ? {} : { customTitle }) },
    stops: names.map((name, order) => ({ id: `stop-${order}`, order, name, country: countries[order] ?? "" } as EasyTTrip["stops"][number])),
  };
}

test("formats deterministic builder titles from resolved geographic identity rather than the route", () => {
  assert.equal(
    tripDisplayTitle(displayTrip("Cusco", ["Cusco", "Sacred Valley", "Arequipa"], "Cusco to Cusco & Sacred Valley & Arequipa", ["Peru", "Peru", "Peru"])),
    "Peru",
  );
  assert.equal(
    tripDisplayTitle(displayTrip("Bangkok", ["Siem Reap", "Phnom Penh", "Ho Chi Minh City"], "Bangkok to Siem Reap & Phnom Penh & Ho Chi Minh City", ["Cambodia", "Cambodia", "Vietnam"])),
    "Cambodia & Vietnam",
  );
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris"], "London to Paris", ["France"])), "France");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris", "Bruges", "Amsterdam", "Cologne"], "legacy", ["France", "Belgium", "Netherlands", "Germany"], null)), "France, Belgium + 2 more");
});

test("preserves a traveller-authored title", () => {
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris"], "Anniversary by rail")), "Anniversary by rail");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris"], "old", ["France"], "春の記念旅行 — París")), "春の記念旅行 — París");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris"], "old", ["France"], null)), "France");
});

test("renaming changes only identity fields and clearing restores the geographic title", () => {
  const display = displayTrip("London", ["Paris", "Bruges"], "London to Paris & Bruges", ["France", "Belgium"]);
  const source = {
    ...display,
    schemaVersion: 1,
    id: "identity-trip",
    ownerId: null,
    status: "draft",
    startDate: "2027-04-01",
    endDate: "2027-04-08",
    travellers: 2,
    currency: "GBP",
    legs: [],
    planItems: [],
    recommendations: [],
    brief: { ...display.brief, mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
  } as EasyTTrip;
  const renamed = renameTripIdentity(source, "  Spring   together  ");
  assert.equal(renamed.brief.customTitle, "Spring together");
  assert.equal(tripDisplayTitle(renamed), "Spring together");
  assert.deepEqual(renamed.stops, source.stops);
  assert.equal(renamed.startDate, source.startDate);
  assert.equal(renamed.endDate, source.endDate);
  assert.equal(renamed.updatedAt, source.updatedAt, "the canonical revision remains the CAS token sent to the repository");
  const cleared = renameTripIdentity(renamed, "  ");
  assert.equal(cleared.brief.customTitle, null);
  assert.equal(tripDisplayTitle(cleared), "France & Belgium");
});

test("generated identity covers country depth, route endpoints, repeats, fallback and Unicode deterministically", () => {
  assert.equal(tripDisplayTitle(displayTrip("London", ["Tokyo"], "London to Tokyo", ["Japan"])), "Japan", "pure origin excluded");
  assert.equal(tripDisplayTitle(displayTrip("London", ["London", "Paris"], "London to London & Paris", ["United Kingdom", "France"])), "United Kingdom & France", "a genuine origin stay is included");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Paris", "Bruges"], "London to Paris & Bruges", ["France", "Belgium"])), "France & Belgium", "endpoint-only return is absent from the stop model");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Tokyo", "Kyoto", "Osaka"], "London to Tokyo & Kyoto & Osaka", ["Japan", "Japan", "Japan"])), "Japan", "country repeats deduplicate");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Tokyo", "Tokyo"], "London to Tokyo & Tokyo", ["", ""])), "Tokyo", "unresolved repeated city deduplicates");
  assert.equal(tripDisplayTitle(displayTrip("London", ["東京", "Kyoto"], "London to 東京 & Kyoto", ["", ""])), "東京 & Kyoto", "unresolved Unicode falls back to destinations");
  assert.equal(tripDisplayTitle(displayTrip("London", ["A", "B", "C"], "London to A & B & C", ["The United Kingdom of Example Islands", "The Federated Republic of Example Mountains", "The Commonwealth of Example Coast"])), "The United Kingdom of Example Islands, The Federated Republic of Example Mountains & The Commonwealth of Example Coast");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Tokyo", "Shanghai", "Hanoi"], "London to Tokyo & Shanghai & Hanoi", ["Japan", "China", "Vietnam"])), "Japan, China & Vietnam");
  assert.equal(tripDisplayTitle(displayTrip("London", ["Tokyo", "Shanghai", "Hanoi", "Bangkok"], "London to Tokyo & Shanghai & Hanoi & Bangkok", ["Japan", "China", "Vietnam", "Thailand"])), "Japan, China + 2 more");
});

test("route edits update automatic identity but never replace a custom override", () => {
  const automatic = displayTrip("London", ["Tokyo"], "London to Tokyo", ["Japan"], null);
  const edited = { ...automatic, stops: [...automatic.stops, { ...automatic.stops[0]!, id: "shanghai", order: 1, name: "Shanghai", country: "China" }] };
  assert.equal(tripDisplayTitle(edited), "Japan & China");
  const custom = { ...edited, title: "Our spring trip", brief: { ...edited.brief, customTitle: "Our spring trip" } };
  const customRouteEdit = { ...custom, stops: [...custom.stops, { ...custom.stops[0]!, id: "hanoi", order: 2, name: "Hanoi", country: "Vietnam" }] };
  assert.equal(tripDisplayTitle(customRouteEdit), "Our spring trip");
  assert.equal(tripDisplayTitle({ ...customRouteEdit, brief: { ...customRouteEdit.brief, customTitle: null } }), "Japan, China & Vietnam");
});

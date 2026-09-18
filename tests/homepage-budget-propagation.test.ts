import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { projectHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { buildTripCopilotOpenAIRequest, buildTripCopilotProjection } from "../lib/easyt/trip-copilot.ts";
import { tripDocumentsCanonicalEquivalent } from "../lib/easyt/storage.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { defaultTravelProfile } from "../lib/easyt/travel-profile.ts";
import { emptyHomepageInput, selectedEntry } from "./fixtures/homepage-dual-entry.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

function canonicalTrip(choice: "value" | "mid" | "high" | "cleared" | "capture" | "profile" | "fallback") {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("tokyo", "Tokyo")];
  if (choice === "value" || choice === "mid" || choice === "high") snapshot.budget = { state: "selected", value: choice };
  if (choice === "cleared") snapshot.budget = { state: "cleared" };
  if (choice === "capture") {
    snapshot.mode = "describe";
    snapshot.entries = [];
    snapshot.prompt = "A good value trip to Tokyo";
  }
  const capture = choice === "capture" ? captureJourneyBrief(snapshot.prompt) : undefined;
  const profile = choice === "profile" ? { ...defaultTravelProfile, budget: "high" as const } : null;
  const result = projectHomepageInput({ snapshot, capture, profile, handoffId: `budget-${choice}` });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected valid homepage projection");
  const trip = tripFromBuilder({
    id: `trip-${choice}`,
    origin: result.draft.origin ?? "London",
    stops: result.draft.destinations ?? [{ id: "tokyo", name: "Tokyo", country: "Japan" }],
    startDate: result.draft.startDate ?? "2026-10-01",
    endDate: result.draft.endDate ?? "2026-10-07",
    picks: {},
    mustDo: result.draft.brief ?? "",
    pace: "slow",
    hotels: "few",
    budget: result.draft.budget ?? "mid",
    budgetPreference: result.draft.budgetPreference,
    draft: [],
    structuredBrief: result.draft.structuredBrief,
  });
  return { draft: result.draft, trip: JSON.parse(JSON.stringify(trip)) as typeof trip };
}

test("selected homepage bands survive projection, canonical serialization and copilot context", () => {
  for (const band of ["value", "mid", "high"] as const) {
    const { draft, trip } = canonicalTrip(band);
    assert.deepEqual(draft.budgetPreference, { source: "explicit", value: band });
    assert.deepEqual(trip.brief.budgetPreference, { source: "explicit", value: band });
    assert.equal(buildTripCopilotProjection(trip).trip.preferences.budget, band);
    const request = buildTripCopilotOpenAIRequest(buildTripCopilotProjection(trip), "Help me plan");
    assert.match(request.input[0]!.content, new RegExp(`"budget":"${band}"`));
  }
});

test("capture, profile and fallback provenance remain distinct", () => {
  assert.deepEqual(canonicalTrip("capture").trip.brief.budgetPreference, { source: "capture", value: "value" });
  assert.deepEqual(canonicalTrip("profile").trip.brief.budgetPreference, { source: "profile", value: "high" });
  const fallback = canonicalTrip("fallback");
  assert.deepEqual(fallback.trip.brief.budgetPreference, { source: "fallback", value: "mid" });
  assert.equal(buildTripCopilotProjection(fallback.trip).trip.preferences.budget, null);
});

test("an explicit clear suppresses structured evidence and the outgoing copilot budget", () => {
  const { draft, trip } = canonicalTrip("cleared");
  assert.deepEqual(draft.budgetPreference, { source: "cleared" });
  assert.deepEqual(trip.brief.budgetPreference, { source: "cleared" });
  assert.equal(trip.brief.structuredBrief?.budget, undefined);
  assert.equal(trip.brief.structuredBrief?.softPreferences.some((preference) => preference.type === "budget"), false);
  const projection = buildTripCopilotProjection(trip);
  assert.equal(projection.trip.preferences.budget, null);
  const request = buildTripCopilotOpenAIRequest(projection, "Help me plan");
  assert.match(request.input[0]!.content, /"budget":null/);
});

test("recovery comparison treats budget provenance as traveller-authored state", () => {
  const cleared = tripCopilotFixture();
  cleared.brief.budgetPreference = { source: "cleared" };
  const fallback = structuredClone(cleared);
  fallback.brief.budgetPreference = { source: "fallback", value: "mid" };
  assert.equal(tripDocumentsCanonicalEquivalent(cleared, structuredClone(cleared)), true);
  assert.equal(tripDocumentsCanonicalEquivalent(cleared, fallback), false);
});

test("builder hydration and the unified details commit retain budget provenance", () => {
  const source = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.match(source, /setBudgetPreference\(saved\.brief\.budgetPreference\)/);
  assert.match(source, /setBudgetPreference\(homeDraft\.budgetPreference\)/);
  assert.match(source, /budgetPreference,/);
  assert.match(source, /budgetPreference: \{ source: "explicit", value: detailsDraft\.budget \}/);
});

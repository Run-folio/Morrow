import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { homepageReceiptForProjection, homepageSemanticInputFingerprint, homepageVisibleDateRange, projectHomepageInput, readHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { formatLocalDateRange } from "../lib/easyt/local-date.ts";
import { formatIsoDate } from "../lib/easyt/trip-lifecycle.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { emptyHomepageInput, selectedEntry } from "./fixtures/homepage-dual-entry.ts";

test("untouched dates do not display an implicit UTC range that Builder cannot receive", () => {
  const newTrip = readFileSync("app/journey/new/new-trip-starter.tsx", "utf8");
  const homepage = readFileSync("app/journey/home/home-trip-starter.tsx", "utf8");
  for (const source of [newTrip, homepage]) {
    assert.match(source, /homepageVisibleDateRange\(snapshot\)/);
    assert.doesNotMatch(source, /setStartDate\(|setEndDate\(/);
  }
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("tokyo", "Tokyo")];
  assert.deepEqual(homepageVisibleDateRange(snapshot), { start: "", end: "" });
  snapshot.dates = { state: "selected", value: { start: "2026-09-30", end: "2026-10-06" } };
  assert.deepEqual(homepageVisibleDateRange(snapshot), snapshot.dates.value);
  snapshot.dates = { state: "cleared" };
  assert.deepEqual(homepageVisibleDateRange(snapshot), { start: "", end: "" });
  const projected = projectHomepageInput({ snapshot, profile: null, handoffId: "untouched" });
  assert.equal(projected.ok, true);
  if (projected.ok) {
    assert.equal(projected.draft.startDate, undefined);
    assert.equal(projected.draft.endDate, undefined);
  }
});

test("explicit Stops and Describe dates retain calendar meaning through receipt, projection, JSON and Builder", () => {
  for (const mode of ["stops", "describe"] as const) {
    const snapshot = emptyHomepageInput();
    snapshot.mode = mode;
    snapshot.entries = [selectedEntry("tokyo", "Tokyo")];
    snapshot.prompt = "One week in Tokyo";
    snapshot.dates = { state: "selected", value: { start: "2026-09-30", end: "2026-10-06" } };
    snapshot.travellers = { state: "selected", value: 2 };
    const projected = projectHomepageInput({ snapshot, profile: null, handoffId: `dates-${mode}` });
    assert.equal(projected.ok, true);
    if (!projected.ok) continue;
    assert.equal(projected.draft.startDate, "2026-09-30");
    assert.equal(projected.draft.endDate, "2026-10-06");
    const receipt = homepageReceiptForProjection(snapshot, projected.draft, `trip-dates-${mode}`);
    assert.equal(receipt.semanticInputFingerprint, homepageSemanticInputFingerprint(snapshot));
    const recovered = readHomepageInput(JSON.parse(JSON.stringify({ snapshot, receipt })), snapshot.ownerId);
    assert.deepEqual(recovered?.snapshot.dates, snapshot.dates);
    const trip = tripFromBuilder({
      id: receipt.tripId, origin: "Tokyo", stops: [], startDate: projected.draft.startDate!, endDate: projected.draft.endDate!,
      picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid", draft: [],
    });
    const reloaded = JSON.parse(JSON.stringify(trip)) as typeof trip;
    assert.deepEqual([reloaded.startDate, reloaded.endDate], ["2026-09-30", "2026-10-06"]);
    for (const language of ["en", "es"] as const) {
      const planner = formatLocalDateRange(snapshot.dates.value.start, snapshot.dates.value.end, language);
      const builder = formatLocalDateRange(reloaded.startDate, reloaded.endDate, language);
      assert.equal(builder, planner);
      assert.match(formatIsoDate(reloaded.startDate, language, { day: "numeric", month: "short", year: "numeric" }) ?? "", /30/);
    }
  }
});

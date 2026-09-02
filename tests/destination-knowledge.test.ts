import assert from "node:assert/strict";
import test from "node:test";
import {
  createDestinationKnowledgeStore,
  destinationKnowledge,
  knownKnowledgeFact,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import { estimateLeg } from "../lib/easyt/planner.ts";

const providerSource: KnowledgeSource = {
  id: "provider:test-fixture",
  label: "Test verified destination provider",
  kind: "provider",
  supports: "A verified ideal-stay override used only in this test.",
  reviewedAt: "2026-08-23",
};

test("resolves curated knowledge without changing the caller's destination identity", () => {
  const stop = { id: "seed-tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] as [number, number] };
  const destination = destinationKnowledge.findDestination(stop);

  assert.equal(destination?.canonicalId, "tokyo");
  assert.equal(stop.id, "seed-tokyo");
  assert.deepEqual(destination?.coordinates.status === "known" ? destination.coordinates.value : null, stop.coordinates);
  assert.equal(destination?.coordinates.confidence, "static");
  assert.equal(destination?.countryCode.confidence, "unknown");
  assert.match(destination?.countryCode.status === "unknown" ? destination.countryCode.reason : "", /not been curated/i);
  assert.equal(destinationKnowledge.canonicalId({ id: "trip-123-stop-tokyo", name: "Tokyo", country: "Japan" }), "tokyo");
});

test("keeps unsupported destination facts explicitly unknown", () => {
  const guidance = destinationKnowledge.forNightAllocation({ id: "unseeded", name: "Unseeded", country: "Nowhere" });
  const scoring = destinationKnowledge.forRouteScoring({ id: "unseeded", name: "Unseeded", country: "Nowhere" });

  assert.equal(guidance.canonicalId, null);
  assert.equal(guidance.minimumNights.status, "unknown");
  assert.equal(guidance.idealNights.value, null);
  assert.equal(scoring.connectivity.confidence, "unknown");
});

test("transport-only destination evidence does not become stay-depth evidence", () => {
  for (const place of [
    { id: "lima", name: "Lima", country: "Peru" },
    { id: "huacachina", name: "Huacachina", country: "Peru" },
    { id: "la-paz", name: "La Paz", country: "Bolivia" },
  ]) {
    const stay = destinationKnowledge.forNightAllocation(place);
    const transfer = destinationKnowledge.forTransferResolution(place);
    assert.equal(stay.minimumNights.status, "unknown");
    assert.equal(stay.idealNights.status, "unknown");
    assert.equal(stay.roles.status, "unknown");
    assert.equal(transfer.connectivity.status, "known");
  }
});

test("exposes anchor roles and separate minimum and ideal night guidance", () => {
  const siemReap = destinationKnowledge.forNightAllocation({ id: "siem-reap", name: "Siem Reap", country: "Cambodia" });

  assert.equal(siemReap.roles.status, "known");
  assert.ok(siemReap.roles.status === "known" && siemReap.roles.value.includes("anchor"));
  assert.equal(siemReap.minimumNights.status === "known" ? siemReap.minimumNights.value : null, 3);
  assert.equal(siemReap.minimumNights.confidence, "static");
  assert.equal(siemReap.idealNights.status === "known" ? siemReap.idealNights.value : null, 4);
  assert.equal(siemReap.idealNights.confidence, "estimated");
});

test("returns traceable transfer knowledge without inventing a timetable range", () => {
  const transfer = destinationKnowledge.findTransfer(
    { id: "rome", name: "Rome", country: "Italy" },
    { id: "florence", name: "Florence", country: "Italy" },
  );

  assert.equal(transfer?.mode.status === "known" ? transfer.mode.value : null, "train");
  assert.equal(transfer?.planningMinutes.status === "known" ? transfer.planningMinutes.value : null, 120);
  assert.equal(transfer?.planningMinutes.confidence, "estimated");
  assert.equal(transfer?.planningMinutes.sources[0]?.id, "planner:legacy-connection-allowances-v1");
  assert.equal(transfer?.durationBasis.status === "known" ? transfer.durationBasis.value : null, "door-to-door");
  assert.equal(transfer?.realisticRangeMinutes.status, "unknown");
  assert.equal(transfer?.borderFriction.status, "unknown");
});

test("keeps the existing planner transfer behaviour behind the new boundary", () => {
  const leg = estimateLeg(
    { id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    { id: "florence", name: "Florence", country: "Italy", coordinates: [11.2558, 43.7696] },
  );

  assert.equal(leg.mode, "train");
  assert.equal(leg.durationMinutes, 120);
  assert.equal(leg.confidence, "high");
  assert.match(leg.note, /verify the live timetable/i);

  const legacyMisspelling = estimateLeg(
    { id: "kanazawa", name: "Kanazawa", country: "Japan", coordinates: [136.6562, 36.5613] },
    { id: "tokayama", name: "Tokayama", country: "Japan", coordinates: [137.2523, 36.146] },
  );
  assert.equal(legacyMisspelling.durationMinutes, 150);
});

test("supports destination-level curation overrides with verified provenance", () => {
  const overridden = createDestinationKnowledgeStore({
    destinationOverrides: [{
      canonicalId: "tokyo",
      idealNights: knownKnowledgeFact(5, "verified", providerSource),
    }],
  });

  const curated = overridden.forNightAllocation({ id: "tokyo", name: "Tokyo", country: "Japan" });
  const unchangedDefault = destinationKnowledge.forNightAllocation({ id: "tokyo", name: "Tokyo", country: "Japan" });
  assert.equal(curated.idealNights.status === "known" ? curated.idealNights.value : null, 5);
  assert.equal(curated.idealNights.confidence, "verified");
  assert.equal(curated.idealNights.sources[0]?.id, providerSource.id);
  assert.equal(unchangedDefault.idealNights.status === "known" ? unchangedDefault.idealNights.value : null, 4);
});

test("provides route-scoring facts and common onward links through typed helpers", () => {
  const scoring = destinationKnowledge.forRouteScoring({ id: "tokyo", name: "Tokyo", country: "Japan" });
  const onward = destinationKnowledge.commonOnwardLinks({ id: "tokyo", name: "Tokyo", country: "Japan" });

  assert.ok(scoring.roles.status === "known" && scoring.roles.value.includes("anchor"));
  assert.ok(scoring.experienceTags.status === "known" && scoring.experienceTags.value.includes("rail"));
  assert.equal(onward.status, "known");
  assert.ok(onward.status === "known" && onward.value.some((link) => link.destinationId === "kanazawa"));
});

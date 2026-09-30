import assert from "node:assert/strict";
import test from "node:test";
import { accommodationProgress, savedGoogleStayReferencesForStop } from "../lib/easyt/accommodation.ts";
import { removeItineraryIdea, saveGooglePlaceReference, scheduleGooglePlaceReference, validIdeaDays } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, googlePlaceReferenceIdeas, type EasyTTrip } from "../lib/easyt/trip.ts";
import { projectPersistedMapResults } from "../lib/easyt/map-result-selection.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import { canonicalTripForOwner, duplicateTripDocument } from "../lib/easyt/trip-promotion.ts";
import { reconcileAuthoredDayState } from "../lib/easyt/trip-authored-day-state.ts";

function trip(): EasyTTrip {
  return {
    schemaVersion: 1, id: "google-reference-trip", ownerId: null, title: "Japan", status: "draft",
    startDate: "2026-10-01", endDate: "2026-10-04", travellers: 2, currency: "GBP",
    brief: { origin: "Tokyo", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: defaultTripIntent({ stopIds: ["tokyo-first", "kyoto", "tokyo-second"], durationDays: 4 }) },
    stops: [
      { id: "tokyo-first", order: 0, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.76, nights: 1, arrivalDate: null, departureDate: null },
      { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", latitude: 35.01, longitude: 135.77, nights: 1, arrivalDate: null, departureDate: null },
      { id: "tokyo-second", order: 2, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.76, nights: 2, arrivalDate: null, departureDate: null },
    ], legs: [],
    planItems: ["tokyo-first", "kyoto", "tokyo-second", "tokyo-second"].map((stopId, index) => ({ id: `day-${index + 1}`, stopId, dayNumber: index + 1, date: `2026-10-0${index + 1}`, type: "activity" as const, title: "Explore", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
    recommendations: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

const input = { stopId: "tokyo-second", placeId: "ChIJ-place-123", category: "activity" as const, userNote: "Visit the garden" };

test("Save stores a reference only and Add keeps the exact stop occurrence/day without provider facts", () => {
  const original = trip();
  const saved = saveGooglePlaceReference(original, input);
  assert.equal(original.brief.itineraryIdeas, undefined, "inspection must not mutate the source document");
  assert.equal(saved.brief.itineraryIdeas?.length, 1);
  const choice = saved.brief.itineraryIdeas![0]!;
  assert.equal(choice.stopId, "tokyo-second");
  assert.equal(choice.dayId, undefined);
  assert.deepEqual(validIdeaDays(saved, "tokyo-second").map((day) => day.id), ["day-3", "day-4"]);
  const added = scheduleGooglePlaceReference(saved, choice.id, "day-4", "afternoon");
  assert.equal(added.brief.itineraryIdeas?.[0]?.dayId, "day-4");
  assert.equal(added.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");
  assert.deepEqual(added.planItems, original.planItems, "Google provider names must never become authored day notes");
  assert.deepEqual(added.brief.mapPins, undefined);
  assert.deepEqual(projectPersistedMapResults(added).results, [], "MapLibre must not receive Google facts or provider positions");
  assert.equal(scheduleGooglePlaceReference(added, choice.id, "day-4", "afternoon"), added);
  assert.equal(saveGooglePlaceReference(added, input), added);
  const persisted = JSON.stringify(added.brief.itineraryIdeas);
  for (const forbidden of ["name", "title", "coordinates", "address", "rating", "hours", "reviews", "photos", "photoUrl", "description", "sourceUrl"]) {
    assert.equal(new RegExp(`\"${forbidden}\"`).test(persisted), false, `${forbidden} leaked into persistent Google choice`);
  }
  assert.deepEqual(JSON.parse(persisted), added.brief.itineraryIdeas);
  assert.equal(removeItineraryIdea(added, choice.id).brief.itineraryIdeas?.length, 0);
});

test("existing recovery owner round-trips only the reference and canonical binding", () => {
  const values = new Map<string, string>();
  const storage: EasyTBrowserStorage = {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
  };
  const base = trip();
  const saved = saveGooglePlaceReference(base, input);
  const choice = saved.brief.itineraryIdeas![0]!;
  const added = scheduleGooglePlaceReference(saved, choice.id, "day-4");
  assert.equal(saveTripRecoveryToStorage(storage, added, { writeId: "google-reference-1" }).stored, true);
  const reopened = loadTripRecoveryFromStorage(storage, added.id, added.ownerId)?.trip;
  assert.deepEqual(reopened?.brief.itineraryIdeas, added.brief.itineraryIdeas);
  assert.equal(reopened?.brief.mapPins, undefined);
  assert.deepEqual(reopened?.planItems, base.planItems);
});

test("wrong stop day cannot be selected and repeated Tokyo occurrences remain distinct", () => {
  const first = saveGooglePlaceReference(trip(), { ...input, stopId: "tokyo-first" });
  const second = saveGooglePlaceReference(first, input);
  assert.equal(second.brief.itineraryIdeas?.length, 2);
  const firstChoice = second.brief.itineraryIdeas![0]!;
  const secondChoice = second.brief.itineraryIdeas![1]!;
  assert.notEqual(firstChoice.id, secondChoice.id);
  assert.equal(scheduleGooglePlaceReference(second, secondChoice.id, "day-1"), second);
  assert.equal(scheduleGooglePlaceReference(second, secondChoice.id, "day-3").brief.itineraryIdeas?.find((item) => item.id === secondChoice.id)?.dayId, "day-3");
});

test("Google stay is an unbooked reference and cannot complete accommodation", () => {
  const base = trip();
  const saved = saveGooglePlaceReference(base, { stopId: "tokyo-first", placeId: "ChIJ-hotel", category: "stay" });
  assert.equal(saved.brief.itineraryIdeas?.[0]?.category, "stay");
  assert.equal(savedGoogleStayReferencesForStop(saved, "tokyo-first").length, 1);
  assert.equal(savedGoogleStayReferencesForStop(saved, "tokyo-second").length, 0);
  assert.equal(accommodationProgress(saved).sortedCount, 0);
  assert.equal(saved.brief.bookings, undefined);
  assert.equal(saved.brief.mapPins, undefined);
});

test("owner promotion, duplication and day reconciliation preserve reference binding without provider facts", () => {
  const base = trip();
  const saved = saveGooglePlaceReference(base, input);
  const scheduled = scheduleGooglePlaceReference(saved, saved.brief.itineraryIdeas![0]!.id, "day-4", "afternoon");
  const promoted = canonicalTripForOwner("account-owner", scheduled);
  const promotedReference = googlePlaceReferenceIdeas(promoted.brief.itineraryIdeas)[0]!;
  assert.equal(promotedReference.stopId, `${base.id}-stop-tokyo-second`);
  assert.equal(promotedReference.dayId, "day-4");
  assert.deepEqual(promotedReference.providerReference, googlePlaceReferenceIdeas(scheduled.brief.itineraryIdeas)[0]!.providerReference);

  let sequence = 0;
  const duplicated = duplicateTripDocument(scheduled, { id: "copied-trip", now: "2026-10-01T00:00:00Z", nextId: () => String(++sequence) });
  const duplicateReference = googlePlaceReferenceIdeas(duplicated.brief.itineraryIdeas)[0]!;
  assert.equal(duplicateReference.stopId, duplicated.planItems.find((day) => day.id === duplicateReference.dayId)?.stopId);
  assert.notEqual(duplicateReference.dayId, "day-4");
  assert.deepEqual(duplicateReference.providerReference, googlePlaceReferenceIdeas(scheduled.brief.itineraryIdeas)[0]!.providerReference);

  const reconciled = reconcileAuthoredDayState(scheduled, { ...scheduled, planItems: scheduled.planItems.filter((day) => day.id !== "day-4") });
  const reconciledReference = googlePlaceReferenceIdeas(reconciled.brief.itineraryIdeas)[0]!;
  assert.equal(reconciledReference.stopId, "tokyo-second");
  assert.notEqual(reconciledReference.dayId, "day-4");
  assert.deepEqual(reconciledReference.providerReference, googlePlaceReferenceIdeas(scheduled.brief.itineraryIdeas)[0]!.providerReference);
});

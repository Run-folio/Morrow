import assert from "node:assert/strict";
import test from "node:test";

import { overviewStopImage } from "../lib/easyt/trip-overview-imagery.ts";
import { routeDestinationPhoto } from "../lib/easyt/route-images.ts";
import type { EasyTTrip, TripStop } from "../lib/easyt/trip.ts";

function tripFor(stop: TripStop, image: string | null = null): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-images",
    ownerId: null,
    title: "Image test",
    status: "draft",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Home",
      mustDo: "",
      pace: "slow",
      hotelChanges: "some",
      budgetBand: "mid",
      selectedPlaces: {},
    },
    stops: [stop],
    legs: [],
    planItems: [{
      id: "day-1",
      stopId: stop.id,
      dayNumber: 1,
      date: "2026-10-01",
      type: "open",
      title: `Explore ${stop.name}`,
      reason: "",
      notes: [],
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: stop.latitude,
      longitude: stop.longitude,
      image,
      sourceUrl: image ? "https://example.test/source" : null,
    }],
    recommendations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const delhi: TripStop = {
  id: "stop-delhi",
  name: "Delhi",
  country: "India",
  order: 0,
  latitude: 28.6139,
  longitude: 77.209,
  arrivalDate: "2026-10-01",
  departureDate: "2026-10-03",
  nights: 2,
};

test("Overview uses persisted imagery before the reviewed destination inventory", () => {
  const persisted = "https://images.example.test/persisted.jpg";
  assert.deepEqual(overviewStopImage(tripFor(delhi, persisted), delhi), {
    src: persisted,
    alt: "Explore Delhi",
    sourceUrl: "https://example.test/source",
    sourceLabel: "Photo source",
    licenseUrl: undefined,
    fullCreditUrl: undefined,
  });
});

test("Overview server projection uses reviewed destination imagery without route position", () => {
  const image = overviewStopImage(tripFor(delhi), delhi);
  const reviewed = routeDestinationPhoto(delhi.name, delhi.country);
  assert.equal(image?.src, reviewed?.variants.at(-1)?.src);
  assert.equal(image?.alt, reviewed?.alt);
  assert.equal(image?.sourceUrl, reviewed?.sourceUrl);
  assert.equal(image?.licenseUrl, reviewed?.licenseUrl);
  assert.match(image?.sourceLabel ?? "", new RegExp(reviewed?.author ?? "missing-author"));
});

test("representative reviewed stops render immediately while an uncovered stop stays neutral", () => {
  const marrakech = { ...delhi, id: "stop-marrakech", name: "Marrakech", country: "Morocco" };
  const uncovered = { ...delhi, id: "stop-uncovered", name: "Example Uncovered Base", country: "Example Country" };

  assert.ok(overviewStopImage(tripFor(delhi), delhi)?.src);
  assert.ok(overviewStopImage(tripFor(marrakech), marrakech)?.src);
  assert.equal(overviewStopImage(tripFor(uncovered), uncovered), null);
});

test("canonical aliases still resolve the reviewed image and its provenance", () => {
  const alias = { ...delhi, id: "stop-marrakesh", name: "Marrakesh", country: "Morocco", canonicalPlaceId: "marrakech" };
  const image = overviewStopImage(tripFor(alias), alias);
  const reviewed = routeDestinationPhoto("Marrakech", "Morocco");

  assert.equal(image?.src, reviewed?.variants.at(-1)?.src);
  assert.equal(image?.sourceUrl, reviewed?.sourceUrl);
  assert.equal(image?.licenseUrl, reviewed?.licenseUrl);
});

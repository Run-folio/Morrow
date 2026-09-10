import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseEditoriallyReviewedCandidate,
  choosePublishedRouteImageCandidate,
  reviewedPhotoMatchesStop,
  scorePublishedRouteImageCandidate,
  type PublishedRouteImageCandidate,
  type PublishedRouteImageStop,
} from "../lib/easyt/published-route-image-pipeline.ts";

const split: PublishedRouteImageStop = {
  key: "split|croatia",
  name: "Split",
  country: "Croatia",
  region: "europe",
  coordinates: [16.4402, 43.5081],
  routeKeys: ["balkans-overland"],
  siblingNames: ["Split", "Dubrovnik", "Kotor"],
  attachedLandmarks: [],
};

function candidate(overrides: Partial<PublishedRouteImageCandidate> = {}): PublishedRouteImageCandidate {
  return {
    provider: "unsplash",
    id: "split-1",
    src: "https://images.unsplash.com/photo-split",
    width: 1600,
    height: 1000,
    alt: "Split waterfront in Croatia",
    description: "Historic Split on the Adriatic coast",
    sourceUrl: "https://unsplash.com/photos/split-1",
    author: "Example Photographer",
    authorUrl: "https://unsplash.com/@example",
    downloadLocation: "https://api.unsplash.com/photos/split-1/download",
    license: "Unsplash License",
    licenseUrl: "https://unsplash.com/license",
    location: { city: "Split", country: "Croatia", name: "Split, Croatia" },
    tags: ["travel", "city"],
    ...overrides,
  };
}

test("exact canonical place and country metadata passes the conservative threshold", () => {
  const score = scorePublishedRouteImageCandidate(split, candidate());
  assert.equal(score.accepted, true);
  assert.ok(score.score >= 80);
  assert.deepEqual(score.concerns, []);
});

test("nearby provider coordinates can confirm geography when country text is absent", () => {
  const score = scorePublishedRouteImageCandidate(split, candidate({
    alt: "Split waterfront",
    description: "Historic Split",
    location: undefined,
    coordinates: [16.45, 43.51],
  }));
  assert.equal(score.accepted, true);
  assert.ok(score.evidence.some((item) => item.includes("coordinates within")));
  assert.equal(scorePublishedRouteImageCandidate(split, candidate({ alt: "Split waterfront", description: "Historic Split", coordinates: [18.09, 42.65], location: undefined })).accepted, false);
});

test("country conflicts, non-photographic results and neighbouring cities fail closed", () => {
  assert.equal(scorePublishedRouteImageCandidate(split, candidate({ location: { city: "Split", country: "Slovenia" } })).accepted, false);
  assert.equal(scorePublishedRouteImageCandidate(split, candidate({ alt: "Map of Split Croatia", description: null })).accepted, false);
  const wrong = candidate({ id: "dubrovnik", alt: "Dubrovnik Croatia", description: "Dubrovnik old town", location: { city: "Dubrovnik", country: "Croatia" } });
  const result = scorePublishedRouteImageCandidate(split, wrong);
  assert.equal(result.accepted, false);
  assert.ok(result.concerns.some((item) => item.includes("Dubrovnik")));
});

test("incidental subjects and non-image media fail even when their geography is correct", () => {
  for (const [id, alt] of [
    ["File:Blue-gray_tanager.jpg", "Blue-gray tanager in Split, Croatia"],
    ["File:A_Dog_in_Split.jpg", "A dog in Split, Croatia"],
    ["File:Great_Curassow_female.jpg", "Great curassow female in Split, Croatia"],
    ["File:Tulum_swimming.jpg", "A woman in a bikini in Split, Croatia"],
    ["File:Travel_in_Split.webm", "Travel in Split, Croatia"],
    ["File:Split_watercolor.jpg", "Watercolor artwork of Split, Croatia"],
  ]) assert.equal(scorePublishedRouteImageCandidate(split, candidate({ id, alt, description: alt })).accepted, false, id);
});

test("explicit false-geography regressions cannot qualify as their neighbouring stop", () => {
  for (const [name, country, wrongName, wrongCountry] of [
    ["Lima", "Peru", "Cusco", "Peru"],
    ["Puno", "Peru", "Cusco", "Peru"],
    ["La Paz", "Bolivia", "Uyuni", "Bolivia"],
    ["Windhoek", "Namibia", "Sossusvlei", "Namibia"],
    ["Busan", "South Korea", "Kyoto", "Japan"],
  ]) {
    const stop = { ...split, key: `${name}|${country}`, name, country, siblingNames: [name, wrongName] };
    const wrong = candidate({ alt: `${wrongName}, ${wrongCountry}`, description: null, location: { city: wrongName, country: wrongCountry, name: `${wrongName}, ${wrongCountry}` } });
    assert.equal(scorePublishedRouteImageCandidate(stop, wrong).accepted, false, `${name} must not use ${wrongName}`);
  }
});

test("reviewed attached landmarks and same-place qualified names remain valid", () => {
  assert.equal(reviewedPhotoMatchesStop({ name: "Puno", country: "Peru", attachedLandmarks: ["Lake Titicaca"] }, { place: "Lake Titicaca", country: "Peru" }), true);
  assert.equal(reviewedPhotoMatchesStop({ name: "Etosha", country: "Namibia", attachedLandmarks: [] }, { place: "Etosha National Park", country: "Namibia" }), true);
  assert.equal(reviewedPhotoMatchesStop({ name: "Split", country: "Croatia", attachedLandmarks: [] }, { place: "Dubrovnik", country: "Croatia" }), false);
});

test("no-repeat selection skips an otherwise accepted source and takes a distinct candidate", () => {
  const first = candidate();
  const second = candidate({ id: "split-2", sourceUrl: "https://unsplash.com/photos/split-2" });
  const result = choosePublishedRouteImageCandidate(split, [first, second], new Set([first.sourceUrl]));
  assert.equal(result.selected?.candidate.id, "split-2");
});

test("an exact editorial decision wins over automated score without bypassing hard safety", () => {
  const lowerScoringReviewed = candidate({
    id: "reviewed",
    alt: "Split waterfront",
    description: "Historic Split",
    location: undefined,
  });
  const automatic = candidate({ id: "automatic", sourceUrl: "https://unsplash.com/photos/automatic" });
  const ranked = choosePublishedRouteImageCandidate(split, [automatic, lowerScoringReviewed]).ranked;

  assert.equal(chooseEditoriallyReviewedCandidate(ranked, "reviewed")?.candidate.id, "reviewed");
  assert.equal(chooseEditoriallyReviewedCandidate(ranked, "reviewed", new Set([lowerScoringReviewed.sourceUrl])), null);

  const unsafe = candidate({
    id: "unsafe",
    alt: "Dubrovnik, Croatia",
    description: "Dubrovnik old town",
    location: { city: "Dubrovnik", country: "Croatia" },
  });
  const unsafeRanked = choosePublishedRouteImageCandidate(split, [unsafe]).ranked;
  assert.equal(chooseEditoriallyReviewedCandidate(unsafeRanked, "unsafe"), null);
});

test("provider-native South Korea metadata is canonicalized before safety scoring", () => {
  const busan: PublishedRouteImageStop = { ...split, key: "busan|south korea", name: "Busan", country: "South Korea", coordinates: [129.0756, 35.1796], siblingNames: ["Seoul", "Busan"] };
  const score = scorePublishedRouteImageCandidate(busan, candidate({
    id: "busan",
    alt: "Busan coast",
    description: "Busan city and sea",
    location: { city: "Busan", country: "대한민국", name: "Busan, 대한민국" },
  }));
  assert.equal(score.accepted, true);
  assert.ok(score.evidence.includes("provider country metadata match"));
});

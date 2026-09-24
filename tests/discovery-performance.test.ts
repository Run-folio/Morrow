import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Builder's initial module graph keeps MapLibre behind a dynamic boundary", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const steps = read("components/easyt/discovery-steps.tsx");
  assert.doesNotMatch(builder, /from ["']@\/components\/easyt\/discovery-map/);
  assert.match(steps, /import\("\.\/discovery-map"\)/);
  assert.doesNotMatch(steps, /from ["']\.\/discovery-map["']/);
});

test("Discovery imagery is lazy and modal marks first useful card timing", () => {
  assert.match(read("components/easyt/discovery-steps.tsx"), /loading="lazy" decoding="async"/);
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /performance\.mark\(/);
  assert.match(modal, /performance\.measure\(/);
  assert.match(modal, /modalRef\.current\?\.querySelector/);
  assert.doesNotMatch(modal, /document\.querySelector\('\[data-discovery-step\]/);
  assert.match(read("components/easyt/discovery-modal.stories.tsx"), /ScopedTimingIgnoresOutsideCard/);
  assert.match(read("components/easyt/discovery-modal.stories.tsx"), /MeasuredFirstCard/);
});

test("projection identity ignores shortlist and unrelated Builder changes", async () => {
  const { discoveryProjectionKey } = await import("../lib/easyt/discovery-projection-key.ts");
  const draft = { directionId: null, removedIds: [] };
  const input = { mention: { mentionId: "m", placeType: "country", canonicalPlaceId: "a" }, draft,
    durationDays: 14, interests: ["coast"], existingPlaceIds: [] };
  assert.equal(discoveryProjectionKey(input), discoveryProjectionKey({ ...input, draft: { ...draft, shortlistIds: ["a"] } }));
  assert.notEqual(discoveryProjectionKey(input), discoveryProjectionKey({ ...input, draft: { ...draft, directionId: "east" } }));
  assert.notEqual(discoveryProjectionKey(input), discoveryProjectionKey({ ...input, interests: ["culture"] }));
  assert.match(read("app/journey/new/trip-builder.tsx"), /useMemo\(\(\) =>[\s\S]*?projectDiscovery\(/);
});

test("map collection identity survives shortlist remove and re-add but changes with direction", async () => {
  const { discoveryMapPlacesKey } = await import("../lib/easyt/discovery-projection-key.ts");
  const { projectDiscovery } = await import("../lib/easyt/discovery-projection.ts");
  const { createDiscoveryDraft, reduceDiscoveryDraft } = await import("../lib/easyt/discovery-draft.ts");
  const { resolvePlaceMentions } = await import("../lib/easyt/place-intelligence.ts");
  const mention = resolvePlaceMentions("Australia").mentions[0]!;
  const initial = createDiscoveryDraft();
  const removed = reduceDiscoveryDraft(initial, { type: "remove-shortlist", placeId: "sydney" });
  const readded = reduceDiscoveryDraft(removed, { type: "add-shortlist", placeId: "sydney" });
  const project = (draft: typeof initial) => projectDiscovery({ mention, draft, context: { interests: [], existingPlaceIds: [] } });
  assert.equal(discoveryMapPlacesKey(project(initial).places), discoveryMapPlacesKey(project(removed).places));
  assert.equal(discoveryMapPlacesKey(project(initial).places), discoveryMapPlacesKey(project(readded).places));
  const direction = project(initial).directions[0]!;
  const directed = project(reduceDiscoveryDraft(initial, { type: "change-direction", directionId: direction.id }));
  assert.notEqual(discoveryMapPlacesKey(project(initial).places), discoveryMapPlacesKey(directed.places.filter(place => direction.placeIds.includes(place.id))));
  assert.match(read("components/easyt/discovery-steps.tsx"), /places=\{mapPlaces\}/);
  assert.match(read("components/easyt/discovery-modal.stories.tsx"), /MobileMapPreservesCanvasAfterShortlist/);
});

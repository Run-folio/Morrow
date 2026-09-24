import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDiscoveryDraft, reduceDiscoveryDraft } from "../lib/easyt/discovery-draft.ts";
import { discoveryChoiceEvent, discoveryConfirmedEvent, discoveryDismissedEvent } from "../lib/easyt/discovery-funnel.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const entryKind = "country" as const;

test("choice events reflect accepted draft changes and the resulting count", () => {
  const initial = createDiscoveryDraft();
  const add = { type: "add-shortlist", placeId: "a" } as const;
  const selected = reduceDiscoveryDraft(initial, add);
  assert.deepEqual(discoveryChoiceEvent(entryKind, initial, selected, add), {
    name: "discovery_place_choice_changed", properties: { entry_kind: "country", action: "add", shortlist_count: 1 },
  });
  assert.equal(discoveryChoiceEvent(entryKind, selected, reduceDiscoveryDraft(selected, add), add), null);
  const missingRemoval = { type: "remove-shortlist", placeId: "missing" } as const;
  assert.equal(discoveryChoiceEvent(entryKind, selected, reduceDiscoveryDraft(selected, missingRemoval), missingRemoval), null);
  const remove = { type: "remove-shortlist", placeId: "a" } as const;
  assert.equal(discoveryChoiceEvent(entryKind, selected, reduceDiscoveryDraft(selected, remove), remove)?.properties.shortlist_count, 0);
});

test("direction and base events suppress no-op repeat choices", () => {
  const initial = createDiscoveryDraft();
  const direction = { type: "change-direction", directionId: "east" } as const;
  const directed = reduceDiscoveryDraft(initial, direction);
  assert.equal(discoveryChoiceEvent(entryKind, initial, directed, direction)?.name, "discovery_direction_selected");
  assert.equal(discoveryChoiceEvent(entryKind, directed, reduceDiscoveryDraft(directed, direction), direction), null);
  const base = { type: "choose-base", intentId: "m", baseId: "a" } as const;
  const based = reduceDiscoveryDraft(initial, base);
  assert.equal(discoveryChoiceEvent(entryKind, initial, based, base)?.properties.action, "choose_base");
  assert.equal(discoveryChoiceEvent(entryKind, based, reduceDiscoveryDraft(based, base), base), null);
});

test("completion and dismissal events require accepted boundaries", () => {
  assert.equal(discoveryConfirmedEvent(false, entryKind, 2), null);
  assert.deepEqual(discoveryConfirmedEvent(true, entryKind, 2), { entry_kind: "country", shortlist_count: 2 });
  assert.equal(discoveryDismissedEvent(false, entryKind, "closed", 1), null);
  assert.deepEqual(discoveryDismissedEvent(true, entryKind, "finish_later", 1), {
    entry_kind: "country", action: "finish_later", shortlist_count: 1,
  });
});

test("Builder owns success, refused dismissal, and canonical-search event boundaries", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.doesNotMatch(modal, /trackEvent\("discovery_confirmed"|trackEvent\("discovery_dismissed"/);
  assert.match(builder, /if \(!result\.ok\)[\s\S]*?return;[\s\S]*?trackEvent\("discovery_confirmed"/);
  assert.match(builder, /if \(!recovery\.stored\) \{[\s\S]*?return;[\s\S]*?trackEvent\("discovery_dismissed"/);
  assert.match(builder, /selectCanonicalSearchResult\([\s\S]*?discoveryChoiceEvent\(/);
  assert.match(read("lib/analytics.ts"), /if \(!hasAnalyticsConsent\(\)\) return;/);
});

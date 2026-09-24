import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { createDiscoveryDraft } from "../lib/easyt/discovery-draft.ts";
import { projectDiscovery } from "../lib/easyt/discovery-projection.ts";
import { commitDiscoverySelections, discoveryConfirmationChoiceForId } from "../lib/easyt/discovery-confirmation.ts";

const australia = resolvePlaceMentions("Australia").mentions[0]!;
const projection = projectDiscovery({ mention: australia, draft: createDiscoveryDraft(), context: { interests: [], existingPlaceIds: [] } });

test("partial confirmation keeps every unaccounted choice unresolved", async () => {
  const called: string[] = [];
  const result = await commitDiscoverySelections(["airlie-beach", "open-world:provider-only"], projection, async suggestion => {
    called.push(suggestion.canonicalPlaceId);
    return true;
  });
  assert.deepEqual(called, ["airlie-beach"]);
  assert.deepEqual(result.committed.map(choice => choice.id), ["airlie-beach"]);
  assert.deepEqual(result.unresolved.map(choice => choice.id), ["open-world:provider-only"]);
  assert.equal(result.allConfirmed, false);
});

test("a failed Builder mutation stays unresolved for retry", async () => {
  const ids = ["sydney", "melbourne"];
  const result = await commitDiscoverySelections(ids, projection,
    async suggestion => suggestion.canonicalPlaceId === "sydney");
  assert.deepEqual(result.committed.map(choice => choice.id), ["sydney"]);
  assert.deepEqual(result.unresolved.map(choice => choice.id), ["melbourne"]);
  assert.equal(result.allConfirmed, false);
  assert.deepEqual(ids, ["sydney", "melbourne"]);
  const retry = await commitDiscoverySelections(ids, projection, async () => true);
  assert.equal(retry.allConfirmed, true);
});

test("provider-only search results cannot masquerade as durable canonical choices", () => {
  assert.deepEqual(discoveryConfirmationChoiceForId("open-world:provider-only", projection), {
    id: "open-world:provider-only", name: "open-world:provider-only", reason: "missing-canonical-identity",
  });
});

test("a complete canonical shortlist can finish the parent decision", async () => {
  const result = await commitDiscoverySelections(["sydney", "melbourne"], projection, async () => true);
  assert.equal(result.allConfirmed, true);
  assert.deepEqual(result.unresolved, []);
});

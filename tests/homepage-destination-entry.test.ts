import assert from "node:assert/strict";
import test from "node:test";
import { moveHomepageEntry } from "../lib/easyt/home-trip-handoff.ts";
import { selectedEntry } from "./fixtures/homepage-dual-entry.ts";

test("moves the requested occurrence without mutating repeated-place entries", () => {
  const entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];

  assert.deepEqual(moveHomepageEntry(entries, "c", -1).map((entry) => entry.id), ["a", "c", "b"]);
  assert.deepEqual(entries.map((entry) => entry.id), ["a", "b", "c"]);
});

test("returns a copied unchanged order for a missing occurrence", () => {
  const entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto")];
  const result = moveHomepageEntry(entries, "missing", -1);

  assert.deepEqual(result, entries);
  assert.notEqual(result, entries);
});

test("returns a copied unchanged order for invalid boundary movement", () => {
  const entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto")];

  assert.deepEqual(moveHomepageEntry(entries, "a", -1).map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(moveHomepageEntry(entries, "b", 1).map((entry) => entry.id), ["a", "b"]);
});

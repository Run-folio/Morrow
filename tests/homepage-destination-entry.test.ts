import assert from "node:assert/strict";
import test from "node:test";
import { moveHomepageEntry } from "../lib/easyt/home-trip-handoff.ts";
import { selectedEntry } from "./fixtures/homepage-dual-entry.ts";
import * as handoff from "../lib/easyt/home-trip-handoff.ts";

test("add reuses the first blank entry and allocates only when necessary", () => {
  assert.equal(typeof handoff.homepageDestinationAddTarget, "function");
  let allocations = 0;
  const create = () => { allocations++; return { id: "fresh", text: "", selection: null }; };
  const entries = [selectedEntry("a", "Tokyo"), { id: "blank", text: " ", selection: null }, { id: "unresolved", text: "Mostar", selection: null }];
  const reused = handoff.homepageDestinationAddTarget(entries, create);
  assert.equal(reused.focusEntryId, "blank");
  assert.equal(allocations, 0);
  assert.deepEqual(reused.entries, entries);
  const added = handoff.homepageDestinationAddTarget([entries[0], entries[2]], create);
  assert.equal(added.focusEntryId, "fresh");
  assert.equal(allocations, 1);
  assert.deepEqual(added.entries.map(entry => entry.id), ["a", "unresolved", "fresh"]);
  assert.equal(entries.length, 3);
});

test("remove targets one repeated occurrence and permits no destinations", () => {
  assert.equal(typeof handoff.removeHomepageDestination, "function");
  const entries = [selectedEntry("first", "Tokyo"), selectedEntry("last", "Tokyo")];
  assert.deepEqual(handoff.removeHomepageDestination(entries, "first"), [entries[1]]);
  assert.deepEqual(handoff.removeHomepageDestination([entries[0]], "first"), []);
  assert.deepEqual(entries.map(entry => entry.id), ["first", "last"]);
});

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

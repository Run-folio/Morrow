import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createPendingIntakeReceipt, persistHomepageIntakeForImport, readHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { homepageInputStorageKey } from "../lib/easyt/private-browser-context.ts";
import { selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";

const starter = () => readFileSync(new URL("../app/journey/new/new-trip-starter.tsx", import.meta.url), "utf8");
const importer = () => readFileSync(new URL("../app/journey/new/import/spreadsheet-import-client.tsx", import.meta.url), "utf8");

test("import handoff preserves all controlled input and explicit clears on the existing owner key", async () => {
  const snapshot = {
    ...selectedStopsHomepageInput("owner-a", [["tokyo-first", "Tokyo"], ["kyoto", "Kyoto"], ["tokyo-last", "Tokyo"]]),
    mode: "describe" as const, prompt: "Two weeks in Japan", dates: { state: "cleared" as const },
    interests: { state: "selected" as const, value: [] },
    travellers: { state: "selected" as const, value: 2 },
  };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  assert.equal(await persistHomepageIntakeForImport(storage, snapshot, async <T,>(_key: string, run: () => Promise<T>) => run()), true);
  assert.deepEqual(readHomepageInput(JSON.parse(values.get(homepageInputStorageKey("owner-a"))!), "owner-a")?.snapshot, JSON.parse(JSON.stringify(snapshot)));
});

test("blocked storage prevents import navigation and leaves current intake visible", async () => {
  const snapshot = selectedStopsHomepageInput("owner-a");
  assert.equal(await persistHomepageIntakeForImport({ getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} }, snapshot, async <T,>(_key: string, run: () => Promise<T>) => run()), false);
  assert.match(starter(), /event\.preventDefault\(\)/);
});

test("stale import departure cannot erase an unacknowledged handoff", async () => {
  const snapshot = selectedStopsHomepageInput("owner-a");
  const pending = createPendingIntakeReceipt(snapshot, { handoffId: "pending", tripId: "reserved-trip" });
  const key = homepageInputStorageKey("owner-a");
  const original = JSON.stringify({ snapshot, receipt: pending });
  const values = new Map([[key, original]]);
  const storage = { getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); } };
  const lock = async <T,>(_key: string, run: () => Promise<T>) => run();
  assert.equal(await persistHomepageIntakeForImport(storage, { ...snapshot, revision: 1 }, lock), false);
  assert.equal(values.get(key), original);
});

test("import stays outside planner form and retains the canonical importer", () => {
  const source = starter();
  assert.match(source, /<MorroviaTripCapture[\s\S]*<EasyTLinkButton href="\/journey\/new\/import"/);
  assert.match(source, /persistHomepageIntakeForImport/);
  const importerSource = importer();
  assert.match(importerSource, /canonicalTripFromSpreadsheetProposal/);
  assert.match(importerSource, /saveTripRecoveryToEasyT/);
  assert.match(importerSource, /<Link className=\{styles\.back\} href="\/journey\/new"/);
});

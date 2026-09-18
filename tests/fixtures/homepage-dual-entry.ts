import assert from "node:assert/strict";
import type { HomepageDestinationEntry, HomepageInputSnapshot } from "../../lib/easyt/home-trip-handoff.ts";
import { canonicalPlaceSuggestionFor } from "../../lib/easyt/place-intelligence.ts";

export function selectedEntry(id: string, canonicalName: string): HomepageDestinationEntry {
  const selection = canonicalPlaceSuggestionFor(canonicalName);
  assert(selection, `Expected ${canonicalName} in the direct-destination catalogue fixture`);
  return { id, text: selection.label, selection };
}

export function emptyHomepageInput(ownerId: string | null = null): HomepageInputSnapshot {
  return {
    version: 1,
    ownerId,
    revision: 0,
    mode: "stops",
    entries: [],
    prompt: "",
    dates: { state: "untouched" },
    budget: { state: "untouched" },
    interests: { state: "untouched" },
    travellers: { state: "untouched" },
    origin: { state: "untouched" },
    journeyEnd: { state: "untouched" },
  };
}

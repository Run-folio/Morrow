import assert from "node:assert/strict";
import type { HomepageDestinationEntry } from "../../lib/easyt/home-trip-handoff.ts";
import { canonicalPlaceSuggestionFor } from "../../lib/easyt/place-intelligence.ts";

export function selectedEntry(id: string, canonicalName: string): HomepageDestinationEntry {
  const selection = canonicalPlaceSuggestionFor(canonicalName);
  assert(selection, `Expected ${canonicalName} in the direct-destination catalogue fixture`);
  return { id, text: selection.label, selection };
}

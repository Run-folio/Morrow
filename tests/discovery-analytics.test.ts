import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Discovery funnel has consent-gated typed categorical events without traveller text", () => {
  const analytics = read("lib/analytics.ts");
  const modal = read("components/easyt/discovery-modal.tsx");
  for (const event of ["discovery_shown", "discovery_direction_selected", "discovery_place_choice_changed", "discovery_review_reached", "discovery_confirmed", "discovery_closed_or_resumed"]) {
    assert.match(analytics, new RegExp(`${event}:`));
    assert.match(modal, new RegExp(`trackEvent\\("${event}"`));
  }
  assert.match(analytics, /if \(!hasAnalyticsConsent\(\)\) return;/);
  assert.doesNotMatch(modal.match(/trackEvent\("discovery_[\s\S]*?\);/g)?.join("\n") ?? "", /sourceText|canonicalName|place\.name|coordinates|sourceUrl|rawPrompt/);
  assert.match(modal, /shownRef\.current/);
  assert.match(modal, /reviewReachedRef\.current/);
});

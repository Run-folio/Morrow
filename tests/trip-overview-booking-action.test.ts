import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Overview keeps unresolved stays in the canonical Stay workspace instead of an affiliate hero", () => {
  const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  assert.match(source, /mapWorkspaceHref\(trip\.id, accommodation\.stops\.find[\s\S]*"stay"\)/);
  assert.match(source, /label: "View stays"/);
  assert.doesNotMatch(source, /getBookingAction|missingStayAction|journey-accommodation-search/);
});

test("Overview affiliate tracking remains owned by canonical preparation task rows", () => {
  const overview = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  const preparation = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  assert.doesNotMatch(overview, /overview_next_action|trackEvent\("affiliate_click"/);
  assert.match(preparation, /trackEvent\("affiliate_click"/);
  assert.match(preparation, /placement: "overview_before_you_go"/);
  assert.doesNotMatch(preparation.match(/trackEvent\("affiliate_click"[\s\S]*?\}\);/)?.[0] ?? "", /raw_prompt|traveller|country|city/);
});

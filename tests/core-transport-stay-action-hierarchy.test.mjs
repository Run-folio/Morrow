import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = (name) => readFileSync(new URL(`../components/easyt/${name}.tsx`, import.meta.url), "utf8");

test("only the eligible provider action precedes the transport disclosure; mark and change live inside it", () => {
  const detail = source("trip-transport-workspace").split("function SelectedJourneyDetail(")[1].split("function TransportManualBookingEditor(")[0];
  const disclosure = detail.match(/<details className=\{styles.moreActions\}[\s\S]*?<\/details>/)?.[0];
  assert.ok(disclosure);
  assert.ok(detail.indexOf("<TransportAffiliateAction") < detail.indexOf(disclosure));
  assert.match(disclosure, /<summary>\{copy.moreActions\}<\/summary>/);
  assert.match(disclosure, /isPassengerServiceLeg\(leg\)/);
  assert.match(disclosure, /\{copy.markBooked\}/);
  assert.match(disclosure, /<TripTransportChoiceControl/);
  assert.match(detail, /\{action && !compactFlightSearch\(action, leg\) \? <small className=\{styles.partnerNote\}>\{visibleAffiliateDisclosure\}/);
  const primary = source("trip-transport-workspace").split("function TransportAffiliateAction(")[1];
  assert.match(primary, /const compact = compactFlightSearch\(action, leg\)/);
  assert.match(primary, /<MorroviaAffiliateLink[^>]* handoffInfoLabel=\{compact \?/);
  assert.match(primary, /\{compact \? <small className=\{styles.partnerNote\}>.*Morrovia may earn a commission/);
  const css = readFileSync(new URL("../components/easyt/trip-transport-workspace.module.css", import.meta.url), "utf8");
  assert.match(css, /:has\(> \[data-airport-editor-open\]\) > \.connectionActions,[\s\S]*?:has\(> \[data-airport-editor-open\]\) > \.partnerNote\s*\{\s*display:\s*none/);
});
test("Stay shortlist uses Details consistently without changing review or its navigation target", () => {
  const shortlist = source("trip-stay-shortlist");
  assert.equal((shortlist.match(/>Details<\//g) ?? []).length, 2);
  assert.match(shortlist, /onReview\(place\)/);
  assert.match(shortlist, /#stay-handoff/);
  assert.match(shortlist, /Photos unavailable/);
});

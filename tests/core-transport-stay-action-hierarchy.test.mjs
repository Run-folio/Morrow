import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = (name) => readFileSync(new URL(`../components/easyt/${name}.tsx`, import.meta.url), "utf8");

test("eligible search and alternatives are direct peers; the summary independently controls the booking mark", () => {
  const workspace = source("trip-transport-workspace");
  const detail = workspace.split("function SelectedJourneyDetail(")[1].split("function TransportManualBookingEditor(")[0];
  const card = workspace.split("function TransportCard(")[1].split("function SelectedJourneyDetail(")[0];
  const actions = detail.split('<div className={styles.connectionActions}>')[1].split('</div>')[0];
  assert.match(actions, /\{action \? <TransportAffiliateAction/);
  assert.match(actions, /\{canChange \|\| canCheck \? <TripTransportChoiceControl/);
  assert.match(actions, /checkOnly=\{!canChange && canCheck\}/);
  assert.doesNotMatch(actions, /<details|<summary|markTransportLegBooked/);
  assert.match(card, /className=\{styles.cardEnd\}[\s\S]*?className=\{styles.bookingToggle\}/);
  assert.match(card, /canToggleBooking = !item.bookingMismatch && !importedBooking[^;]*isPassengerServiceLeg\(leg\)/);
  assert.match(card, /aria-pressed=\{bookingMarked\}/);
  assert.match(card, /isAccountCopySettled\(\)/);
  assert.match(card, /candidate.bookingMismatch \|\| bookingRouteScope\(current, candidate\) !== routeScope/);
  assert.match(card, /unmarkTransportBooking\(current, candidate.manualBooking.id\)/);
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

import assert from "node:assert/strict";
import test from "node:test";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { reviewedRouteStopSatisfiesMention } from "../lib/easyt/builder-clarification.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { defaultTripIntent, tripFromBuilder } from "../lib/easyt/trip.ts";
import { discoveryEntryForBrief } from "../lib/easyt/discovery-entry.ts";
import { readFileSync } from "node:fs";

const detail = publicRouteDetailFor("namibia-self-drive")!;
const payload = routePlannerPayload(detail.planDraft, new Date(2026, 9, 1, 12));
const reloaded = JSON.parse(JSON.stringify(payload)) as typeof payload;
const mention = reloaded.structuredBrief.placeMentions!.find((item) => item.canonicalPlaceId === "damaraland")!;
const decision = (overrides: Partial<Parameters<typeof reviewedRouteStopSatisfiesMention>[0]> = {}) => reviewedRouteStopSatisfiesMention({
  mention,
  brief: reloaded.structuredBrief,
  stops: reloaded.destinations,
  sourceRouteKey: reloaded.sourceRouteKey,
  curatedRoute: reloaded.curatedRoute,
  reviewedDraft: detail.planDraft,
  ...overrides,
});

test("the real Namibia route handoff keeps its occurrence IDs, stops, and 13 allocated nights without a Damaraland task", () => {
  assert.deepEqual(reloaded.destinations.map((stop) => stop.name), ["Windhoek", "Sossusvlei", "Swakopmund", "Damaraland", "Etosha", "Waterberg", "Windhoek"]);
  assert.deepEqual(reloaded.destinations.map((stop) => stop.id), detail.planDraft.destinations.map((stop) => stop.id));
  assert.deepEqual(reloaded.destinations.map((stop) => reloaded.nightAllocations[stop.id]), [1, 2, 2, 2, 3, 2, 1]);
  assert.equal(decision(), true);
  assert.equal(reloaded.structuredBrief.placeIssues?.some((issue) => issue.mentionId === mention.mentionId && issue.code === "region_requires_base" && !issue.blocksRoute), true, "the optional geography advisory remains available");
  assert.equal(decision({ brief: structuredClone(reloaded.structuredBrief), stops: structuredClone(reloaded.destinations) }), true, "save/reload must retain the decision");
  assert.notEqual(reloaded.destinations[0].id, reloaded.destinations[6].id, "repeated Windhoek occurrences stay distinct");
});

test("saved canonical Namibia trip reopens with the same reviewed regional decision", () => {
  const trip = tripFromBuilder({
    id: "namibia-premade-reload", origin: reloaded.origin,
    originCountry: reloaded.originCountry, originCanonicalPlaceId: reloaded.originCanonicalPlaceId,
    originCoordinates: reloaded.originCoordinates, journeyEnd: reloaded.journeyEnd,
    stops: reloaded.destinations, startDate: reloaded.startDate, endDate: reloaded.endDate,
    picks: {}, mustDo: reloaded.brief, pace: "slow", hotels: "few", budget: "mid",
    nightAllocations: reloaded.nightAllocations, draft: [], status: "planned",
    intent: defaultTripIntent({ durationDays: detail.durationDays, stopIds: reloaded.destinations.map((stop) => stop.id) }),
    sourceRouteKey: reloaded.sourceRouteKey, curatedRoute: reloaded.curatedRoute,
    structuredBrief: reloaded.structuredBrief, decisionSelections: reloaded.decisionSelections,
  });
  const saved = JSON.parse(JSON.stringify(canonicalTripForOwner("namibia-owner", trip, "2026-10-01T12:00:00.000Z"))) as typeof trip;
  const reopenedBrief = saved.brief.structuredBrief!;
  const reopenedMention = reopenedBrief.placeMentions!.find((item) => item.canonicalPlaceId === "damaraland")!;
  assert.deepEqual(saved.stops.map((stop) => stop.nights), [1, 2, 2, 2, 3, 2, 1]);
  assert.equal(reviewedRouteStopSatisfiesMention({
    mention: reopenedMention, brief: reopenedBrief,
    stops: saved.stops.map((stop) => ({ ...stop, coordinates: [stop.longitude!, stop.latitude!] as [number, number] })),
    sourceRouteKey: saved.brief.sourceRouteKey, curatedRoute: saved.brief.curatedRoute,
    reviewedDraft: detail.planDraft,
  }), true);
  assert.equal(saved.stops[0].id === saved.stops[6].id, false);
});

test("template acceptance does not leak to edited, new, or misidentified stops", () => {
  const edit = (change: Partial<(typeof reloaded.destinations)[number]>) => reloaded.destinations.map((stop, index) => index === 3 ? { ...stop, ...change } : stop);
  assert.equal(decision({ stops: edit({ name: "Twyfelfontein" }) }), false);
  assert.equal(decision({ stops: edit({ id: "traveller-added" }) }), false);
  assert.equal(decision({ stops: edit({ coordinates: [15, -21] }) }), false);
  assert.equal(decision({ stops: edit({ canonicalPlaceId: "another-place" }) }), false);
  assert.equal(decision({ stops: [...reloaded.destinations.slice(0, 2), { ...reloaded.destinations[3], id: "extra-stop" }, ...reloaded.destinations.slice(2)] }), false);
  assert.equal(decision({ sourceRouteKey: "another-route" }), false);
  assert.equal(decision({ brief: { ...reloaded.structuredBrief, placeIssues: [
    ...(reloaded.structuredBrief.placeIssues ?? []),
    { ...(reloaded.structuredBrief.placeIssues ?? []).find((issue) => issue.mentionId === mention.mentionId)!, code: "unresolved_place" },
  ] } }), false, "a separate unresolved issue must remain actionable");
});

test("an unresolved traveller-entered region cannot borrow reviewed route acceptance", () => {
  const userBrief = extractStructuredTripBrief("Damaraland");
  const userMention = userBrief.placeMentions!.find((item) => item.canonicalPlaceId === "damaraland")!;
  assert.equal(decision({ mention: userMention, brief: userBrief }), false);
  assert.equal(decision({ curatedRoute: undefined }), false);
  assert.equal(discoveryEntryForBrief(userBrief, ["damaraland"], userMention.mentionId).kind, "region");
});

test("Builder still exposes ordinary stop editing while filtering reviewed route decisions", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.match(builder, /reviewPlaceMentions = useMemo\(\(\) => placeMentionsNeedingReview[\s\S]*?reviewedRouteStopSatisfiesMention/);
  assert.match(builder, /setEditingRouteStopId/);
});

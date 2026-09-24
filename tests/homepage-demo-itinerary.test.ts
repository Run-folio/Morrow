import assert from "node:assert/strict";
import test from "node:test";
import { immersiveHomepageRoutes } from "../lib/easyt/immersive-homepage-routes.ts";
import { createHomepageDemo, homepageDemoReducer } from "../lib/easyt/homepage-demo.ts";
import { homepageDemoItinerary, homepageDemoRepresentativeDay, homepageDemoWeeks } from "../lib/easyt/homepage-demo-itinerary.ts";

const routes = immersiveHomepageRoutes();
const namibia = routes.find((route) => route.key === "namibia-self-drive")!;

test("sample itinerary starts on a populated, non-transfer day and remains an unbooked suggestion", () => {
  const itinerary = homepageDemoItinerary(namibia, namibia.stops.map((stop) => stop.nights));
  const representative = homepageDemoRepresentativeDay(itinerary);
  const selected = itinerary.days[representative - 1];
  assert.ok(representative > 1 && representative < itinerary.days.length);
  assert.equal(selected.transfer, null);
  assert.ok(selected.items.length >= 2);
  assert.ok(selected.items.every((item) => item.status === "suggested" && item.stopId === selected.stopId));
  assert.equal(selected.stopId, namibia.stops[2].id);
  assert.deepEqual(selected.items.map((item) => item.en), ["Take a pause by the Atlantic coast", "Free time in Swakopmund"]);
  assert.deepEqual(selected.items.map((item) => item.es), ["Haz una pausa junto a la costa atlántica", "Tiempo libre en Swakopmund"]);
  assert.equal(itinerary.disclosure.en.includes("not booked"), true);
  assert.equal(itinerary.disclosure.es.includes("sin reservar"), true);
  assert.ok(itinerary.days.filter((day) => day.items.length >= 2).length >= 3);
  assert.equal(itinerary.days.at(-1)?.overnight, false);
  assert.equal(homepageDemoWeeks(itinerary).flatMap((week) => week.bands).reduce((sum, band) => sum + band.span, 0), namibia.stops.reduce((sum, stop) => sum + stop.nights, 0));
});

test("rebalance keeps dates and attached ideas while moving transfer and overnight boundaries", () => {
  const before = homepageDemoItinerary(namibia, namibia.stops.map((stop) => stop.nights));
  let state = createHomepageDemo(routes);
  state = homepageDemoReducer(state, { type: "night", route: namibia, index: 2, value: namibia.stops[2].nights + 1 });
  const after = homepageDemoItinerary(namibia, state.nights[namibia.key]);
  assert.equal(after.days.length, before.days.length);
  assert.equal(after.days.at(-1)?.date, before.days.at(-1)?.date);
  const stopId = namibia.stops[2].id;
  const firstAfter = after.days.find((day) => day.stopId === stopId)!;
  assert.equal(firstAfter.transfer?.fromStopId, namibia.stops[1].id);
  assert.ok(after.days.filter((day) => day.stopId === stopId).length > before.days.filter((day) => day.stopId === stopId).length);
  assert.ok(after.days.every((day) => day.items.every((item) => item.stopId === day.stopId)));
  assert.ok(homepageDemoWeeks(after).some((week) => week.bands.some((band) => band.stopId === stopId)));
  state = homepageDemoReducer(state, { type: "reset", route: namibia });
  assert.deepEqual(homepageDemoItinerary(namibia, state.nights[namibia.key]), before);
});

test("every published route has localized neutral ideas and canonical occurrence bands", () => {
  for (const route of routes) {
    const itinerary = homepageDemoItinerary(route, route.stops.map((stop) => stop.nights));
    const weeks = homepageDemoWeeks(itinerary);
    assert.equal(weeks.flatMap((week) => week.days).filter(Boolean).length, itinerary.days.length);
    assert.ok(itinerary.days.every((day) => day.items.every((item) => item.en && item.es && item.stopId === day.stopId)));
    assert.ok(weeks.flatMap((week) => week.bands).every((band) => route.stops.some((stop) => stop.id === band.stopId)));
  }
});

test("sparse reviewed knowledge falls back to neutral, localized ideas", () => {
  const japan = routes.find((route) => route.key === "japan-south-korea")!;
  const sample = homepageDemoItinerary(japan, japan.stops.map((stop) => stop.nights));
  const interior = sample.days.find((day) => !day.transfer && day.items.length >= 2)!;
  assert.equal(interior.items[0].en, `Explore ${japan.stops[interior.stopIndex].name}`);
  assert.equal(interior.items[0].es, `Explora ${japan.stops[interior.stopIndex].name}`);
});

test("Builder defaults to Day by day on first Itinerary entry; manual selection survives view changes", () => {
  let state = createHomepageDemo(routes);
  assert.equal(state.view, "builder");
  assert.equal(state.itineraryView, "days");
  state = homepageDemoReducer(state, { type: "view", view: "itinerary" });
  assert.equal(state.manualDay[namibia.key], undefined);
  const itinerary = homepageDemoItinerary(namibia, state.nights[namibia.key]);
  assert.ok(homepageDemoRepresentativeDay(itinerary) > 1);
  state = homepageDemoReducer(state, { type: "day", route: namibia, day: 3 });
  state = homepageDemoReducer(state, { type: "itineraryView", view: "calendar" });
  state = homepageDemoReducer(state, { type: "view", view: "builder" });
  state = homepageDemoReducer(state, { type: "view", view: "itinerary" });
  assert.equal(state.day[namibia.key], 3);
  assert.equal(state.itineraryView, "calendar");
  state = homepageDemoReducer(state, { type: "reset", route: namibia });
  assert.equal(state.manualDay[namibia.key], false);
  assert.equal(state.itineraryView, "days");
});

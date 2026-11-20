import assert from "node:assert/strict";
import test from "node:test";
import { buildStay22MapUrl } from "../lib/easyt/stay22-map-pilot.ts";

const kyoto = { affiliateId: "synthetic_fixture", approved: true, longitude: 135.7681, latitude: 35.0116, checkIn: "2027-03-06", checkOut: "2027-03-09", adults: 2 };
test("only sends the approved selected stay scope", () => {
  const input = { ...kyoto, tripId: "private", name: "private" };
  const url = new URL(buildStay22MapUrl(input, "all")!);
  assert.equal(url.origin + url.pathname, "https://www.stay22.com/embed/gm");
  assert.deepEqual(Object.fromEntries(url.searchParams), { aid: kyoto.affiliateId, lat: "35.0116", lng: "135.7681", checkin: kyoto.checkIn, checkout: kyoto.checkOut, adults: "2", zoom: "13", viewmode: "all", listviewexpand: "true" });
});
test("next stop uses its own dates, coordinates and adult count, with an explicit compact list", () => {
  const url = new URL(buildStay22MapUrl({ ...kyoto, latitude: 34.69, longitude: 135.5, checkIn: "2027-03-09", checkOut: "2027-03-11", adults: 3 }, "listview")!);
  for (const [key, value] of Object.entries({ latitude: "34.69", longitude: "135.5", checkin: "2027-03-09", checkout: "2027-03-11", adults: "3", viewmode: "listview" })) {
    assert.equal(url.searchParams.get(({ latitude: "lat", longitude: "lng" } as Record<string, string>)[key] ?? key), value);
  }
  assert.equal(url.searchParams.get("listviewexpand"), null);
});
test("fails closed without config, valid stop facts, or affirmative activation", () => {
  for (const override of [{ affiliateId: "" }, { affiliateId: "demo_affiliate_id" }, { approved: false }, { latitude: null }, { latitude: 100 }, { longitude: Infinity }, { checkIn: null }, { checkIn: "2027-02-30" }, { checkOut: kyoto.checkIn }, { adults: 0 }, { adults: 2.5 }]) {
    assert.equal(buildStay22MapUrl({ ...kyoto, ...override }, "all"), null);
  }
});

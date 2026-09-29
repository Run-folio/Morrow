import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleMapsSdkLoader,
  createGoogleTripMapSession,
  googleCanvasEligible,
  type GoogleTripMapApi,
} from "../lib/easyt/google-trip-map-adapter.ts";
import { nativeGooglePoiSelection } from "../lib/easyt/map-workspace-selection.ts";
import { createLatestGoogleDetailRequest } from "../lib/easyt/google-place-details-client.ts";

test("flag, account, expansion and complete browser configuration gate the canvas", () => {
  const ready = { flag: true, authenticated: true, expanded: true, serverAvailable: true, browserKey: "browser-key" };
  assert.equal(googleCanvasEligible(ready), true);
  for (const key of ["flag", "authenticated", "expanded", "serverAvailable"] as const) {
    assert.equal(googleCanvasEligible({ ...ready, [key]: false }), false, key);
  }
  assert.equal(googleCanvasEligible({ ...ready, browserKey: " " }), false);
});

test("SDK loading is single-flight and retries after a failed load", async () => {
  let installs = 0;
  let complete: ((api: GoogleTripMapApi) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  const loader = createGoogleMapsSdkLoader((_key, onLoad, onError) => {
    installs++;
    complete = onLoad;
    fail = onError;
  });
  const first = loader("browser-key");
  const second = loader("browser-key");
  assert.equal(first, second);
  assert.equal(installs, 1);
  fail!(new Error("SDK failed"));
  await assert.rejects(first, /SDK failed/);
  const retry = loader("browser-key");
  assert.equal(installs, 2);
  const api = fakeApi();
  complete!(api);
  assert.equal(await retry, api);
  assert.equal(await loader("browser-key"), api);
  assert.equal(installs, 2);
});

test("native POI absent from any nearby list selects its exact Place ID and suppresses only its popup", () => {
  const api = fakeApi();
  const selected: string[] = [];
  const empty: Array<[number, number]> = [];
  const session = createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [], legs: [], selectedStopId: null,
    onNativePoi: (id) => { selected.push(id); },
    onEmptyClick: (point) => empty.push(point),
    onSelectStop: () => {}, onSelectLeg: () => {},
  });
  let stopped = 0;
  api.lastMap!.fire("click", { placeId: "ChIJnative-unfetched", stop: () => stopped++ });
  assert.deepEqual(selected, ["ChIJnative-unfetched"]);
  assert.equal(stopped, 1);
  api.lastMap!.fire("click", { latLng: { lat: () => 35.7, lng: () => 139.7 }, stop: () => stopped++ });
  assert.deepEqual(empty, [[139.7, 35.7]]);
  assert.equal(stopped, 1);
  session.destroy();
});

test("a native POI keeps its Google popup when no canonical stop can handle it", () => {
  const api = fakeApi();
  const session = createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [], legs: [], selectedStopId: null,
    onNativePoi: () => false,
    onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  let stopped = 0;
  api.lastMap!.fire("click", { placeId: "ChIJunhandled", stop: () => stopped++ });
  assert.equal(stopped, 0);
  session.destroy();
});

test("same-name stops and route legs keep canonical IDs; detail updates do not remount or reset camera", () => {
  const api = fakeApi();
  const stops: string[] = [];
  const legs: string[] = [];
  const session = createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [
      { id: "tokyo-first", name: "Tokyo", coordinates: [139.69, 35.68] },
      { id: "kyoto", name: "Kyoto", coordinates: [135.76, 35.01] },
      { id: "tokyo-second", name: "Tokyo", coordinates: [139.69, 35.68] },
    ],
    legs: [{ id: "leg-second-tokyo", fromStopId: "kyoto", toStopId: "tokyo-second" }],
    selectedStopId: "tokyo-first",
    onNativePoi: () => {}, onEmptyClick: () => {},
    onSelectStop: (id) => stops.push(id), onSelectLeg: (id) => legs.push(id),
  });
  api.markers[2]!.fire("click");
  api.legLines[0]!.fire("click");
  assert.deepEqual(stops, ["tokyo-second"]);
  assert.deepEqual(legs, ["leg-second-tokyo"]);
  const map = api.lastMap!;
  const originalCenterCalls = map.centerCalls;
  session.update({ selectedStopId: "tokyo-first" }); // category/detail response does not change stop
  assert.equal(api.mapCreations, 1);
  assert.equal(map.centerCalls, originalCenterCalls);
  session.destroy();
  assert.equal(map.listenerRemoved, true);
  assert.ok(api.markers.every((marker) => marker.map === null));
  assert.ok(api.legLines.every((line) => line.map === null));
});

test("nearby result markers update without remounting the Google map and emit exact Place IDs", () => {
  const api = fakeApi();
  const picked: string[] = [];
  const session = createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [{ id: "agra", name: "Agra", coordinates: [78.008, 27.176] }],
    legs: [], selectedStopId: "agra",
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
    onSelectPlace: (id) => picked.push(id),
  });
  session.updatePlaces([{ id: "ChIJnearby-one", name: "Nearby one", coordinates: [78.01, 27.18] }]);
  api.markers[1]!.fire("click");
  assert.deepEqual(picked, ["ChIJnearby-one"]);
  assert.equal(api.mapCreations, 1);
  session.updatePlaces([]);
  assert.equal(api.markers[1]!.map, null);
  session.destroy();
});

test("native POI selection retains canonical occurrence and intended day", () => {
  assert.deepEqual(nativeGooglePoiSelection("ChIJnative-unfetched", "tokyo-second", "day-8"), {
    kind: "google", placeId: "ChIJnative-unfetched", stopId: "tokyo-second", dayId: "day-8",
  });
});

test("native POI detail uses the authenticated server boundary and discards a stale response", async () => {
  const pending = new Map<string, (value: Response) => void>();
  const called: string[] = [];
  const request = createLatestGoogleDetailRequest((url) => {
    called.push(String(url));
    return new Promise<Response>((resolve) => { pending.set(new URL(String(url), "http://local").searchParams.get("id")!, resolve); });
  });
  const observed: string[] = [];
  const first = request.select("ChIJfirst", (place) => observed.push(place.providerPlaceId));
  const second = request.select("ChIJsecond", (place) => observed.push(place.providerPlaceId));
  pending.get("ChIJsecond")!(Response.json({ place: {
    provider: "google", providerPlaceId: "ChIJsecond", name: "Second", coordinates: [139.7, 35.7], mapsUrl: "https://maps.google.com/?cid=2",
  } }));
  await second;
  pending.get("ChIJfirst")!(Response.json({ place: {
    provider: "google", providerPlaceId: "ChIJfirst", name: "First", coordinates: [139.7, 35.7], mapsUrl: "https://maps.google.com/?cid=1",
  } }));
  await first;
  assert.deepEqual(observed, ["ChIJsecond"]);
  assert.deepEqual(called.map((url) => new URL(url, "http://local").pathname), ["/api/journey-place-enrichment", "/api/journey-place-enrichment"]);
  assert.deepEqual(called.map((url) => new URL(url, "http://local").searchParams.get("mode")), ["details", "details"]);
});

test("saved reference uses the authenticated resolve path and returns only freshness metadata to the trip owner", async () => {
  const calls: URLSearchParams[] = [];
  const request = createLatestGoogleDetailRequest((url) => {
    calls.push(new URL(String(url), "http://local").searchParams);
    return Promise.resolve(Response.json({ status: "resolved", detail: {
      providerPlaceId: "ChIJsaved", name: "Transient name", coordinates: [139.7, 35.7], mapsUrl: "https://www.google.com/maps/place/ChIJsaved",
    }, refreshedReference: { provider: "google", placeId: "ChIJsaved", lastResolvedAt: "2026-09-28T12:00:00.000Z" } }));
  });
  const results: unknown[] = [];
  await request.select("ChIJsaved", (detail, reference) => results.push({ detail, reference }), { provider: "google", placeId: "ChIJsaved", lastResolvedAt: "2024-01-01T00:00:00.000Z" });
  assert.equal(calls[0]?.get("mode"), "resolve");
  assert.equal(calls[0]?.get("lastResolvedAt"), "2024-01-01T00:00:00.000Z");
  assert.equal((results[0] as { reference: { placeId: string } }).reference.placeId, "ChIJsaved");
});

function fakeApi() {
  class FakeEventTarget {
    listeners = new Map<string, (event: any) => void>();
    map: unknown = undefined;
    fire(name: string, event?: unknown) { this.listeners.get(name)?.(event); }
    addListener(name: string, callback: (event: any) => void) {
      this.listeners.set(name, callback);
      return { remove: () => { this.listeners.delete(name); } };
    }
    setMap(map: unknown) { this.map = map; }
  }
  class FakeMap extends FakeEventTarget {
    centerCalls = 0;
    listenerRemoved = false;
    setCenter() { this.centerCalls++; }
    setZoom() {}
    fitBounds() {}
    override addListener(name: string, callback: (event: any) => void) {
      const listener = super.addListener(name, callback);
      return { remove: () => { listener.remove(); this.listenerRemoved = true; } };
    }
  }
  const api = {
    mapCreations: 0,
    lastMap: null as FakeMap | null,
    markers: [] as FakeEventTarget[],
    legLines: [] as FakeEventTarget[],
    Map: class extends FakeMap {
      constructor() { super(); api.mapCreations++; api.lastMap = this; }
    },
    Marker: class extends FakeEventTarget {
      constructor(options: { map: unknown }) { super(); this.map = options.map; api.markers.push(this); }
    },
    Polyline: class extends FakeEventTarget {
      constructor(options: { map: unknown }) { super(); this.map = options.map; api.legLines.push(this); }
    },
  };
  return api as unknown as GoogleTripMapApi & typeof api;
}

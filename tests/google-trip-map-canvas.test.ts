import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalMapStopCoordinates,
  createGoogleMapsSdkLoader,
  createGoogleTripMapSession,
  GOOGLE_MAP_RENDERER_ENABLED,
  googlePlaceMarkerIcon,
  googleCanvasEligible,
  type GoogleTripMapApi,
} from "../lib/easyt/google-trip-map-adapter.ts";
import { nativeGooglePoiSelection } from "../lib/easyt/map-workspace-selection.ts";
import { createLatestGoogleDetailRequest } from "../lib/easyt/google-place-details-client.ts";

test("flag, account, expansion and complete browser configuration gate the canvas", () => {
  const ready = { rendererEnabled: true, flag: true, authenticated: true, expanded: true, serverAvailable: true, browserKey: "browser-key" };
  assert.equal(googleCanvasEligible(ready), true);
  assert.equal(googleCanvasEligible({ ...ready, rendererEnabled: false }), false);
  for (const key of ["flag", "authenticated", "expanded", "serverAvailable"] as const) {
    assert.equal(googleCanvasEligible({ ...ready, [key]: false }), false, key);
  }
  assert.equal(googleCanvasEligible({ ...ready, browserKey: " " }), false);
});

test("the beta parks Google map rendering without changing Places enrichment availability", () => {
  assert.equal(GOOGLE_MAP_RENDERER_ENABLED, false);
  assert.equal(googleCanvasEligible({
    rendererEnabled: GOOGLE_MAP_RENDERER_ENABLED,
    flag: true,
    authenticated: true,
    expanded: true,
    serverAvailable: true,
    browserKey: "browser-key",
  }), false);
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
  const session = createGoogleTripMapSession(api, { clientWidth: 1000, clientHeight: 600 } as HTMLElement, {
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
  assert.equal(api.markers.length, 2, "coincident canonical stops share one map hit area; the route strip selects each occurrence directly");
  api.markers[0]!.fire("click");
  api.legLines[0]!.fire("click");
  assert.deepEqual(stops, ["tokyo-first"]);
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

test("canonical transfer metadata appears on the route and its badge selects the same leg", () => {
  const api = fakeApi();
  const documentOwner = fakeDocument();
  Object.assign(api, {
    LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } },
    OverlayView: class {
      onAdd?(): void; draw?(): void; onRemove?(): void;
      setMap(map: unknown) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); }
      getPanes() { return { overlayMouseTarget: { append() {} } }; }
      getProjection() { return { fromLatLngToDivPixel: (point: { lat: number; lng: number }) => ({ x: point.lng * 100, y: point.lat * 100 }) }; }
    },
  });
  const selectedLegs: string[] = [];
  const selectedPlaces: string[] = [];
  const session = createGoogleTripMapSession(api, { ownerDocument: documentOwner, append() {} } as unknown as HTMLElement, {
    stops: [
      { id: "windhoek", name: "Windhoek", coordinates: [17.0832, -22.5609] },
      { id: "swakopmund", name: "Swakopmund", coordinates: [14.5053, -22.6784] },
    ],
    legs: [{ id: "leg-windhoek-swakopmund", fromStopId: "windhoek", toStopId: "swakopmund", modeLabel: "Road", durationLabel: "3h 45m", routeGeometry: [[17.0832, -22.5609], [16, -22.6], [14.5053, -22.6784]] }],
    selectedStopId: null,
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: (id) => selectedLegs.push(id), onSelectPlace: (id) => selectedPlaces.push(id),
  });
  session.updatePlaces([]);
  const badge = documentOwner.elements.find((element) => element.className.includes("planner-map__leg-badge"));
  assert.ok(badge, "Google retains a route-anchored transport marker in whole-route mode");
  assert.match(badge.textContent, /road/i);
  assert.match(badge.textContent, /3h 45m/);
  assert.deepEqual([badge.style.left, badge.style.top], ["1600px", "-2260px"], "the badge follows canonical route geometry rather than an unrelated map offset");
  assert.deepEqual((api.legLines[0]!.options as { path: Array<{ lat: number; lng: number }> }).path, [
    { lat: -22.5609, lng: 17.0832 }, { lat: -22.6, lng: 16 }, { lat: -22.6784, lng: 14.5053 },
  ]);
  badge.fire("click");
  assert.deepEqual(selectedLegs, ["leg-windhoek-swakopmund"]);
  session.updatePlaces([{ id: "pin-artemis", sourceId: "pin-artemis", stopId: "swakopmund", name: "Artemis Hotel", category: "stay", coordinates: [14.5266, -22.6784], plannerPin: true }], "pin-artemis");
  const pin = documentOwner.elements.find((element) => element.className.includes("planner-map__place") && element.getAttribute("data-google-place-id") === "pin-artemis");
  assert.ok(pin, "the exact saved pin is rendered as a selectable Google overlay");
  assert.deepEqual([pin.style.left, pin.style.top], ["1452.66px", "-2267.84px"]);
  pin.fire("click");
  assert.deepEqual(selectedPlaces, ["pin-artemis"]);
  session.destroy();
});

test("local destination mode subdues long-haul legs and whole-route mode restores their context", () => {
  const api = fakeApi();
  const session = createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [
      { id: "mumbai", name: "Mumbai", coordinates: [72.8777, 19.076] },
      { id: "dubai", name: "Dubai", coordinates: [55.2708, 25.2048] },
      { id: "cape-town", name: "Cape Town", coordinates: [18.4241, -33.9249] },
    ],
    legs: [
      { id: "leg-1", fromStopId: "mumbai", toStopId: "dubai" },
      { id: "leg-2", fromStopId: "dubai", toStopId: "cape-town" },
    ], selectedStopId: "mumbai", cameraInsets: { left: 300 },
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  assert.ok(api.legLines.every((line) => (line.options as { strokeOpacity: number }).strokeOpacity < 0.2));
  session.update({ selectedStopId: null });
  assert.ok(api.legLines.every((line) => (line.options as { strokeOpacity: number }).strokeOpacity === 0.7));
  session.destroy();
});

test("whole-route framing includes the workspace rail while local stop framing offsets into the visible map", () => {
  const api = fakeApi();
  const stops = [
    { id: "delhi", name: "Delhi", coordinates: [77.2, 28.6] as [number, number] },
    { id: "agra", name: "Agra", coordinates: [78.0, 27.2] as [number, number] },
  ];
  const session = createGoogleTripMapSession(api, { clientWidth: 1000, clientHeight: 600 } as HTMLElement, {
    stops, legs: [], selectedStopId: null,
    cameraInsets: { left: 300 },
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  assert.equal(api.lastMap!.boundsCalls.length, 1);
  assert.deepEqual(api.lastMap!.lastBoundsPadding, { top: 48, right: 48, bottom: 48, left: 348 });
  session.update({ selectedStopId: "agra" });
  assert.deepEqual(api.lastMap!.lastPanBy, [-150, 0], "left rail moves the selected destination into the visible map area");
  assert.equal(api.lastMap!.lastZoom, 9.5);
  session.update({ selectedStopId: null });
  assert.equal(api.lastMap!.boundsCalls.length, 2);
  assert.deepEqual(api.lastMap!.boundsCalls[1], { north: 28.6, south: 27.2, east: 78, west: 77.2 });
  assert.deepEqual(api.lastMap!.lastBoundsPadding, { top: 48, right: 48, bottom: 48, left: 348 });
  session.destroy();
});

test("returning from a selected place restores the selected stop camera", () => {
  const api = fakeApi();
  const session = createGoogleTripMapSession(api, { clientWidth: 1000, clientHeight: 600 } as HTMLElement, {
    stops: [{ id: "mumbai", name: "Mumbai", coordinates: [72.8777, 19.076] }],
    legs: [], selectedStopId: "mumbai", cameraInsets: { left: 300 },
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  session.updatePlaces([{ id: "hotel", name: "Hotel", category: "stay", coordinates: [72.88, 19.08] }], "hotel", null, { left: 300 });
  assert.deepEqual(api.lastMap!.lastCenter, { lat: 19.08, lng: 72.88 });
  const zoomBeforeBack = api.lastMap!.zoomCalls;
  session.updatePlaces([], null, null, { left: 300 });
  assert.deepEqual(api.lastMap!.lastCenter, { lat: 19.076, lng: 72.8777 });
  assert.equal(api.lastMap!.lastZoom, 9.5);
  assert.equal(api.lastMap!.zoomCalls, zoomBeforeBack + 1, "Back to places restores destination scale");
  session.destroy();
});

test("safe-area changes reframe a local destination without resetting the user's zoom", () => {
  const api = fakeApi();
  const session = createGoogleTripMapSession(api, { clientWidth: 390, clientHeight: 700 } as HTMLElement, {
    stops: [{ id: "mumbai", name: "Mumbai", coordinates: [72.8777, 19.076] }], legs: [], selectedStopId: "mumbai",
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  session.update({ selectedStopId: "mumbai", cameraInsets: { bottom: 280 } });
  assert.equal(api.lastMap!.lastPanBy?.[1], 140, "the destination moves into the map space above the mobile sheet");
  assert.equal(api.lastMap!.zoomCalls, 0, "changing the sheet inset preserves the current zoom");
  session.destroy();
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
  session.updatePlaces([{ id: "ChIJnearby-one", name: "Nearby one", category: "eat", coordinates: [78.01, 27.18] }], "ChIJnearby-one");
  api.markers[1]!.fire("click");
  assert.deepEqual(picked, ["ChIJnearby-one"]);
  assert.equal((api.markers[1]!.options as { icon: { scaledSize: { width: number; height: number } } }).icon.scaledSize.width, 52);
  assert.equal(api.mapCreations, 1);
  session.updatePlaces([]);
  assert.equal(api.markers[1]!.map, null);
  session.destroy();
});

test("Morrovia result markers keep each hit target on its actual coordinate", () => {
  const api = fakeApi();
  for (const category of ["stay", "eat", "see"] as const) {
    const icon = googlePlaceMarkerIcon(api, category, false);
    assert.equal(icon.scaledSize.width, 44);
    assert.equal(icon.scaledSize.height, 44);
    assert.match(decodeURIComponent(icon.url), new RegExp(category.toUpperCase()));
  }
  const apiWithOverlay = fakeApi();
  const documentOwner = fakeDocument();
  Object.assign(apiWithOverlay, {
    LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } },
    OverlayView: class { onAdd?(): void; draw?(): void; onRemove?(): void; setMap(map: unknown) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); } getPanes() { return { overlayMouseTarget: { append() {} } }; } getProjection() { return { fromLatLngToDivPixel: (point: { lat: number; lng: number }) => ({ x: point.lng * 10000, y: point.lat * 10000 }) }; } },
  });
  const session = createGoogleTripMapSession(apiWithOverlay, { ownerDocument: documentOwner, append() {} } as unknown as HTMLElement, { stops: [], legs: [], selectedStopId: null, onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {} });
  session.updatePlaces([
    { id: "coincident-a", name: "A", category: "see", coordinates: [72.87771, 19.07601] },
    { id: "coincident-b", name: "B", category: "stay", coordinates: [72.87771, 19.07601] },
  ]);
  const overlap = documentOwner.elements.find((element) => element.className.includes("planner-map__place-overlap"));
  assert.ok(overlap, "coincident recommendations render one overlap control instead of false-offset individual pins");
  assert.deepEqual([overlap.style.left, overlap.style.top], ["728777.1px", "190760.1px"]);
  assert.equal(googlePlaceMarkerIcon(api, "see", true).scaledSize.width, 52);
  session.destroy();
});

test("regional zoom hides unselected local results and explicit list selection returns to a local view", () => {
  const api = fakeApi();
  const session = createGoogleTripMapSession(api, {} as HTMLElement, { stops: [{ id: "mumbai", name: "Mumbai", coordinates: [72.8777, 19.076] }], legs: [], selectedStopId: "mumbai", onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {}, onSelectPlace: () => {} });
  api.lastMap!.zoom = 3;
  const result = { id: "result:stay:mumbai:hotel-1", name: "Hotel", category: "stay" as const, coordinates: [72.88, 19.08] as [number, number] };
  const saved = { id: "saved:activity-1", name: "Saved activity", category: "see" as const, coordinates: [72.89, 19.09] as [number, number], state: "scheduled" as const };
  session.updatePlaces([result]);
  assert.equal(api.markers.filter((marker) => marker.map).length, 1, "only the route stop remains at regional zoom");
  session.updatePlaces([result, saved]);
  assert.equal(api.markers.filter((marker) => marker.map).length, 2, "scheduled trip content stays discoverable when local recommendations are hidden");
  session.updatePlaces([result], "result:stay:mumbai:hotel-1");
  assert.equal(api.lastMap!.lastZoom, 12, "explicit result navigation restores a usable local zoom");
  assert.equal(api.markers.filter((marker) => marker.map).length, 2);
  session.destroy();
});

test("native POI gets a temporary selected Morrovia marker and pans without resetting zoom", () => {
  const api = fakeApi();
  const selections: string[] = [];
  const session = createGoogleTripMapSession(api, { clientWidth: 1000, clientHeight: 600 } as HTMLElement, {
    stops: [], legs: [], selectedStopId: null,
    onNativePoi: (id) => { selections.push(id); }, onEmptyClick: () => {},
    onSelectStop: () => {}, onSelectLeg: () => {}, onSelectPlace: (id) => selections.push(id),
  });
  let stopped = 0;
  api.lastMap!.fire("click", { placeId: "ChIJnative", latLng: { lat: () => 27.18, lng: () => 78.01 }, stop: () => stopped++ });
  assert.equal(stopped, 1);
  session.updatePlaces([], "google-poi:ChIJnative", { id: "google-poi:ChIJnative", name: "Selected Google place", category: "see", coordinates: [78.01, 27.18] }, { left: 300 });
  assert.equal(api.markers.filter((marker) => marker.map).length, 1);
  assert.equal((api.markers[0]!.options as { icon: { scaledSize: { width: number } } }).icon.scaledSize.width, 52);
  assert.equal(api.lastMap!.panCalls, 1);
  assert.equal(api.lastMap!.zoomCalls, 0);
  assert.deepEqual(api.lastMap!.lastPanBy, [-150, 0], "selection moves clear of the desktop panel; mobile canvas is already above its sheet");
  api.markers[0]!.fire("click");
  assert.deepEqual(selections, ["ChIJnative", "google-poi:ChIJnative"]);
  session.destroy();
});

test("browser overlays use focusable Morrovia buttons above the Google canvas", () => {
  const api = fakeApi();
  const documentOwner = fakeDocument();
  const pane = { append: (_button: unknown) => {} };
  Object.assign(api, {
    LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } },
    OverlayView: class {
      onAdd?(): void; draw?(): void; onRemove?(): void;
      setMap(map: unknown) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); }
      getPanes() { return { overlayMouseTarget: pane }; }
      getProjection() { return { fromLatLngToDivPixel: (point: { lat: number; lng: number }) => ({ x: point.lng * 10000, y: point.lat * 10000 }) }; }
    },
  });
  const picked: string[] = [];
  const session = createGoogleTripMapSession(api, { ownerDocument: documentOwner, append() {} } as unknown as HTMLElement, {
    stops: [], legs: [], selectedStopId: null, onNativePoi: () => {}, onEmptyClick: () => {},
    onSelectStop: () => {}, onSelectLeg: () => {}, onSelectPlace: (id) => picked.push(id),
  });
  session.updatePlaces([{ id: "ChIJone", name: "Courtyard", category: "see", coordinates: [77.2, 28.6] }], "ChIJone");
  const buttons = documentOwner.elements.filter((element) => element.className.includes("planner-map__place"));
  assert.equal(api.markers.length, 0, "browser result markers use the HTML overlay, not the tiny legacy icon");
  assert.equal(buttons[0]?.type, "button");
  assert.match(buttons[0]?.className ?? "", /planner-map__place--see is-active/);
  buttons[0]?.fire("click");
  assert.deepEqual(picked, ["ChIJone"]);
  documentOwner.activeElement = buttons[0]!;
  session.updatePlaces([{ id: "ChIJone", name: "Courtyard", category: "see", coordinates: [77.2, 28.6] }], "ChIJone");
  assert.equal(documentOwner.activeElement, documentOwner.elements.filter((element) => element.className.includes("planner-map__place")).at(-1), "updating selection retains keyboard focus on the replacement marker");
  session.destroy();
  assert.equal(buttons[0]?.removed, true);
});

test("expanded Google canvas lets wheel and trackpad gestures zoom without a modifier", () => {
  const api = fakeApi();
  createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [], legs: [], selectedStopId: null,
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  assert.equal((api.lastMap!.options as { gestureHandling?: string }).gestureHandling, "greedy");
});

test("hover and keyboard focus on a recommendation pin preview its exact source place", () => {
  const api = fakeApi();
  const documentOwner = fakeDocument();
  const pane = { append: (_button: unknown) => {} };
  Object.assign(api, {
    LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } },
    OverlayView: class {
      onAdd?(): void; draw?(): void; onRemove?(): void;
      setMap(map: unknown) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); }
      getPanes() { return { overlayMouseTarget: pane }; }
      getProjection() { return { fromLatLngToDivPixel: (point: { lat: number; lng: number }) => ({ x: point.lng * 10000, y: point.lat * 10000 }) }; }
    },
  });
  const previews: Array<string | null> = [];
  const session = createGoogleTripMapSession(api, { ownerDocument: documentOwner, append() {} } as unknown as HTMLElement, {
    stops: [], legs: [], selectedStopId: null,
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
    onPreviewPlace: (id) => previews.push(id),
  });
  session.updatePlaces([{ id: "result:stay:stop-1:hotel-exact", sourceId: "hotel-exact", stopId: "stop-1", name: "Exact hotel", category: "stay", coordinates: [77.2, 28.6] }]);
  const pin = documentOwner.elements.find((element) => element.attributes.get("data-google-place-id") === "result:stay:stop-1:hotel-exact");
  assert.ok(pin);
  pin.fire("pointerenter");
  pin.fire("focus");
  pin.fire("pointerleave");
  assert.deepEqual(previews, ["result:stay:stop-1:hotel-exact", "result:stay:stop-1:hotel-exact", null]);
  session.destroy();
});

test("close recommendations stay anchored and expose an overlap-choice list", () => {
  const api = fakeApi();
  const documentOwner = fakeDocument();
  const pane = { append() {} };
  Object.assign(api, {
    LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } },
    OverlayView: class {
      onAdd?(): void; draw?(): void; onRemove?(): void;
      setMap(map: unknown) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); }
      getPanes() { return { overlayMouseTarget: pane }; }
      getProjection() { return { fromLatLngToDivPixel: (point: { lat: number; lng: number }) => ({ x: point.lng * 10000, y: point.lat * 10000 }) }; }
    },
  });
  const session = createGoogleTripMapSession(api, { ownerDocument: documentOwner, append() {} } as unknown as HTMLElement, {
    stops: [], legs: [], selectedStopId: null,
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  session.updatePlaces([
    { id: "place-a", name: "A", category: "see", coordinates: [72.87771, 19.07601] },
    { id: "place-b", name: "B", category: "stay", coordinates: [72.87791, 19.07601] },
  ]);
  const group = documentOwner.elements.find((element) => element.className.includes("planner-map__place-overlap"));
  assert.ok(group);
  assert.deepEqual([group.style.left, group.style.top], ["728777.1px", "190760.1px"], "the overlap control remains anchored to a real member coordinate");
  group.fire("click");
  assert.equal(documentOwner.elements.filter((element) => element.className === "planner-map__place-choices").length, 1);
  assert.deepEqual(documentOwner.elements.filter((element) => element.attributes.has("data-google-place-id")).map((element) => element.attributes.get("data-google-place-id")), ["place-a", "place-b"]);
  session.destroy();
});

test("Google map marker hierarchy keeps canonical route stops above recommendations", () => {
  const api = fakeApi();
  const session = createGoogleTripMapSession(api, {} as HTMLElement, {
    stops: [{ id: "mumbai", name: "Mumbai", coordinates: [72.8777, 19.076] }], legs: [], selectedStopId: "mumbai",
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: () => {}, onSelectLeg: () => {},
  });
  session.updatePlaces([{ id: "hotel", name: "Hotel", category: "stay", coordinates: [72.88, 19.08] }], "hotel");
  const stopOptions = api.markers[0]!.options as { zIndex: number; icon: { url: string } };
  const resultOptions = api.markers[1]!.options as { zIndex: number; icon: { url: string } };
  assert.ok(stopOptions.zIndex > resultOptions.zIndex);
  assert.match(decodeURIComponent(stopOptions.icon.url), /00/);
  assert.match(decodeURIComponent(resultOptions.icon.url), /STAY/);
  session.destroy();
});

test("rendered route hit target wins over an overlapping hotel and selects the exact stop", () => {
  const api = fakeApi();
  const documentOwner = fakeDocument();
  const pickedStops: string[] = [];
  Object.assign(api, {
    LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } },
    OverlayView: class { onAdd?(): void; draw?(): void; onRemove?(): void; setMap(map: unknown) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); } getPanes() { return { overlayMouseTarget: { append() {} } }; } getProjection() { return { fromLatLngToDivPixel: (point: { lat: number; lng: number }) => ({ x: point.lng * 10000, y: point.lat * 10000 }) }; } },
  });
  const coordinate: [number, number] = [77.2, 28.6];
  const session = createGoogleTripMapSession(api, { ownerDocument: documentOwner, append() {} } as unknown as HTMLElement, {
    stops: [{ id: "swakopmund-04", name: "Swakopmund", coordinates: coordinate, sequence: 4 }], legs: [], selectedStopId: "swakopmund-04",
    onNativePoi: () => {}, onEmptyClick: () => {}, onSelectStop: (id) => pickedStops.push(id), onSelectLeg: () => {},
  });
  session.updatePlaces([{ id: "result:stay:swakopmund:artemis", name: "Artemis Hotel", category: "stay", coordinates: coordinate }]);
  const routeHit = documentOwner.elements.find((element) => element.attributes.has("data-google-stop-id"));
  const hotelPin = documentOwner.elements.find((element) => element.attributes.get("data-google-place-id") === "result:stay:swakopmund:artemis");
  assert.ok(routeHit && hotelPin);
  assert.equal(routeHit.style.zIndex, "700");
  assert.equal(hotelPin.style.zIndex, "100");
  routeHit.fire("click");
  assert.deepEqual(pickedStops, ["swakopmund-04"]);
  session.destroy();
});

test("finder result content wraps within its rail and keeps only vertical scrolling", () => {
  const journeyCss = readFileSync(new URL("../app/journey/journey.module.css", import.meta.url), "utf8");
  const refinementCss = readFileSync(new URL("../components/journey-itinerary-refinement.module.css", import.meta.url), "utf8");
  assert.match(journeyCss, /\.shellPlanner \.finderDock\s*\{[^}]*overflow-x:hidden/i);
  assert.match(refinementCss, /\.compact \.places \.placeSelect[^}]*overflow-wrap:anywhere/);
  assert.match(refinementCss, /\.compact \.places article[^}]*min-width:0/);
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

test("canonical route stop coordinates outrank a plan-day activity point", () => {
  assert.deepEqual(canonicalMapStopCoordinates([14.5053, -22.6784], [14.1, -22.2]), [14.5053, -22.6784]);
  assert.deepEqual(canonicalMapStopCoordinates(null, [14.1, -22.2]), [14.1, -22.2]);
  const source = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /canonicalMapStopCoordinates\([\s\S]*?mappedStop\?\.coordinates/);
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
    options: unknown = undefined;
    fire(name: string, event?: unknown) { this.listeners.get(name)?.(event); }
    setOptions(options: Record<string, unknown>) { this.options = { ...(this.options as object), ...options }; }
    addListener(name: string, callback: (event: any) => void) {
      this.listeners.set(name, callback);
      return { remove: () => { this.listeners.delete(name); } };
    }
    setMap(map: unknown) { this.map = map; }
  }
  class FakeMap extends FakeEventTarget {
    zoom = 12;
    centerCalls = 0;
    panCalls = 0;
    zoomCalls = 0;
    lastPanBy: [number, number] | null = null;
    lastPanTo: { lat: number; lng: number } | null = null;
    lastCenter: { lat: number; lng: number } | null = null;
    lastZoom: number | null = null;
    lastBoundsPadding: unknown = undefined;
    boundsCalls: unknown[] = [];
    listenerRemoved = false;
    setCenter(center: { lat: number; lng: number }) { this.centerCalls++; this.lastCenter = center; }
    setZoom(zoom: number) { this.zoomCalls++; this.lastZoom = zoom; this.zoom = zoom; }
    getZoom() { return this.zoom; }
    panTo(center: { lat: number; lng: number }) { this.panCalls++; this.lastPanTo = center; this.lastCenter = center; }
    panBy(x: number, y: number) { this.lastPanBy = [x, y]; }
    setOptions(options: Record<string, unknown>) { this.options = { ...(this.options as object), ...options }; }
    fitBounds(bounds: unknown, padding?: unknown) { this.boundsCalls.push(bounds); this.lastBoundsPadding = padding; }
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
      constructor(_element?: HTMLElement, options?: Record<string, unknown>) { super(); this.options = options; api.mapCreations++; api.lastMap = this; }
    },
    Marker: class extends FakeEventTarget {
      constructor(options: { map: unknown }) { super(); this.map = options.map; this.options = options; api.markers.push(this); }
    },
    Size: class { width: number; height: number; constructor(width: number, height: number) { this.width = width; this.height = height; } },
    Point: class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } },
    Polyline: class extends FakeEventTarget {
      constructor(options: { map: unknown }) { super(); this.map = options.map; this.options = options; api.legLines.push(this); }
    },
  };
  return api as unknown as GoogleTripMapApi & typeof api;
}

function fakeDocument() {
  class FakeElement {
    type = "";
    className = "";
    textContent = "";
    title = "";
    style: Record<string, string> = {};
    removed = false;
    children: FakeElement[] = [];
    attributes = new Map<string, string>();
    classList = { toggle: (name: string, force?: boolean) => { const classes = new Set(this.className.split(/\s+/).filter(Boolean)); if (force) classes.add(name); else classes.delete(name); this.className = [...classes].join(" "); }, contains: (name: string) => this.className.split(/\s+/).includes(name) };
    listeners = new Map<string, (event: { stopPropagation(): void }) => void>();
    append(child: FakeElement) { this.children.push(child); }
    replaceChildren(...children: FakeElement[]) { this.children.forEach((child) => { child.removed = true; }); this.children = children; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    querySelectorAll(selector: string) { return selector === "[data-google-place-id]" ? owner.elements.filter((element) => element.getAttribute("data-google-place-id") !== null && !element.removed) : []; }
    addEventListener(name: string, callback: (event: { stopPropagation(): void }) => void) { this.listeners.set(name, callback); }
    focus() { owner.activeElement = this; }
    fire(name: string) { this.listeners.get(name)?.({ stopPropagation() {} }); }
    remove() { this.removed = true; this.children.forEach((child) => { child.removed = true; }); }
  }
  const owner: { activeElement: FakeElement | null; elements: FakeElement[]; createElement(): FakeElement } = {
    activeElement: null,
    elements: [],
    createElement() { const element = new FakeElement(); owner.elements.push(element); return element; },
  };
  return owner;
}

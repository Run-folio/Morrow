import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE
  ?? `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const enabled = process.env.MORROVIA_MAP_INTERACTION_BROWSER_TESTS === "1";
const chrome = process.env.MORROVIA_CHROMIUM_EXECUTABLE
  ?? (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const adapterSource = ts.transpileModule(readFileSync(new URL("../lib/easyt/google-trip-map-adapter.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(
  'const map_surface_policy_ts_1 = require("./map-surface-policy.ts");',
  'const map_surface_policy_ts_1 = { resolveMapInsets: ({safe, occlusions}) => ({top: occlusions.top ?? safe, right: occlusions.right ?? safe, bottom: occlusions.bottom ?? safe, left: occlusions.left ?? safe}) };',
);

test("production Google canvas route hit targets win browser pointer hits at mobile and desktop widths", { skip: !enabled, timeout: 30_000 }, async () => {
  const { chromium } = require(playwrightPath) as { chromium: { launch(options: Record<string, unknown>): Promise<any> } };
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await page.setContent(`<style>*{box-sizing:border-box}html,body,#map{margin:0;width:100%;height:100%;overflow:hidden}#map{position:relative}.markerPane{position:absolute;inset:0;z-index:100}.overlayMouseTarget{position:absolute;inset:0 auto auto 0;width:100%;height:0;overflow:visible;z-index:106}.planner-map__google-overlays{overflow:hidden}</style><div id="map"><div class="markerPane"></div><div class="overlayMouseTarget"></div></div>`);
      await page.evaluate((source: string) => {
        const module = { exports: {} as Record<string, any> };
        new Function("exports", "require", source)(module.exports, () => { throw new Error("unexpected adapter dependency"); });
        const selections: string[] = [];
        const container = document.querySelector<HTMLElement>("#map")!;
        const pane = document.querySelector<HTMLElement>(".overlayMouseTarget")!;
        const markerPane = document.querySelector<HTMLElement>(".markerPane")!;
        let projectionReady = false;
        let overlay: MockOverlayView | null = null;
        class MockMap {
          listeners = new Map<string, (event: any) => void>();
          zoom = 12;
          element: HTMLElement;
          constructor(element: HTMLElement) { this.element = element; }
          addListener(name: string, callback: (event: any) => void) { this.listeners.set(name, callback); return { remove: () => this.listeners.delete(name) }; }
          setCenter() {}
          setZoom(value: number) { this.zoom = value; }
          getZoom() { return this.zoom; }
          panTo() {}
          panBy() {}
        }
        class MockMarker {
          button: HTMLButtonElement;
          listeners = new Map<string, () => void>();
          constructor(options: { map: MockMap; position: { lat: number; lng: number }; title: string; zIndex: number }) {
            this.button = document.createElement("button");
            this.button.textContent = options.title;
            this.button.setAttribute("aria-label", options.title);
            this.button.dataset.mockRouteMarker = "true";
            this.button.style.cssText = `position:absolute;left:${point(options.position).x}px;top:${point(options.position).y}px;transform:translate(-50%,-50%);width:40px;height:40px;z-index:${options.zIndex};padding:0;border:2px solid #fff;border-radius:50%;background:#17106f;color:#fff`;
            markerPane.append(this.button);
          }
          addListener(name: string, callback: () => void) { this.listeners.set(name, callback); return { remove: () => this.listeners.delete(name) }; }
          setMap(map: unknown) { if (!map) this.button.remove(); }
          setIcon() {}
          setZIndex(value: number) { this.button.style.zIndex = String(value); }
        }
        function point(position: { lat: number; lng: number }) { return { x: container.clientWidth / 2 + (position.lng - 77.2) * 100000, y: container.clientHeight / 2 - (position.lat - 28.6) * 100000 }; }
        class MockOverlayView {
          onAdd?(): void; draw?(): void; onRemove?(): void;
          setMap(map: MockMap | null) { if (map) { overlay = this; this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); }
          getPanes() { return { overlayMouseTarget: pane }; }
          getProjection() { return projectionReady ? { fromLatLngToDivPixel: (value: { lat: number; lng: number }) => point({ lat: value.lat, lng: value.lng }) } : null; }
        }
        const api = { Map: MockMap, Marker: MockMarker, Polyline: class { addListener() { return { remove() {} }; } setMap() {} setOptions() {} }, LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } }, OverlayView: MockOverlayView };
        const stop: [number, number] = [77.2, 28.6];
        const session = module.exports.createGoogleTripMapSession(api, container, {
          stops: [
            { id: "swakopmund-stop-04", name: "Swakopmund", coordinates: stop, sequence: 4 },
            { id: "namibia-stop-05", name: "Namibia Stop", coordinates: [77.201, 28.599], sequence: 5 },
          ],
          legs: [{ id: "leg-swakopmund-namibia", fromStopId: "swakopmund-stop-04", toStopId: "namibia-stop-05", modeLabel: "Drive", durationLabel: "3h 45m" }], selectedStopId: "swakopmund-stop-04", onNativePoi: () => {}, onEmptyClick: () => {},
          onSelectStop: (id: string) => selections.push(`stop:${id}`), onSelectLeg: (id: string) => selections.push(`leg:${id}`),
          onSelectPlace: (id: string) => selections.push(`place:${id}`),
        });
        session.updatePlaces([
          { id: "result:stay:swakopmund:artemis", sourceId: "artemis", stopId: "swakopmund-stop-04", name: "Artemis Hotel", category: "stay", coordinates: stop },
          { id: "result:stay:swakopmund:strand", sourceId: "strand", stopId: "swakopmund-stop-04", name: "Strand Hotel", category: "stay", coordinates: [77.201, 28.601] },
        ]);
        (window as any).__mapTest = { selections, container, pane, resolveProjection: () => { projectionReady = true; overlay?.draw?.(); } };
      }, adapterSource);
      await page.evaluate(() => (window as any).__mapTest.resolveProjection());
      const geometry = await page.evaluate(() => {
        const { container, pane } = (window as any).__mapTest;
        const root = container.querySelector(".planner-map__google-overlays") as HTMLElement;
        const place = root.querySelector("[data-google-place-id='result:stay:swakopmund:strand']") as HTMLElement;
        const rootBox = root.getBoundingClientRect();
        const mapBox = container.getBoundingClientRect();
        const paneBox = pane.getBoundingClientRect();
        return { rootParent: root.parentElement?.id || root.parentElement?.className, root: [rootBox.left, rootBox.top, rootBox.width, rootBox.height], map: [mapBox.left, mapBox.top, mapBox.width, mapBox.height], pane: [paneBox.left, paneBox.top, paneBox.width, paneBox.height], placeExists: Boolean(place) };
      });
      assert.equal(geometry.placeExists, true, `${width}px asynchronous OverlayView projection creates the recommendation pin`);
      assert.equal(geometry.rootParent, "map", `${width}px custom HTML overlays attach to the map viewport, not Google's zero-height overlay pane`);
      assert.deepEqual(geometry.root, geometry.map, `${width}px HTML overlays are clipped to the actual map viewport`);
      const click = await page.evaluate(() => {
        const { container } = (window as any).__mapTest;
        const stop = container.querySelector("[data-google-stop-id='swakopmund-stop-04']") as HTMLElement;
        const box = stop.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y)?.getAttribute("data-google-stop-id");
        return { hit, x, y };
      });
      assert.equal(click.hit, "swakopmund-stop-04", `${width}px hit testing gives the canonical route stop priority over the coincident hotel`);
      await page.mouse.click(click.x, click.y);
      const badge = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".planner-map__google-overlays")!;
        const button = root.querySelector<HTMLElement>("[data-google-leg-id='leg-swakopmund-namibia']")!;
        const box = button.getBoundingClientRect();
        return { id: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.getAttribute("data-google-leg-id"), label: button.textContent, x: box.left + box.width / 2, y: box.top + box.height / 2 };
      });
      assert.equal(badge.id, "leg-swakopmund-namibia", `${width}px transfer badge remains rendered and is the actual pointer hit target`);
      assert.match(badge.label ?? "", /Drive · 3h 45m/);
      await page.mouse.click(badge.x, badge.y);
      const resultClick = await page.evaluate(() => {
        const { container } = (window as any).__mapTest;
        const pin = container.querySelector("[data-google-place-id='result:stay:swakopmund:strand']") as HTMLElement;
        const box = pin.getBoundingClientRect();
        return { id: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.getAttribute("data-google-place-id"), x: box.left + box.width / 2, y: box.top + box.height / 2, size: box.width };
      });
      assert.equal(resultClick.id, "result:stay:swakopmund:strand", `${width}px hit testing reaches the exact Morrovia result pin`);
      assert.ok(resultClick.size >= 44, `${width}px result pin keeps the minimum hit target`);
      await page.mouse.click(resultClick.x, resultClick.y);
      assert.deepEqual(await page.evaluate(() => (window as any).__mapTest.selections), ["stop:swakopmund-stop-04", "leg:leg-swakopmund-namibia", "place:result:stay:swakopmund:strand"]);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

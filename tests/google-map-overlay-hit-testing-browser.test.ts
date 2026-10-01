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
      await page.setContent(`<style>*{box-sizing:border-box}html,body,#map{margin:0;width:100%;height:100%;overflow:hidden}#map{position:relative}</style><div id="map"></div>`);
      await page.evaluate((source: string) => {
        const module = { exports: {} as Record<string, any> };
        new Function("exports", "require", source)(module.exports, () => { throw new Error("unexpected adapter dependency"); });
        const selections: string[] = [];
        const container = document.querySelector<HTMLElement>("#map")!;
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
            options.map.element.append(this.button);
          }
          addListener(name: string, callback: () => void) { this.listeners.set(name, callback); return { remove: () => this.listeners.delete(name) }; }
          setMap(map: unknown) { if (!map) this.button.remove(); }
          setIcon() {}
          setZIndex(value: number) { this.button.style.zIndex = String(value); }
        }
        function point(position: { lat: number; lng: number }) { return { x: container.clientWidth / 2 + (position.lng - 77.2) * 100000, y: container.clientHeight / 2 - (position.lat - 28.6) * 100000 }; }
        class MockOverlayView {
          onAdd?(): void; draw?(): void; onRemove?(): void;
          setMap(map: MockMap | null) { if (map) { this.onAdd?.(); this.draw?.(); } else this.onRemove?.(); }
          getPanes() { return { overlayMouseTarget: container }; }
          getProjection() { return { fromLatLngToDivPixel: (value: { lat: number; lng: number }) => point({ lat: value.lat, lng: value.lng }) }; }
        }
        const api = { Map: MockMap, Marker: MockMarker, Polyline: class { addListener() { return { remove() {} }; } setMap() {} setOptions() {} }, LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; } }, OverlayView: MockOverlayView };
        const stop: [number, number] = [77.2, 28.6];
        const session = module.exports.createGoogleTripMapSession(api, container, {
          stops: [{ id: "swakopmund-stop-04", name: "Swakopmund", coordinates: stop, sequence: 4 }],
          legs: [], selectedStopId: "swakopmund-stop-04", onNativePoi: () => {}, onEmptyClick: () => {},
          onSelectStop: (id: string) => selections.push(`stop:${id}`), onSelectLeg: () => {},
          onSelectPlace: (id: string) => selections.push(`place:${id}`),
        });
        session.updatePlaces([
          { id: "result:stay:swakopmund:artemis", sourceId: "artemis", stopId: "swakopmund-stop-04", name: "Artemis Hotel", category: "stay", coordinates: stop },
          { id: "result:stay:swakopmund:strand", sourceId: "strand", stopId: "swakopmund-stop-04", name: "Strand Hotel", category: "stay", coordinates: [77.201, 28.601] },
        ]);
        (window as any).__mapTest = { selections, container };
      }, adapterSource);
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
      const resultClick = await page.evaluate(() => {
        const { container } = (window as any).__mapTest;
        const pin = container.querySelector("[data-google-place-id='result:stay:swakopmund:strand']") as HTMLElement;
        const box = pin.getBoundingClientRect();
        return { id: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.getAttribute("data-google-place-id"), x: box.left + box.width / 2, y: box.top + box.height / 2, size: box.width };
      });
      assert.equal(resultClick.id, "result:stay:swakopmund:strand", `${width}px hit testing reaches the exact Morrovia result pin`);
      assert.ok(resultClick.size >= 44, `${width}px result pin keeps the minimum hit target`);
      await page.mouse.click(resultClick.x, resultClick.y);
      assert.deepEqual(await page.evaluate(() => (window as any).__mapTest.selections), ["stop:swakopmund-stop-04", "place:result:stay:swakopmund:strand"]);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

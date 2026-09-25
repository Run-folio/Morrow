import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import test from "node:test";
import { mapStopIdAtPoint } from "../lib/easyt/map-spatial-context.ts";

const markerStyles = readFileSync(
  new URL("../components/easyt/morrovia-map-presentation.module.css", import.meta.url),
  "utf8",
).replaceAll(/:global\(([^)]+)\)/g, "$1");

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const runtime = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const systemChrome = process.env.MORROVIA_CHROMIUM_EXECUTABLE
  ?? (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);

type BrowserLike = {
  newContext(options: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
};

async function renderOverlap(browser: BrowserLike, mobile: boolean) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    hasTouch: mobile,
    isMobile: mobile,
  });
  const page = await context.newPage();
  await page.exposeFunction("resolveStopMarker", mapStopIdAtPoint);
  await page.setContent(`
    <style>
      :root {
        --morrovia-ink: #17135f;
        --morrovia-paper: #fff;
        --morrovia-signal: #e7277f;
        --morrovia-map-marker-shadow: 0 2px 8px rgb(0 0 0 / 20%);
        --morrovia-type-metadata: 600 12px sans-serif;
      }
      ${markerStyles}
      .surface { position: relative; width: 320px; height: 240px; }
      .overlap { position: absolute; left: 120px; top: 70px; }
      .competing-stop { left: 136px; top: 75px; }
      .other-stop { position: absolute; left: 250px; top: 20px; }
      .route-line { position: absolute; left: 20px; top: 190px; width: 80px; height: 12px; }
    </style>
    <div class="surface">
      <button class="route-line" aria-label="Inspect route leg London to Tokyo"></button>
      <button class="planner-map__leg is-active overlap" aria-label="Inspect transfer 5: Hirayu to Matsumoto, Road"></button>
      <button class="planner-map__stop overlap" data-stop-id="kanazawa" aria-label="Show Kanazawa, overnight stop 2">2</button>
      <button class="planner-map__stop overlap competing-stop" data-stop-id="matsumoto" aria-label="Show Matsumoto, overnight stop 5">5</button>
      <button class="planner-map__stop other-stop" data-stop-id="tokyo" aria-label="Show Tokyo, overnight stop 1">1</button>
    </div>
    <script>
      window.selections = [];
      function bind(marker, kind, id) {
        const activate = async event => {
          event.stopPropagation();
          if (event.type === "pointerup" || (event.type === "click" && event.detail === 0)) {
            const markers = Array.from(document.querySelectorAll('.planner-map__stop')).map(candidate => {
              const bounds = candidate.getBoundingClientRect();
              return { id: candidate.dataset.stopId, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
            });
            const selectedId = kind === 'stop' && event.type === 'pointerup'
              ? await window.resolveStopMarker(markers, { x: event.clientX, y: event.clientY }, id)
              : id;
            window.selections.push({ kind, id: selectedId, event: event.type });
          }
        };
        marker.addEventListener("pointerup", activate);
        marker.addEventListener("click", activate);
      }
      document.querySelectorAll('.planner-map__stop').forEach(marker => bind(marker, 'stop', marker.dataset.stopId));
      bind(document.querySelector('.planner-map__leg'), 'leg', 'hirayu-matsumoto');
      bind(document.querySelector('.route-line'), 'route', 'london-tokyo');
    </script>
  `);
  return { context, page };
}

test("an overlapping Kanazawa stop owns pointer and touch selection above an active transfer", { timeout: 30_000 }, async () => {
  const { chromium } = require(runtime) as {
    chromium: { launch(options: Record<string, unknown>): Promise<BrowserLike> };
  };
  const browser = await chromium.launch({ headless: true, executablePath: systemChrome });
  try {
    for (const mobile of [false, true]) {
      const view = await renderOverlap(browser, mobile);
      try {
        const stop = view.page.getByRole("button", { name: "Show Kanazawa, overnight stop 2" });
        const box = await stop.boundingBox();
        assert.ok(box);
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        assert.equal(
          await view.page.evaluate(({ x, y }: { x: number; y: number }) => document.elementFromPoint(x, y)?.getAttribute("aria-label"), point),
          "Show Matsumoto, overnight stop 5",
        );

        if (mobile) await view.page.touchscreen.tap(point.x, point.y);
        else await view.page.mouse.click(point.x, point.y);
        await view.page.waitForTimeout(20);
        assert.deepEqual(
          await view.page.evaluate(() => window.selections),
          [{ kind: "stop", id: "kanazawa", event: "pointerup" }],
        );

        await view.page.evaluate(() => { window.selections = []; });
        await stop.focus();
        await view.page.keyboard.press("Enter");
        assert.deepEqual(
          await view.page.evaluate(() => window.selections),
          [{ kind: "stop", id: "kanazawa", event: "click" }],
        );

        await view.page.evaluate(() => { window.selections = []; });
        await view.page.getByRole("button", { name: "Show Tokyo, overnight stop 1" }).click();
        assert.deepEqual(
          await view.page.evaluate(() => window.selections),
          [{ kind: "stop", id: "tokyo", event: "pointerup" }],
        );

        await view.page.evaluate(() => { window.selections = []; });
        await view.page.getByRole("button", { name: "Inspect route leg London to Tokyo" }).click();
        assert.deepEqual(
          await view.page.evaluate(() => window.selections),
          [{ kind: "route", id: "london-tokyo", event: "pointerup" }],
        );
      } finally {
        await view.context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

declare global {
  interface Window {
    selections: Array<{ kind: string; id: string; event: string }>;
  }
}

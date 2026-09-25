import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const playwright = require(`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const dialogCss = readFileSync(new URL("../components/easyt/builder-clarification-dialog.module.css", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../app/journey/easyt-navigation.module.css", import.meta.url), "utf8");
const pageCss = readFileSync(new URL("../app/journey/new/new-trip.module.css", import.meta.url), "utf8");

const tokens = `:root{--morrovia-layer-header:80;--morrovia-layer-modal:200;--morrovia-navigation-height:76px;--morrovia-overlay:rgba(23,16,111,.28);--morrovia-paper:#fff;--morrovia-line:#dedcf1;--morrovia-radius:14px;--morrovia-shadow-overlay:0 28px 80px rgba(23,16,111,.22);--morrovia-ink:#17106f;--morrovia-ink-soft:#514a98;--morrovia-signal:#d01866;--morrovia-meta:monospace;--morrovia-display:Georgia,serif;--morrovia-type-supporting-body:14px/1.45 Arial;--morrovia-mobile-dock-offset:0px}*{box-sizing:border-box}body{margin:0;min-height:1200px}`;

test("Discovery modal owns the layer above fixed global navigation at desktop and mobile viewports", async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 768 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(`<style>${tokens}${navigationCss}${pageCss}${dialogCss}</style>
        <header class="header" data-easyt-app><button type="button">New trip</button></header>
        <main><div class="builderBoundary"><div class="overlay discoveryOverlay">
          <section class="dialog discoveryDialog" role="dialog"><header class="header"><p>2 / 2</p><h2>Explore places</h2><span>Japan</span></header>
            <div class="body" data-discovery-scroll-owner="true">${"<p>Place card content</p>".repeat(60)}</div><footer class="footer"><button type="button">Finish later</button><button type="button">Add places</button></footer>
          </section>
        </div></div></main>`);
      const result = await page.evaluate(() => {
        const appHeader = document.querySelector("[data-easyt-app]") as HTMLElement;
        const dialog = document.querySelector("[role=dialog]") as HTMLElement;
        const body = document.querySelector("[data-discovery-scroll-owner=true]") as HTMLElement;
        const dialogHeader = dialog.querySelector("header") as HTMLElement;
        const footer = dialog.querySelector("footer") as HTMLElement;
        const dialogHeaderRect = dialogHeader.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();
        const hit = document.elementFromPoint(window.innerWidth / 2, dialogHeaderRect.top + 12);
        return {
          headerCovered: Boolean(hit && appHeader.contains(hit)),
          dialogAboveNav: Boolean(hit && dialog.contains(hit)),
          dialogTop: dialogRect.top,
          footerBottom: footerRect.bottom,
          viewportHeight: window.innerHeight,
          owners: document.querySelectorAll("[data-discovery-scroll-owner=true]").length,
          docWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          bodyScrollable: getComputedStyle(body).overflowY === "auto",
        };
      });
      assert.equal(result.headerCovered, false, `${viewport.width}×${viewport.height}: global navigation covers dialog header`);
      assert.equal(result.dialogAboveNav, true, `${viewport.width}×${viewport.height}: dialog is not above navigation`);
      assert.ok(result.dialogTop >= 0, `${viewport.width}×${viewport.height}: dialog clips above viewport`);
      assert.ok(result.footerBottom <= result.viewportHeight, `${viewport.width}×${viewport.height}: footer clips below viewport`);
      assert.equal(result.owners, 1, `${viewport.width}×${viewport.height}: Discovery scroll owner count`);
      assert.equal(result.bodyScrollable, true, `${viewport.width}×${viewport.height}: Discovery body must own scrolling`);
      assert.ok(result.docWidth <= result.viewportWidth, `${viewport.width}×${viewport.height}: horizontal overflow`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

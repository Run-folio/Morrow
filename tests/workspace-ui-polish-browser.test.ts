import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { japanTrip } from "./fixtures/transport-choice.ts";
import { markTransportLegBooked } from "../lib/easyt/transport-booking.ts";

test("English and Spanish booking and route-check pills remain inside the summary at 320px", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const initial = japanTrip();
  const trip = markTransportLegBooked(initial, initial.legs[0].id, { confirmation: "QA-FIXTURE" });
  for (const language of ["en", "es"] as const) {
    const view = await renderBuilder({ path: `/journey/${trip.id}/transport?review=${trip.legs[0].id}`, initialTrip: trip, language, styled: true });
    try {
      await view.page.setViewportSize({ width: 320, height: 900 });
      const card = view.page.locator(`[data-transport-leg-id="${trip.legs[0].id}"]`);
      const summary = card.locator("[data-transport-summary]");
      const summaryText = await summary.innerText();
      assert.ok(summaryText.includes(language === "es" ? "Reservado · marcado por ti" : "Booked · marked by you"), `${language}: ${summaryText}`);
      assert.ok(summaryText.includes(language === "es" ? "Revisar ruta" : "Route check"), `${language}: ${summaryText}`);
      assert.equal(await summary.locator("svg.lucide-chevron-down").count(), 1);
      const row = (await summary.boundingBox())!;
      for (const element of [card.getByText(language === "es" ? "Reservado · marcado por ti" : "Booked · marked by you", { exact: true }), card.getByText(language === "es" ? "Revisar ruta" : "Route check", { exact: true }), summary.locator("svg.lucide-chevron-down")]) {
        const box = (await element.boundingBox())!;
        assert.ok(box.x >= row.x && box.x + box.width <= row.x + row.width, `${language} status and collapse affordance must not be clipped`);
      }
      assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  }
});

test("unbooked transport status has a visible rounded pill container", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip, styled: true });
  try {
    const style = await view.page.getByText("Not booked", { exact: true }).first().evaluate((element: Element) => {
      const css = getComputedStyle(element);
      return { background: css.backgroundColor, border: css.borderTopWidth, radius: Number.parseFloat(css.borderTopLeftRadius) };
    });
    assert.notEqual(style.background, "rgba(0, 0, 0, 0)");
    assert.equal(style.border, "1px");
    assert.ok(style.radius >= 10);
  } finally { await view.close(); }
});

test("corresponding workspace section headings share typography at desktop and mobile sizes", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}`, initialTrip: trip, styled: true });
  try {
    const origin = new URL(view.page.url()).origin;
    for (const width of [1440, 390, 320]) {
      await view.page.setViewportSize({ width, height: 1000 });
      const headings: unknown[] = [];
      for (const [path, name] of [["", "Your route"], ["/itinerary", "Day by day"], ["/transport", "Your connections"]]) {
        await view.page.goto(`${origin}/journey/${trip.id}${path}`);
        const heading = view.page.getByRole("heading", { level: 2, name, exact: true }).first();
        await heading.waitFor();
        headings.push(await heading.evaluate((element: Element) => {
          const css = getComputedStyle(element);
          return { size: css.fontSize, weight: css.fontWeight, family: css.fontFamily, lineHeight: css.lineHeight, spacing: css.letterSpacing };
        }));
        if (process.env.MORROVIA_BROWSER_ARTIFACT_DIR && width !== 320) {
          mkdirSync(process.env.MORROVIA_BROWSER_ARTIFACT_DIR, { recursive: true });
          await view.page.screenshot({ path: `${process.env.MORROVIA_BROWSER_ARTIFACT_DIR}/workspace-${path.slice(1) || "overview"}-${width}.png`, fullPage: false });
        }
        assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (path === "/itinerary") {
          await view.page.getByRole("group", { name: "Itinerary view", exact: true }).getByRole("button", { name: "Calendar", exact: true }).click();
          const calendar = view.page.getByRole("heading", { level: 2, name: "Calendar", exact: true }).first();
          const calendarType = await calendar.evaluate((element: Element) => {
            const css = getComputedStyle(element);
            return { size: css.fontSize, weight: css.fontWeight, family: css.fontFamily, lineHeight: css.lineHeight, spacing: css.letterSpacing };
          });
          assert.deepEqual(calendarType, headings[0], `Calendar matches Overview at ${width}px`);
          assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          if (process.env.MORROVIA_BROWSER_ARTIFACT_DIR && width !== 320) {
            await view.page.screenshot({ path: `${process.env.MORROVIA_BROWSER_ARTIFACT_DIR}/workspace-calendar-${width}.png`, fullPage: false });
          }
        }
      }
      assert.deepEqual(headings[1], headings[0], `Itinerary matches Overview at ${width}px`);
      assert.deepEqual(headings[2], headings[0], `Transport matches Overview at ${width}px`);
    }
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("the transport summary is one full-row native disclosure with a status pill and independent detail actions", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip, styled: true });
  try {
    const card = view.page.locator(`[data-transport-leg-id="${trip.legs[0].id}"]`);
    const summary = card.locator("[data-transport-summary]");
    assert.equal(await summary.count(), 1, "summary has a bounded whole-row target");
    const storageBefore = await view.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    for (const width of [1440, 390, 320]) {
      await view.page.setViewportSize({ width, height: 1000 });
      const trigger = summary.getByRole("button");
      assert.equal(await trigger.count(), 1);
      assert.equal(await trigger.locator("button,a,input,select,textarea").count(), 0, "no nested interactive controls");
      const rowBox = (await summary.boundingBox())!;
      const triggerBox = (await trigger.boundingBox())!;
      assert.ok(Math.abs(rowBox.width - triggerBox.width) < 1 && Math.abs(rowBox.height - triggerBox.height) < 1);
      const pill = summary.getByText("Not booked", { exact: true });
      const pillStyle = await pill.evaluate((element: Element) => { const css = getComputedStyle(element); return { background: css.backgroundColor, border: css.borderTopWidth, radius: Number.parseFloat(css.borderTopLeftRadius) }; });
      assert.notEqual(pillStyle.background, "rgba(0, 0, 0, 0)");
      assert.ok(pillStyle.radius >= 10);
      assert.equal(pillStyle.border, "1px");
      await summary.click({ position: { x: 8, y: 8 } });
      assert.equal(await trigger.getAttribute("aria-expanded"), "true", "the date edge opens the row");
      assert.equal(await summary.locator("svg.lucide-chevron-up").count(), 1);
      const detailsId = await trigger.getAttribute("aria-controls");
      assert.ok(detailsId);
      assert.equal(await view.page.locator(`#${detailsId}`).isVisible(), true);
      await card.getByRole("button", { name: "Journey details", exact: true }).click();
      assert.equal(await trigger.getAttribute("aria-expanded"), "true", "child detail action must not collapse the row");
      if (process.env.MORROVIA_BROWSER_ARTIFACT_DIR && width !== 320) {
        mkdirSync(process.env.MORROVIA_BROWSER_ARTIFACT_DIR, { recursive: true });
        await view.page.screenshot({ path: `${process.env.MORROVIA_BROWSER_ARTIFACT_DIR}/workspace-transport-expanded-${width}.png`, fullPage: false });
      }
      await card.getByRole("button", { name: "Change transport mode", exact: true }).click();
      await view.page.getByRole("dialog", { name: "Change transport", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await trigger.getAttribute("aria-expanded"), "true", "modal action must not toggle the summary");
      await trigger.focus();
      await view.page.keyboard.press("Space");
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
      await view.page.keyboard.press("Enter");
      assert.equal(await trigger.getAttribute("aria-expanded"), "true");
      const pillBox = (await pill.boundingBox())!;
      await summary.click({ position: { x: pillBox.x + pillBox.width / 2 - rowBox.x, y: pillBox.y + pillBox.height / 2 - rowBox.y } });
      assert.equal(await trigger.getAttribute("aria-expanded"), "false", "the status area collapses the row");
      assert.equal(await summary.locator("svg.lucide-chevron-down").count(), 1);
      assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    const storageAfter = await view.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    assert.deepEqual(storageAfter, storageBefore, "disclosure and cancelled modal interactions do not mutate saved trip state");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

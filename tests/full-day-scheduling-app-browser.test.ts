import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { itineraryIdeaForPlace } from "../lib/easyt/itinerary-ideas.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.MORROVIA_BASE_URL;
const provenance = { kind: "live_provider_search" as const, provider: "viator" as const, checkedAt: "2026-10-04T00:00:00.000Z" };

test("browser drag schedules saved short and full-day ideas once and persists after reload", { skip: !base, timeout: 90_000 }, async () => {
  const stop = { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const trip = tripFromBuilder({
    id: "trip-38600000-3860-4860-8860-386000000101", origin: "Tokyo", stops: [stop],
    startDate: "2026-10-04", endDate: "2026-10-06", picks: {}, mustDo: "",
    pace: "slow", hotels: "few", budget: "mid",
    draft: buildCredibleItinerary({ origin: "Tokyo", stops: [stop], startDate: "2026-10-04", allocations: { kyoto: 2 }, picks: {}, places: {} }),
    nightAllocations: { kyoto: 2 },
  });
  const short = itineraryIdeaForPlace({ stopId: "kyoto", reasons: ["destination-significance"], place: {
    id: "short-walk", title: "Saved short walk", area: "Kyoto", type: "Culture", tags: [], description: "A short activity.", coordinates: [135.78, 35.0],
  } });
  const full = {
    ...itineraryIdeaForPlace({ stopId: "kyoto", reasons: ["destination-significance"], place: {
      id: "full-day-tour", title: "Saved full-day tour", area: "Kyoto", type: "Experience", tags: [], description: "An all-day activity.", coordinates: [135.78, 35.0],
    } }),
    providerMetadata: { duration: { fixedMinutes: 600 }, provenance },
    startsAt: "08:00",
  };
  const shortIdea = { ...short, providerMetadata: { duration: { fixedMinutes: 90 }, provenance } };
  const bookedTitle = "Reserved Kyoto tea";
  const bookedIdea = {
    ...itineraryIdeaForPlace({ stopId: "kyoto", reasons: ["destination-significance"], place: {
      id: "booked-tea", title: bookedTitle, area: "Kyoto", type: "Food", tags: ["Food"], description: "A booked tea experience.", coordinates: [135.78, 35.0],
    } }),
    dayId: trip.planItems.find((day) => day.dayNumber === 2)!.id,
    dayPart: "morning" as const,
  };
  const late = {
    ...itineraryIdeaForPlace({ stopId: "kyoto", reasons: ["destination-significance"], place: {
      id: "late-show", title: "Late Kyoto show", area: "Kyoto", type: "Culture", tags: [], description: "A timed evening show.", coordinates: [135.78, 35.0],
    } }),
    providerMetadata: { duration: { fixedMinutes: 90 }, provenance },
    startsAt: "17:00",
  };
  const seeded = {
    ...trip,
    brief: {
      ...trip.brief,
      bookings: [...(trip.brief.bookings ?? []), { id: "booked-tea", type: "reservation" as const, title: bookedTitle, date: "2026-10-05", confirmation: "TEA-1", url: null }],
      itineraryIdeas: [shortIdea, full, late, bookedIdea],
    },
    planItems: trip.planItems.map((day) => day.dayNumber === 2 ? { ...day, notes: [...day.notes, bookedTitle] } : day),
  };
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, seeded, { writeId: "full-day-browser-fixture", now: "2026-10-04T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });
    await page.addInitScript((entries: [string, string][]) => { for (const [key, value] of entries) if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [...values.entries()]);
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const planner = page.getByRole("region", { name: "Day 2 planner" });
    await planner.waitFor({ state: "visible", timeout: 30_000 });
    const morning = planner.locator('section[data-day-part="morning"]');
    const afternoon = planner.locator('section[data-day-part="afternoon"]');
    const evening = planner.locator('section[data-day-part="evening"]');

    await planner.getByText(bookedTitle, { exact: true }).waitFor();
    const bookedRow = planner.locator("article[data-itinerary-activity-id]").filter({ hasText: bookedTitle });
    assert.equal(await bookedRow.locator("[data-itinerary-drag-handle]").count(), 0, "booked activities must not receive a drag handle");
    const shortHandle = page.locator(`[data-itinerary-drag-handle="${shortIdea.id}"]`);
    await shortHandle.dragTo(morning);
    await morning.getByText(shortIdea.title, { exact: true }).waitFor({ timeout: 5000 });
    await page.locator(`[data-itinerary-drag-handle="${full.id}"]`).dragTo(afternoon);
    await planner.locator("[data-full-day-band]").getByText(full.title, { exact: true }).waitFor();
    const overnightTrack = planner.locator("[data-full-day-band]").filter({ hasText: full.title }).locator('[role="img"]');
    assert.match(await overnightTrack.getAttribute("aria-label") ?? "", /Morning, Afternoon, Evening/i);
    assert.deepEqual(await overnightTrack.locator("[data-period-overlap]").allTextContents(), ["Morning", "Afternoon", "Evening"]);
    await page.locator(`[data-itinerary-drag-handle="${late.id}"]`).dragTo(evening);
    await evening.getByText(late.title, { exact: true }).waitFor();
    assert.ok(await page.getByRole("status").filter({ hasText: "These plans overlap." }).count() >= 1, "timed overlap must show a warning");
    assert.equal(await planner.locator("[data-full-day-band]").count(), 1);
    assert.equal(await morning.getByText(shortIdea.title, { exact: true }).count(), 1);

    await planner.locator(`[data-itinerary-drag-handle="${full.id}"]`).dragTo(evening);
    await page.getByRole("status").filter({ hasText: "Full-day" }).waitFor();
    assert.equal(await planner.locator("[data-full-day-band]").getByText(full.title, { exact: true }).count(), 1, "re-dropping the planned full-day item must not duplicate it");
    await planner.locator(`[data-itinerary-drag-handle="${shortIdea.id}"]`).dragTo(evening);
    await evening.getByText(shortIdea.title, { exact: true }).waitFor();

    await page.evaluate((tripId: string) => {
      const storage = Storage.prototype;
      const original = storage.setItem;
      (window as Window & { __restoreTripWrite?: () => void }).__restoreTripWrite = () => { storage.setItem = original; };
      storage.setItem = function (key: string, value: string) {
        if (this === localStorage && key.startsWith("easyt:trip-recovery:v2:") && key.includes(tripId)) throw new Error("synthetic storage failure");
        return original.call(this, key, value);
      };
    }, trip.id);
    await planner.locator(`[data-itinerary-drag-handle="${shortIdea.id}"]`).dragTo(morning);
    await page.waitForTimeout(500);
    assert.equal(await evening.getByText(shortIdea.title, { exact: true }).count(), 1, "failed durable write must roll the activity back to its last saved period");
    assert.equal(await morning.getByText(shortIdea.title, { exact: true }).count(), 0);
    await page.evaluate(() => (window as Window & { __restoreTripWrite?: () => void }).__restoreTripWrite?.());

    const otherDay = trip.planItems.find((day) => day.dayNumber === 1)!;
    const fullDayRow = planner.locator(`[data-itinerary-activity-id="${full.id}"]`);
    await fullDayRow.locator("details summary").click();
    await planner.getByRole("button", { name: "Move to another day" }).click();
    const moveDialog = page.getByRole("dialog", { name: new RegExp(`Move activity: ${full.title}`) });
    await moveDialog.getByLabel("Move to").selectOption(otherDay.id);
    await moveDialog.getByRole("button", { name: "Move activity", exact: true }).click();
    await page.getByLabel("Jump to date / destination").selectOption({ index: 0 });
    await page.getByRole("region", { name: "Day 1 planner" }).locator("[data-full-day-band]").getByText(full.title, { exact: true }).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Jump to date / destination").selectOption({ index: 1 });
    const mobilePlanner = page.getByRole("region", { name: "Day 2 planner" });
    await mobilePlanner.waitFor({ state: "visible" });
    const mobileShortRow = mobilePlanner.locator(`[data-itinerary-activity-id="${shortIdea.id}"]`);
    assert.equal(await mobilePlanner.locator(`[data-itinerary-drag-handle="${shortIdea.id}"]`).isVisible(), false, "mobile hides pointer-only handles");
    await mobileShortRow.locator("details summary").focus();
    await page.keyboard.press("Enter");
    await mobilePlanner.getByLabel(`Part of day: ${shortIdea.title}`).selectOption("morning");
    await mobilePlanner.locator('section[data-day-part="morning"]').getByText(shortIdea.title, { exact: true }).waitFor();

    const entries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
    const persisted = loadTripRecoveryFromStorage({
      get length() { return entries.length; }, key(index: number) { return entries[index]?.[0] ?? null; },
      getItem(key: string) { return entries.find(([storedKey]) => storedKey === key)?.[1] ?? null; }, setItem() {}, removeItem() {},
    }, trip.id, null)?.trip;
    const persistedIdeas = persisted?.brief.itineraryIdeas ?? [];
    assert.equal(persistedIdeas.filter((idea) => idea.id === shortIdea.id).length, 1);
    assert.equal(persistedIdeas.filter((idea) => idea.id === full.id).length, 1);
    assert.equal(persistedIdeas.find((idea) => idea.id === shortIdea.id)?.dayPart, "morning");
    assert.equal(persistedIdeas.find((idea) => idea.id === full.id)?.dayPart ?? null, null);
    assert.equal(persistedIdeas.find((idea) => idea.id === full.id)?.dayId, otherDay.id);
    assert.equal(persistedIdeas.find((idea) => idea.id === late.id)?.dayPart, "evening");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Device changes need review", { exact: true }).waitFor({ timeout: 30_000 });
    const restoredEntries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
    const reloadedTrip = loadTripRecoveryFromStorage({
      get length() { return restoredEntries.length; }, key(index: number) { return restoredEntries[index]?.[0] ?? null; },
      getItem(key: string) { return restoredEntries.find(([storedKey]) => storedKey === key)?.[1] ?? null; }, setItem() {}, removeItem() {},
    }, trip.id, null)?.trip;
    const restoredIdeas = reloadedTrip?.brief.itineraryIdeas ?? [];
    assert.equal(restoredIdeas.filter((idea) => idea.id === shortIdea.id).length, 1);
    assert.equal(restoredIdeas.filter((idea) => idea.id === full.id).length, 1);
    assert.equal(restoredIdeas.find((idea) => idea.id === shortIdea.id)?.dayPart, "morning");
    assert.equal(restoredIdeas.find((idea) => idea.id === full.id)?.dayPart ?? null, null);
    assert.equal(restoredIdeas.find((idea) => idea.id === full.id)?.dayId, otherDay.id);
    assert.equal(restoredIdeas.find((idea) => idea.id === late.id)?.dayPart, "evening");
  } finally { await browser.close(); }
});

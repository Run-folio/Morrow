import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addLocalDays,
  addLocalMonths,
  formatLocalDate,
  localDateParts,
  localMonthDays,
  parseTypedLocalDate,
} from "../lib/easyt/local-date.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("local date helpers preserve calendar dates without UTC conversion", () => {
  assert.deepEqual(localDateParts("2028-02-29"), { year: 2028, month: 2, day: 29 });
  assert.equal(localDateParts("2027-02-29"), null);
  assert.equal(addLocalDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addLocalDays("2026-11-01", 1), "2026-11-02");
  assert.equal(addLocalMonths("2026-12-18", 1), "2027-01-01");
  assert.equal(parseTypedLocalDate("2026-09-24"), "2026-09-24");
  assert.equal(parseTypedLocalDate("09/24/2026"), null);
  assert.match(formatLocalDate("2026-09-24", "en"), /Sep/);
});

test("calendar month grids retain every valid date exactly once", () => {
  const february = localMonthDays("2028-02-14").filter((value): value is string => Boolean(value));
  assert.equal(february.length, 29);
  assert.equal(february[0], "2028-02-01");
  assert.equal(february.at(-1), "2028-02-29");
  assert.equal(new Set(february).size, february.length);
});

test("major planning surfaces use the canonical date and quantity controls", () => {
  const homepage = read("app/journey/home/home-trip-starter.tsx");
  const builder = read("app/journey/new/trip-builder.tsx");
  const tripMode = read("app/journey/trip/trip-mode-client.tsx");

  for (const [surface, source] of [["Homepage", homepage], ["Builder", builder], ["Trip mode", tripMode]] as const) {
    assert.doesNotMatch(source, /type="date"/, `${surface} must not expose browser-native date chrome`);
    assert.match(source, /MorroviaDatePicker/, `${surface} should use the canonical date picker`);
  }
  assert.doesNotMatch(homepage, /type="number"/, "Homepage travellers must not use a number spinner");
  assert.doesNotMatch(builder, /type="number"/, "Builder quantity fields must not use number spinners");
  assert.match(homepage, /MorroviaQuantitySelector/);
  assert.match(builder, /MorroviaQuantitySelector/);

  const picker = read("components/easyt/morrovia-date-picker.tsx");
  assert.match(picker, /aria-modal="true"/);
  assert.match(picker, /trapDialogFocus/);
});

test("canonical control stories cover date, traveller, field, select, button and mobile states", () => {
  const stories = read("components/easyt/morrovia-form-controls.stories.tsx");
  for (const story of [
    "DatePickerSingle",
    "DatePickerRangeSelected",
    "DatePickerDisabledDates",
    "DatePickerKeyboardFocus",
    "DatePickerCompact",
    "DatePickerMobile390",
    "TravellerStates",
    "TravellerMobile390",
    "InputAndSelectStates",
    "ButtonStates",
  ]) assert.match(stories, new RegExp(`export const ${story}`));
});

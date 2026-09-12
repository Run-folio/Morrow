import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const overview = read("components/easyt/trip-overview-workspace.tsx");
const overviewStyles = read("components/easyt/trip-overview-workspace.module.css");
const preparation = read("components/easyt/trip-preparation.tsx");
const preparationStyles = read("components/easyt/trip-preparation.module.css");
const stories = read("components/easyt/trip-overview-workspace.stories.tsx");

test("every readiness category retains one canonical semantic action with a whole-tile target", () => {
  for (const id of ["itinerary", "accommodation", "transport", "passport", "insurance", "connectivity", "checklist"]) {
    assert.match(overview, new RegExp(`category\\.id === "${id}"`));
  }
  for (const label of ["Open itinerary", "View stays", "Review transport/route", "Add details", "Open checklist"]) {
    assert.match(overview, new RegExp(`label: "${label.replace("/", "\\/")}"`));
  }
  assert.match(overview, /<MorroviaAffiliateLink[\s\S]*className=\{className\}[\s\S]*renderAsSurface[\s\S]*>\{content\}/);
  assert.match(overview, /<a className=\{className\} href="#overview-traveller-details"[\s\S]*>\{content\}<\/a>/);
  assert.match(overview, /<Link className=\{className\} href=\{action\.href\}[\s\S]*>\{content\}<\/Link>/);
  assert.match(overviewStyles, /\.progressItemInteractive:focus-visible/);
  assert.doesNotMatch(overviewStyles, /\.progressAction::after/);
  assert.doesNotMatch(overview.match(/const content = <>[\s\S]*?<\/\>;/)?.[0] ?? "", /<(?:a|button|Link|EasyTButton|EasyTLinkButton|MorroviaAffiliateLink)\b/);
});

test("task rows expose their single action across the row without nested controls", () => {
  assert.match(preparation, /const interactive = Boolean\(task\.action\?\.href \|\| task\.action\?\.opensTravellerDetails\)/);
  assert.match(preparation, /<MorroviaAffiliateLink[\s\S]*className=\{className\}[\s\S]*renderAsSurface[\s\S]*>\{content\}/);
  assert.match(preparation, /<a className=\{className\} href="#overview-traveller-details"[\s\S]*>\{content\}<\/a>/);
  assert.match(preparation, /<Link className=\{className\} href=\{action\.href\}[\s\S]*>\{content\}<\/Link>/);
  assert.match(preparationStyles, /\.taskRowInteractive:focus-visible/);
  assert.doesNotMatch(preparationStyles, /\.taskAction::after/);
  assert.doesNotMatch(preparation.match(/const content = <>[\s\S]*?<\/\>;/)?.[0] ?? "", /<(?:a|button|Link|EasyTButton|EasyTLinkButton|MorroviaAffiliateLink)\b/);
});

test("Must do stays open while Good to do uses one accessible disclosure", () => {
  assert.match(overview, /id="overview-must" title="Must do"[\s\S]*tasks=\{mustTasks\}/);
  assert.match(overview, /id="overview-good" title="Good to do"[\s\S]*collapsible defaultOpen=\{initialGoodTasksOpen\}/);
  assert.match(preparation, /<details className=\{styles\.taskDisclosure\} open=\{open\} onToggle=/);
  assert.match(preparation, /<summary aria-expanded=\{open\} aria-controls=\{`\$\{id\}-tasks`\}>/);
  assert.match(preparation, /\{tasks\.length\} outstanding \{tasks\.length === 1 \? "task" : "tasks"\}/);
});

test("NEW10 is resolved once for the Good-to-do context while every Omio row keeps its handoff", () => {
  assert.equal((preparation.match(/<MorroviaPartnerPromotion/g) ?? []).length, 1);
  assert.match(preparation, /tasks\.find\(\(task\) => task\.action\?\.provider === "omio"\)\?\.action/);
  assert.match(preparation, /tasks\.map\(\(task\) => <TripPreparationTaskRow/);
  assert.match(overview, /showPartnerPromotion promotionNow=/);
  assert.match(stories, /initialPrepActions: \[\.\.\.prepActions, \.\.\.omioPrepActions\]/);
});

test("Insurance and connectivity retain canonical state-neutral affiliate boundaries and visible disclosure", () => {
  assert.match(overview, /taskAction\.provider === "world-nomads" \? "travel_insurance"/);
  assert.match(overview, /taskAction\.provider === "saily" \? "connectivity"/);
  assert.match(overview, /affiliateDisclosureForProvider\(insuranceTask\.action\.provider/);
  assert.match(overview, /connectivityTask\?\.action\?\.affiliate \? <small>\{affiliateDisclosure\}<\/small>/);
  assert.match(preparation, /action\.provider === "world-nomads" \|\| action\.provider === "saily"/);
  assert.match(preparation, /category: action\.provider === "world-nomads" \? "travel_insurance" : "connectivity"/);
  assert.doesNotMatch(overview.match(/function ProgressItem[\s\S]*$/)?.[0] ?? "", /setProfile|complete: true|saveTrip|mutate/);
});

test("Storybook covers disclosure, insurance, Omio and responsive review states", () => {
  for (const story of ["InsuranceQuoteHandoff", "BeforeYouGoCollapsed", "BeforeYouGoExpanded", "OmioGoodToDo", "BeforeYouGoMobile390", "Mobile430", "Tablet768", "Desktop1024", "Desktop1440", "Desktop1680"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
});

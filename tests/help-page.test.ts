import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allHelpQuestions, filterHelpTopics, helpTopics } from "../app/journey/help/help-content.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Help exposes the approved topics without restoring a Prep workspace", () => {
  assert.deepEqual(helpTopics.map((topic) => topic.title), [
    "Getting started",
    "Building a trip",
    "Routes & nights",
    "Using the Itinerary",
    "Using the Map",
    "Trip Health",
    "Before you go",
    "Saving & account",
    "Booking links",
    "Passport & travel info",
    "Privacy & analytics",
  ]);

  const beforeYouGo = helpTopics.find((topic) => topic.id === "before-you-go");
  assert.match(beforeYouGo?.questions.map((question) => question.answer.join(" ")).join(" ") ?? "", /Overview/);
  assert.doesNotMatch(beforeYouGo?.questions.map((question) => question.answer.join(" ")).join(" ") ?? "", /open (?:the )?Prep/i);
});

test("Help search matches topic names, question titles and answer text", () => {
  assert.deepEqual(filterHelpTopics(helpTopics, "different route order").map((topic) => topic.id), ["routes-and-nights"]);
  assert.deepEqual(filterHelpTopics(helpTopics, "another device").map((topic) => topic.id), ["saving-and-account"]);
  assert.deepEqual(filterHelpTopics(helpTopics, "affiliate commission").map((topic) => topic.id), ["booking-links"]);
  assert.deepEqual(filterHelpTopics(helpTopics, "cruise loyalty points"), []);
  assert.equal(filterHelpTopics(helpTopics, "").length, helpTopics.length);
});

test("Help copy stays concise, traveller-facing and accurate", () => {
  const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
  const allCopy = helpTopics.map((topic) => [
    topic.title,
    topic.description,
    ...topic.questions.flatMap((question) => [question.title, ...question.answer]),
  ].join(" ")).join(" ");

  for (const topic of helpTopics) {
    assert.ok(topic.questions.length >= 2 && topic.questions.length <= 3, `${topic.title} should expose 2–3 questions`);
    const visibleCopy = [
      topic.description,
      ...topic.questions.flatMap((question) => [question.title, ...question.answer]),
    ].join(" ");
    assert.ok(countWords(visibleCopy) <= 120, `${topic.title} should stay within 120 visible words`);
  }

  assert.ok(countWords(allCopy) < 1100, "the Help library should remain substantially shorter than the 1,619-word baseline");
  assert.equal(allHelpQuestions(helpTopics).length, 32);
  assert.doesNotMatch(allCopy, /CAS|repository|canonical state|provider contracts|mutation|device recovery architecture/i);
  assert.doesNotMatch(allCopy, /—/);

  const passport = helpTopics.find((topic) => topic.id === "passport-and-travel-info");
  assert.equal(passport?.questions.length, 2);
  assert.match(passport?.questions.map((question) => question.answer.join(" ")).join(" ") ?? "", /does not need your passport number or a scan/i);
});

test("Help uses the production shell, canonical controls and real support path", () => {
  const page = read("app/journey/help/page.tsx");
  const client = read("app/journey/help/help-client.tsx");
  const footer = read("components/morrovia-footer.tsx");

  assert.match(page, /<EasyTNavigation landing \/>/);
  assert.doesNotMatch(page, /MorroviaFooter/, "the shared Journey layout remains the sole footer owner");
  assert.match(client, /EasyTField/);
  assert.match(client, /EasyTButton/);
  assert.match(client, /EasyTLinkButton/);
  assert.match(client, /role="search"/);
  assert.match(client, /aria-expanded=\{isOpen\}/);
  assert.match(client, /aria-pressed=\{selected\}/);
  assert.match(client, /<TopicDetail topic=\{selectedTopic\}/);
  assert.doesNotMatch(client, /activateDisclosureFromKeyboard/);
  assert.doesNotMatch(client, /onKeyDown=\{\(event\) => activateDisclosureFromKeyboard/);
  assert.match(client, /event\.key === "Escape"/);
  assert.match(client, /morroviaLegalIdentity\.supportContact/);
  assert.doesNotMatch(client, /mailto:sw@shaunwhiting\.com/,
    "the support address should come from the canonical legal identity");
  assert.equal((client.match(/<Image\b/g) ?? []).length, 1);
  assert.match(footer, /href="\/journey\/help"/);
  assert.doesNotMatch(client, /support@morrovia\.com/);
  assert.doesNotMatch(client, /<(?:button|input)\b/,
    "Help should compose canonical controls rather than page-local native controls");
});

test("Help Storybook coverage includes default, mobile, selected topic, popular disclosure and search states", () => {
  const story = read("app/journey/help/help.stories.tsx");
  for (const state of ["DesktopDefault", "Mobile390Default", "SelectedTopic", "PopularQuestionExpanded", "SearchResults", "NoResults"]) {
    assert.match(story, new RegExp(`export const ${state}`));
  }
  assert.match(story, /morrovia390/);
  assert.match(story, /component: HelpPageStory/);
});

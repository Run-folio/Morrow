import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the About page uses the canonical shell and current workspace language", () => {
  const page = read("app/journey/about/page.tsx");

  assert.match(page, /<EasyTNavigation current="about" landing \/>/);
  assert.match(page, /Travel is complicated\./);
  assert.match(page, /Planning it <em>shouldn’t<\/em> be\./);
  assert.match(page, /One trip, not twenty tabs/);
  assert.match(page, /Finding a flight, a room or a train is the easy part/);
  assert.match(page, /one connected plan you can shape, question and change/);
  assert.match(page, /Designed for real travel/);
  assert.match(page, /From rough idea to a trip that works/);
  assert.match(page, /Realistic travel time/);
  assert.match(page, /Honest uncertainty/);
  assert.match(page, /Traveller control/);
  assert.match(page, /Route planning/);
  assert.match(page, /Smart nights/);
  assert.match(page, /Day-by-day itinerary/);
  assert.match(page, /Before you go/);
  assert.match(page, /href="\/journey\/new"/);
  assert.match(page, /about-hero-multi-stop-journey\.png/);
  assert.match(page, /about-workspace-map-current\.jpg/);
  assert.match(page, /Delhi, Agra and Jaipur/);
  assert.match(page, /about-closing-atlas-journey-v2\.png/);
  assert.match(page, /Your next trip starts with a route you can trust/);
  assert.doesNotMatch(page, /about-workspace-overview\.png/);
  for (const retiredArtwork of [
    "why-fragmented-planning",
    "why-connected-plan",
    "why-traveller-control",
    "capability-route-planning",
    "capability-smart-nights",
    "capability-day-itinerary",
    "capability-before-you-go",
    "about-closing-coastal-journey",
  ]) assert.doesNotMatch(page, new RegExp(retiredArtwork));
  assert.equal(page.match(/<section\b/g)?.length, 5, "the consolidated About story should have five meaningful sections");
  assert.doesNotMatch(page, />Prep</);
  assert.doesNotMatch(page, /MorroviaFooter/,
    "the shared Journey layout should remain the sole footer owner");
});

test("meaningful About copy uses the canonical readable typography roles", () => {
  const styles = read("app/journey/about/about.module.css");

  assert.match(styles, /\.heroLede\{[^}]*font:var\(--morrovia-type-body\)/);
  assert.match(styles, /\.whyNarrative p\{[^}]*font:var\(--morrovia-type-body\)/);
  assert.match(styles, /\.travellerGrid p,\.capabilityList p\{[^}]*font:var\(--morrovia-type-body\)/);
  assert.match(styles, /\.productPreview figcaption\{[^}]*font:var\(--morrovia-type-fine-print\)/);
});

test("public navigation and the canonical footer link to About", () => {
  const navigation = read("app/journey/easyt-navigation.tsx");
  const footer = read("components/morrovia-footer.tsx");
  const navigationStyles = read("app/journey/easyt-navigation.module.css");

  assert.match(navigation, /href="\/journey\/about" aria-current=\{current === "about" \? "page" : undefined\}/);
  assert.match(navigationStyles, /\.landingActions > a\[aria-current="page"\]/);
  assert.match(footer, /<Link href="\/journey\/about">\{text\.about\}<\/Link>/);
  assert.match(footer, /<Link href="\/journey\/help">\{text\.help\}<\/Link>/,
    "the canonical footer should link to the real Help route");
});

test("the About composition has production Storybook coverage at representative widths", () => {
  const story = read("app/journey/about/about.stories.tsx");

  assert.match(story, /component: AboutPage/);
  assert.match(story, /nextjs: \{ appDirectory: true, navigation: \{ pathname: "\/journey\/about" \} \}/);
  assert.match(story, /export const Desktop/);
  for (const marker of ["Mobile320", "Mobile390", "Mobile430", "Tablet768", "Desktop1024", "Desktop1440", "Desktop1680"]) {
    assert.match(story, new RegExp(`export const ${marker}`));
  }
  for (const viewport of [320, 390, 430, 768, 1024, 1440, 1680]) assert.match(story, new RegExp(`morrovia${viewport}`));
});

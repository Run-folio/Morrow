import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("global desktop and compact navigation consolidate About and the existing Tour action", () => {
  const navigation = read("app/journey/easyt-navigation.tsx");
  const tour = read("components/easyt/easyt-product-tour.tsx");

  assert.doesNotMatch(navigation, /href="\/journey\/home#how-it-works"/);
  assert.match(navigation, /const howItWorksLabel = language === "es" \? "Cómo funciona" : "How it works"/);
  assert.equal((navigation.match(/href="\/journey\/about"/g) ?? []).length, 2, "desktop and compact navigation each include one About route");
  assert.equal((navigation.match(/<EasyTProductTour triggerLabel=\{howItWorksLabel\} dispatchOpen/g) ?? []).length, 2, "desktop and compact navigation each reuse the Tour action once");

  const desktopOrder = navigation.indexOf('href="/journey/new"');
  const about = navigation.indexOf('href="/journey/about"');
  const routes = navigation.indexOf('href="/journey/discover"');
  const passport = navigation.indexOf('href="/journey/passport"');
  const howItWorks = navigation.indexOf('<EasyTProductTour triggerLabel={howItWorksLabel} dispatchOpen />');
  assert.ok(desktopOrder < about && about < routes && routes < passport && passport < howItWorks);

  assert.match(tour, /PRODUCT_TOUR_OPEN_EVENT/);
  assert.match(tour, /returnFocusRef/);
  assert.match(tour, /dispatchOpen\) \{ window\.dispatchEvent\(new Event\(PRODUCT_TOUR_OPEN_EVENT\)\); return; \}/);
});

test("the homepage process section and its in-content Discover link remain intact", () => {
  const proof = read("app/journey/home/home-proof.tsx");
  const discovery = read("app/journey/discover/page.tsx");

  assert.match(proof, /id="how-it-works"/);
  assert.match(proof, /A clearer path from idea to itinerary/);
  assert.match(discovery, /href="\/journey\/home#how-it-works"/);
});

test("the navigation Storybook fixture exercises the App Router and active About state", () => {
  const story = read("app/journey/easyt-navigation.stories.tsx");

  assert.match(story, /appDirectory: true/);
  assert.match(story, /pathname: "\/journey\/about"/);
  assert.match(story, /export const AboutActive: Story = \{ args: \{ current: "about" \} \}/);
});

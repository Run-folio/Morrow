import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("the canonical typography foundation separates readable prose from compact roles", () => {
  const foundation = read("app/journey/journey-design.css");
  for (const role of ["body", "supporting-body", "control", "metadata", "eyebrow", "fine-print"]) {
    assert.match(foundation, new RegExp(`--morrovia-type-${role}:`), role);
  }

  const story = read("components/easyt/storybook/morrovia-storybook-catalogue.tsx");
  for (const role of ["Display", "Page heading", "Section heading", "Body", "Supporting body", "Control", "Metadata", "Eyebrow", "Fine print / provenance"]) {
    assert.match(story, new RegExp(`\\[\\"${role}\\"`), role);
  }
});

test("Route Detail explanatory content consumes readable semantic roles", () => {
  const css = read("app/journey/routes/[slug]/route-overview.module.css");
  for (const selector of [
    ".heroSummary",
    ".mapNote",
    ".glanceList dd",
    ".whyPanel li",
    ".warningPanel li",
    ".stopCopy p",
    ".itineraryList li > p",
    ".notesGrid p",
    ".finalCta > ul li",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*var\\(--morrovia-type-(?:body|supporting-body)\\)`, "s"), selector);
  }

  for (const selector of [".provenance > div:first-child", ".sourceLinks small"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*var\\(--morrovia-type-fine-print\\)`, "s"), selector);
  }
});

test("shared feedback, loading and Trip Health explanations use supporting body copy", () => {
  const feedback = read("components/easyt/morrovia-feedback.module.css");
  const loading = read("components/easyt/morrovia-loading-states.module.css");
  const health = read("components/journey-trip-quality.module.css");

  for (const marker of [".contextualDisclosurePanel > p", ".statusBanner span", ".recovery p", ".dialog ul"]) {
    assert.match(feedback, new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^}]*--morrovia-type-supporting-body`, "s"), marker);
  }
  for (const marker of [".sectionStatus p", ".planningCopy > span", ".mapStatus p"]) {
    assert.match(loading, new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^}]*--morrovia-type-supporting-body`, "s"), marker);
  }
  assert.match(health, /\.list p[^}]*--morrovia-type-supporting-body/);
});

test("small controls and commercial disclosures remain readable", () => {
  const controls = read("components/easyt/easyt-controls.module.css");
  const small = controls.match(/\.small\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(small, /font-size/, "small buttons inherit the canonical 13px control role");

  const capture = read("components/easyt/morrovia-trip-capture.module.css");
  assert.doesNotMatch(capture, /\.interestPanel button\s*\{[^}]*font-size/);
  assert.doesNotMatch(capture, /\.actionCluster > div:first-child > button\s*\{[^}]*font-size/);

  for (const path of [
    "components/easyt/trip-preparation.module.css",
    "components/easyt/trip-overview-workspace.module.css",
    "components/easyt/trip-itinerary-workspace.module.css",
    "components/journey-itinerary-accommodation.module.css",
  ]) {
    assert.match(read(path), /--morrovia-type-fine-print/, path);
  }
});

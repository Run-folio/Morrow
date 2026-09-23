import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every production JourneyPlannerMap owner declares its interaction job", () => {
  const builder = source("../app/journey/new/trip-builder-route-workspace.tsx");
  const overview = source("../components/easyt/trip-overview-workspace.tsx");
  const dashboard = source("../app/journey/dashboard/dashboard-client.tsx");
  const demo = source("../app/journey/home/immersive/demo-map.tsx");
  const stay = source("../components/easyt/trip-stay-workspace.tsx");
  const itinerary = source("../components/easyt/trip-itinerary-workspace.tsx");
  const mapWorkspace = source("../components/easyt/trip-map-workspace.tsx");
  const transport = source("../components/easyt/trip-transport-workspace.tsx");
  const planNext = source("../app/journey/plan-next/map-plan-next.tsx");

  assert.match(builder, /surface=\{\{ variant: "preview" \}\}/);
  assert.match(overview, /surface=\{\{ variant: "preview" \}\}/);
  assert.match(dashboard, /surface=\{\{ variant: "preview" \}\}/);
  assert.match(demo, /surface=\{\{ variant: "preview" \}\}/);
  assert.match(stay, /surface=\{\{ variant: "embedded", interaction: "selection-only" \}\}/);
  assert.match(itinerary, /surface=\{\{ variant: "embedded", interaction: "selection-only" \}\}/);
  assert.match(mapWorkspace, /surface=\{\{ variant: "workspace" \}\}/);
  assert.match(transport, /surface=\{\{ variant: "workspace" \}\}/);
  assert.match(planNext, /surface=\{\{ variant: "workspace" \}\}/);
});

test("legacy preview booleans and viewport camera branching leave production owners", () => {
  const map = source("../components/journey-planner-map.tsx");
  assert.doesNotMatch(map, /previewMode/);
  assert.doesNotMatch(map, /overviewPadding/);
  assert.doesNotMatch(map, /window\.innerWidth/);
  assert.match(map, /resolveMapSurfacePolicy\(surface\)/);
  assert.match(map, /resolveMapInsets\(/);
});

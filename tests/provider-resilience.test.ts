import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { withProviderTimeout } from "../lib/easyt/provider-timeout.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("provider timeout aborts cooperative work and rejects a provider that never settles", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    withProviderTimeout({
      label: "Fixture provider",
      timeoutMs: 5,
      request: async (requestSignal) => {
        signal = requestSignal;
        return new Promise<never>(() => undefined);
      },
    }),
    (error: unknown) => error instanceof Error && error.name === "TimeoutError" && error.message === "Fixture provider timed out.",
  );
  assert.equal(signal?.aborted, true);
  assert.equal((signal?.reason as Error | undefined)?.name, "TimeoutError");
});

test("provider timeout cleanup prevents a completed request from being aborted later", async () => {
  let signal: AbortSignal | undefined;
  const result = await withProviderTimeout({
    label: "Fast fixture provider",
    timeoutMs: 10,
    request: async (requestSignal) => {
      signal = requestSignal;
      return "useful result";
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(result, "useful result");
  assert.equal(signal?.aborted, false);
});

test("all newly identified provider boundaries are finite and keep failures local", () => {
  const place = source("app/api/journey-place/route.ts");
  const discover = source("app/api/journey-discover/route.ts");
  const weather = source("components/journey-weather.tsx");
  const copilot = source("lib/easyt/trip-copilot.server.ts");
  const email = source("lib/easyt/email.ts");

  assert.match(place, /WIKIPEDIA_TIMEOUT_MS = 5_000/);
  assert.equal((place.match(/signal: AbortSignal\.timeout\(WIKIPEDIA_TIMEOUT_MS\)/g) ?? []).length, 3);
  assert.match(place, /if \(!summary && !image\) return NextResponse\.json\(\{ place: null \}\)/);
  assert.match(discover, /WIKIPEDIA_DISCOVERY_TIMEOUT_MS = 6_000/);
  assert.match(discover, /signal: AbortSignal\.timeout\(WIKIPEDIA_DISCOVERY_TIMEOUT_MS\)/);
  assert.match(discover, /return NextResponse\.json\(\{ places: \[\] \}\)/);
  assert.match(weather, /WEATHER_TIMEOUT_MS = 6_000/);
  assert.match(weather, /signal: controller\.signal/);
  assert.match(weather, /window\.clearTimeout\(timeout\)/);
  assert.match(weather, /if \(active\) setFailed\(true\)/);
  assert.match(copilot, /TRIP_COPILOT_PROVIDER_TIMEOUT_MS = 12_000/);
  assert.match(copilot, /withProviderTimeout\(\{/);
  assert.match(email, /EMAIL_PROVIDER_TIMEOUT_MS = 8_000/);
  assert.match(email, /signal: AbortSignal\.timeout\(EMAIL_PROVIDER_TIMEOUT_MS\)/);
  assert.doesNotMatch(email, /throw new Error\(`Email delivery failed/);
});

test("changing client queries cancel or retire stale responses and retry preserves useful discovery data", () => {
  const refinement = source("components/journey-itinerary-refinement.tsx");
  const itinerary = source("components/easyt/trip-itinerary-workspace.tsx");
  const overview = source("components/easyt/trip-overview-workspace.tsx");
  const map = source("components/journey-map-planner-workspace.tsx");

  assert.match(refinement, /if \(!retryingCurrentStop\) setPlaces\(\[\]\)/);
  assert.match(refinement, /if \(!active \|\| .*AbortError/);
  assert.match(refinement, /return \(\) => \{ active = false; controller\.abort\(\); \}/);
  assert.match(itinerary, /scope\.commit\(\(\) =>/);
  assert.match(itinerary, /scope\.isCancellation\(caught\)/);
  assert.match(overview, /createAbortableEffectScope\("Overview place image request"\)/);
  assert.match(map, /if \(!active\) return;[\s\S]*setPlaceMedia/);
});

test("remote legacy image consumers use the canonical resilient image with honest fallbacks", () => {
  const consumers = [
    "app/journey/new/trip-builder.tsx",
    "components/easyt/trip-itinerary-workspace.tsx",
    "components/easyt/trip-shell-client.tsx",
    "components/journey-carousel.tsx",
    "components/journey-globe.tsx",
    "components/journey-itinerary-refinement.tsx",
    "components/journey-map-planner-workspace.tsx",
    "components/journey-planner-strip.tsx",
  ];
  for (const consumer of consumers) {
    assert.match(source(consumer), /ResilientImage/, `${consumer} should use ResilientImage`);
  }

  const resilient = source("components/easyt/resilient-image.tsx");
  assert.match(resilient, /if \(!src \|\| failed\) return <>\{fallback\}<\/>/);
  assert.match(resilient, /setFailed\(!src\)/);
  assert.match(resilient, /setFailed\(true\)/);
  assert.match(source("components/easyt/trip-itinerary-workspace.tsx"), /aria-label=\{`Image unavailable for \$\{day\.title\}`\}/);
  assert.match(source("components/journey-map-planner-workspace.tsx"), /selectedDestinationMedia\?\.sourceUrl && selectedDestinationMedia\.sourceLabel/);
});

test("fallback media slots retain responsive dimensions at phone, tablet, and desktop widths", () => {
  const refinementStyles = source("components/journey-itinerary-refinement.module.css");
  const itineraryStyles = source("components/easyt/trip-itinerary-workspace.module.css");
  const mapStyles = source("app/journey/journey.module.css");
  const itineraryStories = source("components/easyt/trip-itinerary-workspace.stories.tsx");

  assert.match(refinementStyles, /@media\(max-width:390px\)/);
  assert.match(refinementStyles, /\.placeImage,.placeImageFallback\{width:48px;height:42px\}/);
  assert.match(itineraryStyles, /\.dayImage > \.dayImageFallback \{[\s\S]*width: 100%;[\s\S]*height: 100%/);
  assert.match(mapStyles, /\.mapDestinationImageFallback\{/);
  for (const story of ["LongContentMobile320", "LongContentMobile390", "LongContentTablet768", "LongContentDesktop1440"]) {
    assert.match(itineraryStories, new RegExp(`export const ${story}`));
  }
});

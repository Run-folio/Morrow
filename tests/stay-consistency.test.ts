import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decodeGooglePhotoAttributions,
  encodeGooglePhotoAttributions,
  exactGooglePhotoResource,
  safeGooglePhotoAttributions,
  validGooglePlaceId,
} from "../lib/easyt/google-place-photo.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stay = source("components/easyt/trip-stay-workspace.tsx");
const stayStyles = source("components/easyt/trip-stay-workspace.module.css");
const explore = source("components/easyt/trip-explore-workspace.tsx");
const map = source("components/journey-map-planner-workspace.tsx");
const routeTrack = source("components/journey-planner-strip.tsx");
const routeTrackStyles = source("components/journey-planner-strip.module.css");
const photoRoute = source("app/api/journey-place-photo/route.ts");
const photoClient = source("components/easyt/journey-local-place-photo.tsx");
const localSearch = source("app/api/journey-local-search/route.ts");
const bookingSearch = source("app/api/journey-accommodation-search/route.ts");
const finder = source("components/journey-local-finder.tsx");
const stories = source("components/easyt/trip-stay-workspace.stories.tsx");
const routeStories = source("components/journey-planner-strip.stories.tsx");

test("normal Stay results use one direct heading and remove the former explanatory hierarchy", () => {
  assert.match(stay, /Where to stay in \{context\.stop\.name\}/);
  for (const removed of [
    /Where should you stay/,
    /Compare a small set of mapped options/,
    />SHORTLIST</,
    /Useful options for/,
    /options<\/span>/,
    /Mapped stays are ready/,
    /STAY DECISION/,
    /Choose an option to compare/,
    /Property detail will explain/,
  ]) assert.doesNotMatch(stay, removed);
  assert.match(stay, /finder\.status === "loading"/);
  assert.match(stay, /finder\.status === "failed"/);
  assert.match(stay, /finder\.status === "empty"/);
});

test("property detail and Choose stay are distinct semantic buttons using canonical mutation", () => {
  assert.match(stay, /<article key=\{place\.id\}/);
  assert.match(stay, /<EasyTButton type="button" className=\{styles\.cardOpen\}[\s\S]*aria-label=\{`Open details for/);
  assert.match(stay, /className=\{styles\.cardActions\}[\s\S]*Choose stay/);
  assert.match(stay, /selectMappedStayForStop\(current, context\.stop\.id, place\)/);
  assert.match(stay, /removeMappedStayForStop\(current, context\.stop\.id, selected\)/);
  assert.match(stay, /\{isChosen \? "Chosen" : "Choose stay"\}/);
  assert.match(stay, /Chosen for this stop/);
  assert.doesNotMatch(stay, />Book<|>Reserve<|>Confirmed</);
  assert.match(stayStyles, /\.cardOpen[\s\S]*position: absolute;[\s\S]*z-index: 1;/);
  assert.match(stayStyles, /\.cardActions[\s\S]*z-index: 2;/);
});

test("Stay map is a projection of the current finder shortlist with one selection owner", () => {
  assert.match(stay, /finder\.candidates\.map\(\(place\) => mapResultForLocalPlace/);
  assert.match(stay, /mapResults=\{mapResults\}/);
  assert.match(stay, /selectedMapResult=\{selectedMapResult\}/);
  assert.match(stay, /onMapResultSelect=\{\(result\)/);
  assert.match(stay, /const place = finder\.candidates\.find\(\(candidate\) => candidate\.id === result\.sourceId\)/);
  assert.match(stay, /if \(place\) selectPlace\(place\)/);
  assert.equal((stay.match(/<JourneyLocalFinder/g) ?? []).length, 1, "the mini-map must not start another finder");
  assert.doesNotMatch(photoClient, /journey-local-search|journey-accommodation-search/);
});

test("Open full map preserves exact stop and property handoff identity", () => {
  assert.match(stay, /mapResultSelectionId\("stay", place\.id, context\.stop\.id\)/);
  assert.match(stay, /mapResultHandoffForLocalPlace\(place, "stay", context\.stop\.id, mapDayNumber, selectionId\)/);
  assert.match(stay, /<EasyTLinkButton href=\{fullMapHref\(selected\)\}[\s\S]*>Open full map<\/EasyTLinkButton>/);
});

test("Map, Explore, and Stay share JourneyRouteStopTrack while keeping workspace semantics local", () => {
  assert.match(routeTrack, /export function JourneyRouteStopTrack/);
  assert.match(routeTrack, /<JourneyRouteStopTrack/);
  assert.match(map, /<JourneyPlannerStrip/);
  assert.match(explore, /<JourneyRouteStopTrack/);
  assert.match(stay, /<JourneyRouteStopTrack/);
  assert.match(routeTrackStyles, /\.stopTrackIntegrated \.stopActive/);
  assert.match(routeTrackStyles, /\.stopTrackStandalone/);
  assert.match(routeTrack, /active\.scrollIntoView/);
  assert.doesNotMatch(explore, />Open map<\/EasyTLinkButton>/);
  assert.match(routeTrack, />Whole route<\/button>/);
  assert.match(map, /Fullscreen map/);
  assert.doesNotMatch(stay, /routeTimelineScopeId|scopeId: "all"/);
});

test("Google photo helpers bind a photo resource to the exact provider place", () => {
  const placeId = "ChIJexactPlace_123";
  assert.equal(validGooglePlaceId(placeId), true);
  assert.equal(exactGooglePhotoResource(placeId, `places/${placeId}/photos/photo_456`), `places/${placeId}/photos/photo_456`);
  assert.equal(exactGooglePhotoResource(placeId, "places/ChIJdifferent/photos/photo_456"), null);
  assert.equal(exactGooglePhotoResource(placeId, "https://attacker.example/photo"), null);
  assert.equal(validGooglePlaceId("../../secret"), false);
});

test("Google photo attribution is bounded, sanitized, and round-trips through an HTTP-safe header", () => {
  const attributions = safeGooglePhotoAttributions([
    { displayName: "Place owner", uri: "https://maps.google.com/profile" },
    { displayName: "Unsafe link", uri: "javascript:alert(1)" },
    { displayName: "" },
  ]);
  assert.deepEqual(attributions, [
    { displayName: "Place owner", uri: "https://maps.google.com/profile" },
    { displayName: "Unsafe link" },
  ]);
  assert.deepEqual(decodeGooglePhotoAttributions(encodeGooglePhotoAttributions(attributions)), attributions);
  assert.deepEqual(decodeGooglePhotoAttributions("malformed"), []);
});

test("Google photo retrieval is server-side, no-store, bounded, and outside first-useful search", () => {
  assert.match(localSearch, /providerProductId: place\.id/);
  assert.doesNotMatch(localSearch, /places\.photos|journey-place-photo/);
  assert.match(photoRoute, /process\.env\.GOOGLE_PLACES_API_KEY/);
  assert.match(photoRoute, /X-Goog-Api-Key/);
  assert.match(photoRoute, /X-Goog-FieldMask": "id,photos"/);
  assert.match(photoRoute, /cache: "no-store"/);
  assert.match(photoRoute, /AbortSignal\.timeout\(5000\)/);
  assert.match(photoRoute, /maxWidthPx=960&maxHeightPx=640/);
  assert.match(photoRoute, /Cache-Control": "private, no-store"/);
  assert.doesNotMatch(photoRoute, /\?key=|NEXT_PUBLIC_GOOGLE|photoUri/);
  assert.match(photoClient, /\.slice\(0, 6\)/);
  assert.match(photoClient, /place\.provider === "google-places"/);
  assert.match(photoClient, /URL\.createObjectURL/);
  assert.match(photoClient, /URL\.revokeObjectURL/);
  assert.doesNotMatch(finder, /journey-place-photo/);
});

test("image fallbacks and provider boundaries never borrow unrelated hotel media", () => {
  assert.match(stay, /No sourced property image/);
  assert.match(photoClient, /place\.provider === "google-places"/);
  assert.match(photoClient, /placeId: place\.providerProductId/);
  assert.doesNotMatch(photoClient, /URLSearchParams\(\{[^}]*place\.name|URLSearchParams\(\{[^}]*city/);
  assert.doesNotMatch(bookingSearch, /image\??:|images\??:|photo/);
  assert.match(stories, /BookingOnlyNoImageProperty/);
  assert.match(stories, /MultipleSameNameProperties/);
});

test("chosen mismatch and compact card copy remain truthful", () => {
  assert.match(stay, /title=\{`Saved stay: \$\{booking\.title\}`\}/);
  assert.match(stay, /detail="Not in the current shortlist\."/);
  assert.doesNotMatch(stay, /saved stay remains canonical/);
  assert.doesNotMatch(stay, /OpenStreetMap/);
  assert.match(stay, /Availability to check/);
  assert.match(stay, /stayCandidateFit\(place, context\)/);
});

test("responsive stories and styles cover the required route-track and Stay matrix", () => {
  for (const story of ["StayWithImages", "StayWithoutImages", "ChosenStay", "SavedStayNotInShortlist", "SelectedPropertyWithMiniMap", "MultipleSameNameProperties", "BookingEnrichedMappedProperty", "BookingOnlyNoImageProperty"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  for (const story of ["MapVariant", "ExploreVariant", "StayVariant", "Mobile320", "Mobile390", "Mobile430", "Tablet768", "Desktop1440"]) {
    assert.match(routeStories, new RegExp(`export const ${story}`));
  }
  assert.match(stayStyles, /@media \(max-width: 900px\)[\s\S]*\.layout \{ display: block;/);
  assert.match(stayStyles, /@media \(max-width: 620px\)[\s\S]*\.card \{ display: flex;/);
  assert.match(routeTrackStyles, /overflow-x:auto/);
});

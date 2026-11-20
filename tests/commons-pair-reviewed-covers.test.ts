import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { itineraryDestinationPhotos, routeDestinationPhoto, routePhotoAssetIdentity, routePhotoForSource } from "../lib/easyt/route-images.ts";
import { routeStopPhoto } from "../lib/easyt/route-stop-photography.ts";

const expected = [
  { place: "Madrid", country: "Spain", route: "spain-rail", file: "Gran_Vía_+_Metrópolis_(13875993993).jpg", author: "Álvaro Ibáñez", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/" },
  { place: "Taichung", country: "Taiwan", route: "taiwan-rail", file: "Taichung_Park,_Aug_2024_(1).jpg", author: "Ralff Nestor Nacor", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
];

for (const {place, country, route, file, author, license, licenseUrl} of expected) test(`${place} has one exact reviewed scene across responsive widths`, () => {
  const photo = routeDestinationPhoto(place, country);
  assert.ok(photo, `exact reviewed ${place} cover`);
  assert.equal(routeStopPhoto({key: route}, {name: place, country}), photo);
  assert.equal(routeDestinationPhoto(place, "Canada"), null);
  assert.equal(photo.author, author);
  assert.equal(photo.license, license);
  assert.equal(photo.licenseUrl, licenseUrl);
  const source = new URL(photo.sourceUrl);
  assert.equal(source.hostname, "commons.wikimedia.org");
  assert.equal(decodeURIComponent(source.pathname), `/wiki/File:${file}`);
  assert.match(photo.changes, /cropped/i);
  const credits = readFileSync("public/journey/immersive/credits.html", "utf8");
  assert.ok(credits.includes(`id="${photo.key}"`));
  assert.deepEqual(itineraryDestinationPhotos(place, country), [photo]);
  assert.deepEqual(photo.variants.map(v => v.width), [384, 768, 1280]);
  for (const variant of photo.variants) {
    const resolved = routePhotoForSource(variant.src);
    assert.ok(resolved);
    assert.equal(routePhotoAssetIdentity(resolved), routePhotoAssetIdentity(photo));
    assert.equal(statSync(`public${variant.src}`).size, variant.bytes);
  }
});

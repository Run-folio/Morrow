import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { itineraryDestinationPhotos, routeDestinationPhoto, routePhotoAssetIdentity, routePhotoForSource } from "../lib/easyt/route-images.ts";
import { routeStopPhoto } from "../lib/easyt/route-stop-photography.ts";

test("Moab gets one reviewed downtown scene with credit and one identity across responsive widths", () => {
  const photo = routeDestinationPhoto("Moab", "United States");
  assert.ok(photo, "exact reviewed Moab cover");
  assert.equal(routeStopPhoto({ key: "usa-southwest" }, { name: "Moab", country: "United States" }), photo);
  assert.equal(routeDestinationPhoto("Moab", "Canada"), null);
  assert.equal(photo.author, "Quintin Soloviev");
  assert.equal(photo.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
  assert.match(photo.sourceUrl, /Moab,_Utah_downtown\.jpg$/);
  assert.match(photo.changes, /cropped/i);
  const credits = readFileSync("public/journey/immersive/credits.html", "utf8");
  assert.ok(credits.includes(`id="${photo.key}"`));
  assert.deepEqual(itineraryDestinationPhotos("Moab", "United States"), [photo]);
  assert.deepEqual(photo.variants.map(v => v.width), [384, 768, 1280]);
  for (const variant of photo.variants) {
    const resolved = routePhotoForSource(variant.src);
    assert.ok(resolved);
    assert.equal(routePhotoAssetIdentity(resolved), routePhotoAssetIdentity(photo));
    assert.equal(statSync(`public${variant.src}`).size, variant.bytes);
  }
});

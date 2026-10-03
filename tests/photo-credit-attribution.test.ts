import assert from "node:assert/strict";
import test from "node:test";
import { describePhotoAttribution } from "../lib/easyt/photo-attribution.ts";

test("Unsplash credit links the photographer and Unsplash separately with referral tags", () => {
  const attribution = describePhotoAttribution({
    credit: "Photo by Jane Doe on Unsplash",
    sourceHref: "https://unsplash.com/@janedoe?utm_source=morrovia&utm_medium=referral",
    licenseHref: null,
  });

  assert.deepEqual(attribution, {
    kind: "unsplash",
    photographer: "Jane Doe",
    photographerHref: "https://unsplash.com/@janedoe?utm_source=morrovia&utm_medium=referral",
    sourceLabel: "Unsplash",
    sourceHref: "https://unsplash.com/?utm_source=morrovia&utm_medium=referral",
    licenseHref: null,
  });
});

test("dynamic Eibner Saliba result parses its available Unsplash attribution without licence metadata", () => {
  assert.deepEqual(describePhotoAttribution({
    credit: "Photo by Eibner Saliba on Unsplash",
    sourceHref: "https://unsplash.com/@eibnersaliba?utm_source=morrovia&utm_medium=referral",
  }), {
    kind: "unsplash",
    photographer: "Eibner Saliba",
    photographerHref: "https://unsplash.com/@eibnersaliba?utm_source=morrovia&utm_medium=referral",
    sourceLabel: "Unsplash",
    sourceHref: "https://unsplash.com/?utm_source=morrovia&utm_medium=referral",
    licenseHref: null,
  });
});

test("licensed non-Unsplash attribution preserves its actual source and licence", () => {
  assert.deepEqual(describePhotoAttribution({
    credit: "Basile Morin · CC BY-SA 4.0",
    sourceHref: "https://commons.wikimedia.org/wiki/File:Tokyo.jpg",
    licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/",
  }), {
    kind: "source",
    credit: "Basile Morin · CC BY-SA 4.0",
    sourceHref: "https://commons.wikimedia.org/wiki/File:Tokyo.jpg",
    licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/",
  });
});

test("curated Unsplash inventory keeps photographer, image source and licence links distinct", () => {
  assert.deepEqual(describePhotoAttribution({
    credit: "A. Photographer · Unsplash License",
    authorHref: "https://unsplash.com/@aphotographer?utm_source=morrovia&utm_medium=referral",
    sourceHref: "https://unsplash.com/photos/example?utm_source=morrovia&utm_medium=referral",
    licenseHref: "https://unsplash.com/license",
  }), {
    kind: "unsplash",
    photographer: "A. Photographer",
    photographerHref: "https://unsplash.com/@aphotographer?utm_source=morrovia&utm_medium=referral",
    sourceLabel: "Unsplash",
    sourceHref: "https://unsplash.com/photos/example?utm_source=morrovia&utm_medium=referral",
    licenseHref: "https://unsplash.com/license",
  });
});

test("homepage destination context does not hide the curated photographer name", () => {
  const credit = describePhotoAttribution({
    credit: "La Fortuna · J. Amill Santiago · Unsplash License",
    authorHref: "https://unsplash.com/@thetaikun?utm_source=morrovia&utm_medium=referral",
    sourceHref: "https://unsplash.com/photos/brown-wooden-bridge-in-the-woods-55rZeNdxr-8?utm_source=morrovia&utm_medium=referral",
    licenseHref: "https://unsplash.com/license",
  });
  assert.equal(credit?.kind, "unsplash");
  if (credit?.kind === "unsplash") assert.equal(credit.photographer, "J. Amill Santiago");
});

test("missing or mismatched source metadata produces no false credit control", () => {
  assert.equal(describePhotoAttribution({ credit: "Local image", sourceHref: null, licenseHref: null }), null);
  assert.equal(describePhotoAttribution({
    credit: "Photo by Jane Doe on Unsplash",
    sourceHref: "https://example.com/jane",
    licenseHref: null,
  }), null);
});

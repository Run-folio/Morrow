import assert from "node:assert/strict";
import test from "node:test";
import { lookupWikimediaDestinationPhotos } from "../lib/easyt/wikimedia-destination-photo.server.ts";

const place = { name: "Chiang Mai", country: "Thailand", coordinates: [98.98468, 18.79038] as [number, number] };
function page(overrides: Record<string, unknown> = {}) {
  return { title: "File:Chiang Mai Thailand old town street.jpg", imageinfo: [{
    url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Chiang_Mai.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Chiang_Mai.jpg",
    mime: "image/jpeg", width: 1600, height: 900,
    extmetadata: { Artist: {value: '<a href="https://commons.wikimedia.org/wiki/User:Example">Example author</a>'},
      LicenseShortName: {value:"CC BY-SA 4.0"}, LicenseUrl: {value:"https://creativecommons.org/licenses/by-sa/4.0/"},
      ImageDescription: {value:"Chiang Mai, Thailand old town street"}, GPSLongitude:{value:"98.98468"},GPSLatitude:{value:"18.79038"} },
    ...overrides,
  }] };
}
const fetcher = (pages: unknown[]) => async (url: string | URL | Request, init?: RequestInit) => {
  assert.match(String(url), /^https:\/\/commons\.wikimedia\.org\/w\/api.php\?/);
  assert.match(new URL(String(url)).searchParams.get("gsrsearch") ?? "", /"Chiang Mai" Thailand/);
  assert.ok(init?.signal);
  return new Response(JSON.stringify({query:{pages:Object.fromEntries(pages.map((p,i)=>[String(i),p]))}}),{status:200});
};
test("contextual Wikimedia lookup requires complete rights and returns attributed photography without any key", async () => {
  const result=await lookupWikimediaDestinationPhotos(place,{fetcher:fetcher([page()])});
  assert.equal(result.status,"resolved");assert.equal(result.candidates[0]?.author,"Example author");
  assert.equal(result.candidates[0]?.license,"CC BY-SA 4.0");
  assert.match(result.candidates[0]?.sourceUrl??"",/commons.wikimedia.org\/wiki\/File:/);
  assert.match(result.candidates[0]?.licenseUrl??"",/creativecommons/);
});
test("wrong geography, ambiguous/non-photographic assets and incomplete rights stay neutral", async () => {
  for(const candidate of [page({extmetadata:{}}),page({mime:"image/svg+xml"}),page({url:"https://example.test/wrong.jpg"}),
    {...page({extmetadata:{...page().imageinfo[0]!.extmetadata,ImageDescription:{value:"Bangkok Thailand skyline"}}}),title:"File:Bangkok Thailand skyline.jpg"},
    page({extmetadata:{...page().imageinfo[0]!.extmetadata,GPSLongitude:{value:"100.50144"},GPSLatitude:{value:"13.75398"}}}),
    {...page(),title:"File:Chiang Mai Thailand map.jpg"}]){
    assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:fetcher([candidate])})).status,"no-result");
  }
});
test("failed images are excluded and Wikimedia rate/fetch/timeouts remain retryable", async () => {
  assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:fetcher([page()]),excludedSources:[page().imageinfo[0]!.url]})).status,"no-result");
  for(const fetcher of [async()=>new Response("",{status:429}),async()=>{throw new Error("offline")},async()=>new Promise<Response>(()=>{})]){
    assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher,timeoutMs:5})).status,"unavailable");
  }
});

test("body parsing is bounded and malformed siblings or conflicting licence URLs cannot enter the selection", async () => {
  const hangingBody = async () => ({ ok: true, json: async () => new Promise(() => {}) }) as Response;
  assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:hangingBody,timeoutMs:5})).status,"unavailable");
  const bad = page({extmetadata:{...page().imageinfo[0]!.extmetadata,LicenseUrl:{value:"https://creativecommons.org/licenses/by/4.0/"}}});
  assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:fetcher([bad])})).status,"no-result");
  assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:fetcher([null,page()])})).status,"resolved");
});

test("requested query words never become synthetic geographic evidence for an unrelated image", async () => {
  const unrelated={...page({extmetadata:{Artist:{value:"Author"},LicenseShortName:{value:"CC BY 4.0"},LicenseUrl:{value:"https://creativecommons.org/licenses/by/4.0/"}}}),title:"File:Unrelated old town street.jpg"};
  assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:fetcher([unrelated])})).status,"no-result");
});

test("wrong-type provider siblings cannot discard a valid attributed destination photo", async () => {
  const metadata = page().imageinfo[0]!.extmetadata;
  const malformed = [
    { ...page(), title: 42 },
    { ...page(), imageinfo: {} },
    page({ extmetadata: { ...metadata, Artist: { value: 42 } } }),
    page({ extmetadata: { ...metadata, LicenseShortName: { value: {} } } }),
    page({ extmetadata: { ...metadata, LicenseUrl: { value: 42 } } }),
    page({ extmetadata: { ...metadata, Artist: null } }),
    page({ extmetadata: [] }),
    page({ width: "1600" }),
    page({ descriptionurl: 42 }),
  ];
  for (const sibling of malformed) {
    const result = await lookupWikimediaDestinationPhotos(place, { fetcher: fetcher([sibling, page()]) });
    assert.equal(result.status, "resolved");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.author, "Example author");
    assert.equal(result.candidates[0]?.license, "CC BY-SA 4.0");
  }
});

test("Commons provider selections share reusable rights validation with cached positives", async () => {
  const metadata = page().imageinfo[0]!.extmetadata;
  for (const [license, licenseUrl, expected] of [
    ["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/", "no-result"],
    ["CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/", "no-result"],
    ["CC BY 99.0", "https://creativecommons.org/licenses/by/99.0/", "no-result"],
    ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/", "resolved"],
    ["Public domain", "https://creativecommons.org/publicdomain/mark/1.0/", "resolved"],
  ]) {
    const candidate = page({ extmetadata: { ...metadata, LicenseShortName: { value: license }, LicenseUrl: { value: licenseUrl } } });
    assert.equal((await lookupWikimediaDestinationPhotos(place, { fetcher: fetcher([candidate]) })).status, expected);
  }
});

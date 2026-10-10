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
test("Commons thumbnail host retains a licensed destination photo", async () => {
  const thumbnail = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Chiang_Mai.jpg/1200px-Chiang_Mai.jpg";
  const result = await lookupWikimediaDestinationPhotos(place, { fetcher: fetcher([page({ thumburl: thumbnail })]) });
  assert.equal(result.status, "resolved");
  assert.equal(result.candidates[0]?.src, thumbnail);
  assert.equal(result.candidates[0]?.license, "CC BY-SA 4.0");
});
test("Commons search rank decides the first accepted photo, not numeric page IDs", async () => {
  const lower = { ...page(), index: 2, title: "File:Chiang Mai lower-ranked street.jpg" };
  const higher = { ...page(), index: 1, title: "File:Chiang Mai higher-ranked street.jpg" };
  const result = await lookupWikimediaDestinationPhotos(place, { fetcher: fetcher([lower, higher]) });
  assert.deepEqual(result.candidates.map(photo => photo.id), [higher.title, lower.title]);
});
test('a route transit ferry does not stop the scenic follow-up search',async()=>{
 const manila={name:'Manila',country:'Philippines',placeType:'city',coordinates:[120.9842,14.5995] as [number,number]};
 const ferry={...page({extmetadata:{...page().imageinfo[0]!.extmetadata,ImageDescription:{value:'Philippines 1981, ferry from Cebu City to Manila harbour'},GPSLongitude:{value:'120.9842'},GPSLatitude:{value:'14.5995'}}}),title:'File:Philippines-1981-44 hg.jpg'};
 const skyline={...page({extmetadata:{...page().imageinfo[0]!.extmetadata,ImageDescription:{value:'Manila Philippines city skyline'},GPSLongitude:{value:'120.9842'},GPSLatitude:{value:'14.5995'}}}),title:'File:Manila city skyline.jpg'};
 const queries:string[]=[];
 const result=await lookupWikimediaDestinationPhotos(manila,{fetcher:async url=>{
  const query=new URL(String(url)).searchParams.get('gsrsearch')??'';queries.push(query);
  return Response.json({query:{pages:{'1':query.includes('skyline')?skyline:ferry}}});
 }});
 assert.equal(queries.length,2);
 assert.equal(result.candidates[0]?.id,skyline.title);
});
test("a broad country miss retries one region-aware photo query without weakening geography", async () => {
  const denver = { name: "Denver", country: "United States", region: "Colorado", placeType: "city", coordinates: [-104.9903, 39.7392] as [number, number] };
  const photo = { ...page({
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Denver.jpg/1200px-Denver.jpg",
    extmetadata: { ...page().imageinfo[0]!.extmetadata,
      ImageDescription: { value: "Denver, Colorado skyline" },
      GPSLongitude: { value: "-104.99" }, GPSLatitude: { value: "39.74" } },
  }), title: "File:Denver, Colorado skyline.jpg" };
  const queries: string[] = [];
  const result = await lookupWikimediaDestinationPhotos(denver, { fetcher: async (url) => {
    const query = new URL(String(url)).searchParams.get("gsrsearch") ?? "";
    queries.push(query);
    return Response.json({ query: { pages: query.includes("Colorado") ? { "1": photo } : {} } });
  } });
  assert.equal(result.status, "resolved");
  assert.equal(result.candidates[0]?.id, photo.title);
  assert.equal(queries.length, 2);
  assert.match(queries[1]!, /Denver.*Colorado.*skyline/);
});
test("same-name cities use coordinates to reject the wrong region", async () => {
  const portland = { name: "Portland", country: "United States", region: "Oregon", placeType: "city", coordinates: [-122.6765, 45.5231] as [number, number] };
  const matching = { ...page({ extmetadata: { ...page().imageinfo[0]!.extmetadata,
    ImageDescription: { value: "Portland waterfront skyline" }, GPSLongitude: { value: "-122.6765" }, GPSLatitude: { value: "45.5231" } } }), title: "File:Portland waterfront skyline.jpg" };
  const wrong = { ...matching, title: "File:Portland Maine waterfront skyline.jpg", imageinfo: [{ ...matching.imageinfo[0],
    extmetadata: { ...matching.imageinfo[0]!.extmetadata, GPSLongitude: { value: "-70.2553" }, GPSLatitude: { value: "43.6591" } } }] };
  const wrongWithoutGps = { ...wrong, imageinfo: [{ ...wrong.imageinfo[0], extmetadata: {
    ...wrong.imageinfo[0]!.extmetadata, GPSLongitude: undefined, GPSLatitude: undefined,
    Country: { value: "United States" }, ImageDescription: { value: "Portland, Maine waterfront skyline" },
  } }] };
  assert.equal((await lookupWikimediaDestinationPhotos(portland, { fetcher: async () => Response.json({ query: { pages: { "1": wrongWithoutGps } } }) })).status, "no-result");
  const matchingWithoutGps = { ...wrongWithoutGps, title: "File:Portland Oregon waterfront skyline.jpg", imageinfo: [{
    ...wrongWithoutGps.imageinfo[0], extmetadata: { ...wrongWithoutGps.imageinfo[0]!.extmetadata,
      ImageDescription: { value: "Portland, Oregon waterfront skyline" } },
  }] };
  assert.equal((await lookupWikimediaDestinationPhotos(portland, { fetcher: async () => Response.json({ query: { pages: { "1": matchingWithoutGps } } }) })).status, "resolved");
  const result = await lookupWikimediaDestinationPhotos(portland, { fetcher: async () => Response.json({ query: { pages: { "1": wrong, "2": matching } } }) });
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.candidates.map(photo => photo.id), [matching.title]);
});
test("a non-city destination searches for landscape and retains exact-place evidence", async () => {
  const place = { name: "Big Bear Lake", country: "United States", region: "California", placeType: "town", coordinates: [-116.9114, 34.2439] as [number, number] };
  const photo = { ...page({ extmetadata: { ...page().imageinfo[0]!.extmetadata,
    ImageDescription: { value: "Big Bear Lake landscape in California" },
    GPSLongitude: { value: "-116.9114" }, GPSLatitude: { value: "34.2439" } } }),
    title: "File:Big Bear Lake landscape.jpg" };
  const queries: string[] = [];
  const result = await lookupWikimediaDestinationPhotos(place, { fetcher: async (url) => {
    const query = new URL(String(url)).searchParams.get("gsrsearch") ?? "";
    queries.push(query);
    return Response.json({ query: { pages: query.includes("landscape") ? { "1": photo } : {} } });
  } });
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.candidates.map(candidate => candidate.id), [photo.title]);
  assert.match(queries[1]!, /Big Bear Lake.*California.*landscape/);
});

test("accented place names still match their provider spelling", async () => {
  const munich = { name: "München", country: "Germany", coordinates: [11.582, 48.135] as [number, number] };
  const result = await lookupWikimediaDestinationPhotos(munich, { fetcher: async () => Response.json({ query: { pages: { "1": {
    ...page({ extmetadata: { ...page().imageinfo[0]!.extmetadata,
      ImageDescription: { value: "Munchen city skyline" }, GPSLongitude: { value: "11.582" }, GPSLatitude: { value: "48.135" } } }),
    title: "File:Munchen city skyline.jpg",
  } } } }) });
  assert.equal(result.status, "resolved");
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { lookupWikimediaDestinationPhotos } from "../lib/easyt/wikimedia-destination-photo.server.ts";
import { referencePhotoPlaceContext } from "../lib/easyt/place-reference.server.ts";
import { scorePublishedRouteImageCandidate } from "../lib/easyt/published-route-image-pipeline.ts";

const routeSource=readFileSync("app/api/journey-route-image/route.ts","utf8");
function handler(fetcher:typeof fetch, key?:string){
  const code=ts.transpileModule(routeSource.replace(/^import .*;\n/gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,Function>={};
  new Function("exports","NextResponse","lookupWikimediaDestinationPhotos","referencePhotoPlaceContext","scorePublishedRouteImageCandidate","fetch","process",code)(exports,{json:(body:unknown,init?:ResponseInit)=>new Response(JSON.stringify(body),init)},(place:Parameters<typeof lookupWikimediaDestinationPhotos>[0],options:Parameters<typeof lookupWikimediaDestinationPhotos>[1])=>lookupWikimediaDestinationPhotos(place,{...options,fetcher}),referencePhotoPlaceContext,scorePublishedRouteImageCandidate,fetcher,{env:{UNSPLASH_ACCESS_KEY:key}});
  return (params:Record<string,string>)=>exports.GET!({nextUrl:new URL(`http://localhost/api/journey-route-image?${new URLSearchParams(params)}`)}) as Promise<Response>;
}
function commons(name:string,country:string){return {query:{pages:{1:{title:`File:${name} ${country} old town street.jpg`,imageinfo:[{url:"https://upload.wikimedia.org/wikipedia/commons/a/ab/photo.jpg",descriptionurl:"https://commons.wikimedia.org/wiki/File:Photo.jpg",width:1600,height:900,mime:"image/jpeg",extmetadata:{Artist:{value:"Example author"},LicenseShortName:{value:"CC BY 4.0"},LicenseUrl:{value:"https://creativecommons.org/licenses/by/4.0/"},ImageDescription:{value:`${name} ${country} old town street`}}}]}}}};}

test("actual handler restores attributed Wikimedia for all four destinations with no Unsplash key",async()=>{
  for(const [place,country] of [["Los Angeles","United States"],["Seoul","South Korea"],["Bangkok","Thailand"],["Chiang Mai","Thailand"]]){
    const calls:string[]=[];const get=handler(async url=>{calls.push(String(url));return new Response(JSON.stringify(commons(place!,country!)));});
    const response=await get({query:`${place} ${country} travel`,place:place!,country:country!}),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.image.provider,"wikimedia");assert.equal(body.image.author,"Example author");assert.equal(body.image.license,"CC BY 4.0");
    assert.equal(calls.length,1);assert.match(calls[0]!,/^https:\/\/commons.wikimedia.org/);assert.equal(response.headers.get("Cache-Control"),"no-store");
  }
});
test("actual handler keeps unsupported geography/rights neutral and failures retryable",async()=>{
  const params={query:"Paris France travel",place:"Paris",country:"France"};
  const wrong=handler(async()=>new Response(JSON.stringify(commons("Paris","United States"))));
  assert.equal((await(await wrong(params)).json()).reason,"no-result");
  const failing=handler(async()=>new Response("",{status:429}));const response=await failing(params);
  assert.equal(response.status,502);assert.equal((await response.json()).reason,"provider-unavailable");assert.equal(response.headers.get("Cache-Control"),"no-store");
  let calls=0;const invalid=handler(async()=>{calls++;throw new Error("should not call");});assert.equal((await invalid({...params,lat:"100",lon:"0"})).status,400);assert.equal(calls,0);
});
test('older saved same-province settlement rejects a no-GPS Commons image using its stable ID', async () => {
  const photo = commons('Shenzhen', 'China');
  photo.query.pages[1].title = 'File:Shenzhen Guangdong China old town street.jpg';
  photo.query.pages[1].imageinfo[0].extmetadata.ImageDescription.value = 'Shenzhen Guangdong China old town street';
  const get = handler(async () => Response.json(photo));
  const response = await get({ query: 'Shenzhen China travel', place: 'Shenzhen', country: 'China',
    region: 'Guangdong', canonicalPlaceId: 'reference:geonames:1795566',
    lon: '111.11793', lat: '22.1823' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, 'no-result');
  const mismatched = await get({ query: 'Shenzhen China travel', place: 'Shenzhen', country: 'China',
    region: 'Guangdong', district: 'Shenzhen', canonicalPlaceId: 'reference:geonames:1795566',
    lon: '111.11793', lat: '22.1823' });
  assert.equal(mismatched.status, 400);
});
test("actual handler uses configured Unsplash only after Wikimedia and preserves query-only compatibility",async()=>{
  const calls:string[]=[];const get=handler(async url=>{calls.push(String(url));return new Response(JSON.stringify(String(url).includes("commons.wikimedia")?{query:{pages:{}}}:{results:[{id:"photo-id",urls:{regular:"https://images.unsplash.com/photo-id"},user:{name:"Author",links:{html:"https://unsplash.com/@author"}},width:1600,height:900,description:"Bangkok Thailand old town street",location:{city:"Bangkok",country:"Thailand"}}]}));},"fixture-access-key");
  const result=await(await get({query:"Bangkok Thailand travel",place:"Bangkok",country:"Thailand"})).json();
  assert.equal(result.image.provider,"unsplash");assert.equal(calls.length,3);assert.match(calls[0]!,/commons.wikimedia/);assert.match(calls[1]!,/commons.wikimedia/);assert.match(calls[2]!,/api.unsplash/);
  const legacy=handler(async()=>{throw new Error("no key should not fetch");});assert.equal((await(await legacy({query:"legacy query"})).json()).reason,"missing-access-key");
});

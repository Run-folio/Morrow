import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { lookupWikimediaDestinationPhotos } from "../lib/easyt/wikimedia-destination-photo.server.ts";
import { referencePhotoPlaceContext } from "../lib/easyt/place-reference.server.ts";
import { scorePublishedRouteImageCandidate, choosePublishedRouteImageCandidate } from "../lib/easyt/published-route-image-pipeline.ts";

import { countryFor } from "../lib/easyt/country-registry.ts";

const routeSource=readFileSync("app/api/journey-route-image/route.ts","utf8");
function handler(fetcher:typeof fetch, key?:string){
  const code=ts.transpileModule(routeSource.replace(/^import .*;\n/gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,Function>={};
  new Function("exports","NextResponse","lookupWikimediaDestinationPhotos","referencePhotoPlaceContext","choosePublishedRouteImageCandidate","countryFor","fetch","process",code)(exports,{json:(body:unknown,init?:ResponseInit)=>new Response(JSON.stringify(body),init)},(place:Parameters<typeof lookupWikimediaDestinationPhotos>[0],options:Parameters<typeof lookupWikimediaDestinationPhotos>[1])=>lookupWikimediaDestinationPhotos(place,{...options,fetcher}),referencePhotoPlaceContext,choosePublishedRouteImageCandidate,countryFor,fetcher,{env:{UNSPLASH_ACCESS_KEY:key}});
  return (params:Record<string,string>)=>exports.GET!({nextUrl:new URL(`http://localhost/api/journey-route-image?${new URLSearchParams(params)}`)}) as Promise<Response>;
}
function commons(name:string,country:string){return {query:{pages:{1:{title:`File:${name} ${country} old town street.jpg`,imageinfo:[{url:"https://upload.wikimedia.org/wikipedia/commons/a/ab/photo.jpg",descriptionurl:"https://commons.wikimedia.org/wiki/File:Photo.jpg",width:1600,height:900,mime:"image/jpeg",extmetadata:{Artist:{value:"Example author"},LicenseShortName:{value:"CC BY 4.0"},LicenseUrl:{value:"https://creativecommons.org/licenses/by/4.0/"},ImageDescription:{value:`${name} ${country} old town street`}}}]}}}};}

test("actual handler restores attributed Wikimedia for all four destinations with no Unsplash key",async()=>{
  for(const [place,country] of [["Los Angeles","United States"],["Seoul","South Korea"],["Bangkok","Thailand"],["Chiang Mai","Thailand"]]){
    const calls:string[]=[];const get=handler(async url=>{calls.push(String(url));return new Response(JSON.stringify(commons(place!,country!)));});
    const response=await get({query:`${place} ${country} travel`,place:place!,country:country!}),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.image.provider,"wikimedia");assert.equal(body.image.author,"Example author");assert.equal(body.image.license,"CC BY 4.0");
    assert.equal(calls.length,2);assert.match(calls[0]!,/^https:\/\/commons.wikimedia.org/);assert.equal(response.headers.get("Cache-Control"),"no-store");
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
  const recovered = await response.json();
  assert.equal(recovered.destinationStatus, 'no-result');
  assert.equal(recovered.image.scope, 'country');
  assert.equal(recovered.image.country, 'China');
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

test('country fallback is licensed and explicitly illustrative after a failed destination search',async()=>{
 const calls:string[]=[];
 const get=handler(async url=>{
  const search=new URL(String(url)).searchParams.get('gsrsearch')??'';calls.push(search);
  return Response.json(search.includes('"Philippines"')?commons('Philippines','Philippines'):{query:{pages:{}}});
 });
 const response=await get({query:'Cuyo Philippines travel',place:'Cuyo',country:'Philippines'});
 const result=await response.json();assert.equal(response.status,200);
 assert.ok(result.image, 'a suitable country photograph must follow the empty destination search');assert.equal(result.image.scope,'country');assert.equal(result.image.country,'Philippines');
 assert.match(result.image.alt,/Illustrative.*Philippines/);assert.equal(result.image.license,'CC BY 4.0');
 assert.ok(calls[0]?.includes('"Cuyo"'));assert.ok(calls.some(q=>q.includes('"Philippines"')));
});

test('unsuitable Commons advances to deterministic configured Unsplash, with provider diagnostics and canonical reference query',async()=>{
 const calls:string[]=[];
 const get=handler(async input=>{const url=new URL(String(input));calls.push(url.href);
  if(url.hostname==='commons.wikimedia.org'){
   const result=commons('Cebu City','Philippines');result.query.pages[1].imageinfo[0].extmetadata.ImageDescription.value='Cebu City Philippines sunset over the bay';
   return Response.json(result);
  }
  assert.match(url.searchParams.get('query')??'',/Cebu City Philippines/);
  return Response.json({results:[{id:'z-water',urls:{regular:'https://images.unsplash.com/water'},user:{name:'Author',links:{html:'https://unsplash.com/@author'}},width:1600,height:900,description:'Cebu City Philippines bay'},
   {id:'a-city',urls:{regular:'https://images.unsplash.com/city'},user:{name:'Author',links:{html:'https://unsplash.com/@author'}},width:1600,height:900,description:'Cebu City Philippines skyline'}]});
 },'fixture-access-key');
 const response=await get({query:'Cebu Philippines travel',place:'Cebu',country:'Philippines',canonicalPlaceId:'reference:geonames:1717512',lon:'123.89071',lat:'10.31672'}),body=await response.json();
 assert.equal(body.image.id,'a-city');assert.equal(calls.length,3);assert.equal(body.providers.wikimedia.status,'no-result');assert.equal(body.providers.unsplash.status,'resolved');assert.equal(body.providers.wikimedia.diagnostics.suitable,0);assert.equal(body.providers.wikimedia.diagnostics.eligible,1);assert.doesNotMatch(JSON.stringify(body),/fixture-access-key/);
});
test('a successful Unsplash fallback keeps an earlier Commons outage visible',async()=>{
 const get=handler(async input=>String(input).includes('commons.wikimedia.org')?new Response('',{status:503}):Response.json({results:[{id:'city',urls:{regular:'https://images.unsplash.com/city'},user:{name:'Author',links:{html:'https://unsplash.com/@author'}},width:1600,height:900,description:'Manila Philippines skyline'}]}),'fixture-access-key');
 const body=await(await get({query:'Manila',place:'Manila',country:'Philippines',placeType:'city'})).json();assert.ok(body.image);assert.equal(body.providers.wikimedia.status,'unavailable');assert.equal(body.providers.unsplash.status,'resolved');
});
test('absent Unsplash is explicitly unattempted and country fallback preserves destination diagnostics',async()=>{
 const get=handler(async input=>{const search=new URL(String(input)).searchParams.get('gsrsearch')??'';return Response.json(search.includes('"Philippines"')?commons('Philippines','Philippines'):{query:{pages:{}}});});
 const body=await(await get({query:'Cuyo Philippines',place:'Cuyo',country:'Philippines'})).json();assert.equal(body.image.scope,'country');assert.equal(body.destinationProviders.unsplash.configured,false);assert.equal(body.destinationProviders.unsplash.attempted,false);assert.equal(body.destinationProviders.wikimedia.status,'no-result');
});

test('Commons follow-up failure keeps its qualified photo and visible provider error without attempting Unsplash',async()=>{
 let calls=0;const get=handler(async()=>++calls===1?Response.json(commons('Manila','Philippines')):new Response('',{status:429}),'fixture-key');
 const body=await(await get({query:'Manila',place:'Manila',country:'Philippines',placeType:'city'})).json();assert.ok(body.image);assert.equal(body.image.provider,'wikimedia');assert.equal(body.providers.wikimedia.status,'unavailable');assert.equal(body.providers.unsplash.attempted,false);assert.equal(calls,2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {scorePublishedRouteImageCandidate,choosePublishedRouteImageCandidate,chooseEditoriallyReviewedCandidate,type PublishedRouteImageCandidate} from '../lib/easyt/published-route-image-pipeline.ts';
import {referencePhotoPlaceContext,referencePlaceById} from '../lib/easyt/place-reference.server.ts';
import {lookupWikimediaDestinationPhotos} from '../lib/easyt/wikimedia-destination-photo.server.ts';
import {readRoutePhotoSelection} from '../lib/easyt/route-photo-cache.ts';
const stop={key:'manila',name:'Manila',country:'Philippines',placeType:'city',coordinates:[120.9842,14.5995] as [number,number],routeKeys:[],siblingNames:[],attachedLandmarks:[]};
const photo=(description:string,id='Example'):PublishedRouteImageCandidate=>({provider:'wikimedia',id:`File:${id}.jpg`,src:`https://upload.wikimedia.org/wikipedia/commons/a/ab/${id}.jpg`,sourceUrl:`https://commons.wikimedia.org/wiki/File:${id}.jpg`,author:'Example',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',width:1600,height:900,description});
function page(description:string,id='Example',metadata:Record<string,{value:string}>={}){const p=photo(description,id);return {title:p.id,imageinfo:[{url:p.src,descriptionurl:p.sourceUrl,width:p.width,height:p.height,mime:'image/jpeg',extmetadata:{Artist:{value:p.author},LicenseShortName:{value:p.license},LicenseUrl:{value:p.licenseUrl},ImageDescription:{value:description},...metadata}}]};}
test('identity evidence does not qualify sunset-only settlement covers',()=>{
 for(const description of ['Manila Philippines sunset over the bay']){
  const result=scorePublishedRouteImageCandidate(stop,photo(description));
  assert.equal(result.eligible,true);assert.equal(result.accepted,false);assert.ok(result.suitabilityConcerns.length);
 }
});
test('generic settlement scenes preserve waterfront, harbour, night and contemporary historic architecture',()=>{
 for(const description of ['Manila Philippines waterfront sunset with a small boat','Manila Philippines harbour water panorama','Manila Philippines waterfront with a small boat','Manila Philippines harbour panorama with distant boats','Manila Philippines skyline at night','Manila Philippines ordinary street with passing buses','Manila Philippines historic cathedral'])assert.equal(scorePublishedRouteImageCandidate(stop,photo(description)).accepted,true,description);
});
test('shared cover ranking prefers settlement landmarks and deduplicates encoded provider identities',()=>{
 const water=photo('Manila Philippines bay','a-water'),city=photo('Manila Philippines city skyline','z-city');
 const duplicate={...city,id:'different-id',sourceUrl:'https://commons.wikimedia.org/wiki/File:z_city.jpg',src:city.src+'?width=800'};
 const canonical={...city,sourceUrl:'https://commons.wikimedia.org/wiki/File:z%20city.jpg'};
 for(const pool of [[water,duplicate,canonical],[canonical,duplicate,water]]){
  const result=choosePublishedRouteImageCandidate(stop,pool);assert.equal(result.selected?.candidate.id,'different-id');
  assert.match(result.selected?.candidate.description??'',/skyline/);assert.equal(result.ranked.length,2);
 }
});
test('bounded Commons lookup tries a second query for a representative distinct alternative',async()=>{
 let calls=0;
 const result=await lookupWikimediaDestinationPhotos(stop,{fetcher:async()=>Response.json({query:{pages:{1:++calls===1?page('Manila Philippines bay','a-water'):page('Manila Philippines city skyline','z-city',{DateTimeOriginal:{value:'2024-01-01'},DateTime:{value:'2026-10-10'}})}}})});
 assert.equal(calls,2);assert.equal(result.candidates[0]?.id,'File:z-city.jpg');assert.equal(result.candidates[0]?.width,1600);assert.equal(result.candidates[0]?.captureDate,'2024-01-01');assert.equal(result.diagnostics?.queries,2);
});
test('verified canonical/alias/code labels derive canonical lookup facts without changing saved inputs',()=>{
 for(const [id,country,names] of [['reference:geonames:1717512','Philippines',['Cebu City','Cebu']],['reference:ourairports:2429','United Kingdom',['London Gatwick Airport','Gatwick','LGW','EGKK']]] as const){
  const record=referencePlaceById(id)!;
  for(const name of names){const input={canonicalPlaceId:id,name,country,coordinates:record.coordinates};const before=structuredClone(input),result=referencePhotoPlaceContext(input);assert.equal(result?.valid,true,name);if(result?.valid){assert.equal(result.canonicalName,record.canonicalName);assert.equal(result.placeType,record.placeType);}assert.deepEqual(input,before);}
  for(const changes of [{name:'Invented'}, {name:'London Heathrow Airport'}, {country:'France'},{coordinates:[record.coordinates[0]+.00001,record.coordinates[1]] as [number,number]}])assert.equal(referencePhotoPlaceContext({canonicalPlaceId:id,name:names[0],country,coordinates:record.coordinates,...changes})?.valid,false);
 }
});
test('changed cover policy ignores v7 positives while preserving trip storage',()=>{
 const data=new Map([['morrovia:route-photo:v7:old',JSON.stringify({kind:'photo',photo:{...photo('Manila Philippines bay'),sourceLabel:'Example'}})],['trip:old','saved trip']]);
 const storage={getItem:(key:string)=>data.get(key)??null,removeItem:(key:string)=>data.delete(key)} as unknown as Storage;
 assert.equal(readRoutePhotoSelection('old',storage),null);assert.equal(data.get('trip:old'),'saved trip');
});
test('featured credit and country label share the image frame before the identity sibling',()=>{
 const source=readFileSync('app/journey/dashboard/dashboard-client.tsx','utf8');
 const ast=ts.createSourceFile('dashboard.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found=false;
 function visit(node:ts.Node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.initializer?.getText(ast).includes('styles.currentPhotoFrame'))){
  found=true;assert.match(node.openingElement.getText(ast),/styles\.cardMediaFrame/);const content=node.getText(ast);assert.match(content,/ResilientImage/);assert.match(content,/CountryIllustrationLabel/);assert.match(content,/MorroviaPhotoCredit/);assert.doesNotMatch(content,/currentIdentity/);
 }ts.forEachChild(node,visit);}visit(ast);assert.equal(found,true);
 const css=readFileSync('app/journey/dashboard/dashboard.module.css','utf8');assert.match(css,/\.cardMediaFrame[^}]*position:\s*relative/);assert.match(css,/\.currentPhotoFrame[^}]*height:\s*242px/);assert.doesNotMatch(css,/\.currentMedia > img/);
});

test('archival dates demote covers but never manufacture a hard cutoff or use upload dates',()=>{
 const historic=photo('Manila Philippines street photographed in 1981','a-archive'),modern=photo('Manila Philippines street','z-modern');
 assert.equal(scorePublishedRouteImageCandidate(stop,historic).accepted,true);
 assert.equal(choosePublishedRouteImageCandidate(stop,[historic,modern]).selected?.candidate.id,modern.id);
 assert.equal(scorePublishedRouteImageCandidate(stop,photo('Manila Philippines historic cathedral named 1981 plaza')).accepted,true);
});
test('the six rejected captured covers retire by exact reviewed asset, while accepted controls remain parseable',async()=>{
 const {routePhotoFromUnknown}=await import('../lib/easyt/route-photo-cache.ts');
 const sources=[['Sunset, Manila, Philippines.jpg','Manila Philippines bay'],['Coron Palawan, Philippines 06.jpg','Coron Philippines harbour'],['Philippines-1981-39 hg.jpg','Cebu City Philippines street'],['Athens, Greece Skyline from Mount Lycabettus (5987127852).jpg','Athens Greece skyline'],['Athens, Greece Skyline from Mount Lycabettus (5986569199).jpg','Athens Greece skyline'],['Athens, Greece Skyline view from Mount Lycabettus (5987127698).jpg','Athens Greece skyline']];
 for(const [file,description] of sources){const candidate={...photo(description!),sourceUrl:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file!.replaceAll(' ','_'))};assert.equal(routePhotoFromUnknown({...candidate,sourceLabel:'Example · CC BY 4.0'}),null,file);assert.equal(scorePublishedRouteImageCandidate({...stop,name:description!.split(' ')[0]!},candidate).accepted,false,file);}
 for(const [name,country,description,file] of [['Milan','Italy','Milan Italy skyline','Full Milan skyline from Duomo roof'],['Santa Cruz de Tenerife','Spain','Santa Cruz de Tenerife Spain church','Iglesia de la Concepcion'],['Philippines','Philippines','Philippines limestone islands in San Pedro Bay','Marabut']]){
  const candidate=photo(description!,file!);assert.equal(scorePublishedRouteImageCandidate({...stop,name:name!,country:country!,placeType:name==='Philippines'?'country':'city'},candidate).accepted,true);assert.ok(routePhotoFromUnknown({...candidate,sourceLabel:'Example · CC BY 4.0',...(name==='Philippines'?{scope:'country',country}: {})}));
 }
});

test('gateway scene semantics and rights are independent hard boundaries',()=>{
 const gateway={...stop,name:'London Gatwick Airport',country:'United Kingdom',placeType:'transport_gateway'};
 assert.equal(scorePublishedRouteImageCandidate(gateway,photo('London Gatwick Airport United Kingdom terminal architecture')).accepted,true);
 assert.equal(scorePublishedRouteImageCandidate(gateway,photo('London Gatwick Airport United Kingdom beach landscape')).accepted,false);
 for(const changes of [{license:''},{licenseUrl:''},{author:''}])assert.equal(scorePublishedRouteImageCandidate(stop,{...photo('Manila Philippines skyline'),...changes}).eligible,false);
});
test('a later Commons outage retains a qualified first pool with visible error and diagnostics',async()=>{
 for(const timeout of [false,true]){
  let calls=0;
  const result=await lookupWikimediaDestinationPhotos(stop,{timeoutMs:15,fetcher:async()=>{
   if(++calls===1)return Response.json({query:{pages:{1:page('Manila Philippines skyline')}}});
   if(timeout)return new Promise<Response>(()=>{});
   return new Response('',{status:503});
  }});
  assert.equal(result.status,'unavailable');assert.equal(result.candidates[0]?.id,'File:Example.jpg');assert.equal(result.diagnostics?.queries,2);assert.equal(result.diagnostics?.suitable,1);
 }
});
test('gateway follow-up query preserves airport semantics',async()=>{
 const queries:string[]=[];
 await lookupWikimediaDestinationPhotos({...stop,name:'London Gatwick Airport',country:'United Kingdom',placeType:'transport_gateway'},{fetcher:async input=>{queries.push(new URL(String(input)).searchParams.get('gsrsearch')??'');return Response.json({query:{pages:{}}});}});
 assert.match(queries[1]??'',/airport filetype/);
});

test('editorial override cannot bypass independent subject or missing-rights rejection',()=>{
 for(const changes of [{description:'Manila Philippines ferry in harbour'}, {description:'Manila Philippines protest march in city square'}, {description:'Unrelated Philippines skyline'}, {license:''}]){
  const candidate={...photo('Manila Philippines skyline'),...changes};const ranked=choosePublishedRouteImageCandidate(stop,[candidate]).ranked;
  assert.equal(chooseEditoriallyReviewedCandidate(ranked,candidate.id),null);
 }
});

test('recorded pixel exclusions are editorial suitability decisions without falsifying geography eligibility',()=>{
 const candidate={...photo('Manila Philippines skyline'),sourceUrl:'https://commons.wikimedia.org/wiki/File:Sunset,_Manila,_Philippines.jpg'};
 const scored=scorePublishedRouteImageCandidate(stop,candidate);assert.equal(scored.eligible,true);assert.equal(scored.accepted,false);assert.deepEqual(scored.concerns,[]);assert.ok(scored.suitabilityConcerns.some(reason=>reason.includes('editorial review')));assert.equal(chooseEditoriallyReviewedCandidate([{candidate,...scored}],candidate.id),null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePublishedRouteImageCandidate, type PublishedRouteImageCandidate } from '../lib/easyt/published-route-image-pipeline.ts';
import { lookupWikimediaDestinationPhotos } from '../lib/easyt/wikimedia-destination-photo.server.ts';
import { resolveDistinctRoutePhotoCandidates } from '../lib/easyt/route-photo-cache.ts';
import { placeSuggestionLocationDetail } from '../lib/easyt/place-autocomplete.ts';

const photo: PublishedRouteImageCandidate = { provider:'wikimedia', id:'File:Example.jpg', src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg', author:'Example', license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/', width:1600,height:900 };
const stop = {key:'manila',name:'Manila',country:'Philippines',coordinates:[120.98,14.6] as [number,number],routeKeys:[],siblingNames:[],attachedLandmarks:[]};
test('settlement cards reject incidental ferry metadata without directional prepositions',()=>{
 for(const name of ['Manila','Cebu']) {
  const scored=scorePublishedRouteImageCandidate({...stop,name},{...photo,alt:`Philippine ferry ${name} harbour`,description:`Ferry vessel ${name} Philippines waterfront`});
  assert.equal(scored.accepted,false,name);
 }
 assert.equal(scorePublishedRouteImageCandidate(stop,{...photo,alt:'Manila Philippines waterfront skyline'}).accepted,true);
});
test('camera location alone cannot establish the photographed destination subject',()=>{
 assert.equal(scorePublishedRouteImageCandidate(stop,{...photo,alt:'Coastal skyline',location:{city:'Manila',country:'Philippines'},coordinates:stop.coordinates}).accepted,false);
});
test('nearby GPS cannot override the selected district identity for a namesake',async()=>{
 const selected={name:'Springfield',country:'United States',region:'Illinois',administrativeHierarchy:['Illinois','Sangamon County'],requiresPhotoCoordinates:true,coordinates:[-89.65,39.78] as [number,number]};
 const page={title:'File:Springfield Illinois skyline.jpg',imageinfo:[{url:photo.src,descriptionurl:photo.sourceUrl,mime:'image/jpeg',width:1600,height:900,extmetadata:{Artist:{value:photo.author},LicenseShortName:{value:photo.license},LicenseUrl:{value:photo.licenseUrl},ImageDescription:{value:'Springfield Illinois United States skyline in a different county'},GPSLongitude:{value:'-89.65'},GPSLatitude:{value:'39.78'}}}]};
 const lookup=async()=>Response.json({query:{pages:{'1':page}}});
 assert.equal((await lookupWikimediaDestinationPhotos(selected,{fetcher:lookup})).status,'no-result');
 page.imageinfo[0]!.extmetadata.ImageDescription.value='Springfield Sangamon County Illinois United States skyline';
 assert.equal((await lookupWikimediaDestinationPhotos(selected,{fetcher:lookup})).status,'resolved');
});
test('shared photo assignment follows route order regardless of provider completion order',async()=>{
 async function run(slow:string){
  const selected:Record<string,string>={};
  await resolveDistinctRoutePhotoCandidates(['first','second'].map(cacheKey=>({cacheKey:`order-${slow}-${cacheKey}`,queries:[cacheKey],occurrenceIds:[cacheKey]})),(candidate,result)=>{if(result.kind==='photo')selected[candidate.queries[0]!]=result.photo.id!;},{storage:null,trackPhoto:()=>{},findPhotos:async(queries,_signal,_place,excluded)=>{
   if(queries[0]===slow)await new Promise(resolve=>setTimeout(resolve,20));
   return {configured:true,status:'resolved',candidates:[{...photo,alt:photo.alt??undefined,sourceLabel:'Example · CC BY 4.0'},{...photo,alt:photo.alt??undefined,id:'File:Alternate.jpg',src:photo.src.replace('Example','Alternate'),sourceUrl:photo.sourceUrl.replace('Example','Alternate'),sourceLabel:'Example · CC BY 4.0'}].filter(p=>!excluded?.includes(p.sourceUrl))};
  }});
  return selected;
 }
 assert.deepEqual(await run('first'),await run('second'));
});
test('unresolved administrative collisions preserve known geography without numbered choices',()=>{
 const choices=['a','b'].map(canonicalPlaceId=>({canonicalPlaceId,name:'Springfield',country:'United States',region:'Illinois',administrativeHierarchy:['Illinois','Sangamon County'],placeType:'city'}));
 for(const choice of choices){const label=placeSuggestionLocationDetail(choice,choices);assert.match(label,/Sangamon County/);assert.doesNotMatch(label,/Location \d|\d of \d/);assert.match(label,/Location to confirm/);}
});

 test('a country name cannot distinguish settlement photographs in conflicting districts',()=>{
 const selected={...stop,name:'Springfield',country:'United States',subjectContext:['Illinois','Sangamon County']};
 assert.equal(scorePublishedRouteImageCandidate(selected,{...photo,alt:'Springfield skyline in Illinois United States',coordinates:stop.coordinates}).accepted,false);
 assert.equal(scorePublishedRouteImageCandidate(selected,{...photo,alt:'Springfield Sangamon County Illinois United States skyline'}).accepted,true);
 });

test('a country illustration cannot become an unlabelled cached destination photo',async()=>{
 const { routePhotoFromUnknown }=await import('../lib/easyt/route-photo-cache.ts');
 const scoped={...photo,scope:'country',country:'Not a country',sourceLabel:'Example · CC BY 4.0'};
 assert.equal(routePhotoFromUnknown(scoped),null);
 assert.equal(routePhotoFromUnknown({...scoped,country:'Philippines'})?.scope,'country');
});

test('a waterfront scene can contain background boats without becoming a vehicle portrait',()=>{
 assert.equal(scorePublishedRouteImageCandidate(stop,{...photo,alt:'Manila Philippines waterfront skyline with a small boat moored in the harbor',description:'Manila Philippines harbor panorama with a distant boat'}).accepted,true);
 const ferry={...photo,id:'File:Philippines ferry 1981.jpg',alt:'Manila Cebu Philippines ferry in harbor 1981',description:'Manila Cebu Philippines ferry in harbor 1981'};
 for(const name of ['Manila','Cebu'])assert.equal(scorePublishedRouteImageCandidate({...stop,name},ferry).accepted,false);
});

test('a slow unrelated destination lookup does not block ready photo callbacks',async()=>{
 let release!:()=>void;const slow=new Promise<void>(resolve=>{release=resolve;});const selected:string[]=[];
 const task=resolveDistinctRoutePhotoCandidates(['slow','fast'].map(cacheKey=>({cacheKey:'independent-'+cacheKey,queries:[cacheKey],occurrenceIds:[cacheKey]})),(candidate,result)=>{if(result.kind==='photo')selected.push(candidate.queries[0]!);},{storage:null,trackPhoto:()=>{},findPhotos:async queries=>{
  if(queries[0]==='slow')await slow;
  return {configured:true,status:'resolved',candidates:[{...photo,alt:photo.alt??undefined,id:'File:'+queries[0]+'.jpg',sourceUrl:photo.sourceUrl.replace('Example',queries[0]!),src:photo.src.replace('Example',queries[0]!),sourceLabel:'Example · CC BY 4.0'}]};
 }});
 await new Promise(resolve=>setTimeout(resolve,0));const ready=[...selected];release();await task;
 assert.deepEqual(ready,['fast']);assert.deepEqual(selected,['fast','slow']);
});

test('country illustrations require a geographic scene rather than an incidental subject at a park',()=>{
 const country={...stop,name:'United Kingdom',country:'United Kingdom',placeType:'country'};
 assert.equal(scorePublishedRouteImageCandidate(country,{...photo,alt:'Common pigeon at Waterlow Park, London, United Kingdom',description:'Common pigeon at Waterlow Park, London, United Kingdom'}).accepted,false);
 assert.equal(scorePublishedRouteImageCandidate(country,{...photo,alt:'United Kingdom coastal landscape and limestone cliffs'}).accepted,true);
});

test('Commons filename prefixes do not turn a described waterfront into a vehicle portrait',()=>{
 const caption='Manila Philippines waterfront skyline with small boats moored in the harbor';
 const plain=scorePublishedRouteImageCandidate(stop,{...photo,alt:caption,description:caption});
 const prefixed=scorePublishedRouteImageCandidate(stop,{...photo,id:'File:Manila boats.jpg',alt:caption,description:`File:Manila boats.jpg ${caption}`});
 assert.equal(plain.accepted,true);
 assert.deepEqual(prefixed,plain);
 assert.equal(scorePublishedRouteImageCandidate(stop,{...photo,alt:'Manila Philippines ferry in harbor',description:'File:Manila skyline.jpg Manila Philippines ferry in harbor'}).accepted,false);
 assert.equal(scorePublishedRouteImageCandidate(stop,{...photo,alt:'',description:'File:Manila Philippines ferry waterfront.jpg'}).accepted,false,'filename-only transit evidence must not disappear');
});

test('verified short administrative names retain exact region evidence and reject namesakes',async()=>{
 const place={name:'Panaji',country:'India',region:'Goa',coordinates:[73.8278,15.4909] as [number,number]};
 const page={title:'File:Panaji waterfront.jpg',imageinfo:[{url:photo.src,descriptionurl:photo.sourceUrl,mime:'image/jpeg',width:1600,height:900,extmetadata:{Artist:{value:photo.author},LicenseShortName:{value:photo.license},LicenseUrl:{value:photo.licenseUrl},ImageDescription:{value:'Panaji Goa India waterfront skyline'},GPSLongitude:{value:'73.8278'},GPSLatitude:{value:'15.4909'}}}]};
 const fetcher=async()=>Response.json({query:{pages:{'1':page}}});
 assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher})).status,'resolved');
 page.imageinfo[0]!.extmetadata.ImageDescription.value='Panaji India waterfront skyline';
 assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher})).status,'no-result');
 page.imageinfo[0]!.extmetadata.ImageDescription.value='Panaji Goan India waterfront skyline';
 assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher})).status,'no-result');
});


test('Commons filenames naming an administrative parent cannot override a conflicting pictured settlement', async () => {
 const place={name:'Santa Cruz de Tenerife',country:'Spain',coordinates:[-16.25462,28.46824] as [number,number]};
 const page={title:'File:San Andres y Sauces, La Palma (Santa Cruz de Tenerife, Spain).jpg',imageinfo:[{url:photo.src,descriptionurl:photo.sourceUrl,mime:'image/jpeg',width:1600,height:900,extmetadata:{Artist:{value:photo.author},LicenseShortName:{value:photo.license},LicenseUrl:{value:photo.licenseUrl},ImageDescription:{value:'View from Puntallana to road LP-1 in San Andres y Sauces, La Palma, Spain'}}}]};
 const lookup=async()=>Response.json({query:{pages:{'1':page}}});
 assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:lookup})).status,'no-result');
 page.imageinfo[0]!.extmetadata.ImageDescription.value='Santa Cruz de Tenerife Spain coastal skyline';
 assert.equal((await lookupWikimediaDestinationPhotos(place,{fetcher:lookup})).status,'resolved');
});

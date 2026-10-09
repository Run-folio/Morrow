import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {resolvePlaceMentions} from '../lib/easyt/place-intelligence.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {discoveryConfirmationChoiceForId} from '../lib/easyt/discovery-confirmation.ts';
import {searchNominatimTravelCandidates} from '../lib/easyt/nominatim-place.server.ts';
import {prioritizeRouteStopSuggestions} from '../lib/easyt/place-autocomplete.ts';
const captured=JSON.parse(readFileSync(new URL('./fixtures/batch14-gua-live-provider.json',import.meta.url),'utf8'));
const mention=(name:string)=>resolvePlaceMentions(name).mentions[0]!;
const context={interests:[],existingPlaceIds:['caye-caulker'],durationDays:15};

test('actual Belize Discovery projection exposes neutral canonical choices without inventing recommendation or stay evidence',()=>{
 const draft=createDiscoveryDraft(),before=JSON.stringify(draft);
 const result=projectDiscovery({mention:mention('Belize'),draft,context});
 assert.deepEqual(result.places.map(p=>p.id).sort(),['belize-city','caye-caulker','san-ignacio-belize','san-pedro-belize']);
 assert.deepEqual(result.recommendedIds,[]);assert.deepEqual(result.directions,[]);assert.equal(JSON.stringify(draft),before);
 for(const place of result.places){assert.equal((place as any).identityOnly,true);assert.equal(place.actionability,'browse-only');assert.deepEqual(place.stayEvidence,[]);assert.deepEqual(place.relevance.sources,[]);assert.equal(place.relevance.en,'');assert.equal(place.imageKey,null);assert.ok(!('reason' in discoveryConfirmationChoiceForId(place.id,result)));}
});

test('neutral identity flag cannot bypass canonical geometry, containment or reviewed-content rules',()=>{
 const p=projectDiscovery({mention:mention('Belize'),draft:createDiscoveryDraft(),context});
 assert.ok(p.places.length);
 const base=p.places[0]!;
 for(const bad of [{...base,country:'Guatemala'},{...base,coordinates:[0,0] as [number,number]},{...base,name:'Invented city'},{...base,stayEvidence:[{id:'invented',kind:'official' as const,label:'Fake',supports:'Stay here'}]},{...base,relevance:{en:'Great beaches',es:'Playas',sources:[]}}]){
  const r=projectDiscovery({mention:mention('Belize'),draft:createDiscoveryDraft(),context,evidence:{places:[bad],directions:[]}});
  assert.equal(r.totalEligible,0);assert.equal(r.rejected.length,1);
 }
});

test('catalogue fallback does not create continent or regional recommendations',()=>{
 for(const name of ['Africa','Hokkaido']){
  const r=projectDiscovery({mention:mention(name),draft:createDiscoveryDraft(),context});
  assert.ok(r.places.every(p=>!(p as any).identityOnly));
 }
});

test('validated exact airport-code evidence outranks catalogue substring choices only for that exact route-stop query',()=>{
 const catalog={name:'Antigua Guatemala',placeType:'city',routability:'direct_destination'};
 const airport={name:'La Aurora International Airport',placeType:'transport_gateway',routability:'direct_destination',matchedAirportCode:'GUA'};
 assert.equal(prioritizeRouteStopSuggestions([catalog,airport],'route-stop','gua')[0],airport);
 for(const value of [{...airport,matchedAirportCode:undefined},{...airport,matchedAirportCode:'GUA/XXX'},{...airport,placeType:'city'}])assert.equal(prioritizeRouteStopSuggestions([catalog,value],'route-stop','GUA')[0],catalog);
 assert.equal(prioritizeRouteStopSuggestions([catalog,airport],'route-stop','GUA1')[0],catalog);
 assert.equal(prioritizeRouteStopSuggestions([catalog,airport],'unknown','GUA')[0],catalog);
});

async function actualHandler(){
 const require=createRequire(import.meta.url);
 const b=await build({stdin:{contents:"export {GET} from './app/api/journey-geocode/route';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',external:['next/server'],logLevel:'silent'});
 const module={exports:{} as any};new Function('require','module','exports',b.outputFiles[0].text)(require,module,module.exports);
 return {GET:module.exports.GET,NextRequest:require('next/server').NextRequest};
}
test('actual geocode response ranks live-captured namedetails IATA airport first without changing identity or coordinates',async()=>{
 const {GET,NextRequest}=await actualHandler(),original=globalThis.fetch;
 const queries:string[]=[];
 globalThis.fetch=(async(input:any)=>{const key=String(input),row=captured.responses.find((r:any)=>r.url===key);assert.ok(row,`captured live query ${key}`);queries.push(key);return new Response(JSON.stringify(row.body),{status:row.status});}) as typeof fetch;
 try{
  const payload=await (await GET(new NextRequest('http://fixture/api/journey-geocode?place=GUA&candidates=1'))).json();
  const first=payload.candidates[0];assert.equal(first.name,'La Aurora International Airport');assert.equal(first.providerId,'nominatim:relation:17228072');assert.equal(first.placeType,'transport_gateway');assert.deepEqual(first.coordinates,[-90.5271541,14.5832025]);
  assert.equal(first.matchedAirportCode,'GUA');
  assert.equal(queries.filter(q=>new URL(q).searchParams.get('q')==='GUA airport').length,1);
 }finally{globalThis.fetch=original;}
});

test('actual geocode response with ambiguous or invalid provider IATA never exports code priority',async()=>{
 const airport=captured.responses.find((r:any)=>new URL(r.url).searchParams.get('q')==='GUA airport').body[0];
 for(const namedetails of [{...airport.namedetails,iata:'GUA/XXX'},{...airport.namedetails,iata:'XXX'}]){
  const {GET,NextRequest}=await actualHandler(),original=globalThis.fetch;
  globalThis.fetch=(async(input:any)=>{const row=captured.responses.find((r:any)=>r.url===String(input));assert.ok(row);
   const body=new URL(String(input)).searchParams.get('q')==='GUA airport'?[{...airport,namedetails}]:row.body;
   return new Response(JSON.stringify(body),{status:row.status});}) as typeof fetch;
  try{const payload=await(await GET(new NextRequest('http://fixture/api/journey-geocode?place=GUA&candidates=1&intent=route-stop'))).json();
   assert.ok(payload.candidates.every((c:any)=>!c.matchedAirportCode));assert.notEqual(payload.candidates[0]?.name,'La Aurora International Airport');
  }finally{globalThis.fetch=original;}
 }
});

test('ambiguous, invalid, non-airport and non-exact IATA evidence never earns an airport priority boost',async()=>{
 const airport=captured.responses.find((r:any)=>new URL(r.url).searchParams.get('q')==='GUA airport').body[0];
 const regions=captured.responses.find((r:any)=>new URL(r.url).searchParams.get('q')==='GUA').body;
 const variants=[{...airport,extratags:{...airport.extratags,iata:'GUA'},namedetails:{...airport.namedetails,iata:'XXX'}},{...airport,namedetails:{...airport.namedetails,iata:'GUA/XXX'}},{...airport,type:'city',category:'place',addresstype:'city'}, {...airport,namedetails:{...airport.namedetails,iata:'GU'}}];
 for(const value of variants){
  const fetcher=(async(input:any)=>new Response(JSON.stringify(new URL(String(input)).searchParams.get('q')==='GUA airport'?[value]:regions))) as typeof fetch;
  const r=await searchNominatimTravelCandidates('GUA',{travelIntent:'route-stop'},fetcher);
  const match=r.find(c=>c.providerId===`relation:${airport.osm_id}`);
  assert.ok(!match||(match.rankScore??0)<200,'no 100-point code boost for conflicting/invalid/non-gateway evidence');
  assert.equal(match?.matchedAirportCode,undefined);
 }
 const queries:string[]=[];await searchNominatimTravelCandidates('GUA1',{travelIntent:'route-stop'},(async(input:any)=>{queries.push(String(input));return new Response('[]')}) as typeof fetch);
 assert.ok(queries.every(q=>!new URL(q).searchParams.get('q')?.endsWith(' airport')));
});

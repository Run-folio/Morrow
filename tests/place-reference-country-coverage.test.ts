import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {build} from 'esbuild';
import {countries,countryCodeFor} from '../lib/easyt/country-registry.ts';
import {PLACE_CATALOG} from '../lib/easyt/place-catalog.ts';
import {resolvePlaceMentions,canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {discoverySelectablePlaces,discoveryConfirmationChoiceForId} from '../lib/easyt/discovery-confirmation.ts';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const base=resolvePlaceMentions('Belize').mentions[0]!,draft={...createDiscoveryDraft(),step:'places' as const},context={interests:[],existingPlaceIds:[]};
const coverage=JSON.parse(readFileSync('data/place-reference/coverage.json','utf8'));
const projections=countries.map(country=>{
 const anchor=PLACE_CATALOG.find(e=>e.placeType==='country'&&countryCodeFor(e.canonicalName)===country.code)!;assert.ok(anchor,country.code);
 assert.ok(canonicalPlaceSuggestionsForQuery(anchor.canonicalName,[],8,true).some(s=>s.canonicalPlaceId===anchor.canonicalPlaceId),`${country.code}: explicit country picker`);
 const mention={...base,canonicalPlaceId:anchor.canonicalPlaceId,canonicalName:anchor.canonicalName,parentCountries:[country.name],placeType:'country' as const};
 return {country,mention,projection:projectDiscovery({mention,draft,context})};
});
test('all 197 accepted country IDs and every authored identity/point stay unchanged',async()=>{
 const source=execFileSync('git',['show','73a3a0cbe19592b1b0d045434a62eb43a9b995e7:lib/easyt/place-catalog.ts'],{encoding:'utf8'});
 const bundle=await build({stdin:{contents:source,resolveDir:resolve('lib/easyt'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'});
 const module={exports:{} as any};new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);
 const old=module.exports.PLACE_CATALOG;assert.equal(old.filter((p:any)=>p.placeType==='country').length,197);
 for(const record of old)assert.deepEqual(PLACE_CATALOG.find(p=>p.canonicalPlaceId===record.canonicalPlaceId),record,record.canonicalPlaceId);
});
test('all 250 jurisdictions expose directly confirmable source-backed choices or honest thresholded-source exceptions',()=>{
 assert.equal(projections.length,250);let usable=0;
 for(const {country,projection} of projections){
  const choices=discoverySelectablePlaces(projection.places);
  if(!choices.length){assert.ok(coverage.exceptions.some((e:any)=>e.code===country.code&&e.reason==='no-eligible-source-settlement'),`${country.code}: missing usable choice`);continue;}
  usable++;
  for(const place of choices){const result=discoveryConfirmationChoiceForId(place.id,projection);assert.ok(!('reason' in result),`${country.code}:${place.id}`);if('reason' in result)continue;assert.ok(result.suggestion.coordinates,place.id);assert.deepEqual(result.suggestion.coordinates,place.coordinates);assert.equal(countryCodeFor(result.suggestion.country),country.code);}
  if(choices.every(p=>p.identityOnly)){assert.deepEqual(projection.recommendedIds,[]);assert.deepEqual(projection.directions,[]);for(const p of choices){assert.deepEqual(p.stayEvidence,[]);assert.deepEqual(p.tags,[]);assert.equal(p.imageKey,null);}}
 }
 assert.equal(usable,245);const us=projections.find(x=>x.country.code==='US')!.projection;
 assert.ok(us.visiblePlaceIds.length);assert.ok(us.places.every(p=>p.identityOnly&&['city','town'].includes(p.placeType)));
});
test('final EN/ES DiscoverySteps renders usable city/town cards and visible source credit',async()=>{
 const require=createRequire(import.meta.url);const b=await build({entryPoints:['components/easyt/discovery-steps.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react-dom','react-dom/server'],plugins:[{name:'static-render',setup(b){b.onResolve({filter:/\.css$/},()=>({path:'styles',namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({contents:'export default {}'}));b.onResolve({filter:/discovery-map$/},()=>({path:'map',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>null'}));}}]});
 const mod={exports:{} as any};new Function('require','module','exports',b.outputFiles[0].text)(require,mod,mod.exports);
 const React=require('react'),render=require('react-dom/server').renderToStaticMarkup;
 for(const {country,mention,projection} of projections)for(const language of ['en','es']){
  const html=render(React.createElement(mod.exports.DiscoverySteps,{entry:{kind:'country',step:'places'},mention,projection,draft,language,onAction:()=>{},highlightedPlaceId:null,onHighlight:()=>{}}));
  if(coverage.exceptions.some((e:any)=>e.code===country.code))continue;
  assert.match(html,/data-discovery-card="true"/,country.code);assert.match(html,language==='en'?/Add to shortlist:/:/Añadir a la selección:/,country.code);
  if(projection.places.some(p=>p.id.startsWith('reference:geonames:'))){assert.match(html,/GeoNames/);assert.match(html,/creativecommons.org\/licenses\/by\/4.0/);}
 }
});

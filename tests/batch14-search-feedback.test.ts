import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {projectHomepageInput} from '../lib/easyt/home-trip-handoff.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {findCatalogPlaceById,PLACE_CATALOG} from '../lib/easyt/place-catalog.ts';
import {mergeEquivalentPlaceSuggestions, placeSuggestionLocationDetail,prioritizeRouteStopSuggestions} from '../lib/easyt/place-autocomplete.ts';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {journeyEndpointPlaceFromSuggestion,normalizeJourneyEnd,originPlaceFromBrief} from '../lib/easyt/journey-endpoints.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';

test('actual pre-editor canonical restoration preserves the saved origin and stop geographic bindings',()=>{
 const saved=requireReadableTripDocument(canonicalRouteFixture()),candidate=searchReferencePlaces('LAX')[0]!;
 const origin=journeyEndpointPlaceFromSuggestion({...candidate,canonicalPlaceId:candidate.canonicalPlaceId!,name:candidate.canonicalName,country:candidate.parentCountries![0]!,label:'LAX',referenceSnapshotId:REFERENCE_SNAPSHOT_ID,provenance:[{id:candidate.providerId,kind:'provider',label:'OurAirports',supports:'Selected source point'}]})!;
 saved.brief.intent.route.origin=origin;Object.assign(saved.brief,{origin:origin.name,originCoordinates:origin.coordinates,originCanonicalPlaceId:origin.canonicalPlaceId,originCountry:origin.country,originProviderId:origin.providerId});
 const binding={...origin.geographicBinding!,canonicalPlaceId:saved.stops[0]!.canonicalPlaceId,placeType:'city'};
 saved.stops[0]!.geographicBinding=binding;
 const before=JSON.stringify(saved),source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const callback=source.slice(source.indexOf('  const applyAcceptedBuilderDocument ='),source.indexOf('    setStartDate(saved.startDate);'))+'\n};return applyAcceptedBuilderDocument;';
 let restoredOrigin:unknown,restoredStops:any;const target:any={originPlaceFromBrief,normalizeJourneyEnd,hydratedCanonicalTripRef:{current:null},builderEditSessionRef:{current:null},replaceJourneyOrigin:(v:unknown)=>{restoredOrigin=v},setStops:(v:unknown)=>{restoredStops=v}};
 const scope=new Proxy(target,{has:()=>true,get:(t,k)=>k===Symbol.unscopables?undefined:t[k]??(globalThis as any)[k]??(()=>{})});
 const ts=createRequire(import.meta.url)('typescript');
 new Function('scope',`with(scope){${ts.transpileModule(callback,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope)(saved);
 assert.deepEqual(restoredOrigin,origin);assert.deepEqual(restoredStops[0].geographicBinding,binding);
 assert.equal(JSON.stringify(saved),before,'read projection does not rewrite the authoritative document');
});

test('cross-source published facts remain distinct without reviewed equivalence evidence',()=>{
 const la=canonicalPlaceSuggestionsForQuery('Los Angeles');
 const merged=mergeEquivalentPlaceSuggestions(la);
 assert.deepEqual(merged,la,'equal points alone do not establish a reviewed crosswalk');
 assert.equal(merged[0]?.canonicalPlaceId,'los-angeles','display dedup does not rewrite existing authored identity');
 const candidates=searchReferencePlaces('Xi’an').filter(p=>p.canonicalName==='Xi’an').map(p=>({canonicalPlaceId:p.canonicalPlaceId!,name:p.canonicalName,country:p.parentCountries![0]!,placeType:p.placeType,coordinates:p.coordinates,region:p.parentRegionId,administrativeHierarchy:p.administrativeHierarchy}));
 const distinct=mergeEquivalentPlaceSuggestions(candidates);
 assert.equal(distinct.length,5,'same-name settlements at different points remain explicit choices');
 assert.equal(new Set(distinct.map(p=>placeSuggestionLocationDetail(p,distinct))).size,5);
 assert.equal(mergeEquivalentPlaceSuggestions([{...la[0],canonicalPlaceId:'unrelated:los-angeles'},la[1]!]).length,2,'no general name/proximity merging');
 assert.equal(mergeEquivalentPlaceSuggestions([la[0]!,{...la[1]!,coordinates:[-118.2435,34.0522]}]).length,2,'nearby same-name source point is insufficient');
 assert.equal(mergeEquivalentPlaceSuggestions([{...la[0]!,name:'Toronto'},la[1]!]).length,2,'corrupt authored label is not duplicate evidence');
 assert.equal(mergeEquivalentPlaceSuggestions([{...la[0]!,placeType:'region'},la[1]!]).length,2,'corrupt authored type is not duplicate evidence');
 assert.equal(mergeEquivalentPlaceSuggestions([la[0]!,la[1]!,{...la[1]!,canonicalPlaceId:'reference:geonames:999999999'}]).length,3,'ambiguous cross-source matches do not merge');
 for(const entry of ['tokyo','rome','madrid'].map(findCatalogPlaceById).filter(e=>e?.coordinates)){
  const authored={canonicalPlaceId:entry!.canonicalPlaceId,name:entry!.canonicalName,country:entry!.parentCountries[0]!,placeType:entry!.placeType,coordinates:entry!.coordinates};
  const source={...authored,canonicalPlaceId:'reference:geonames:999999999'};
  assert.equal(mergeEquivalentPlaceSuggestions([authored,source]).length,2,'fabricated source IDs cannot establish equivalence: '+entry!.canonicalName);
  assert.equal(mergeEquivalentPlaceSuggestions([source,{...source,canonicalPlaceId:'reference:geonames:888888888'}]).length,2,'provider-provider identities remain separate');
 }
});

test('population breaks equal reference name ranks before truncation without auto-resolving namesakes',()=>{
 const results=searchReferencePlaces('Los Angeles');
 assert.equal(results[0]?.canonicalPlaceId,'reference:geonames:5368361');
 const xian=searchReferencePlaces('Xi’an').filter(p=>p.canonicalName==='Xi’an');
 assert.equal(new Set(xian.map(p=>p.rankScore)).size,1,'presentation ranking must not manufacture a uniqueness margin');
});

test('Africa and Europe remain selectable planning intents with complete containment and no invented overnight stop',()=>{
 for(const name of ['Africa','Europe']){
  const selection=canonicalPlaceSuggestionsForQuery(name,[],8,true).find(p=>p.name===name);
  assert.ok(selection,`${name} must remain a supported broad destination`);
  assert.equal(selection.placeType,'continent');assert.equal(selection.routability,'planning_area');assert.equal(selection.coordinates,undefined);
  const result=projectHomepageInput({snapshot:{...emptyHomepageInput(),tripType:{state:'selected',value:'one_way'},entries:[{id:'broad',text:name,selection}]},profile:null,handoffId:'broad-search'});
  assert.ok(result.ok);assert.deepEqual(result.draft.destinations,[]);
  const mention=result.draft.structuredBrief?.placeMentions?.[0];assert.ok(mention);
  assert.deepEqual(mention.parentCountries,findCatalogPlaceById(selection.canonicalPlaceId)!.parentCountries);
  assert.equal(mention.requiresBaseSelection,true);assert.equal(mention.directlyRoutable,false);
  assert.equal(result.draft.routeIntent?.destinations[0]?.kind,'planning_area');
 }
 assert.equal(canonicalPlaceSuggestionsForQuery('Europe',[],8,false).some(p=>p.placeType==='continent'),false,'endpoint-only search stays bounded');
});

test('every supported catalog planning area retains its full scope without creating centroid stops',()=>{
 const areas=PLACE_CATALOG.filter(p=>['planning_area','needs_base_selection'].includes(p.routability));assert.ok(areas.length>250);
 const types=new Set<string>();let multi=0;
 for(const area of areas){
  types.add(area.placeType);if(area.parentCountries.length>1)multi++;
  for(const phrase of [area.canonicalName,...area.aliases]){
  const selection=canonicalPlaceSuggestionsForQuery(phrase,[],1000,true).find(p=>p.canonicalPlaceId===area.canonicalPlaceId);
  assert.ok(selection,area.canonicalPlaceId);
  const namesake={...selection,canonicalPlaceId:'unrelated-city',placeType:'city' as const,routability:'direct_destination' as const};
  assert.equal(prioritizeRouteStopSuggestions([namesake,selection],'route-stop',phrase)[0]!.canonicalPlaceId,area.canonicalPlaceId,'an exact planning intent cannot disappear behind a namesake town');
  const result=projectHomepageInput({snapshot:{...emptyHomepageInput(),tripType:{state:'selected',value:'one_way'},entries:[{id:'scope',text:area.canonicalName,selection}]},profile:null,handoffId:'scope-check'});
  assert.ok(result.ok,area.canonicalPlaceId);assert.equal(result.draft.destinations?.length,0,area.canonicalPlaceId);
  assert.deepEqual(result.draft.structuredBrief?.placeMentions?.[0]?.parentCountries,area.parentCountries,area.canonicalPlaceId);
  assert.equal(result.draft.routeIntent?.destinations[0]?.kind,'planning_area',area.canonicalPlaceId);
  }
 }
 assert.equal(multi,11);assert.ok(types.has('continent'));assert.ok(types.has('macro_region'));assert.ok(types.has('country'));
});

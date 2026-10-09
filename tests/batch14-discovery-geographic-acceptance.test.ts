import assert from 'node:assert/strict';
import test from 'node:test';
import {PLACE_CATALOG} from '../lib/easyt/place-catalog.ts';
import {resolvePlaceMentions} from '../lib/easyt/place-intelligence.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {discoverySelectablePlaces,discoveryConfirmationChoiceForId,discoveryDirectStopSuggestion} from '../lib/easyt/discovery-confirmation.ts';
import {discoveryPlaceForId} from '../lib/easyt/discovery-content.ts';
import {acceptedGeographicPlace,geographicallyReady} from '../lib/easyt/geographic-binding.ts';
test('every selectable Discovery overnight choice passes the exact current Add geography shape across all planning parents',()=>{
 const seed=resolvePlaceMentions('France').mentions[0]!,ids=new Set<string>();let parents=0,occurrences=0;
 for(const entry of PLACE_CATALOG.filter(entry=>['planning_area','needs_base_selection','anchor_or_poi'].includes(entry.routability))){
  const mention={...seed,mentionId:`audit:${entry.canonicalPlaceId}`,canonicalPlaceId:entry.canonicalPlaceId,canonicalName:entry.canonicalName,sourceText:entry.canonicalName,placeType:entry.placeType,parentCountries:[...entry.parentCountries],parentRegionId:entry.parentRegionId,routability:entry.routability,coordinates:entry.coordinates?[...entry.coordinates] as [number,number]:undefined,requiresBaseSelection:true};
  const draft=createDiscoveryDraft(),projection=projectDiscovery({mention,draft,context:{durationDays:15,interests:[],existingPlaceIds:[]}});parents++;
  for(const place of discoverySelectablePlaces(projection.places)){
   const choice=discoveryConfirmationChoiceForId(place.id,projection,draft);assert.ok(!('reason' in choice));
   const suggestion=choice.suggestion,providerId=suggestion.provenance.find(source=>source.kind==='provider')?.id;
   const owner={name:suggestion.name,country:suggestion.country,canonicalPlaceId:suggestion.canonicalPlaceId,providerId,coordinates:suggestion.coordinates};
   const accepted=acceptedGeographicPlace(owner,{...owner,placeType:suggestion.placeType,routability:suggestion.routability,referenceSnapshotId:suggestion.referenceSnapshotId});
   assert.ok(accepted,`${entry.canonicalName} / ${suggestion.name}: offered Add must be acceptable`);
   assert.equal(geographicallyReady(accepted),true);ids.add(place.id);occurrences++;
  }
 }
 assert.ok(parents>=292);assert.ok(ids.size>=97);assert.ok(occurrences>=218);
});
test('known Discovery identity cannot accept a changed country, type, point or missing provider snapshot',()=>{
 for(const id of ['cape-town','bogota','buenos-aires','puerto-natales','quito','el-calafate','medellin','aguas-calientes','ollantaytambo','bangkok','almaty','istanbul','samarkand','chiang-mai','tashkent','hiroshima']){
  const s=discoveryDirectStopSuggestion(discoveryPlaceForId(id)!);assert.ok(s, `${id}: maintained Discovery choice remains acceptable`);
  const owner={name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId,coordinates:s.coordinates};
  const candidate={...owner,placeType:s.placeType,routability:s.routability};
  assert.equal(acceptedGeographicPlace({...owner,country:'Antarctica'},{...candidate,country:'Antarctica'}),undefined);
  assert.equal(acceptedGeographicPlace(owner,{...candidate,placeType:'region'}),undefined);
  assert.equal(acceptedGeographicPlace({...owner,coordinates:[0,0]},{...candidate,coordinates:[0,0]}),undefined);
  assert.equal(acceptedGeographicPlace({...owner,coordinates:[s.coordinates![0]+.0001,s.coordinates![1]]},{...candidate,coordinates:[s.coordinates![0]+.0001,s.coordinates![1]]}),undefined);
  assert.equal(acceptedGeographicPlace(owner,{...candidate,providerId:'reference:geonames:999@stale:JP:city:0:0'}),undefined);
 }
});

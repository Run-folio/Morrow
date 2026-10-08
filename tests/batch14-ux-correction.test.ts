import assert from 'node:assert/strict';
import test from 'node:test';
import * as choice from '../lib/easyt/home-route-choice.ts';
import * as order from '../lib/easyt/trip-builder-order.ts';
import * as resolution from '../lib/easyt/destination-resolution.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import * as retained from '../lib/easyt/trip-retained-authored-content.ts';

test('ordinary selected and restored Return toggles directly without treating the old toggle as source evidence',()=>{
 assert.equal(typeof choice.homepageTripTypeRequest,'function');
 const initial={...emptyHomepageInput(),mode:'stops' as const,tripType:{state:'selected' as const,value:'return_to_start' as const},journeyEnd:{state:'selected' as const,value:{mode:'same_as_start' as const}}};
 const request=choice.homepageTripTypeRequest(initial,'one_way');
 assert.equal(request.conflict,null);assert.equal(request.snapshot.journeyEnd.state,'selected');
 assert.equal(choice.homepageTripTypeRequest(request.snapshot,'return_to_start').conflict,null);
 const explicit={...initial,journeyEnd:{state:'selected' as const,value:{mode:'explicit' as const,place:{name:'Rome',canonicalPlaceId:'rome'}}}};
 assert.equal(choice.homepageTripTypeRequest(explicit,'return_to_start').conflict,'endpoint');
 assert.equal(choice.homepageTripTypeRequest(explicit,'one_way').snapshot.journeyEnd.state,'selected');
 const described={...initial,mode:'describe' as const,prompt:'A round-trip journey through Japan'};
 assert.equal(choice.homepageTripTypeRequest(described,'one_way',choice.homepageCapturedRouteEvidence(described.prompt)).conflict,'trip_type');
});
test('chip ordering maps intent IDs to separate occurrences and rejects unresolved grouped and shared bindings',()=>{
 assert.equal(typeof order.builderChipOccurrenceOrder,'function');
 const route=requireReadableTripDocument(canonicalRouteFixture()).brief.intent.route;
 const ids=route.destinations.map(i=>i.id).reverse();
 assert.deepEqual(order.builderChipOccurrenceOrder(route,ids),[...route.orderedStopIds].reverse());
 route.destinations[2].selectedPlace={...route.destinations[0].selectedPlace!};
 assert.deepEqual(order.builderChipOccurrenceOrder(route,ids),[...route.orderedStopIds].reverse(),'same canonical place does not merge visits');
 for(const change of [{resolution:'unresolved' as const},{kind:'planning_area' as const},{stopIds:[]},{stopIds:[route.orderedStopIds[0]]}]){
  const altered=structuredClone(route);Object.assign(altered.destinations[2],change);assert.equal(order.builderChipOccurrenceOrder(altered,ids),null);
 }
});
test('absent or invalid nearby coordinates cannot bypass Porto cross-country confirmation',()=>{
 assert.equal(typeof resolution.geocodeNearbyContext,'function');
 for(const query of ['place=Porto','nearLat=&nearLon=','nearLat=abc&nearLon=0','nearLat=91&nearLon=0','nearLat=0']){
  const nearby=resolution.geocodeNearbyContext(new URLSearchParams(query));assert.equal(nearby,undefined,query);
  assert.equal(resolution.needsDestinationConfirmation(['Brazil','Portugal'],Boolean(nearby)),true);
 }
 assert.deepEqual(resolution.geocodeNearbyContext(new URLSearchParams('nearLat=0&nearLon=0')),[0,0]);
});
test('generated blank retired days do not require visible review while snapshots and ambiguous authored fields survive',()=>{
 const t=requireReadableTripDocument(canonicalRouteFixture()),stop=t.stops[0];
 const day={...t.planItems[0],id:t.id+'-calendar:'+stop.id+':0:1',type:'open' as const,title:`Flexible day in ${stop.name}`,reason:'Plan this day around your preferences.',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null};
 const before={...t,planItems:[day],brief:{...t.brief,dayNotes:undefined,customActivities:undefined,itineraryIdeas:[],mapPins:[]}};
 const next=retained.retainRemovedAuthoredContent(before,{...before,planItems:[]});
 assert.equal(next.brief.retainedAuthoredContent!.entries.length,1,'recovery snapshot is preserved');
 assert.deepEqual(retained.retainedAuthoredContentForReview(next),[]);
 next.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.notes=['A traveller reminder'];
 assert.equal(retained.retainedAuthoredContentForReview(next).length,1);
 next.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.notes=[];
 next.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.title='My private day';
 assert.equal(retained.retainedAuthoredContentForReview(next).length,1,'ambiguous authorship stays visible');
 next.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.title=day.title;
 Object.assign(next.brief.retainedAuthoredContent!.entries[0].days[0],{futureAuthoredNote:'Keep this field'});
 assert.equal(retained.retainedAuthoredContentForReview(next).length,1,'unknown future authored fields stay reviewable');
});

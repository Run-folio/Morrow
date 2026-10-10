import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { prepareAcceptedBuilderEdit, builderStructuralSnapshot } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { allRequiredStaysHaveNights, generatedFlexibleStopIds } from '../lib/easyt/trip-builder-generated-nights.ts';
import { allocateTripNights } from '../lib/easyt/night-allocation.ts';
import type { BuilderAcceptedEdit } from '../lib/easyt/trip-builder-edit.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
function fixture(){
 const t=requireReadableTripDocument(canonicalRouteFixture());t.endDate='2026-10-24';
 t.stops=t.stops.slice(0,2).map(s=>({...s,nights:7}));
 t.planItems=[];t.brief.bookings=[];t.brief.manualNightStopIds=[];
 t.brief.intent.route.orderAuthority='optimizable';t.brief.intent.route.orderedStopIds=t.stops.map(s=>s.id);
 t.brief.intent.route.destinations=t.brief.intent.route.destinations.slice(0,2).map(i=>({...i,requestedNights:null}));
 t.brief.nightAllocations={tokyo:7,kyoto:7};
 t.brief.nightAllocation=allocateTripNights({totalNights:14,stops:t.stops});
 t.brief.nightAllocation.stops=t.brief.nightAllocation.stops.map(s=>({...s,nights:7,isManual:false,isFixed:false}));
 t.brief.nightAllocation.allocations={tokyo:7,kyoto:7};
 return t;
}
function edit(t:CanonicalEasyTTrip,e:BuilderAcceptedEdit){const r=prepareAcceptedBuilderEdit(t,e,builderDocumentFingerprint(t));assert.ok(r.ok);return r.trip;}
function add(t:CanonicalEasyTTrip,id:string){return edit(t,{kind:'add-destination',intent:{id:`intent:${id}`,sourceText:'Hiroshima',kind:'overnight_place',selectedPlace:{name:'Hiroshima',canonicalPlaceId:'place:hiroshima',country:'Japan'},resolution:'resolved',requestedNights:null,routeMembership:'required',stopIds:[id]},stop:{...t.stops[0]!,id,name:'Hiroshima',canonicalPlaceId:'place:hiroshima',order:t.stops.length,nights:null,arrivalDate:null,departureDate:null}});}
test('generated 7/7 stays admit three useful additions within the unchanged budget and order',()=>{
 let t=fixture();const source=structuredClone(t);for(const id of ['a','b','c'])t=add(t,id);
 assert.equal(t.stops.reduce((s,x)=>s+(x.nights??0),0),14);
 assert.ok(t.stops.every(s=>(s.nights??0)>0));
 assert.deepEqual(t.brief.manualNightStopIds,[]);
 assert.ok(t.brief.intent.route.destinations.every(i=>i.requestedNights===null));
 assert.equal(t.endDate,source.endDate);assert.deepEqual(t.stops.map(s=>s.id),['tokyo','kyoto','a','b','c']);
 assert.ok(t.brief.nightAllocation!.stops.every(s=>s.isManual===false));
});
test('blank generated days retain flexible provenance after JSON object key reordering',()=>{
 const t=fixture();
 t.planItems=t.stops.map((stop,index)=>({id:`${t.id}-calendar:${stop.id}:${index}`,stopId:stop.id,date:t.startDate,dayNumber:index+1,type:'open',title:`Flexible day in ${stop.name}`,reason:'Plan this day around your preferences.',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}));
 const expected=[...generatedFlexibleStopIds(t)];assert.equal(expected.length,2);
 t.planItems=t.planItems.map(day=>Object.fromEntries(Object.entries(day).reverse()) as typeof day);
 assert.deepEqual([...generatedFlexibleStopIds(t)],expected);
 assert.ok(add(t,'a').stops.every(stop=>(stop.nights??0)>0));
});
for(const protection of ['request','manual','unknown','legacy','booked','locked','authored','explicit-zero'])test(`${protection} nights are protected across additions and subsequent additions`,()=>{
 let t=fixture();
 if(protection==='request')t.brief.intent.route.destinations.forEach(i=>i.requestedNights=7);
 if(protection==='manual')t.brief.manualNightStopIds=t.stops.map(s=>s.id);
 if(protection==='unknown')delete t.brief.nightAllocation;
 if(protection==='legacy')t.brief.intent.route.orderAuthority='legacy_preserved';
 if(protection==='booked')t.brief.bookings=[{id:'b',type:'stay',title:'Booked trip',date:null,confirmation:'protected',url:null}];
 if(protection==='locked')t.brief.scheduleLocks={stopIds:t.stops.map(s=>s.id),arrivalDates:{}};
 if(protection==='authored')t.planItems=t.stops.map((s,i)=>({id:`authored:${i}`,stopId:s.id,dayNumber:i+1,date:t.startDate,type:'activity',title:'My day',reason:'',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}));
 if(protection==='explicit-zero'){t.stops[0]!.nights=0;t.stops[1]!.nights=14;t.brief.intent.route.destinations[0]!.requestedNights=0;t.brief.intent.route.destinations[1]!.requestedNights=14;}
 const values=t.stops.map(s=>s.nights);t=add(t,'a');t=add(t,'b');
 assert.deepEqual(t.stops.slice(0,2).map(s=>s.nights),values);
 assert.ok(t.stops.slice(2).every(s=>(s.nights??0)===0));
});
test('held unresolved request reserves its budget and resolution binds it once',()=>{
 let t=fixture();t.brief.intent.route.destinations.push({id:'held',sourceText:'Osaka',kind:'overnight_place',selectedPlace:null,resolution:'unresolved',requestedNights:4,routeMembership:'required',stopIds:[]});
 t=add(t,'a');assert.equal(t.stops.reduce((s,x)=>s+(x.nights??0),0),10);
 t=edit(t,{kind:'resolve-destination',intentId:'held',stopId:'held-stop',place:{name:'Osaka',canonicalPlaceId:'place:osaka',country:'Japan',coordinates:[135.5,34.7]}});
 assert.equal(t.stops.find(s=>s.id==='held-stop')!.nights,4);assert.equal(t.stops.reduce((s,x)=>s+(x.nights??0),0),14);
});
test('night increment marks only the deliberate target manual; decrement and removal release nights',()=>{
 let t=add(fixture(),'a');const old=t.stops[0]!.nights!;
 t=edit(t,{kind:'nights',stopId:'tokyo',intentId:'intent:tokyo',nights:old+1});
 assert.equal(t.stops[0]!.nights,old+1);assert.equal(t.stops.reduce((s,x)=>s+(x.nights??0),0),14);assert.deepEqual(t.brief.manualNightStopIds,['tokyo']);
 const others=t.stops.slice(1).map(s=>s.nights);
 t=edit(t,{kind:'nights',stopId:'tokyo',intentId:'intent:tokyo',nights:old});assert.deepEqual(t.stops.slice(1).map(s=>s.nights),others);
 const counts=t.stops.filter(s=>s.id!=='a').map(s=>s.nights);
 t=edit(t,{kind:'remove-destination',intentId:'intent:a'});assert.deepEqual(t.stops.map(s=>s.nights),counts);
});
test('structural Undo restores generated counts/provenance and stale source cannot allocate',()=>{
 const t=fixture(),snapshot=builderStructuralSnapshot(t);const next=add(t,'a');
 const r=prepareAcceptedBuilderEdit(next,{kind:'nights',stopId:'tokyo',intentId:'intent:tokyo',nights:8},builderDocumentFingerprint(t));assert.deepEqual(r,{ok:false,reason:'stale-source'});
 const undone=edit(next,{kind:'structural-inverse',snapshot});assert.deepEqual(undone.stops,t.stops);
 assert.ok(add(undone,'b').stops.every(s=>(s.nights??0)>0));
});

test('matching total is not completion when a required stay has no nights',()=>{const t=fixture();t.stops[0]!.nights=14;t.stops[1]!.nights=0;assert.equal(allRequiredStaysHaveNights(t),false);t.stops[1]!.nights=1;assert.equal(allRequiredStaysHaveNights(t),true);});

test('accepted date shortening rebalances only proven generated stays to the new night budget',()=>{
 const t=fixture();const next=edit(t,{kind:'dates',startDate:t.startDate,endDate:'2026-10-21'});
 assert.equal(next.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),11);
 assert.deepEqual(next.stops.map(stop=>stop.id),t.stops.map(stop=>stop.id));
 assert.deepEqual(next.brief.manualNightStopIds,[]);
 assert.equal(next.brief.nightAllocation!.state,'allocated');
});

test('adding a further base to an already resolved planning area keeps generated stays within the budget',()=>{
 const t=fixture();const [a,b]=t.brief.intent.route.destinations;
 t.brief.intent.route.destinations=[{...a!,id:'area:japan',kind:'planning_area',selectedPlace:{name:'Japan',country:'Japan',canonicalPlaceId:'japan'},stopIds:[...a!.stopIds,...b!.stopIds],requestedNights:null}];
 const next=edit(t,{kind:'replace-destination',intentId:'area:japan',stopId:'hiroshima',place:{name:'Hiroshima',country:'Japan',canonicalPlaceId:'place:hiroshima',coordinates:[132.46,34.39]}});
 assert.equal(next.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),14);
 assert.ok(next.stops.every(stop=>(stop.nights??0)>0));
 assert.deepEqual(next.brief.intent.route.destinations[0]!.stopIds,['tokyo','kyoto','hiroshima']);
 assert.deepEqual(next.brief.manualNightStopIds,[]);
});

test('a requested planning-area budget is shared only by its generated member bases',()=>{
 const t=fixture();
 const area=t.brief.intent.route.destinations[0]!;
 area.kind='planning_area';area.selectedPlace={name:'Japan',country:'Japan',canonicalPlaceId:'japan'};
 area.requestedNights=7;
 const next=edit(t,{kind:'replace-destination',intentId:area.id,stopId:'hiroshima',place:{name:'Hiroshima',country:'Japan',canonicalPlaceId:'place:hiroshima',coordinates:[132.46,34.39]}});
 const members=next.stops.filter(stop=>next.brief.intent.route.destinations[0]!.stopIds.includes(stop.id));
 assert.equal(members.reduce((sum,stop)=>sum+(stop.nights??0),0),7);
 assert.ok(members.every(stop=>(stop.nights??0)>0));
 assert.equal(next.stops.find(stop=>stop.id==='kyoto')?.nights,7);
 assert.equal(next.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),14);
 assert.deepEqual(next.brief.manualNightStopIds,[]);
 const reduced=edit(next,{kind:'remove-destination',intentId:area.id,stopId:'hiroshima'});
 assert.equal(reduced.stops.find(stop=>stop.id==='tokyo')?.nights,7);
 assert.equal(reduced.stops.find(stop=>stop.id==='kyoto')?.nights,7);
 assert.equal(reduced.brief.intent.route.destinations[0]?.requestedNights,7);
});

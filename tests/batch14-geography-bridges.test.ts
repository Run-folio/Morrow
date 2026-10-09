import assert from 'node:assert/strict';
import test from 'node:test';
import {acceptedGeographicPlace,geographicallyReady,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {createHomeTripDraft,projectHomepageInput} from '../lib/easyt/home-trip-handoff.ts';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
import {emptyHomepageInput,selectedEntry} from './fixtures/homepage-dual-entry.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {buildBuilderRoutePreview} from '../lib/easyt/trip-builder-route-preview.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {resolveTypedJourneyEndpoint} from '../lib/easyt/journey-endpoints.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {tripFromBuilder} from '../lib/easyt/trip.ts';

const originCandidate={name:'London',country:'United Kingdom',canonicalPlaceId:'london',providerId:'fixture:london',coordinates:[-.1276,51.5072] as [number,number],placeType:'city',routability:'direct_destination'};
const origin=acceptedGeographicPlace(originCandidate,originCandidate,'endpoint')!;

test('selected provider origin and overnight destination retain binding through homepage projection and JSON',()=>{
 const entry=selectedEntry('tokyo-1','Tokyo');
 entry.selection={...entry.selection!,coordinates:[139.6917,35.6895],provenance:[{id:'fixture:tokyo',kind:'provider',label:'Synthetic provider city',supports:'Controlled entity semantics'}]};
 const snapshot={...emptyHomepageInput('owner-a'),origin:{state:'selected' as const,value:origin},entries:[entry]};
 const result=projectHomepageInput({snapshot,profile:null,handoffId:'binding-handoff'});
 assert.ok(result.ok);if(!result.ok)return;
 const draft=JSON.parse(JSON.stringify(result.draft));
 assert.equal(geographicallyReady(draft.routeIntent.origin,'endpoint'),true);
 assert.deepEqual(draft.routeIntent.origin.geographicBinding,origin.geographicBinding);
 assert.equal(geographicallyReady(draft.destinations[0]),true);
 assert.equal(draft.destinations[0].providerId,'fixture:tokyo');
});

test('Describe capture retains already accepted canonical origin evidence',()=>{
 const draft=createHomeTripDraft({capture:captureJourneyBrief('Tokyo and Kyoto'),origin,handoffId:'capture-proof',datesExplicit:false,startDate:'',endDate:'',travellers:2,travellersExplicit:false,interests:[]});
 assert.equal(geographicallyReady(draft.routeIntent?.origin,'endpoint'),true);
 assert.deepEqual(draft.routeIntent?.origin?.geographicBinding,origin.geographicBinding);
});
test('initial Builder construction preserves the canonical origin evidence and uses it for its arrival leg',()=>{
 const draft=createHomeTripDraft({capture:captureJourneyBrief('Tokyo and Kyoto'),origin,handoffId:'construction-proof',datesExplicit:false,startDate:'',endDate:'',travellers:2,travellersExplicit:false,interests:[]});
 const tokyo=acceptedGeographicPlace({name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo'},
   {name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo',providerId:'fixture:tokyo',coordinates:[139.6917,35.6895],placeType:'city',routability:'direct_destination'})!;
 const trip=tripFromBuilder({id:'construction-proof',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,
   originCoordinates:origin.coordinates,routeIntent:draft.routeIntent,journeyEnd:{mode:'same_as_start'},stops:[{id:'tokyo',...tokyo,country:tokyo.country!}],
   startDate:'2026-10-01',endDate:'2026-10-02',nightAllocations:{tokyo:1},picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[]});
 assert.deepEqual(trip.brief.intent.route.origin?.geographicBinding,origin.geographicBinding);
 assert.equal(geographicallyReady(trip.brief.intent.route.origin,'endpoint'),true);
 assert.deepEqual(trip.legs[0]!.fromEndpoint?.geographicBinding,origin.geographicBinding);
 assert.notEqual(trip.legs[0]!.routeMetadata.source,'unverified-geography');
});

test('typed exact provider endpoint retains compatible entity evidence',()=>{
 const resolved=resolveTypedJourneyEndpoint('London',[originCandidate]);
 assert.equal(resolved.status,'resolved');if(resolved.status!=='resolved')return;
 assert.equal(geographicallyReady(resolved.place,'endpoint'),true);
});

test('route preview preserves endpoint proof and never changes the canonical saved owner',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture());
 trip.brief.intent.route.origin=origin;
 for(const stop of trip.stops){const place=stopGeographicPlace(stop);const accepted=acceptedGeographicPlace({...place,providerId:`fixture:${stop.id}`},{...place,providerId:`fixture:${stop.id}`,placeType:'city',routability:'direct_destination'})!;stop.providerId=accepted.providerId;stop.geographicBinding=accepted.geographicBinding;}
 const before=JSON.stringify(prepareTripDocumentForWrite(trip));
 const preview=buildBuilderRoutePreview(trip,[trip.stops[1]!.id,trip.stops[0]!.id,trip.stops[2]!.id]);assert.ok(preview.ok);if(!preview.ok)return;
 assert.deepEqual(preview.trip.legs[0]!.fromEndpoint?.geographicBinding,origin.geographicBinding);
 assert.equal(preview.trip.legs[0]!.routeMetadata?.source==='unverified-geography',false);
 assert.equal(JSON.stringify(prepareTripDocumentForWrite(trip)),before);
});
test('a new operational occurrence retains accepted provider proof through the handler and reload',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture());
 const place=acceptedGeographicPlace({name:'Osaka',country:'Japan',canonicalPlaceId:'osaka'},
   {name:'Osaka',country:'Japan',canonicalPlaceId:'osaka',providerId:'fixture:osaka',coordinates:[135.5023,34.6937],placeType:'city',routability:'direct_destination'})!;
 const command=builderPlaceCommand(trip,{stopId:'new-osaka',place,requestedNights:2})!;
 const result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(result.ok);if(!result.ok)return;
 const saved=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(result.trip))));
 const stop=saved.stops.find(stop=>stop.id==='new-osaka')!;
 assert.deepEqual(stop.geographicBinding,place.geographicBinding);assert.equal(geographicallyReady(stopGeographicPlace(stop)),true);
});
test('accepted-edit boundary rejects a supplied version-one regional binding instead of saving it',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture()),before=JSON.stringify(trip);
 const incompatible={...origin,geographicBinding:{...origin.geographicBinding!,placeType:'region',routability:'planning_area'}};
 const command=builderPlaceCommand(trip,{stopId:trip.stops[0]!.id,place:incompatible})!;
 const result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.equal(result.ok,false);
 assert.equal(JSON.stringify(trip),before);
});

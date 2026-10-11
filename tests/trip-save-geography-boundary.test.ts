import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {a17TripFixture} from './fixtures/batch14-a17-trip.ts';
import {resolveTripTransferJourneys} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {canonicalTripForOwner,tripBuildDocumentsCanonicalEquivalent} from '../lib/easyt/trip-promotion.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import type {RoadRoutingProvider} from '../lib/easyt/road-routing.ts';
function spy(){let calls=0;const provider:RoadRoutingProvider={provider:'openrouteservice',async route(input){calls++;return{mode:'road',distanceKm:305,durationMinutes:255,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-11',attribution:'Deterministic fixture routing',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates]}}};return{provider,count:()=>calls};}
test('unqualified save/load legs retain exact identity and invoke no provider',async()=>{
 const trip=a17TripFixture(),before=structuredClone(trip),s=spy();const result=await resolveTripTransferJourneys(trip,{provider:s.provider});
 assert.deepEqual(result,before);assert.equal(result,trip);assert.equal(s.count(),0);
 assert.equal(tripBuildDocumentsCanonicalEquivalent(trip,canonicalTripForOwner('owner-a',result),'owner-a'),true);
});
test('mixed saved legs retain unqualified and pending identities without suppressing qualified resolution',async()=>{
 const raw=a17TripFixture(),unqualified=raw.legs[0];
 const qualified=buildCanonicalTripLegs({tripId:'qualified',origin:{name:'Lima',country:'Peru',canonicalPlaceId:'lima',coordinates:[-77.0428,-12.0464]},stops:[{id:'huacachina',canonicalPlaceId:'huacachina',name:'Huacachina',country:'Peru',longitude:-75.7642,latitude:-14.0875,order:0,nights:2,arrivalDate:null,departureDate:null}]})[0];
 const pending={...qualified,id:'qualified-pending',routeMetadata:{source:'necessary-reconciliation',pending:true}};
 const s=spy(),result=await resolveTripTransferJourneys({...raw,legs:[unqualified,pending,qualified]},{provider:s.provider});
 assert.equal(result.legs[0],unqualified);assert.equal(result.legs[1],pending);assert.notEqual(result.legs[2],qualified);assert.equal(s.count(),1);assert.equal(result.legs[2].routeMetadata.source,'multimodal-resolver');console.log('Mixed leg provider counts: unqualified0, qualified-pending0, qualified1');
});
for(const operation of ['load','update','promotion'])test(`actual repository ${operation} preserves canonical unqualified save body`,()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','--loader',fileURLToPath(new URL('./helpers/batch14-repository-loader.mjs',import.meta.url)),fileURLToPath(new URL('./helpers/a17-save-boundary-scenarios.ts',import.meta.url)),operation],{encoding:'utf8',env:{...process.env,BATCH14_API_MOCK:'0',BATCH14_DATABASE_MODE:'fixture',BATCH14_RESOLVER_MODE:'actual'}});
 assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout);
});
test('genuine endpoint and authored-document ACK mismatches remain rejected',()=>{
 const trip=a17TripFixture(),canonical=canonicalTripForOwner('owner-a',trip);
 for(const kind of ['coordinate','nights','activity'] as const){const bad=structuredClone(canonical);
  if(kind==='coordinate')bad.legs[0].fromEndpoint!.coordinates=null;
  if(kind==='nights')bad.stops[0].nights!++;
  if(kind==='activity')bad.planItems[0].notes.push('foreign change');
  assert.equal(tripBuildDocumentsCanonicalEquivalent(trip,bad,'owner-a'),false);
 }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { searchReferencePlaces } from '../lib/easyt/place-reference.server.ts';
import { REFERENCE_SNAPSHOT_ID } from '../lib/easyt/place-reference.ts';
import { acceptedGeographicPlace, geographicallyReady } from '../lib/easyt/geographic-binding.ts';
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { resolveCanonicalTransferJourney } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { landConnectionEvidence } from '../lib/easyt/land-connection.ts';
import type { RoadRoutingProvider } from '../lib/easyt/road-routing.ts';
function reference(name:string,country:string,id:string,role:'endpoint'|'stop') {
 const record=searchReferencePlaces(name,{explicitCountryNames:[country]},{limit:20}).find(c=>c.canonicalPlaceId===id);
 assert.ok(record,`${name} must exist in the actual reference snapshot`);
 const current={...record,name:record.canonicalName,country,coordinates:record.coordinates!,referenceSnapshotId:REFERENCE_SNAPSHOT_ID};
 const accepted=acceptedGeographicPlace({name:record.canonicalName,country,canonicalPlaceId:id},current,role);
 assert.ok(accepted);assert.equal(geographicallyReady(accepted,role),true);return accepted;
}
const cases=[
 ['Lima','Peru','reference:geonames:3936456','New York City','United States','reference:geonames:5128581','flight'],
 // Goa is a region. This control explicitly chooses Panaji as a real city base.
 ['Delhi','India','reference:geonames:1273294','Panaji','India','reference:geonames:1260607','flight'],
 ['Cape Town','South Africa','reference:geonames:3369157','Nairobi','Kenya','reference:geonames:184745','flight'],
 ['Tokyo','Japan','reference:geonames:1850147','Hoi An','Vietnam','reference:geonames:1580541','mixed'],
 // The pinned physical Unguja shoreline now proves continuity for these selected records.
 ['ZNZ','Tanzania','reference:ourairports:3260','Nungwi','Tanzania','reference:geonames:7284275','road'],
] as const;
const provider:RoadRoutingProvider={provider:'openrouteservice',async route(input){return {mode:'road',distanceKm:60,durationMinutes:75,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-10',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Deterministic road control'};}};
for(const [name,country,id,toName,toCountry,toId,expected] of cases)test(`accepted reference control ${name} → ${toName} retains ${expected} transport`,async()=>{
 const from=reference(name,country,id,'endpoint'),to=reference(toName,toCountry,toId,'stop');
 const leg=buildCanonicalTripLegs({tripId:'canonical-control',origin:{...from,coordinates:from.coordinates!},stops:[{id:'to',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],arrivalDate:null,departureDate:null,nights:2}]})[0];
 assert.notEqual(leg.routeMetadata.source,'unverified-geography');
 if(expected==='road')assert.equal(landConnectionEvidence(from.coordinates!,to.coordinates!),'same-land');
 const result=await resolveCanonicalTransferJourney(leg,{provider});assert.equal(result.leg.mode,expected);
 assert.deepEqual(result.leg.fromEndpoint?.coordinates,from.coordinates);assert.deepEqual(result.leg.toEndpoint?.coordinates,to.coordinates);
 if(expected==='mixed')assert.equal(result.leg.segments?.find(s=>s.mode==='flight')?.toEndpoint.canonicalPlaceId,'da-nang');
});

import assert from 'node:assert/strict';
import { searchReferencePlaces } from '../../lib/easyt/place-reference.server.ts';
import { REFERENCE_SNAPSHOT_ID } from '../../lib/easyt/place-reference.ts';
import { acceptedGeographicPlace, geographicallyReady } from '../../lib/easyt/geographic-binding.ts';
import type { TripLeg } from '../../lib/easyt/trip.ts';

/** Explicit pinned selections from the actual reference snapshot, never a blanket fixture binding. */
export function selectedTransferPlace(name:string,country:string,id:string,role:'endpoint'|'stop',canonicalPlaceId=id) {
 const candidate=searchReferencePlaces(name,{explicitCountryNames:[country]},{limit:20}).find(c=>c.canonicalPlaceId===id);
 assert.ok(candidate,`${id} must be a real reference selection`);
 const place=acceptedGeographicPlace({name:candidate.canonicalName,country,canonicalPlaceId},{...candidate,name:candidate.canonicalName,country,referenceSnapshotId:REFERENCE_SNAPSHOT_ID},role);
 assert.ok(place);assert.ok(geographicallyReady(place,role));return place;
}
export function selectTransferLegEndpoints(leg:TripLeg,fromId:string,toId:string) {
 const from=leg.fromEndpoint!,to=leg.toEndpoint!;
 return {...leg,fromEndpoint:{...from,...selectedTransferPlace(from.name,from.country!,fromId,'endpoint')},toEndpoint:{...to,...selectedTransferPlace(to.name,to.country!,toId,'stop')}};
}

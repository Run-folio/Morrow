import {resolveTripTransferJourneys as resolve} from '../../lib/easyt/multimodal-transfer-resolution.ts';
import type {EasyTTrip} from '../../lib/easyt/trip.ts';
import type {RoadRoutingProvider} from '../../lib/easyt/road-routing.ts';
export const providerState={checkedAt:'2026-11-02T17:36:19.000Z',calls:0};
const provider:RoadRoutingProvider={provider:'openrouteservice',async route(input){
 providerState.calls++;
 return {mode:'road',distanceKm:625,durationMinutes:360,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:providerState.checkedAt,profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Synthetic provider only'};
}};
// Real resolver; only the external road-provider boundary is synthetic.
export function resolveTripTransferJourneys(trip:EasyTTrip){return resolve(trip,{provider});}

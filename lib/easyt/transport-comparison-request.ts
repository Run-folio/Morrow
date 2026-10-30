import type {TripLeg} from './trip.ts';
/** Existing client/API budget, also bounds append-only comparison history.
 * Never prune saved evidence to make a refresh fit. */
export const TRANSPORT_COMPARISON_REQUEST_BYTES=100_000;
export function transportComparisonRequestBody(leg:TripLeg):string|null {
  try {
    const body=JSON.stringify({operation:'compare',legs:[leg]});
    return new TextEncoder().encode(body).byteLength<=TRANSPORT_COMPARISON_REQUEST_BYTES?body:null;
  }catch{return null;}
}

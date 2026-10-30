import type {EasyTTrip} from './trip.ts';
import {transportComparisonInput,validateTransportComparison} from './transport-comparison.ts';
import {withTransportComparisonDeadline} from './transport-comparison-operation.ts';

/** One explicit comparison request. No persistence and no automatic retry. */
export function requestTransportComparison(trip:EasyTTrip,legId:string,signal:AbortSignal) {
  const snapshot=structuredClone(trip),input=transportComparisonInput(snapshot,legId);
  return withTransportComparisonDeadline(async operationSignal=>{
    if(!input)throw new Error('Confirm the places for this connection.');
    const body=JSON.stringify({operation:'compare',legs:[input]});
    if(new TextEncoder().encode(body).byteLength>100_000)throw new Error('Connection check is unavailable.');
    const response=await fetch('/api/journey-transfer-resolution',{method:'POST',headers:{'Content-Type':'application/json'},body,cache:'no-store',signal:operationSignal});
    operationSignal.throwIfAborted();
    if(!response.ok)throw new Error('Connection check is unavailable.');
    const raw=await response.json();operationSignal.throwIfAborted();
    const result=validateTransportComparison(snapshot,legId,raw);
    if(!result)throw new Error('Connection evidence could not be verified.');
    return result;
  },{signal});
}

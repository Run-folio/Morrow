import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {japanTrip} from './fixtures/transport-choice.ts';
import {syntheticRoad} from './fixtures/transport-comparison.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {adoptTransportComparison,transportComparisonInput,validateTransportComparison} from '../lib/easyt/transport-comparison.ts';
import {effectiveTripLeg,selectTripLegTransportChoice,supportedTransportChoicesForLeg} from '../lib/easyt/transport-mode-choice.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import type {RoadRoutingProvider} from '../lib/easyt/road-routing.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';
import type {MultimodalResolutionResult} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {server,explicit} from './helpers/transport-revision-server.ts';
import {pathToFileURL} from 'node:url';
import {transportComparisonRequestBody} from '../lib/easyt/transport-comparison-request.ts';
const adoption=process.env.MORROVIA_ADOPTION_BASELINE?(await import(pathToFileURL(process.env.MORROVIA_ADOPTION_BASELINE).href)).adoptTransportComparison:adoptTransportComparison;
const road=(raw:MultimodalResolutionResult)=>raw.diagnostic.candidates.find(c=>c.evidence==='routed_road')!;
function selected(){const t=japanTrip(),choice=supportedTransportChoicesForLeg(t,t.legs[0]).find(c=>c.candidateId==='road:routed')!;return selectTripLegTransportChoice(t,t.legs[0].id,choice.identity)}

test('actual explicit server revision makes changed390→480 reviewable without changing the saved selection or source leg',async()=>{
 const t=selected(),before=authoredContentKey(t),raw=await explicit(t.legs[0]),c=road(raw);
 assert.match(c.id,/^road:routed:revision-v1:[a-f0-9]{64}$/);assert.equal(c.totalDurationMinutes,480);
 assert.deepEqual(raw.leg,JSON.parse(JSON.stringify(t.legs[0])));assert.equal(authoredContentKey(t),before);assert.equal(effectiveTripLeg(t,t.legs[0]).durationMinutes,390);
 const checked=validateTransportComparison(t,t.legs[0].id,raw);assert.ok(checked);
 const next=adoptTransportComparison(t,checked,c.id);assert.notEqual(next,t);assert.equal(effectiveTripLeg(next,next.legs[0]).durationMinutes,480);
 assert.equal(next.legs[0].mode,t.legs[0].mode);assert.deepEqual((next.legs[0].routeMetadata.multimodalResolution as any).candidates.slice(0,2),(t.legs[0].routeMetadata.multimodalResolution as any).candidates);
 const same=validateTransportComparison(next,next.legs[0].id,await explicit(next.legs[0]))!;
 const repeated=adoptTransportComparison(next,same,road(await explicit(next.legs[0])).id);assert.equal(authoredContentKey(repeated),authoredContentKey(next),'identical refresh/Use has no semantic change');assert.equal((repeated.legs[0].routeMetadata.multimodalResolution as any).candidates.length,(next.legs[0].routeMetadata.multimodalResolution as any).candidates.length);
 const automatic=await compareCanonicalTransferJourney(t.legs[0],{provider:syntheticRoad()});assert.equal(road(automatic).id,'road:routed','shared/automatic resolver is unchanged');
});

test('full wire snapshot identity is deterministic across ordering/roundtrip and changes for persisted differences',async()=>{
 const t=selected(),raw=await compareCanonicalTransferJourney(t.legs[0],{provider:syntheticRoad()}),{finalizeTransportComparisonRevisions:finish}=await server();
 const a=finish(raw),id=road(a).id;
 const reorder=(v:any):any=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
 assert.equal(road(finish(reorder(raw))).id,id);assert.equal(road(finish(JSON.parse(JSON.stringify(raw)))).id,id);assert.equal(road(finish(a)).id,id);
 for(const change of [(c:any)=>c.totalDurationMinutes++, (c:any)=>c.score++, (c:any)=>c.reasons.push('Changed reason'),(c:any)=>c.segments[0].provider='Changed provider',(c:any)=>{const a=c.segments[0].fromEndpoint.coordinates,b=c.segments[0].toEndpoint.coordinates;c.segments[0].routeGeometry=[a,[(a[0]+b[0])/2,(a[1]+b[1])/2],b]},(c:any)=>c.futureEvidence={version:1,note:'Full snapshot'}]){
  const changed=structuredClone(raw);change(road(changed));assert.notEqual(road(finish(changed)).id,id);
 }
 const selectedRaw={...raw,diagnostic:{...raw.diagnostic,selectedCandidateId:'road:routed'}};assert.equal(finish(selectedRaw).diagnostic.selectedCandidateId,id);
 for(const c of a.diagnostic.candidates.filter((c:any)=>c.evidence!=='routed_road'))assert.deepEqual(c,raw.diagnostic.candidates.find(v=>v.id===c.id));
 assert.deepEqual(raw.leg,t.legs[0]);
});

test('foreign, malformed, nonroad and policy-controlled records are never rebranded as road revisions',async()=>{
 const raw=await compareCanonicalTransferJourney(japanTrip().legs[0],{provider:syntheticRoad()}),{finalizeTransportComparisonRevisions:finish}=await server();
 for(const change of [(c:any)=>c.id='reviewed-pilot:do-not-rename',(c:any)=>c.evidence='reviewed_composition',(c:any)=>c.provenance='planning_estimate',(c:any)=>c.summaryMode='train',(c:any)=>c.totalDurationMinutes=NaN,(c:any)=>c.score=Infinity,(c:any)=>c.segments[0].fromEndpoint.coordinates=[0,0],(c:any)=>c.segments[0].fromEndpoint={...c.segments[0].fromEndpoint,id:'other'},(c:any)=>c.segments[0].provenance='unknown',(c:any)=>c.segments[0].durationMinutes=-1,(c:any)=>c.distanceKm=-1,(c:any)=>c.segments[0].distanceKm=-1,(c:any)=>c.reasons=[17],(c:any)=>c.confidence='invalid',(c:any)=>c.headlineMinutes=c.totalDurationMinutes+1]){
  const changed=structuredClone(raw);change(road(changed));const before=authoredContentKey(changed.diagnostic.candidates);assert.equal(authoredContentKey(finish(changed).diagnostic.candidates),before);
 }
});

test('same revision-ID collision remains refused and selected/booked snapshots stay exact',async()=>{
 const t=markTransportLegBooked(selected(),japanTrip().legs[0].id,{confirmation:'SYNTHETIC-ONLY',note:'Keep fixture booking'}),before=authoredContentKey(t),bookings=authoredContentKey(t.brief.bookings);
 const raw=await explicit(t.legs[0]),c=validateTransportComparison(t,t.legs[0].id,raw)!;const next=adoptTransportComparison(t,c,road(raw).id);
 assert.equal(authoredContentKey(next.brief.bookings),bookings);assert.equal(authoredContentKey(t),before);
 const collision=structuredClone(raw);road(collision).reasons.push('Conflicting payload under same digest');const check=validateTransportComparison(next,next.legs[0].id,collision)!;assert.ok(check);assert.equal(adoptTransportComparison(next,check,road(raw).id),next);
});

test('new history is refused before exceeding the existing100000-byte request budget without pruning any saved evidence',async()=>{
 let t=selected(),refused=false;
 for(let i=0;i<12;i++){
  const raw=await explicit(t.legs[0]);road(raw).reasons.push('Synthetic retained evidence '+i+' '+ 'x'.repeat(16000));
  // Finalize actual road output again from its logical family after test fixture evidence changed.
  road(raw).id='road:routed';const revised=(await server()).finalizeTransportComparisonRevisions(raw),c=validateTransportComparison(t,t.legs[0].id,revised)!;assert.ok(c);
  const before=authoredContentKey(t),next=adoption(t,c,road(revised).id);
  if(next===t){refused=true;assert.equal(authoredContentKey(t),before);break;}
  const body=JSON.stringify({operation:'compare',legs:[transportComparisonInput(next,next.legs[0].id)]});assert.ok(new TextEncoder().encode(body).byteLength<=100000,'adoption cannot make the next request impossible');
  const old=(t.legs[0].routeMetadata.multimodalResolution as any).candidates;assert.deepEqual((next.legs[0].routeMetadata.multimodalResolution as any).candidates.slice(0,old.length),old);t=next;
 }
 assert.ok(refused,'changed revisions must have a finite deterministic retained-byte bound');
});

test('request budget is exact UTF8 bytes, including100000 boundary and multibyte history',()=>{
 const leg=transportComparisonInput(selected(),selected().legs[0].id)!;
 leg.routeMetadata.fixturePadding='';const size=new TextEncoder().encode(JSON.stringify({operation:'compare',legs:[leg]})).byteLength;
 leg.routeMetadata.fixturePadding='x'.repeat(100000-size);assert.equal(new TextEncoder().encode(transportComparisonRequestBody(leg)!).byteLength,100000);
 leg.routeMetadata.fixturePadding+='x';assert.equal(transportComparisonRequestBody(leg),null);
 leg.routeMetadata.fixturePadding='旅'.repeat(Math.ceil((100001-size)/3));assert.equal(transportComparisonRequestBody(leg),null);
});

test('versioned comparisons retain full stale-basis and duplicate/malformed-response protection',async()=>{
 const t=selected(),raw=await explicit(t.legs[0]),checked=validateTransportComparison(t,t.legs[0].id,raw)!,id=road(raw).id;
 const changed=[{...t,ownerId:'other-owner'},{...t,startDate:'2027-04-02'},{...t,endDate:'2027-04-09'},{...t,stops:[...t.stops].reverse()},{...t,stops:t.stops.map((s,i)=>i?{...s,nights:(s.nights??0)+1}:s)},{...t,stops:[...t.stops,{...t.stops[0],id:'repeated-occurrence'}]},{...t,brief:{...t.brief,bookings:[{id:'new-booking',type:'transport' as const,title:'new',date:null,confirmation:null,url:null}]}},{...t,brief:{...t.brief,decisionSelections:{transportByLeg:{[t.legs[0].id]:'different-choice'}}}},{...t,legs:[{...t.legs[0],routeMetadata:{...t.legs[0].routeMetadata,transportConstraints:{avoidDriving:true}}}]}];
 for(const stale of changed){const before=authoredContentKey(stale);assert.equal(adoptTransportComparison(stale,checked,id),stale);assert.equal(authoredContentKey(stale),before)}
 const duplicate=structuredClone(raw);duplicate.diagnostic.candidates.push(road(duplicate));assert.equal(validateTransportComparison(t,t.legs[0].id,duplicate),null);
 const malformed=structuredClone(raw);road(malformed).totalDurationMinutes=-1;assert.equal(validateTransportComparison(t,t.legs[0].id,malformed),null);
 const forbidden=structuredClone(t);forbidden.brief.intent!.hardConstraints.avoidDriving=true;assert.equal(validateTransportComparison(forbidden,forbidden.legs[0].id,raw),null);
});

test('legacy reader and actual normalization preserve the revision selection, old evidence and booking after owner promotion',async()=>{
 const {canonicalTripForOwner}=await import('../lib/easyt/trip-promotion.ts'),{resolveTripTransferJourneys}=await import('../lib/easyt/multimodal-transfer-resolution.ts');
 let t=markTransportLegBooked(selected(),japanTrip().legs[0].id,{confirmation:'SYNTHETIC-PERSISTENCE'});const raw=await explicit(t.legs[0]),checked=validateTransportComparison(t,t.legs[0].id,raw)!;t=adoptTransportComparison(t,checked,road(raw).id);t=canonicalTripForOwner('synthetic-owner',t);
 const wire=JSON.parse(JSON.stringify(t)),reopened=await resolveTripTransferJourneys(wire,{provider:syntheticRoad(()=>assert.fail('accepted/booked normalization must not call a provider'))});assert.equal(effectiveTripLeg(reopened,reopened.legs[0]).durationMinutes,480);assert.deepEqual(reopened.legs,wire.legs);assert.deepEqual(reopened.brief.bookings,wire.brief.bookings);assert.equal((reopened.legs[0].routeMetadata.multimodalResolution as any).candidates.length,3);
});

test('large synthetic routed geometry is refused before retained request history overflows',async()=>{
 const t=selected(),raw=await explicit(t.legs[0]),c=road(raw),a=c.segments[0].fromEndpoint.coordinates!,b=c.segments[0].toEndpoint.coordinates!;
 c.id='road:routed';c.segments[0].routeGeometry=Array.from({length:5000},(_,i)=>[a[0]+(b[0]-a[0])*i/4999,a[1]+(b[1]-a[1])*i/4999]);const revised=(await server()).finalizeTransportComparisonRevisions(raw),checked=validateTransportComparison(t,t.legs[0].id,revised);assert.ok(checked,'fixture geometry remains eligible evidence');const before=authoredContentKey(t);assert.equal(adoptTransportComparison(t,checked,road(revised).id),t);assert.equal(authoredContentKey(t),before);
});

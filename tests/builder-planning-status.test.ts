import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as status from '../lib/easyt/builder-planning-status.ts';
import {transportAssessmentState,itineraryTransportAgendaStatus} from '../lib/easyt/itinerary-transport-agenda.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/main-staging-africa-control.json',import.meta.url),'utf8'));
const fresh=()=>requireReadableTripDocument(structuredClone(fixture));
const insufficient={retrieval:'completed',evidence:'insufficient',retryable:false} as const;
test('matched main planning rows survive staging assessment and cold reopen without changing evidence',()=>{
 const trip=fresh(),before=JSON.stringify(trip);assert.deepEqual(trip.legs.map(l=>l.durationMinutes),[945,300,null,300,375]);
 for(const [i,leg]of trip.legs.entries()){
  assert.equal(status.builderHasUsablePlanningTransfer(trip,leg,insufficient),i!==2);
  assert.equal(status.builderHasUsablePlanningTransfer(trip,leg),i!==2);
  assert.equal(transportAssessmentState(trip,leg,insufficient),'unknown','no upgrade to verified transport support');
  assert.equal(itineraryTransportAgendaStatus(leg,null),'confirm','booking confirmation unchanged');
 }
 assert.equal(JSON.stringify(trip),before);
});
test('deferred optional recommendations do not indicate active necessary work',()=>{
 const trip=fresh(),before=JSON.stringify(trip);assert.ok(trip.brief.cascadeStatus!.routeReconciliation!.residual.every(u=>u.kind==='recommendation'&&u.phase==='pending'));
 assert.deepEqual(status.builderDetailsStatus(trip,'en'),{state:'saved',label:'Details up to date'});
 assert.deepEqual(status.builderDetailsStatus(trip,'es'),{state:'saved',label:'Datos actualizados'});assert.equal(JSON.stringify(trip),before);
});
for(const phase of ['pending','failed','conflict'] as const)test(`necessary ${phase} work and failed/conflicting optional work remain visible`,()=>{
 const trip=fresh(),units=trip.brief.cascadeStatus!.routeReconciliation!.residual;
 units.push({kind:'leg',targetId:trip.legs[0].id,basisKey:'fixture',phase});
 assert.equal(status.builderDetailsStatus(trip,'en').state,phase==='pending'?'saving':phase==='failed'?'error':'device');
 if(phase!=='pending'){units.pop();units[0].phase=phase;assert.equal(status.builderDetailsStatus(trip,'en').state,phase==='failed'?'error':'device');}
});
for(const retrieval of ['checking','unavailable','blocked','not-attempted'] as const)test(`${retrieval} does not disappear behind a prior flight estimate`,()=>{
 const trip=fresh(),leg=trip.legs[0],evidence={retrieval,evidence:'insufficient' as const,reason:'configuration_unavailable' as const,retryable:false};
 assert.equal(status.builderHasUsablePlanningTransfer(trip,leg,evidence),false);
 if(retrieval==='unavailable'||retrieval==='blocked'){
  assert.equal(status.builderDetailsStatus(trip,'en',[{legId:leg.id,state:evidence}]).label,'Review needed');
  assert.equal(status.builderDetailsStatus(trip,'es',[{legId:leg.id,state:evidence}]).label,'Revisión necesaria');
 }
 if(retrieval!=='not-attempted')assert.equal(status.builderDetailsStatus(trip,'en',[{legId:leg.id,state:evidence}]).state,retrieval==='checking'?'saving':'error');
});
test('unqualified geography and invalid duration cannot become useful planning through the display',()=>{
 for(const invalid of ['geography','zero','nan']){const trip=fresh(),leg=trip.legs[0];
  if(invalid==='geography'){trip.stops[0].longitude=1;trip.stops[0].latitude=1;}
  else {leg.durationMinutes=invalid==='zero'?0:NaN;leg.doorToDoorMinutes=leg.durationMinutes;}
  assert.equal(status.builderHasUsablePlanningTransfer(trip,leg,insufficient),false);
 }
});

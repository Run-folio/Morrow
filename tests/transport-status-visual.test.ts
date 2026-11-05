import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {transportPresentationState} from '../lib/easyt/itinerary-transport-agenda.ts';
import {isPassengerServiceLeg,transportBookingMarkedByTraveller,markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import {transferTimingLabel} from '../lib/easyt/transfer-timing-label.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
const source=readFileSync('components/easyt/trip-transport-workspace.tsx','utf8');
const ast=ts.createSourceFile('transport.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const card=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='TransportCard') as ts.FunctionDeclaration;
const presentation=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='presentationLabel')!;
const copy=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='copyFor'))!;
const wanted=new Set(['durationMinutes','state','isNotBooked','status','showsEstimatedTiming','showStatus','statusTone','StatusIcon']);
const declarations=card.body!.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>wanted.has(d.name.getText(ast))));
const script=ts.transpileModule(`${copy.getText(ast)}\n${presentation.getText(ast)}\nconst leg=item.leg,copy=copyFor(language);\n${declarations.map(d=>d.getText(ast)).join('\n')}\nreturn {status,showStatus,statusTone,icon:StatusIcon,showsEstimatedTiming};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const run=new Function('item','language','transportPresentationState','isPassengerServiceLeg','transportBookingMarkedByTraveller','transferTimingLabel','Check','Circle','AlertTriangle',script);
function project(leg:ReturnType<typeof japanTrip>['legs'][number],booking:unknown=null,manualBooking:unknown=null,language='en'){return run({leg,booking,manualBooking},language,transportPresentationState,isPassengerServiceLeg,transportBookingMarkedByTraveller,transferTimingLabel,'check','circle','warning');}
test('actual booked projection uses check/success and retains manual-recording qualification',()=>{
 const trip=japanTrip(),leg=trip.legs[0],booking=markTransportLegBooked(trip,leg.id).brief.bookings![0];
 const actual=project(leg,booking,booking);assert.equal(actual.statusTone,'booked');assert.equal(actual.icon,'check');
 assert.equal(actual.status,'Booked · marked by you');assert.equal(actual.showStatus,true);
 assert.equal(project(leg,{type:'transport'}).status,'Booked');
});
test('Not booked is neutral/circle even when timing or schedules need checking',()=>{
 const source=japanTrip().legs[0];
 for(const leg of [source,{...source,durationMinutes:null,doorToDoorMinutes:null,confidence:'unknown' as const}]){
  const actual=project(leg);assert.equal(actual.status,'Not booked');assert.equal(actual.statusTone,'not-booked');assert.equal(actual.icon,'circle');
 }
 assert.equal(project(source,null,{travellerMarkedBooked:false}).status,'Not booked');
});
test('unknown journey has a warning triangle and checking label in both locales',()=>{
 const leg={...japanTrip().legs[0],mode:'unknown' as const,durationMinutes:null,doorToDoorMinutes:null};
 assert.deepEqual([project(leg).status,project(leg).statusTone,project(leg).icon],['Needs checking','attention','warning']);
 assert.equal(project(leg,null,null,'es').status,'Necesita comprobarse');
});
test('planning confidence stays with timing instead of becoming a booking badge',()=>{
 const leg={...japanTrip().legs[0],mode:'road' as const,provider:'Road route estimate',provenance:'routing_engine' as const,confidence:'high' as const,scheduleNeedsChecking:false};
 assert.equal(project(leg).status,'Planning estimate');assert.equal(project(leg).showStatus,false);
 const bookedEstimate=project({...leg,mode:'flight',provenance:'planning_estimate'},{type:'transport'});
 assert.equal(bookedEstimate.status,'Booked');assert.equal(bookedEstimate.showsEstimatedTiming,true);
});

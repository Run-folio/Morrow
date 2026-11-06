import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {builderBookingStopIds} from '../lib/easyt/builder-booking-stop-association.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';

import {repeatedTokyoTrip} from './fixtures/repeated-tokyo-stay.ts';

const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='protectedBuilderStopIds')expression=n.initializer!.getText(ast);ts.forEachChild(n,walk)}walk(ast);
function actualProtected(trip:ReturnType<typeof repeatedTokyoTrip>,extra:Record<string,unknown>={}){const bindings={builderBookingStopIds,canonicalBuilder:trip,scheduleLocks:trip.brief.scheduleLocks,projectedFixedCommitments:[],useMemo:(fn:()=>unknown)=>fn(),...extra};const js=ts.transpileModule(`const value=${expression}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('bindings',`with(bindings){${js};return value;}`)(bindings) as string[];}
test('bound outbound booking protects its occurrence, not a later zero-night Tokyo stay',()=>{
 const trip=repeatedTokyoTrip(),locked=actualProtected(trip);assert.ok(locked.includes(trip.stops[0]!.id));assert.equal(locked.includes('tokyo-return-stay'),false,'a repeated place name is not a booking occurrence binding');
});
test('transport booking endpoints remain protected even when labels become stale',()=>{
 const trip=repeatedTokyoTrip(),booking=trip.brief.bookings![0]!;booking.title='Tokyo';booking.transportLegBinding!.toLabel='Old label';assert.deepEqual(builderBookingStopIds(trip,booking),[trip.stops[0]!.id]);
});
test('a booked terminal Tokyo visit protects only that occurrence and never the return endpoint as a stay',()=>{
 const trip=repeatedTokyoTrip(),leg=trip.legs.find(l=>l.toStopId==='tokyo-return-stay')!;leg.mode='flight';const booked=markTransportLegBooked(trip,leg.id);const binding=booked.brief.bookings!.at(-1)!;
 assert.deepEqual(builderBookingStopIds(booked,binding),[leg.fromStopId,'tokyo-return-stay']);assert.ok(actualProtected(requireReadableTripDocument(booked)).includes('tokyo-return-stay'));
 const departure=trip.legs.find(l=>l.classification==='departure')!;departure.mode='flight';const returning=markTransportLegBooked(trip,departure.id);assert.deepEqual(builderBookingStopIds(returning,returning.brief.bookings!.at(-1)!),['tokyo-return-stay']);
});
test('exact saved stays and imported leg IDs precede repeated title matches',()=>{
 const trip=repeatedTokyoTrip(),first=trip.stops[0]!,booking=trip.brief.bookings![0]!;
 assert.deepEqual(builderBookingStopIds(trip,{...booking,type:'stay',id:`stay-${first.id}`,transportLegBinding:undefined}),[first.id]);
 assert.deepEqual(builderBookingStopIds(trip,{...booking,id:`transport-${trip.legs[0]!.id}`,transportLegBinding:undefined}),[first.id]);
 trip.legs[0]!.routeMetadata.importedBookingId='imported-outbound';assert.deepEqual(builderBookingStopIds(trip,{...booking,id:'imported-outbound',transportLegBinding:undefined}),[first.id]);
});
test('legacy ambiguous bookings and explicit schedule locks retain conservative protection',()=>{
 const trip=repeatedTokyoTrip(),booking=trip.brief.bookings![0]!;delete booking.transportLegBinding;booking.id='unbound-legacy-flight';assert.deepEqual(builderBookingStopIds(trip,booking),[trip.stops[0]!.id,'tokyo-return-stay']);
 trip.brief.bookings=[];trip.brief.scheduleLocks={stopIds:['tokyo-return-stay'],arrivalDates:{}};assert.ok(actualProtected(trip).includes('tokyo-return-stay'));
});
test('one-way repeated stays can change nights and be removed without a fabricated return or lost booking',()=>{
 let trip=repeatedTokyoTrip(false),bookings=structuredClone(trip.brief.bookings);assert.equal(actualProtected(trip).includes('tokyo-return-stay'),false);
 const nights=prepareBuilderHandlerEdit(trip,{kind:'nights',intentId:'builder-intent:tokyo-return-stay',stopId:'tokyo-return-stay',nights:1},builderDocumentFingerprint(trip));assert.ok(nights.ok);if(!nights.ok)return;trip=requireReadableTripDocument(JSON.parse(JSON.stringify(nights.trip)));assert.equal(trip.stops.at(-1)!.nights,1);
 const removed=prepareBuilderHandlerEdit(trip,{kind:'remove-destination',intentId:'builder-intent:tokyo-return-stay'},builderDocumentFingerprint(trip));assert.ok(removed.ok);if(!removed.ok)return;assert.equal(removed.trip.stops.some(s=>s.id==='tokyo-return-stay'),false);assert.deepEqual(removed.trip.brief.bookings,bookings);assert.equal(removed.trip.legs.some(l=>l.classification==='departure'),false);
});
test('an explicitly undone manual booking has no active booking lock',()=>{
 const trip=repeatedTokyoTrip(),booking=trip.brief.bookings![0]!;booking.travellerMarkedBooked=false;assert.deepEqual(builderBookingStopIds(trip,booking),[]);assert.deepEqual(actualProtected(trip),[]);
});
test('legacy date-only removal confirmation survives without assigning an exact bound booking to another occurrence',()=>{
 const trip=repeatedTokyoTrip(),booking={...trip.brief.bookings![0]!,id:'legacy-hotel',type:'stay' as const,title:'Hotel reservation',date:trip.stops[0]!.arrivalDate,transportLegBinding:undefined};
 assert.deepEqual(builderBookingStopIds(trip,booking),[]);assert.deepEqual(builderBookingStopIds(trip,booking,{includeLegacyDateOnly:true}),[trip.stops[0]!.id]);
 assert.deepEqual(builderBookingStopIds(trip,{...trip.brief.bookings![0]!,date:trip.stops[1]!.arrivalDate},{includeLegacyDateOnly:true}),[trip.stops[0]!.id]);
});

for(const broken of ['deleted-endpoint','deleted-leg','contradictory-endpoint'] as const)test(`${broken} booking references retain conservative protection and original booking bytes`,()=>{
 const trip=repeatedTokyoTrip(),booking=trip.brief.bookings![0]!;
 if(broken==='deleted-endpoint')booking.transportLegBinding!.toEndpointId='old-deleted-stop';
 if(broken==='deleted-leg'){booking.transportLegBinding!.legId='old-deleted-leg';booking.transportLegBinding!.toEndpointId='tokyo-return-stay';}
 if(broken==='contradictory-endpoint')booking.transportLegBinding!.toEndpointId=trip.stops[1]!.id;
 const original=JSON.stringify(trip),associated=builderBookingStopIds(trip,booking),removal=builderBookingStopIds(trip,booking,{includeLegacyDateOnly:true});
 assert.ok(associated.includes(trip.stops[0]!.id),'the current booked arrival occurrence remains protected');
 assert.ok(associated.includes('tokyo-return-stay'),'ambiguous Tokyo title is not silently narrowed by stale identity');
 assert.ok(removal.includes(trip.stops[0]!.id),'removal retains a booking association requiring review');
 if(broken==='contradictory-endpoint')assert.ok(associated.includes(trip.stops[1]!.id),'surviving contradictory explicit reference remains protected');
 assert.ok(actualProtected(trip).includes('tokyo-return-stay'));
 assert.equal(JSON.stringify(trip),original);
});

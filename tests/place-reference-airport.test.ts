import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchReferencePlaces, referencePlaceById} from '../lib/easyt/place-reference.server.ts';
import {referenceKnownCodeKind} from '../lib/easyt/place-reference.ts';

test('IATA and ICAO resolve physical gateways with separate source-validated flags',()=>{
 for(const code of ['GUA','LHR','JFK','SYD','CDG','NRT','ICN']){
  const candidates=searchReferencePlaces(` ${code.toLowerCase()} `,{});const first=candidates[0];
  assert.ok(first,code);assert.equal(first.placeType,'transport_gateway');assert.equal(first.matchedAirportCode,code);assert.equal(first.routability,'direct_destination');
  const r=referencePlaceById(first.providerId.split('@')[0])!;assert.equal(r.iataCode,code);assert.deepEqual(first.coordinates,r.coordinates);assert.ok(r.scheduledService,code);
  if(r.icaoCode){const icao=searchReferencePlaces(r.icaoCode,{}).find(c=>c.providerId===first.providerId)!;assert.equal(icao.matchedIcaoCode,r.icaoCode);assert.equal(icao.matchedAirportCode,undefined);}
 }
 assert.equal(referenceKnownCodeKind('nyc'),'metro');assert.equal(referenceKnownCodeKind('SEL'),'metro');
 assert.equal(referenceKnownCodeKind(' mggt '),'icao');
 for(const code of ['NYC','SEL','QQQQ','L-H-R'])assert.ok(searchReferencePlaces(code,{}).every(c=>!c.matchedAirportCode&&!c.matchedIcaoCode));
 assert.ok(searchReferencePlaces('LHR',{explicitCountryNames:['France']}).every(c=>!c.matchedAirportCode));
});

test('closed airports are excluded and non-scheduled gateways are explicit choices only',()=>{
 const rows=JSON.parse(readFileSync('data/place-reference/airports.json','utf8'));
 const closed=rows.find((r:any[])=>r[5]==='closed_airport'&&r[6]);
 // This snapshot has no coded closed rows; the generator fixture covers closed exclusion.
 if(closed)assert.ok(searchReferencePlaces(closed[6],{}).every(c=>c.providerId.split('@')[0]!==`reference:ourairports:${closed[0]}`));
 const unscheduled=rows.find((r:any[])=>r[5]!=='closed_airport'&&!r[8]&&r[6]);assert.ok(unscheduled);
 const choice=searchReferencePlaces(unscheduled[6],{}).find(c=>c.providerId.split('@')[0]===`reference:ourairports:${unscheduled[0]}`);assert.ok(choice);assert.match(choice.providerSourceLabel!,/no scheduled passenger service/i);
 assert.ok(searchReferencePlaces(unscheduled[1],{}).every(c=>c.providerId!==choice.providerId));
});

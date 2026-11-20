import assert from 'node:assert/strict';
import test from 'node:test';
import {tripFromBuilder, type TripBooking} from '../lib/easyt/trip.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {prepareAcceptedBuilderEdit} from '../lib/easyt/trip-builder-edit.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {prepareBuilderNecessaryProjection} from '../lib/easyt/trip-builder-reconciliation.ts';
import {itineraryTransportAgenda} from '../lib/easyt/itinerary-transport-agenda.ts';

const places = {
  p1: {name:'Paris', country:'France', coordinates:[2.35,48.85] as [number,number]},
  m1: {name:'Madrid', country:'Spain', coordinates:[-3.7,40.42] as [number,number]},
};
function fixture(ids: string[] = ['p1','m1','p2']) {
  const stops = ids.map(id => ({id, ...(id.startsWith('p') ? places.p1 : places.m1)}));
  return requireReadableTripDocument(tripFromBuilder({id:'synthetic-edit', origin:'London', originCoordinates:[-0.13,51.5], originCountry:'United Kingdom',
    journeyEnd:{mode:'same_as_start'}, startDate:'2027-01-01', endDate:'2027-01-08', stops,
    nightAllocations:{p1:1,m1:2,p2:4}, picks:{}, mustDo:'', pace:'slow', hotels:'few', budget:'mid', draft:[]}));
}
const record = (date: string | null): TripBooking => ({id:'imported-synthetic-ticket', type:'transport', title:'Paris to Madrid train', date,
  confirmation:'SYNTH', url:null, transportDetails:{mode:'train',from:'Paris',to:'Madrid'}});
const bookedRows = (t: ReturnType<typeof fixture>) => itineraryTransportAgenda(t).filter(r=>r.status==='booked').map(r=>[r.from.id,r.to.id]);
test('reordering repeated Paris occurrences never moves an unbound January 2 booking to a January 5 departure after reopen',()=>{
  const t=fixture();const saved=record('2027-01-02');t.brief.bookings=[structuredClone(saved)];
  assert.deepEqual(bookedRows(t),[['p1','m1']]);
  const e=prepareAcceptedBuilderEdit(t,{kind:'order',stopIds:['p2','m1','p1'],source:'drag'},builderDocumentFingerprint(t));assert.ok(e.ok);
  const n=prepareBuilderNecessaryProjection(t,e.trip,e.scope);assert.ok(n.ok);
  const reopened=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(n.trip))));
  assert.deepEqual(itineraryTransportAgenda(reopened).map(r=>[r.from.id,r.to.id,r.date]),[
    ['synthetic-edit-origin','p2','2027-01-01'],['p2','m1','2027-01-05'],['m1','p1','2027-01-07'],['p1','synthetic-edit-end','2027-01-08']]);
  assert.deepEqual(bookedRows(reopened),[]);assert.deepEqual(reopened.brief.bookings,[saved]);assert.deepEqual(bookedRows(t),[['p1','m1']]);
});
test('a uniquely matching local departure date stays booked even when arrival falls the next day',()=>{
  const t=fixture();t.stops[1].arrivalDate='2027-01-03';t.planItems.filter(day=>day.stopId==='m1').forEach(day=>day.date='2027-01-03');
  t.brief.bookings=[record('2027-01-02')];assert.deepEqual(bookedRows(t),[['p1','m1']]);
  t.brief.bookings=[record('2027-01-03')];assert.deepEqual(bookedRows(t),[]);
});
test('ambiguous and undated repeated pairs are never booked from names alone',()=>{
  const t=fixture(['p1','m1','p2','m2']);t.brief.bookings=[record(null)];
  assert.deepEqual(bookedRows(t),[]);
  t.stops.find(s=>s.id==='p2')!.departureDate=t.stops.find(s=>s.id==='p1')!.departureDate;
  t.brief.bookings=[record(t.stops[0].departureDate)];assert.deepEqual(bookedRows(t),[]);
});
test('an undated legacy ticket still matches a unique unrepeated route, but never an ambiguous repeated city',()=>{
  const simple=fixture(['p1','m1']);simple.brief.bookings=[record(null)];assert.deepEqual(bookedRows(simple),[['p1','m1']]);
  const repeated=fixture();repeated.brief.bookings=[record(null)];assert.deepEqual(bookedRows(repeated),[]);
});
test('a missing departure date on another possible occurrence cannot establish a unique dated match',()=>{
  const t=fixture(['p1','m1','p2','m2']);t.brief.bookings=[record(t.stops[0].departureDate)];
  t.stops.find(s=>s.id==='p2')!.departureDate=null;assert.deepEqual(bookedRows(t),[]);
});

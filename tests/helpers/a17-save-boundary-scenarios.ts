import assert from 'node:assert/strict';
import { state } from './batch14-server-fixtures.ts';
import { a17TripFixture } from '../fixtures/batch14-a17-trip.ts';
import { canonicalTripForOwner, tripBuildDocumentsCanonicalEquivalent } from '../../lib/easyt/trip-promotion.ts';
import { getTripForOwner, saveTripForOwner, promoteTripForOwner } from '../../lib/easyt/repository.ts';
import { requireReadableTripDocument } from '../../lib/easyt/trip-document.ts';
const trip=requireReadableTripDocument(canonicalTripForOwner('owner-a',a17TripFixture()));
const mode=process.argv[2];
if(mode==='load'){
state.rows=[[{document:trip}]];state.queries=[];
const loaded=await getTripForOwner('owner-a',trip.id);
assert.deepEqual(loaded,trip,'load retains complete canonical document');assert.equal(state.queries.length,1);
}
const checkSubmitted=(kind:string,source:typeof trip)=>{
 const query=state.queries.find(q=>q.text.includes(`morrovia.${kind}_document`)&&q.text.includes('set_config'))!;
 assert.ok(query);const submitted=requireReadableTripDocument(JSON.parse(query.values[0] as string));
 assert.equal(tripBuildDocumentsCanonicalEquivalent(source,submitted,'owner-a'),true,`${kind} exact ACK comparison`);
 assert.deepEqual(submitted.legs,JSON.parse(JSON.stringify(canonicalTripForOwner('owner-a',source).legs)),`${kind} exact original unqualified legs`);
 return submitted;
};
const count=7+trip.stops.length+trip.legs.length+trip.planItems.length+trip.recommendations.length;
if(mode==='update'){
state.queries=[];state.rows=Array.from({length:count},(_,i)=>i===2?[{document:trip}]:[]);
await saveTripForOwner('owner-a',trip);checkSubmitted('save',trip);
assert.equal(state.queries.filter(q=>q.text.includes('with saved as')).length,1);
}
if(mode==='promotion'){
const guest=requireReadableTripDocument({...a17TripFixture(),ownerId:null,status:"draft"});const owned=canonicalTripForOwner('owner-a',guest);
state.queries=[];state.rows=[...Array.from({length:count},(_,i)=>i===2?[{id:guest.id}]:[]),[{owner_id:'owner-a',document:owned,deleted_at:null,matches:true}]];
assert.equal((await promoteTripForOwner('owner-a',guest)).outcome,'promoted');checkSubmitted('promotion',guest);
assert.equal(state.queries.filter(q=>q.text.includes('with inserted as')).length,1);
}
console.log(`Actual repository ${mode} path PASS: exact unqualified leg payload and ACK equality; ${mode==='load'?'1read,0writes':'1document-write'}. SQL is fixture-backed, not database qualification.`);

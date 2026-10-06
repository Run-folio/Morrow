import assert from 'node:assert/strict';
import { legacyRouteFixture } from '../fixtures/batch14-route-documents.ts';
import { getEasyTDatabase, closeBatch14Database } from './batch14-repository-db.ts';
import { promoteTripForOwner, saveTripForOwner, getTripForOwner, archiveTripForOwner, restoreTripForOwner } from '../../lib/easyt/repository.ts';
import { EasyTTripSaveConflictError } from '../../lib/easyt/trip-continuity.ts';
const sql=getEasyTDatabase();
async function snapshot(){return Promise.all(['easyt_trips','easyt_stops','easyt_legs','easyt_plan_items','easyt_recommendations'].map(async table=>{
 // Only fixed test table identifiers; parameterize data in actual repository queries.
 const parts=Object.assign([`select to_jsonb(t) as row from ${table} t order by id`],{raw:[]}) as unknown as TemplateStringsArray;
 return sql(parts);
}));}
try{
 await sql`insert into easyt_users(id,email) values ('owner-a','batch14-a@example.invalid'),('owner-b','batch14-b@example.invalid')`;
 const legacy=legacyRouteFixture();const promoted=await promoteTripForOwner('owner-a',{...legacy,ownerId:null,status:'draft'});
 assert.equal(promoted.outcome,'promoted');assert.equal(promoted.trip.schemaVersion,2);
 const before=await snapshot();const conflicting=await promoteTripForOwner('owner-a',{...legacy,ownerId:null,title:'Unaccepted replacement'});
 assert.equal(conflicting.outcome,'conflict');assert.deepEqual(await snapshot(),before);
 await assert.rejects(promoteTripForOwner('owner-b',{...legacy,ownerId:null}));assert.deepEqual(await snapshot(),before);
 const sameToken=promoted.trip;
 const saves=await Promise.allSettled([saveTripForOwner('owner-a',{...sameToken,title:'Winner candidate A'}),saveTripForOwner('owner-a',{...sameToken,title:'Winner candidate B'})]);
 assert.equal(saves.filter(result=>result.status==='fulfilled').length,1);
 const loser=saves.find(result=>result.status==='rejected');assert.ok(loser?.status==='rejected'&&loser.reason instanceof EasyTTripSaveConflictError);
 const current=(await getTripForOwner('owner-a',sameToken.id))!;const winner=await snapshot();
 const old={...legacy,ownerId:'owner-a',updatedAt:current.updatedAt,title:'Old client overwrite'};
 await assert.rejects(saveTripForOwner('owner-a',old,{sourceSchemaVersion:1}),EasyTTripSaveConflictError);assert.deepEqual(await snapshot(),winner);
 assert.equal((await archiveTripForOwner('owner-a',current.id))?.status,'archived');assert.equal((await restoreTripForOwner('owner-a',current.id))?.schemaVersion,2);
}finally{await closeBatch14Database();}

import assert from 'node:assert/strict';
import { state } from './batch14-server-fixtures.ts';
import { legacyRouteFixture, canonicalRouteFixture } from '../fixtures/batch14-route-documents.ts';
import { TripDocumentReadError } from '../../lib/easyt/trip-document.ts';
const legacy=legacyRouteFixture();
if(process.argv[2]==='repository'){
 const repo=await import('../../lib/easyt/repository.ts');
 for(const trip of [legacy,canonicalRouteFixture()]){
  state.rows=[[{document:trip}]];assert.equal((await repo.listTripsForOwner('owner-a'))[0].schemaVersion,2);
  for(const read of [repo.getTripForOwner]){
   state.rows=[[{document:trip}]];assert.equal((await read('owner-a',trip.id))?.schemaVersion,2);
  }
 }
 for(const read of [()=>repo.listTripsForOwner('owner-a'),()=>repo.getTripForOwner('owner-a',legacy.id)]){
  state.rows=[[{document:{...legacy,schemaVersion:3}}]];await assert.rejects(read(),TripDocumentReadError);
 }
 for(const action of [repo.archiveTripForOwner,repo.restoreTripForOwner]){
  state.rows=[[{document:legacy}],[],[],[{document:canonicalRouteFixture()}]];
  assert.equal((await action('owner-a',legacy.id))?.schemaVersion,2);
 }
 const candidate=canonicalRouteFixture();
 const count=7+candidate.stops.length+candidate.legs.length+candidate.planItems.length+candidate.recommendations.length;
 state.rows=[...Array.from({length:count},()=>[]),[{ownerId:'owner-a',deletedAt:null,document:candidate}]];
 state.queries=[];
 await assert.rejects(repo.saveTripForOwner('owner-a',legacy,{sourceSchemaVersion:1}));
 const update=state.queries.find(query=>query.text.includes('with saved as'));
 assert.ok(update?.text.includes('schema_version < 2'));assert.ok(update?.values.includes(1));
 assert.ok(state.queries.filter(query=>query.text.includes('easyt_stops')||query.text.includes('easyt_legs')).every(query=>query.text.includes('save_won')));
 const previews=await import('../../lib/easyt/trip-copilot-previews.server.ts');
 state.rows=[[{resultDocument:legacy}]];assert.equal((await previews.getTripCopilotPreviewRecord('owner-a',legacy.id,'preview'))?.resultTrip?.schemaVersion,2);
 state.rows=[[{resultDocument:{...legacy,schemaVersion:3}}]];await assert.rejects(previews.getTripCopilotPreviewRecord('owner-a',legacy.id,'preview'),TripDocumentReadError);
}else{
 const collection=await import('../../app/api/easyt/trips/route.ts');
 const item=await import('../../app/api/easyt/trips/[tripId]/route.ts');
 const promote=await import('../../app/api/easyt/trips/[tripId]/promote/route.ts');
 const context={params:Promise.resolve({tripId:legacy.id})};
 for(const handler of [(req:Request)=>collection.POST(req),(req:Request)=>item.PUT(req,context)]){
  state.calls=[];const response=await handler(new Request('http://local/api',{method:'POST',body:JSON.stringify(legacy)}));
  assert.equal(response.status,200);assert.equal((state.calls[0][1] as typeof legacy).schemaVersion,2);
  assert.deepEqual(state.calls[0][2],{sourceSchemaVersion:1});
  const future=await handler(new Request('http://local/api',{method:'POST',body:JSON.stringify({...legacy,schemaVersion:3})}));assert.equal(future.status,400);
 }
 state.calls=[];const response=await promote.POST(new Request('http://local/api',{method:'POST',body:JSON.stringify({...legacy,ownerId:null})}),context);
 assert.equal(response.status,201);assert.equal((state.calls[0][1] as typeof legacy).schemaVersion,2);
 const booking=await import('../../app/api/journey-booking-readiness/route.ts');
 assert.equal((await booking.POST(new Request('http://local/api',{method:'POST',body:JSON.stringify({trip:canonicalRouteFixture()})}))).status,200);
}

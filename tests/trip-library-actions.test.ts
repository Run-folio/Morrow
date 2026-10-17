import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {tripDisplayTitle} from '../lib/easyt/trip-display.ts';
import {runClientMutation} from '../lib/easyt/client-mutation.ts';

const require=createRequire(import.meta.url);
function deferred(){let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return{promise,resolve};}
function harness(patch:any={}){
  const states:any[]=[],effects:Array<()=>void>=[];let cursor=0;
  const calls:any[]=[],reconciled:any[]=[],completed:any[]=[];
  const trip={id:'fixture-trip',ownerId:'owner-a',title:'Fixture trip',brief:{origin:'London'},stops:[]};
  let reply:any=Response.json({trip}),options:any={ownerId:'owner-a',ownerScope:'owner-a:trip-a',boundary:'current',language:'en',refresh:()=>completed.push('refresh'),onDelete:()=>completed.push('leave-deleted-trip'),...patch};
  const react={useState:(initial:any)=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef:(initial:any)=>states[cursor++]??={current:initial},useEffect:(effect:any,deps:any[])=>{const i=cursor++;if(!(i in states)){states[i]=true;const cleanup=effect();if(cleanup)effects.push(cleanup);}}};
  const source=readFileSync(new URL('../components/easyt/use-trip-library-actions.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}as any},imports:any={react,'@/lib/easyt/trip-display':{tripDisplayTitle},'@/lib/easyt/client-mutation':{runClientMutation},'@/lib/easyt/storage':{reconcileTripCloudMutation:async(...args:any[])=>{reconciled.push(args);}}};
  const scope={fetch:async(url:string,init:any)=>{calls.push({url,...init});return reply instanceof Promise?await reply:reply;}};
  new Function('require','module','exports','scope',`with(scope){${js}}`)((id:string)=>imports[id]??require(id),module,module.exports,scope);
  const render=()=>{cursor=0;return module.exports.useTripLibraryActions(options);};
  return{trip,calls,reconciled,completed,render,setReply:(value:any)=>{reply=value;},change:(value:any)=>{options={...options,...value};render();},unmount:()=>effects.forEach(fn=>fn())};
}

for(const boundary of ['pending','expired','mismatch','signed-out'])test(`${boundary} account boundary cannot start any library action`,async()=>{
  const h=harness({boundary}),a=h.render();await a.runAction(h.trip.id,'archive');a.requestDelete(h.trip);a.openGift(h.trip);await h.render().sendGift();assert.equal(h.calls.length,0);assert.equal(h.render().pendingDelete,null);assert.equal(h.render().gifting,null);
});
test('guest scope has no account mutation path',async()=>{const h=harness({ownerId:''}),a=h.render();await a.runAction(h.trip.id,'duplicate');a.requestDelete({...h.trip,ownerId:null});a.openGift({...h.trip,ownerId:null});assert.equal(h.calls.length,0);assert.equal(h.render().gifting,null);});
test('archive,restore and duplicate reuse the existing PATCH contract and exact owner acknowledgement',async()=>{
  for(const action of ['archive','restore','duplicate']){const h=harness();if(action==='duplicate')h.setReply(Response.json({trip:{...h.trip,id:'fixture-copy'}}));await h.render().runAction(h.trip.id,action);assert.deepEqual(JSON.parse(h.calls[0].body),{action});assert.equal(h.calls[0].method,'PATCH');assert.deepEqual(h.completed,['refresh']);assert.equal(h.reconciled.length,action==='duplicate'?0:1);if(action!=='duplicate')assert.deepEqual(h.reconciled[0].slice(0,3),['owner-a',h.trip.id,action]);}
});
test('wrong-owner or wrong-source acknowledgements cannot reconcile or report success',async()=>{
  for(const patch of [{ownerId:'owner-b'},{id:'another-trip'}]){const h=harness();h.setReply(Response.json({trip:{...h.trip,...patch}}));await h.render().runAction(h.trip.id,'archive');assert.deepEqual(h.reconciled,[]);assert.deepEqual(h.completed,[]);assert.ok(h.render().actionError);}
});
test('delete requires an explicit confirmation intent and reconciles only after successful DELETE',async()=>{
  const h=harness();h.render().requestDelete(h.trip);assert.equal(h.calls.length,0);h.render().setPendingDelete(null);assert.equal(h.calls.length,0);h.render().requestDelete(h.trip);h.setReply(new Response(null,{status:204}));await h.render().remove(h.trip);assert.equal(h.calls[0].method,'DELETE');assert.deepEqual(h.reconciled,[['owner-a',h.trip.id,'delete']]);assert.deepEqual(h.completed,['leave-deleted-trip']);assert.equal(h.render().pendingDelete,null);
});
test('failed DELETE preserves the confirmation and its error without reconciling recovery',async()=>{
  const h=harness();h.render().requestDelete(h.trip);h.setReply(Response.json({error:'fixture failure'},{status:500}));await h.render().remove(h.trip);assert.ok(h.render().deleteError);assert.equal(h.render().pendingDelete.id,h.trip.id);assert.deepEqual(h.reconciled,[]);assert.deepEqual(h.completed,[]);
});
test('pending save refusal prevents account actions without issuing a request',async()=>{
  const h=harness({beforeAction:async()=>false});await h.render().runAction(h.trip.id,'archive');h.render().requestDelete(h.trip);await h.render().remove(h.trip);assert.equal(h.calls.length,0);assert.ok(h.render().deleteError);
});
test('an owner switch while waiting for the save boundary retires the action before fetch',async()=>{
  const gate=deferred(),h=harness({beforeAction:()=>gate.promise});const action=h.render().runAction(h.trip.id,'archive');h.change({ownerId:'owner-b',ownerScope:'owner-b:trip-b',boundary:'current'});gate.resolve(true);await action;assert.equal(h.calls.length,0);assert.deepEqual(h.completed,[]);
});
test('late account response after scope change cannot reconcile or populate another trip',async()=>{
  const gate=deferred(),h=harness();h.setReply(gate.promise);const action=h.render().runAction(h.trip.id,'archive');h.change({ownerScope:'owner-a:trip-b'});gate.resolve(Response.json({trip:h.trip}));await action;assert.deepEqual(h.reconciled,[]);assert.deepEqual(h.completed,[]);assert.equal(h.render().actionNotice,null);
});
test('gift submission retains recipient confirmation and the existing idempotent request contract',async()=>{
  const h=harness();h.render().openGift(h.trip);assert.equal(h.calls.length,0);h.render().setGiftEmail('friend@example.test');h.render().setGiftNote('A fixture note');h.setReply(Response.json({error:'temporary'},{status:503}));await h.render().sendGift();const key=h.calls[0].headers['idempotency-key'];assert.ok(key);h.setReply(Response.json({claimUrl:'https://fixture.invalid/claim',delivered:false}));await h.render().sendGift();assert.equal(h.calls.length,2);assert.equal(h.calls[1].headers['idempotency-key'],key);assert.deepEqual(JSON.parse(h.calls[1].body),{email:'friend@example.test',note:'A fixture note'});assert.equal(h.render().giftState,'complete');assert.deepEqual(h.reconciled,[]);
});
test('an owner switch retires an open gift and ignores its late response',async()=>{
  const gate=deferred(),h=harness();h.render().openGift(h.trip);h.render().setGiftEmail('friend@example.test');h.setReply(gate.promise);const sending=h.render().sendGift();h.change({ownerId:'owner-b',ownerScope:'owner-b:trip-b'});gate.resolve(Response.json({claimUrl:'https://fixture.invalid/old-owner',delivered:true}));await sending;assert.equal(h.render().gifting,null);assert.equal(h.render().claimUrl,'');
});

test('A→B→A cannot revive an action waiting for the original save boundary',async()=>{
  const gate=deferred(),h=harness({beforeAction:()=>gate.promise});const action=h.render().runAction(h.trip.id,'archive');h.change({ownerScope:'owner-b:trip-b'});h.change({ownerScope:'owner-a:trip-a'});gate.resolve(true);await action;assert.equal(h.calls.length,0);assert.equal(h.render().actionNotice,null);
});
test('A→B→A cannot revive a stale successful response or an unsent dialog',async()=>{
  const gate=deferred(),h=harness();h.render().requestDelete(h.trip);h.render().openGift(h.trip);h.setReply(gate.promise);const action=h.render().runAction(h.trip.id,'archive');h.change({ownerScope:'owner-b:trip-b'});h.change({ownerScope:'owner-a:trip-a'});gate.resolve(Response.json({trip:h.trip}));await action;assert.deepEqual(h.reconciled,[]);assert.deepEqual(h.completed,[]);assert.equal(h.render().pendingDelete,null);assert.equal(h.render().gifting,null);assert.equal(h.render().actionNotice,null);
});
test('an obsolete finally cannot release the new action slot after a scope cycle',async()=>{
  const old=deferred(),current=deferred(),h=harness();h.setReply(old.promise);const first=h.render().runAction(h.trip.id,'archive');h.change({ownerScope:'owner-a:trip-b'});h.change({ownerScope:'owner-a:trip-a'});h.setReply(current.promise);const second=h.render().runAction(h.trip.id,'archive');old.resolve(Response.json({trip:h.trip}));await first;await h.render().runAction(h.trip.id,'duplicate');assert.equal(h.calls.length,2);current.resolve(Response.json({trip:h.trip}));await second;assert.deepEqual(h.completed,['refresh']);
});
test('unmount retires a response and prevents stale event handlers from starting more work',async()=>{
  const gate=deferred(),h=harness();h.setReply(gate.promise);const old=h.render(),action=old.runAction(h.trip.id,'archive');h.unmount();gate.resolve(Response.json({trip:h.trip}));await action;old.openGift(h.trip);await old.runAction(h.trip.id,'duplicate');assert.equal(h.calls.length,1);assert.deepEqual(h.reconciled,[]);assert.deepEqual(h.completed,[]);
});

test('the real settled-copy query reads current recovery refs even before React renders a failed ACK',()=>{
  const source=readFileSync(new URL('../components/easyt/use-trip-mutation-persistence.ts',import.meta.url),'utf8');
  const start=source.indexOf('  const isAccountCopySettled = useCallback('),end=source.indexOf('\n  const adoptDeviceTrip',start);assert.ok(start>=0&&end>start);
  const scope:any={useCallback:(fn:any)=>fn,enabled:true,initialTrip:{id:'trip-a',ownerId:'owner-a'},session:{user:{id:'owner-a'}},tripRef:{current:{id:'trip-a',ownerId:'owner-a'}},recoveryReadyRef:{current:true},conflictRef:{current:false},recoveryHandleRef:{current:null},hasPendingSaves:()=>false,scopeIsCurrent:()=>true};
  const js=ts.transpileModule(source.slice(start,end)+'\nreturn isAccountCopySettled;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const ready=new Function('scope',`with(scope){${js}}`)(scope);assert.equal(ready(),true);
  for(const [ref,value]of [['recoveryReadyRef',false],['conflictRef',true],['recoveryHandleRef',{writeId:'unacknowledged'}]]as const){const old=scope[ref].current;scope[ref].current=value;assert.equal(ready(),false);scope[ref].current=old;}
  scope.hasPendingSaves=()=>true;assert.equal(ready(),false);scope.hasPendingSaves=()=>false;scope.tripRef.current={id:'trip-b',ownerId:'owner-a'};assert.equal(ready(),false);scope.tripRef.current={id:'trip-a',ownerId:'owner-b'};assert.equal(ready(),false);
});

test('starting a new owner action cannot retag a retired gift,recipient or deletion intent',async()=>{
  const h=harness();h.render().openGift(h.trip);h.render().setGiftEmail('private-owner-a@example.test');h.render().requestDelete(h.trip);
  const next={...h.trip,id:'trip-b',ownerId:'owner-b'};h.change({ownerId:'owner-b',ownerScope:'owner-b:trip-b'});h.setReply(Response.json({trip:next}));await h.render().runAction(next.id,'archive');const state=h.render();assert.equal(state.gifting,null);assert.equal(state.pendingDelete,null);assert.equal(state.giftEmail,'');assert.equal(state.claimUrl,'');
});
test('a new action after A→B→A does not revive an old confirmation or gift',async()=>{
  const h=harness();h.render().requestDelete(h.trip);h.render().openGift(h.trip);h.change({ownerScope:'owner-a:trip-b'});h.change({ownerScope:'owner-a:trip-a'});await h.render().runAction(h.trip.id,'archive');assert.equal(h.render().pendingDelete,null);assert.equal(h.render().gifting,null);await h.render().remove(h.trip);assert.equal(h.calls.length,1,'no current confirmation means no DELETE');
});

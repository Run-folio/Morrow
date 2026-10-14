import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {pendingIntakeContinuation,createPendingIntakeReceipt,acknowledgePendingIntakeReceiptInStorage,HOME_TRIP_DRAFT_KEY} from '../lib/easyt/home-trip-handoff.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {saveTripRecoveryToStorage} from '../lib/easyt/storage.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {prepareIntakeAcknowledgement,createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';

class MemoryStorage {values=new Map<string,string>();quota=false;get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){if(this.quota)throw new DOMException('Synthetic only','QuotaExceededError');this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}
function fixture(){const f=homeRecoveryFixture('owner-a');f.snapshot.revision=95;const pending=createPendingIntakeReceipt(f.snapshot,{handoffId:f.intake.completed.handoffId,tripId:f.trip.id});const storage=new MemoryStorage(),snapshot={...f.snapshot,revision:97},inputRaw=JSON.stringify({snapshot,receipt:pending});storage.setItem(homepageInputStorageKey('owner-a'),inputRaw);storage.setItem(HOME_TRIP_DRAFT_KEY,JSON.stringify({version:2,phase:'pending-interpretation',receipt:pending}));return{...f,pending,storage,snapshot,inputRaw};}

test('exact resumed input witness completes the frozen receipt while preserving its semantically identical newer editable snapshot',async()=>{
 const f=fixture();const result=await acknowledgePendingIntakeReceiptInStorage({storage:f.storage,pending:f.pending,completed:f.intake.completed,draft:f.draft,fromHomepage:true,resumedInputRaw:f.inputRaw,isCurrent:()=>true} as Parameters<typeof acknowledgePendingIntakeReceiptInStorage>[0]);
 assert.equal(result.ok,true);const stored=JSON.parse(f.storage.getItem(homepageInputStorageKey('owner-a'))!);assert.deepEqual(stored.snapshot,JSON.parse(JSON.stringify(f.snapshot)));assert.deepEqual(stored.receipt,f.intake.completed);assert.equal(f.trip.ownerId,'owner-a');assert.equal(f.pending.frozenSnapshot.revision,95);
});
test('resumed input acknowledgement refuses a changed witness or different semantic input without writing either copy',async()=>{
 for(const mode of ['raw','meaning','owner']as const){const f=fixture();if(mode==='meaning')f.storage.setItem(homepageInputStorageKey('owner-a'),JSON.stringify({snapshot:{...f.snapshot,dates:{state:'selected',value:{start:'2026-11-01',end:'2026-11-08'}}},receipt:f.pending}));if(mode==='owner')f.pending={...f.pending,ownerId:'owner-b'};const before=[...f.storage.values];const result=await acknowledgePendingIntakeReceiptInStorage({storage:f.storage,pending:f.pending,completed:f.intake.completed,draft:f.draft,fromHomepage:true,resumedInputRaw:mode==='raw'?f.inputRaw+' ':f.storage.getItem(homepageInputStorageKey('owner-a')),isCurrent:()=>true} as Parameters<typeof acknowledgePendingIntakeReceiptInStorage>[0]);assert.equal(result.ok,false);assert.deepEqual([...f.storage.values],before);}
});

function continuation(f:ReturnType<typeof fixture>,changes:Record<string,unknown>={}){return pendingIntakeContinuation({ownerId:'owner-a',inputRaw:f.storage.getItem(homepageInputStorageKey('owner-a')),draftRaw:f.storage.getItem(HOME_TRIP_DRAFT_KEY),recovery:{ownerId:'owner-a',tripId:f.trip.id,state:'pending',trip:{...f.trip,ownerId:null}},...changes});}
test('continuation validates the frozen input and owner-scoped ownerless recovery without assigning ownership',()=>{
 const f=fixture(),token=continuation(f);assert.ok(token);assert.equal(token.pending?.inputRevision,95);assert.equal(token.resumedInputRaw,f.inputRaw);assert.equal(token.receipt.tripId,f.trip.id);
});
test('continuation refuses another input, envelope, recovery intent, owner or status',()=>{
 for(const variant of ['input','envelope','intent','scope','owner','owned','status','planned']as const){const f=fixture();const recovery={ownerId:'owner-a',tripId:f.trip.id,state:'pending',trip:{...f.trip,ownerId:null as string|null}};let extra:Record<string,unknown>={recovery};if(variant==='input')extra.inputRaw=JSON.stringify({snapshot:{...f.snapshot,dates:{state:'cleared'}},receipt:f.pending});if(variant==='envelope')extra.draftRaw=JSON.stringify({version:2,phase:'pending-interpretation',receipt:{...f.pending,handoffId:'other'}});if(variant==='intent')recovery.trip={...recovery.trip,startDate:'2026-12-01'};if(variant==='scope')recovery.ownerId='owner-b';if(variant==='owner')recovery.trip.ownerId='owner-b';if(variant==='owned')recovery.trip.ownerId='owner-a';if(variant==='status')recovery.state='conflict';if(variant==='planned')recovery.trip={...recovery.trip,status:'planned'};const before=[...f.storage.values];assert.equal(continuation(f,extra),null,variant);assert.deepEqual([...f.storage.values],before);}
});

test('the same continuation can acknowledge its exact completed pair again after a pointer-only interruption',async()=>{
 const f=fixture();const input={storage:f.storage,pending:f.pending,completed:f.intake.completed,draft:f.draft,fromHomepage:true,resumedInputRaw:f.inputRaw,isCurrent:()=>true};
 assert.equal((await acknowledgePendingIntakeReceiptInStorage(input)).ok,true);
 assert.equal((await acknowledgePendingIntakeReceiptInStorage(input)).ok,true);
 const changed=JSON.parse(f.storage.getItem(homepageInputStorageKey('owner-a'))!);changed.snapshot.revision++;f.storage.setItem(homepageInputStorageKey('owner-a'),JSON.stringify(changed));const before=[...f.storage.values];
 assert.equal((await acknowledgePendingIntakeReceiptInStorage(input)).ok,false);assert.deepEqual([...f.storage.values],before);
});


test('matching resumed recovery completes through the real paired broker in native and quota modes; owner stays null',async()=>{
 for(const quota of [false,true]){const f=fixture(),driver=new MemoryRecoveryDriver(),context={ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true},trip={...f.trip,ownerId:null};
 const prior=saveTripRecoveryToStorage(f.storage,trip,{ownerId:'owner-a',writeId:'observed'});assert.equal(prior.stored,true);const token=continuation(f);assert.ok(token);const before=[...f.storage.values];f.storage.quota=quota;
 const intake={pending:token.pending,completed:token.receipt,draft:token.draft,fromHomepage:true,resumedInputRaw:token.resumedInputRaw};
 const prepared=await prepareIntakeAcknowledgement(f.storage,driver,context,intake,trip,'resume-entry');assert.equal(prepared.ok,true);if(!prepared.ok)continue;
 const broker=createTwoStoreTripPersistence(f.storage,driver,context),saved=await broker.save(trip,{replace:prior.handle,expectedRecoverySource:trip,newTripOrClone:true,writeId:'resumed',entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:'owner-a',tripId:trip.id,writeId:'resumed'},input:null,receipt:prepared.receipt}});
 assert.equal(saved.stored,true);assert.equal(saved.receiptAcknowledged,true);assert.equal(saved.pointerAcknowledged,true);
 const reopened=await broker.read(trip.id);assert.equal(reopened.kind,'found');if(reopened.kind==='found')assert.equal(reopened.trip.ownerId,null);
 const home=await createDurableHomepagePersistence(f.storage,driver,context).read();assert.equal(home.kind,'ready');if(home.kind==='ready'){assert.equal(home.storedInput?.snapshot.revision,97);assert.equal(home.storedInput?.receipt?.version,1);}
 if(quota)assert.deepEqual([...f.storage.values],before);
 }
});

test('a competing receipt after continuation preparation cannot be overwritten by the paired commit',async()=>{
 const f=fixture(),driver=new MemoryRecoveryDriver(),context={ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true},trip={...f.trip,ownerId:null};
 const prior=saveTripRecoveryToStorage(f.storage,trip,{ownerId:'owner-a',writeId:'observed'});const token=continuation(f);assert.ok(token);
 const prepared=await prepareIntakeAcknowledgement(f.storage,driver,context,{pending:token.pending,completed:token.receipt,draft:token.draft,fromHomepage:true,resumedInputRaw:token.resumedInputRaw},trip,'resume-entry');assert.equal(prepared.ok,true);if(!prepared.ok)return;
 const key=homepageInputStorageKey('owner-a'),newRaw=JSON.stringify({snapshot:{...f.snapshot,revision:98,dates:{state:'cleared'}},receipt:f.pending});f.storage.setItem(key,newRaw);
 const saved=await createTwoStoreTripPersistence(f.storage,driver,context).save(trip,{replace:prior.handle,expectedRecoverySource:trip,newTripOrClone:true,writeId:'resumed',entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:'owner-a',tripId:trip.id,writeId:'resumed'},input:null,receipt:prepared.receipt}});
 assert.equal(saved.stored,false);assert.equal(f.storage.getItem(key),newRaw);
});

test('ordinary intake acknowledgement still refuses revision drift without an explicit resumed-input witness',async()=>{
 const f=fixture(),before=[...f.storage.values];const result=await acknowledgePendingIntakeReceiptInStorage({storage:f.storage,pending:f.pending,completed:f.intake.completed,draft:f.draft,fromHomepage:true,isCurrent:()=>true});assert.equal(result.ok,false);assert.deepEqual([...f.storage.values],before);
});

test('reload can continue an exact completed input while HOME still carries its frozen pending receipt',async()=>{
 const f=fixture();f.storage.setItem(homepageInputStorageKey('owner-a'),JSON.stringify({snapshot:f.snapshot,receipt:f.intake.completed}));
 const token=continuation(f);assert.ok(token);assert.equal(token.pending?.inputRevision,95);
 assert.equal((await acknowledgePendingIntakeReceiptInStorage({storage:f.storage,pending:token.pending,completed:token.receipt,draft:token.draft,fromHomepage:true,resumedInputRaw:token.resumedInputRaw,isCurrent:()=>true})).ok,true);
 assert.equal(JSON.parse(f.storage.getItem(HOME_TRIP_DRAFT_KEY)!).homepage.receipt.version,1);
});
test('explicit reload after the completed pair can checkpoint the same exact ownerless draft again',()=>{
 const f=fixture();f.storage.setItem(homepageInputStorageKey('owner-a'),JSON.stringify({snapshot:f.snapshot,receipt:f.intake.completed}));f.storage.setItem(HOME_TRIP_DRAFT_KEY,JSON.stringify(f.draft));const token=continuation(f);assert.ok(token);assert.equal(token.receipt.tripId,f.trip.id);assert.equal(token.resumedInputRaw,f.storage.getItem(homepageInputStorageKey('owner-a')));
});

test('completed-pair continuation rejects HOME changed before paired preparation',async()=>{
 const f=fixture();f.storage.setItem(homepageInputStorageKey('owner-a'),JSON.stringify({snapshot:f.snapshot,receipt:f.intake.completed}));f.storage.setItem(HOME_TRIP_DRAFT_KEY,JSON.stringify(f.draft));
 const token=continuation(f);assert.ok(token);assert.equal(token.pending,undefined);const foreign=homeRecoveryFixture('owner-b');f.storage.setItem(HOME_TRIP_DRAFT_KEY,JSON.stringify(foreign.draft));const before=[...f.storage.values];
 const result=await prepareIntakeAcknowledgement(f.storage,new MemoryRecoveryDriver(),{ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true},{pending:token.pending,completed:token.receipt,draft:token.draft,fromHomepage:true,resumedInputRaw:token.resumedInputRaw},{...f.trip,ownerId:null},'resumed-entry');assert.equal(result.ok,false);assert.deepEqual([...f.storage.values],before);
});
test('explicit direct intake continuation checkpoints without a HOME envelope and preserves outer revision',async()=>{
 const f=fixture();f.storage.removeItem(HOME_TRIP_DRAFT_KEY);const trip={...f.trip,ownerId:null};const token=pendingIntakeContinuation({ownerId:'owner-a',inputRaw:f.storage.getItem(homepageInputStorageKey('owner-a')),draftRaw:null,recovery:{ownerId:'owner-a',tripId:trip.id,state:'pending',trip},fromHomepage:false});assert.ok(token);assert.equal(token.fromHomepage,false);const result=await acknowledgePendingIntakeReceiptInStorage({storage:f.storage,pending:token.pending,completed:token.receipt,draft:token.draft,fromHomepage:token.fromHomepage,resumedInputRaw:token.resumedInputRaw,isCurrent:()=>true});assert.equal(result.ok,true);const stored=JSON.parse(f.storage.getItem(homepageInputStorageKey('owner-a'))!);assert.equal(stored.snapshot.revision,97);assert.equal(stored.receipt.version,1);assert.equal(f.storage.getItem(HOME_TRIP_DRAFT_KEY),null);
});
test('direct continuation refuses a competing HOME, newer intent, wrong owner or different body',()=>{
 for(const change of ['home','intent','owner','body']){const f=fixture();f.storage.removeItem(HOME_TRIP_DRAFT_KEY);const stored=JSON.parse(f.inputRaw);if(change==='intent')stored.snapshot.dates={state:'cleared'};const trip={...f.trip,ownerId:null};if(change==='body')trip.title='different body';const token=pendingIntakeContinuation({ownerId:change==='owner'?'owner-b':'owner-a',inputRaw:JSON.stringify(stored),draftRaw:change==='home'?'{}':null,recovery:{ownerId:'owner-a',tripId:trip.id,state:'pending',trip:change==='body'?{...trip,stops:[]}:trip},fromHomepage:false});assert.equal(token,null,change);}
});

test('direct completed input without HOME can retry the exact receipt/body checkpoint after pointer interruption',()=>{const f=fixture();f.storage.removeItem(HOME_TRIP_DRAFT_KEY);const inputRaw=JSON.stringify({snapshot:f.snapshot,receipt:f.intake.completed});const token=pendingIntakeContinuation({ownerId:'owner-a',inputRaw,draftRaw:null,recovery:{ownerId:'owner-a',tripId:f.trip.id,state:'pending',trip:{...f.trip,ownerId:null}},fromHomepage:false});assert.ok(token);assert.equal(token.pending,undefined);assert.equal(token.fromHomepage,false);});

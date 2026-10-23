import assert from 'node:assert/strict';import test from 'node:test';
import {saveTripRecoveryToStorage,saveExplicitGuestTripForOwnerInStorage,tripRecoveryStorageKey} from '../lib/easyt/storage.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {HOME_TRIP_DRAFT_KEY,createPendingIntakeReceipt} from '../lib/easyt/home-trip-handoff.ts';
import {homepageDraftStorageKey} from '../lib/easyt/private-browser-context.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {builderInputDraftKey,createBuilderInputDraft,updateBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
function fixture(){const f=homeRecoveryFixture(),values=new Map(f.native),storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 const guest={...f.trip,status:'planned' as const};assert.equal(saveTripRecoveryToStorage(storage,guest,{ownerId:null,writeId:'guest-exact'}).stored,true);
 const input=updateBuilderInputDraft(createBuilderInputDraft(guest),guest,{kind:'origin'},'  unsent raw  ');storage.setItem(builderInputDraftKey(null,guest.id),JSON.stringify(input));
 return{...f,guest,input,values,storage,driver:new MemoryRecoveryDriver(),context:{ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}};}
test('explicit native guest save promotes exact owner snapshot and retains guest body/raw input/receipt',async()=>{
 const f=fixture(),before=[...f.values],calls:string[]=[];
 const request:typeof fetch=async(url,init)=>{calls.push(init!.method!);assert.equal(new Headers(init?.headers).get('x-morrovia-expected-owner'),'owner-a');const input=JSON.parse(init!.body as string);return Response.json({trip:canonicalTripForOwner('owner-a',input),outcome:'promoted'},{status:201});};
 const r=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,request);
 assert.equal(r.accountAcknowledged,true);assert.equal(r.deviceComplete,true);assert.equal(r.trip.ownerId,'owner-a');
 for(const [key,raw]of before)assert.equal(f.storage.getItem(key),raw,'guest source never retired');
 const owned=await createTwoStoreTripPersistence(f.storage,f.driver,f.context).read(f.guest.id);assert.equal(owned.kind,'found');
 const raw=f.storage.getItem(builderInputDraftKey('owner-a',f.guest.id));assert.ok(raw);assert.equal(JSON.parse(raw).fields[0].raw,'  unsent raw  ');
 assert.deepEqual(calls,['POST','PUT']);
});
function promotion(owner='owner-a',after?:()=>void):typeof fetch{return async(_url,init)=>{const body=JSON.parse(init!.body as string);after?.();return Response.json({trip:canonicalTripForOwner(owner,body),outcome:'promoted'},{status:201});};}
function scopedFixture() {
 const f=fixture(),scopedKey=homepageDraftStorageKey(null),snapshot=emptyHomepageInput('owner-foreign');
 const receipt=createPendingIntakeReceipt(snapshot,{handoffId:'foreign-pending',tripId:'foreign-trip'});
 f.values.set(scopedKey,f.values.get(HOME_TRIP_DRAFT_KEY)!);
 f.values.set(HOME_TRIP_DRAFT_KEY,JSON.stringify({version:2,phase:'pending-interpretation',receipt}));
 return {...f,scopedKey};
}
test('explicit guest save reads its scoped handoff and leaves the foreign shared pending envelope unchanged',async()=>{
 const f=scopedFixture(),before=[...f.values];
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,true);
 for(const [key,raw]of before)assert.equal(f.storage.getItem(key),raw);
});
test('a scoped guest handoff changed during account ACK stays preserved and cannot earn device completion',async()=>{
 const f=scopedFixture(),changed=JSON.stringify({...f.draft,brief:'New guest input while account save is pending'}),foreign=f.values.get(HOME_TRIP_DRAFT_KEY);
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-a',()=>f.values.set(f.scopedKey,changed)));
 assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);
 assert.equal(f.storage.getItem(f.scopedKey),changed);assert.equal(f.storage.getItem(HOME_TRIP_DRAFT_KEY),foreign);
});
test('repeat explicit save is idempotent and retains guest raw witnesses',async()=>{const f=fixture(),request=promotion();const first=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,request);assert.equal(first.deviceComplete,true);const second=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,request);assert.equal(second.deviceComplete,true);});
test('destination divergence refuses before any promotion',async()=>{const f=fixture();saveTripRecoveryToStorage(f.storage,{...f.guest,ownerId:'owner-a',title:'Different account edit'},{ownerId:'owner-a',writeId:'competing'});let calls=0;await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,async()=>{calls++;throw Error('no request');}));assert.equal(calls,0);});
test('foreign response owner cannot grant local ownership',async()=>{const f=fixture();await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-b')));assert.equal(f.storage.getItem(builderInputDraftKey('owner-b',f.guest.id)),null);});
test('owner retirement after promotion prevents planned update and all local writes',async()=>{const f=fixture();let active=true,calls=0;const before=[...f.values];await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,{...f.context,isCurrent:()=>active},f.guest.id,async(url,init)=>{calls++;active=false;return promotion()(url,init);}));assert.equal(calls,1);assert.deepEqual([...f.values],before);});
test('new guest input during cloud ACK is preserved and device completion stays false',async()=>{const f=fixture();const r=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-a',()=>f.storage.setItem(builderInputDraftKey(null,f.guest.id),JSON.stringify({...f.input,inputRevision:9}))));assert.equal(r.accountAcknowledged,true);assert.equal(r.deviceComplete,false);assert.equal(JSON.parse(f.storage.getItem(builderInputDraftKey(null,f.guest.id))!).inputRevision,9);});
test('protected guest source after account ACK retains truthful account success',async()=>{const f=fixture();const r=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-a',()=>f.storage.setItem(builderInputDraftKey(null,f.guest.id),'{unknown')));assert.equal(r.accountAcknowledged,true);assert.equal(r.deviceComplete,false);});
test('concurrent account raw input during promotion is never replaced',async()=>{const f=fixture(),key=builderInputDraftKey('owner-a',f.guest.id);const r=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-a',()=>f.storage.setItem(key,'protected newer input')));assert.equal(r.accountAcknowledged,true);assert.equal(r.deviceComplete,false);assert.equal(f.storage.getItem(key),'protected newer input');});
test('genuine quota IDB guest source promotes without changing source envelope or native copies',async()=>{
 const f=fixture(),native=createTwoStoreTripPersistence(f.storage,f.driver,{...f.context,ownerId:null});const old=await native.read(f.guest.id);assert.equal(old.kind,'found');if(old.kind!=='found')return;
 const originalSetter=f.storage.setItem.bind(f.storage);f.storage.setItem=(key,raw)=>{if(key.startsWith(tripRecoveryStorageKey(null,f.guest.id)))throw new DOMException('Synthetic native quota','QuotaExceededError');originalSetter(key,raw);};
 const rawInput=f.storage.getItem(builderInputDraftKey(null,f.guest.id))!,writeId='domain-guest-source';
 const saved=await native.save(f.guest,{newTripOrClone:true,writeId,replace:old.recovery!,expectedRecoverySource:f.guest,entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:f.guest.id,writeId},input:{ownerId:null,tripId:f.guest.id,inputRevision:f.input.inputRevision,raw:rawInput},receipt:{ownerId:null,tripId:f.guest.id,operationId:f.intake.completed.handoffId,raw:JSON.stringify({version:1,inputRaw:f.native[0]![1],draftRaw:f.native[1]![1]})}}});assert.equal(saved.stored,true);
 const before=JSON.stringify(await native.read(f.guest.id)),bytes=[...f.values];
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,true);
 assert.equal(JSON.stringify(await native.read(f.guest.id)),before);for(const [key,raw]of bytes)assert.equal(f.storage.getItem(key),raw);
});
test('partial account persistence can retry exact source without retiring guest',async()=>{
 const f=fixture(),before=[...f.values],originalSetter=f.storage.setItem.bind(f.storage);let fail=true;
 f.storage.setItem=(key,raw)=>{if(fail&&key===builderInputDraftKey('owner-a',f.guest.id))throw new DOMException('Synthetic storage refused','SecurityError');originalSetter(key,raw);};
 const first=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());assert.equal(first.accountAcknowledged,true);assert.equal(first.deviceComplete,false);
 fail=false;const retry=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());assert.equal(retry.deviceComplete,true);for(const [key,raw]of before)assert.equal(f.storage.getItem(key),raw);
});

test('actual workspace callback reads guest only for explicit authenticated saved intent',async()=>{
 const {readFileSync}=await import('node:fs'),ts=await import('typescript');
 const text=readFileSync(new URL('../components/easyt/trip-shell-resolver.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('resolver.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback:import('typescript').ArrowFunction|undefined;
 const walk=(n:import('typescript').Node)=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='resolveAndPromote'&&n.initializer&&ts.isCallExpression(n.initializer))callback=n.initializer.arguments[0] as import('typescript').ArrowFunction;ts.forEachChild(n,walk);};walk(ast);assert.ok(callback);
 for(const explicit of [false,true]){
  const calls:string[]=[],states:unknown[]=[];const trip=fixture().guest;
  const scope={resolutionIdentity:'A:trip',requestGenerationRef:{current:0},mountedRef:{current:true},currentResolutionIdentityRef:{current:'A:trip'},setSyncing:()=>{},setResolution:(x:unknown)=>states.push(x),setSyncIssue:()=>{},setSyncComplete:()=>{},setDeviceContinuationIncomplete:()=>{},setShowingCanonicalConflict:()=>{},ownerId:'owner-a',tripId:trip.id,searchParams:new URLSearchParams(explicit?'saved=1':''),loadTripWorkspaceDocument:async(_id:string,owner:string|null)=>{calls.push('read:'+owner);return null},acknowledgedAccountRef:{current:null},loadTripRecovery:async(_id:string,owner:string|null)=>{calls.push('read:'+owner);return owner===null?{trip}:null},saveExplicitGuestTripForOwner:async()=>{calls.push('explicit-save');return{trip:{...trip,ownerId:'owner-a'},accountAcknowledged:true,deviceComplete:true}}};
  const script=ts.transpileModule('const callback='+callback.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  await new Function('scope',`with(scope){${script};return callback();}`)(scope);
  assert.deepEqual(calls,explicit?['read:null','explicit-save']:['read:owner-a']);
 }
});
test('new account cache at native commit boundary is never rolled back by guest save',async()=>{
 const f=fixture(),{tripCacheStorageKey,cacheCanonicalTripToStorage}=await import('../lib/easyt/storage.ts');let armed=false,changed=false;
 const run=f.driver.run.bind(f.driver);f.driver.run=(async(...args:Parameters<typeof f.driver.run>)=>{if(armed&&!changed&&args[0].ownerId==='owner-a'&&args[2]==='readwrite'){changed=true;cacheCanonicalTripToStorage(f.storage,{...canonicalTripForOwner('owner-a',f.guest),title:'Newer account cache'});}return run(...args);}) as typeof f.driver.run;
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-a',()=>{armed=true}));
 assert.equal(changed,true);assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);assert.equal(JSON.parse(f.storage.getItem(tripCacheStorageKey('owner-a',f.guest.id))!).trip.title,'Newer account cache');
});
test('guest input change during account preparation cannot earn device completion',async()=>{
 const f=fixture();let armed=false,changed=false;const run=f.driver.run.bind(f.driver);
 f.driver.run=(async(...args:Parameters<typeof f.driver.run>)=>{if(armed&&!changed&&args[0].ownerId==='owner-a'&&args[2]==='readonly'){changed=true;f.storage.setItem(builderInputDraftKey(null,f.guest.id),JSON.stringify({...f.input,inputRevision:14}));}return run(...args);}) as typeof f.driver.run;
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion('owner-a',()=>{armed=true}));assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);assert.equal(JSON.parse(f.storage.getItem(builderInputDraftKey(null,f.guest.id))!).inputRevision,14);
});
test('explicit guest save retains historical completed homepage receipt after traveller route edits',async()=>{
 const f=fixture(),{prepareAcceptedBuilderEdit}=await import('../lib/easyt/trip-builder-edit.ts'),{builderDocumentFingerprint}=await import('../lib/easyt/trip-builder-document-commit.ts');
 const changed=prepareAcceptedBuilderEdit(f.guest,{kind:'origin',place:{name:'London',country:'United Kingdom',canonicalPlaceId:'london'}},builderDocumentFingerprint(f.guest));assert.equal(changed.ok,true);if(!changed.ok)return;
 const old=await createTwoStoreTripPersistence(f.storage,f.driver,{...f.context,ownerId:null}).read(f.guest.id);assert.equal(old.kind,'found');if(old.kind!=='found')return;
 assert.equal(saveTripRecoveryToStorage(f.storage,changed.trip,{ownerId:null,writeId:'edited-guest',replace:old.recovery!}).stored,true);
 const r=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());assert.equal(r.accountAcknowledged,true);assert.equal(r.deviceComplete,true);
});
test('account homepage ignores only a validated foreign completed draft and retains its exact raw witness',async()=>{
 const {decodeHomepageBundle}=await import('../lib/easyt/homepage-persistence.ts'),f=homeRecoveryFixture();
 const raw=JSON.stringify({version:1,inputRaw:null,draftRaw:f.native[1]![1]});
 const account=decodeHomepageBundle(raw,'owner-a');assert.ok(account);assert.equal(account.draft,null);assert.equal(account.storedInput,null);assert.equal(account.bundle.draftRaw,f.native[1]![1]);
 const guest=decodeHomepageBundle(raw,null);assert.ok(guest?.draft);
 const changed=JSON.parse(f.native[1]![1]);changed.homepage.receipt.ownerId='someone-else';
 assert.equal(decodeHomepageBundle(JSON.stringify({version:1,inputRaw:null,draftRaw:JSON.stringify(changed)}),'owner-a'),null);
});

test('unsupported or blank-owner foreign completed HOME stays protected',async()=>{
 const {decodeHomepageBundle}=await import('../lib/easyt/homepage-persistence.ts'),f=homeRecoveryFixture();
 const draft=JSON.parse(f.native[1]![1]);
 assert.equal(decodeHomepageBundle(JSON.stringify({version:1,inputRaw:null,draftRaw:JSON.stringify({...draft,version:99})}),'owner-a'),null);
 draft.homepage.ownerId='';draft.homepage.receipt.ownerId='';
 assert.equal(decodeHomepageBundle(JSON.stringify({version:1,inputRaw:null,draftRaw:JSON.stringify(draft)}),'owner-a'),null);
});

test('destination input changed during final receipt and Home readback cannot earn complete device status',async()=>{
 const f=fixture(),{tripCacheStorageKey}=await import('../lib/easyt/storage.ts'),key=builderInputDraftKey('owner-a',f.guest.id);
 const cacheKey=tripCacheStorageKey('owner-a',f.guest.id),set=f.storage.setItem.bind(f.storage),run=f.driver.runEntry.bind(f.driver);
 let accountCacheWritten=false,receiptRead=false,changed=false;
 f.storage.setItem=(name,raw)=>{set(name,raw);if(name===cacheKey)accountCacheWritten=true;};
 f.driver.runEntry=(async(...args:Parameters<typeof f.driver.runEntry>)=>{
  if(accountCacheWritten&&args[0].ownerId==='owner-a'){
   if(args[0].kind==='trip-receipt')receiptRead=true;
   if(receiptRead&&args[0].kind==='homepage'&&!changed){changed=true;f.values.set(key,'Protected concurrent account raw input');}
  }
  return run(...args);
 }) as typeof f.driver.runEntry;
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(changed,true,'the competing input must arrive after the account cache was acknowledged');
 assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);
 assert.equal(f.values.get(key),'Protected concurrent account raw input');
 for(const [name,raw]of f.native)assert.equal(f.values.get(name),raw);
});

test('a late destination IDB input generation is preserved and prevents device-complete status',async()=>{
 const f=fixture(),{tripCacheStorageKey}=await import('../lib/easyt/storage.ts');
 const {createTwoStoreEntryPersistence}=await import('../lib/easyt/two-store-entry-persistence.ts');
 const key=builderInputDraftKey('owner-a',f.guest.id),cacheKey=tripCacheStorageKey('owner-a',f.guest.id),set=f.storage.setItem.bind(f.storage);
 let accountCacheWritten=false,inputRead=false,changed=false;
 f.storage.setItem=(name,raw)=>{if(name===key)throw new DOMException('Synthetic input quota','QuotaExceededError');set(name,raw);if(name===cacheKey)accountCacheWritten=true;};
 const runEntry=f.driver.runEntry.bind(f.driver),readCurrent=f.driver.readCurrent.bind(f.driver);
 f.driver.runEntry=(async(...args:Parameters<typeof f.driver.runEntry>)=>{if(accountCacheWritten&&args[0].ownerId==='owner-a'&&args[0].kind==='builder-input')inputRead=true;return runEntry(...args);}) as typeof f.driver.runEntry;
 let competingRaw='';
 f.driver.readCurrent=async owner=>{
  if(owner==='owner-a'&&inputRead&&!changed){
   changed=true;const adapter=createTwoStoreEntryPersistence(f.storage,f.driver,{...f.context,scope:{ownerId:'owner-a',tripId:f.guest.id,kind:'builder-input'},key,validate:()=>true});
   const before=await adapter.read();assert.equal(before.kind,'ready');if(before.kind!=='ready'||!before.raw)throw Error('Synthetic input expected');
   const next=JSON.parse(before.raw);next.inputRevision++;next.fields[0].raw='Competing late IDB input';competingRaw=JSON.stringify(next);
   assert.equal((await adapter.save(competingRaw,{writeId:'late-target-input'})).kind,'verified');
  }
  return readCurrent(owner);
 };
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(changed,true);assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);
 const adapter=createTwoStoreEntryPersistence(f.storage,f.driver,{...f.context,scope:{ownerId:'owner-a',tripId:f.guest.id,kind:'builder-input'},key,validate:()=>true});
 const after=await adapter.read();assert.equal(after.kind,'ready');if(after.kind==='ready')assert.equal(after.raw,competingRaw);
});

test('independent receipt write refusal leaves source and account ACK distinct and supports exact retry',async()=>{
 const f=fixture(),{tripReceiptStorageKey}=await import('../lib/easyt/private-browser-context.ts'),key=tripReceiptStorageKey('owner-a',f.guest.id);
 const before=new Map(f.values),set=f.storage.setItem.bind(f.storage);let refuse=true;
 f.storage.setItem=(name,raw)=>{if(refuse&&name===key)throw new DOMException('Synthetic receipt refusal','SecurityError');set(name,raw);};
 const first=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(first.accountAcknowledged,true);assert.equal(first.deviceComplete,false);assert.equal(f.values.has(key),false);
 for(const [name,raw]of before)assert.equal(f.values.get(name),raw);
 refuse=false;const retry=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(retry.deviceComplete,true);assert.ok(f.values.has(key));for(const [name,raw]of before)assert.equal(f.values.get(name),raw);
});

test('a late native destination branch cannot be hidden by complete device status',async()=>{
 const f=fixture(),run=f.driver.runClaim.bind(f.driver);let witnesses=0,changed=false;
 f.driver.runClaim=(async(...args:Parameters<typeof f.driver.runClaim>)=>{
  if(args[1]==='readonly'&&++witnesses===2){
   changed=true;const competing=canonicalTripForOwner('owner-a',{...f.guest,title:'Protected late destination branch'});
   assert.equal(saveTripRecoveryToStorage(f.storage,competing,{ownerId:'owner-a',writeId:'late-native-account'}).stored,true);
  }
  return run(...args);
 }) as typeof f.driver.runClaim;
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(changed,true);assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);
 const raw=f.values.get(tripRecoveryStorageKey('owner-a',f.guest.id,'late-native-account'));assert.ok(raw);assert.equal(JSON.parse(raw).trip.title,'Protected late destination branch');
});

test('native branch arriving during the last current-pointer read cannot become its own readback witness',async()=>{
 const f=fixture(),{tripCacheStorageKey}=await import('../lib/easyt/storage.ts');
 const set=f.storage.setItem.bind(f.storage),run=f.driver.runEntry.bind(f.driver),readCurrent=f.driver.readCurrent.bind(f.driver);
 let accountCache=false,inputRead=false,currentReads=0,changed=false;
 f.storage.setItem=(key,raw)=>{set(key,raw);if(key===tripCacheStorageKey('owner-a',f.guest.id))accountCache=true;};
 f.driver.runEntry=(async(...args:Parameters<typeof f.driver.runEntry>)=>{if(accountCache&&args[0].ownerId==='owner-a'&&args[0].kind==='builder-input')inputRead=true;return run(...args);}) as typeof f.driver.runEntry;
 f.driver.readCurrent=async owner=>{
  if(inputRead&&owner==='owner-a'&&++currentReads===3){changed=true;assert.equal(saveTripRecoveryToStorage(f.storage,canonicalTripForOwner('owner-a',{...f.guest,title:'Late in current()'}),{ownerId:'owner-a',writeId:'during-current'}).stored,true);}
  return readCurrent(owner);
 };
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(changed,true);assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);
 assert.equal(JSON.parse(f.values.get(tripRecoveryStorageKey('owner-a',f.guest.id,'during-current'))!).trip.title,'Late in current()');
});

test('late guest IDB source advancement preserves both generations and cannot earn device completion',async()=>{
 const f=fixture(),{tripCacheStorageKey}=await import('../lib/easyt/storage.ts'),guest=createTwoStoreTripPersistence(f.storage,f.driver,{...f.context,ownerId:null});
 const before=await guest.read(f.guest.id);assert.equal(before.kind,'found');if(before.kind!=='found')return;
 const set=f.storage.setItem.bind(f.storage);let accountCache=false,inputRead=false,changed=false;
 f.storage.setItem=(key,raw)=>{if(key.startsWith(tripRecoveryStorageKey(null,f.guest.id)))throw new DOMException('Synthetic guest quota','QuotaExceededError');set(key,raw);if(key===tripCacheStorageKey('owner-a',f.guest.id))accountCache=true;};
 const writeId='guest-durable-source';
 const saved=await guest.save(f.guest,{newTripOrClone:true,replace:before.recovery!,expectedRecoverySource:f.guest,writeId,
  entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:f.guest.id,writeId},input:{ownerId:null,tripId:f.guest.id,inputRevision:f.input.inputRevision,raw:f.storage.getItem(builderInputDraftKey(null,f.guest.id))!},
   receipt:{ownerId:null,tripId:f.guest.id,operationId:f.intake.completed.handoffId,raw:JSON.stringify({version:1,inputRaw:f.native[0][1],draftRaw:f.native[1][1]})}}});
 assert.equal(saved.stored,true);const originals=new Map(f.driver.generations),bytes=new Map(f.values),run=f.driver.runEntry.bind(f.driver),read=f.driver.readCurrent.bind(f.driver);
 f.driver.runEntry=(async(...args:Parameters<typeof f.driver.runEntry>)=>{if(accountCache&&args[0].ownerId==='owner-a'&&args[0].kind==='builder-input')inputRead=true;return run(...args);}) as typeof f.driver.runEntry;
 f.driver.readCurrent=async owner=>{
  if(owner==='owner-a'&&inputRead&&!changed){changed=true;const current=await guest.read(f.guest.id);assert.equal(current.kind,'found');if(current.kind!=='found')throw Error('Synthetic guest source required');
   assert.equal((await guest.save({...current.trip,title:'Later guest branch'},{replace:current.recovery!,canonicalBase:current.trip,expectedRecoverySource:current.trip,writeId:'late-guest-generation'})).stored,true);
  }
  return read(owner);
 };
 const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.id,promotion());
 assert.equal(changed,true);assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,false);
 const later=await guest.read(f.guest.id);assert.equal(later.kind,'found');if(later.kind==='found')assert.equal(later.trip.title,'Later guest branch');
 for(const [key,raw]of originals)assert.equal(f.driver.generations.get(key),raw);for(const [key,raw]of bytes)assert.equal(f.values.get(key),raw);
});

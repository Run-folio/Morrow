import assert from 'node:assert/strict';
const repo=new URL('../../',import.meta.url),load=p=>import(new URL(p,repo));
const {MemoryRecoveryDriver}=await load('tests/helpers/durable-recovery-driver.ts');
const {tripFromBuilder}=await load('lib/easyt/trip.ts');
const {acceptedGeographicPlace}=await load('lib/easyt/geographic-binding.ts');
const {saveTripRecoveryToStorage,saveExplicitGuestTripForOwnerInStorage,samePersistedTripDocument,tripRecoveryStorageKey}=await load('lib/easyt/storage.ts');
const {canonicalTripForOwner}=await load('lib/easyt/trip-promotion.ts');
const {jsonbObjectOrder}=await load('tests/fixtures/save-reopen-trip.ts');
const {providerState,resolveTripTransferJourneys}=await load('tests/helpers/trip-read-stability-resolver.ts');
const {state}=await load('tests/helpers/batch14-server-fixtures.ts');
const {getTripForOwner}=await load('lib/easyt/repository.ts');
const {createAsyncBuilderEditSession}=await load('lib/easyt/trip-builder-async-edit-session.ts');
const {createDurableBuilderInputPersistence}=await load('lib/easyt/builder-input-persistence.ts');
const {requireReadableTripDocument,TripDocumentReadError}=await load('lib/easyt/trip-document.ts');
const {createTwoStoreTripPersistence}=await load('lib/easyt/two-store-trip-persistence.ts');
globalThis.fetch=async()=>{throw Error('External network forbidden in regression');};
const place=(name,country,coordinates)=>{
 const value=acceptedGeographicPlace({name,country,coordinates},{name,country,coordinates,providerId:'synthetic:'+name,canonicalPlaceId:'synthetic:'+name,placeType:'city',routability:'direct_destination'},'endpoint');
 assert.ok(value);return value;
};
const origin=place('Paris','France',[2.3522,48.8566]);
const stops=[{...place('Madrid','Spain',[-3.7038,40.4168]),id:'madrid',nights:2},{...place('Lisbon','Portugal',[-9.1393,38.7223]),id:'lisbon',nights:4}];
const guest={...tripFromBuilder({id:'synthetic-domain-authority',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'same_as_start'},stops,startDate:'2026-10-31',endDate:'2026-11-06',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',nightAllocations:{madrid:2,lisbon:4},draft:[]}),status:'planned'};
guest.brief.intent.route.origin=origin;
function differences(a,b,path=''){
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return [path];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],path?path+'.'+k:k));
}
for(const target of ['native','indexeddb'])for(const getMode of ['same-response','resolver-stable','resolver-fresh-time','newer-domain','missing-ack','foreign-native']){
 if(target==='native'&&['newer-domain','missing-ack','foreign-native'].includes(getMode))continue;

 const values=new Map(),driver=new MemoryRecoveryDriver(),ownerId='synthetic-owner',context={ownerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true};
 const storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(target==='indexeddb'&&k.startsWith(tripRecoveryStorageKey(ownerId,guest.id)))throw new DOMException('Synthetic quota','QuotaExceededError');values.set(k,v)},removeItem:k=>values.delete(k)};
 assert.equal(saveTripRecoveryToStorage(storage,guest,{ownerId:null,writeId:'guest'}).stored,true);
 let server=null,requests=0;providerState.calls=0;providerState.checkedAt='2026-11-02T17:36:19.000Z';
 const request=async(_url,init)=>{requests++;const body=JSON.parse(init.body);const resolved=await resolveTripTransferJourneys(body);server=jsonbObjectOrder(canonicalTripForOwner(ownerId,resolved,'2026-11-02T17:36:'+String(16+requests).padStart(2,'0')+'.000Z'));return Response.json({trip:server,outcome:init.method==='POST'?'promoted':'updated'},{status:init.method==='POST'?201:200});};
 const promoted=await saveExplicitGuestTripForOwnerInStorage(storage,driver,context,guest.id,request);
 assert.equal(promoted.accountAcknowledged,true);assert.equal(promoted.deviceComplete,true);assert.equal(requests,2);
 const store=createTwoStoreTripPersistence(storage,driver,context),owned=await store.read(guest.id);assert.equal(owned.kind,'found');assert.equal(owned.recovery,null);
 const acknowledged=requireReadableTripDocument(server);
 if(getMode==='resolver-fresh-time')providerState.checkedAt='2026-11-02T17:44:15.000Z';
 const callsBeforeGet=providerState.calls;
 state.rows=[[{document:structuredClone(server)}]];const get=requireReadableTripDocument(await getTripForOwner(ownerId,guest.id));
 if(['same-response','resolver-stable','resolver-fresh-time'].includes(getMode)){state.rows=[[{document:structuredClone(server)}]];assert.deepEqual(await getTripForOwner(ownerId,guest.id),get,'repeated reads keep canonical values');}
 assert.equal(providerState.calls,callsBeforeGet,'ordinary GET must not call a provider');
 const diffPaths=differences(acknowledged,get);assert.deepEqual(diffPaths,[],'GET must retain every persisted value and revision');
 if(target==='indexeddb'&&getMode==='newer-domain')assert.equal((await store.save({...acknowledged,title:'Synthetic newer device decision'},{canonicalBase:acknowledged,writeId:'newer-device'})).stored,true);
 if(target==='indexeddb'&&getMode==='missing-ack')driver.acknowledgements.clear();
 if(target==='indexeddb'&&getMode==='foreign-native')values.set(tripRecoveryStorageKey(ownerId,guest.id,'foreign-native'),JSON.stringify({version:2,ownerId,tripId:guest.id,writeId:'foreign-native',trip:{...acknowledged,title:'Synthetic distinct native decision'},state:'pending',savedAt:'2026-11-02T18:00:00.000Z'}));

 if(getMode==='same-response'){const generations=JSON.stringify([...driver.generations]);const refused=await store.save({...get,ownerId:'foreign-owner'},{canonicalBase:get,writeId:'foreign-owner-write'});assert.equal(refused.stored,false);assert.equal(refused.writeAttempted,false);assert.equal(JSON.stringify([...driver.generations]),generations);}
 const beforeNative=JSON.stringify([...values]),beforeHeads=JSON.stringify([...driver.heads]),beforeGenerations=JSON.stringify([...driver.generations]),beforeAcks=JSON.stringify([...driver.acknowledgements]);
 const input=trip=>createDurableBuilderInputPersistence(storage,driver,{...context,trip});
 let savedMetadata,savedResult;
 const session=await createAsyncBuilderEditSession({initialTrip:get,initialCanonicalTrip:get,getOwnerId:()=>ownerId,readDraft:t=>input(t).read(),writeDraft:(t,d)=>input(t).write(d),saveRecovery:async(t,m)=>{savedMetadata=m;const p=await input(t).prepare(m.draft,'edit:input');assert.equal(p.ok,true);return savedResult=await store.save(t,{...m,isCurrent:undefined,writeId:'edit',entries:[p.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:t.id,writeId:'edit'},input:p.input,receipt:null}});},acknowledgeRecovery:async()=>{throw Error('No new ACK')},persistAccount:async()=>{throw Error('No new account writes')},reconcile:async()=>{throw Error('No provider work from session')},now:()=> '2026-11-02T17:44:24.000Z',schedule:()=>()=>{}});
 const initial=session.getSnapshot(),stop=initial.trip.stops[0],intent=initial.trip.brief.intent.route.destinations.find(d=>d.stopIds.includes(stop.id));assert.ok(intent);
 const result=await session.accept({kind:'nights',stopId:stop.id,intentId:intent.id,nights:1},initial.inputRevision);

 const expectedRefusal=target==='indexeddb'&&['newer-domain','missing-ack','foreign-native'].includes(getMode);
 assert.equal(result.ok,!expectedRefusal);
 if(savedMetadata){assert.equal(samePersistedTripDocument(savedMetadata.canonicalBase,acknowledged),true);assert.equal(Boolean(savedMetadata.replace),false);}
 if(expectedRefusal&&getMode!=='foreign-native'){assert.equal(result.reason,'storage');assert.equal(savedResult.blockedByExistingRecovery,true);assert.equal(savedResult.failureReason,'protected-recovery');assert.equal(savedResult.writeAttempted,false);}
 if(getMode==='foreign-native'){assert.equal(result.reason,'protected');assert.equal(savedResult,undefined);}

 if(result.ok){const reopened=await store.read(guest.id);assert.equal(reopened.kind,'found');assert.deepEqual(reopened.trip.stops.map(stop=>stop.nights),[1,4]);}
 const unchanged=beforeHeads===JSON.stringify([...driver.heads])&&beforeGenerations===JSON.stringify([...driver.generations])&&beforeAcks===JSON.stringify([...driver.acknowledgements]);
 if(!result.ok){assert.equal(JSON.stringify([...values]),beforeNative);assert.equal(unchanged,true,'refused edit must leave every modeled domain generation/head byte unchanged');}
 console.log(JSON.stringify({target,getMode,promotionRequests:requests,providerCalls:providerState.calls,diffPaths,exactCanonicalBase:savedMetadata?samePersistedTripDocument(savedMetadata.canonicalBase,acknowledged):null,replacementPresent:Boolean(savedMetadata?.replace),result:{ok:result.ok,reason:result.reason},writeAttempted:savedResult?.writeAttempted,domainUnchangedAfterRefusal:!result.ok?unchanged:undefined}));
 session.dispose();
}

state.queries=[];state.rows=[[]];assert.equal(await getTripForOwner('foreign-owner',guest.id),null);assert.deepEqual(state.queries[0].values,[guest.id,'foreign-owner']);
const {legacyRouteFixture}=await load('tests/fixtures/batch14-route-documents.ts');
const legacy=legacyRouteFixture();
legacy.legs[0]={...legacy.legs[0],mode:'road',durationMinutes:217,routeMetadata:{},fromEndpoint:{kind:'stop',id:'athens',name:'Athens',country:'Greece',coordinates:[23.7275,37.9838]},toEndpoint:{kind:'stop',id:'naxos',name:'Naxos',country:'Greece',coordinates:[25.3777,37.1036]}};
legacy.planItems[0]={...legacy.planItems[0],type:'activity',title:'Museum',reason:'Built around Museum',notes:['Museum','Generated context','Check opening hours and timed-entry requirements before booking.']};
const legacyBefore=JSON.stringify(legacy),legacyCalls=providerState.calls;
state.rows=[[{document:legacy}]];const legacyOpened=await getTripForOwner('owner-a',legacy.id);assert.equal(legacyOpened.schemaVersion,2);
assert.equal(legacyOpened.legs[0].mode,'unknown');assert.equal(legacyOpened.legs[0].durationMinutes,null);assert.equal(legacyOpened.legs[0].routeMetadata.source,'legacy-road-compatibility');
assert.deepEqual(legacyOpened.planItems[0].notes,['Museum']);assert.deepEqual(legacyOpened.planItems[0].contextNotes,['Generated context','Check opening hours and timed-entry requirements before booking.']);
assert.equal(JSON.stringify(legacy),legacyBefore,'legacy read does not mutate stored document');assert.equal(providerState.calls,legacyCalls);
assert.ok(state.queries.every(query=>!/^\s*(?:insert|update|delete)/i.test(query.text)),'GET must issue no write SQL');
state.rows=[[{document:{...legacy,schemaVersion:3}}]];await assert.rejects(getTripForOwner('owner-a',legacy.id),TripDocumentReadError);
console.log('Owner-scoped absence and legacy/future-version boundaries passed');

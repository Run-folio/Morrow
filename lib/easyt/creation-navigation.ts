import {decodeDomainCurrent,type CreationHandoverPointer,type RecoveryDomainDriver} from './durable-recovery-domain.ts';
import {entryHead} from './durable-entry-store.ts';
import type {RecoveryEntryEnvelope,RecoveryEntryScope} from './durable-entry-protocol.ts';
import {currentTripStorageKey,type EasyTBrowserStorage} from './storage.ts';
import {decodeTripCreationToken,type TripCreationToken} from './trip-creation-provenance.ts';

/** Immutable, one-use navigation authority. This is neither trip ownership nor
 * account-save authority. No timestamp ordering, adoption or record deletion. */
export async function creationNavigation(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,
 token:TripCreationToken,isCurrent:()=>boolean,admit:boolean):Promise<
 {kind:'ready';pointer:CreationHandoverPointer;raw:string;entryRaw:string}|{kind:'overflow';currentRaw:unknown;nativePointerRaw:string|null}|{kind:'legacy'}|{kind:'refused'}> {
 if(!decodeTripCreationToken(JSON.stringify(token),token.ownerId,token.tripId))return {kind:'refused'};
 const {ownerId,tripId}=token,scope:RecoveryEntryScope={ownerId,tripId,kind:'creation-navigation'};
 const key=currentTripStorageKey(ownerId),refuse=()=>({kind:'refused' as const});
 try {
  const creationDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(token)))),n=>n.toString(16).padStart(2,'0')).join('');
  const read=()=>driver.runEntry(scope,null,'readonly',state=>({value:entryHead(state,scope)}));
  const decode=(entry:Awaited<ReturnType<typeof read>>)=>{
   if(entry.kind!=='valid'||!entry.envelope||entry.envelope.parent!==null||entry.envelope.legacyRaw!==null||entry.envelope.retainedPreviousRaw!==null)return null;
   const decoded=decodeDomainCurrent(entry.envelope.raw,ownerId);
   return decoded.kind==='readable'&&decoded.value?.backend==='creation-handover'
    &&decoded.value.tripId===tripId&&decoded.value.writeId===token.initialWriteId&&decoded.value.creationDigest===creationDigest
    &&decoded.value.attemptId===entry.envelope.handle.writeId?{kind:'ready' as const,pointer:decoded.value,raw:entry.envelope.raw!,entryRaw:JSON.stringify(entry.envelope)}:null;
  };
  const before=await read();if(!isCurrent()||before.kind!=='valid')return refuse();
  if(before.envelope)return decode(before)??refuse();
  if(!admit)return {kind:'legacy'};
  const prior=await driver.readCurrent(ownerId),native=storage.getItem(key);
  if(!isCurrent()||decodeDomainCurrent(prior,ownerId).kind!=='readable'||storage.getItem(key)!==native)return refuse();
  if(native!==null){const value=JSON.parse(native);if(!value||value.version!==2||value.ownerId!==ownerId||typeof value.tripId!=='string'||!value.tripId.trim())return refuse();}
  // Native navigation is deliberately marked inside the synchronous admission
  // callback. A failed/aborted transaction never acknowledges creation; body
  // writing begins only after both marker and immutable reservation read back.
  const attemptId=crypto.randomUUID();
  const nativePointerRaw=JSON.stringify({version:2,ownerId,tripId,navigationAttemptId:attemptId});
  const pointer:CreationHandoverPointer={version:1,backend:'creation-handover',ownerId,tripId,writeId:token.initialWriteId,attemptId,creationDigest,nativePointerRaw};
  const raw=JSON.stringify(pointer),handle={...scope,version:1 as const,backend:'indexeddb-entry' as const,writeId:attemptId};
  const envelope:RecoveryEntryEnvelope={version:1,handle,parent:null,raw,legacyRaw:null,retainedPreviousRaw:null};
  let markerQuota=false;
  const admitted=await driver.run({ownerId,tripId},null,'readwrite',state=>{
   const entry=entryHead(state.entries[0],scope);
   if(!isCurrent()||state.currentRaw!==prior||storage.getItem(key)!==native||entry.kind!=='valid'||entry.envelope
    ||state.headRaw!==undefined||state.headGenerationRaw!==undefined)return {value:false};
   try{storage.setItem(key,nativePointerRaw);}catch(error){
    if(error instanceof DOMException&&error.name==='QuotaExceededError'&&isCurrent()&&storage.getItem(key)===native){markerQuota=true;return {value:false};}
    throw error;
   }
   if(!isCurrent()||storage.getItem(key)!==nativePointerRaw)return {value:false};
   return {value:true,currentRaw:raw,entryWrites:[{scope,writeId:attemptId,raw:JSON.stringify(envelope),headRaw:JSON.stringify(handle)}]};
  },[{scope,writeId:attemptId}]);
  if(!admitted&&markerQuota&&isCurrent()&&await driver.readCurrent(ownerId)===prior&&storage.getItem(key)===native)
   return {kind:'overflow',currentRaw:prior,nativePointerRaw:native};
  const confirmed=await read();
  if(!admitted||!isCurrent()||await driver.readCurrent(ownerId)!==raw||storage.getItem(key)!==nativePointerRaw)return refuse();
  return decode(confirmed)??refuse();
 }catch{return refuse();}
}

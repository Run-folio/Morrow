import {decodeDomainCurrent,decodeDomainHead,decodeRecoveryEnvelope,decodeRawRecovery,sameDomainHandle,
  type RecoveryDomainDriver,type RecoveryDomainState,type RecoveryClaimRequest,type RecoveryEnvelope,type RecoveryHandle,type RecoveryClaimState} from './durable-recovery-domain.ts';
import {createRecoveryDomainStore} from './durable-recovery-store.ts';
import {createRecoveryEntryStore,entryHead,decideEntryWrite,type PreparedEntryWrite} from './durable-entry-store.ts';
import {type RecoveryEntryScope,type RecoveryEntryEnvelope,type RecoveryEntryRequest,type RecoveryEntryMutation} from './durable-entry-protocol.ts';
import {decodeRecoveryLifecycle} from './recovery-domain-lifecycle.ts';
import {resolveRecoveryProvenance} from './recovery-provenance.ts';
import {recoveryErrorReason} from './durable-recovery-error.ts';
import {rebindRecoveryClaimInputs} from './recovery-claim-inputs.ts';
import {builderInputDraftKey} from './trip-builder-input-draft.ts';
import {readNativeHomepageBundle} from './homepage-persistence.ts';
import {tripRecoveryStorageKey,tripCacheStorageKey,currentTripStorageKey,EASYT_ACTIVE_TRIP_KEY,type EasyTBrowserStorage} from './storage.ts';

type NativeSnapshot={recoveries:{key:string;raw:string}[];builderRaw:string|null;homeInputRaw:string|null;homeDraftRaw:string|null;cacheRaw:string|null;pointerRaw:string|null;legacyRaw:string|null};
type ClaimStorage=Pick<EasyTBrowserStorage,'getItem'>&Partial<Pick<EasyTBrowserStorage,'length'|'key'>>;
type ClaimProof={version:1;claimId:string;phase:'pending'|'complete';source:RecoveryEnvelope;target:RecoveryEnvelope;
  sourceState:string;targetState:string;sourceNative:NativeSnapshot;targetNative:NativeSnapshot};
type Barrier={kind:'ready';proof?:ClaimProof}|{kind:'protected'|'unavailable';reason:string};
export type RecoveryClaimResult={kind:'verified';handle:RecoveryHandle;guestResolved:false;accountAcknowledged:false}
  |{kind:'held'|'protected'|'unavailable';reason:string;committed?:boolean};
const activeGuard=(isCurrent:()=>boolean)=>()=>{try{return isCurrent()===true}catch{return false}};
const claimScope=(ownerId:string|null,tripId:string):RecoveryEntryScope=>({ownerId,tripId,kind:'recovery-claim'});
const requests=(handle:RecoveryHandle):RecoveryEntryRequest[]=>[
  {scope:{ownerId:handle.ownerId,tripId:handle.tripId,kind:'recovery-lifecycle'},writeId:null},
  {scope:{ownerId:handle.ownerId,tripId:handle.tripId,kind:'builder-input'},writeId:null},
  {scope:{ownerId:handle.ownerId,tripId:null,kind:'homepage'},writeId:null},
  {scope:claimScope(handle.ownerId,handle.tripId),writeId:null}];
function signature(state:RecoveryDomainState) {
  return JSON.stringify({headRaw:state.headRaw??null,headGenerationRaw:state.headGenerationRaw??null,generationRaw:state.generationRaw??null,
    acknowledgementRaw:state.acknowledgementRaw??null,currentRaw:state.currentRaw??null,
    entries:state.entries.slice(0,3).map(entry=>({headRaw:entry.headRaw??null,headGenerationRaw:entry.headGenerationRaw??null}))});
}
function nativeSnapshot(storage:ClaimStorage,ownerId:string|null,tripId:string):NativeSnapshot {
  const snapshot=()=>{
    const home=readNativeHomepageBundle(storage,ownerId);
    const prefix=tripRecoveryStorageKey(ownerId,tripId),recoveries:{key:string;raw:string}[]=[];
    if(typeof storage.length!=='number'||typeof storage.key!=='function')throw new Error('Claim native enumeration unavailable');
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);if(!key||key!==prefix&&!key.startsWith(prefix+':'))continue;
      const raw=storage.getItem(key);if(raw!==null)recoveries.push({key,raw});
    }
    return {recoveries:recoveries.sort((a,b)=>a.key.localeCompare(b.key)),builderRaw:storage.getItem(builderInputDraftKey(ownerId,tripId)),
      homeInputRaw:home.inputRaw,homeDraftRaw:home.draftRaw,
      cacheRaw:storage.getItem(tripCacheStorageKey(ownerId,tripId)),pointerRaw:storage.getItem(currentTripStorageKey(ownerId)),legacyRaw:storage.getItem(EASYT_ACTIVE_TRIP_KEY)};
  };
  const first=snapshot();if(JSON.stringify(first)!==JSON.stringify(snapshot()))throw new Error('Unstable claim source');return first;
}
const homeRaw=(native:NativeSnapshot)=>JSON.stringify({version:1,inputRaw:native.homeInputRaw,draftRaw:native.homeDraftRaw});
function nativePendingClaimTrips(storage:ClaimStorage,ownerId:string|null):string[] {
  const prefix=tripRecoveryStorageKey(ownerId,'__trip__').slice(0,-'__trip__'.length);
  const observe=()=>{
    if(typeof storage.length!=='number'||typeof storage.key!=='function')throw new Error('Native claim enumeration unavailable');
    const rows:{key:string;raw:string|null}[]=[];
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))rows.push({key,raw:storage.getItem(key)});}
    return rows.sort((a,b)=>a.key.localeCompare(b.key));
  };
  const rows=observe();if(JSON.stringify(rows)!==JSON.stringify(observe()))throw new Error('Native claim observation changed');
  const ids:string[]=[];
  for(const row of rows) {
    if(row.raw===null)continue;
    let value:unknown;try{value=JSON.parse(row.raw)}catch{if(row.raw.includes('"localClaimId"'))throw new Error('Unknown native claim marker');continue;}
    if(value&&typeof value==='object'&&!Array.isArray(value)&&'localClaimId' in value) {
      const tripId=decodeURIComponent(row.key.slice(prefix.length).split(':')[0]);if(!tripId.trim())throw new Error('Invalid native claim identity');ids.push(tripId);
    }
  }
  return ids;
}
/** Navigation is claim-time CAS evidence, not lifetime body ancestry. Only
 * actual scoped recovery and required input bytes can invalidate the copy. */
function lifetimeState(raw:string,proof:ClaimProof) {
  const value=JSON.parse(raw) as {currentRaw:unknown;entries:unknown[]};delete (value as Partial<typeof value>).currentRaw;
  if(proof.target.entry.input===null)value.entries[1]=null;
  if(proof.target.entry.receipt===null)value.entries[2]=null;
  return JSON.stringify(value);
}
function lifetimeNative(native:NativeSnapshot,original:NativeSnapshot,proof:ClaimProof) {
  return JSON.stringify({recoveries:native.recoveries,
    builderRaw:proof.target.entry.input!==null?native.builderRaw:null,
    homeInputRaw:proof.target.entry.receipt!==null?native.homeInputRaw:null,
    homeDraftRaw:original.homeDraftRaw!==null?native.homeDraftRaw:null,legacyRaw:original.legacyRaw!==null?native.legacyRaw:null});
}
function decodeProof(raw:string|null):ClaimProof|null {
  try {
    const value:unknown=raw===null?null:JSON.parse(raw);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const proof=value as ClaimProof;
    if(Object.keys(value).sort().join(',')!=='claimId,phase,source,sourceNative,sourceState,target,targetNative,targetState,version'
      ||proof.version!==1||typeof proof.claimId!=='string'||!proof.claimId.trim()||!['pending','complete'].includes(proof.phase)
      ||typeof proof.sourceState!=='string'||typeof proof.targetState!=='string')return null;
    const source=decodeRecoveryEnvelope(JSON.stringify(proof.source),proof.source?.handle),target=decodeRecoveryEnvelope(JSON.stringify(proof.target),proof.target?.handle);
    if(source.kind!=='readable'||target.kind!=='readable'||source.value.handle.ownerId!==null||!target.value.handle.ownerId
      ||source.value.handle.tripId!==target.value.handle.tripId||target.value.parent!==null
      ||target.value.entry.claim?.claimId!==proof.claimId||!sameDomainHandle(target.value.entry.claim.source,source.value.handle))return null;
    for(const native of [proof.sourceNative,proof.targetNative]) {
      if(!native||Object.keys(native).sort().join(',')!=='builderRaw,cacheRaw,homeDraftRaw,homeInputRaw,legacyRaw,pointerRaw,recoveries'
        ||!Array.isArray(native.recoveries)||!native.recoveries.every(row=>row&&Object.keys(row).sort().join(',')==='key,raw'&&typeof row.key==='string'&&typeof row.raw==='string')
        ||![native.builderRaw,native.cacheRaw,native.homeDraftRaw,native.homeInputRaw,native.legacyRaw,native.pointerRaw].every(raw=>raw===null||typeof raw==='string'))return null;
    }
    return proof;
  }catch{return null;}
}
function metadata(state:RecoveryDomainState,request:RecoveryEntryRequest[]) {
  const heads=request.map((item,i)=>entryHead(state.entries[i],item.scope));
  return heads.every(head=>head.kind==='valid')?heads:null;
}
function prepare(scope:RecoveryEntryScope,raw:string,parent:RecoveryEntryEnvelope|null,writeId:string,legacyRaw:string|null=null):PreparedEntryWrite {
  const envelope:RecoveryEntryEnvelope={version:1,handle:{...scope,version:1,backend:'indexeddb-entry',writeId},parent:parent?.handle??null,
    raw,legacyRaw,retainedPreviousRaw:parent?.raw??null};
  return {kind:'prepared',scope,envelope,raw:JSON.stringify(envelope),expected:envelope.parent};
}
const mutation=(prepared:PreparedEntryWrite,state:RecoveryDomainState,index:number):RecoveryEntryMutation|null=>{
  const decision=decideEntryWrite(prepared,state.entries[index]);return decision.kind==='write'?decision.mutation??null:null;
};
/** Reads guest data only through an explicit paired claim pointer. Pending
 * destination metadata never grants read/write/promotion authority. */
export async function readRecoveryClaimBarrier(driver:RecoveryDomainDriver,storage:ClaimStorage,
  context:{ownerId:string|null;isCurrent:()=>boolean},tripId:string,envelope:RecoveryEnvelope|null=null):Promise<Barrier> {
  const active=activeGuard(context.isCurrent),ownerId=context.ownerId,scope=claimScope(ownerId,tripId);
  try {if(nativePendingClaimTrips(storage,ownerId).includes(tripId))return {kind:'protected',reason:'native-claim-unqualified'};}
  catch{return {kind:'unavailable',reason:'native-claim-enumeration-unknown'};}
  const row=await createRecoveryEntryStore(driver,{ownerId,isCurrent:active}).read(scope);
  try {if(nativePendingClaimTrips(storage,ownerId).includes(tripId))return {kind:'protected',reason:'native-claim-unqualified'};}
  catch{return {kind:'unavailable',reason:'native-claim-enumeration-unknown'};}
  if(row.kind!=='ready')return {kind:row.kind==='protected-conflict'?'protected':'unavailable',reason:'claim-read-unknown'};
  if(!row.envelope)return envelope?.entry.claim?{kind:'protected',reason:'claim-proof-missing'}:{kind:'ready'};
  if(row.envelope.legacyRaw!==null)return {kind:'protected',reason:'claim-proof-payload'};
  const proof=decodeProof(row.envelope.raw);
  if(!proof||proof.source.handle.tripId!==tripId)return {kind:'protected',reason:'claim-proof-payload'};
  if(ownerId===null)return proof.phase==='complete'?{kind:'ready'}:{kind:'protected',reason:'claim-source-pending'};
  if(proof.target.handle.ownerId!==ownerId)return {kind:'protected',reason:'claim-owner'};
  if(proof.phase==='pending')return {kind:'protected',reason:'claim-pending'};
  if(!envelope||envelope.entry.claim?.claimId!==proof.claimId||!sameDomainHandle(envelope.entry.claim.source,proof.source.handle)||!driver.runClaim)return {kind:'protected',reason:'claim-proof-missing'};
  try {
    const request:RecoveryClaimRequest={sourceHandle:proof.source.handle,targetHandle:proof.target.handle,sourceEntries:requests(proof.source.handle),targetEntries:requests(proof.target.handle)};
    const valid=await driver.runClaim(request,'readonly',state=>{
      const source=metadata(state.source,request.sourceEntries),target=metadata(state.target,request.targetEntries);
      const sourceProof=source?.[3],targetProof=target?.[3];
      return {value:active()&&lifetimeState(signature(state.source),proof)===lifetimeState(proof.sourceState,proof)&&state.target.generationRaw===JSON.stringify(proof.target)
        &&state.target.headRaw===JSON.stringify(envelope.handle)&&state.target.headGenerationRaw===JSON.stringify(envelope)
        &&sourceProof?.kind==='valid'&&targetProof?.kind==='valid'&&sourceProof.envelope?.raw===row.envelope?.raw&&targetProof.envelope?.raw===row.envelope?.raw
        &&sourceProof.envelope?.legacyRaw===null&&targetProof.envelope?.legacyRaw===null
        &&state.source.entries[3].generationRaw===state.source.entries[3].headGenerationRaw&&state.target.entries[3].generationRaw===state.target.entries[3].headGenerationRaw
        &&lifetimeNative(nativeSnapshot(storage,null,tripId),proof.sourceNative,proof)===lifetimeNative(proof.sourceNative,proof.sourceNative,proof)
        &&lifetimeNative(nativeSnapshot(storage,ownerId,tripId),proof.targetNative,proof)===lifetimeNative(proof.targetNative,proof.targetNative,proof)};
    });
    return valid&&active()?{kind:'ready',proof}:{kind:'protected',reason:'claim-source-changed'};
  }catch{return {kind:'unavailable',reason:'claim-verification-unknown'};}
}
export async function recoveryClaimTripIds(driver:RecoveryDomainDriver,ownerId:string|null):Promise<{kind:'ready';tripIds:string[]}|{kind:'unavailable';reason:string}> {
  try {
    if(!driver.listClaimHeads)return {kind:'unavailable',reason:'claim-enumeration-unavailable'};
    const rows=await driver.listClaimHeads(ownerId);
    return {kind:'ready',tripIds:rows.map(row=>(JSON.parse(row.key) as [string,string|null,string,string])[3])};
  }catch{return {kind:'unavailable',reason:'claim-enumeration-unknown'};}
}
export async function readOwnerRecoveryClaimBarrier(driver:RecoveryDomainDriver,storage:ClaimStorage,context:{ownerId:string|null;isCurrent:()=>boolean}):Promise<Barrier> {
  try{if(nativePendingClaimTrips(storage,context.ownerId).length)return {kind:'protected',reason:'native-claim-unqualified'};}
  catch{return {kind:'unavailable',reason:'native-claim-enumeration-unknown'};}
  const ids=await recoveryClaimTripIds(driver,context.ownerId);if(ids.kind!=='ready')return ids;
  for(const tripId of ids.tripIds) {
    const row=await createRecoveryDomainStore(driver,context).read(tripId);
    if(row.kind!=='ready')return {kind:'protected',reason:'claim-canonical-unknown'};
    const barrier=await readRecoveryClaimBarrier(driver,storage,context,tripId,row.envelope);if(barrier.kind!=='ready')return barrier;
  }
  const currentIds=await recoveryClaimTripIds(driver,context.ownerId);if(currentIds.kind!=='ready')return currentIds;
  if(JSON.stringify([...currentIds.tripIds].sort())!==JSON.stringify([...ids.tripIds].sort()))return {kind:'protected',reason:'claim-set-changed'};
  try{if(nativePendingClaimTrips(storage,context.ownerId).length)return {kind:'protected',reason:'native-claim-unqualified'};}
  catch{return {kind:'unavailable',reason:'native-claim-enumeration-unknown'};}
  return activeGuard(context.isCurrent)()?{kind:'ready'}:{kind:'protected',reason:'operation-changed'};
}
/** Dedicated same-database exception. No source canonical/input/home/lifecycle
 * mutation, guest retirement, account write or ACK occurs here. */
export function createRecoveryClaimCoordinator(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,
  context:{ownerId:string;isCurrent:()=>boolean;enabled:boolean}) {
  const ownerId=context.ownerId,active=activeGuard(context.isCurrent);
  const hold=(reason:string,committed=false):RecoveryClaimResult=>({kind:'held',reason,...(committed?{committed:true}:{})});
  return {async claim(tripId:string):Promise<RecoveryClaimResult> {
    if(!context.enabled)return hold('claim-activation-held');
    if(!ownerId.trim()||!tripId.trim()||!active()||!driver.runClaim)return hold('claim-scope-or-driver');
    try {
      const sourceRead=await createRecoveryDomainStore(driver,{ownerId:null,isCurrent:active}).read(tripId);
      const targetRead=await createRecoveryDomainStore(driver,{ownerId,isCurrent:active}).read(tripId);
      if(sourceRead.kind!=='ready'||!sourceRead.envelope||sourceRead.envelope.entry.claim)return hold('guest-domain-required');
      if(targetRead.kind!=='ready')return hold('destination-not-ready');
      const existing=await readRecoveryClaimBarrier(driver,storage,{ownerId,isCurrent:active},tripId,targetRead.envelope);
      if(existing.kind!=='ready')return existing;
      if(existing.proof) {
        return sameDomainHandle(targetRead.envelope?.handle??null,existing.proof.target.handle)&&sameDomainHandle(sourceRead.envelope.handle,existing.proof.source.handle)
          ?{kind:'verified',handle:existing.proof.target.handle,guestResolved:false,accountAcknowledged:false}:hold('claim-target-changed');
      }
      if(targetRead.envelope)return hold('destination-exists');
      const source=sourceRead.envelope,sourceNative=nativeSnapshot(storage,null,tripId),targetNative=nativeSnapshot(storage,ownerId,tripId);
      const provenance=resolveRecoveryProvenance({scope:source.handle,legacy:{kind:'ready',copies:sourceNative.recoveries},domain:sourceRead});
      if(provenance.kind!=='indexeddb'||sourceNative.legacyRaw!==null)return hold('guest-provenance');
      if(targetNative.recoveries.length||targetNative.cacheRaw!==null||targetNative.builderRaw!==null||targetNative.homeInputRaw!==null||targetNative.homeDraftRaw!==null||targetNative.legacyRaw!==null)return hold('destination-native-data');
      const targetHandle:RecoveryHandle={version:1,backend:'indexeddb',ownerId,tripId,writeId:globalThis.crypto.randomUUID()};
      const request:RecoveryClaimRequest={sourceHandle:source.handle,targetHandle,sourceEntries:requests(source.handle),targetEntries:requests(targetHandle)};
      const observed=await driver.runClaim(request,'readonly',state=>({value:state}));
      if(!active()||observed.source.headRaw!==JSON.stringify(source.handle)||observed.source.generationRaw!==JSON.stringify(source)||observed.source.headGenerationRaw!==JSON.stringify(source)
        ||observed.source.acknowledgementRaw!==undefined||observed.target.headRaw!==undefined||observed.target.generationRaw!==undefined||observed.target.acknowledgementRaw!==undefined
        ||decodeDomainCurrent(observed.source.currentRaw,null).kind!=='readable'||decodeDomainCurrent(observed.target.currentRaw,ownerId).kind!=='readable')return hold('claim-canonical-snapshot');
      const sourceHeads=metadata(observed.source,request.sourceEntries),targetHeads=metadata(observed.target,request.targetEntries);
      if(!sourceHeads||!targetHeads||targetHeads.some(head=>head.kind!=='valid'||head.envelope!==null)||sourceHeads[3].kind!=='valid'||sourceHeads[3].envelope!==null)return hold('claim-entry-conflict');
      const lifecycle=sourceHeads[0].kind==='valid'?sourceHeads[0].envelope:null;
      if(lifecycle) {
        const decoded=lifecycle.raw===null?null:decodeRecoveryLifecycle(lifecycle.raw,null,tripId);
        if(!decoded||!sameDomainHandle(decoded.handle,source.handle)||decoded.rawRecovery!==source.rawRecovery||decoded.disposition!=='active'||decoded.state==='conflict')return hold('claim-source-lifecycle');
      }
      const payload=(index:number,native:string|null)=>{
        const head=sourceHeads[index];if(head.kind!=='valid')return undefined;
        if(!head.envelope)return native;
        return (native===head.envelope.legacyRaw||native===head.envelope.raw)&&observed.source.entries[index].generationRaw===observed.source.entries[index].headGenerationRaw?head.envelope.raw:undefined;
      };
      const builderRaw=payload(1,sourceNative.builderRaw),homepageRaw=payload(2,homeRaw(sourceNative));
      if(builderRaw===undefined||homepageRaw===undefined)return hold('claim-input-divergence');
      const rebound=rebindRecoveryClaimInputs(source,builderRaw,homepageRaw===homeRaw({...sourceNative,homeInputRaw:null,homeDraftRaw:null})?null:homepageRaw,ownerId);
      if(rebound.kind!=='ready')return hold(rebound.reason);
      const sourceRecord=decodeRawRecovery(source.rawRecovery,source.handle);if(sourceRecord.kind!=='readable')return hold('claim-source-payload');
      const claimId=globalThis.crypto.randomUUID(),target:RecoveryEnvelope={version:1,handle:targetHandle,parent:null,legacySources:[],
        rawRecovery:JSON.stringify({...sourceRecord.value,ownerId,writeId:targetHandle.writeId,trip:sourceRecord.value.trip,localClaimId:claimId}),
        entry:{pointer:targetHandle,input:rebound.input,receipt:rebound.receipt,nativePointerRaw:targetNative.pointerRaw,claim:{source:source.handle,claimId}}};
      if(decodeRecoveryEnvelope(JSON.stringify(target),targetHandle).kind!=='readable')return hold('claim-target-payload');
      const proof:ClaimProof={version:1,claimId,phase:'pending',source,target,sourceState:signature(observed.source),targetState:signature(observed.target),sourceNative,targetNative};
      const pending=prepare(claimScope(ownerId,tripId),JSON.stringify(proof),null,globalThis.crypto.randomUUID());request.targetEntries[3].writeId=pending.envelope.handle.writeId;
      const unchanged=()=>active()&&JSON.stringify(nativeSnapshot(storage,null,tripId))===JSON.stringify(sourceNative)&&JSON.stringify(nativeSnapshot(storage,ownerId,tripId))===JSON.stringify(targetNative);
      const reserved=await driver.runClaim(request,'readwrite',state=>{
        if(!unchanged()||signature(state.source)!==proof.sourceState||signature(state.target)!==proof.targetState)return {value:false};
        const write=mutation(pending,state.target,3);return {value:!!write,...(write?{targetEntryWrites:[write]}:{})};
      });
      if(!reserved||!active())return hold('claim-reservation-unconfirmed',reserved);
      const reservedRead=await driver.runClaim(request,'readonly',state=>({value:unchanged()&&signature(state.source)===proof.sourceState&&signature(state.target)===proof.targetState
        &&state.target.entries[3].headRaw===JSON.stringify(pending.envelope.handle)&&state.target.entries[3].generationRaw===pending.raw&&state.target.entries[3].headGenerationRaw===pending.raw}));
      if(!reservedRead||!active())return hold('claim-reservation-readback',true);
      if(!unchanged())return hold('claim-native-changed',true);
      // A genuine native setter failure is the only initial canonical overflow admission.
      try {storage.setItem(tripRecoveryStorageKey(ownerId,tripId,targetHandle.writeId),target.rawRecovery);return hold('native-success-claim-held',true);}
      catch(error){if(recoveryErrorReason(error)!=='quota')return hold('native-claim-failure-'+recoveryErrorReason(error),true);}
      if(!unchanged())return hold('claim-native-changed',true);
      const completed={...proof,phase:'complete' as const},proofRaw=JSON.stringify(completed),sourceProof=prepare(claimScope(null,tripId),proofRaw,null,globalThis.crypto.randomUUID()),targetProof=prepare(claimScope(ownerId,tripId),proofRaw,pending.envelope,globalThis.crypto.randomUUID());
      request.sourceEntries[3].writeId=sourceProof.envelope.handle.writeId;request.targetEntries[3].writeId=targetProof.envelope.handle.writeId;
      const inputs:PreparedEntryWrite[]=[];
      if(rebound.builderRaw!==null)inputs.push(prepare(request.targetEntries[1].scope,rebound.builderRaw,null,globalThis.crypto.randomUUID(),targetNative.builderRaw));
      if(rebound.homepageRaw!==null)inputs.push(prepare(request.targetEntries[2].scope,rebound.homepageRaw,null,globalThis.crypto.randomUUID(),homeRaw(targetNative)));
      for(const input of inputs)request.targetEntries[input.scope.kind==='builder-input'?1:2].writeId=input.envelope.handle.writeId;
      const committed=await driver.runClaim(request,'readwrite',state=>{
        if(!unchanged()||signature(state.source)!==proof.sourceState||signature(state.target)!==proof.targetState||state.target.entries[3].headGenerationRaw!==pending.raw)return {value:false};
        const sourceWrite=mutation(sourceProof,state.source,3),targetWrite=mutation(targetProof,state.target,3),inputWrites=inputs.map(input=>mutation(input,state.target,input.scope.kind==='builder-input'?1:2));
        if(!sourceWrite||!targetWrite||inputWrites.some(write=>!write))return {value:false};
        return {value:true,targetGenerationRaw:JSON.stringify(target),targetHeadRaw:JSON.stringify(targetHandle),targetCurrentRaw:JSON.stringify(targetHandle),
          sourceEntryWrites:[sourceWrite],targetEntryWrites:[targetWrite,...inputWrites as RecoveryEntryMutation[]]};
      });
      if(!committed||!active())return hold('claim-commit-unconfirmed',true);
      const exact=await driver.runClaim(request,'readonly',state=>({value:active()&&unchanged()&&signature(state.source)===proof.sourceState
        &&state.source.entries[3].generationRaw===sourceProof.raw&&state.source.entries[3].headGenerationRaw===sourceProof.raw
        &&state.source.entries[3].headRaw===JSON.stringify(sourceProof.envelope.handle)
        &&state.target.generationRaw===JSON.stringify(target)&&state.target.headGenerationRaw===JSON.stringify(target)&&state.target.headRaw===JSON.stringify(targetHandle)&&state.target.currentRaw===JSON.stringify(targetHandle)
        &&state.target.entries[3].generationRaw===targetProof.raw&&state.target.entries[3].headGenerationRaw===targetProof.raw
        &&state.target.entries[3].headRaw===JSON.stringify(targetProof.envelope.handle)
        &&inputs.every(input=>state.target.entries[input.scope.kind==='builder-input'?1:2].generationRaw===input.raw&&state.target.entries[input.scope.kind==='builder-input'?1:2].headGenerationRaw===input.raw
          &&state.target.entries[input.scope.kind==='builder-input'?1:2].headRaw===JSON.stringify(input.envelope.handle))}));
      return exact&&active()?{kind:'verified',handle:targetHandle,guestResolved:false,accountAcknowledged:false}:hold('claim-readback-unconfirmed',true);
    }catch{return {kind:'unavailable',reason:'claim-operation-unknown'};}
  }};
}

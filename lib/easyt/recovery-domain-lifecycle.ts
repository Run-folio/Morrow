import {decodeDomainHead,decodeDomainCurrent,decodeRecoveryEnvelope,decodeRawRecovery,isDomainHandle,sameDomainHandle,
  type RecoveryDomainDriver,type RecoveryEnvelope,type RecoveryDomainState,type RecoveryHandle} from './durable-recovery-domain.ts';
import {entryHead,decideEntryWrite,verifyEntryWrite,type PreparedEntryWrite} from './durable-entry-store.ts';
import type {RecoveryEntryScope,RecoveryEntryEnvelope} from './durable-entry-protocol.ts';
import type {TripRecoveryState,TripRecoveryConflictReason} from './storage.ts';

/** Existing canonical recovery grants this metadata slot. This coordinator
 * verifies that binding inside the same transaction; it never admits a trip,
 * forges setter quota, mutates a generation or records an account ACK. */
export type RecoveryLifecycle={version:1;handle:RecoveryHandle;rawRecovery:string;state:TripRecoveryState;
  conflictReason:TripRecoveryConflictReason|null;disposition:'active'|'discarded'};
type Read={kind:'ready';lifecycle:RecoveryLifecycle|null;entry:RecoveryEntryEnvelope|null}|{kind:'protected'|'unavailable';reason:string};
const states=['pending','network','auth','conflict','validation','repository','unknown'];
const reasons=['cloud-changed','cloud-deleted','cloud-newer','cloud-different'];
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
export function decodeRecoveryLifecycle(raw:string,ownerId:string|null,tripId:string):RecoveryLifecycle|null {
  try {
    const value:unknown=JSON.parse(raw);
    if(!object(value)||value.version!==1||Object.keys(value).sort().join(',')!=='conflictReason,disposition,handle,rawRecovery,state,version'
      ||!isDomainHandle(value.handle)||value.handle.ownerId!==ownerId||value.handle.tripId!==tripId
      ||typeof value.rawRecovery!=='string'||!states.includes(String(value.state))||!['active','discarded'].includes(String(value.disposition))
      ||!(value.conflictReason===null||value.state==='conflict'&&reasons.includes(String(value.conflictReason))))return null;
    const source=decodeRawRecovery(value.rawRecovery,{ownerId,tripId});
    return source.kind==='readable'&&source.value.writeId===value.handle.writeId?value as RecoveryLifecycle:null;
  }catch{return null;}
}
export function createRecoveryLifecycle(driver:RecoveryDomainDriver,context:{ownerId:string|null;isCurrent:()=>boolean}) {
  const ownerId=context.ownerId,active=()=>{try{return context.isCurrent()===true;}catch{return false}};
  function bound(state:RecoveryDomainState,envelope:RecoveryEnvelope) {
    const scope={ownerId,tripId:envelope.handle.tripId},head=decodeDomainHead(state.headRaw,scope),current=decodeDomainCurrent(state.currentRaw,ownerId);
    const generation=decodeRecoveryEnvelope(state.headGenerationRaw,scope);
    return head.kind==='readable'&&current.kind==='readable'&&generation.kind==='readable'
      &&sameDomainHandle(head.value,envelope.handle)&&state.generationRaw===JSON.stringify(envelope)&&state.headGenerationRaw===JSON.stringify(envelope);
  }
  function inspect(state:RecoveryDomainState,envelope:RecoveryEnvelope):Read {
    if(!active()||envelope.handle.ownerId!==ownerId||!bound(state,envelope))return {kind:'protected',reason:'canonical-changed'};
    const scope:RecoveryEntryScope={ownerId,kind:'recovery-lifecycle',tripId:envelope.handle.tripId},head=entryHead(state.entries[0],scope);
    if(head.kind!=='valid')return {kind:head.kind==='failure'&&!['schema','corrupt'].includes(head.reason)?'unavailable':'protected',reason:head.reason};
    if(!head.envelope)return {kind:'ready',lifecycle:null,entry:null};
    if(state.entries[0].generationRaw!==state.entries[0].headGenerationRaw||head.envelope.raw===null||head.envelope.legacyRaw!==null)return {kind:'protected',reason:'lifecycle-payload'};
    const lifecycle=decodeRecoveryLifecycle(head.envelope.raw,ownerId,envelope.handle.tripId);
    if(!lifecycle)return {kind:'protected',reason:'lifecycle-payload'};
    if(sameDomainHandle(lifecycle.handle,envelope.handle)&&lifecycle.rawRecovery!==envelope.rawRecovery)return {kind:'protected',reason:'lifecycle-binding'};
    // An earlier exact journal does not set the status of a later canonical edit.
    return {kind:'ready',lifecycle:sameDomainHandle(lifecycle.handle,envelope.handle)?lifecycle:null,entry:head.envelope};
  }
  return {
    async absent(tripId:string):Promise<{kind:'ready';lifecycle:null}|{kind:'protected'|'unavailable';reason:string}> {
      const scope={ownerId,tripId},entryScope:RecoveryEntryScope={...scope,kind:'recovery-lifecycle'};
      try {
        const result=await driver.run(scope,null,'readonly',snapshot=>{
          const head=decodeDomainHead(snapshot.headRaw,scope),entry=entryHead(snapshot.entries[0],entryScope);
          return {value:active()&&head.kind==='readable'&&head.value===null&&entry.kind==='valid'&&entry.envelope===null
            ?{kind:'ready' as const,lifecycle:null}:{kind:'protected' as const,reason:'unbound-lifecycle'}};
        },[{scope:entryScope,writeId:null}]);
        return active()?result:{kind:'protected',reason:'operation-changed'};
      }catch{return {kind:'unavailable',reason:'lifecycle-read-unknown'};}
    },
    async read(input:RecoveryEnvelope):Promise<Read> {
      const envelope=structuredClone(input),scope={ownerId,tripId:envelope.handle.tripId},entryScope:RecoveryEntryScope={...scope,kind:'recovery-lifecycle'};
      try {
        const result=await driver.run(scope,envelope.handle.writeId,'readonly',state=>({value:inspect(state,envelope)}),[{scope:entryScope,writeId:null}]);
        return active()?result:{kind:'protected',reason:'operation-changed'};
      }catch{return {kind:'unavailable',reason:'lifecycle-read-unknown'};}
    },
    async write(input:RecoveryEnvelope,updateInput:{state?:TripRecoveryState;conflictReason?:TripRecoveryConflictReason;discard?:boolean},nativePointerRaw:string|null=null):Promise<boolean> {
      const envelope=structuredClone(input),update={...updateInput},scope={ownerId,tripId:envelope.handle.tripId},entryScope:RecoveryEntryScope={...scope,kind:'recovery-lifecycle'};
      if(!active()||envelope.handle.ownerId!==ownerId||update.state!==undefined&&!states.includes(update.state)
        ||update.conflictReason!==undefined&&!reasons.includes(update.conflictReason))return false;
      const previous=await this.read(envelope);if(previous.kind!=='ready'||!active())return false;
      if(previous.lifecycle?.disposition==='discarded')return update.discard===true;
      const record=decodeRawRecovery(envelope.rawRecovery,scope);if(record.kind!=='readable')return false;
      const state=update.state??previous.lifecycle?.state??record.value.state;
      const lifecycle:RecoveryLifecycle={version:1,handle:{...envelope.handle},rawRecovery:envelope.rawRecovery,state,
        conflictReason:state==='conflict'?update.conflictReason??previous.lifecycle?.conflictReason??record.value.conflictReason??null:null,
        disposition:update.discard?'discarded':'active'};
      const metadata:RecoveryEntryEnvelope={version:1,handle:{...entryScope,version:1,backend:'indexeddb-entry',writeId:globalThis.crypto.randomUUID()},
        parent:previous.entry?.handle??null,legacyRaw:null,retainedPreviousRaw:previous.entry?.raw??null,raw:JSON.stringify(lifecycle)};
      const prepared:PreparedEntryWrite={kind:'prepared',scope:entryScope,envelope:metadata,raw:JSON.stringify(metadata),expected:metadata.parent};
      try {
        const committed=await driver.run(scope,envelope.handle.writeId,'readwrite',snapshot=>{
          if(!active()||!bound(snapshot,envelope))return {value:false};
          const decision=decideEntryWrite(prepared,snapshot.entries[0]);if(decision.kind!=='write')return {value:false};
          const pointer=decodeDomainCurrent(snapshot.currentRaw,ownerId),clear=update.discard&&pointer.kind==='readable'
            &&pointer.value?.backend==='indexeddb'&&sameDomainHandle(pointer.value,envelope.handle);
          return {value:true,...(decision.mutation?{entryWrites:[decision.mutation]}:{}),
            ...(clear?{currentRaw:JSON.stringify({version:1,backend:'cleared',ownerId,nativePointerRaw})}:{})};
        },[{scope:entryScope,writeId:metadata.handle.writeId}]);
        if(!committed||!active())return false;
        return await driver.run(scope,envelope.handle.writeId,'readonly',snapshot=>({value:active()&&bound(snapshot,envelope)
          &&verifyEntryWrite(prepared,snapshot.entries[0])===null}),[{scope:entryScope,writeId:metadata.handle.writeId}])&&active();
      }catch{return false;}
    },
  };
}

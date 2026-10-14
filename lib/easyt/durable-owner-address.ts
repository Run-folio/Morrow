import type {EasyTBrowserStorage} from './storage.ts';
import type {RecoveryDomainDriver} from './durable-recovery-domain.ts';
import type {RecoveryEntryEnvelope,RecoveryEntryScope} from './durable-entry-protocol.ts';
import {createRecoveryEntryStore} from './durable-entry-store.ts';
import {recoveryErrorReason} from './durable-recovery-error.ts';

const key='easyt:last-owner:v1';
const scope:RecoveryEntryScope={ownerId:null,kind:'browser-owner',tripId:null};
type Address={version:1;ownerId:string|null};
type Read={kind:'ready';ownerId:string|null}|{kind:'protected'|'unavailable';reason:string};
const decode=(raw:string|null):Address|null=>{if(raw===null)return{version:1,ownerId:null};try{const v=JSON.parse(raw);return v&&v.version===1&&Object.keys(v).sort().join(',')==='ownerId,version'&&(v.ownerId===null||typeof v.ownerId==='string'&&v.ownerId.trim())?v:null;}catch{return null;}};
/** Offline address only. Call write exclusively for a validated live session or
 * explicit sign-out. No trip scan, auth authority, recency winner or DB upgrade. */
export function createDurableOwnerAddress(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,isCurrent:()=>boolean){
 const active=()=>{try{return isCurrent()===true;}catch{return false;}};
 const entries=createRecoveryEntryStore(driver,{ownerId:null,isCurrent:active});
 const native=()=>{const raw=storage.getItem(key);if(raw!==storage.getItem(key))throw Error('address changed');return raw;};
 async function read():Promise<Read>{
  const state=await entries.read(scope);if(state.kind!=='ready')return{kind:state.kind==='protected-conflict'?'protected':'unavailable',reason:state.kind==='verified'?'unknown':state.reason};
  try{const raw=native(),e=state.envelope;if(!active())return{kind:'protected',reason:'retired'};
   if(e&&raw!==e.legacyRaw&&raw!==e.raw)return{kind:'protected',reason:'native-divergence'};
   const value=decode(e?e.raw:raw);return value?{kind:'ready',ownerId:value.ownerId}:{kind:'protected',reason:'address-payload'};
  }catch{return{kind:'unavailable',reason:'native-read'};}
 }
 return {read,async write(ownerId:string|null):Promise<{kind:'verified'}|{kind:'failure'|'protected';reason:string}>{
  if(ownerId!==null&&(typeof ownerId!=='string'||!ownerId.trim()))return{kind:'protected',reason:'owner'};
  if(!active())return{kind:'protected',reason:'retired'};
  // A validated operation may bind a changed address. Both its observed native
  // bytes and the previous journal payload remain in the immutable generation.
  const state=await entries.read(scope);if(state.kind!=='ready')return{kind:'failure',reason:'address-read'};
  const raw=JSON.stringify({version:1,ownerId});let before:string|null;
  try{before=native();}catch{return{kind:'failure',reason:'native-read'};}
  if(!active())return{kind:'protected',reason:'retired'};
  if(!state.envelope){
   try{storage.setItem(key,raw);const after=await read();return active()&&after.kind==='ready'&&after.ownerId===ownerId?{kind:'verified'}:{kind:'failure',reason:'native-readback'};}
   catch(error){if(recoveryErrorReason(error)!=='quota')return{kind:'failure',reason:'native-setter'};}
   try{if(native()!==before)return{kind:'protected',reason:'native-changed'};}catch{return{kind:'failure',reason:'native-read'};}
  }
  const writeId=globalThis.crypto.randomUUID();const e:RecoveryEntryEnvelope={version:1,handle:{...scope,version:1,backend:'indexeddb-entry',writeId},parent:state.envelope?.handle??null,raw,legacyRaw:before,retainedPreviousRaw:state.envelope?.raw??before};
  const committed=await entries.commit({raw:JSON.stringify(e),expectedHead:e.parent,admission:e.parent?'existing-domain':'native-setter-quota'});
  if(committed.kind!=='verified')return{kind:'failure',reason:'address-commit'};
  const after=await read();return active()&&after.kind==='ready'&&after.ownerId===ownerId?{kind:'verified'}:{kind:'protected',reason:'address-readback'};
 }};
}

/** Explicit sign-out completes only after its offline address fence verifies. */
export async function completeOwnerSignOut(retire:()=>Promise<boolean>,signOut:()=>Promise<void>):Promise<boolean>{
 if(!await retire())return false;await signOut();return true;
}

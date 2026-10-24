import type {EasyTBrowserStorage} from './storage.ts';
import {privateContextScope} from './private-browser-context.ts';
import {isBuilderInputDraftForScope, type BuilderInputDraft} from './trip-builder-input-draft.ts';

/** Passive preservation only. This record is never a trip-write or input-adoption capability. */
export type InterruptedBuilderInput = {version:1;ownerId:string|null;tripId:string;captureId:string;entryKey:string;draft:BuilderInputDraft};
export type InterruptedInputWrite = {kind:'verified'}|{kind:'protected'|'unavailable';reason:string};
const MAX_RECORDS=16, MAX_BYTES=81_920;
const prefix=(ownerId:string|null,tripId:string)=>`easyt:interrupted-builder-input:v1:${privateContextScope(ownerId)}:${encodeURIComponent(tripId)}:`;
export const interruptedInputKey=(record:InterruptedBuilderInput)=>prefix(record.ownerId,record.tripId)+record.captureId;
function valid(value:unknown,ownerId:string|null,tripId:string):value is InterruptedBuilderInput {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as InterruptedBuilderInput;
 return Object.keys(v).sort().join(',')==='captureId,draft,entryKey,ownerId,tripId,version'
  &&v.version===1&&v.ownerId===ownerId&&v.tripId===tripId
  &&(ownerId===null||typeof ownerId==='string'&&ownerId.length>0&&ownerId.length<=256)
  &&typeof tripId==='string'&&tripId.length>0&&tripId.length<=256
  &&typeof v.captureId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v.captureId)
  &&typeof v.entryKey==='string'&&v.entryKey.length>0&&v.entryKey.length<=8192
  &&isBuilderInputDraftForScope(v.draft,ownerId,tripId)&&v.draft.fields.length>0;
}
function keys(storage:EasyTBrowserStorage,ownerId:string|null,tripId:string){
 const found:string[]=[];const start=prefix(ownerId,tripId);
 for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(start))found.push(key);}
 return found.sort();
}
/** One synchronous append and exact readback before the old document can retire/navigate.
 * Failed/uncertain attempts retain the same ID for retry; never overwrite different bytes. */
export function retainInterruptedBuilderInput(storage:EasyTBrowserStorage,record:InterruptedBuilderInput):InterruptedInputWrite {
 try {
  if(!valid(record,record.ownerId,record.tripId))return{kind:'protected',reason:'payload'};
  const raw=JSON.stringify(record);if(raw.length>MAX_BYTES)return{kind:'protected',reason:'size'};
  const key=interruptedInputKey(record),before=storage.getItem(key);
  if(before!==null&&before!==raw)return{kind:'protected',reason:'occupied'};
  if(before===null){
   if(keys(storage,record.ownerId,record.tripId).length>=MAX_RECORDS)return{kind:'unavailable',reason:'capacity'};
   // This synchronous block has no awaited handoff; only this exact new capture is written.
   storage.setItem(key,raw);
  }
  return storage.getItem(key)===raw&&storage.getItem(key)===raw?{kind:'verified'}:{kind:'unavailable',reason:'readback'};
 }catch{return{kind:'unavailable',reason:'storage'};}
}
export function readInterruptedBuilderInputs(storage:EasyTBrowserStorage,ownerId:string|null,tripId:string):{records:InterruptedBuilderInput[];unreadable:boolean} {
 try {
  const names=keys(storage,ownerId,tripId);if(names.length>MAX_RECORDS)return{records:[],unreadable:true};
  const records:InterruptedBuilderInput[]=[];let unreadable=false;
  for(const name of names){
   const raw=storage.getItem(name);
   if(raw===null||raw.length>MAX_BYTES||storage.getItem(name)!==raw){unreadable=true;continue;}
   try {const value:unknown=JSON.parse(raw);
    if(!valid(value,ownerId,tripId)||interruptedInputKey(value)!==name){unreadable=true;continue;}
    records.push(value);
   }catch{unreadable=true;}
  }
  if(JSON.stringify(names)!==JSON.stringify(keys(storage,ownerId,tripId)))return{records:[],unreadable:true};
  return{records,unreadable};
 }catch{return{records:[],unreadable:true};}
}

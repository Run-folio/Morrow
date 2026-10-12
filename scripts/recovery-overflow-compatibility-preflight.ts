/** Frozen legacy incompatibility reproducer; successful reproduction intentionally exits 2. No native IDB claim. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {tripFromBuilder} from '../lib/easyt/trip.ts';
import {projectBuilderCalendar} from '../lib/easyt/trip-builder-calendar.ts';
import {prepareTripDocumentForWrite,requireReadableTripDocument} from '../lib/easyt/trip-document.ts';

const pin='f6e692ee7839d2aed026f128f45f286cc309ee77',now='2026-10-12T00:00:00.000Z';
const repo=new URL('../',import.meta.url);
// Relative dependencies must still match the immutable source pin used below.
execFileSync('git',['diff','--quiet',pin,'--','lib/easyt'],{cwd:fileURLToPath(repo)});
let networkCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkCalls++;throw new Error('Live network is forbidden in this synthetic diagnostic');};
let source=execFileSync('git',['show',pin+':lib/easyt/storage.ts'],{cwd:fileURLToPath(repo),encoding:'utf8'});
source=source.replace(/(from\s+|import\s*)["'](\.\.?\/[^"']+)["']/g,(_all,kind,path)=>kind+JSON.stringify(new URL(path,new URL('../lib/easyt/',import.meta.url)).href));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const old=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const bytes=(k:string,v:string)=>2*(k.length+v.length);
class LegacyStorage {
 values=new Map<string,string>();limit=10*1024*1024;removes=0;
 get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}
 getItem(k:string){return this.values.get(k)??null;}
 usage(){return [...this.values].reduce((n,[k,v])=>n+bytes(k,v),0);}
 setItem(k:string,v:string){const n=this.usage()-(this.values.has(k)?bytes(k,this.values.get(k)!):0)+bytes(k,v);if(n>this.limit)throw new DOMException('Synthetic quota','QuotaExceededError');this.values.set(k,v);}
 removeItem(k:string){this.removes++;this.values.delete(k);}
}
const fixture=(id:string,title:string)=>{
 const built=tripFromBuilder({id,origin:'Paris',journeyEnd:{mode:'same_as_start'},stops:[{id:'rome',name:'Rome',country:'Italy'}],startDate:'2026-10-20',endDate:'2026-10-27',nightAllocations:{rome:7},picks:{},mustDo:title,pace:'slow',hotels:'few',budget:'mid',draft:[],createdAt:now});
 return prepareTripDocumentForWrite({...projectBuilderCalendar(built,built).trip,title,ownerId:null,createdAt:now,updatedAt:now});
};
function rawRecord(id:string,title:string,writeId:string,targetBytes=136294){
 const key=old.tripRecoveryStorageKey(null,id,writeId);
 const trip={...fixture(id,title),syntheticRetainedText:''};
 const record={version:2,ownerId:null,tripId:id,trip,state:'pending',writeId,savedAt:now};
 const units=(targetBytes-bytes(key,JSON.stringify(record)))/2;
 assert(Number.isInteger(units)&&units>0);record.trip.syntheticRetainedText='x'.repeat(units);
 const raw=JSON.stringify(record);assert.equal(bytes(key,raw),targetBytes);requireReadableTripDocument(record.trip);
 return {key,raw,trip:record.trip};
}
const ls=new LegacyStorage();
for(let i=0;i<76;i++){const r=rawRecord('protected-'+i,'Independent old protected data','prior-'+i);ls.values.set(r.key,r.raw);}
const rawBefore=new Map(ls.values);
assert(old.loadTripRecoveryFromStorage(ls,'protected-0',null),'legacy positive control must decode the full fixture');
const target=rawRecord('new-overflow-trip','New exact protected candidate','overflow-write');
const quotaResult=old.saveTripRecoveryToStorage(ls,target.trip,{ownerId:null,writeId:'overflow-write',now});
assert(!quotaResult.stored&&quotaResult.nativeFailure==='quota');assert.deepEqual([...ls.values],[...rawBefore]);
// Prospective IDB record is structurally/canonically valid, but is not exposed through LS or a locator.
const overflowModel=new Map([[target.key,target.raw]]);
const oldRead=old.loadTripRecoveryFromStorage(ls,target.trip.id,null);
const rollbackRead=old.loadLocalTripFromStorage(ls,target.trip.id,null);
assert.equal(oldRead,null);assert.equal(rollbackRead,null);
const conflicting=fixture(target.trip.id,'Older sparse candidate that did not observe overflow');
const oldWrite=old.saveTripRecoveryToStorage(ls,conflicting,{ownerId:null,writeId:'legacy-conflicting-write',now:'2026-10-12T00:01:00.000Z'});
assert(oldWrite.stored&&!oldWrite.blockedByExistingRecovery);
assert(old.loadTripRecoveryFromStorage(ls,target.trip.id,null)?.trip.title===conflicting.title);
assert.equal(overflowModel.get(target.key),target.raw);
for(const [k,v]of rawBefore)assert.equal(ls.values.get(k),v);
assert.equal(ls.removes,0);
assert.equal(networkCalls,0);
globalThis.fetch=originalFetch;
const packet={pin,syntheticOnly:true,nativeIndexedDbDurabilityTested:false,legacyRawEntries:76,
 syntheticCapacityBytes:ls.limit,legacyRecoveryEstimatedBytes:76*136294,
 lsQuotaRefused:quotaResult.nativeFailure==='quota',all76RawBytesUnchanged:true,noCleanup:true,noLocatorWriteForOverflow:true,
 oldPinnedReaderRecoveredOnlyOverflow:false,rollbackReaderRecoveredOnlyOverflow:false,
 oldSharedWriterAcceptedConflictingCandidate:oldWrite.stored,oldSharedWriterSawProtectedConflict:oldWrite.blockedByExistingRecovery,
 overflowPhysicalBytesUnchanged:true,liveNetworkCalls:networkCalls,
 diagnostic:'Successful reproduction intentionally exits 2; this is not a completed-store qualification gate.',
 gate:'BLOCKED_IMMUTABLE_OLD_READER_AND_WRITER_DO_NOT_PARTICIPATE_IN_NEW_STORE',
 implication:'New code can preserve IDB bytes/detect later conflict, but cannot teach already deployed sync LS consumers to discover the sole copy or refuse this unobserved competing write.'};
const evidence=new URL('../../evidence/idb-recovery/',import.meta.url);mkdirSync(evidence,{recursive:true});
writeFileSync(new URL('compatibility-preflight.json',evidence),JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify(packet,null,2));
process.exitCode=2;

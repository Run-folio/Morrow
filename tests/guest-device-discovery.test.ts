import assert from "node:assert/strict";
import test from "node:test";
import * as discovery from "../lib/easyt/guest-device-discovery.ts";
import { createTwoStoreTripPersistence } from "../lib/easyt/two-store-trip-persistence.ts";
import { saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { homeRecoveryFixture } from "./helpers/home-recovery-fixture.ts";
import { MemoryRecoveryDriver } from "./helpers/durable-recovery-driver.ts";
const session={pending:false,ownerId:null};
function fixture(){
 const values=new Map<string,string>();
 const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
 const driver=new MemoryRecoveryDriver();
 for(const [id,ownerId] of [["guest-one",null],["guest-two",null],["private-a","owner-a"],["private-b","owner-b"]] as const){
  const trip={...homeRecoveryFixture(ownerId).trip,id,title:id,status:"planned" as const};
  assert.equal(saveTripRecoveryToStorage(storage,trip,{ownerId,writeId:"write-"+id}).stored,true);
 }
 const broker=createTwoStoreTripPersistence(storage,driver,{ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
 return {values,storage,driver,broker};
}
test("discovery lists separate guest copies with exact recovery routes and no writes or account exposure",async()=>{
 const f=fixture(),before=new Map(f.values),heads=new Map(f.driver.heads),generations=new Map(f.driver.generations);
 const state=await discovery.loadGuestDeviceTrips(session,()=>true,async()=>{const result=await f.broker.list();if(result.kind!=="ready")throw new Error(result.reason);return result.recoveries;});
 assert.equal(state.kind,"ready");if(state.kind!=="ready")return;
 assert.deepEqual(state.trips.map(t=>t.id).sort(),["guest-one","guest-two"]);
 assert.equal(state.trips[0].href.includes(encodeURIComponent(state.trips[0].id)),true);
 assert.match(state.trips[0].href,/recover=1/);
 assert.deepEqual(f.values,before);assert.deepEqual(f.driver.heads,heads);assert.deepEqual(f.driver.generations,generations);
});
test("pending or authenticated sessions never read guest data",async()=>{
 let calls=0;
 for(const scope of [{pending:true,ownerId:null},{pending:false,ownerId:"owner-a"}]){
  const result=await discovery.loadGuestDeviceTrips(scope,()=>true,async()=>{calls++;return [];});assert.equal(result.kind,"withheld");
 }assert.equal(calls,0);
});
test("owner transition during read discards its completion",async()=>{
 let current=true;const result=await discovery.loadGuestDeviceTrips(session,()=>current,async()=>{current=false;return [];});assert.equal(result.kind,"withheld");
});
test("protected and unavailable reads never become successful empty lists",async()=>{
 const result=await discovery.loadGuestDeviceTrips(session,()=>true,async()=>{throw new Error("Protected source");});assert.equal(result.kind,"unavailable");
});
test("a reader returning another owner is refused rather than partially exposed",async()=>{
 const trip=homeRecoveryFixture("other-owner").trip;
 const result=await discovery.loadGuestDeviceTrips(session,()=>true,async()=>[{version:2,ownerId:"other-owner",tripId:trip.id,trip,writeId:"foreign",savedAt:trip.updatedAt,state:"pending"}]);assert.equal(result.kind,"unavailable");
});

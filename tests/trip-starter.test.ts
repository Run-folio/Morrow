import assert from "node:assert/strict";
import test from "node:test";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";
import { saveTripRecoveryToStorage, loadTripRecoveryFromStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import { canonicalTripForOwner, duplicateTripDocument } from "../lib/easyt/trip-promotion.ts";
import { prepareTripDocumentForWrite } from "../lib/easyt/trip-document.ts";
import { markTripStarterBuild, tripStarterEligible, finishTripStarter, shortlistStay, removeShortlistedStay, shortlistedStays, stayShortlistDestinationKey } from "../lib/easyt/trip-starter.ts";
function trip(): EasyTTrip {
  const intent = defaultTripIntent({ stopIds: ["kyoto"], durationDays: 2 });
  return {
    schemaVersion: 1, id: "ideas-trip", ownerId: null, title: "Kyoto", status: "draft",
    startDate: "2026-10-01", endDate: "2026-10-02", travellers: 2, currency: "GBP",
    brief: { origin: "Tokyo", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: { ...intent, preferences: { ...intent.preferences, interests: ["food"] } } },
    stops: [{ id: "kyoto", order: 0, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 }], legs: [],
    planItems: [1, 2].map((dayNumber) => ({ id: `day-${dayNumber}`, stopId: "kyoto", dayNumber, date: `2026-10-0${dayNumber}`, type: "activity" as const, title: "Explore Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
    recommendations: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

test("starter requires a first build, settled mutation owner and creation arrival", () => {
 const legacy = {...trip(), status: "planned" as const};
 assert.equal(tripStarterEligible(legacy, "?created=1", true), false);
 assert.equal(markTripStarterBuild(legacy), legacy);
 const built = {...markTripStarterBuild(trip()),status:"planned" as const};
 assert.equal(tripStarterEligible(built, "?created=1", true), true);
 for (const query of ["", "?created=1&saved=1"]) assert.equal(tripStarterEligible(built, query, true), false);
 assert.equal(tripStarterEligible(built, "?created=1", false), false);
 const done = finishTripStarter(built);
 assert.equal(tripStarterEligible(JSON.parse(JSON.stringify(done)), "?created=1", true), false);
 assert.equal(markTripStarterBuild({...done,status:"draft"}).brief.tripStarter?.state,"dismissed");
 assert.equal(tripStarterEligible({...built,id:"clone"}, "?created=1", true),false);
});
test("shortlist preserves multiple options and bookings through write and reload", () => {
 const base = trip(); base.brief.bookings = [{id:"stay-kyoto",type:"stay",title:"Booked hotel",date:base.startDate,confirmation:null,url:null}];
 base.brief.mapPins = [];
 const place = {id:"osm-1", name:"First hotel", provider:"openstreetmap" as const,address:"Kyoto",category:"Hotel",coordinates:[135,35] as [number,number],mapsUrl:"https://www.openstreetmap.org/node/1", price:{total:5,currency:"GBP"},availability:"available" as const};
 const one=shortlistStay(base,"kyoto",place);
 assert.equal(shortlistStay(one,"kyoto",place),one);
 const two=shortlistStay(one,"kyoto",{...place,id:"osm-2",name:"Second hotel"});
 const reloaded=prepareTripDocumentForWrite(JSON.parse(JSON.stringify(two)));
 assert.equal(shortlistedStays(reloaded).length,2);
 assert.deepEqual(reloaded.brief.bookings,base.brief.bookings);
 assert.deepEqual(reloaded.brief.mapPins,[]);
 assert.equal(JSON.stringify(reloaded.brief.stayShortlist).includes('price'),false);
 assert.equal(shortlistStay(base,"removed",place),base);
 assert.equal(shortlistStay(base,"kyoto",{...place,provider:"google-places"}),base);
 assert.equal(shortlistedStays({...two,stops:[]}).length,0);
 assert.equal(shortlistedStays(removeShortlistedStay(two,"kyoto","osm-1")).length,1);
});

class MemoryStorage implements EasyTBrowserStorage {
 values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}
 getItem(key:string){return this.values.get(key)??null;} setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}
}
test("starter and shortlist survive device recovery, editing and owner promotion without reappearing",()=>{
 const base=finishTripStarter({...markTripStarterBuild(trip()),status:"planned"});
 base.brief.stayShortlist=[{stopId:"kyoto",destinationKey:stayShortlistDestinationKey(base.stops[0]!),placeId:"osm-1",provider:"openstreetmap",name:"First hotel"}];
 const storage=new MemoryStorage();const saved=saveTripRecoveryToStorage(storage,base,{writeId:"starter-save"});assert.equal(saved.stored,true);
 const reopened=loadTripRecoveryFromStorage(storage,base.id,null)!.trip;
 assert.deepEqual(reopened.brief.stayShortlist,base.brief.stayShortlist);
 const edited={...reopened,title:"Edited Kyoto"};
 const editedWrite=saveTripRecoveryToStorage(storage,edited,{writeId:"starter-edit",replace:saved.handle});assert.equal(editedWrite.stored,true);
 const promoted=canonicalTripForOwner("owner-a",loadTripRecoveryFromStorage(storage,base.id,null)!.trip);
 assert.equal(tripStarterEligible(promoted,"?created=1&saved=1",true),false);
 assert.equal(promoted.brief.tripStarter?.state,"dismissed");
 assert.equal(shortlistedStays(promoted)[0]?.stopId,promoted.stops[0]?.id);
 let counter=0;const clone=duplicateTripDocument(promoted,{id:"trip-clone",now:"2026-11-10T00:00:00Z",nextId:()=>String(++counter)});
 assert.equal(tripStarterEligible({...clone,status:"planned"},"?created=1",true),false);
 assert.equal(shortlistedStays(clone)[0]?.stopId,clone.stops[0]?.id);
});
test("repeated destinations retain separate shortlists and malformed data cannot enter the UI",()=>{
 const base=trip();base.stops.push({...base.stops[0]!,id:"kyoto-return",order:1});
 base.brief.stayShortlist=[{stopId:"kyoto",destinationKey:stayShortlistDestinationKey(base.stops[0]!),placeId:"same-hotel",provider:"openstreetmap",name:"First stay"},{stopId:"kyoto-return",destinationKey:stayShortlistDestinationKey(base.stops[1]!),placeId:"same-hotel",provider:"openstreetmap",name:"Return stay"}];
 assert.equal(shortlistedStays(removeShortlistedStay(base,"kyoto","same-hotel"))[0]?.stopId,"kyoto-return");
 assert.throws(()=>prepareTripDocumentForWrite({...base,brief:{...base.brief,stayShortlist:[null]}} as unknown as EasyTTrip));
});
test("replacing a stop location hides old hotel choices while date edits and Undo retain them",()=>{
 const base=trip(); const place={id:"osm-hotel",name:"Kyoto hotel",provider:"openstreetmap" as const,address:"Kyoto",category:"Hotel",coordinates:[135,35] as [number,number],mapsUrl:"https://www.openstreetmap.org"};
 const saved=shortlistStay(base,"kyoto",place);
 const moved={...saved,stops:saved.stops.map(stop=>({...stop,name:"Osaka",canonicalPlaceId:"osaka"}))};
 assert.equal(shortlistedStays(moved).length,0);
 assert.equal(shortlistStay(moved,"kyoto",place,stayShortlistDestinationKey(base.stops[0]!)),moved);
 assert.equal(shortlistedStays({...saved,stops:saved.stops.map(stop=>({...stop,arrivalDate:"2026-10-02"}))}).length,1);
 assert.equal(shortlistedStays({...moved,stops:base.stops}).length,1);
});

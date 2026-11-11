import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url);
const { transform } = require("esbuild");
const source = readFileSync(new URL("../components/easyt/trip-stay-workspace.tsx", import.meta.url), "utf8");
// Exercise the production Stay surface with deterministic React hooks and DOM timing.
const surface = source.slice(source.indexOf("function StayFinderSurface("), source.indexOf("export default function TripStayWorkspace("));
const names = ["trackEvent", "useTripShellMutation", "useMobileTripWorkspace", "useJourneyLocalPlacePhotos", "stayBookingForStop", "savedGoogleStayReferencesForStop", "getCurrentPartnerAction", "shortlistedStays", "recommendationDetailForStayResult", "stayIsSelected", "stayHandoffDetails", "mapResultForLocalPlace", "mapResultSelectionId", "mapWorkspaceHref", "mapResultHandoffForLocalPlace", "stayWorkspaceHref", "hasBookingLiveInformation", "stayCandidateFit", "stayWorkspaceContext", "MorroviaMapPreview", "JourneyPlannerMap", "MorroviaBriefNotice", "EasyTButton", "MorroviaStatusBanner", "JourneyRouteStopTrack", "TripStayShortlist", "EasyTSelect", "EasyTLinkButton", "EasyTField", "MorroviaSectionStatus", "MorroviaSkeleton", "JourneyLocalPlacePhotoMedia", "MorroviaContentDialog", "TripStayHandoff", "ItineraryItemDetail", "MapPin", "BedDouble", "CalendarDays", "Star", "Check", "Map", "X"];
const compiled = (await transform(`const {useState,useRef,useEffect,useMemo}=globalThis.hooks; const {${names.join(",")}}=globalThis.deps; const styles=new Proxy({}, {get:(_,key)=>key}); const workspaceHeading={sectionTitle:"title"}; const formattedPrice=()=>null; export default ${surface}`, {loader:"tsx",format:"cjs",jsx:"automatic"})).code;
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node,...nodes(node.props?.children)];
function app() {
  const cells=[],pending=[],frames=new Map(),listeners=[];let index=0,dirty=false,nextFrame=0,tree,compact=false;
  class Element { isConnected=true; focused=0; getAttribute(){return "Review Hotel A for Tokyo";} focus(){this.focused++;} }
  const origin=new Element(); const handoff={focused:0,scrolled:0,focus(){this.focused++;},scrollIntoView(){this.scrolled++;}};
  const trip={id:"trip",ownerId:"owner",planItems:[],brief:{}};
  const context={key:"trip:stop:2027-03-03:2027-03-06",stop:{id:"stop",name:"Tokyo"},nights:3,checkIn:null,checkOut:null,searchCoordinates:[1,2]};
  const place={id:"hotel-a",name:"Hotel A",address:"Tokyo",category:"Hotel",coordinates:[1,2]};
  const finder={candidates:[place],selectedPlace:null,status:"ready",selectPlace(){},clearSelection(){finder.selectedPlace=null;}};
  const props={finder,workingTrip:trip,context,navigationStops:[],notice:null,setNotice(){},setSelectedPlaceId(){},onSelectStop(){},requestedPlaceId:null};
  const hooks={
    useState(value){const n=index++;if(!cells[n])cells[n]={value};return [cells[n].value,next=>{const value=typeof next==="function"?next(cells[n].value):next;if(value!==cells[n].value){cells[n].value=value;dirty=true;}}];},
    useRef(value){const n=index++;return (cells[n]??={current:value});},
    useMemo(fn){index++;return fn();},
    useEffect(fn,deps){const n=index++;const old=cells[n];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){pending.push(()=>{old?.cleanup?.();cells[n]={deps,cleanup:fn()};});}},
  };
  const deps=Object.fromEntries(names.map(name=>[name,name]));
  Object.assign(deps,{useTripShellMutation:()=>({saveState:"saved",isPending:()=>false}),useMobileTripWorkspace:()=>false,useJourneyLocalPlacePhotos:()=>({}),stayBookingForStop:()=>null,savedGoogleStayReferencesForStop:()=>[],getCurrentPartnerAction:()=>null,shortlistedStays:()=>[],recommendationDetailForStayResult:({place})=>({id:place.id,bookingStatus:"Not booked"}),stayIsSelected:()=>false,stayHandoffDetails:()=>"Hotel A",mapResultForLocalPlace:p=>({sourceId:p.id}),mapResultSelectionId:(kind,id,stop)=>`${kind}:${stop}:${id}`,mapWorkspaceHref:()=>"/map",mapResultHandoffForLocalPlace:()=>null,stayWorkspaceHref:()=>"/stay",hasBookingLiveInformation:()=>false,stayCandidateFit:()=>"Mapped stay"});
  const window={location:{href:"https://morrovia.test/journey/trip/stay?stop=stop"},matchMedia:()=>({get matches(){return compact;},addEventListener:(_,fn)=>listeners.push(fn),removeEventListener(){}}),requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),history:{state:null,replaceState(_,__,url){window.location.href=String(url);}}};
  const sandbox={module:{exports:{}},exports:{},require,hooks,deps,window,URL,Intl,HTMLElement:Element,document:{activeElement:origin,body:{},getElementById:()=>handoff,querySelectorAll:()=>[origin]}};
  sandbox.exports=sandbox.module.exports;vm.runInNewContext(compiled,sandbox);
  const render=()=>{let turns=0;do{dirty=false;index=0;tree=sandbox.module.exports.default(props);while(pending.length)pending.shift()();if(++turns>10)throw Error("render loop");}while(dirty);return nodes(tree);};
  render();
  return {trip,context,place,finder,origin,handoff,window,render,review:()=>render().find(n=>n.type==="TripStayShortlist").props.onReview(place),select:()=>{finder.selectedPlace=place;render();},flush:()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());render();},resize:value=>{compact=value;listeners.forEach(fn=>fn());render();},close:()=>render().find(n=>n.type==="MorroviaContentDialog").props.onClose()};
}

test("desktop Review stay waits for the selected handoff, focuses once, and returns to its trigger",()=>{
  const a=app();a.review();a.render();a.flush();assert.equal(a.handoff.focused,0);
  a.select();a.flush();assert.equal(a.handoff.focused,1);assert.equal(a.handoff.scrolled,1);
  a.resize(true);a.flush();a.resize(false);a.flush();a.trip.title="Edited";a.render();a.flush();assert.equal(a.handoff.focused,1);
  a.close();a.flush();assert.equal(a.origin.focused,1);
  a.review();a.select();a.flush();assert.equal(a.handoff.focused,2,"an explicit repeat review gets a new focus intent");
});

for(const change of ["owner","trip","stop","location"]){
 test(`Review stay discards focus after ${change} changes`,()=>{
   const a=app();a.review();a.select();
   if(change==="owner")a.trip.ownerId="other-owner";
   if(change==="trip")a.trip.id="other-trip";
   if(change==="stop"){a.context.stop={id:"other-stop",name:"Kyoto"};a.context.key="other-key";}
   if(change==="location")a.window.location.href="https://morrovia.test/journey/trip/map";
   a.render();a.flush();assert.equal(a.handoff.focused,0);assert.equal(a.handoff.scrolled,0);
 });
}

test("an alternate property selection cancels the pending Review intent",()=>{
  const a=app();a.review();a.select();
  const other={...a.place,id:"hotel-b",name:"Hotel B"};a.finder.candidates.push(other);
  a.render().find(n=>n.props?.["aria-label"]==="Open details for Hotel B").props.onClick();
  a.finder.selectedPlace=other;a.render();a.flush();
  a.finder.selectedPlace=a.place;a.render();a.flush();
  assert.equal(a.handoff.focused,0);
});

test("a location change cancels an already queued focus frame without a rerender",()=>{
  const a=app();a.review();a.select();
  a.window.location.href="https://morrovia.test/journey/trip/map";a.flush();
  assert.equal(a.handoff.focused,0);assert.equal(a.handoff.scrolled,0);
});

test("existing exact-stop hash handoff still focuses once and consumes only its hash",()=>{
  const a=app();a.window.location.href="https://morrovia.test/journey/trip/stay?stop=stop&result=stay%3Astop%3Ahotel-a#stay-handoff";
  a.select();a.flush();assert.equal(a.handoff.focused,1);
  const url=new URL(a.window.location.href);assert.equal(url.hash,"");assert.equal(url.searchParams.get("result"),"stay:stop:hotel-a");
  a.resize(true);a.flush();assert.equal(a.handoff.focused,1);
});

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { tourTripFixture } from "./storybook/tour-trip.fixture";
import TripShell from "./trip-shell";
import TripOverviewWorkspace from "./trip-overview-workspace";
import { TripStarterContent, type TripStarterContentProps } from "./trip-starter";
import { stayShortlistDestinationKey } from "@/lib/easyt/trip-starter";
import TripStayShortlist from "./trip-stay-shortlist";
import { useTripShellMutation } from "./trip-shell-client";
import { MorroviaContentDialog } from "./morrovia-feedback";
import feedback from "./morrovia-feedback.module.css";
import styles from "./trip-starter.module.css";

const fixture={...tourTripFixture,status:"planned" as const,brief:{...tourTripFixture.brief,tripStarter:{version:1 as const,tripId:tourTripFixture.id,state:"pending" as const}}};
const stays: TripStarterContentProps["initialStayState"]={corePlaces:[{id:"osm-fixture-hotel",name:"Example hotel",address:"Cusco, Peru",provider:"openstreetmap",category:"Hotel",coordinates:[-71.978,-13.516],mapsUrl:"https://www.openstreetmap.org",availability:"check"}],accommodationInventoryStatus:"unconfigured"};
const activities: TripStarterContentProps["initialActivities"]=[{provider:"viator",source:"viator",providerProductId:"storybook-walk",title:"Example walking tour",destination:{canonicalPlaceId:"cusco",label:"Cusco"},duration:{fixedMinutes:120},provenance:{kind:"live_provider_search",provider:"viator",checkedAt:"2026-11-10T00:00:00Z"}}];
function Content(props: Omit<TripStarterContentProps,"trip"|"onClose">) {
 const {trip}=useTripShellMutation();const [open,setOpen]=useState(true);
 return <><TripOverviewWorkspace trip={trip}/><MorroviaContentDialog open={open} ariaLabel="Trip starter" autoFocusSelector="button" className={`${feedback.dialog} ${styles.dialog}`} onClose={()=>setOpen(false)}><TripStarterContent {...props} trip={trip} onClose={()=>setOpen(false)}/></MorroviaContentDialog></>;
}
function Preview(props: Omit<TripStarterContentProps,"trip"|"onClose">) {return <TripShell trip={fixture} cacheTrip={false}><Content {...props}/></TripShell>;}
const meta={title:"Morrovia/Workspaces/Trip starter",component:Preview,parameters:{layout:"fullscreen",nextjs:{appDirectory:true,navigation:{pathname:`/journey/${fixture.id}`,segments:[]}}}} satisfies Meta<typeof Preview>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Ready:Story={args:{initialStayState:stays,initialActivities:activities}};
export const Mobile:Story={...Ready,globals:{viewport:{value:"mobile1",isRotated:false}}};
export const Empty:Story={args:{initialStayState:{corePlaces:[],accommodationInventoryStatus:"empty"},initialActivities:[]}};
export const LoadingStays:Story={args:{initialStayState:{corePlaces:[],coreLoading:true,accommodationInventoryStatus:"loading"},initialActivities:activities}};
export const UnavailableStays:Story={args:{initialStayState:{corePlaces:[],coreUnavailable:true,accommodationInventoryStatus:"unavailable"},initialActivities:[]}};
export const Shortlist:Story={render:()=> <TripShell trip={{...fixture,brief:{...fixture.brief,stayShortlist:[{stopId:fixture.stops[0]!.id,destinationKey:stayShortlistDestinationKey(fixture.stops[0]!),placeId:"osm-fixture-hotel",provider:"openstreetmap",name:"Example hotel"},{stopId:fixture.stops[1]!.id,destinationKey:stayShortlistDestinationKey(fixture.stops[1]!),placeId:"osm-fixture-two",provider:"openstreetmap",name:"Example guesthouse"}]}}} cacheTrip={false}><ShortlistContent/></TripShell>};
function ShortlistContent(){const {trip}=useTripShellMutation();return <TripStayShortlist trip={trip}/>;}

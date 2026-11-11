"use client";

import { ArrowRight, BedDouble, MapPin, Tickets, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { finishTripStarter, shortlistedStays, tripStarterEligible, stayShortlistDestinationKey } from "@/lib/easyt/trip-starter";
import { saveItineraryIdea, scheduleItineraryIdea } from "@/lib/easyt/itinerary-ideas";
import { isGooglePlaceReferenceIdea, type EasyTTrip, type ItineraryIdea, type TripStop } from "@/lib/easyt/trip";
import type { JourneyLocalFinderInitialState } from "@/lib/easyt/local-place";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import { stayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { itineraryWorkspaceHref, stayWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl } from "./easyt-controls";
import { MorroviaContentDialog } from "./morrovia-feedback";
import feedback from "./morrovia-feedback.module.css";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import LiveActivityInventory from "./live-activity-inventory";
import TripStarterStays from "./trip-starter-stays";
import { useTripShellMutation } from "./trip-shell-client";
import { useWorkspaceOrientationBlocker } from "./workspace-orientation";
import styles from "./trip-starter.module.css";

export type TripStarterContentProps = {
 trip: EasyTTrip;
 onClose: () => void;
 initialStayState?: JourneyLocalFinderInitialState;
 initialActivities?: ActivityInventoryItem[];
};

function locationLabel(trip: EasyTTrip, stop: TripStop) {
 const dates=stayWorkspaceContext(trip,stop.id)?.dateLabel ?? formatIsoDate(stop.arrivalDate,"en",{month:"short",day:"numeric"}) ?? "Dates to confirm";
 return `${stop.name} · ${dates} · ${stop.nights ?? 0} nights`;
}

/** Page-specific composition of existing shared controls and recommendation lanes. */
export function TripStarterContent({trip,onClose,initialStayState,initialActivities}:TripStarterContentProps) {
 const mutation=useTripShellMutation();
 const stops=[...trip.stops].sort((a,b)=>a.order-b.order);
 const [stopId,setStopId]=useState((stops.find(stop=>(stop.nights ?? 0)>0) ?? stops[0])?.id ?? "");
 const stop=stops.find(item=>item.id===stopId) ?? stops[0];
 const [lane,setLane]=useState<"stays"|"activities">("stays");
 const [idea,setIdea]=useState<ItineraryIdea|null>(null);
 const [dayId,setDayId]=useState("");
 const scheduleScope=useRef(0);
 const days=trip.planItems.filter(day=>day.stopId===stop?.id);
 const saving=mutation.hasPendingSaves();
 const destinationKey=stop ? stayShortlistDestinationKey(stop) : "";
 const stopIsCurrent=(current:EasyTTrip)=>current.stops.some(item=>item.id===stop?.id && stayShortlistDestinationKey(item)===destinationKey);
 const savedStays=shortlistedStays(trip);
 const savedCount=savedStays.length;
 const shortlistStop=stops.find(item=>item.id===stop?.id && savedStays.some(entry=>entry.stopId===item.id))
   ?? stops.find(item=>savedStays.some(entry=>entry.stopId===item.id));
 const activityCount=(trip.brief.itineraryIdeas??[]).filter(item=>item.category!=="stay").length;
 const saveIdea=async (value:ItineraryIdea) => {
   if(isGooglePlaceReferenceIdea(value)) return false;
   return mutation.mutateTrip(current=>stopIsCurrent(current) ? saveItineraryIdea(current,value) : current,`starter-save-${value.id}`);
 };
 const schedule=async () => {
   if(!idea || isGooglePlaceReferenceIdea(idea) || !dayId) return;
   const scope=scheduleScope.current;
   const accepted=await mutation.mutateTrip(current=>stopIsCurrent(current) ? scheduleItineraryIdea(current,idea,dayId) : current,`starter-schedule-${idea.id}`);
   if(accepted && scheduleScope.current === scope) {setIdea(null);setDayId("");}
 };
 return <div className={styles.content}>
   <header className={styles.header}><h2>Your trip is ready.</h2><EasyTButton iconOnly icon={X} variant="quiet" onClick={onClose}>Close trip starter</EasyTButton></header>
   {stop ? <div className={styles.location}><MapPin aria-hidden="true" /><EasyTSelect label="Location" labelClassName={styles.locationLabel} className={styles.locationSelect} value={stop.id} onChange={event=>{scheduleScope.current+=1;setStopId(event.target.value);setIdea(null);setDayId("");}}>{stops.map(item=><option key={item.id} value={item.id}>{locationLabel(trip,item)}</option>)}</EasyTSelect></div> : null}
   <div className={styles.mobileChoices} data-lane={lane}><span className={styles.choiceIcons} aria-hidden="true"><span><BedDouble /></span><span><Tickets /></span></span><EasyTSegmentedControl ariaLabel="Trip starter options" value={lane} onChange={setLane} options={[{value:"stays",label:"Shortlist stays"},{value:"activities",label:"Things to do"}]} /></div>
   {stop ? <div className={styles.columns}>
     <section className={styles.lane} data-mobile-hidden={lane!=="stays"} aria-label="Shortlist stays">
       <div className={styles.laneHeading}><h3>Shortlist stays</h3><EasyTLinkButton className={styles.desktopMore} variant="quiet" size="small" onClick={onClose} href={stayWorkspaceHref(trip.id,stop.id)}>View more stays <ArrowRight aria-hidden="true" /></EasyTLinkButton></div>
       <TripStarterStays key={JSON.stringify([stop.id,destinationKey])} trip={trip} stop={stop} initialState={initialStayState}/>
       <EasyTLinkButton className={styles.mobileMore} variant="quiet" size="small" onClick={onClose} href={stayWorkspaceHref(trip.id,stop.id)}>View more stays <ArrowRight aria-hidden="true" /></EasyTLinkButton>
     </section>
     <section className={styles.lane} data-mobile-hidden={lane!=="activities"} aria-label="Things to do">
       <div className={styles.laneHeading}><h3>Add things to do</h3><EasyTLinkButton className={styles.desktopMore} variant="quiet" size="small" onClick={onClose} href={itineraryWorkspaceHref(trip.id)}>View more activities <ArrowRight aria-hidden="true" /></EasyTLinkButton></div>
       {idea ? <section className={styles.schedule} aria-label={`Choose a day for ${isGooglePlaceReferenceIdea(idea) ? "activity" : idea.title}`}>
         <strong>{isGooglePlaceReferenceIdea(idea) ? "Activity" : idea.title}</strong>
         <EasyTSelect label="Day" value={dayId} onChange={event=>{scheduleScope.current+=1;setDayId(event.target.value);}}><option value="">Choose a day</option>{days.map(day=><option key={day.id} value={day.id}>Day {day.dayNumber} · {day.date}</option>)}</EasyTSelect>
         <div><EasyTButton size="small" disabled={!dayId || saving || !mutation.mutationReady} onClick={()=>{void schedule();}}>Add to day</EasyTButton><EasyTButton size="small" variant="quiet" onClick={()=>{scheduleScope.current+=1;setIdea(null);}}>Cancel</EasyTButton></div>
       </section> : null}
       <div className={styles.recommendations}>{days[0] ? <LiveActivityInventory key={JSON.stringify([stop.id,destinationKey])} trip={trip} stop={stop} day={days[0]} scheduleLabel="Choose day" placement="trip_starter" workspace="itinerary" initialItems={initialActivities} emptyLabel="No experiences found" onSave={saveIdea} onSchedule={value=>{scheduleScope.current+=1;setIdea(value);setDayId("");return false;}} isPending={()=>saving || !mutation.mutationReady}/> : <MorroviaSectionStatus title="No days available for this stop" />}</div>
       <EasyTLinkButton className={styles.mobileMore} variant="quiet" size="small" onClick={onClose} href={itineraryWorkspaceHref(trip.id)}>Saved ideas in Itinerary <ArrowRight aria-hidden="true" /></EasyTLinkButton>
     </section>
   </div> : <MorroviaSectionStatus title="No stops to explore" />}
   {mutation.error ? <p role="alert">{mutation.error}</p> : null}
   <footer className={styles.footer}>
     <div className={styles.footerSummary}><span aria-live="polite">{savedCount} {savedCount===1 ? "stay" : "stays"} shortlisted · {activityCount} {activityCount===1 ? "idea" : "ideas"} saved</span><EasyTLinkButton variant="quiet" size="small" onClick={onClose} href={`${stayWorkspaceHref(trip.id,shortlistStop?.id)}#stay-shortlist`}>View shortlist <ArrowRight aria-hidden="true" /></EasyTLinkButton></div>
     <div className={styles.footerActions}><EasyTButton variant="quiet" onClick={onClose}>Skip for now</EasyTButton><EasyTButton onClick={onClose}>Continue to Overview <ArrowRight aria-hidden="true" /></EasyTButton></div>
   </footer>
 </div>;
}

export default function TripStarter() {
 const mutation=useTripShellMutation();
 const trip=mutation.trip;
 const [search,setSearch]=useState<string|null>(null);
 const [closed,setClosed]=useState(false);
 useEffect(()=>setSearch(window.location.search),[]);
 const eligible=tripStarterEligible(trip,search ?? "",mutation.mutationReady && !mutation.hasPendingSaves() && (!trip.ownerId || mutation.isAccountCopySettled()));
 const [opened,setOpened]=useState(false);
 useEffect(()=>{if(eligible)setOpened(true);},[eligible]);
 const open=opened && !closed;
 // Block auto-orientation during recovery settlement too, before eligibility opens.
 useWorkspaceOrientationBlocker(!closed && trip.brief.tripStarter?.state === "pending" && (search === null || (new URLSearchParams(search).has("created") && !new URLSearchParams(search).has("saved"))));
 const close=()=>{
   setClosed(true);
   const url=new URL(window.location.href);url.searchParams.delete("created");
   window.history.replaceState(window.history.state,"",url);
   if(mutation.mutationReady) void mutation.mutateTrip(finishTripStarter,"starter-dismiss");
 };
 if(!opened) return null;
 return <MorroviaContentDialog open={open} ariaLabel="Trip starter" autoFocusSelector="button" className={`${feedback.dialog} ${styles.dialog}`} onClose={close} onReturnFocus={()=>{
   const heading=document.getElementById("trip-shell-title");
   heading?.setAttribute("tabindex","-1");heading?.focus({preventScroll:true});
 }}>
   {open ? <TripStarterContent trip={trip} onClose={close}/> : null}
 </MorroviaContentDialog>;
}

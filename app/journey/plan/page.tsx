"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { authClient } from "@/lib/auth-client";
import { loadActiveTrip, loadRememberedOwner, loadTripRecovery } from "@/lib/easyt/storage";
import { legacyPlannerDestination, legacyPlannerTripId } from "@/lib/easyt/trip-continuity";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";

/** Static, offline-precacheable bridge for historic URLs. Never renders the previous planner. */
export default function RetiredPlannerEntry() {
  const router=useRouter();
  const {data:session,isPending,error}=authClient.useSession();
  const ownerId=session?.user?.id??null;
  const [unavailable,setUnavailable]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(isPending)return;
    let current=true;
    const forward=async()=>{
      const query=new URLSearchParams(window.location.search);
      let activeDraft=false;
      const offline=!navigator.onLine;
      if(error&&!offline){
        if(current)setUnavailable(true);
        return;
      }
      const activeOwner=ownerId??(offline?await loadRememberedOwner():null);
      if(!current)return;
      if(!query.has("trip")){
        const active=await loadActiveTrip(activeOwner);
        if(!current)return;
        if(active){query.set("trip",active.id);activeDraft=active.status==="draft";}
      }
      const id=legacyPlannerTripId(query);
      const recovery=id&&(offline||query.get("recover")==="1") ? await loadTripRecovery(id,activeOwner) : null;
      if(!current)return;
      // The current Overview requires a network document; the Builder is precached.
      const destination=legacyPlannerDestination(query,Boolean(recovery&&activeOwner)||recovery?.trip.status==="draft"||activeDraft||offline);
      if(offline)window.location.replace(destination);
      else router.replace(destination);
    };
    void forward().catch(()=>{if(current)setUnavailable(true);});
    return ()=>{current=false;};
  },[attempt,error,isPending,ownerId,router]);
  if(unavailable)return <main className="morrovia-editorial-page"><h1>Couldn’t check the trip on this device</h1>
    <p>Your saved copies have not changed.</p>
    <EasyTButton onClick={()=>{setUnavailable(false);setAttempt(value=>value+1);}}>Try again</EasyTButton>{" "}<EasyTLinkButton href="/journey/dashboard">My trips</EasyTLinkButton></main>;
  return <MorroviaSectionStatus title="Opening your trip" detail="Taking you to the current trip planner." />;
}

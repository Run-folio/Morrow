"use client";

import {Archive,Copy,Gift,RotateCcw,Trash2} from "lucide-react";
import {useEffect,useRef,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {authClient} from "@/lib/auth-client";
import {easytCopy,languageFromStorage,type EasyTLanguage} from "@/lib/easyt/i18n";
import {observeRememberedOwner} from "@/lib/easyt/storage";
import {ownerBoundaryState} from "@/lib/easyt/private-browser-context";
import {journeyReauthenticationPath} from "@/lib/easyt/trip-continuity";
import {EasyTButton,EasyTLinkButton} from "./easyt-controls";
import {MorroviaBriefNotice,MorroviaStatusBanner} from "./morrovia-feedback";
import {WorkspaceOrientationLauncher} from "./workspace-orientation";
import {TripLibraryActionDialogs} from "./trip-library-action-dialogs";
import {useTripLibraryActions} from "./use-trip-library-actions";
import type {TripMutationPersistence} from "./use-trip-mutation-persistence";

export function TripOverviewLibraryActions({mutation,onRenameTrip}:{mutation:TripMutationPersistence;onRenameTrip:()=>void}) {
  const trip=mutation.trip,ownerId=trip.ownerId??"",router=useRouter(),pathname=usePathname();
  const {data:session,isPending:sessionPending}=authClient.useSession();
  const authenticatedOwnerRef=useRef<string|null>(trip.ownerId);
  if(session?.user?.id)authenticatedOwnerRef.current=session.user.id;
  const [rememberedOwnerId,setRememberedOwnerId]=useState<string|null>(null);
  const [language,setLanguage]=useState<EasyTLanguage>("en");
  useEffect(()=>{const observer=observeRememberedOwner(setRememberedOwnerId);return()=>observer.dispose();},[]);
  useEffect(()=>{
    setLanguage(languageFromStorage());
    const update=(event:Event)=>setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change",update);return()=>window.removeEventListener("easyt-language-change",update);
  },[]);
  const boundary=ownerId?ownerBoundaryState({renderedOwnerId:ownerId,sessionOwnerId:session?.user?.id,sessionPending,rememberedOwnerId,previouslyAuthenticatedOwnerId:authenticatedOwnerRef.current}):"signed-out";
  const ownerScope=JSON.stringify([ownerId,trip.id,session?.user?.id??null,sessionPending,boundary]);
  const currentMutationRef=useRef(mutation);currentMutationRef.current=mutation;
  const beforeAction=()=>{
    const current=currentMutationRef.current;
    return current.trip.id===trip.id&&current.trip.ownerId===ownerId&&current.isAccountCopySettled();
  };
  const actions=useTripLibraryActions({ownerId,ownerScope,boundary,language,beforeAction,refresh:()=>router.refresh(),onDelete:()=>router.replace("/journey/dashboard")});
  const copy=easytCopy[language].dashboard;
  const disabled=boundary!=="current"||Boolean(actions.working)||!mutation.isAccountCopySettled();
  const hint=boundary!=="current"?"Sign in to this trip’s account to manage it.":disabled?"Finish saving or review the separate device copy first.":undefined;
  const act=(close:()=>void,callback:()=>void)=>{if(disabled)return;close();callback();};
  return <>
    <WorkspaceOrientationLauncher onRenameTrip={onRenameTrip} renderTripActions={ownerId?(close)=><>
      <EasyTButton role="menuitem" icon={Gift} size="small" variant="quiet" disabled={disabled} title={hint} onClick={()=>act(close,()=>actions.openGift(trip))}>{language==="es"?"Regalar este viaje":"Gift this trip"}</EasyTButton>
      <EasyTButton role="menuitem" icon={Copy} size="small" variant="quiet" disabled={disabled} title={hint} onClick={()=>act(close,()=>{void actions.runAction(trip.id,"duplicate");})}>{copy.duplicate}</EasyTButton>
      <EasyTButton role="menuitem" icon={trip.status==="archived"?RotateCcw:Archive} size="small" variant="quiet" disabled={disabled} title={hint} onClick={()=>act(close,()=>{void actions.runAction(trip.id,trip.status==="archived"?"restore":"archive");})}>{trip.status==="archived"?copy.restore:copy.archive}</EasyTButton>
      <hr role="separator" />
      <EasyTButton role="menuitem" icon={Trash2} size="small" variant="danger" disabled={disabled} title={hint} onClick={()=>act(close,()=>actions.requestDelete(trip))}>{copy.delete}</EasyTButton>
    </>:undefined} />
    {actions.actionNotice?<MorroviaBriefNotice title={actions.actionNotice.title} detail={actions.actionNotice.detail} autoDismissMs={6500} onDismiss={()=>actions.setActionNotice(null)}/>:null}
    {actions.actionError?<MorroviaStatusBanner tone="danger" title={actions.actionError} actions={actions.actionError.includes("session")?<EasyTLinkButton size="small" href={journeyReauthenticationPath(pathname)}>Sign in again</EasyTLinkButton>:actions.failedAction?<EasyTButton size="small" variant="secondary" onClick={()=>{if(actions.failedAction)void actions.runAction(actions.failedAction.id,actions.failedAction.action);}}>Try again</EasyTButton>:undefined}/>:null}
    <TripLibraryActionDialogs actions={actions} language={language}/>
  </>;
}

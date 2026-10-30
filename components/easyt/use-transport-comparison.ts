"use client";
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {authClient} from '@/lib/auth-client';
import type {EasyTTrip} from '@/lib/easyt/trip';
import {transportComparisonBasis,type TransportComparison} from '@/lib/easyt/transport-comparison';
import {requestTransportComparison} from '@/lib/easyt/transport-comparison-client';

type State={scope:string;status:'idle'|'checking'|'ready'|'error';comparison?:TransportComparison;error?:'timeout'|'unavailable'};
/** Request-local lifecycle only; no effect triggers work and no response writes a trip. */
export function useTransportComparison(trip:EasyTTrip,legId:string) {
  const {data:session,isPending}=authClient.useSession();const pathname=usePathname();
  // Sign-in alone never claims a guest document; its existing device-edit path remains available.
  const allowed=!isPending&&(trip.ownerId===null||(session?.user?.id??null)===trip.ownerId);
  const scope=JSON.stringify([transportComparisonBasis(trip,legId),pathname,session?.user?.id??null,isPending]);
  const current=useRef({scope,alive:true,attempt:0,controller:null as AbortController|null});
  if(current.current.scope!==scope){current.current.controller?.abort();current.current={scope,alive:true,attempt:current.current.attempt+1,controller:null};}
  const [state,setState]=useState<State>({scope,status:'idle'});
  useEffect(()=>{current.current.alive=true;return()=>{current.current.alive=false;current.current.attempt++;current.current.controller?.abort();current.current.controller=null;};},[]);
  const cancel=()=>{const owner=current.current;owner.attempt++;owner.controller?.abort();owner.controller=null;if(owner.alive)setState({scope:owner.scope,status:'idle'});};
  const refresh=async()=>{
    const owner=current.current;if(!allowed||!owner.alive||owner.scope!==scope||owner.controller)return;
    const controller=new AbortController(),attempt=++owner.attempt;owner.controller=controller;
    const active=()=>current.current===owner&&owner.alive&&owner.attempt===attempt&&!controller.signal.aborted;
    setState({scope,status:'checking'});
    try{const comparison=await requestTransportComparison(trip,legId,controller.signal);if(active())setState({scope,status:'ready',comparison});}
    catch(error){if(active())setState({scope,status:'error',error:error instanceof Error&&error.name==='TimeoutError'?'timeout':'unavailable'});}
    finally{if(current.current===owner&&owner.attempt===attempt)owner.controller=null;}
  };
  const renderedAttempt=current.current.attempt;
  const isCurrent=(comparison:TransportComparison)=>allowed&&current.current.alive&&current.current.scope===scope
    &&current.current.attempt===renderedAttempt&&state.scope===scope&&state.comparison===comparison;
  return {state:state.scope===scope?state:{scope,status:'idle' as const},allowed,refresh,cancel,isCurrent};
}

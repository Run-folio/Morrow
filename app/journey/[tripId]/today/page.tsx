"use client";
import { useRouter, useSearchParams } from 'next/navigation';
import { TripWorkspaceCommit, useTripShellTrip } from '@/components/easyt/trip-shell-client';
import TripTodayWorkspace from '@/components/easyt/trip-today-workspace';
export default function TripTodayPage(){
 const trip=useTripShellTrip(),query=useSearchParams(),router=useRouter();
 const requested=query.get('day');const day=requested?trip.planItems.find(d=>String(d.dayNumber)===requested):null;
 return <TripWorkspaceCommit view="today"><TripTodayWorkspace trip={trip} previewDayId={requested?(day?.id??'invalid'):null} onPreviewDay={id=>{const chosen=trip.planItems.find(d=>d.id===id);router.replace(`/journey/${encodeURIComponent(trip.id)}/today${chosen?`?day=${chosen.dayNumber}`:''}`,{scroll:false});}} /></TripWorkspaceCommit>;
}

"use client";
import {EasyTButton} from '@/components/easyt/easyt-controls';
import {MorroviaContentDialog} from '@/components/easyt/morrovia-feedback';
import type {CanonicalEasyTTrip} from '@/lib/easyt/trip';
import type {BuilderOptimizationProposal} from '@/lib/easyt/trip-builder-route-proposal';
import type {RouteOrderAssessment} from '@/lib/easyt/planner';
import styles from './trip-builder.module.css';

export function TripBuilderRouteProposal({current,proposal,assessment,language,stale=false,error,onKeep,onAccept}:{
 current:CanonicalEasyTTrip;proposal:BuilderOptimizationProposal|null;assessment?:RouteOrderAssessment;language:'en'|'es';stale?:boolean;error?:string;onKeep:()=>void;onAccept:()=>void;
}){
 const es=language==='es';const route=proposal?.projectedTrip;
 const stops=(trip:CanonicalEasyTTrip)=><ol>{trip.stops.map(stop=><li key={stop.id}>{stop.name}{current.stops.filter(s=>s.name===stop.name).length>1?` (${es?'parada actual':'current stop'} ${current.stops.findIndex(s=>s.id===stop.id)+1})`:''} · {stop.nights} {es?'noches':'nights'}</li>)}</ol>;
 const minutes=(n:number)=>`${Math.floor(n/60)}h ${Math.round(n%60)}m`;
 return <MorroviaContentDialog open={Boolean(proposal)} ariaLabel={es?'Revisar orden de ruta':'Review route order'} autoFocusSelector="[data-keep-route]" onClose={onKeep}>
  <h2>{es?'Revisar orden de ruta':'Review route order'}</h2>
  <p>{es?'Salida desde':'Starting from'}: {current.brief.intent.route.origin?.name??(es?'Sin confirmar':'Unconfirmed')}{current.brief.intent.route.journeyEnd.mode==='same_as_start'?` · ${es?'Volver al inicio':'Return to start'}`:current.brief.intent.route.journeyEnd.mode==='explicit'?` · ${es?'Final guardado':'Saved finish'}: ${current.brief.intent.route.journeyEnd.place.name}`:''}</p>
  <h3><strong>{es?'Orden actual':'Current order'}</strong></h3>{stops(current)}
  {route?<><h3><strong>{es?'Orden propuesto':'Proposed order'}</strong></h3>{stops(route)}</>:null}
  {assessment?.currentTransferMinutes!==null&&assessment?.currentTransferMinutes!==undefined&&assessment.recommendedTransferMinutes!==null?<p>{es?'Tiempo de viaje estimado':'Estimated travel time'}: {minutes(assessment.currentTransferMinutes)} → {minutes(assessment.recommendedTransferMinutes)}</p>:null}
  {stale?<p role="alert">{es?'El viaje ha cambiado. Mantén este orden y vuelve a actualizar la ruta.':'The trip changed. Keep this order and run Update route again.'}</p>:error?<p role="alert">{error}</p>:null}
  <div className={styles.routeStatusActions}><EasyTButton data-keep-route variant="secondary" onClick={onKeep}>{es?'Mantener orden actual':'Keep current order'}</EasyTButton><EasyTButton disabled={stale} onClick={onAccept}>{es?'Aplicar orden':'Apply order'}</EasyTButton></div>
 </MorroviaContentDialog>;
}

import type {EasyTTrip,TripLeg} from './trip.ts';
import type {PlanningEvidenceState,TransferAssessment} from './planning-evidence-state.ts';
import {guardTripRoutingGeometry} from './geographic-binding.ts';
import {effectiveTripLeg} from './transport-mode-choice.ts';

/** Builder completion describes owned detail work, never service availability. */
export function builderDetailsStatus(trip:EasyTTrip,language:'en'|'es',assessments:readonly TransferAssessment[]=[]) {
  const units=trip.brief.cascadeStatus?.routeReconciliation?.residual??[];
  if(units.some(unit=>unit.phase==='conflict'))return {state:'device' as const,label:language==='es'?'Revisión necesaria':'Review needed'};
  if(assessments.some(({state})=>(state.retrieval==='unavailable'||state.retrieval==='blocked')&&!state.retryable))
    return {state:'error' as const,label:language==='es'?'Revisión necesaria':'Review needed'};
  if(units.some(unit=>unit.phase==='failed')||assessments.some(({state})=>state.retrieval==='unavailable'||state.retrieval==='blocked'))
    return {state:'error' as const,label:language==='es'?'Datos sin actualizar':'Details need retry'};
  // This session deliberately defers recommendation work; pending metadata is
  // retained, but does not represent an active route-detail operation.
  if(units.some(unit=>unit.phase==='pending'&&unit.kind!=='recommendation')||assessments.some(({state})=>state.retrieval==='checking'))
    return {state:'saving' as const,label:language==='es'?'Actualizando datos…':'Updating details…'};
  return {state:'saved' as const,label:language==='es'?'Datos actualizados':'Details up to date'};
}

/** A usable planning duration is not a verified service or booking. */
export function builderHasUsablePlanningTransfer(trip:EasyTTrip,leg:TripLeg,assessment?:PlanningEvidenceState) {
  if(assessment&&(assessment.retrieval!=='completed'||assessment.evidence==='unqualified'
    ||assessment.reason==='identity_required'||assessment.reason==='invalid_input'))return false;
  const unit=trip.brief.cascadeStatus?.routeReconciliation?.residual.find(unit=>unit.kind==='leg'&&unit.targetId===leg.id);
  if(unit)return false;
  const guarded=guardTripRoutingGeometry(trip),source=guarded.legs.find(candidate=>candidate.id===leg.id);
  if(!source)return false;
  const projected=effectiveTripLeg(guarded,source),duration=projected.doorToDoorMinutes??projected.durationMinutes;
  return projected.mode!=='unknown'&&projected.provenance==='planning_estimate'
    &&typeof duration==='number'&&Number.isFinite(duration)&&duration>0;
}

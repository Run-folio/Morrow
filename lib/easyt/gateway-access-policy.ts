import type {KnowledgeSource} from './destination-knowledge.ts';
/** Existing resolver rule extracted unchanged; applies only after a road-access relationship is qualified. */
export function gatewayAccessPlanningMinutes(distanceKm:number){
 return Math.max(15,Math.round((45+(distanceKm/55)*60)/15)*15);
}
export const GATEWAY_ACCESS_RULE_SOURCE:KnowledgeSource={id:'planner:gateway-access-v1',label:'Morrovia existing gateway access rule',kind:'curated',supports:'Version 1: 45 minutes plus distance at 55 km/h, rounded to the nearest 15 minutes. A planning allowance, not routed road geometry, measured traffic or an operator service claim.'};

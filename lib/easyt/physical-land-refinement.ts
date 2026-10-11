import artifact from '../../public/data/physical-land/components.json' with {type:'json'};
import {physicalContains,type Point} from './physical-island-geometry.ts';
import type {PhysicalLandArtifact,PhysicalLandComponent} from './physical-land-source.ts';
export type LandContinuity='same-land'|'separate-land'|'unproven';
// JSON tuples are checked by the offline compiler and data integrity gate.
const accepted=artifact as unknown as PhysicalLandArtifact;
export const PHYSICAL_LAND_ATTRIBUTION='© OpenStreetMap contributors (ODbL 1.0)';
export const PHYSICAL_LAND_DATA_URL='/data/physical-land/NOTICE.txt';
function boundary(point:Point,ring:Point[]){
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1]!,b=ring[i]!;
  const cross=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);
  if(Math.abs(cross)<=1e-12&&point[0]>=Math.min(a[0],b[0])&&point[0]<=Math.max(a[0],b[0])&&point[1]>=Math.min(a[1],b[1])&&point[1]<=Math.max(a[1],b[1]))return true;
 }
 return false;
}
function componentAt(point:Point,components:readonly PhysicalLandComponent[]){
 if(!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90||components.length>16)return undefined;
 const matches:PhysicalLandComponent[]=[];
 for(const c of components){
  const rings=[...c.geometry.outer,...c.geometry.inner];
  if(rings.some(r=>boundary(point,r)))return undefined;
  if(physicalContains(c.geometry,point))matches.push(c);
 }
 return matches.length===1?matches[0]:undefined;
}
/** Precise evidence never overrides authoritative coarse separation or widens
 * shoreline snapping. A shared relation label cannot join disjoint shells. */
export function physicalLandComponentForPair(coarse:LandContinuity,from:readonly [number,number],to:readonly [number,number],components:readonly PhysicalLandComponent[]=accepted.components){
 if(coarse!=='unproven')return undefined;
 const a=componentAt([...from],components),b=componentAt([...to],components);
 return a&&b&&a===b?a:undefined;
}
export function refineUnprovenLandConnection(coarse:LandContinuity,from:readonly [number,number],to:readonly [number,number],components:readonly PhysicalLandComponent[]=accepted.components):LandContinuity{
 return physicalLandComponentForPair(coarse,from,to,components)?'same-land':coarse;
}

import polygons from '../../data/land-connection-10m.json' with { type: 'json' };
import {refineUnprovenLandConnection,physicalLandComponentForPair} from './physical-land-refinement.ts';

// Simplified Natural Earth 1:10m land polygons. Their island identities survive
// simplification. A shore point may be snapped only when one landmass is clearly
// nearest; a narrow strait remains uncertain.
function insideRing(point: readonly [number,number], ring: number[][]) {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i]!,b=ring[j]!;
  if((a[1]!>point[1]) !== (b[1]!>point[1]) && point[0] < (b[0]!-a[0]!)*(point[1]-a[1]!)/(b[1]!-a[1]!)+a[0]!)inside=!inside;
 }
 return inside;
}
const bounds=polygons.map(rings=>rings[0]!.reduce((box,point)=>[
 Math.min(box[0],point[0]!),Math.min(box[1],point[1]!),Math.max(box[2],point[0]!),Math.max(box[3],point[1]!),
] as [number,number,number,number],[Infinity,Infinity,-Infinity,-Infinity] as [number,number,number,number]));
function shoreDistanceKm(point:readonly [number,number],ring:number[][]) {
 const longitudeScale=Math.cos(point[1]*Math.PI/180)*111;
 const latitudeScale=111;
 let best=Infinity;
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1]!,b=ring[i]!;
  const ax=(a[0]!-point[0])*longitudeScale,ay=(a[1]!-point[1])*latitudeScale;
  const bx=(b[0]!-point[0])*longitudeScale,by=(b[1]!-point[1])*latitudeScale;
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
  const position=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
  best=Math.min(best,Math.hypot(ax+position*dx,ay+position*dy));
 }
 return best;
}
function landmassIndex(point:readonly [number,number]) {
 if(!point.every(Number.isFinite))return -1;
 const contained=polygons.findIndex(rings=>insideRing(point,rings[0]!) && !rings.slice(1).some(hole=>insideRing(point,hole)));
 if(contained>=0)return contained;
 const nearby:number[]=[];
 for(let index=0;index<polygons.length;index++){
  const box=bounds[index]!;
  if(point[0]<box[0]-0.1||point[0]>box[2]+0.1||point[1]<box[1]-0.1||point[1]>box[3]+0.1)continue;
  if(shoreDistanceKm(point,polygons[index]![0]!)<=10)nearby.push(index);
 }
 if(nearby.length!==1)return -1;
 return shoreDistanceKm(point,polygons[nearby[0]!]![0]!)<=5 ? nearby[0]! : -1;
}

export function coarseLandConnectionEvidence(from: readonly [number,number],to:readonly [number,number]):'same-land'|'separate-land'|'unproven'{
 const a=landmassIndex(from),b=landmassIndex(to);
 return a<0||b<0?'unproven':a===b?'same-land':'separate-land';
}
export function landConnectionEvidence(from:readonly [number,number],to:readonly [number,number]){
 return refineUnprovenLandConnection(coarseLandConnectionEvidence(from,to),from,to);
}
export function landConnectionRefinement(from:readonly [number,number],to:readonly [number,number]){
 return physicalLandComponentForPair(coarseLandConnectionEvidence(from,to),from,to);
}

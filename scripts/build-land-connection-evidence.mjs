// Rebuild with: node scripts/build-land-connection-evidence.mjs
// Natural Earth 1:10m land, distributed through world-atlas. Simplification
// keeps separate island polygon identities; it never asserts road service.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
const require = createRequire(import.meta.url);
const topology = require('world-atlas/land-10m.json');
const polygons = feature(topology, topology.objects.land).features.flatMap(item => item.geometry.type === 'MultiPolygon'
  ? item.geometry.coordinates : [item.geometry.coordinates]);
function simplify(ring, tolerance=0.05) {
 if(ring.length<5)return ring;
 const toleranceSquared=tolerance*tolerance;
 const visit=(start,end,result)=>{
  let best=-1,index=-1;
  const from=ring[start],to=ring[end],dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
  for(let i=start+1;i<end;i++){
   const point=ring[i],position=length?Math.max(0,Math.min(1,((point[0]-from[0])*dx+(point[1]-from[1])*dy)/length)):0;
   const x=point[0]-from[0]-position*dx,y=point[1]-from[1]-position*dy,distance=x*x+y*y;
   if(distance>best){best=distance;index=i;}
  }
  if(best>toleranceSquared){visit(start,index,result);result.push(ring[index]);visit(index,end,result);}
 };
 const result=[ring[0]];visit(0,ring.length-1,result);result.push(ring.at(-1));
 return result.length>=4?result:ring.slice(0,4);
}
const compact=polygons.map(rings=>rings.map(ring=>simplify(ring).map(point=>point.map(value=>Math.round(value*1000)/1000))));
writeFileSync(new URL('../data/land-connection-10m.json',import.meta.url),JSON.stringify(compact));

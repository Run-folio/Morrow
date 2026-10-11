import {createHash} from 'node:crypto';
import {physicalGeometry,physicalContains,type PhysicalIslandGeometry,type Point} from './physical-island-geometry.ts';
export type PhysicalLandComponent={key:string;geometry:PhysicalIslandGeometry};
export type PhysicalLandApproval={version:1;sourceURL:string;rawSHA256:string;rawBytes:number;capturedAt:string;relationId:number;relationVersion:number;relationTimestamp:string;memberVersions:Array<{id:number;role:string;version:number}>;nodeVersionsSHA256:string;simplification:'none'};
export type PhysicalLandArtifact={version:1;simplification:'none';source:PhysicalLandApproval;components:PhysicalLandComponent[]};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const reject=()=>{throw new Error('Invalid pinned physical shoreline source');};
/** Offline only. Exact approved relation, full dependencies and physical coast tags;
 * no administrative/maritime inference, live lookup, snapping or simplification. */
export function compilePinnedPhysicalLandSource(raw:string,pin:PhysicalLandApproval):PhysicalLandArtifact{
 if(pin.version!==1||pin.relationId!==11105712||pin.relationVersion!==10||pin.sourceURL!=='https://api.openstreetmap.org/api/0.6/relation/11105712/full.json'
  ||pin.simplification!=='none'||!Number.isFinite(Date.parse(pin.capturedAt))||!Number.isFinite(Date.parse(pin.relationTimestamp))
  ||!Number.isSafeInteger(pin.rawBytes)||pin.rawBytes<1||pin.rawBytes>4_000_000||Buffer.byteLength(raw)!==pin.rawBytes||hash(raw)!==pin.rawSHA256
  ||!Array.isArray(pin.memberVersions)||pin.memberVersions.length<1||pin.memberVersions.length>600)reject();
 const body=JSON.parse(raw) as {elements:Array<any>};
 if(!Array.isArray(body.elements)||body.elements.length<4||body.elements.length>61_000)reject();
 const nodes=new Map<number,any>(),ways=new Map<number,any>(),relations:any[]=[];
 for(const e of body.elements){
  if(!Number.isSafeInteger(e.id)||e.id<=0||!Number.isSafeInteger(e.version)||e.version<1||!Number.isFinite(Date.parse(e.timestamp)))reject();
  const map=e.type==='node'?nodes:e.type==='way'?ways:null;
  if(map){if(map.has(e.id))reject();map.set(e.id,e);}else if(e.type==='relation')relations.push(e);else reject();
 }
 if(relations.length!==1)reject();const rel=relations[0];
 if(rel.id!==pin.relationId||rel.version!==pin.relationVersion||rel.timestamp!==pin.relationTimestamp||rel.tags?.type!=='multipolygon'||rel.tags?.place!=='island'
  ||rel.tags?.boundary||rel.tags?.maritime||rel.tags?.admin_level||rel.tags?.name!=='Unguja'||!Array.isArray(rel.members)||rel.members.length!==pin.memberVersions.length)reject();
 const nodeVersions=[...nodes.values()].map(n=>[n.id,n.version]).sort((a,b)=>a[0]-b[0]);if(hash(JSON.stringify(nodeVersions))!==pin.nodeVersionsSHA256)reject();
 const usedWays=new Set<number>(),usedNodes=new Set<number>();
 const members=rel.members.map((m:any,index:number)=>{
  const expected=pin.memberVersions[index],way=ways.get(m.ref);
  if(m.type!=='way'||!['outer','inner'].includes(m.role)||usedWays.has(m.ref)||!way||expected.id!==m.ref||expected.role!==m.role||expected.version!==way.version
   ||way.tags?.boundary||way.tags?.maritime||way.tags?.admin_level||way.tags?.natural!=='coastline'||!Array.isArray(way.nodes)||way.nodes.length<2||way.nodes.length>60_000)reject();
  usedWays.add(m.ref);
  const geometry=way.nodes.map((id:number)=>{const n=nodes.get(id);if(!n||!Number.isFinite(n.lon)||!Number.isFinite(n.lat)||Math.abs(n.lon)>180||Math.abs(n.lat)>90)reject();usedNodes.add(id);return {lon:n.lon,lat:n.lat};});
  return {...m,geometry};
 });
 if(usedWays.size!==ways.size||usedNodes.size!==nodes.size)reject();
 // capturedAt explicitly describes this immutable API response, not a fabricated
 // Overpass timestamp. The existing validator consumes it as geometry provenance.
 const geometry=physicalGeometry({osm3s:{timestamp_osm_base:new Date(pin.capturedAt).toISOString()},elements:[{...rel,members}]},
  {id:pin.relationId,type:'relation',name:'Unguja',country:'Tanzania'},Date.now()+10_000);
 if(!geometry)reject();
 const components=geometry!.outer.map(shell=>{
  const points=new Set(shell.map(p=>p.join(',')));
  const ids=members.filter((m:any)=>m.role==='outer'&&m.geometry.every((p:any)=>points.has(`${p.lon},${p.lat}`))).map((m:any)=>m.ref as number).sort((a:number,b:number)=>a-b);
  if(!ids.length)reject();
  const inner=geometry!.inner.filter(hole=>physicalContains({outer:[shell],inner:[],timestamp:geometry!.timestamp},hole[0]!));
  return {key:`osm:relation:${pin.relationId}:component:way:${ids[0]}`,geometry:{outer:[shell],inner,timestamp:geometry!.timestamp}};
 }).sort((a,b)=>a.key.localeCompare(b.key));
 if(new Set(components.map(c=>c.key)).size!==components.length)reject();
 return {version:1,simplification:'none',source:pin,components};
}

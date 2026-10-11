import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const raw=readFileSync('public/data/physical-land/unguja-osm-full.json','utf8'),approval=JSON.parse(readFileSync('public/data/physical-land/source-approval.json','utf8'));
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
test('pinned official physical shoreline compiles without changing accepted coordinates',async()=>{
 let compiled:any;await assert.doesNotReject(async()=>{const {compilePinnedPhysicalLandSource}=await import('../lib/easyt/physical-land-source.ts');compiled=compilePinnedPhysicalLandSource(raw,approval);});
 assert.equal(compiled.components.length,1);assert.equal(compiled.components[0].geometry.outer[0].length,6301);assert.equal(compiled.simplification,'none');assert.equal(compiled.source.rawSHA256,approval.rawSHA256);
});
for(const change of ['hash','host','relation','version','member-version','node-version','nested','incomplete','administrative','maritime','not-coastline','invalid-ring','duplicate'] as const)test(`reject source ${change}`,async()=>{
 const {compilePinnedPhysicalLandSource}=await import('../lib/easyt/physical-land-source.ts');const body=JSON.parse(raw),pin=structuredClone(approval),r=body.elements.find((e:any)=>e.type==='relation'),w=body.elements.find((e:any)=>e.type==='way'),n=body.elements.find((e:any)=>e.type==='node');
 if(change==='host')pin.sourceURL='https://example.org/api/0.6/relation/11105712/full.json';if(change==='relation')r.id=42;if(change==='version')r.version++;if(change==='member-version')w.version++;if(change==='node-version')n.version++;if(change==='nested')r.members[0].type='relation';if(change==='incomplete')body.elements.splice(body.elements.indexOf(n),1);if(change==='administrative')r.tags.boundary='administrative';if(change==='maritime')w.tags.maritime='yes';if(change==='not-coastline')w.tags.natural='wood';if(change==='invalid-ring')w.nodes.reverse(),w.nodes[0]=w.nodes[1];if(change==='duplicate')body.elements.push(n);
 const text=JSON.stringify(body);pin.rawSHA256=change==='hash'?'0'.repeat(64):sha(text);pin.rawBytes=Buffer.byteLength(text);assert.throws(()=>compilePinnedPhysicalLandSource(text,pin));
});

test('caps, capture time and changed simplification policy fail closed',async()=>{
 const {compilePinnedPhysicalLandSource}=await import('../lib/easyt/physical-land-source.ts');
 for(const p of [{...approval,capturedAt:'invalid'},{...approval,simplification:'snap'},{...approval,rawBytes:4_000_001},{...approval,memberVersions:Array(601).fill(approval.memberVersions[0])}])assert.throws(()=>compilePinnedPhysicalLandSource(raw,p));
});

test('synthetic disconnected coastline shells retain distinct stable component keys and holes',async()=>{
 const {compilePinnedPhysicalLandSource}=await import('../lib/easyt/physical-land-source.ts');
 const make=(reverse=false)=>{
  const points=[[0,0],[4,0],[4,4],[0,4],[1,1],[2,1],[2,2],[1,2],[10,0],[14,0],[14,4],[10,4]];
  const nodes=points.map(([lon,lat],i)=>({type:'node',id:i+1,version:1,timestamp:approval.relationTimestamp,lon,lat}));
  const ways=[{type:'way',id:100,version:1,timestamp:approval.relationTimestamp,tags:{natural:'coastline'},nodes:[1,2,3,4,1]},{type:'way',id:101,version:1,timestamp:approval.relationTimestamp,tags:{natural:'coastline'},nodes:[5,6,7,8,5]},{type:'way',id:200,version:1,timestamp:approval.relationTimestamp,tags:{natural:'coastline'},nodes:[9,10,11,12,9]}];
  const members=[{type:'way',ref:100,role:'outer'},{type:'way',ref:101,role:'inner'},{type:'way',ref:200,role:'outer'}];if(reverse)members.reverse();
  const relation={type:'relation',id:11105712,version:10,timestamp:approval.relationTimestamp,tags:{name:'Unguja',place:'island',type:'multipolygon'},members};
  const text=JSON.stringify({elements:[...nodes,...ways,relation]});const pin={...approval,rawSHA256:sha(text),rawBytes:Buffer.byteLength(text),memberVersions:members.map(m=>({id:m.ref,role:m.role,version:1})),nodeVersionsSHA256:sha(JSON.stringify(nodes.map(n=>[n.id,n.version])))};
  return compilePinnedPhysicalLandSource(text,pin);
 };
 const a=make(),b=make(true);assert.equal(a.components.length,2);assert.equal(a.components.filter(c=>c.geometry.inner.length===1).length,1);assert.deepEqual(a.components.map(c=>c.key),b.components.map(c=>c.key));assert.notEqual(a.components[0].key,a.components[1].key);
});

test('published whole derivative and coarse base exactly regenerate with pinned hashes and notice',async()=>{
 const {compilePinnedPhysicalLandSource}=await import('../lib/easyt/physical-land-source.ts');const text=JSON.stringify(compilePinnedPhysicalLandSource(raw,approval))+'\n';const manifest=JSON.parse(readFileSync('public/data/physical-land/manifest.json','utf8'));assert.equal(text,readFileSync('public/data/physical-land/components.json','utf8'));assert.equal(sha(text),manifest.outputSHA256);assert.equal(readFileSync('data/land-connection-10m.json','utf8'),readFileSync('public/data/physical-land/natural-earth-base.json','utf8'));const notice=readFileSync('public/data/physical-land/NOTICE.txt','utf8');for(const token of ['ODbL','Derivative Database','components.json','unguja-osm-full.json','natural-earth-base.json'])assert.ok(notice.includes(token));
});

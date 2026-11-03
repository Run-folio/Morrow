import assert from 'node:assert/strict';
import test from 'node:test';
import * as lifecycle from '../lib/easyt/map-renderer-lifecycle.ts';
function fixture(gl:object|null,throwOnRemove=false,probeGl:object|null={isContextLost:()=>false,getExtension:()=>null}){
 const child={className:'',removed:0,remove(){this.removed++}},host={ownerDocument:{createElement:(kind:string)=>kind==='canvas'?{getContext:()=>probeGl,remove(){}}:child},children:[] as unknown[],appendChild(node:unknown){this.children.push(node)}};
 let removals=0;const map={getCanvas:()=>({getContext:()=>gl}),remove(){removals++;if(throwOnRemove)throw new Error('teardown failed')}};
 return {child,host,map,get removals(){return removals}};
}
test('constructor returning without a renderer is never published or removed as a valid map',()=>{
 const f=fixture(null);const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>f.map as any);
 assert.equal(r.kind,'unavailable');assert.equal(f.removals,0);assert.equal(f.child.removed,1);
});
test('constructor exception discards only its owned host',()=>{
 const f=fixture(null);const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>{throw new Error('GPU failed')});
 assert.equal(r.kind,'unavailable');assert.equal(f.child.removed,1);assert.equal(f.removals,0);
});
test('healthy WebGL2 returns the exact map, then disposes once',()=>{
 const f=fixture({isContextLost:()=>false});const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>f.map as any);
 assert.equal(r.kind,'ready');if(r.kind!=='ready')return;assert.equal(r.map,f.map);assert.equal(f.child.removed,0);
 assert.equal(r.dispose().kind,'removed');assert.equal(r.dispose().kind,'removed');assert.equal(f.removals,1);assert.equal(f.child.removed,1);
});
test('cleanup failure is contained and still detaches owned DOM',()=>{
 const f=fixture({isContextLost:()=>false},true);const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>f.map as any);
 assert.equal(r.kind,'ready');if(r.kind!=='ready')return;assert.equal(r.dispose().kind,'failed');assert.equal(f.child.removed,1);assert.equal(f.removals,1);
 assert.equal(r.dispose().kind,'removed');assert.equal(f.removals,1);
});

test('unsupported WebGL never constructs a partial MapLibre object',()=>{
 const f=fixture(null,false,null);let calls=0;
 const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>{calls++;return f.map as any});
 assert.equal(r.kind,'unavailable');assert.equal(calls,0);assert.equal(f.host.children.length,0);
});

test('capability context is released once and cached across mounts in the same document',()=>{
 let probes=0,releases=0;
 const f=fixture({isContextLost:()=>false},false,{isContextLost:()=>false,getExtension:()=>({loseContext(){releases++}})});
 const create=f.host.ownerDocument.createElement;
 f.host.ownerDocument.createElement=(kind:string)=>{if(kind==='canvas')probes++;return create(kind);};
 for(let i=0;i<3;i++){const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>f.map as any);assert.equal(r.kind,'ready');if(r.kind==='ready')r.dispose();}
 assert.equal(probes,1);assert.equal(releases,1);assert.equal(f.removals,3);
});
test('context lost during actual initialization is unavailable and cleanup is contained',()=>{
 const f=fixture({isContextLost:()=>true},true);
 const r=lifecycle.createMapRenderer(f.host as any,'canvas',()=>f.map as any);
 assert.equal(r.kind,'unavailable');assert.equal(f.removals,1);assert.equal(f.child.removed,1);
});

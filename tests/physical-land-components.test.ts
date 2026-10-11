import assert from 'node:assert/strict';import test from 'node:test';
const timestamp='2026-10-11T02:29:18.685Z';
const shell=[[0,0],[4,0],[4,4],[0,4],[0,0]] as [number,number][];
const hole=[[1,1],[2,1],[2,2],[1,2],[1,1]] as [number,number][];
const component=(key:string,outer=shell,inner:[number,number][][]=[])=>({key,geometry:{outer:[outer],inner,timestamp}});
test('only coarse unproven may be refined by strict same-component containment',async()=>{
 let refine:any;await assert.doesNotReject(async()=>{refine=(await import('../lib/easyt/physical-land-refinement.ts')).refineUnprovenLandConnection;});
 const c=[component('physical:a')];assert.equal(refine('unproven',[.5,.5],[3,3],c),'same-land');assert.equal(refine('separate-land',[.5,.5],[3,3],c),'separate-land');assert.equal(refine('same-land',[20,20],[30,30],c),'same-land');
});
test('boundary, hole and sea cannot provide positive continuity',async()=>{
 const {refineUnprovenLandConnection:refine}=await import('../lib/easyt/physical-land-refinement.ts');const c=[component('physical:a',shell,[hole])];for(const p of [[0,1],[1.5,1.5],[1,1.5],[5,5]] as [number,number][])assert.equal(refine('unproven',[.5,.5],p,c),'unproven');
});
test('disconnected shells under one source and overlapping candidates stay unknown',async()=>{
 const {refineUnprovenLandConnection:refine}=await import('../lib/easyt/physical-land-refinement.ts');const b=shell.map(([x,y])=>[x+10,y] as [number,number]);assert.equal(refine('unproven',[.5,.5],[10.5,.5],[component('relation:a:outer1'),component('relation:a:outer2',b)]),'unproven');assert.equal(refine('unproven',[.5,.5],[3,3],[component('a'),component('b')]),'unproven');
});

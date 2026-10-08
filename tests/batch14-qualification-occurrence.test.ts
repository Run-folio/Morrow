import assert from 'node:assert/strict';
import test from 'node:test';
import {insertHandoffOccurrence} from '../lib/easyt/home-trip-handoff.ts';
const mentions=[{mentionId:'milan',canonicalName:'Milan',order:0},{mentionId:'lake',canonicalName:'Como',order:1},{mentionId:'verona',canonicalName:'Verona',order:2},{mentionId:'venice',canonicalName:'Venice',order:3}];
const bindings={'promoted-milan':'milan','promoted-como':'lake','promoted-lecco':'lake','promoted-venice':'venice'};
test('A12 a following unresolved occurrence is inserted after every accepted base of its preceding area',()=>{
 const current=['promoted-milan','promoted-como','promoted-lecco','promoted-venice'].map(id=>({id}));
 assert.deepEqual(insertHandoffOccurrence(current,{id:'verona'},mentions[2]!,mentions,bindings).map(s=>s.id),['promoted-milan','promoted-como','promoted-lecco','verona','promoted-venice']);
});
test('A12 an earlier occurrence is inserted before the first accepted base of its following area',()=>{
 const current=['promoted-como','promoted-lecco','promoted-venice'].map(id=>({id}));
 assert.deepEqual(insertHandoffOccurrence(current,{id:'promoted-milan'},mentions[0]!,mentions,bindings).map(s=>s.id),['promoted-milan','promoted-como','promoted-lecco','promoted-venice']);
});
for(const authority of ['manual','explicit'] as const)test(`A12 conflicting ${authority} order is preserved instead of silently reconciling source positions`,()=>{
 const current=['promoted-milan','promoted-venice','promoted-como','promoted-lecco'].map(id=>({id})),before=structuredClone(current);
 assert.throws(()=>insertHandoffOccurrence(current,{id:'verona'},mentions[2]!,mentions,bindings,authority),/route order/i);
 assert.deepEqual(current,before);
});
test('A12 repeated same-city source IDs remain separate and existing relative order survives insertion',()=>{
 const repeated=[...mentions,{mentionId:'milan-repeat',canonicalName:'Milan',order:4}];
 const current=['promoted-milan','promoted-como','promoted-lecco','promoted-venice','repeat-milan'].map(id=>({id}));
 const result=insertHandoffOccurrence(current,{id:'verona'},mentions[2]!,repeated,{...bindings,'repeat-milan':'milan-repeat'});
 assert.deepEqual(result.filter(s=>s.id!=='verona'),current);assert.equal(new Set(result.map(s=>s.id)).size,result.length);assert.equal(result.findIndex(s=>s.id==='verona'),3);
});

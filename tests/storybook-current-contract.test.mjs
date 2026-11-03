import assert from 'node:assert/strict';
import test from 'node:test';
import { requireStorySelection, requireWorkspaceNavigation } from '../scripts/storybook-current-contract.mjs';
const entries=[{id:'known'},{id:'outside'}],cases=[{id:'known',importPath:'components/privacy-consent.stories.tsx'}];
test('unknown story IDs cannot produce a zero-case green qualification',()=>assert.throws(()=>requireStorySelection(cases,entries,{ids:'typo'}),/Unknown/));
test('known IDs outside the selected matrix are rejected explicitly',()=>assert.throws(()=>requireStorySelection(cases,entries,{ids:'outside'}),/outside/));
test('a memory-only matrix cannot silently omit a requested native-backed case',()=>assert.throws(()=>requireStorySelection([{id:'known',importPath:'home.stories.tsx'}],entries,{ids:'known',memoryOnly:true}),/outside/));
test('empty matrices fail before launching a browser',()=>assert.throws(()=>requireStorySelection([],entries),/No stories/));
test('an exact requested subset stays qualified',()=>assert.deepEqual(requireStorySelection(cases,entries,{ids:'known'}),cases));
test('a required workspace landmark cannot disappear without failing the check',()=>assert.throws(()=>requireWorkspaceNavigation('transport',1440,{count:0}),/Missing/));
test('wrong active workspace fails while current desktop Stay uses its actual label',()=>{assert.throws(()=>requireWorkspaceNavigation('transport',1440,{count:1,current:'Overview'}),/Transport/);assert.doesNotThrow(()=>requireWorkspaceNavigation('stay',1440,{count:1,current:'Stay'}));});
test('mobile Stays requires its actual More current-section affordance',()=>{assert.doesNotThrow(()=>requireWorkspaceNavigation('stay',390,{count:1,more:'More, current section: Stays'}));assert.throws(()=>requireWorkspaceNavigation('stay',390,{count:1,more:'More'}),/Stays/);});

test('catalogue batches have exact bounded offsets without overlap',async()=>{
 const {selectStoryBatch}=await import('../scripts/storybook-current-contract.mjs');const values=['a','b','c','d'];
 assert.deepEqual(selectStoryBatch(values,{offset:'0',limit:'2'}),['a','b']);
 assert.deepEqual(selectStoryBatch(values,{offset:'2',limit:'2'}),['c','d']);
});
test('batch bounds reject malformed, empty and oversized schedules',async()=>{
 const {selectStoryBatch}=await import('../scripts/storybook-current-contract.mjs');
 for(const options of [{offset:'-1'},{offset:'unknown'},{offset:'4'}, {limit:'0'},{limit:'201'},{limit:true}])assert.throws(()=>selectStoryBatch(['a','b','c','d'],options),/batch|offset|limit/i);
});

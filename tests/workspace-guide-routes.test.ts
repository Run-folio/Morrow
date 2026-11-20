import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceFromPathname} from '../lib/easyt/workspace-orientation.ts';
test('current tab owns its guide, regardless of trip slug or trailing slash',()=>{
 for(const section of ['transport','stay','explore','today','map','itinerary']) assert.equal(workspaceFromPathname('/journey/itinerary-holiday/'+section+'/'),section);
 assert.equal(workspaceFromPathname('/journey/map-trip'),'overview');
});

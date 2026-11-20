import assert from 'node:assert/strict';
import test from 'node:test';
import {legacyPlannerDestination,tripSyncRecoveryPath,activityWorkspaceReturnPath} from '../lib/easyt/trip-continuity.ts';
test('legacy planner opens the exact modern workspace but never converts save into consent',()=>{
 assert.equal(legacyPlannerDestination(new URLSearchParams('trip=trip-a&save=1&recover=1&next=//elsewhere')), '/journey/trip-a?recover=1');
 assert.equal(legacyPlannerDestination(new URLSearchParams('trip=trip-a&stay=stop%2F1')), '/journey/trip-a/stay?stop=stop%2F1');
 assert.equal(legacyPlannerDestination(new URLSearchParams('trip=trip-a'),true), '/journey/new?trip=trip-a&recover=1');
 assert.equal(legacyPlannerDestination(new URLSearchParams('trip=..')), '/journey/new');
 assert.equal(legacyPlannerDestination(new URLSearchParams('next=//elsewhere')), '/journey/new');
 assert.equal(legacyPlannerDestination(new URLSearchParams('trip=trip-a&trip=trip-b')), '/journey/new');
});
test('device and activity continuation links never forward to the retired planner',()=>{
 assert.equal(tripSyncRecoveryPath('trip-a'),'/journey/new?trip=trip-a&recover=1');
 assert.equal(activityWorkspaceReturnPath('trip-a'),'/journey/trip-a?recover=1');
});

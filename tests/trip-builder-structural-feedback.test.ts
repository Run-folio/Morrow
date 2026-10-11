import assert from 'node:assert/strict';
import test from 'node:test';
import { builderStructuralFeedback } from '../lib/easyt/trip-builder-structural-feedback.ts';
import type { BuilderAcceptedEdit } from '../lib/easyt/trip-builder-edit.ts';
const selection={mentionId:'visit',kind:'visit',routeStopId:'stop'};
test('requested-place removal without a route occurrence retains structural feedback',()=>{
 assert.equal(builderStructuralFeedback([{kind:'planning-area',mentionId:'request',action:'remove'}])?.summary,'remove_requested_place');
});
test('night controls and route-night apply preserve distinct date Undo semantics',()=>{
 const nights={kind:'nights',stopId:'stop',intentId:'intent',nights:3} as const;
 assert.equal(builderStructuralFeedback([nights])?.summary,'change_nights');
 assert.equal(builderStructuralFeedback([nights,{kind:'dates',startDate:'2026-10-10',endDate:'2026-10-20'}])?.summary,'change_trip_dates');
});
test('move, drag and recommended order share accepted structural feedback',()=>{
 for(const source of ['drag','move-menu','route-check'] as const)assert.equal(builderStructuralFeedback([{kind:'order',stopIds:['b','a'],source}])?.summary,source==='route-check'?'apply_route_order':'reorder_stop');
});
test('Add, replacement, removal and visit selection are structural; inverse and draft actions never announce new success',()=>{
 for(const kind of ['add-destination','resolve-destination','replace-destination','remove-destination'] as const)assert.ok(builderStructuralFeedback([{kind} as BuilderAcceptedEdit]));
 assert.equal(builderStructuralFeedback([{kind:'planning-selection',selection:{...selection,kind:'visit'} as never}])?.summary,'confirm_attraction_visit_base');
 for(const action of ['complete','reopen'] as const)assert.equal(builderStructuralFeedback([{kind:'planning-area',mentionId:'request',action}]),null);
 assert.equal(builderStructuralFeedback([{kind:'budget',budget:'high'}]),null);
 assert.equal(builderStructuralFeedback([{kind:'structural-inverse'} as BuilderAcceptedEdit]),null);
});

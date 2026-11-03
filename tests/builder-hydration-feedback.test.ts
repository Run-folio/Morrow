import assert from 'node:assert/strict';
import test from 'node:test';
import * as feedback from '../lib/easyt/builder-hydration-feedback.ts';
import {builderHydrationFeedback} from '../lib/easyt/builder-hydration-feedback.ts';
test('unavailable storage is not described as another account owning the trip',()=>{
 const f=builderHydrationFeedback('unavailable','en');assert.equal(f.title,'Device storage unavailable');assert.doesNotMatch(f.detail,/another account|current browser account|belongs/i);assert.match(f.safety,/Keep this tab open/i);
});
test('protected recovery stays protected and separate from storage unavailability',()=>{
 const f=builderHydrationFeedback('protected','en');assert.equal(f.title,'Device copies need review');assert.match(f.detail,/protected/);assert.doesNotMatch(f.title,/unavailable/);
});
test('an unknown hydration exception makes no ownership diagnosis in either language',()=>{
 for(const language of ['en','es'] as const){const f=builderHydrationFeedback('unknown',language);assert.ok(f.title);assert.ok(f.safety);assert.doesNotMatch(f.detail,/current browser account|otra cuenta/);}
});

test('homepage guard reasons retain unavailable versus protected storage presentation',()=>{
 assert.equal(feedback.builderHydrationIssueFor('homepage-read-unavailable'),'unavailable');
 assert.equal(feedback.builderHydrationIssueFor('homepage-read-protected'),'protected');
 assert.equal(feedback.builderHydrationIssueFor('entry-exception'),'unknown');
 assert.equal(feedback.builderHydrationIssueFor('requested-trip-missing'),'unknown');
});

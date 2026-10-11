import assert from 'node:assert/strict';
import test from 'node:test';
import { planningEvidenceFromResponse, planningLaneMessage, transferAssessmentForLeg } from '../lib/easyt/planning-evidence-presentation.ts';
import type { PlanningEvidenceState } from '../lib/easyt/planning-evidence-state.ts';
import * as presentation from '../lib/easyt/planning-evidence-presentation.ts';

const state = (patch: Partial<PlanningEvidenceState>): PlanningEvidenceState => ({ retrieval: 'completed', evidence: 'insufficient', retryable: false, ...patch });

test('only the explicit additive contract supplies failure reasons and retryability', () => {
  assert.equal(planningEvidenceFromResponse({ activities: [] }), undefined);
  assert.equal(planningEvidenceFromResponse({ unavailable: true }), undefined);
  assert.equal(planningEvidenceFromResponse({ assessment: { retrieval: 'unavailable', reason: 'timeout' } }), undefined);
  const timeout = state({ retrieval: 'unavailable', reason: 'timeout', retryable: true });
  assert.deepEqual(planningEvidenceFromResponse({ assessment: timeout }), timeout);
  assert.match(planningLaneMessage(timeout, 'en'), /timed out/i);
  assert.match(planningLaneMessage(state({ retrieval: 'blocked', reason: 'auth_required' }), 'en'), /sign in/i);
  const providerAuth = state({ retrieval: 'unavailable', reason: 'auth_required', diagnostics: { attemptedSources: ['commercial-inventory'], elapsedMs: 3, cacheOutcome: 'not-used', stage: 'provider' } });
  assert.doesNotMatch(planningLaneMessage(providerAuth, 'en'), /sign in/i, 'customer authentication cannot repair upstream provider credentials');
  assert.match(planningLaneMessage(providerAuth, 'en'), /bookable experiences.*unavailable/i);
  assert.match(planningLaneMessage(state({ retrieval: 'blocked', reason: 'identity_required' }), 'en'), /confirm.*destination/i);
  assert.match(planningLaneMessage(state({ retrieval: 'unavailable', reason: 'configuration_unavailable' }), 'en'), /unavailable/i);
  assert.doesNotMatch(planningLaneMessage(state({ retrieval: 'unavailable', reason: 'configuration_unavailable' }), 'en'), /timeout|provider|configuration/i);
  assert.match(planningLaneMessage(state({ reason: 'filtered_empty' }), 'en'), /returned.*match/i);
});

test('transfer metadata must match one returned leg identity; duplicate, unrelated and malformed metadata cannot qualify evidence', () => {
  const expected = state({ retrieval: 'unavailable', reason: 'provider_error', retryable: true });
  assert.deepEqual(transferAssessmentForLeg([{ legId: 'a', state: expected }], 'a'), expected);
  assert.equal(transferAssessmentForLeg([{ legId: 'b', state: expected }], 'a'), undefined);
  assert.equal(transferAssessmentForLeg([{ legId: 'a', state: expected }, { legId: 'a', state: expected }], 'a'), undefined);
  assert.equal(transferAssessmentForLeg([{ legId: 'a', state: {} }], 'a'), undefined);
});

test('activity response projection accepts only completed typed retrieval while preserving legacy availability', () => {
  const project = (presentation as any).planningLaneResponseStatus;
  assert.equal(typeof project, 'function');
  for (const retrieval of ['checking', 'not-attempted']) {
    assert.equal(project({ assessment: state({ retrieval: retrieval as any }) }, true), 'incomplete');
    assert.equal(project({ assessment: state({ retrieval: retrieval as any }) }, false), 'error');
    assert.match(planningLaneMessage(state({ retrieval: retrieval as any }), 'en'), /not finished|not been checked/);
  }
  for (const retrieval of ['blocked', 'unavailable']) assert.equal(project({ assessment: state({ retrieval: retrieval as any }) }, true), 'error');
  assert.equal(project({ assessment: state({ reason: 'successful_empty' }), places: [] }, true), 'ready');
  for (const legacy of [{ places: [] }, { activities: [] }, { assessment: { retrieval: 'invalid' } }]) assert.equal(project(legacy, true), 'ready');
  for (const legacy of [{ places: [], unavailable: true }, { activities: [], unavailable: true }]) assert.equal(project(legacy, true), 'error');
});

test('Builder feedback uses one current scope for noncanonical rows and aggregate and retires interrupted or replaced responses', () => {
  const select = (presentation as any).currentBuilderTransferAssessments;
  assert.equal(typeof select, 'function');
  const failure = [{ legId: 'a', state: state({ retrieval: 'unavailable', reason: 'configuration_unavailable' }) }];
  const resolved = { key: 'first', assessments: failure };
  assert.deepEqual(select(undefined, resolved, 'first'), failure);
  assert.equal(select(undefined, resolved, 'second'), undefined, 'an interrupted old request cannot explain the new route');
  assert.deepEqual(select([], resolved, 'first'), [], 'the mounted session owns its empty feedback and cannot inherit an earlier result');
  assert.equal(select(undefined, { key: 'first' }, 'first'), undefined, 'a repeated legacy response cannot inherit a typed failure');
  assert.equal(select(undefined, null, 'first'), undefined);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { planningEvidenceFromResponse, planningLaneMessage, transferAssessmentForLeg } from '../lib/easyt/planning-evidence-presentation.ts';
import type { PlanningEvidenceState } from '../lib/easyt/planning-evidence-state.ts';

const state = (patch: Partial<PlanningEvidenceState>): PlanningEvidenceState => ({ retrieval: 'completed', evidence: 'insufficient', retryable: false, ...patch });

test('only the explicit additive contract supplies failure reasons and retryability', () => {
  assert.equal(planningEvidenceFromResponse({ activities: [] }), undefined);
  assert.equal(planningEvidenceFromResponse({ unavailable: true }), undefined);
  assert.equal(planningEvidenceFromResponse({ assessment: { retrieval: 'unavailable', reason: 'timeout' } }), undefined);
  const timeout = state({ retrieval: 'unavailable', reason: 'timeout', retryable: true });
  assert.deepEqual(planningEvidenceFromResponse({ assessment: timeout }), timeout);
  assert.match(planningLaneMessage(timeout, 'en'), /timed out/i);
  assert.match(planningLaneMessage(state({ retrieval: 'blocked', reason: 'auth_required' }), 'en'), /sign in/i);
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

import type {PlanningCacheOutcome,PlanningEvidenceState,PlanningSourceCategory} from './planning-evidence-state.ts';

/** Controlled public reasons only; never serialize exception messages or keys. */
export function providerFailureAssessment(category: string, source: PlanningSourceCategory,
  elapsedMs: number, cacheOutcome: PlanningCacheOutcome = 'unknown'): PlanningEvidenceState {
  const reason = category === 'configuration' ? 'configuration_unavailable'
    : category === 'identity' ? 'identity_required'
    : category === 'authentication' ? 'auth_required'
    : category === 'timeout' ? 'timeout'
    : category === 'malformed' ? 'malformed_response'
    : category === 'no_route' ? 'no_route' : 'provider_error';
  return {retrieval: reason === 'identity_required' ? 'blocked' : reason === 'no_route' ? 'completed' : 'unavailable', evidence: reason === 'identity_required' ? 'unqualified' : 'insufficient', reason,
    retryable: reason === 'timeout' || reason === 'provider_error' || reason === 'malformed_response',
    checkedAt: new Date().toISOString(),
    diagnostics: {attemptedSources: category === 'configuration' ? [] : [source], elapsedMs, cacheOutcome,
      stage: category === 'configuration' ? 'configuration' : category === 'identity' ? 'identity' : category === 'malformed' ? 'normalization' : 'provider'}};
}

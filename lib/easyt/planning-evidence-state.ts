/** Request-local assessment only. Never attach this state to a canonical trip. */
export type PlanningRetrievalState = 'not-attempted' | 'checking' | 'completed' | 'unavailable' | 'blocked';
export type PlanningEvidenceQuality = 'verified' | 'conditional' | 'insufficient' | 'unqualified';
export type PlanningFailureReason = 'auth_required' | 'configuration_unavailable' | 'timeout' | 'provider_error'
  | 'malformed_response' | 'no_route' | 'missing_evidence' | 'identity_required' | 'invalid_input'
  | 'batch_limit' | 'successful_empty' | 'filtered_empty';
export type PlanningSourceCategory = 'local-knowledge' | 'road-provider' | 'organic-discovery' | 'commercial-inventory';
export type PlanningCacheOutcome = 'hit' | 'miss' | 'coalesced' | 'not-used' | 'unknown';
export type PlanningEvidenceState = {
  retrieval: PlanningRetrievalState;
  evidence: PlanningEvidenceQuality;
  reason?: PlanningFailureReason;
  retryable: boolean;
  checkedAt?: string;
  sourceCount?: number;
  diagnostics?: {
    attemptedSources: PlanningSourceCategory[];
    elapsedMs: number;
    cacheOutcome: PlanningCacheOutcome;
    stage?: 'identity' | 'configuration' | 'provider' | 'normalization' | 'evidence';
  };
};
export type TransferAssessment = { legId: string; state: PlanningEvidenceState };
/** Retrieval/admission counts only. UI owns planned/daypart/search/display filtering.
 * Absent on failures: unknown inventory must never be represented as zero stock. */
export type PlanningResultCounts = { raw: number; admitted: number; returned: number };

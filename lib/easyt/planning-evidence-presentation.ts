import type { PlanningEvidenceState } from './planning-evidence-state.ts';

/** Older or malformed responses convey no typed provider diagnosis. */
export function planningEvidenceFromResponse(payload: unknown): PlanningEvidenceState | undefined {
  const value = payload && typeof payload === 'object' ? (payload as { assessment?: unknown }).assessment : undefined;
  if (!value || typeof value !== 'object') return undefined;
  const state = value as PlanningEvidenceState;
  if (!['not-attempted', 'checking', 'completed', 'unavailable', 'blocked'].includes(state.retrieval)
    || !['verified', 'conditional', 'insufficient', 'unqualified'].includes(state.evidence)
    || typeof state.retryable !== 'boolean') return undefined;
  return state;
}

export function transferAssessmentForLeg(assessments: unknown, legId: string): PlanningEvidenceState | undefined {
  if (!Array.isArray(assessments)) return undefined;
  const matches = assessments.filter(item => item && item.legId === legId);
  return matches.length === 1 ? planningEvidenceFromResponse({ assessment: matches[0].state }) : undefined;
}

/** Reasons are deliberate user actions or outcome explanations, never diagnostic jargon. */
export function planningLaneMessage(state: PlanningEvidenceState, language: 'en' | 'es'): string {
  switch (state.reason) {
    case 'auth_required': return language === 'es' ? 'Inicia sesión para ver experiencias reservables. Las ideas locales siguen disponibles.' : 'Sign in to see bookable experiences. Local ideas remain available.';
    case 'identity_required': case 'invalid_input': return language === 'es' ? 'Confirma el destino para buscar ideas.' : 'Confirm the destination to find ideas.';
    case 'timeout': return language === 'es' ? 'La búsqueda tardó demasiado. Puedes volver a intentarlo.' : 'The search timed out. You can try again.';
    case 'filtered_empty': return language === 'es' ? 'Las ideas encontradas no coinciden con este destino.' : 'The returned ideas do not match this destination.';
    default: return language === 'es' ? 'Estas sugerencias no están disponibles ahora.' : 'These suggestions are unavailable right now.';
  }
}

export function transportEvidenceMessage(state: PlanningEvidenceState, language: 'en' | 'es'): string {
  if (state.reason === 'identity_required' || state.reason === 'invalid_input') return language === 'es' ? 'Confirma los lugares de este traslado.' : 'Confirm the places for this connection.';
  if (state.reason === 'timeout') return language === 'es' ? 'La comprobación tardó demasiado.' : 'The transport check timed out.';
  if (state.retrieval === 'unavailable' || state.retrieval === 'blocked') return language === 'es' ? 'No se pudo comprobar este traslado ahora.' : 'This connection could not be checked right now.';
  return language === 'es' ? 'Transporte por comprobar.' : 'Transport needs checking.';
}

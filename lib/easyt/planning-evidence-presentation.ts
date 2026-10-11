import type { PlanningEvidenceState, TransferAssessment } from './planning-evidence-state.ts';

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

/** The mounted session owns feedback; a preview response belongs only to its current route key. */
export function currentBuilderTransferAssessments(
  mounted: readonly TransferAssessment[] | undefined,
  resolved: { key: string; assessments?: readonly TransferAssessment[] } | null,
  inputKey: string,
): readonly TransferAssessment[] | undefined {
  return mounted ?? (resolved?.key === inputKey ? resolved.assessments : undefined);
}

/** A settled HTTP response can still carry incomplete retrieval; it is never empty success. */
export function planningLaneResponseStatus(payload: unknown, ok: boolean): 'ready' | 'error' | 'incomplete' {
  const assessment = planningEvidenceFromResponse(payload);
  const unavailable = payload && typeof payload === 'object' && (payload as { unavailable?: unknown }).unavailable;
  if (!ok || unavailable || assessment?.retrieval === 'unavailable' || assessment?.retrieval === 'blocked') return 'error';
  return assessment && assessment.retrieval !== 'completed' ? 'incomplete' : 'ready';
}

export function planningRequiresSignIn(state: PlanningEvidenceState | undefined): boolean {
  return state?.reason === 'auth_required' && state.retrieval === 'blocked' && state.diagnostics?.stage !== 'provider';
}

/** Reasons are deliberate user actions or outcome explanations, never diagnostic jargon. */
export function planningLaneMessage(state: PlanningEvidenceState, language: 'en' | 'es'): string {
  if (state.retrieval === 'checking') return language === 'es' ? 'La búsqueda no ha terminado.' : 'The search has not finished.';
  if (state.retrieval === 'not-attempted') return language === 'es' ? 'Estas ideas aún no se han comprobado.' : 'These ideas have not been checked yet.';
  switch (state.reason) {
    case 'auth_required': return planningRequiresSignIn(state)
      ? language === 'es' ? 'Inicia sesión para ver experiencias reservables. Las ideas locales siguen disponibles.' : 'Sign in to see bookable experiences. Local ideas remain available.'
      : language === 'es' ? 'Las experiencias reservables no están disponibles ahora.' : 'Bookable experiences are unavailable right now.';
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

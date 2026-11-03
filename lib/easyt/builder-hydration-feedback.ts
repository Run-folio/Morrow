export type BuilderHydrationIssue = 'unavailable' | 'protected' | 'unknown';

/** Presentation only: neither a failed device read nor an exception proves
 * that a different account owns the trip. Admission remains with its guard. */
export function builderHydrationFeedback(issue: BuilderHydrationIssue, language: 'en' | 'es') {
  const es = language === 'es';
  return {
    title: issue === 'unavailable' ? es ? 'Almacenamiento del dispositivo no disponible' : 'Device storage unavailable'
      : issue === 'protected' ? es ? 'Las copias del dispositivo necesitan revisión' : 'Device copies need review'
        : es ? 'No se pudo abrir este viaje de forma segura' : 'This trip could not be opened safely',
    detail: issue === 'unavailable' ? es ? 'No pudimos comprobar la copia de este dispositivo. No se ha reemplazado ninguna copia del viaje.' : 'The device copy could not be checked. No trip copy has been replaced.'
      : issue === 'protected' ? es ? 'Las copias separadas siguen protegidas. No se ha elegido ninguna automáticamente.' : 'Separate device copies remain protected. No copy has been chosen automatically.'
        : es ? 'No se ha elegido ninguna copia automáticamente. Comprueba este navegador antes de volver a intentarlo.' : 'No trip copy has been chosen automatically. Check this browser before trying again.',
    safety: es ? 'Mantén esta pestaña abierta para conservar cualquier entrada sin guardar.' : 'Keep this tab open to preserve any unsaved input.',
  };
}

/** Reuse the already refused read's reason; this never changes admission. */
export function builderHydrationIssueFor(guardReason: string): BuilderHydrationIssue {
  if (guardReason === 'homepage-read-unavailable' || guardReason === 'recovery-read-unavailable') return 'unavailable';
  if (guardReason === 'homepage-read-protected' || guardReason === 'recovery-read-protected') return 'protected';
  return 'unknown';
}

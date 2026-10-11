/** Shared device/entry truth. Account ACK is emitted only by the exact canonical acknowledgement boundary. */
export type PersistenceOutcome = "device-confirmed" | "native-write-failed" | "protected-conflict" | "receipt-incomplete" | "pointer-incomplete" | "unknown" | "account-acknowledged";
export type RecoveryPersistenceEvidence = {
  stored: boolean;
  blockedByExistingRecovery?: boolean;
  failureReason?: string;
  nativeFailure?: "quota" | "security" | "unavailable" | "unknown";
  pointerAcknowledged?: boolean;
  recoveryDurable?: boolean;
  acknowledgement?: "pending" | "stale" | "storage" | "preservation" | "accepted";
  scopeMatches?: boolean;
  receiptPresent?: boolean;
};
export function recoveryPersistenceOutcome(result: RecoveryPersistenceEvidence): Exclude<PersistenceOutcome, "account-acknowledged"> {
  if (result.failureReason === "scope-mismatch" || result.blockedByExistingRecovery) return "protected-conflict";
  if (result.failureReason === "receipt-incomplete") return "receipt-incomplete";
  if (result.failureReason === "pointer-incomplete" || result.pointerAcknowledged === false && result.stored) return "pointer-incomplete";
  if (result.stored) return "device-confirmed";
  if (result.nativeFailure) return "native-write-failed";
  return "unknown";
}

export type PersistenceStage = "homepage-input" | "homepage-intake" | "homepage-preservation" | "homepage-resume" | "device-recovery" | "intake-ack" | "builder-entry" | "builder-edit" | "account-ack";
let sequence = 0;
/** Local event only: no identifiers, payloads, messages, tokens, storage values or remote telemetry. */
export function reportPersistenceOutcome(stage: PersistenceStage, result: RecoveryPersistenceEvidence) {
  const detail = {
    version: 1, sequence: ++sequence, stage, outcome: recoveryPersistenceOutcome(result),
    deviceCopyVerified: result.recoveryDurable === true || result.stored === true,
    pointerAcknowledged: result.pointerAcknowledged === true,
    nativeFailure: result.nativeFailure === "quota" || result.nativeFailure === "security" || result.nativeFailure === "unavailable" ? result.nativeFailure : result.nativeFailure ? "unknown" : null,
    acknowledgement: ["pending", "stale", "storage", "preservation", "accepted"].includes(result.acknowledgement ?? "") ? result.acknowledgement : null,
    scopeMatches: typeof result.scopeMatches === "boolean" ? result.scopeMatches : null,
    receiptPresent: typeof result.receiptPresent === "boolean" ? result.receiptPresent : null,
  };
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("morrovia-persistence-outcome", { detail }));
  return detail;
}

/** Call only after exact canonical ownership/content and recovery ACK checks succeed. */
export function reportExactAccountAcknowledgement() {
  const detail = { version: 1, sequence: ++sequence, stage: "account-ack", outcome: "account-acknowledged" };
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("morrovia-persistence-outcome", { detail }));
}

export function recoveryFailureMessage(result: RecoveryPersistenceEvidence, language: "en" | "es") {
  const outcome = recoveryPersistenceOutcome(result);
  if (outcome === "protected-conflict") return language === "es"
    ? "No pudimos sustituir esta copia de recuperación. Revisa la copia del dispositivo antes de continuar."
    : "This recovery copy could not be replaced safely. Review the device copy before continuing.";
  if (outcome === "receipt-incomplete" || outcome === "pointer-incomplete") return language === "es"
    ? "No pudimos confirmar la apertura de este viaje. Mantén esta pestaña abierta e inténtalo de nuevo."
    : "Opening this trip has not been confirmed. Keep this tab open and try again.";
  if (outcome === "native-write-failed") return language === "es"
    ? "No pudimos guardar en este dispositivo. Mantén esta pestaña abierta antes de salir."
    : "This device could not save the changes. Keep this tab open before leaving.";
  return language === "es"
    ? "No pudimos confirmar que estos cambios se guardaran. Mantén esta pestaña abierta e inténtalo de nuevo."
    : "These changes could not be confirmed as saved. Keep this tab open and try again.";
}

/** Shared device/entry truth. Account ACK is emitted only by the exact canonical acknowledgement boundary. */
export type PersistenceOutcome = "device-confirmed" | "native-write-failed" | "protected-conflict" | "receipt-incomplete" | "pointer-incomplete" | "unknown" | "account-acknowledged";
export type PersistenceFailureBoundary = "entry-scope" | "protected-recovery" | "recovery-write" | "recovery-readback" | "receipt-ack" | "receipt-readback" | "pointer-ack" | "unknown";
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
  phase?: "probe" | "result";
  writeAttempted?: boolean;
  readbackConfirmed?: boolean;
  failureBoundary?: PersistenceFailureBoundary;
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
const qaStages = new Set(["homepage-input", "homepage-intake", "homepage-preservation", "homepage-resume", "device-recovery", "intake-ack", "builder-entry", "builder-edit", "account-ack"]);
const qaOutcomes = new Set(["device-confirmed", "native-write-failed", "protected-conflict", "receipt-incomplete", "pointer-incomplete", "unknown", "account-acknowledged"]);
const qaBoundaries = new Set(["entry-scope", "protected-recovery", "recovery-write", "recovery-readback", "receipt-ack", "receipt-readback", "pointer-ack", "unknown"]);
const qaAcknowledgements = new Set(["pending", "stale", "storage", "preservation", "accepted"]);
const qaBoolean = (value: unknown) => typeof value === "boolean" ? value : null;
const qaCategory = (value: unknown, allowed: Set<string>, fallback: string | null) => typeof value === "string" && allowed.has(value) ? value : fallback;

/** QA console only. Closed schema; no storage, network, identifiers or raw errors. */
function reportQaConsole(detail: Record<string, unknown>, evidence?: RecoveryPersistenceEvidence) {
  try {
    if (process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS !== "1" || typeof window === "undefined"
      || window.location.origin !== "https://staging.morrovia.com") return;
    const params = new URLSearchParams(window.location.search);
    const common = {
      version: 1, kind: detail.kind === "ready" ? "ready" : "outcome",
      sequence: typeof detail.sequence === "number" && Number.isSafeInteger(detail.sequence) && detail.sequence >= 0 ? detail.sequence : null,
      buildMatch: true,
      queryKeys: { trip: params.has("trip"), recover: params.has("recover"), homeDraft: params.has("homeDraft"), handoff: params.has("handoff"), inspire: params.has("inspire") },
      // These are not supplied at the existing emitters. Do not guess them or
      // inspect session/profile/storage to fill the capture contract.
      sessionClass: "unknown", browserContextClass: "unknown",
    };
    const packet = detail.kind === "ready" ? common : {
      ...common,
      stage: qaCategory(detail.stage, qaStages, "unknown"),
      phase: detail.phase === "probe" ? "probe" : "result",
      outcome: qaCategory(detail.outcome, qaOutcomes, "unknown"),
      failureBoundary: qaCategory(detail.failureBoundary, qaBoundaries, null),
      writeAttempted: qaBoolean(evidence?.writeAttempted), writeAccepted: null,
      readbackConfirmed: qaBoolean(evidence?.readbackConfirmed),
      deviceCopyVerified: qaBoolean(evidence?.recoveryDurable) ?? (evidence?.stored === true ? true : null),
      pointerAcknowledged: qaBoolean(evidence?.pointerAcknowledged),
      nativeFailure: detail.nativeFailure === "quota" || detail.nativeFailure === "security" || detail.nativeFailure === "unavailable" || detail.nativeFailure === "unknown" ? detail.nativeFailure : null,
      acknowledgement: qaCategory(detail.acknowledgement, qaAcknowledgements, null),
      scopeMatches: qaBoolean(evidence?.scopeMatches), receiptPresent: qaBoolean(evidence?.receiptPresent),
      receiptAcknowledged: null, accountQueueEntered: null, httpStatusClass: null,
      accountAcknowledged: detail.stage === "account-ack" && detail.outcome === "account-acknowledged" ? true : null,
    };
    console.info("[morrovia-persistence-qa] " + JSON.stringify(packet));
  } catch { /* Diagnostic capture cannot change dispatch, saving or recovery. */ }
}

// Each fresh client document emits a ready delimiter before any submission.
// Sequence remains document-local; the observer must prove navigation capture.
reportQaConsole({ kind: "ready", sequence: 0 });

/** Local event only: no identifiers, payloads, messages, tokens, storage values or remote telemetry. */
export function reportPersistenceOutcome(stage: PersistenceStage, result: RecoveryPersistenceEvidence) {
  const phase = result.phase === "probe" ? "probe" : "result";
  const outcome = recoveryPersistenceOutcome(result);
  const suppliedBoundary = ["entry-scope", "protected-recovery", "recovery-write", "recovery-readback", "receipt-ack", "receipt-readback", "pointer-ack", "unknown"].includes(result.failureBoundary ?? "") ? result.failureBoundary : undefined;
  const failureBoundary = phase === "probe" || outcome === "device-confirmed" ? null
    : suppliedBoundary ?? (result.failureReason === "scope-mismatch" ? "entry-scope"
      : result.blockedByExistingRecovery ? "protected-recovery"
        : outcome === "pointer-incomplete" ? "pointer-ack"
          : outcome === "receipt-incomplete" ? "receipt-ack"
            : outcome === "native-write-failed" ? "recovery-write" : "unknown");
  const detail = {
    version: 1, sequence: ++sequence, stage, phase, outcome, failureBoundary,
    writeAttempted: typeof result.writeAttempted === "boolean" ? result.writeAttempted : null,
    readbackConfirmed: typeof result.readbackConfirmed === "boolean" ? result.readbackConfirmed : null,
    deviceCopyVerified: result.recoveryDurable === true || result.stored === true,
    pointerAcknowledged: result.pointerAcknowledged === true,
    nativeFailure: result.nativeFailure === "quota" || result.nativeFailure === "security" || result.nativeFailure === "unavailable" ? result.nativeFailure : result.nativeFailure ? "unknown" : null,
    acknowledgement: ["pending", "stale", "storage", "preservation", "accepted"].includes(result.acknowledgement ?? "") ? result.acknowledgement : null,
    scopeMatches: typeof result.scopeMatches === "boolean" ? result.scopeMatches : null,
    receiptPresent: typeof result.receiptPresent === "boolean" ? result.receiptPresent : null,
  };
  reportQaConsole(detail, result);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("morrovia-persistence-outcome", { detail }));
  return detail;
}

/** Call only after exact canonical ownership/content and recovery ACK checks succeed. */
export function reportExactAccountAcknowledgement() {
  const detail = { version: 1, sequence: ++sequence, stage: "account-ack", outcome: "account-acknowledged" };
  reportQaConsole(detail);
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

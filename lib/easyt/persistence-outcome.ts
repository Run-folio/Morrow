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
let preparationDepth=0;
/** Staged codec writes are not physical setter/readback evidence. */
export async function withPersistencePreparation<T>(work:()=>Promise<T>):Promise<T> {
  preparationDepth++;
  try{return await work();}finally{preparationDepth--;}
}
export type QaPersistenceStage = "hydration" | "intake" | "editable-input" | "recovery-preparation" | "native-write";
export type QaPersistenceBoundary = "hydration-ready" | "hydration-complete" | "intake-restore" | "intake-guard" | "intake-projection" | "intake-storage-access" | "intake-frozen" | "intake-reservation" | "editable-prepare" | "editable-reserved" | "editable-write" | "editable-readback" | "recovery-candidate" | "recovery-storage-access" | "recovery-driver-open" | "recovery-seed" | "recovery-scope" | "recovery-replacement" | "recovery-write" | "recovery-cleanup" | "recovery-readback";
export type QaEntryGuardReason = "owner-transition" | "requested-trip-missing" | "homepage-read-protected" | "homepage-read-unavailable"
  | "recovery-read-protected" | "recovery-read-unavailable" | "pending-receipt-protected"
  | "pending-continuation-protected" | "handoff-protected" | "entry-exception";
export type QaRecoveryCaller = "seed" | "autosave" | "preservation" | "other";
type QaEvidence = Partial<RecoveryPersistenceEvidence> & {
  accepted?: boolean; writeAccepted?: boolean;
  sessionClass?: "signed-in" | "guest" | "pending" | "unavailable";
  entryKind?: "loading" | "fresh" | "explicit-trip" | "current-draft" | "home-handoff" | "pending-home-handoff" | "pending-direct-intake" | "route-handoff" | "populated-builder" | "unavailable";
  guardReason?: QaEntryGuardReason;
  homepageReadReason?: string;
  caller?: QaRecoveryCaller; writeBranch?: "new-write" | "exact-reuse";
  readbackKind?: "editable-input" | "recovery" | "receipt";
  operation?: "setter" | "cleanup" | "write-result"; failedOperation?: "setter" | "cleanup";
  initialSetterFailure?: RecoveryPersistenceEvidence["nativeFailure"];
  setterFailure?: RecoveryPersistenceEvidence["nativeFailure"]; cleanupFailure?: RecoveryPersistenceEvidence["nativeFailure"];
  setterRetried?: boolean;
  driverFailure?: "quota" | "security" | "unavailable" | "blocked" | "abort" | "schema" | "corrupt" | "readback" | "unknown";
};
let qaSequence = 0, qaSessionClass = "unknown", qaEntryKind = "unknown";
const qaStages = new Set(["homepage-input", "homepage-intake", "homepage-preservation", "homepage-resume", "device-recovery", "intake-ack", "builder-entry", "builder-edit", "account-ack", "hydration", "intake", "editable-input", "recovery-preparation", "native-write"]);
const qaOutcomes = new Set(["device-confirmed", "native-write-failed", "protected-conflict", "receipt-incomplete", "pointer-incomplete", "unknown", "account-acknowledged", "accepted", "refused"]);
const qaBoundaries = new Set(["entry-scope", "protected-recovery", "recovery-write", "recovery-readback", "receipt-ack", "receipt-readback", "pointer-ack", "unknown"]);
const qaAcknowledgements = new Set(["pending", "stale", "storage", "preservation", "accepted"]);
const qaProducerBoundaries = new Set(["hydration-ready", "hydration-complete", "intake-restore", "intake-guard", "intake-projection", "intake-storage-access", "intake-frozen", "intake-reservation", "editable-prepare", "editable-reserved", "editable-write", "editable-readback", "recovery-candidate", "recovery-storage-access", "recovery-driver-open", "recovery-seed", "recovery-scope", "recovery-replacement", "recovery-write", "recovery-cleanup", "recovery-readback"]);
const qaDriverFailures = new Set(["quota", "security", "unavailable", "blocked", "abort", "schema", "corrupt", "readback", "unknown"]);
const qaSessions = new Set(["signed-in", "guest", "pending", "unavailable"]);
const qaEntries = new Set(["loading", "fresh", "explicit-trip", "current-draft", "home-handoff", "pending-home-handoff", "pending-direct-intake", "route-handoff", "populated-builder", "unavailable"]);
const qaEntryGuardReasons = new Set(["owner-transition", "requested-trip-missing", "homepage-read-protected", "homepage-read-unavailable", "recovery-read-protected", "recovery-read-unavailable", "pending-receipt-protected", "pending-continuation-protected", "handoff-protected", "entry-exception"]);
// Only the finite reasons returned by the durable Homepage reader and its
// entry/claim barriers. Never forward raw storage values or exception text.
const qaHomepageReadReasons = new Set([
  "operation-changed", "scope", "admission", "head-changed", "immutable-collision", "ack-mismatch",
  "schema", "corrupt", "entry-changed", "entry-readback-unknown",
  "native-claim-unqualified", "native-claim-enumeration-unknown", "claim-enumeration-unavailable", "claim-enumeration-unknown",
  "claim-canonical-unknown", "claim-read-unknown", "claim-proof-missing", "claim-proof-payload", "claim-source-pending",
  "claim-owner", "claim-pending", "claim-source-changed", "claim-set-changed", "claim-verification-unknown",
  "native-payload", "native-bundle-invalid", "native-input-invalid", "native-draft-invalid", "native-foreign-pending-envelope",
  "native-divergence", "native-read-unknown", "payload", "storage-access",
  "quota", "security", "unavailable", "blocked", "abort", "readback", "unknown",
]);
const qaCallers = new Set(["seed", "autosave", "preservation", "other"]), qaWriteBranches = new Set(["new-write", "exact-reuse"]);
const qaReadbacks = new Set(["editable-input", "recovery", "receipt"]), qaNativeFailures = new Set(["quota", "security", "unavailable", "unknown"]);
const qaOperations = new Set(["setter", "cleanup", "write-result"]), qaFailedOperations = new Set(["setter", "cleanup"]);
const qaBoolean = (value: unknown) => typeof value === "boolean" ? value : null;
const qaCategory = (value: unknown, allowed: Set<string>, fallback: string | null) => typeof value === "string" && allowed.has(value) ? value : fallback;
function qaEnabled() {
  try { return process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS === "1" && typeof window !== "undefined" && window.location.origin === "https://staging.morrovia.com"; }
  catch { return false; }
}

/** QA console only. Closed schema; no storage, network, identifiers or raw errors. */
function reportQaConsole(detail: Record<string, unknown>, evidence?: QaEvidence, legacyStage?: PersistenceStage) {
  try {
    if (!qaEnabled()) return;
    const params = new URLSearchParams(window.location.search);
    const readbackKind = legacyStage ? evidence?.failureBoundary === "receipt-ack" || evidence?.failureBoundary === "receipt-readback" ? "receipt"
      : legacyStage === "device-recovery" || legacyStage === "builder-entry" || legacyStage === "builder-edit" || legacyStage === "intake-ack" && evidence?.failureReason !== "receipt-incomplete" ? "recovery" : undefined : undefined;
    if (evidence?.sessionClass !== undefined) qaSessionClass = qaCategory(evidence.sessionClass, qaSessions, "unknown")!;
    if (evidence?.entryKind !== undefined) qaEntryKind = qaCategory(evidence.entryKind, qaEntries, "unknown")!;
    const common = {
      version: 2, kind: detail.kind === "ready" ? "ready" : "outcome",
      sequence: detail.kind === "ready" ? 0 : ++qaSequence,
      buildMatch: true,
      queryKeys: { trip: params.has("trip"), recover: params.has("recover"), homeDraft: params.has("homeDraft"), handoff: params.has("handoff"), inspire: params.has("inspire") },
      sessionClass: qaSessionClass, browserContextClass: "unknown", entryKind: qaEntryKind,
    };
    const packet = detail.kind === "ready" ? common : {
      ...common,
      stage: qaCategory(detail.stage, qaStages, "unknown"),
      boundary: qaCategory(detail.boundary, qaProducerBoundaries, null), accepted: qaBoolean(evidence?.accepted),
      guardReason: qaCategory(evidence?.guardReason, qaEntryGuardReasons, null),
      homepageReadReason: qaCategory(evidence?.homepageReadReason, qaHomepageReadReasons, null),
      caller: qaCategory(evidence?.caller, qaCallers, null),
      writeBranch: qaCategory(evidence?.writeBranch, qaWriteBranches, null),
      readbackKind: qaCategory(readbackKind ?? evidence?.readbackKind, qaReadbacks, null),
      operation: qaCategory(evidence?.operation, qaOperations, null), failedOperation: qaCategory(evidence?.failedOperation, qaFailedOperations, null),
      initialSetterFailure: evidence?.initialSetterFailure === undefined ? null : qaCategory(evidence.initialSetterFailure, qaNativeFailures, "unknown"),
      setterFailure: evidence?.setterFailure === undefined ? null : qaCategory(evidence.setterFailure, qaNativeFailures, "unknown"),
      cleanupFailure: evidence?.cleanupFailure === undefined ? null : qaCategory(evidence.cleanupFailure, qaNativeFailures, "unknown"),
      setterRetried: qaBoolean(evidence?.setterRetried),
      driverFailure: qaCategory(evidence?.driverFailure, qaDriverFailures, null),
      phase: detail.phase === "probe" ? "probe" : "result",
      outcome: qaCategory(detail.outcome, qaOutcomes, "unknown"),
      failureBoundary: qaCategory(detail.failureBoundary, qaBoundaries, null),
      writeAttempted: qaBoolean(evidence?.writeAttempted), writeAccepted: qaBoolean(evidence?.writeAccepted),
      readbackConfirmed: qaBoolean(evidence?.readbackConfirmed),
      deviceCopyVerified: qaBoolean(evidence?.recoveryDurable) ?? (evidence?.stored === true ? true : null),
      pointerAcknowledged: legacyStage && evidence?.pointerAcknowledged === false && (evidence.failureBoundary === "recovery-write" || evidence.failureBoundary === "recovery-readback")
        ? null : qaBoolean(evidence?.pointerAcknowledged),
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

/** Diagnostic-only accepted/refused prerequisite, with a separate console counter. */
export function reportQaPersistenceBoundary(stage: QaPersistenceStage, boundary: QaPersistenceBoundary, evidence: QaEvidence) {
  try {
    if(preparationDepth)return;
    if (!qaEnabled()) return;
    const accepted = qaBoolean(evidence.accepted);
    reportQaConsole({ stage, boundary, phase: evidence.phase,
      outcome: accepted === true ? "accepted" : accepted === false ? "refused" : "unknown",
      nativeFailure: evidence.nativeFailure ? qaCategory(evidence.nativeFailure, qaNativeFailures, "unknown") : null,
      acknowledgement: evidence.acknowledgement,
    }, evidence);
  } catch { /* Never turn an observation into a persistence decision. */ }
}

/** No arbitrary exception text or getter failure may escape diagnostic capture. */
export function qaNativeFailureCategory(error: unknown): "quota" | "security" | "unavailable" | "unknown" {
  try {
    if (!qaEnabled()) return "unknown";
    const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014 ? "quota"
      : name === "SecurityError" ? "security" : name === "InvalidStateError" ? "unavailable" : "unknown";
  } catch { return "unknown"; }
}

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
  reportQaConsole(detail, result, stage);
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

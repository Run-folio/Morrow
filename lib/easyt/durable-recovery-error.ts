import type { CommitStatus, RecoveryFailureReason } from './durable-recovery-domain.ts';

export class RecoveryDomainError extends Error {
  readonly reason: RecoveryFailureReason;
  readonly commitStatus: CommitStatus;
  constructor(reason: RecoveryFailureReason, commitStatus: CommitStatus = 'unconfirmed') {
    super(`Recovery domain: ${reason}`); this.name = 'RecoveryDomainError'; this.reason = reason; this.commitStatus = commitStatus;
  }
}
export function recoveryErrorReason(error: unknown): RecoveryFailureReason {
  if (error instanceof RecoveryDomainError) return error.reason;
  const name = error && typeof error === 'object' && 'name' in error ? error.name : null;
  switch (name) {
    case 'QuotaExceededError': return 'quota';
    case 'SecurityError': return 'security';
    case 'InvalidStateError': case 'NotFoundError': return 'unavailable';
    case 'AbortError': return 'abort';
    case 'VersionError': return 'schema';
    default: return 'unknown';
  }
}

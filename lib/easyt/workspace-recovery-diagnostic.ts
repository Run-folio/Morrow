// Closed, ephemeral support codes only. No error objects, identifiers, payloads,
// storage, logging or network sinks belong in this module.
const phases = ['guest-read','explicit-save','owner-workspace-read'] as const;
export type WorkspaceRefusalPhase = typeof phases[number];
const slots = ['trip','input','homepage','current-operation'] as const;
const readKinds = ['found','missing','ready','protected','unavailable','not-current','acknowledged','foreign','conflict'] as const;
export type GuestSourceObservation = Readonly<{slot:typeof slots[number];readKind:typeof readKinds[number]}>;
// Exact codes produced by the existing readers and explicit-save preparation.
// New/unknown reasons deliberately collapse to a fixed fallback.
const codes = [
  'operation-changed','native-storage-access','current-unconfirmed','guest-source-not-ready','guest-native-changed',
  'destination-exists','destination-input-exists','guest-source-changed','account-ack-mismatch',
  'owner-required','source-not-guest','source-envelope-invalid','source-trip-unsupported','claim-inputs-unsupported',
  'builder-input-required','builder-input-changed','builder-input-unsupported','builder-input-revision-mismatch','builder-input-rebound-invalid',
  'homepage-required','homepage-unsupported','homepage-pending','homepage-unassociated','homepage-trip-mismatch',
  'homepage-semantic-proof-required','homepage-semantic-mismatch','homepage-receipt-mismatch','homepage-route-review-unsupported',
  'homepage-supporting-draft-required','homepage-review-mismatch','homepage-rebound-invalid','homepage-receipt-unsupported',
  'scope','admission','head-changed','immutable-collision','ack-mismatch','schema','corrupt','entry-changed','entry-readback-unknown',
  'native-claim-unqualified','native-claim-enumeration-unknown','claim-enumeration-unavailable','claim-enumeration-unknown',
  'claim-canonical-unknown','claim-read-unknown','claim-proof-missing','claim-proof-payload','claim-source-pending',
  'claim-owner','claim-pending','claim-source-changed','claim-set-changed','claim-verification-unknown',
  'native-payload','native-bundle-invalid','native-input-invalid','native-draft-invalid','native-foreign-pending-envelope',
  'native-divergence','native-read-unknown','payload','storage-access','quota','security','blocked','abort','readback','unknown',
  'cache-divergence','cache-changed','cache-read-unknown','cache-document','native-changed',
  'current-divergence','current-changed','current-pointer','domain-operation-required',
  'unavailable','other-protected',
] as const;
export type WorkspaceRefusalDiagnostic = Readonly<{phase:WorkspaceRefusalPhase;code:typeof codes[number];source?:GuestSourceObservation}>;
function category<T extends string>(value:unknown,allowed:readonly T[]):T|undefined {
  return typeof value==='string'&&allowed.includes(value as T)?value as T:undefined;
}
export function guestSourceObservation(slot:unknown,readKind:unknown):GuestSourceObservation|undefined {
  const checkedSlot=category(slot,slots),checkedKind=category(readKind,readKinds);
  return checkedSlot&&checkedKind?Object.freeze({slot:checkedSlot,readKind:checkedKind}):undefined;
}
export function workspaceRefusalDiagnostic(phase:unknown,refusal:unknown):WorkspaceRefusalDiagnostic {
  const checkedPhase=category(phase,phases)??'owner-workspace-read';
  try {
    const error=refusal as {kind?:unknown;reason?:unknown;sourceObservation?:GuestSourceObservation}|null;
    const code=category(error?.reason,codes)??(error?.kind==='protected'?'other-protected':'unavailable');
    const observed=code==='guest-source-not-ready'?error?.sourceObservation:undefined;
    const source=observed&&guestSourceObservation(observed.slot,observed.readKind);
    return Object.freeze({phase:checkedPhase,code,...(source?{source}:{})});
  } catch {return Object.freeze({phase:checkedPhase,code:'unavailable'});}
}
/** The Next build already enforces exact-SHA opt-in; also fence the UI origin. */
export function workspaceRefusalSupportCode(packet:WorkspaceRefusalDiagnostic):string|null {
  try {
    if(process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS!=='1'||typeof window==='undefined'
      ||window.location.origin!=='https://staging.morrovia.com')return null;
    const safe=workspaceRefusalDiagnostic(packet.phase,{reason:packet.code,sourceObservation:packet.source});
    return `${safe.phase} / ${safe.code}${safe.source?` / ${safe.source.slot}:${safe.source.readKind}`:''}`;
  } catch {return null;}
}

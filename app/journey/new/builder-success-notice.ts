/** Builder-only feedback. The authoritative owners still handle save, route, and recovery. */
export const BUILDER_NOTICE_DURATION_MS = 4_000;
export type BuilderNoticePhase = 'idle' | 'pending' | 'success' | 'error';
export type BuilderNoticeKind = 'save' | 'route';
type NoticeKey = string | number;
type Observation = { phase: BuilderNoticePhase; key: NoticeKey | undefined };
type Stream = Observation & { armed: boolean; consumedKey?: NoticeKey };
type Notice = { kind: BuilderNoticeKind; expiresAt: number };
export type BuilderNoticeInput = {
  scopeKey: string;
  save?: BuilderNoticePhase;
  route?: BuilderNoticePhase;
  saveKey?: NoticeKey;
  routeKey?: NoticeKey;
  undoActive?: boolean;
  blocked?: boolean;
};
type State = { scopeKey: string; save: Stream; route: Stream; notice: Notice | null };

const observe = (phase: BuilderNoticePhase = 'idle', key?: NoticeKey): Observation => ({ phase, key });

export function startBuilderNotice(input: BuilderNoticeInput): State {
  return {
    scopeKey: input.scopeKey,
    save: { ...observe(input.save, input.saveKey), armed: false, consumedKey: input.save === 'success' ? input.saveKey : undefined },
    route: { ...observe(input.route, input.routeKey), armed: false, consumedKey: input.route === 'success' ? input.routeKey : undefined },
    notice: null,
  };
}

export function builderNoticeSuppressed(input: BuilderNoticeInput) {
  return Boolean(input.blocked || input.undoActive || input.save === 'pending' || input.route === 'pending'
    || input.save === 'error' || input.route === 'error');
}

function advanceStream(previous: Stream, current: Observation, interrupted: boolean) {
  const terminalSuccess = current.phase === 'success' && previous.phase === 'pending';
  const key = current.key ?? previous.key;
  const fresh = terminalSuccess && previous.armed && (key === undefined || previous.consumedKey !== key);
  const consumedKey = terminalSuccess && key !== undefined ? key : previous.consumedKey;
  const armed = current.phase === 'pending' && !interrupted
    && (previous.phase !== 'pending' || previous.armed || previous.key !== current.key);
  return { stream: { ...current, armed, consumedKey }, fresh };
}

export function advanceBuilderNotice(state: State, input: BuilderNoticeInput, now: number): State {
  if (state.scopeKey !== input.scopeKey) return startBuilderNotice(input);
  const interrupted = Boolean(input.blocked || input.undoActive || input.save === 'error' || input.route === 'error');
  const save = advanceStream(state.save, observe(input.save, input.saveKey), interrupted);
  const route = advanceStream(state.route, observe(input.route, input.routeKey), interrupted);
  const suppressed = builderNoticeSuppressed(input);
  const success = route.fresh ? 'route' : save.fresh ? 'save' : null;
  const notice: Notice | null = suppressed ? null
    : success ? { kind: success, expiresAt: now + BUILDER_NOTICE_DURATION_MS }
    : state.notice && state.notice.expiresAt > now ? state.notice : null;
  return { scopeKey: input.scopeKey, save: save.stream, route: route.stream, notice };
}

/** Identity prevents an old timer from dismissing a replacement notice. */
export function expireBuilderNotice(state: State, notice: Notice, now: number): State {
  return state.notice === notice && now >= notice.expiresAt ? { ...state, notice: null } : state;
}

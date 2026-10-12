import { decodeDomainHead, recoveryScopeKey, recoveryGenerationKey, type RecoveryDomainDriver,
  type RecoveryDomainState, type RecoveryDomainDecision, type RecoveryScope } from './durable-recovery-domain.ts';
import { RecoveryDomainError, recoveryErrorReason } from './durable-recovery-error.ts';

const STORES = ['generations', 'heads', 'acknowledgements'];
const DATABASE_NAME = 'morrovia-recovery-domain-v1';

/** Factory is explicit: importing this module never opens a database or reads
 * global/profile storage. No schema migration, deletion or relaxed-write retry. */
export async function openIndexedDbRecoveryDriver(factory: IDBFactory | undefined, options: { name?: string; timeoutMs?: number } = {}): Promise<RecoveryDomainDriver> {
  if (!factory) throw new RecoveryDomainError('unavailable', 'not-started');
  const name = options.name ?? DATABASE_NAME, timeoutMs = options.timeoutMs ?? 5000;
  if (!name.trim() || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid recovery database options');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false, request: IDBOpenDBRequest;
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
    const timer = setTimeout(() => fail(new RecoveryDomainError('unavailable', 'unconfirmed')), timeoutMs);
    try { request = factory.open(name, 1); } catch (error) { fail(new RecoveryDomainError(recoveryErrorReason(error), 'not-started')); return; }
    request.onblocked = () => fail(new RecoveryDomainError('blocked', 'not-started'));
    request.onerror = () => fail(new RecoveryDomainError(recoveryErrorReason(request.error), 'not-started'));
    request.onupgradeneeded = event => {
      if (settled || event.oldVersion !== 0) { request.transaction?.abort(); fail(new RecoveryDomainError('schema', 'not-committed')); return; }
      try { for (const store of STORES) request.result.createObjectStore(store); }
      catch (error) { request.transaction?.abort(); fail(new RecoveryDomainError(recoveryErrorReason(error), 'not-committed')); }
    };
    request.onsuccess = () => {
      const opened = request.result;
      if (settled) { opened.close(); return; }
      if (opened.version !== 1 || opened.objectStoreNames.length !== STORES.length || STORES.some(store => !opened.objectStoreNames.contains(store))) {
        opened.close(); fail(new RecoveryDomainError('schema', 'not-started')); return;
      }
      settled = true; clearTimeout(timer); resolve(opened);
    };
  });
  let closed = false;
  const close = () => { closed = true; db.close(); };
  db.onversionchange = close;
  db.onclose = () => { closed = true; };
  return {
    close,
    run<T>(scope: RecoveryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryDomainState) => RecoveryDomainDecision<T>): Promise<T> {
      if (closed) return Promise.reject(new RecoveryDomainError('unavailable', 'not-started'));
      return new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try { tx = db.transaction(STORES, mode, mode === 'readwrite' ? { durability: 'strict' } : {}); }
        catch (error) { reject(new RecoveryDomainError(recoveryErrorReason(error), 'not-started')); return; }
        let settled = false, decision: RecoveryDomainDecision<T> | undefined, caught: unknown;
        const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
        const abort = (error: unknown) => { caught = error; try { tx.abort(); } catch { fail(new RecoveryDomainError(recoveryErrorReason(error), 'unconfirmed')); } };
        const timer = setTimeout(() => abort(new RecoveryDomainError('unavailable', 'unconfirmed')), timeoutMs);
        tx.onabort = () => fail(new RecoveryDomainError(recoveryErrorReason(caught ?? tx.error ?? new DOMException('Aborted', 'AbortError')), 'not-committed'));
        tx.onerror = () => { caught ??= tx.error; };
        tx.oncomplete = () => {
          if (settled) return;
          if (!decision) { fail(new RecoveryDomainError('unknown', 'unconfirmed')); return; }
          settled = true; clearTimeout(timer); resolve(decision.value);
        };
        if (mode === 'readwrite' && tx.durability !== 'strict') { abort(new RecoveryDomainError('unavailable', 'not-committed')); return; }
        const state: RecoveryDomainState = { headRaw: undefined, headGenerationRaw: undefined, generationRaw: undefined, acknowledgementRaw: undefined };
        let pending = 0;
        const finishReads = () => {
          if (pending || decision || settled) return;
          try {
            decision = decide(state);
            if (decision && typeof decision === 'object' && 'then' in decision) throw new TypeError('Async transaction decision');
            const writes = decision.headRaw !== undefined || decision.generationRaw !== undefined || decision.acknowledgementRaw !== undefined;
            if (mode !== 'readwrite' && writes) throw new TypeError('Readonly transaction mutation');
            if (decision.generationRaw !== undefined || decision.acknowledgementRaw !== undefined) {
              if (writeId === null) throw new TypeError('Missing immutable write identity');
              const key = recoveryGenerationKey(scope, writeId);
              if (decision.generationRaw !== undefined) observe(tx.objectStore('generations').add(decision.generationRaw, key));
              if (decision.acknowledgementRaw !== undefined) observe(tx.objectStore('acknowledgements').add(decision.acknowledgementRaw, key));
            }
            if (decision.headRaw !== undefined) observe(tx.objectStore('heads').put(decision.headRaw, recoveryScopeKey(scope)));
          } catch (error) { abort(error); }
        };
        const observe = (request: IDBRequest) => { request.onerror = () => { caught = request.error; }; };
        const read = (store: string, key: string, receive: (raw: unknown) => void) => {
          pending++;
          const request = tx.objectStore(store).get(key); observe(request);
          request.onsuccess = () => {
            try { receive(request.result); pending--; finishReads(); }
            catch (error) { abort(error); }
          };
        };
        try {
          read('heads', recoveryScopeKey(scope), headRaw => {
            state.headRaw = headRaw;
            const decoded = decodeDomainHead(headRaw, scope);
            const head = decoded.kind === 'readable' ? decoded.value : null;
            const selected = writeId ?? head?.writeId;
            if (selected) {
              read('generations', recoveryGenerationKey(scope, selected), raw => { state.generationRaw = raw; if (head?.writeId === selected) state.headGenerationRaw = raw; });
              read('acknowledgements', recoveryGenerationKey(scope, selected), raw => { state.acknowledgementRaw = raw; });
            }
            if (head && head.writeId !== selected) read('generations', recoveryGenerationKey(scope, head.writeId), raw => { state.headGenerationRaw = raw; });
          });
        } catch (error) { abort(error); }
      });
    },
  };
}

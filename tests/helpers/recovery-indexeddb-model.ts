/** Minimal event/transaction model used to execute our native API adapter.
 * Deliberately not a browser engine, quota measurement or native durability proof. */
class RequestModel {
  result: unknown; error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
}
class TransactionModel {
  oncomplete: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  error: DOMException | null = null;
  readonly durability: string;
  private pending = 0;
  private finished = false;
  private aborted = false;
  private readonly staged: Map<string, Map<string, unknown>>;
  private readonly factory: IndexedDbModel;
  readonly mode: IDBTransactionMode;
  constructor(factory: IndexedDbModel, mode: IDBTransactionMode, options?: IDBTransactionOptions) {
    this.factory = factory; this.mode = mode;
    this.durability = factory.strictSupported ? options?.durability ?? 'default' : 'relaxed';
    this.staged = new Map([...factory.data].map(([name, data]) => [name, new Map(data)]));
  }
  abort() {
    if (this.finished) throw new DOMException('Finished', 'InvalidStateError');
    if (this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => { this.finished = true; this.onabort?.(new Event('abort')); });
  }
  complete() {
    if (this.aborted || this.finished || this.pending) return;
    if (this.mode === 'readwrite') this.factory.data = this.staged;
    this.finished = true; this.oncomplete?.(new Event('complete'));
  }
  private request(operation: () => unknown, failure?: DOMException) {
    const request = new RequestModel(); this.pending++;
    queueMicrotask(() => {
      if (this.aborted) { this.pending--; return; }
      if (failure) {
        request.error = failure; this.error = failure; request.onerror?.(new Event('error'));
        this.onerror?.(new Event('error')); this.pending--; this.abort(); return;
      }
      request.result = operation(); request.onsuccess?.(new Event('success')); this.pending--;
      queueMicrotask(() => {
        if (this.pending || this.aborted || this.finished) return;
        if (this.mode === 'readwrite' && this.factory.holdCompletion) this.factory.pendingCompletion = () => this.complete();
        else this.complete();
      });
    });
    return request as unknown as IDBRequest;
  }
  objectStore(name: string) {
    const values = this.staged.get(name); if (!values) throw new DOMException('Missing store', 'NotFoundError');
    const mutate = (value: unknown, key: string, immutable: boolean) => {
      if (this.mode !== 'readwrite') throw new DOMException('Readonly', 'ReadOnlyError');
      const failure = this.factory.failAddStore === name ? new DOMException('Synthetic quota', 'QuotaExceededError')
        : immutable && values.has(key) ? new DOMException('Duplicate', 'ConstraintError') : undefined;
      return this.request(() => { values.set(key, value); return key; }, failure);
    };
    return { get: (key: string) => this.request(() => values.get(key)),
      add: (value: unknown, key: string) => mutate(value, key, true), put: (value: unknown, key: string) => mutate(value, key, false) };
  }
}
export class IndexedDbModel {
  data = new Map<string, Map<string, unknown>>([['generations', new Map()], ['heads', new Map()], ['acknowledgements', new Map()]]);
  strictSupported = true;
  holdCompletion = false;
  pendingCompletion: (() => void) | null = null;
  failAddStore: string | null = null;
  openMode: 'success' | 'blocked' | 'future' | 'new' = 'success';
  closed = 0; upgradeAborts = 0; createdStores = 0;
  versionChange: (() => void) | null = null;
  lateSuccess: (() => void) | null = null;
  factory(): IDBFactory {
    const factory = this;
    const db = {
      version: 1,
      get objectStoreNames() { const names = [...factory.data.keys()]; return { length: names.length, contains: (name: string) => names.includes(name) }; },
      createObjectStore(name: string) { factory.createdStores++; factory.data.set(name, new Map()); return {}; },
      close() { factory.closed++; },
      set onversionchange(callback: (() => void) | null) { factory.versionChange = callback; },
      onclose: null,
      transaction(_stores: string[], mode: IDBTransactionMode, options?: IDBTransactionOptions) { return new TransactionModel(factory, mode, options); },
    };
    return { open() {
      const request = new RequestModel() as RequestModel & {
        onblocked?: (event: Event) => void; onupgradeneeded?: (event: IDBVersionChangeEvent) => void; transaction: { abort(): void };
      };
      request.result = db; request.transaction = { abort() { factory.upgradeAborts++; } };
      factory.lateSuccess = () => { request.onupgradeneeded?.({ oldVersion: 0 } as IDBVersionChangeEvent); request.onsuccess?.(new Event('success')); };
      queueMicrotask(() => {
        if (factory.openMode === 'blocked') request.onblocked?.(new Event('blocked'));
        else if (factory.openMode === 'future') { request.error = new DOMException('Newer schema', 'VersionError'); request.onerror?.(new Event('error')); }
        else {
          if (factory.openMode === 'new') { factory.data.clear(); request.onupgradeneeded?.({ oldVersion: 0 } as IDBVersionChangeEvent); }
          request.onsuccess?.(new Event('success'));
        }
      });
      return request;
    } } as unknown as IDBFactory;
  }
}

export type StoryStorageFault = 'getter' | 'read' | 'write';
type StorageOwner = { previous: PropertyDescriptor | undefined; active: boolean };
const owners = new WeakMap<() => Storage, StorageOwner>();
function activeDescriptor(candidate: PropertyDescriptor | undefined): PropertyDescriptor | undefined {
  let owner = candidate?.get ? owners.get(candidate.get) : undefined;
  while (owner && !owner.active) {
    candidate = owner.previous;
    owner = candidate?.get ? owners.get(candidate.get) : undefined;
  }
  return candidate;
}
/** Scope a browser-policy failure to one story and restore its exact descriptor. */
export function installStoryStorageFault(mode: StoryStorageFault, host: Pick<Window, 'localStorage'> = window) {
  const previous = Object.getOwnPropertyDescriptor(host, 'localStorage');
  // Never inspect or modify an existing Storybook visitor's saved values.
  const values = new Map<string, string>();
  const native: Storage = {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, raw) => { values.set(key, raw); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(),
  };
  const denied = () => { throw new DOMException(`Synthetic denied storage ${mode}`, 'SecurityError'); };
  const value: Storage = {
    get length() { return native.length; },
    key: index => native.key(index),
    getItem: key => mode === 'read' ? denied() : native.getItem(key),
    setItem: (key, raw) => mode === 'write' ? denied() : native.setItem(key, raw),
    removeItem: key => native.removeItem(key),
    clear: () => native.clear(),
  };
  const get = () => mode === 'getter' ? denied() : value;
  const owner = { previous, active: true };
  owners.set(get, owner);
  Object.defineProperty(host, 'localStorage', { configurable: true, get });
  return () => {
    owner.active = false;
    if (Object.getOwnPropertyDescriptor(host, 'localStorage')?.get !== get) return;
    const restore = activeDescriptor(previous);
    if (restore) Object.defineProperty(host, 'localStorage', restore);
    else Reflect.deleteProperty(host, 'localStorage');
  };
}

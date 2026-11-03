export type StoryStorageFault = 'getter' | 'read' | 'write';
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
  Object.defineProperty(host, 'localStorage', { configurable: true, get });
  return () => {
    if (Object.getOwnPropertyDescriptor(host, 'localStorage')?.get !== get) return;
    if (previous) Object.defineProperty(host, 'localStorage', previous);
    else Reflect.deleteProperty(host, 'localStorage');
  };
}

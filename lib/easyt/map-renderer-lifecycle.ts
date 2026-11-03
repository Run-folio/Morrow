const webgl2Support = new WeakMap<Document, boolean>();

/** Probe once per document, releasing the temporary GPU context. This avoids
 * constructing MapLibre at all on unsupported browsers (its early-return path
 * registers internal resources that its normal removal cannot safely retire). */
function supportsWebGL2(document: Document) {
  const known = webgl2Support.get(document);
  if (known !== undefined) return known;
  const canvas = document.createElement('canvas');
  let supported = false;
  try {
    const context = canvas.getContext('webgl2');
    supported = Boolean(context && !context.isContextLost());
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* Blocked GPU access is an unavailable map, not a journey error. */ }
  finally { canvas.remove(); }
  webgl2Support.set(document, supported);
  return supported;
}

/** MapLibre may return a partial Map after firing a GPU initialization error.
 * Admit only its actual WebGL2 renderer; never expose the partial object to
 * projection, controls or normal remove(). The disposable host owns every DOM
 * node/listener allocated before that early constructor return. */
export function createMapRenderer<T extends {
  getCanvas(): { getContext(type: 'webgl2'): { isContextLost(): boolean } | null };
  remove(): void;
}>(container: HTMLElement, canvasClassName: string, create: (host: HTMLDivElement) => T):
  | { kind: 'unavailable'; error: unknown }
  | { kind: 'ready'; map: T; dispose: () => { kind: 'removed' } | { kind: 'failed'; error: unknown } } {
  if (!supportsWebGL2(container.ownerDocument)) return { kind: 'unavailable', error: new Error('WebGL2 unavailable in this browser') };
  const host = container.ownerDocument.createElement('div');
  host.className = canvasClassName;
  container.appendChild(host);
  try {
    const map = create(host);
    const context = map.getCanvas().getContext('webgl2');
    if (!context) {
      host.remove();
      return { kind: 'unavailable', error: new Error('WebGL2 renderer unavailable') };
    }
    if (context.isContextLost()) {
      try { map.remove(); } catch { /* Detach the owned host even if disposal fails. */ }
      host.remove();
      return { kind: 'unavailable', error: new Error('WebGL2 context lost during initialization') };
    }
    let disposed = false;
    return { kind: 'ready', map, dispose: () => {
      if (disposed) return { kind: 'removed' };
      disposed = true;
      try { map.remove(); return { kind: 'removed' }; }
      catch (error) { return { kind: 'failed', error }; }
      finally { host.remove(); }
    } };
  } catch (error) {
    host.remove();
    return { kind: 'unavailable', error };
  }
}

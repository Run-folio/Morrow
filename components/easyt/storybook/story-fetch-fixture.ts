export type StoryFetchHandler = (input: RequestInfo | URL, init: RequestInit | undefined, forward: typeof fetch) => Promise<Response>;
/** Story-owned HTTP replacement. It never overrides a later fixture on cleanup. */
export function installStoryFetch(handler: StoryFetchHandler, host: Pick<Window, 'fetch'> = window): () => void {
  const previous = host.fetch;
  const forward: typeof fetch = (input, init) => previous.call(host, input, init);
  const owned: typeof fetch = (input, init) => handler(input, init, forward);
  host.fetch = owned;
  return () => { if (host.fetch === owned) host.fetch = previous; };
}

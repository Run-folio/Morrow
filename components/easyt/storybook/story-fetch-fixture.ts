export type StoryFetchHandler = (input: RequestInfo | URL, init: RequestInit | undefined, forward: typeof fetch) => Promise<Response>;
type FetchOwner = { previous: typeof fetch; active: boolean };
const owners = new WeakMap<typeof fetch, FetchOwner>();
function activeFetch(candidate: typeof fetch): typeof fetch {
  let owner = owners.get(candidate);
  while (owner && !owner.active) { candidate = owner.previous; owner = owners.get(candidate); }
  return candidate;
}
/** Story-owned HTTP replacement. Retired fixtures cannot return via a later cleanup. */
export function installStoryFetch(handler: StoryFetchHandler, host: Pick<Window, 'fetch'> = window): () => void {
  const owner = { previous: host.fetch, active: true };
  const forward: typeof fetch = (input, init) => activeFetch(owner.previous).call(host, input, init);
  const owned: typeof fetch = (input, init) => owner.active ? handler(input, init, forward) : forward(input, init);
  owners.set(owned, owner);
  host.fetch = owned;
  return () => {
    owner.active = false;
    if (host.fetch === owned) host.fetch = activeFetch(owner.previous);
  };
}

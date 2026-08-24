export type ClientMutationResult<T> =
  | { kind: "response"; value: T }
  | { kind: "network" };

/** Converts a rejected browser request into an explicit, settleable UI result. */
export async function runClientMutation<T>(request: () => Promise<T>): Promise<ClientMutationResult<T>> {
  try {
    return { kind: "response", value: await request() };
  } catch {
    return { kind: "network" };
  }
}

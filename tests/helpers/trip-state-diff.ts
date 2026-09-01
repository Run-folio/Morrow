import assert from "node:assert/strict";

type JsonObject = Record<string, unknown>;

const objectValue = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const segment = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");

/** Return explicit semantic paths instead of hiding broad changes in snapshots. */
export function changedTripPaths(before: unknown, after: unknown, path = ""): string[] {
  if (equal(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = [...before, ...after].every((item) => objectValue(item) && typeof item.id === "string");
    if (keyed) {
      const beforeRows = before as Array<JsonObject & { id: string }>;
      const afterRows = after as Array<JsonObject & { id: string }>;
      const changes = beforeRows.map((item) => item.id).join("|") === afterRows.map((item) => item.id).join("|")
        ? []
        : [`${path}/@order`];
      const beforeById = new Map(beforeRows.map((item) => [item.id, item]));
      const afterById = new Map(afterRows.map((item) => [item.id, item]));
      for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
        const rowPath = `${path}/[id=${segment(id)}]`;
        if (!beforeById.has(id) || !afterById.has(id)) changes.push(rowPath);
        else changes.push(...changedTripPaths(beforeById.get(id), afterById.get(id), rowPath));
      }
      return changes;
    }
    const changes: string[] = [];
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      changes.push(...changedTripPaths(before[index], after[index], `${path}/${index}`));
    }
    return changes;
  }
  if (objectValue(before) && objectValue(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .flatMap((key) => changedTripPaths(before[key], after[key], `${path}/${segment(key)}`));
  }
  return [path || "/"];
}

export function assertOnlyTripPathsChanged(before: unknown, after: unknown, allowed: string[]) {
  const changes = changedTripPaths(before, after);
  const unexpected = changes.filter((path) => !allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}[`)));
  assert.deepEqual(unexpected, [], `Unexpected canonical mutation paths:\n${unexpected.join("\n")}`);
  return changes;
}

import assert from "node:assert/strict";
import test from "node:test";
import { saveTripRecovery } from "../lib/easyt/storage.ts";
import { envelope } from "./helpers/durable-recovery-fixture.ts";

class SyntheticStorage {
  values = new Map<string, string>([["sentinel", "keep-exact-bytes"]]);
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

async function failedDriverDiagnostic(errorName: string) {
  const storage = new SyntheticStorage();
  const before = [...storage.values];
  const browser = Object.assign(new EventTarget(), {
    localStorage: storage,
    indexedDB: { open() { throw new DOMException("synthetic-only", errorName); } },
    location: { origin: "https://staging.morrovia.com", search: "" },
  });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFlag = process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
  const oldInfo = console.info;
  const packets: Record<string, unknown>[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = "1";
  console.info = (message: unknown) => {
    if (typeof message === "string" && message.startsWith("[morrovia-persistence-qa] ")) {
      packets.push(JSON.parse(message.slice("[morrovia-persistence-qa] ".length)));
    }
  };
  try {
    const trip = JSON.parse(envelope("diagnostic-only").rawRecovery).trip;
    const result = await saveTripRecovery(trip, { ownerId: null, isCurrent: () => true });
    return { packets, result, before, after: [...storage.values] };
  } finally {
    console.info = oldInfo;
    if (previousFlag === undefined) delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
    else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = previousFlag;
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("IndexedDB open diagnostics preserve only allowlisted reason and leave save result and storage unchanged", async () => {
  for (const [errorName, expectedReason] of [["SecurityError", "security"], ["VersionError", "schema"], ["QuotaExceededError", "quota"]]) {
    const probe = await failedDriverDiagnostic(errorName);
    const diagnostic = probe.packets.find(packet => packet.boundary === "recovery-driver-open");
    assert.equal(diagnostic?.driverFailure, expectedReason);
    assert.equal(diagnostic?.writeAttempted, false);
    assert.equal(probe.result.stored, false);
    assert.equal(probe.result.blockedByExistingRecovery, false);
    assert.equal(probe.result.failureReason, "unknown");
    assert.equal(probe.result.writeAttempted, false);
    assert.equal(probe.result.outcome, "unknown");
    assert.deepEqual(probe.after, probe.before);
    assert.doesNotMatch(JSON.stringify(probe.packets), /synthetic-only|diagnostic-only|ownerId|tripId|writeId/);
  }
});
